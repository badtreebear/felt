import { describe, expect, it } from "vitest";
import { shouldShowMathsPanel } from "../src/ui/chips.js";

describe("maths chips visibility", () => {
  it("shows the equity and EV panel only for manual spots with a bet faced", () => {
    expect(shouldShowMathsPanel({
      ui: { spotMode: "dealt" },
      hand: { toCall: 8 },
    })).toBe(false);

    expect(shouldShowMathsPanel({
      ui: { spotMode: "manual" },
      hand: { toCall: 0 },
    })).toBe(false);

    expect(shouldShowMathsPanel({
      ui: { spotMode: "manual" },
      hand: { toCall: 8 },
    })).toBe(true);
  });
});
