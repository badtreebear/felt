import { canonicalHandKey } from "../engine/player-model.js";

export function scorePostflopEvDecision({ postflop, action, evaluation } = {}) {
  const toCall = Number(evaluation?.toCall ?? postflop?.heroToCall) || 0;

  if (!postflop || postflop.status !== "waitingHero" || toCall <= 0 || !evaluation) {
    return null;
  }

  if (action !== "call" && action !== "fold") {
    return null;
  }

  const ev = Number(evaluation.evCall);
  const leak = (action === "call" && ev < 0) || (action === "fold" && ev > 0);
  const recommended = ev > 0 ? "call" : "fold";
  const costBb = leak ? roundCost(Math.abs(ev)) : 0;

  return {
    street: postflop.street,
    spot: postflopSpotLabel(postflop, toCall),
    hand: canonicalHandKey(postflop.holeCards?.[postflop.heroSeat]) || "",
    heroAction: action,
    recommended,
    leak,
    leakType: leak ? (action === "call" ? "called -EV (paid off)" : "folded +EV") : "",
    equity: roundMetric(evaluation.equity),
    requiredEquity: roundMetric(evaluation.requiredEquity),
    evCall: roundMetric(ev),
    verdict: evaluation.verdict || recommended,
    costBb,
    potBeforeHeroCall: evaluation.potBeforeHeroCall ?? null,
    toCall,
  };
}

function postflopSpotLabel(postflop, toCall) {
  const position = postflop.positions?.[postflop.heroSeat] || `Seat ${postflop.heroSeat + 1}`;
  return `${position} ${postflop.street} facing ${formatAmount(toCall)} bb`;
}

function formatAmount(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
}

function roundMetric(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function roundCost(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
