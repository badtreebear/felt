import { describe, expect, it } from "vitest";
import { buildHandRecord } from "../src/tracker/recording.js";

describe("hand recording", () => {
  it("builds a terminal dealt hand record with hero cards, position, and net", () => {
    const record = buildHandRecord(stateFixture());

    expect(record).toMatchObject({
      id: "record-1",
      heroId: "h1",
      seed: "phase-8-seed",
      players: 2,
      heroSeat: 0,
      heroPos: "BTN/SB",
      heroCards: ["As", "Ad"],
      net: 1,
      won: true,
    });
    expect(record.decisions).toHaveLength(1);
  });

  it("does not record manual spot study hands", () => {
    expect(buildHandRecord(stateFixture({ spotMode: "manual" }))).toBeNull();
  });
});

function stateFixture({ spotMode = "dealt" } = {}) {
  return {
    activeHeroId: "h1",
    ui: { spotMode },
    config: {
      players: 2,
      heroSeat: 0,
    },
    hand: {
      seed: "phase-8-seed",
      trackerRecordId: "record-1",
      buttonSeat: 0,
      holeCards: {
        0: ["As", "Ad"],
        1: ["2c", "7d"],
      },
      board: [],
      startingStacks: {
        0: 200,
        1: 200,
      },
      trackerDecisions: [
        { street: "preflop", leak: false, heroAction: "raise", recommended: "raise" },
      ],
      preflop: {
        status: "complete",
        result: "winner",
        winnerSeat: 0,
        winnerSeats: [0],
        positions: {
          0: "BTN/SB",
          1: "BB",
        },
        stacks: {
          0: 201,
          1: 199,
        },
        actionLog: [
          { seat: 0, street: "preflop", action: "raises to", size: 2.5 },
          { seat: 1, street: "preflop", action: "folds", size: 0 },
          { seat: 0, street: "preflop", action: "wins pot", size: 2 },
        ],
      },
      postflop: null,
    },
  };
}
