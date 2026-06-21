import { describe, expect, it } from "vitest";
import {
  buildTrackerLeakSnapshot,
  buildTrackerSummarySnapshot,
  trackerExampleTopic,
} from "../src/coach/tracker.js";

describe("tracker coach snapshots", () => {
  it("summarizes stats and ranked leaks for the tracker report", () => {
    const snapshot = buildTrackerSummarySnapshot(stateFixture());

    expect(snapshot).toEqual({
      hero: "Jason",
      stats: {
        handsTracked: 2,
        vpip: 0.5,
        pfr: 0.25,
        threeBet: 0,
        foldToCbet: null,
        wtsd: 0.5,
        netBb: -6,
      },
      leaks: [{
        leakType: "defended too wide",
        count: 1,
        recommended: "fold",
        totalCostBb: null,
        examples: [{
          id: "hand-1",
          handId: "hand-1",
          seed: "seed-1",
          hand: "72o",
          spot: "BB vs LJ open",
          heroAction: "call",
          recommended: "fold",
          netBb: -6,
          costBb: null,
        }],
      }],
    });
  });

  it("packages a specific leak hand with cards, position, action log, and EV numbers", () => {
    const snapshot = buildTrackerLeakSnapshot(stateFixture(), {
      leakType: "defended too wide",
      exampleId: "hand-1",
    });

    expect(snapshot.hand).toMatchObject({
      id: "hand-1",
      seed: "seed-1",
      heroPosition: "BB",
      heroCards: ["7c", "2d"],
      board: ["As", "Kd", "9h"],
    });
    expect(snapshot.hand.actionLog).toEqual([
      "preflop: Seat 1 raises to 2.5",
      "preflop: BB(hero) calls 2.5",
      "flop: BB(hero) folds",
    ]);
    expect(snapshot.decision).toMatchObject({
      heroAction: "call",
      recommended: "fold",
      evCall: -1.25,
      costBb: 1.25,
    });
    expect(trackerExampleTopic(snapshot.example)).toBe("tracker:example:hand-1");
  });
});

function stateFixture() {
  return {
    heroes: [{ id: "h1", name: "Jason" }],
    activeHeroId: "h1",
    tracker: {
      summary: {
        handsTracked: 2,
        vpip: 0.5,
        pfr: 0.25,
        threeBet: 0,
        foldToCbet: null,
        wtsd: 0.5,
        netBb: -6,
        leaks: [{
          leakType: "defended too wide",
          count: 1,
          recommended: "fold",
          examples: [{
            id: "hand-1",
            seed: "seed-1",
            hand: "72o",
            spot: "BB vs LJ open",
            heroAction: "call",
            recommended: "fold",
            net: -6,
          }],
        }],
      },
      hands: [{
        id: "hand-1",
        seed: "seed-1",
        players: 6,
        heroSeat: 1,
        heroPos: "BB",
        heroCards: ["7c", "2d"],
        board: ["As", "Kd", "9h"],
        net: -6,
        won: false,
        result: "folded",
        actionLog: [
          { seat: 0, street: "preflop", action: "raises to", size: 2.5 },
          { seat: 1, street: "preflop", action: "calls", size: 2.5 },
          { seat: 1, street: "flop", action: "folds", size: 0 },
        ],
        decisions: [{
          street: "preflop",
          leak: true,
          leakType: "defended too wide",
          hand: "72o",
          spot: "BB vs LJ open",
          heroAction: "call",
          recommended: "fold",
          evCall: -1.25,
          costBb: 1.25,
        }],
      }],
    },
  };
}
