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
      grade: "fail",
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
    expect(result.grade).toBe("neutral");
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
    expect(result.grade).toBe("fail");
    expect(result.evDeltaBb).toBe(-0.4);
    expect(result.reason).toBe("defended too wide");
  });

  it("grades a chart leak as fail even when the EV estimate rounds to 0", () => {
    // The 97o-call bug: a real chart deviation that came through with costBb 0
    // must still count as a Leak (fail), so the scoreboard and the 'missed'
    // line agree instead of showing OK + 'missed'.
    const result = normaliseDecision({
      street: "preflop",
      spot: "BTN vs CO open - defend",
      rangeKind: "vsRfi",
      hand: "97o",
      heroAction: "call",
      recommended: "fold",
      leak: true,
      leakType: "defended too wide",
      costBb: 0,
    });

    expect(result.matched).toBe(false);
    expect(result.grade).toBe("fail");
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
    expect(result.grade).toBe("good");
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
  it("grades a no-cost 'review' bet as neutral (not a leak) and surfaces the reason", () => {
    // Regression: a review sizing sets leak:true but costBb:0 -- the tracker's
    // intent is "flag neutrally, no cost". It must NOT read as a missed/failed
    // decision. matched stays true (no EV lost) and grade is neutral.
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

    expect(result.matched).toBe(true);
    expect(result.grade).toBe("neutral");
    expect(result.evDeltaBb).toBe(0);
    expect(result.reason).toBe("oversized bet (review)");
  });

  it("grades a small-bet blocker review (the live-grading bug) as neutral, not a leak", () => {
    // The exact shape behind the 63o min-bet that wrongly counted as a miss:
    // leak:true, costBb:0, EV 0.0.
    const result = normaliseDecision({
      street: "turn",
      spot: "BB turn bet 200 / 1bb",
      hand: "63o",
      heroAction: "bet",
      recommended: "small bet -- size up only if ahead",
      leak: true,
      leakType: "small bet (review)",
      evCall: 0,
      costBb: 0,
    });

    expect(result.matched).toBe(true);
    expect(result.grade).toBe("neutral");
    expect(result.evDeltaBb).toBe(0);
  });

  it("grades a sizing decision in range as neutral with zero delta", () => {
    const result = normaliseDecision({
      street: "flop",
      spot: "CO flop bet 6 bb",
      hand: "AKo",
      heroAction: "bet",
      recommended: "bet",
      leak: false,
      good: false,
      leakType: "reasonable sizing",
    });

    expect(result.matched).toBe(true);
    expect(result.grade).toBe("neutral");
    expect(result.evDeltaBb).toBe(0);
  });

  it("still grades a real EV-cost commitment leak as a fail", () => {
    const result = normaliseDecision({
      street: "turn",
      spot: "CO turn bet 30 bb",
      hand: "KQo",
      heroAction: "bet",
      recommended: "pot control - respect the board",
      leak: true,
      leakType: "overvalued your hand",
      evCall: -2.4,
      costBb: 2.4,
    });

    expect(result.matched).toBe(false);
    expect(result.grade).toBe("fail");
    expect(result.evDeltaBb).toBe(-2.4);
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

describe("normaliseDecision — all-in commitment routing (got it in good/light)", () => {
  it("treats a good all-in ('got it in good') as a matched WIN, not a negative miss", () => {
    // Regression: this decision carries an evCall (the +EV of getting it in), so
    // the old code misrouted it into the call/fold path and showed it as a
    // '-56.5bb miss'. It is a good play: matched, zero deviation, positive benefit.
    const result = normaliseDecision({
      street: "turn",
      spot: "HJ turn bet 4,342.5 · 21.7bb",
      hand: "A7s",
      heroAction: "bet",
      recommended: "keep getting it in",
      leak: false,
      good: true,
      leakType: "got it in good",
      evCall: 56.5,
      benefitBb: 56.5,
    });

    expect(result.matched).toBe(true);
    expect(result.grade).toBe("good");
    expect(result.evDeltaBb).toBe(0);          // not -56.5
    expect(result.benefitBb).toBe(56.5);       // value shown as a positive benefit
    expect(result.reason).toBe("got it in good");
  });

  it("treats a bad all-in ('got it in light') as a leak with a negative delta", () => {
    const result = normaliseDecision({
      street: "turn",
      spot: "HJ turn bet 20,000 · 100bb",
      hand: "A7s",
      heroAction: "bet",
      recommended: "pot control / fold",
      leak: true,
      good: false,
      leakType: "got it in light",
      evCall: -7,
    });

    expect(result.matched).toBe(false);
    expect(result.evDeltaBb).toBe(-7);
    expect(result.reason).toBe("got it in light");
  });

  it("still routes an actual call/fold decision through the EV-call path", () => {
    const result = normaliseDecision({
      street: "river",
      spot: "BB river facing 8 bb",
      hand: "72o",
      heroAction: "call",
      recommended: "fold",
      leak: true,
      leakType: "called -EV (paid off)",
      evCall: -1.5,
    });
    expect(result.matched).toBe(false);
    expect(result.evDeltaBb).toBe(-1.5);
    expect(result.reason).toBe("called -EV (paid off)");
  });
});
