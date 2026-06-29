// Normalises a raw tracker decision (one entry in `state.hand.trackerDecisions`,
// produced by `scorePreflopDecision` / `scorePostflopEvDecision` /
// `scorePostflopSizing`) into a single display shape that the live-grading UI
// and the future drill mode can share.
//
// `evDeltaBb` is signed, defined as `EV(hero action) - EV(best action)`, so:
//   - correct play -> 0
//   - leak        -> negative (deviation from best)
//   - good play   -> 0 (it matched the best, so no deviation)
// This is intentionally separate from the tracker's `costBb`/`benefitBb` reads,
// which measure the EV of the chosen action alone (good-call baseline).

const ROUND_BB = 10; // round to 0.1bb

export function normaliseDecision(decision) {
  if (!decision || typeof decision !== "object") {
    return null;
  }

  const street = decision.street || "";
  const hand = decision.hand || "";
  const spot = decision.spot || "";
  const heroAction = decision.heroAction || "";
  const recommended = decision.recommended || "";
  const rangeKind = decision.rangeKind || "";
  const leakType = decision.leakType || "";
  const beats = Array.isArray(decision.beats) ? decision.beats : null;

  if (!recommended || recommended === "unknown") {
    return {
      street,
      spot,
      hand,
      heroAction,
      recommended: recommended || "",
      matched: null,
      evDeltaBb: 0,
      reason: "no chart",
      rangeKind,
    };
  }

  // A postflop bet/raise is a sizing/commitment decision (undersized review,
  // overvalued, got-it-in good/light). These are graded on the leak/good flags,
  // NOT on call/fold EV — even though the all-in "got it in" reads carry an
  // evCall, so we must route on the action, not on the presence of evCall.
  const isCommitment = street && street !== "preflop"
    && (heroAction === "bet" || heroAction === "raise");
  const isEvCall = !isCommitment && typeof decision.evCall === "number";

  if (isCommitment) {
    const matched = !decision.leak;  // a "good" commitment matches the best line
    // Show the EV magnitude as the deviation only for leaks; good/neutral are 0.
    const ev = Math.abs(Number(decision.evCall) || 0);
    return {
      street,
      spot,
      hand,
      heroAction,
      recommended,
      matched,
      evDeltaBb: decision.leak && ev > 0 ? -roundBb(ev) : 0,
      benefitBb: decision.good ? roundBb(Math.abs(Number(decision.benefitBb) || ev)) : 0,
      reason: decision.leak ? (leakType || "sizing review") : (decision.good ? leakType : null),
      rangeKind,
      beats,
    };
  }

  const matched = heroAction === recommended;

  if (isEvCall) {
    const ev = Math.abs(Number(decision.evCall) || 0);
    return {
      street,
      spot,
      hand,
      heroAction,
      recommended,
      matched,
      evDeltaBb: matched ? 0 : -roundBb(ev),
      reason: matched ? null : (leakType || null),
      rangeKind,
    };
  }

  // Preflop path: tracker's `costBb` is |EV|; flip sign for the deviation framing.
  const cost = Math.abs(Number(decision.costBb) || 0);
  return {
    street,
    spot,
    hand,
    heroAction,
    recommended,
    matched,
    evDeltaBb: decision.leak ? -roundBb(cost) : 0,
    reason: decision.leak ? (leakType || null) : null,
    rangeKind,
  };
}

function roundBb(value) {
  return Math.round(value * ROUND_BB) / ROUND_BB;
}
