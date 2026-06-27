// Heads-up open-shove evaluation (Phase 16, slice A5).
//
// Ties the pieces together: at push/fold depth, take the hero's hand and the
// effective stack, compute hero equity vs the modelled BB calling range (the
// same caller chart the trainer/coach use), and turn it into a shove-vs-fold
// chip-EV via `evShove`. Deterministic given a seed.

import { runEquitySimulation } from "./equity.js";
import { headsUpCallerRange } from "./pushfold-ranges.js";
import { evShove } from "./ev.js";

/**
 * Grade a heads-up open-shove.
 *
 * @param {{
 *   heroCards: string[],
 *   effBb: number,
 *   sb?: number,
 *   bb?: number,
 *   seed?: string,
 *   iterations?: number,
 * }} args
 * @returns {{
 *   verdict: "shove"|"fold",
 *   deltaBb: number,
 *   evShoveBb: number,
 *   evFoldBb: number,
 *   equityIfCalled: number,
 *   callFreq: number,
 * }|null} null when push/fold play doesn't apply (deep) or hero cards are missing.
 */
export function evaluateHeadsUpShove({
  heroCards,
  effBb,
  sb = 0.5,
  bb = 1,
  seed = "felt-shove",
  iterations = 6000,
}) {
  if (!Array.isArray(heroCards) || heroCards.length !== 2) {
    return null;
  }

  const caller = headsUpCallerRange(effBb);
  if (!caller || caller.combos.length === 0) {
    return null;
  }

  const { heroEquity } = runEquitySimulation({
    heroCards,
    board: [],
    villains: [{ type: "range", range: caller.combos }],
    iterations,
    seed: `${seed}-${effBb}`,
  });

  const ev = evShove({
    effStackBb: effBb,
    sb,
    bb,
    callFreq: caller.callFreq,
    equityIfCalled: heroEquity,
  });

  return {
    verdict: ev.deltaBb >= 0 ? "shove" : "fold",
    deltaBb: ev.deltaBb,
    evShoveBb: ev.evShoveBb,
    evFoldBb: ev.evFoldBb,
    equityIfCalled: heroEquity,
    callFreq: caller.callFreq,
  };
}
