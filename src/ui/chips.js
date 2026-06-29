import { callVerdict } from "../engine/ev.js";
import { finalPotAfterCall, breakevenFoldFraction, valueBluffRatio } from "../engine/potodds.js";
import { legalPostflopActions } from "../engine/postflop-action.js";
import { recommendHeroSize } from "../engine/bet-sizing.js";
import { heroOuts } from "../engine/outs.js";
import { getSeatPositions } from "../engine/positions.js";
import { villainRangeGridsForSpot } from "../engine/postflop-ev.js";
import { boardThreats } from "../engine/board-threats.js";
import { getOpeningRange } from "../data/ranges/opening-ranges.js";
import { getRangeForSpot } from "../data/ranges/contextual-ranges.js";
import { canonicalHandKey } from "../engine/player-model.js";
import { recommendedAction } from "../tracker/preflop-leaks.js";
import { isCoachConfigured } from "../coach/config.js";
import { coachAskButton, coachOfflineNote } from "./coach-explain-control.js";
import { formatAmount } from "./formatting.js";
import { heroRangeVerdict, createMiniRangeGrid } from "./range-grid.js";
import { createPopover } from "./popover.js";

const CHIP_CONFIG = [
  { id: "equity", label: "Equity" },
  { id: "potOdds", label: "Pot odds" },
  { id: "ev", label: "EV" },
];
const MATHS_POPOVER_CLOSE_DELAY_MS = 120;
let mathsPopoverCloseTimer = null;

export function createMathsChips(state, actions, { renderPopover = true } = {}) {
  // The Bet tip / What-beats-you / Villains slots are always present (reserved)
  // so the row doesn't appear and disappear between hands — they're disabled when
  // it isn't the hero's turn. The deterministic maths chips still gate on the
  // Maths toggle.
  if (!state?.hand) {
    return null;
  }

  const tray = document.createElement("div");
  tray.className = "maths-chip-tray";
  tray.setAttribute("aria-label", "Maths layer");
  tray.addEventListener("mouseenter", cancelMathsPopoverClose);
  tray.addEventListener("mouseleave", () => scheduleMathsPopoverClose(actions));
  tray.addEventListener("focusin", cancelMathsPopoverClose);
  tray.addEventListener("focusout", (event) => {
    if (!tray.contains(event.relatedTarget)) {
      scheduleMathsPopoverClose(actions);
    }
  });

  // When the Maths layer is on we render all three chips every time and reserve
  // their space — Pot odds and EV only mean something facing a bet, so off a bet
  // they show as muted, disabled placeholders rather than disappearing (which is
  // what made the row jump).
  if (shouldShowMathsPanel(state)) {
    const facingBet = Number(state?.hand?.toCall) > 0;

    CHIP_CONFIG.forEach((chip) => {
      const active = chip.id === "equity" || facingBet;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `maths-chip maths-chip--${chip.id}`;
      button.classList.toggle("maths-chip--placeholder", !active);
      button.disabled = !active;
      button.classList.toggle("maths-chip--negative", active && chip.id === "ev" && Number(state.maths.evCall) < 0);
      button.classList.toggle("maths-chip--positive", active && chip.id === "ev" && Number(state.maths.evCall) >= 0);
      button.setAttribute("aria-expanded", String(state.ui.openPopover === chip.id));
      button.textContent = active ? `${chip.label.toUpperCase()} ${chipValue(chip.id, state)}` : `${chip.label.toUpperCase()} —`;
      if (active) {
        button.addEventListener("click", () => actions.setOpenPopover(chip.id));
      }
      tray.append(button);
    });
  }

  // Bet tip — its slot is always reserved so the row doesn't jump between hands;
  // enabled only when the hero is to act.
  const canAct = heroIsToAct(state);
  const tipButton = document.createElement("button");
  tipButton.type = "button";
  tipButton.className = "maths-chip maths-chip--tip";
  tipButton.classList.toggle("maths-chip--placeholder", !canAct);
  tipButton.disabled = !canAct;
  tipButton.setAttribute("aria-expanded", String(state.ui.openPopover === "betTip"));
  tipButton.textContent = "BET TIP";
  if (canAct) {
    tipButton.addEventListener("click", () => actions.setOpenPopover("betTip"));
  }
  tray.append(tipButton);

  // Relative-strength reference surfaces (Phase 15). Their slots are always
  // reserved so the row doesn't jump as the hand develops or between hands —
  // disabled (muted) until they're live: postflop, on the hero's turn.
  appendPopoverChip(tray, {
    id: "beatsYou",
    label: "WHAT BEATS YOU",
    state,
    actions,
    enabled: canAct && Boolean(relativeStrength(state)),
  });
  appendPopoverChip(tray, {
    id: "villains",
    label: "VILLAINS RANGE",
    state,
    actions,
    enabled: canAct && villainRangeGridsForSpot(state?.hand?.postflop).length > 0,
  });

  if (renderPopover && state.ui.openPopover) {
    const popover = createPopover({
      id: "maths-popover",
      title: popoverTitle(state.ui.openPopover),
      onClose: () => actions.setOpenPopover(null),
      children: popoverBody(state.ui.openPopover, state, actions),
    });
    tray.append(popover);
    // Keep it on screen: the chips can sit high in a scrolling panel, so a tall
    // popover (bet tip / villain grids) would otherwise run off the top. Place it
    // as a viewport-fixed box on whichever side has more room, clamped to fit.
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => positionPopover(popover, tray));
    }
  }

  return tray;
}

