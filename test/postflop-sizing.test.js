import { describe, expect, it } from "vitest";
import { scorePostflopSizing } from "../src/tracker/postflop-leaks.js";

const postflop = (overrides = {}) => ({
  status: "waitingHero",
  heroSeat: 0,
  street: "flop",
  pot: 20,
  positions: { 0: "BTN" },
  stacks: { 0: 100 },
  holeCards: { 0: ["As", "Ks"] },
  ...overrides,
});

describe("scorePostflopSizing — overvalued-hand leak", () => {
  it("flags a big bet behind the range on a dangerous board", () => {
    // 2x pot (40 into 20) with 35% if-called equity, monotone board, top pair.
    const decision = scorePostflopSizing({
      postflop: postflop(),
      action: "bet",
      committed: 40,
      allIn: false,
      commitmentEval: { equity: 0.35, evCall: -5 },
      board: ["Ah", "9h", "2h"],
    });
    expect(decision.leak).toBe(true);
    expect(decision.leakType).toBe("overvalued your hand");
    expect(decision.costBb).toBe(5);
  });

  it("does NOT flag a big bet with a strong hand (value, not a leak)", () => {
    const decision = scorePostflopSizing({
      postflop: postflop(),
      action: "bet",
      committed: 40,
      allIn: false,
      commitmentEval: { equity: 0.8, evCall: 10 },
      board: ["Ah", "9h", "2h"],
    });
    expect(decision.leakType).toBe("oversized bet (review)");
  });

  it("does NOT flag an oversized bet on a safe board where nothing beats hero", () => {
    // Hero has a set of aces on a dry rainbow board: no category beats it, dry texture.
    const decision = scorePostflopSizing({
      postflop: postflop({ holeCards: { 0: ["Ad", "Ac"] } }),
      action: "bet",
      committed: 40,
      allIn: false,
      commitmentEval: { equity: 0.5, evCall: -2 },
      board: ["Ah", "7d", "2c"],
    });
    expect(decision.leakType).toBe("oversized bet (review)");
  });

  it("returns nothing for a normal-sized bet", () => {
    expect(scorePostflopSizing({
      postflop: postflop(),
      action: "bet",
      committed: 10,
      allIn: false,
      commitmentEval: null,
      board: ["Ah", "9h", "2h"],
    })).toBeNull();
  });

  it("still flags an undersized bet for review", () => {
    const decision = scorePostflopSizing({
      postflop: postflop(),
      action: "bet",
      committed: 5,
      allIn: false,
      commitmentEval: null,
      board: ["Ah", "9h", "2h"],
    });
    expect(decision.leakType).toBe("undersized bet (review)");
  });

  it("leaves the all-in 'got it in light' leak unchanged", () => {
    const decision = scorePostflopSizing({
      postflop: postflop(),
      action: "bet",
      committed: 100,
      allIn: true,
      commitmentEval: { equity: 0.3, evCall: -7 },
      board: ["Ah", "9h", "2h"],
    });
    expect(decision.leakType).toBe("got it in light");
    expect(decision.costBb).toBe(7);
  });
});
