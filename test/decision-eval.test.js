import { describe, expect, it } from "vitest";
import { normaliseDecision } from "../src/engine/decision-eval.js";

describe("normaliseDecision — preflop", () => {
  it("flags an RFI leak with a negative EV delta and carries the leak reason", () => {
    const result = normaliseDecision({
      street: "preflop",
      spot: "CO preflop",
      rangeKind: "rfi",
      hand: "AA",
      heroAction: "fold",
      recommended: "raise",
      leak: true,
      leakType: "open-folded too tight",
      costBb: 1.2,
    });

    expect(result).toEqual({
      street: "preflop",
      spot: "CO preflop",
      hand: "AA",
      heroAction: "fold",
      recommended: "raise",
      matched: false,
      evDeltaBb: -1.2,
      reason: "open-folded too tight",
      rangeKind: "rfi",
    });
  });

  it("treats a matched preflop play as zero EV delta and no reason", () => {
    const result = normaliseDecision({
      street: "preflop",
      spot: "CO preflop",
      rangeKind: "rfi",
      hand: "AA",
      heroAction: "raise",
      recommended: "raise",
      leak: false,
    });

    expect(result.matched).toBe(true);
    expect(result.evDeltaBb).toBe(0);
    expect(result.reason).toBeNull();
  });

  it("flips vs-RFI cost to a negative delta when the hero over-defended", () => {
    const result = normaliseDecision({
      street: "preflop",
      spot: "BB vs BTN open",
      rangeKind: "vsRfi",
      hand: "72o",
      heroAction: "call",
      recommended: "fold",
      leak: true,
      leakType: "defended too wide",
      costBb: 0.4,
    });

    expect(result.matched).toBe(false);
    expect(result.evDeltaBb).toBe(-0.4);
    expect(result.reason).toBe("defended too wide");
  });
});

describe("normaliseDecision — postflop EV (call/fold)", () => {
  it("produces a negative delta for a bad call (called -EV)", () => {
    const result = normaliseDecision({
      street: "flop",
      spot: "BB flop facing 8 bb",
      hand: "72o",
      heroAction: "call",
      recommended: "fold",
      leak: true,
      good: false,
      leakType: "called -EV (paid off)",
      evCall: -1.5,
      costBb: 1.5,
    });

    expect(result.matched).toBe(false);
    expect(result.evDeltaBb).toBe(-1.5);
    expect(result.reason).toBe("called -EV (paid off)");
  });

  it("treats a good fold as zero EV delta (no deviation from best)", () => {
    const result = normaliseDecision({
      street: "flop",
      spot: "BB flop facing 8 bb",
      hand: "72o",
      heroAction: "fold",
      recommended: "fold",
      leak: false,
      good: true,
      leakType: "good fold",
      evCall: -0.3,
      benefitBb: 0.3,
    });

    expect(result.matched).toBe(true);
    expect(result.evDeltaBb).toBe(0);
    expect(result.reason).toBeNull();
  });

  it("rounds the EV delta to the nearest 0.1bb", () => {
    const result = normaliseDecision({
      street: "turn",
      spot: "HJ turn facing 12 bb",
      hand: "AQo",
      heroAction: "call",
      recommended: "fold",
      leak: true,
      leakType: "called -EV (paid off)",
      evCall: -1.27,
    });

    expect(result.evDeltaBb).toBe(-1.3);
  });
});

describe("normaliseDecision — postflop sizing", () => {
  it("keeps evDeltaBb at 0 for an oversized bet and surfaces the leak reason", () => {
    const result = normaliseDecision({
      street: "flop",
      spot: "CO flop bet 18 bb",
      hand: "AKo",
      heroAction: "bet",
      recommended: "smaller sizing",
      leak: true,
      leakType: "oversized bet (review)",
      costBb: 0,
    });

    expect(result.matched).toBe(false);
    expect(result.evDeltaBb).toBe(0);
    expect(result.reason).toBe("oversized bet (review)");
  });

  it("treats a sizing decision in range as matched and zero delta", () => {
    const result = normaliseDecision({
      street: "flop",
      spot: "CO flop bet 6 bb",
      hand: "AKo",
      heroAction: "bet",
      recommended: "bet",
    });

    expect(result.matched).toBe(true);
    expect(result.evDeltaBb).toBe(0);
  });
});

describe("normaliseDecision — unknown / no chart", () => {
  it("returns matched=null and reason='no chart' when there is no recommendation", () => {
    const result = normaliseDecision({
      street: "preflop",
      spot: "BB preflop",
      rangeKind: "fallback",
      hand: "72o",
      heroAction: "raise",
      recommended: "unknown",
    });

    expect(result.matched).toBeNull();
    expect(result.evDeltaBb).toBe(0);
    expect(result.reason).toBe("no chart");
  });

  it("handles a missing decision defensively", () => {
    expect(normaliseDecision(null)).toBeNull();
    expect(normaliseDecision({})).toMatchObject({
      matched: null,
      evDeltaBb: 0,
      reason: "no chart",
    });
  });
});
