import { callVerdict } from "../engine/ev.js";
import { finalPotAfterCall } from "../engine/potodds.js";
import { legalPostflopActions } from "../engine/postflop-action.js";
import { recommendHeroSize } from "../engine/bet-sizing.js";
import { getSeatPositions } from "../engine/positions.js";
import { getOpeningRange } from "../data/ranges/opening-ranges.js";
import { getRangeForSpot } from "../data/ranges/contextual-ranges.js";
import { canonicalHandKey } from "../engine/player-model.js";
import { recommendedAction } from "../tracker/preflop-leaks.js";
import { isCoachConfigured, isCoachReachable } from "../coach/config.js";
import { formatAmount } from "./formatting.js";
import { heroRangeVerdict } from "./range-grid.js";
import { createPopover } from "./popover.js";

const CHIP_CONFIG = [
  { id: "equity", label: "Equity" },
  { id: "potOdds", label: "Pot odds" },
  { id: "ev", label: "EV" },
];
const MATHS_POPOVER_CLOSE_DELAY_MS = 120;
let mathsPopoverCloseTimer = null;

export function createMathsChips(state, actions, { renderPopover = true } = {}) {
  // Render when the Maths layer is on (deterministic chips) OR whenever the hero
  // is to act (so the constant Bet tip button is always available).
  if (!shouldShowMathsPanel(state) && !heroIsToAct(state)) {
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

  // Pot odds and EV only make sense when there is a bet to call; equity is
  // always meaningful, so show it alone when the hero is not facing a bet. The
  // deterministic chips only render when the Maths layer is on.
  if (shouldShowMathsPanel(state)) {
    const facingBet = Number(state?.hand?.toCall) > 0;
    const chips = facingBet ? CHIP_CONFIG : CHIP_CONFIG.filter((chip) => chip.id === "equity");

    chips.forEach((chip) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `maths-chip maths-chip--${chip.id}`;
      button.classList.toggle("maths-chip--negative", chip.id === "ev" && Number(state.maths.evCall) < 0);
      button.classList.toggle("maths-chip--positive", chip.id === "ev" && Number(state.maths.evCall) >= 0);
      button.setAttribute("aria-expanded", String(state.ui.openPopover === chip.id));
      button.textContent = `${chip.label.toUpperCase()} ${chipValue(chip.id, state)}`;
      button.addEventListener("click", () => actions.setOpenPopover(chip.id));
      tray.append(button);
    });
  }

  // Bet tip — a constant button present in every hero-to-act spot (preflop and
  // postflop, regardless of the Maths toggle). Clicking it shows the engine's
  // recommendation and fires a coach AI overview for the spot.
  if (heroIsToAct(state)) {
    const tipButton = document.createElement("button");
    tipButton.type = "button";
    tipButton.className = "maths-chip maths-chip--tip";
    tipButton.setAttribute("aria-expanded", String(state.ui.openPopover === "betTip"));
    tipButton.textContent = "BET TIP";
    tipButton.addEventListener("click", () => actions.setOpenPopover("betTip"));
    tray.append(tipButton);
  }

  if (renderPopover && state.ui.openPopover) {
    tray.append(createPopover({
      id: "maths-popover",
      title: popoverTitle(state.ui.openPopover),
      onClose: () => actions.setOpenPopover(null),
      children: popoverBody(state.ui.openPopover, state, actions),
    }));
  }

  return tray;
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

  return "EV";
}

function popoverBody(id, state, actions) {
  if (id === "betTip") {
    return betTipBody(state, actions);
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

  if (!isCoachReachable(state.coach)) {
    wrapper.append(paragraph("Coach offline - trainer fully functional."));
    return wrapper;
  }

  const explain = state.coach.explain?.[id] || { status: "idle", content: "" };
  const button = document.createElement("button");
  button.type = "button";
  button.className = "coach-explain__button";
  button.disabled = explain.status === "loading";
  button.textContent = explain.status === "loading" ? "Coach thinking..." : "Ask coach";
  button.addEventListener("click", () => actions.requestCoachExplain(id));
  wrapper.append(button);

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
  const positions = getSeatPositions({
    players: state.config.players,
    buttonSeat: state.hand.buttonSeat,
  });
  const heroPosition = positions[state.config.heroSeat];

  if (heroPosition === "BB") {
    return null; // the BB never opens
  }

  const range = getOpeningRange({ players: state.config.players, position: heroPosition });

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
  const positions = getSeatPositions({
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
  });

  return {
    action: recommendedAction({ range, handKey }),
    spot: range.title || `${position} preflop`,
  };
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

  // Coach overview is a button (like the equity / pot-odds / EV popovers) rather
  // than auto-firing, so the player chooses when to spend a coach call.
  if (isCoachConfigured(state.coach.config)) {
    const coachWrap = document.createElement("div");
    coachWrap.className = "coach-explain";

    if (!isCoachReachable(state.coach)) {
      coachWrap.append(paragraph("Coach offline — the engine tip above still applies."));
    } else {
      const explain = state.coach.explain?.[betTipTopic(state)] || { status: "idle", content: "" };
      const button = document.createElement("button");
      button.type = "button";
      button.className = "coach-explain__button";
      button.disabled = explain.status === "loading";
      button.textContent = explain.status === "loading" ? "Coach thinking..." : "Ask coach";
      button.addEventListener("click", () => actions.requestBetTipCoach());
      coachWrap.append(button);

      if (explain.content) {
        const response = paragraph(explain.content);
        response.className = "coach-response";
        coachWrap.append(response);
      }
    }

    body.append(coachWrap);
  }

  return body;
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
