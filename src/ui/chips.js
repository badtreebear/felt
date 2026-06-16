import { callVerdict } from "../engine/ev.js";
import { finalPotAfterCall } from "../engine/potodds.js";
import { legalPostflopActions } from "../engine/postflop-action.js";
import { recommendHeroSize } from "../engine/bet-sizing.js";
import { isCoachConfigured, isCoachReachable } from "../coach/config.js";
import { formatAmount } from "./formatting.js";
import { createPopover } from "./popover.js";

const CHIP_CONFIG = [
  { id: "equity", label: "Equity" },
  { id: "potOdds", label: "Pot odds" },
  { id: "ev", label: "EV" },
];
const MATHS_POPOVER_CLOSE_DELAY_MS = 120;
let mathsPopoverCloseTimer = null;

export function createMathsChips(state, actions, { renderPopover = true } = {}) {
  if (!shouldShowMathsPanel(state)) {
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
  // always meaningful, so show it alone when the hero is not facing a bet.
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

  // Recommended size — one consistent button across bet/call/raise spots (bet when
  // first in, raise when facing a bet). The face shows the size as a % of the pot;
  // the bb/$ working and the advice are in the click popover.
  const sizing = heroSizingRecommendation(state);
  if (sizing && shouldShowSizeChip(sizing)) {
    const sizeButton = document.createElement("button");
    sizeButton.type = "button";
    sizeButton.className = "maths-chip maths-chip--size";
    sizeButton.setAttribute("aria-expanded", String(state.ui.openPopover === "size"));
    sizeButton.textContent = `SIZE ${sizeChipValue(sizing)}`;
    sizeButton.addEventListener("click", () => actions.setOpenPopover("size"));
    tray.append(sizeButton);
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

  if (id === "size") {
    return "Bet sizing";
  }

  return "EV";
}

function popoverBody(id, state, actions) {
  if (id === "size") {
    return sizingBody(state);
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

function shouldShowSizeChip(rec) {
  return rec.status === "pending" || rec.status === "ready";
}

function sizeChipValue(rec) {
  if (rec.status === "pending") {
    return "...";
  }

  return `${rec.fractionPct}%`;
}

function sizingBody(state) {
  const body = document.createElement("div");
  const rec = heroSizingRecommendation(state);

  if (!rec || rec.status === "pending") {
    body.append(paragraph("Working out a size - equity is still simulating."));
    return body;
  }

  const label = rec.mode === "raise" ? "Raise to" : "Bet";
  body.append(
    paragraph(`${label} ${formatAmount(rec.amount, state)}${rec.shove ? " (all in)" : ""} - about ${rec.fractionPct}% of the pot.`),
    paragraph(rec.rationale),
    paragraph("Guideline from your equity and the board texture - a sensible standard size, not a solved/EV-optimal one."),
  );
  return body;
}

function formatPercent(value, { blank = "--" } = {}) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return blank;
  }

  return `${Math.round(number * 100)}%`;
}
