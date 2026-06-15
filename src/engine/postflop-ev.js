import { evCall, callVerdict } from "./ev.js";
import { adjustedOpeningRange } from "./player-model.js";
import { requiredEquity } from "./potodds.js";
import { runEquitySimulation } from "./equity.js";
import { expandPositionRange } from "./ranges.js";

const DEFAULT_POSTFLOP_EV_ITERATIONS = 6000;

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
  const equityResult = runEquitySimulation({
    heroCards,
    board: postflop.board || [],
    villains: villainRangesForPostflopDecision(postflop),
    iterations,
    progressEvery: iterations,
    seed: seed || postflopDecisionKey({ hand, config, postflop }),
  });
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

function potBeforeCall(postflop, toCall) {
  return Math.max(0, round((Number(postflop.pot) || 0) - toCall));
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
