import { describe, expect, it } from "vitest";
import {
  breakevenFoldFraction,
  finalPotAfterCall,
  potOdds,
  requiredEquity,
  valueBluffRatio,
} from "../src/engine/potodds.js";

describe("pot odds", () => {
  it("calculates required equity from pot before bet, bet, and call", () => {
    expect(requiredEquity(24, 8)).toBeCloseTo(0.2, 6);
    expect(finalPotAfterCall(24, 8)).toBe(40);
  });

  it("returns zero required equity when no bet is faced", () => {
    expect(requiredEquity(24, 0)).toBe(0);
  });

  it("reports the full pot odds breakdown", () => {
    expect(potOdds({ pot: 30, toCall: 10 })).toEqual({
      pot: 30,
      toCall: 10,
      finalPot: 50,
      requiredEquity: 0.2,
      reward: 40,
      risk: 10,
    });
  });
});

describe("breakevenFoldFraction", () => {
  it("is 50% for a pot-sized bet and 33% for a half-pot bet", () => {
    expect(breakevenFoldFraction({ pot: 100, bet: 100 })).toBeCloseTo(0.5, 6);
    expect(breakevenFoldFraction({ pot: 100, bet: 50 })).toBeCloseTo(1 / 3, 6);
    expect(breakevenFoldFraction({ pot: 100, bet: 200 })).toBeCloseTo(2 / 3, 6);
  });

  it("is zero for a non-positive bet", () => {
    expect(breakevenFoldFraction({ pot: 100, bet: 0 })).toBe(0);
    expect(breakevenFoldFraction({ pot: 100, bet: -10 })).toBe(0);
  });
});

describe("valueBluffRatio", () => {
  it("gives 2:1 value:bluff for a pot bet, 3:1 for a half pot", () => {
    const pot = valueBluffRatio({ pot: 100, bet: 100 });
    expect(pot.ratio).toBeCloseTo(2, 6);
    expect(pot.bluffFraction).toBeCloseTo(1 / 3, 6);

    const half = valueBluffRatio({ pot: 100, bet: 50 });
    expect(half.ratio).toBeCloseTo(3, 6);
    expect(half.bluffFraction).toBeCloseTo(0.25, 6);
  });

  it("returns null for a non-positive bet", () => {
    expect(valueBluffRatio({ pot: 100, bet: 0 })).toBeNull();
  });
});
