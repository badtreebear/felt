import { describe, expect, it } from "vitest";
import { callVerdict, evCall, evFold } from "../src/engine/ev.js";
import { requiredEquity } from "../src/engine/potodds.js";

describe("EV", () => {
  it("breaks even at the required equity threshold", () => {
    const pot = 24;
    const toCall = 8;

    expect(evCall({ equity: requiredEquity(pot, toCall), pot, toCall })).toBeCloseTo(0, 6);
  });

  it("marks calls profitable above the threshold", () => {
    expect(evCall({ equity: 0.41, pot: 24, toCall: 8 })).toBeCloseTo(8.4, 6);
    expect(callVerdict({ equity: 0.41, pot: 24, toCall: 8 })).toBe("call");
  });

  it("keeps folding at zero EV", () => {
    expect(evFold()).toBe(0);
    expect(callVerdict({ equity: 0.1, pot: 24, toCall: 8 })).toBe("fold");
  });
});
