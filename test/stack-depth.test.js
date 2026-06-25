import { describe, expect, it } from "vitest";
import {
  effectiveStackBb,
  openDepth,
  isPushFoldDepth,
  PUSHFOLD_MAX_BB,
  SHALLOW_MAX_BB,
} from "../src/engine/stack-depth.js";

describe("effectiveStackBb", () => {
  it("uses the shortest live stack divided by the big blind", () => {
    expect(effectiveStackBb({ stacks: { 0: 100, 1: 40 }, bb: 2 })).toBe(20);
    expect(effectiveStackBb({ stacks: { 0: 30, 1: 200 }, bb: 2 })).toBe(15);
  });

  it("ignores busted/zero stacks", () => {
    expect(effectiveStackBb({ stacks: { 0: 0, 1: 80 }, bb: 2 })).toBe(40);
  });

  it("can be limited to specific seats", () => {
    expect(effectiveStackBb({ stacks: { 0: 100, 1: 40, 2: 10 }, bb: 2, seats: [0, 1] })).toBe(20);
  });

  it("returns null when it cannot be computed", () => {
    expect(effectiveStackBb({ stacks: {}, bb: 2 })).toBeNull();
    expect(effectiveStackBb({ stacks: { 0: 100 }, bb: 0 })).toBeNull();
    expect(effectiveStackBb({})).toBeNull();
  });

  it("rounds to one decimal", () => {
    expect(effectiveStackBb({ stacks: { 0: 25 }, bb: 3 })).toBe(8.3);
  });
});

describe("openDepth", () => {
  it("classifies by the bb thresholds", () => {
    expect(openDepth(8)).toBe("pushfold");
    expect(openDepth(PUSHFOLD_MAX_BB)).toBe("pushfold");
    expect(openDepth(PUSHFOLD_MAX_BB + 0.1)).toBe("shallow");
    expect(openDepth(SHALLOW_MAX_BB)).toBe("shallow");
    expect(openDepth(SHALLOW_MAX_BB + 0.1)).toBe("deep");
    expect(openDepth(100)).toBe("deep");
  });

  it("is 'unknown' without a value", () => {
    expect(openDepth(null)).toBe("unknown");
    expect(openDepth(undefined)).toBe("unknown");
    expect(openDepth(NaN)).toBe("unknown");
  });
});

describe("isPushFoldDepth", () => {
  it("is true only in push/fold territory", () => {
    expect(isPushFoldDepth(10)).toBe(true);
    expect(isPushFoldDepth(30)).toBe(false);
    expect(isPushFoldDepth(null)).toBe(false);
  });
});
