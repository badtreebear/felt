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

  it("reveals the maths layer whenever the Maths toggle is on, even with no bet faced", () => {
    expect(shouldShowMathsPanel({
      ui: { spotMode: "dealt", showMaths: true },
      hand: { toCall: 0 },
    })).toBe(true);

    expect(shouldShowMathsPanel({
      ui: { spotMode: "dealt", showMaths: false },
      hand: { toCall: 0 },
    })).toBe(false);
  });
});
