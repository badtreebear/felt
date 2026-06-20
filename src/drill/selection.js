// Drill spot selection (Phase 10, v1 — replay from history).
//
// Given the active hero's recorded hands and a leak type, return a deduped,
// most-recent-first list of "spots" to drill: one per hand that contains that
// leak. Each spot carries the seed (to re-deal the exact hand) and the street
// the leak happened on (so the drill grades the decision on that street).
//
// Pure and deterministic so it can be unit-tested without the store/UI.

export function collectDrillSpots(hands, leakType, { limit = 20 } = {}) {
  if (!Array.isArray(hands) || !leakType) {
    return [];
  }

  const spots = [];
  const seenSeeds = new Set();

  [...hands]
    .sort((a, b) => (Number(b?.ts) || 0) - (Number(a?.ts) || 0))
    .forEach((hand) => {
      const seed = hand?.seed;

      if (!seed || seenSeeds.has(seed)) {
        return;
      }

      const decision = (hand.decisions || []).find((entry) => entry && entry.leak && entry.leakType === leakType);

      if (!decision) {
        return;
      }

      seenSeeds.add(seed);
      spots.push({
        seed,
        street: decision.street || "preflop",
        spot: decision.spot || "",
        recommended: decision.recommended || "",
      });
    });

  return spots.slice(0, Math.max(0, limit));
}

// The street a leak happens on (preflop / flop / turn / river), inferred from the
// hero's recorded decisions. Used to decide whether a leak can be drilled with
// freshly generated hands (v1 generates preflop spots) and which decision to grade.
export function leakStreet(hands, leakType) {
  if (!Array.isArray(hands) || !leakType) {
    return "";
  }

  for (const hand of hands) {
    const decision = (hand?.decisions || []).find((entry) => entry && entry.leak && entry.leakType === leakType);

    if (decision) {
      return decision.street || "preflop";
    }
  }

  return "";
}
