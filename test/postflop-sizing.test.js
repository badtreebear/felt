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
    // Names the board threats so live grading can explain the danger concretely.
    // Monotone heart board -> a flush is possible and beats top pair.
    expect(decision.beats).toContain("flush");
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

  it("flags a small bet neutrally when there's no equity read (analysis off)", () => {
    // No commitmentEval -> we never advise betting bigger with an unknown hand.
    const decision = scorePostflopSizing({
      postflop: postflop(),
      action: "bet",
      committed: 5,
      allIn: false,
      commitmentEval: null,
      board: ["Ah", "9h", "2h"],
    });
    expect(decision.leakType).toBe("small bet (review)");
    expect(decision.recommended).not.toMatch(/larger/);
    expect(decision.costBb).toBe(0);
  });

  it("suggests sizing up a small bet ONLY when hero is ahead (deep analysis on)", () => {
    // Strong hand, small bet -> undersized value bet, advise larger sizing.
    const aheadDecision = scorePostflopSizing({
      postflop: postflop(),
      action: "bet",
      committed: 5,
      allIn: false,
      commitmentEval: { equity: 0.82 },
      board: ["Ah", "9h", "2h"],
    });
    expect(aheadDecision.leakType).toBe("undersized value bet");
    expect(aheadDecision.recommended).toMatch(/larger/);

    // Weak hand, small bet -> NOT advised to bet bigger (the bottom-pair case).
    const behindDecision = scorePostflopSizing({
      postflop: postflop(),
      action: "bet",
      committed: 5,
      allIn: false,
      commitmentEval: { equity: 0.28 },
      board: ["Ah", "9h", "2h"],
    });
    expect(behindDecision.leakType).toBe("small bet (review)");
    expect(behindDecision.recommended).not.toMatch(/larger/);
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