function positionPopover(popover, anchor) {
  if (!popover || !anchor || typeof popover.getBoundingClientRect !== "function") {
    return;
  }
  if (popover.isConnected === false) {
    return;
  }

  const a = anchor.getBoundingClientRect();
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  const margin = 8;

  // No layout (e.g. jsdom in tests) — leave the CSS defaults alone.
  if (!vw || !vh) {
    return;
  }

  popover.style.position = "fixed";
  const width = popover.getBoundingClientRect().width || 320;
  popover.style.left = `${Math.max(margin, Math.min(a.left, vw - width - margin))}px`;
  popover.style.right = "auto";

  const spaceAbove = a.top - margin * 2;
  const spaceBelow = vh - a.bottom - margin * 2;
  const openDown = spaceBelow >= spaceAbove;
  const avail = Math.max(140, openDown ? spaceBelow : spaceAbove);

  if (openDown) {
    popover.style.top = `${a.bottom + margin}px`;
    popover.style.bottom = "auto";
  } else {
    popover.style.top = "auto";
    popover.style.bottom = `${vh - a.top + margin}px`;
  }
  popover.style.maxHeight = `${avail}px`;

  // Cap the BODY directly and force it to scroll, rather than relying on flex
  // sizing — that's what was letting tall content overflow so the page scrolled
  // behind the fixed box instead of the box scrolling.
  const header = popover.querySelector(".popover__header");
  const body = popover.querySelector(".popover__body");
  if (body) {
    const headerH = header ? header.offsetHeight : 0;
    body.style.maxHeight = `${Math.max(80, avail - headerH)}px`;
    body.style.overflowY = "auto";
  }
}

function cancelMathsPopoverClose() {
  if (mathsPopoverCloseTimer) {
    clearTimeout(mathsPopoverCloseTimer);
    mathsPopoverCloseTimer = null;
  }
}

function scheduleMathsPopoverClose(actions) {
  cancelMathsPopoverClose();
  mathsPopoverCloseTimer = setTimeout(() => {
    mathsPopoverCloseTimer = null;

    if (!document.querySelector(".maths-chip-tray:hover")) {
      actions.setOpenPopover(null);
    }
  }, MATHS_POPOVER_CLOSE_DELAY_MS);
}

export function shouldShowMathsPanel(state) {
  // The explicit Maths toggle reveals the layer in any spot (equity is always
  // meaningful). Manual spot mode keeps showing it whenever a bet is faced.
  if (state?.ui?.showMaths) {
    return true;
  }

  return state?.ui?.spotMode === "manual" && Number(state?.hand?.toCall) > 0;
}

function chipValue(id, state) {
  if (id === "equity") {
    if (state.maths.simStatus === "running" && state.maths.heroEquity === null) {
      return "...";
    }

    return formatPercent(state.maths.heroEquity);
  }

  if (id === "potOdds") {
    return formatPercent(state.maths.requiredEquity);
  }

  if (id === "ev") {
    return formatAmount(state.maths.evCall, state, { signed: true });
  }

  return "";
}

