import { describe, expect, it } from "vitest";
import { finalPotAfterCall, potOdds, requiredEquity } from "../src/engine/potodds.js";

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
