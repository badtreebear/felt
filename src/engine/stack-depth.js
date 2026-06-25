// Stack-depth helpers (Phase 16, slice A1). PURE + deterministic, no DOM.
//
// The shared foundation for heads-up short play and tournament "blinding out":
// measure the effective stack in big blinds, and classify how deep the spot is so
// the range selector can switch between deep play and Nash push/fold.

// Depth thresholds (in bb). Judgment calls, kept as named constants so they're
// easy to tune. ≤ ~15bb is open-jam / push-fold territory; ~15–25bb is a shallow
// band where opens shrink and jams enter; deeper than that plays as a cash open.
export const PUSHFOLD_MAX_BB = 15;
export const SHALLOW_MAX_BB = 25;

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

/**
 * Effective stack in big blinds = the smallest live stack that matters in the
 * spot, divided by the big blind. For a single decision the relevant figure is
 * the shortest stack still in the pot (you can only win/lose up to that), so we
 * take the minimum of the provided live stacks.
 *
 * @param {{ stacks: Record<string|number, number>, bb: number, seats?: Array<string|number> }} args
 * @returns {number|null} effective stack in bb, or null if it can't be computed
 */
export function effectiveStackBb({ stacks, bb, seats } = {}) {
  const blind = Number(bb);

  if (!Number.isFinite(blind) || blind <= 0 || !stacks) {
    return null;
  }

  const keys = seats && seats.length ? seats : Object.keys(stacks);
  const values = keys
    .map((seat) => Number(stacks[seat]))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!values.length) {
    return null;
  }

  return round1(Math.min(...values) / blind);
}

/**
 * Classify an open/decision by effective depth.
 * @param {number|null} effBb
 * @returns {"pushfold"|"shallow"|"deep"|"unknown"}
 */
export function openDepth(effBb) {
  if (effBb === null || effBb === undefined || !Number.isFinite(Number(effBb))) {
    return "unknown";
  }
  const bb = Number(effBb);
  if (bb <= PUSHFOLD_MAX_BB) {
    return "pushfold";
  }
  if (bb <= SHALLOW_MAX_BB) {
    return "shallow";
  }
  return "deep";
}

// Convenience: true when the spot is short enough that push/fold (open-jam)
// should drive the recommendation.
export function isPushFoldDepth(effBb) {
  return openDepth(effBb) === "pushfold";
}
