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

// Three-way grade for the live-grading scoreboard (Good / OK / Leak):
//   - "good"    -> a +EV win (good call/fold, got it in good)
//   - "neutral" -> matched the engine, or a "review" sizing with no EV cost
//   - "fail"    -> a real leak that cost EV
// `matched` stays binary for callers that only care about pass/fail; `grade`
// is the richer signal. A "review" leak (e.g. small bet as a blocker) sets
// leak:true but costBb:0 -- that is NOT a fail, it's neutral. So we key "fail"
// on actual EV cost, never on the bare leak flag.
function gradeFrom({ good, matched, evDeltaBb, benefitBb, isLeak }) {
  if (good || (Number(benefitBb) || 0) > 0) {
    return "good";
  }
  if (matched === null) {
    return "neutral"; // no chart -- shown but doesn't move pass/fail either way
  }
  // A confirmed leak is a fail even if the EV estimate rounded to 0, so the
  // scoreboard (Leak) and the line ("missed") never disagree. A non-leak only
  // fails when it actually lost measurable EV.
  if (isLeak) {
    return "fail";
  }
  if (!matched && (Number(evDeltaBb) || 0) < 0) {
    return "fail";
  }
  return "neutral";
}

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
      grade: "neutral",
      evDeltaBb: 0,
      reason: "no chart",
      rangeKind,
    };
  }

  // A postflop bet/raise is a sizing/commitment decision (undersized review,
  // overvalued, got-it-in good/light). These are graded on the leak/good flags,
  // NOT on call/fold EV -- even though the all-in "got it in" reads carry an
  // evCall, so we must route on the action, not on the presence of evCall.
  const isCommitment = street && street !== "preflop"
    && (heroAction === "bet" || heroAction === "raise");
  const isEvCall = !isCommitment && typeof decision.evCall === "number";

  if (isCommitment) {
    // A commitment only FAILS when it actually cost EV. "Review" sizings
    // (small-bet blocker, oversized review) set leak:true but costBb:0 -- the
    // tracker's own intent is "flag neutrally, no cost", so they must not read
    // as a miss. We therefore key the fail on EV cost, not the bare leak flag.
    const ev = Math.abs(Number(decision.evCall) || 0);
    const cost = Math.abs(Number(decision.costBb) || 0);
    const isFail = Boolean(decision.leak) && (cost > 0 || (decision.evCall < 0 && ev > 0));
    const matched = !isFail; // good + neutral-review both "match" (no EV lost)
    const evDeltaBb = isFail ? -roundBb(cost > 0 ? cost : ev) : 0;
    const benefitBb = decision.good ? roundBb(Math.abs(Number(decision.benefitBb) || ev)) : 0;
    return {
      street,
      spot,
      hand,
      heroAction,
      recommended,
      matched,
      grade: gradeFrom({ good: decision.good, matched, evDeltaBb, benefitBb, isLeak: isFail }),
      evDeltaBb,
      benefitBb,
      // Carry leakType through as the reason for leaks, good plays, AND neutral
      // sizing ("reasonable sizing"), so live grading can show an acknowledging note.
      reason: decision.leak ? (leakType || "sizing review") : (leakType || null),
      rangeKind,
      beats,
    };
  }

  const matched = heroAction === recommended;

  if (isEvCall) {
    const ev = Math.abs(Number(decision.evCall) || 0);
    const evDeltaBb = matched ? 0 : -roundBb(ev);
    const benefitBb = decision.good ? roundBb(Math.abs(Number(decision.benefitBb) || ev)) : 0;
    return {
      street,
      spot,
      hand,
      heroAction,
      recommended,
      matched,
      grade: gradeFrom({ good: decision.good, matched, evDeltaBb, benefitBb, isLeak: decision.leak === true && !matched }),
      evDeltaBb,
      benefitBb,
      reason: matched ? null : (leakType || null),
      rangeKind,
    };
  }

  // Preflop path: tracker's `costBb` is |EV|; flip sign for the deviation framing.
  const cost = Math.abs(Number(decision.costBb) || 0);
  const evDeltaBb = decision.leak ? -roundBb(cost) : 0;
  return {
    street,
    spot,
    hand,
    heroAction,
    recommended,
    matched,
    grade: gradeFrom({ good: decision.good, matched, evDeltaBb, isLeak: decision.leak === true }),
    evDeltaBb,
    reason: decision.leak ? (leakType || null) : null,
    rangeKind,
  };
}

function roundBb(value) {
  return Math.round(value * ROUND_BB) / ROUND_BB;
}
