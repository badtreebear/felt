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

  const isSizing = street && street !== "preflop" && !decision.evCall;
  const isEvCall = typeof decision.evCall === "number";

  if (isSizing) {
    const matched = !decision.leak && !decision.good ? true : !decision.leak;
    return {
      street,
      spot,
      hand,
      heroAction,
      recommended,
      matched,
      evDeltaBb: 0,
      reason: decision.leak ? (leakType || "sizing review") : null,
      rangeKind,
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
