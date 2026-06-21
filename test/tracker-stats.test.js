import { describe, expect, it } from "vitest";
import { summarizeHands } from "../src/tracker/stats.js";

describe("tracker stats", () => {
  it("computes preflop stats, showdown rate, net bb, and ranked leaks", () => {
    const summary = summarizeHands([
      hand({
        id: "one",
        net: 4,
        board: ["As", "Kd", "7c", "2h", "9s"],
        actionLog: [{ seat: 0, street: "preflop", action: "raises to", size: 2.5 }],
        decisions: [{ leak: true, leakType: "opened too wide", heroAction: "raise", recommended: "fold" }],
      }),
      hand({
        id: "two",
        net: -1,
        actionLog: [{ seat: 0, street: "preflop", action: "calls", size: 1 }],
        decisions: [{ leak: true, leakType: "opened too wide", heroAction: "raise", recommended: "fold" }],
      }),
      hand({
        id: "three",
        net: -0.5,
        actionLog: [{ seat: 0, street: "preflop", action: "folds", size: 0 }],
        decisions: [{ leak: true, leakType: "over-folded a defend hand", heroAction: "fold", recommended: "call" }],
      }),
    ]);

    expect(summary.handsTracked).toBe(3);
    expect(summary.vpip).toBe(2 / 3);
    expect(summary.pfr).toBe(1 / 3);
    expect(summary.threeBet).toBe(0);
    expect(summary.wtsd).toBe(1 / 3);
    expect(summary.netBb).toBe(2.5);
    expect(summary.leaks[0]).toMatchObject({ leakType: "opened too wide", count: 2 });
    expect(summary.leaks[1]).toMatchObject({ leakType: "over-folded a defend hand", count: 1 });
  });
});

function hand(overrides) {
  return {
    heroSeat: 0,
    heroId: "h1",
    seed: "seed",
    actionLog: [],
    decisions: [],
    board: [],
    net: 0,
    ...overrides,
  };
}
