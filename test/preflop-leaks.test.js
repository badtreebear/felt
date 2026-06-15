import { describe, expect, it } from "vitest";
import { getSeatPositions } from "../src/engine/positions.js";
import { scorePreflopDecision } from "../src/tracker/preflop-leaks.js";

describe("preflop leak scoring", () => {
  it("flags folding a first-in premium as too tight", () => {
    const decision = scorePreflopDecision({
      preflop: preflopState({
        heroSeat: 3,
        holeCards: ["As", "Ad"],
      }),
      action: "fold",
    });

    expect(decision).toMatchObject({
      hand: "AA",
      rangeKind: "rfi",
      recommended: "raise",
      heroAction: "fold",
      leak: true,
      leakType: "open-folded too tight",
    });
  });

  it("flags defending a fold-range hand too wide against an open", () => {
    const decision = scorePreflopDecision({
      preflop: preflopState({
        heroSeat: 2,
        holeCards: ["7c", "2d"],
        voluntaryRaiserSeat: 0,
        aggressorSeat: 0,
        raiseCount: 1,
        currentBet: 2.5,
        contributions: { 0: 2.5, 1: 0.5, 2: 1, 3: 0, 4: 0, 5: 0 },
        actionLog: [
          { seat: 0, street: "preflop", action: "raises to", size: 2.5 },
        ],
      }),
      action: "call",
    });

    expect(decision).toMatchObject({
      hand: "72o",
      rangeKind: "vsRfi",
      recommended: "fold",
      heroAction: "call",
      leak: true,
      leakType: "defended too wide",
    });
  });

  it("tags in-range facing-open plays as clean", () => {
    const decision = scorePreflopDecision({
      preflop: preflopState({
        heroSeat: 2,
        holeCards: ["Ac", "5c"],
        voluntaryRaiserSeat: 0,
        aggressorSeat: 0,
        raiseCount: 1,
        currentBet: 2.5,
        contributions: { 0: 2.5, 1: 0.5, 2: 1, 3: 0, 4: 0, 5: 0 },
        actionLog: [
          { seat: 0, street: "preflop", action: "raises to", size: 2.5 },
        ],
      }),
      action: "call",
    });

    expect(decision).toMatchObject({
      hand: "A5s",
      rangeKind: "vsRfi",
      recommended: "call",
      heroAction: "call",
      leak: false,
    });
  });
});

function preflopState(overrides = {}) {
  const players = 6;
  const buttonSeat = 0;
  const heroSeat = overrides.heroSeat ?? 3;
  const positions = getSeatPositions({ players, buttonSeat });
  const contributions = overrides.contributions || { 0: 0, 1: 0.5, 2: 1, 3: 0, 4: 0, 5: 0 };

  return {
    status: "waitingHero",
    players,
    buttonSeat,
    heroSeat,
    positions,
    holeCards: {
      [heroSeat]: overrides.holeCards || ["As", "Ad"],
    },
    currentBet: overrides.currentBet ?? 1,
    contributions,
    voluntaryRaiserSeat: overrides.voluntaryRaiserSeat ?? null,
    aggressorSeat: overrides.aggressorSeat ?? null,
    raiseCount: overrides.raiseCount ?? 0,
    actionLog: overrides.actionLog || [],
  };
}
