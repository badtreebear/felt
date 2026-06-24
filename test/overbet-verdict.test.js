import { describe, expect, it } from "vitest";
import { overbetVerdict } from "../src/ui/chips.js";

// A "checked to hero" postflop spot on a wet monotone board: hero first to act,
// no bet faced, deep stacks. legalPostflopActions reads these fields.
const postflop = {
  status: "waitingHero",
  heroSeat: 0,
  players: 2,
  stacks: { 0: 100, 1: 100 },
  streetContributions: { 0: 0, 1: 0 },
  currentBet: 0,
  pot: 20,
  positions: { 0: "BTN", 1: "BB" },
  seatProfiles: { 1: "standard" },
  folded: {},
  holeCards: { 0: ["As", "Ks"] },
};

const spot = ({ heroRaiseTo, equity }) => ({
  config: { heroSeat: 0 },
  ui: { heroRaiseTo },
  maths: { heroEquity: equity },
  hand: {
    pot: 20,
    board: ["Ah", "9h", "2h"],
    holeCards: { 0: ["As", "Ks"] },
    postflop,
  },
});

describe("overbetVerdict", () => {
  it("flags a big bet made with weak relative strength", () => {
    // ~1.5x pot with only 40% equity on a monotone board → overvaluing.
    const verdict = overbetVerdict(spot({ heroRaiseTo: 30, equity: 0.4 }));
    expect(verdict?.flag).toBe(true);
    expect(verdict.reason).toMatch(/pot control/i);
  });

  it("does NOT flag a big bet when the hand is strong", () => {
    // Same big size, but 80% equity → a value bet, not an overbet leak.
    expect(overbetVerdict(spot({ heroRaiseTo: 30, equity: 0.8 }))).toBeNull();
  });

  it("does NOT flag a sensible size with a weak hand", () => {
    // Small bet with weak equity is fine — it's the SIZE relative to strength
    // that we catch, not betting weak hands at all.
    expect(overbetVerdict(spot({ heroRaiseTo: 7, equity: 0.4 }))).toBeNull();
  });

  it("is null when there is no postflop decision", () => {
    expect(overbetVerdict(null)).toBeNull();
    expect(overbetVerdict({ hand: { postflop: { status: "complete" } } })).toBeNull();
  });

  it("is null before equity has simulated", () => {
    expect(overbetVerdict(spot({ heroRaiseTo: 30, equity: null }))).toBeNull();
  });
});
