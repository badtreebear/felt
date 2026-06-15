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

const OVERSIZED_RATIO = 1.5;
const UNDERSIZED_RATIO = 0.3;

export function scorePostflopSizing({ postflop, action, committed, allIn, commitmentEval } = {}) {
  if (!postflop || (action !== "bet" && action !== "raise")) {
    return null;
  }

  const commit = Number(committed) || 0;
  const pot = Math.max(0, Number(postflop.pot) || 0);

  if (commit <= 0) {
    return null;
  }

  // All-in commitment scored on equity: if the if-called EV is negative the chips
  // went in too light (no fold equity at an all-in, so this is EV-honest).
  if (allIn && commitmentEval) {
    const ev = Number(commitmentEval.evCall);

    if (!Number.isFinite(ev) || ev >= 0) {
      return null;
    }

    return baseDecision(postflop, action, commit, {
      leakType: "got it in light",
      recommended: "pot control / fold",
      costBb: roundCost(Math.abs(ev)),
      equity: roundMetric(commitmentEval.equity),
      requiredEquity: roundMetric(commitmentEval.requiredEquity),
      evCall: roundMetric(ev),
    });
  }

  if (allIn) {
    return null;
  }

  const ratio = pot > 0 ? commit / pot : 0;

  if (ratio >= OVERSIZED_RATIO) {
    return baseDecision(postflop, action, commit, {
      leakType: "oversized bet (review)",
      recommended: "smaller sizing",
      costBb: 0,
    });
  }

  if (ratio > 0 && ratio <= UNDERSIZED_RATIO) {
    return baseDecision(postflop, action, commit, {
      leakType: "undersized bet (review)",
      recommended: "larger sizing",
      costBb: 0,
    });
  }

  return null;
}

function baseDecision(postflop, action, commit, extra) {
  const position = postflop.positions?.[postflop.heroSeat] || `Seat ${postflop.heroSeat + 1}`;
  const verb = action === "raise" ? "raise to" : "bet";
  return {
    street: postflop.street,
    spot: `${position} ${postflop.street} ${verb} ${formatAmount(commit)} bb`,
    hand: canonicalHandKey(postflop.holeCards?.[postflop.heroSeat]) || "",
    heroAction: action,
    recommended: extra.recommended || "",
    leak: true,
    leakType: extra.leakType,
    equity: extra.equity ?? null,
    requiredEquity: extra.requiredEquity ?? null,
    evCall: extra.evCall ?? null,
    verdict: extra.recommended || "",
    costBb: extra.costBb ?? 0,
    potBeforeHeroCall: Math.max(0, Number(postflop.pot) || 0),
    toCall: commit,
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
