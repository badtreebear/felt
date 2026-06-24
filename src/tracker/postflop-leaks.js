import { canonicalHandKey } from "../engine/player-model.js";
import { boardThreats } from "../engine/board-threats.js";

export function scorePostflopEvDecision({ postflop, action, evaluation } = {}) {
  const toCall = Number(evaluation?.toCall ?? postflop?.heroToCall) || 0;

  if (!postflop || postflop.status !== "waitingHero" || toCall <= 0 || !evaluation) {
    return null;
  }

  if (action !== "call" && action !== "fold") {
    return null;
  }

  const ev = Number(evaluation.evCall);
  const recommended = ev > 0 ? "call" : "fold";
  const isLeak = (action === "call" && ev < 0) || (action === "fold" && ev > 0);
  const isGood = (action === "call" && ev > 0) || (action === "fold" && ev < 0);

  let category = "";
  if (isLeak) {
    category = action === "call" ? "called -EV (paid off)" : "folded +EV";
  } else if (isGood) {
    category = action === "call" ? "good call (+EV)" : "good fold";
  }

  return {
    street: postflop.street,
    spot: postflopSpotLabel(postflop, toCall),
    hand: canonicalHandKey(postflop.holeCards?.[postflop.heroSeat]) || "",
    heroAction: action,
    recommended,
    leak: isLeak,
    good: isGood,
    leakType: category,
    equity: roundMetric(evaluation.equity),
    requiredEquity: roundMetric(evaluation.requiredEquity),
    evCall: roundMetric(ev),
    verdict: evaluation.verdict || recommended,
    costBb: isLeak ? roundCost(Math.abs(ev)) : 0,
    benefitBb: isGood ? roundCost(Math.abs(ev)) : 0,
    potBeforeHeroCall: evaluation.potBeforeHeroCall ?? null,
    toCall,
  };
}

export const OVERSIZED_RATIO = 1.5;
const UNDERSIZED_RATIO = 0.3;

// "Overvalued your hand" thresholds (judgment — kept conservative). An oversized
// bet is only the relative-strength leak when the hand is genuinely behind the
// continuing range (low if-called equity) AND the board is dangerous (a made
// hand already beats hero, or the texture is wet). A big bet with a strong hand
// is just a value bet and must NOT be flagged.
const OVERVALUE_EQUITY = 0.55;
const OVERVALUE_WETNESS = 0.5;

export function scorePostflopSizing({ postflop, action, committed, allIn, commitmentEval, board } = {}) {
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

    if (!Number.isFinite(ev)) {
      return null;
    }

    const metrics = {
      equity: roundMetric(commitmentEval.equity),
      requiredEquity: roundMetric(commitmentEval.requiredEquity),
      evCall: roundMetric(ev),
    };

    if (ev < 0) {
      return baseDecision(postflop, action, commit, {
        ...metrics,
        leak: true,
        leakType: "got it in light",
        recommended: "pot control / fold",
        costBb: roundCost(Math.abs(ev)),
      });
    }

    return baseDecision(postflop, action, commit, {
      ...metrics,
      good: true,
      leakType: "got it in good",
      recommended: "keep getting it in",
      benefitBb: roundCost(ev),
    });
  }

  if (allIn) {
    return null;
  }

  const ratio = pot > 0 ? commit / pot : 0;

  if (ratio >= OVERSIZED_RATIO) {
    // Relative-strength check: is this big bet actually behind the board + range?
    const equity = Number(commitmentEval?.equity);
    const ev = Number(commitmentEval?.evCall);
    const heroCards = postflop.holeCards?.[postflop.heroSeat] || [];
    const { threats, wetness } = boardThreats(board || [], heroCards);
    const beaten = threats.some((threat) => threat.beatsHero === true);
    const dangerous = beaten || wetness >= OVERVALUE_WETNESS;
    const weak = Number.isFinite(equity) && equity < OVERVALUE_EQUITY;

    if (weak && dangerous) {
      return baseDecision(postflop, action, commit, {
        leak: true,
        leakType: "overvalued your hand",
        recommended: "pot control — respect the board",
        equity: roundMetric(equity),
        evCall: Number.isFinite(ev) ? roundMetric(ev) : null,
        // Cost = how much the if-called EV is underwater (the chips you bloat in
        // while behind). Falls back to 0 when EV is unavailable.
        costBb: Number.isFinite(ev) && ev < 0 ? roundCost(Math.abs(ev)) : 0,
      });
    }

    // Texture-neutral big bet (or strong hand): keep the lighter review flag so
    // nothing regresses, but it is not the relative-strength leak.
    return baseDecision(postflop, action, commit, {
      leak: true,
      leakType: "oversized bet (review)",
      recommended: "smaller sizing",
      costBb: 0,
    });
  }

  if (ratio > 0 && ratio <= UNDERSIZED_RATIO) {
    return baseDecision(postflop, action, commit, {
      leak: true,
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
    leak: extra.leak ?? false,
    good: extra.good ?? false,
    leakType: extra.leakType,
    equity: extra.equity ?? null,
    requiredEquity: extra.requiredEquity ?? null,
    evCall: extra.evCall ?? null,
    verdict: extra.recommended || "",
    costBb: extra.costBb ?? 0,
    benefitBb: extra.benefitBb ?? 0,
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
