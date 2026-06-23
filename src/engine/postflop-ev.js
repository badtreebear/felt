import { evCall, callVerdict } from "./ev.js";
import { adjustedOpeningRange } from "./player-model.js";
import { requiredEquity } from "./potodds.js";
import { runEquitySimulation } from "./equity.js";
import { expandPositionRange, rangeToGrid } from "./ranges.js";

const DEFAULT_POSTFLOP_EV_ITERATIONS = 6000;
// This equity sim runs synchronously on the main thread inside the hero-action
// click handler (for tracker leak scoring). Range-vs-range sampling on crowded
// boards can take many seconds, freezing the UI. Cap the wall-clock budget so a
// click can never stall: a few hundred iterations in this window is plenty
// accurate for classifying a call/fold/sizing decision.
const POSTFLOP_EV_TIME_LIMIT_MS = 200;

export function evaluatePostflopDecision({
  hand,
  config,
  postflop,
  iterations = DEFAULT_POSTFLOP_EV_ITERATIONS,
  seed,
} = {}) {
  const heroCards = hand?.holeCards?.[config?.heroSeat] || postflop?.holeCards?.[postflop?.heroSeat] || [];
  const toCall = Number(postflop?.heroToCall) || 0;

  if (!postflop || postflop.status !== "waitingHero" || toCall <= 0 || heroCards.length !== 2) {
    return null;
  }

  const potBeforeHeroCall = potBeforeCall(postflop, toCall);
  const equityResult = runHeroEquity({ hand, config, postflop, iterations, seed });

  if (!equityResult) {
    return null;
  }

  const equity = equityResult.heroEquity;
  const needed = requiredEquity(potBeforeHeroCall, toCall);
  const callEv = evCall({ equity, pot: potBeforeHeroCall, toCall });

  return {
    equity,
    requiredEquity: needed,
    evCall: round(callEv),
    verdict: callVerdict({ equity, pot: potBeforeHeroCall, toCall }),
    iterations: equityResult.iterations,
    exact: equityResult.exact,
    opponentCount: equityResult.opponentCount,
    potBeforeHeroCall,
    toCall,
  };
}

// Evaluate a hero bet/raise that commits chips (used for all-in "got it in light"
// detection). Assumes the bet is called: at an all-in there is no fold equity, so
// the if-called EV is the honest read on whether the chips went in too light.
export function evaluateHeroCommitment({
  hand,
  config,
  postflop,
  committed,
  iterations = DEFAULT_POSTFLOP_EV_ITERATIONS,
  seed,
} = {}) {
  const heroCards = hand?.holeCards?.[config?.heroSeat] || postflop?.holeCards?.[postflop?.heroSeat] || [];
  const commit = Number(committed) || 0;

  if (!postflop || heroCards.length !== 2 || commit <= 0) {
    return null;
  }

  if (villainRangesForPostflopDecision(postflop).length === 0) {
    return null;
  }

  const equityResult = runHeroEquity({
    hand,
    config,
    postflop,
    iterations,
    seed: `${seed || postflopDecisionKey({ hand, config, postflop })}|commit`,
  });

  if (!equityResult) {
    return null;
  }

  const equity = equityResult.heroEquity;
  const pot = Math.max(0, Number(postflop.pot) || 0);

  return {
    equity,
    requiredEquity: requiredEquity(pot, commit),
    evCall: round(evCall({ equity, pot, toCall: commit })),
    committed: commit,
    pot,
    iterations: equityResult.iterations,
    exact: equityResult.exact,
    opponentCount: equityResult.opponentCount,
  };
}

function runHeroEquity({ hand, config, postflop, iterations = DEFAULT_POSTFLOP_EV_ITERATIONS, seed } = {}) {
  const heroCards = hand?.holeCards?.[config?.heroSeat] || postflop?.holeCards?.[postflop?.heroSeat] || [];

  if (!postflop || heroCards.length !== 2) {
    return null;
  }

  return runEquitySimulation({
    heroCards,
    board: postflop.board || [],
    villains: villainRangesForPostflopDecision(postflop),
    iterations,
    progressEvery: iterations,
    timeLimitMs: POSTFLOP_EV_TIME_LIMIT_MS,
    seed: seed || postflopDecisionKey({ hand, config, postflop }),
  });
}

export function postflopDecisionKey({ hand, config, postflop } = {}) {
  const heroSeat = config?.heroSeat ?? postflop?.heroSeat;
  const liveSeats = Array.from({ length: postflop?.players || 0 }, (_, seat) => seat)
    .filter((seat) => seat !== heroSeat && !postflop?.folded?.[seat])
    .join(",");

  return [
    hand?.seed || "no-seed",
    postflop?.street || "",
    (postflop?.board || []).join(""),
    heroSeat,
    (hand?.holeCards?.[heroSeat] || postflop?.holeCards?.[heroSeat] || []).join(""),
    postflop?.pot || 0,
    postflop?.heroToCall || 0,
    postflop?.currentBet || 0,
    liveSeats,
  ].join("|");
}

export function villainRangesForPostflopDecision(postflop) {
  if (!postflop) {
    return [];
  }

  return Array.from({ length: postflop.players || 0 }, (_, seat) => seat)
    .filter((seat) => seat !== postflop.heroSeat && !postflop.folded?.[seat])
    .map((seat) => {
      const position = postflop.positions?.[seat] || "";
      const profile = postflop.seatProfiles?.[seat] || postflop.seatProfiles?.[String(seat)] || "standard";
      const adjusted = adjustedOpeningRange({ position, profile });

      return {
        type: "range",
        range: expandPositionRange(adjusted.range),
      };
    });
}

// Display companion to villainRangesForPostflopDecision: the same assumed range
// per live villain, but as a 13x13 weight grid (for the range-grid renderer)
// rather than expanded combos (for the equity sim). Lets the UI show "what the
// engine thinks each villain holds here" — the basis of the equity number.
export function villainRangeGridsForSpot(postflop) {
  if (!postflop) {
    return [];
  }

  return Array.from({ length: postflop.players || 0 }, (_, seat) => seat)
    .filter((seat) => seat !== postflop.heroSeat && !postflop.folded?.[seat])
    .map((seat) => {
      const position = postflop.positions?.[seat] || "";
      const profile = postflop.seatProfiles?.[seat] || postflop.seatProfiles?.[String(seat)] || "standard";
      const adjusted = adjustedOpeningRange({ position, profile });

      return {
        seat,
        position,
        profile,
        grid: rangeToGrid(adjusted.range),
      };
    });
}

function potBeforeCall(postflop, toCall) {
  return Math.max(0, round((Number(postflop.pot) || 0) - toCall));
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