function popoverTitle(id) {
  if (id === "equity") {
    return "Equity";
  }

  if (id === "potOdds") {
    return "Pot odds";
  }

  if (id === "betTip") {
    return "Bet tip";
  }

  if (id === "beatsYou") {
    return "What beats you";
  }

  if (id === "villains") {
    return "Villain range";
  }

  return "EV";
}

function popoverBody(id, state, actions) {
  if (id === "betTip") {
    return betTipBody(state, actions);
  }

  if (id === "beatsYou") {
    return whatBeatsYouSection(state) || emptyPopoverNote("No board yet — nothing to read.");
  }

  if (id === "villains") {
    return villainRangesBody(state) || emptyPopoverNote("No villains to read in this spot.");
  }

  const body = deterministicBody(id, state);
  const coach = coachExplainBody(id, state, actions);

  if (coach) {
    body.append(coach);
  }

  return body;
}

function deterministicBody(id, state) {
  if (id === "equity") {
    return equityBody(state);
  }

  if (id === "potOdds") {
    return potOddsBody(state);
  }

  return evBody(state);
}

function coachExplainBody(id, state, actions) {
  if (!isCoachConfigured(state.coach.config)) {
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "coach-explain";

  wrapper.append(coachAskButton({
    state,
    actions,
    topic: id,
    idleLabel: "Ask coach",
    onAsk: () => actions.requestCoachExplain(id),
  }));

  const note = coachOfflineNote(state);
  if (note) {
    wrapper.append(note);
  }

  const explain = state.coach.explain?.[id] || { status: "idle", content: "" };
  if (explain.content) {
    const response = paragraph(explain.content);
    response.className = "coach-response";
    wrapper.append(response);
  }

  return wrapper;
}

function equityBody(state) {
  const body = document.createElement("div");
  const status = state.maths.simStatus === "running" ? "Simulating" : "Current estimate";
  const exact = state.maths.exact ? "exact" : `+/- ${formatPercent(state.maths.equityCI, { blank: "0%" })}`;
  const opponents = state.maths.opponentCount === 1 ? "1 random hand" : `${state.maths.opponentCount} random hands`;

  body.append(
    definition("Equity = your share of the pot at showdown — how often this hand wins or chops if it ran out now."),
    paragraph(`${status}: ${formatPercent(state.maths.heroEquity)} vs ${opponents}.`),
    paragraph(`${state.maths.iterations || 0} runouts checked, ${exact}. Ties: ${formatPercent(state.maths.tieRate)}.`),
  );

  return body;
}

function potOddsBody(state) {
  const body = document.createElement("div");
  const pot = Number(state.hand.pot) || 0;
  const call = Number(state.hand.toCall) || 0;
  const finalPot = finalPotAfterCall(pot, call);

  body.append(
    definition("Pot odds = the equity you need to call profitably — your call as a share of the final pot."),
    paragraph(`Required equity = call / (pot + bet + call).`),
    paragraph(`${formatAmount(call, state)} / (${formatAmount(pot, state)} + ${formatAmount(call, state)} + ${formatAmount(call, state)}) = ${formatPercent(state.maths.requiredEquity)}.`),
  );

  if (finalPot > 0) {
    body.append(paragraph(`A call contests a final pot of ${formatAmount(finalPot, state)}.`));
  }

  return body;
}

function evBody(state) {
  const body = document.createElement("div");
  const pot = Number(state.hand.pot) || 0;
  const call = Number(state.hand.toCall) || 0;
  const equity = Number(state.maths.heroEquity) || 0;
  const verdict = callVerdict({ equity, pot, toCall: call });

  body.append(
    definition("EV = expected value: the average chips a decision wins or loses over the long run. Positive is profitable."),
    paragraph(`EV(call) = equity * final pot - call.`),
    paragraph(`${formatPercent(equity)} * ${formatAmount(finalPotAfterCall(pot, call), state)} - ${formatAmount(call, state)} = ${formatAmount(state.maths.evCall, state, { signed: true })}.`),
    paragraph(`Current engine verdict: ${verdict}.`),
  );

  return body;
}

function paragraph(text) {
  const element = document.createElement("p");
  element.textContent = text;
  return element;
}

// A one-line, muted "what this stat means" header for the maths popovers.
function definition(text) {
  const element = paragraph(text);
  element.className = "popover__def";
  return element;
}

function heroSizingRecommendation(state) {
  const postflop = state?.hand?.postflop;

  if (!postflop || postflop.status !== "waitingHero") {
    return null;
  }

  const legal = legalPostflopActions(postflop);

  if (!legal.canAct || (!legal.canBet && !legal.canRaise)) {
    return null;
  }

  const facingBet = Boolean(legal.facingBet && legal.canRaise);

  return recommendHeroSize({
    facingBet,
    pot: Number(state.hand.pot) || 0,
    stack: Number(legal.maxBet) || 0,
    equity: state.maths.heroEquity,
    toCall: Number(legal.callAmount) || 0,
    board: state.hand.board || [],
    minAmount: facingBet ? legal.minRaiseTo : Math.min(legal.minBet, legal.maxBet),
    maxAmount: facingBet ? legal.maxRaiseTo : legal.maxBet,
  });
}

// The hero is on the clock whenever a preflop or postflop phase is waiting on a
// hero decision. The Bet tip button shows in exactly these spots.
export function heroIsToAct(state) {
  return state?.hand?.postflop?.status === "waitingHero"
    || state?.hand?.preflop?.status === "waitingHero";
}

// Stable per-spot key so the auto coach overview is cached within a spot but
// refreshes as the action advances (same shape used for other coach topics).
export function betTipTopic(state) {
  const hand = state?.hand || {};
  const board = (hand.board || []).join("");
  const acted = (hand.actionLog || []).length;
  return `betTip:${hand.seed || "x"}:${hand.street || ""}:${board}:${hand.pot || 0}:${hand.toCall || 0}:${acted}`;
}

// The engine's recommendation for the current spot: postflop sizing/advice when
// available, otherwise the preflop opening verdict, plus the deterministic
// equity / pot-odds / EV / verdict numbers when they exist.
function heroEngineTip(state) {
  const maths = state?.maths || {};
  const facingBet = Number(state?.hand?.toCall) > 0;
  const numbers = [];

  if (Number.isFinite(Number(maths.heroEquity))) {
    numbers.push(`equity ${formatPercent(maths.heroEquity)}`);
  }
  if (facingBet && Number.isFinite(Number(maths.requiredEquity))) {
    numbers.push(`pot odds ${formatPercent(maths.requiredEquity)}`);
  }
  if (maths.evCall !== null && maths.evCall !== undefined) {
    numbers.push(`EV(call) ${formatAmount(maths.evCall, state, { signed: true })}`);
  }

  let action = null;
  let detail = null;

  if (state?.hand?.postflop?.status === "waitingHero") {
    const rec = heroSizingRecommendation(state);

    if (rec?.status === "ready") {
      if (rec.advice === "value" || rec.advice === "thin") {
        const verb = rec.mode === "raise" ? "Raise" : "Bet";
        action = `${verb} ~${rec.fractionPct}% of the pot (${formatAmount(rec.amount, state)}${rec.shove ? ", all in" : ""}).`;
      } else if (rec.advice === "callFold") {
        action = "Call or fold — this is not a raising spot.";
      } else if (rec.advice === "check") {
        action = "Check — too thin to bet for value.";
      }
      detail = rec.rationale;
    } else if (rec?.status === "pending") {
      action = "Working out a size — equity is still simulating.";
    }
  } else if (state?.hand?.preflop?.status === "waitingHero" && state?.hand?.street === "preflop") {
    // Use the chart for the ACTUAL spot (open / defend-vs-raise / vs-3-bet) —
    // the same authority the tracker grades on — not just the RFI opening range.
    const chart = preflopChartRecommendation(state);

    if (chart.action === "raise") {
      action = "Raise (open) — this hand is in your opening range.";
    } else if (chart.action === "threeBet") {
      action = "Raise (3-bet) — this hand 3-bets in this spot.";
    } else if (chart.action === "fourBet") {
      action = "Raise (4-bet) — this hand 4-bets in this spot.";
    } else if (chart.action === "call") {
      action = "Call — this hand defends in this spot.";
    } else if (chart.action === "fold") {
      action = `Fold — this hand is outside your range ${chart.spot ? `(${chart.spot})` : "for this spot"}.`;
    } else {
      // No chart for this spot (e.g. multiway / unsupported) — fall back to the
      // RFI read when first in; otherwise leave it to the pot-odds verdict below.
      const verdict = preflopOpenVerdict(state);

      if (verdict === "raise") {
        action = "Raise (open) — this hand is in your RFI range.";
      } else if (verdict === "fold") {
        action = "Fold — this hand is outside your RFI range.";
      } else if (verdict === "mixed") {
        action = "Borderline — a mixed open/fold hand.";
      }
    }

    // Pot odds are the immediate price only. When the chart says fold but the
    // raw price says call, name the gap instead of implying a call is fine.
    if (facingBet && maths.verdict) {
      if (chart.action === "fold" && maths.verdict === "call") {
        detail = "The raw pot odds clear the bar, but out of position this hand realizes little of that equity and is easily dominated — so the disciplined play is to fold.";
      } else {
        detail = `By the immediate pot odds, calling is ${maths.verdict}.`;
      }
    }
  }

  if (!action && maths.verdict) {
    action = `Engine verdict: calling is ${maths.verdict}.`;
  }

  return { action, detail, numbers };
}

// Plain-text form of the engine tip, fed to the coach so its overview agrees
// with the engine instead of recomputing.
export function engineTipText(state) {
  const tip = heroEngineTip(state);
  const parts = [];

  if (tip.action) {
    parts.push(tip.action);
  }
  if (tip.detail) {
    parts.push(tip.detail);
  }
  if (tip.numbers.length) {
    parts.push(tip.numbers.join(", "));
  }

  return parts.join(" ") || "No engine recommendation is available for this spot yet.";
}

function preflopOpenVerdict(state) {
  const positions = state.hand.preflop?.positions || getSeatPositions({
    players: state.config.players,
    buttonSeat: state.hand.buttonSeat,
  });
  const heroPosition = positions[state.config.heroSeat];

  if (heroPosition === "BB") {
    return null; // the BB never opens
  }

  const range = getOpeningRange({
    players: state.config.players,
    position: heroPosition,
    effBb: state.hand.preflop?.effectiveStackBb,
  });

  if (!range.chartAvailable || range.isPlaceholder) {
    return null;
  }

  const heroCards = state.hand.holeCards[state.config.heroSeat] || [];
  const verdict = heroRangeVerdict(heroCards, range.grid);

  if (verdict.status === "not in range") {
    return "fold";
  }
  if (verdict.status === "mixed") {
    return "mixed";
  }
  return "raise";
}

// The chart-driven recommendation for the hero's CURRENT preflop spot — open,
// defend-vs-raise, or vs-3-bet — using the same lookup + mapping the tracker
// grades on, so the bet tip and the leak grader never disagree. Returns an
// action of "raise" | "threeBet" | "fourBet" | "call" | "fold" | "unknown".
function preflopChartRecommendation(state) {
  const positions = state.hand.preflop?.positions || getSeatPositions({
    players: state.config.players,
    buttonSeat: state.hand.buttonSeat,
  });
  const heroSeat = state.config.heroSeat;
  const position = positions[heroSeat];
  const handKey = canonicalHandKey(state.hand.holeCards?.[heroSeat] || []);
  const range = getRangeForSpot({
    players: state.config.players,
    seat: heroSeat,
    position,
    hand: state.hand,
    effBb: state.hand.preflop?.effectiveStackBb,
  });

  return {
    action: recommendedAction({ range, handKey }),
    spot: range.title || `${position} preflop`,
  };
}

const OUT_RANK_ORDER = "23456789TJQKA";
const OUT_SUIT_ORDER = "shdc";

function sortOutCards(cards) {
  return [...cards].sort((a, b) => {
    const rankDelta = OUT_RANK_ORDER.indexOf(b.slice(0, -1)) - OUT_RANK_ORDER.indexOf(a.slice(0, -1));
    if (rankDelta !== 0) {
      return rankDelta; // high rank first
    }
    return OUT_SUIT_ORDER.indexOf(a.slice(-1)) - OUT_SUIT_ORDER.indexOf(b.slice(-1));
  });
}

// Hero-only outs + rule of 2 & 4, shown on the flop/turn. "Improve" probability,
// not win equity — the equity number above is the accurate win read.
function heroOutsSection(state) {
  const heroCards = state.hand.holeCards?.[state.config.heroSeat] || [];
  const board = state.hand.board || [];
  const { outs, cardsToCome, improvePct, cards } = heroOuts({ holeCards: heroCards, board });

  if (cardsToCome === 0) {
    return null; // preflop or river — nothing to draw to
  }

  const wrap = document.createElement("div");
  wrap.className = "bet-tip__section";

  const rule = cardsToCome === 2 ? "rule of 4" : "rule of 2";
  const when = cardsToCome === 2 ? "by the river" : "on the river";

  wrap.append(sectionLabel(`Your outs - ${rule}`));

  if (outs <= 0) {
    wrap.append(paragraph("No clean improving cards — you're either drawing thin or already made."));
    return wrap;
  }

  // The out cards themselves, displayed as plain text with suit symbols
  const sortedCards = sortOutCards(cards);
  const cardsLine = document.createElement("p");
  cardsLine.className = "bet-tip__cards";

  sortedCards.forEach((card, index) => {
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    const displayRank = rank === "T" ? "10" : rank;
    const suitSymbol = { s: "♠", h: "♥", d: "♦", c: "♣" }[suit];

    const cardSpan = document.createElement("span");
    cardSpan.className = `card-symbol card-symbol--${suit}`;
    cardSpan.textContent = displayRank + suitSymbol;
    cardsLine.append(cardSpan);

    if (index < sortedCards.length - 1) {
      cardsLine.append(" ");
    }
  });

  wrap.append(cardsLine);

  // Stats line: just the outs count and improve percentage, no rule mention
  const statsLine = paragraph(`${outs} out${outs === 1 ? "" : "s"} → ~${improvePct}% to improve ${when}.\n\nCounts cards that better your own hand only — a quick estimate that can overcount when an out also helps a villain. The equity above is the accurate win %.`);
  statsLine.className = "bet-tip__stats";
  wrap.append(statsLine);

  return wrap;
}

function betTipBody(state, actions) {
  const body = document.createElement("div");
  body.className = "bet-tip";

  const tip = heroEngineTip(state);

  const engineWrap = document.createElement("div");
  engineWrap.className = "bet-tip__section";
  engineWrap.append(sectionLabel("What the engine thinks"));
  engineWrap.append(paragraph(tip.action || "No engine recommendation for this spot yet."));
  if (tip.detail) {
    engineWrap.append(paragraph(tip.detail));
  }
  if (tip.numbers.length) {
    const nums = paragraph(tip.numbers.join("   ·   "));
    nums.className = "bet-tip__numbers";
    engineWrap.append(nums);
  }
  body.append(engineWrap);

  const outsSection = heroOutsSection(state);
  if (outsSection) {
    body.append(outsSection);
  }

  // Phase 15 — overbet guard: if the intended size is too big for your relative
  // strength, say so right under the recommendation.
  const overbet = overbetWarningSection(state);
  if (overbet) {
    body.append(overbet);
  }

  // Phase 12 — make the engine's thinking visible: the fold equity / balance
  // behind a bet, and the villain ranges behind the equity number.
  const bluffMath = bluffMathSection(state);
  if (bluffMath) {
    body.append(bluffMath);
  }

  // Coach overview is a button (like the equity / pot-odds / EV popovers) rather
  // than auto-firing, so the player chooses when to spend a coach call.
  if (isCoachConfigured(state.coach.config)) {
    const coachWrap = document.createElement("div");
    coachWrap.className = "coach-explain";

    const topic = betTipTopic(state);
    coachWrap.append(coachAskButton({
      state,
      actions,
      topic,
      idleLabel: "Ask coach",
      onAsk: () => actions.requestBetTipCoach(),
    }));

    const note = coachOfflineNote(state);
    if (note) {
      coachWrap.append(note);
    }

    const explain = state.coach.explain?.[topic];
    if (explain?.content) {
      const response = paragraph(explain.content);
      response.className = "coach-response";
      coachWrap.append(response);
    }

    body.append(coachWrap);
  }

  return body;
}

// Fold equity + value:bluff balance for the engine's recommended bet. Shown only
// when betting into the pot (mode "bet") — raises facing a bet make the one-shot
// fold-equity read misleading, so we stay quiet there.
function bluffMathSection(state) {
  const postflop = state?.hand?.postflop;

  if (!postflop || postflop.status !== "waitingHero") {
    return null;
  }

  const rec = heroSizingRecommendation(state);

  if (!rec || rec.status !== "ready" || rec.mode !== "bet") {
    return null;
  }

  const pot = Number(state.hand.pot) || 0;
  const bet = Number(rec.amount) || 0;

  if (pot <= 0 || bet <= 0) {
    return null;
  }

  const foldPct = breakevenFoldFraction({ pot, bet });
  const balance = valueBluffRatio({ pot, bet });

  const wrap = document.createElement("div");
  wrap.className = "bet-tip__section";
  wrap.append(sectionLabel("Bluffing math"));
  wrap.append(paragraph(
    `At ~${rec.fractionPct}% pot (${formatAmount(bet, state)}), a bluff needs them to fold about ${formatPercent(foldPct)} of the time to break even.`,
  ));
  if (balance) {
    wrap.append(paragraph(
      `A balanced betting range at this size is about ${formatRatio(balance.ratio)} value:bluff (${formatPercent(balance.bluffFraction)} bluffs).`,
    ));
  }

  const note = paragraph("River heuristic — fold equity for this one bet, not a multi-street solve.");
  note.className = "bet-tip__numbers";
  wrap.append(note);

  return wrap;
}

// Each live villain's assumed range — the position+profile ranges the engine
// samples to produce your equity. Its own popover now (split out of the Bet tip),
// so it renders the grids directly rather than as a collapsible section.
function villainRangesBody(state) {
  const postflop = state?.hand?.postflop;

  if (!postflop || postflop.status !== "waitingHero") {
    return null;
  }

  const villains = villainRangeGridsForSpot(postflop);

  if (!villains.length) {
    return null;
  }

  const wrap = document.createElement("div");
  wrap.className = "bet-tip__section";

  const intro = paragraph("The engine's assumed range behind your equity — by position and player type.");
  intro.className = "bet-tip__numbers";
  wrap.append(intro);

  villains.forEach((villain) => {
    const where = villain.position || `Seat ${villain.seat + 1}`;
    wrap.append(createMiniRangeGrid({
      grid: villain.grid,
      label: `${where} · ${villain.profile}`,
    }));
  });

  return wrap;
}

function emptyPopoverNote(text) {
  const body = document.createElement("div");
  body.append(paragraph(text));
  return body;
}

function appendPopoverChip(tray, { id, label, state, actions, enabled = true }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `maths-chip maths-chip--${id}`;
  button.classList.toggle("maths-chip--placeholder", !enabled);
  button.disabled = !enabled;
  button.setAttribute("aria-expanded", String(state.ui.openPopover === id));
  button.textContent = label;
  if (enabled) {
    button.addEventListener("click", () => actions.setOpenPopover(id));
  }
  tray.append(button);
}

// Relative hand strength for the current postflop spot: the hero's equity vs the
// range the engine already puts the villains on (state.maths.heroEquity), plus
// the board-threat list and which threats currently beat the hero. Pure read of
// existing state — no new simulation. Exported for the in-game strip (slice 15.5).
export function relativeStrength(state) {
  const postflop = state?.hand?.postflop;

  if (!postflop || postflop.status !== "waitingHero") {
    return null;
  }

  const board = state?.hand?.board || [];

  if (board.length < 3) {
    return null;
  }

  const heroCards = state?.hand?.holeCards?.[state?.config?.heroSeat] || [];
  const { threats, hero, wetness } = boardThreats(board, heroCards);
  const rawEquity = state?.maths?.heroEquity;
  const equityValue = Number(rawEquity);
  const hasEquity = rawEquity !== null && rawEquity !== undefined && Number.isFinite(equityValue);

  return {
    equity: hasEquity ? equityValue : null,
    threats,
    beats: threats.filter((threat) => threat.beatsHero === true),
    draws: threats.filter((threat) => threat.draw === true),
    hero,
    wetness,
  };
}

// Overbet guard (slice 15.3). Catches you in the act: flags when your intended
// bet/raise is meaningfully bigger than the spot wants AND your relative strength
// is low (you're not ahead of their range) — the reactive pot-control nudge the
// passive sizing tip never makes. A big bet with a strong hand is NOT flagged.
const OVERBET_FACTOR = 1.25; // intended must exceed recommended by this much
const OVERBET_LOW_EQUITY = 0.6; // "not crushing their range" — value bets sit above this

function clampSize(value, lo, hi) {
  const v = Number(value) || 0;
  const low = Number(lo) || 0;
  const high = Number(hi) || 0;
  if (high <= 0) {
    return Math.max(low, v);
  }
  return Math.max(low, Math.min(high, v));
}

export function overbetVerdict(state) {
  const postflop = state?.hand?.postflop;

  if (!postflop || postflop.status !== "waitingHero") {
    return null;
  }

  const legal = legalPostflopActions(postflop);

  if (!legal.canAct || (!legal.canBet && !legal.canRaise)) {
    return null;
  }

  const rec = heroSizingRecommendation(state);

  if (!rec || rec.status !== "ready") {
    return null;
  }

  const facingBet = Boolean(legal.facingBet && legal.canRaise);
  const intended = facingBet
    ? clampSize(state?.ui?.heroRaiseTo || legal.minRaiseTo, legal.minRaiseTo, legal.maxRaiseTo)
    : clampSize(
      state?.ui?.heroRaiseTo || postflop.suggestedHeroBet || legal.minBet,
      Math.min(legal.minBet, legal.maxBet),
      legal.maxBet,
    );

  const recommended = Number(rec.amount) || 0;
  const equity = Number(state?.maths?.heroEquity);

  if (recommended <= 0 || !Number.isFinite(equity)) {
    return null;
  }

  const tooBig = intended >= recommended * OVERBET_FACTOR;
  const weak = equity < OVERBET_LOW_EQUITY;

  if (!tooBig || !weak) {
    return null;
  }

  const rel = relativeStrength(state);
  const beats = rel?.beats?.map((threat) => threat.label.toLowerCase()) || [];
  const beatsClause = beats.length ? ` — e.g. ${beats.join(", ")}` : "";
  const verb = facingBet ? "raise to" : "bet";

  return {
    flag: true,
    intended,
    recommended,
    equity,
    reason: `You're about to ${verb} ${formatAmount(intended, state)}, but the spot wants around ${formatAmount(recommended, state)} (~${rec.fractionPct}% pot). With only ~${formatPercent(equity)} equity against their range, a bet this big is mostly called by hands that beat you${beatsClause}. Consider pot control.`,
  };
}

function overbetWarningSection(state) {
  const verdict = overbetVerdict(state);

  if (!verdict) {
    return null;
  }

  const wrap = document.createElement("div");
  wrap.className = "bet-tip__section bet-tip__warning";
  wrap.append(sectionLabel("Overbet check"));
  wrap.append(paragraph(verdict.reason));
  return wrap;
}

// "What beats you" — the relative-strength readout in the Bet tip, sitting next
// to the villain-range grid (Phase 12). Quiet preflop / when there's no board.
function whatBeatsYouSection(state) {
  const rel = relativeStrength(state);

  if (!rel) {
    return null;
  }

  const wrap = document.createElement("div");
  wrap.className = "bet-tip__section";
  wrap.append(sectionLabel("What beats you"));

  if (rel.equity !== null) {
    const handName = rel.hero ? rel.hero.name.toLowerCase() : "your hand";
    wrap.append(paragraph(
      `You have ${handName}. Your equity against the range the engine puts them on is about ${formatPercent(rel.equity)} — that relative strength is what matters here, not your hand's rank.`,
    ));
  }

  if (rel.beats.length) {
    const list = rel.beats.map((threat) => threat.label.toLowerCase()).join(", ");
    wrap.append(paragraph(`Made hands the board already allows that beat you: ${list}.`));
  } else if (rel.hero) {
    wrap.append(paragraph("No standard made hand the board allows beats you right now."));
  }

  if (rel.draws.length) {
    const list = rel.draws.map((threat) => threat.label.toLowerCase()).join(", ");
    const note = paragraph(`Draws that can get there: ${list}.`);
    note.className = "bet-tip__numbers";
    wrap.append(note);
  }

  return wrap;
}

function formatRatio(ratio) {
  const value = Number(ratio);

  if (!Number.isFinite(value) || value <= 0) {
    return "--";
  }

  return `${value.toFixed(1)}:1`;
}

function sectionLabel(text) {
  const label = document.createElement("p");
  label.className = "bet-tip__label";
  label.textContent = text;
  return label;
}

function formatPercent(value, { blank = "--" } = {}) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return blank;
  }

  return `${Math.round(number * 100)}%`;
}
