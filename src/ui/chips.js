import { callVerdict } from "../engine/ev.js";
import { finalPotAfterCall } from "../engine/potodds.js";
import { createPopover } from "./popover.js";

const CHIP_CONFIG = [
  { id: "equity", label: "Equity" },
  { id: "potOdds", label: "Pot odds" },
  { id: "ev", label: "EV" },
];

export function createMathsChips(state, actions) {
  if (state.hand.toCall <= 0) {
    return null;
  }

  const tray = document.createElement("div");
  tray.className = "maths-chip-tray";
  tray.setAttribute("aria-label", "Maths layer");

  CHIP_CONFIG.forEach((chip) => {
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

  if (state.ui.openPopover) {
    tray.append(createPopover({
      id: "maths-popover",
      title: popoverTitle(state.ui.openPopover),
      onClose: () => actions.setOpenPopover(null),
      children: popoverBody(state.ui.openPopover, state),
    }));
  }

  return tray;
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
    return formatBb(state.maths.evCall, { signed: true });
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

  return "EV";
}

function popoverBody(id, state) {
  if (id === "equity") {
    return equityBody(state);
  }

  if (id === "potOdds") {
    return potOddsBody(state);
  }

  return evBody(state);
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
    paragraph(`${formatBb(call)} / (${formatBb(pot)} + ${formatBb(call)} + ${formatBb(call)}) = ${formatPercent(state.maths.requiredEquity)}.`),
  );

  if (finalPot > 0) {
    body.append(paragraph(`A call contests a final pot of ${formatBb(finalPot)}.`));
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
    paragraph(`${formatPercent(equity)} * ${formatBb(finalPotAfterCall(pot, call))} - ${formatBb(call)} = ${formatBb(state.maths.evCall, { signed: true })}.`),
    paragraph(`Current engine verdict: ${verdict}.`),
  );

  return body;
}

function paragraph(text) {
  const element = document.createElement("p");
  element.textContent = text;
  return element;
}

function formatPercent(value, { blank = "--" } = {}) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return blank;
  }

  return `${Math.round(number * 100)}%`;
}

function formatBb(value, { signed = false } = {}) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  const sign = signed && number > 0 ? "+" : "";
  return `${sign}${number.toFixed(1).replace(/\.0$/, "")} BB`;
}
