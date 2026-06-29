import { describe, expect, it } from "vitest";
import { scorePostflopEvDecision, scorePostflopSizing } from "../src/tracker/postflop-leaks.js";

// Regression coverage for the tournament chips <-> bb bug: the tracker computes
// in chips, but labels and EV reads must be denominated in big blinds. With a
// 200-chip big blind a 2,838-chip call is 14.2bb, NOT 2,838bb, and a -2,400-chip
// EV is -12bb, NOT -2,400bb.

const BB = 200;

const evPostflop = (overrides = {}) => ({
  status: "waitingHero",
  heroSeat: 0,
  street: "turn",
  positions: { 0: "BB" },
  holeCards: { 0: ["7d", "2c"] },
  ...overrides,
});

const sizingPostflop = (overrides = {}) => ({
  status: "waitingHero",
  heroSeat: 0,
  street: "flop",
  pot: 4000,
  positions: { 0: "BTN" },
  stacks: { 0: 20000 },
  holeCards: { 0: ["As", "Ks"] },
  ...overrides,
});

describe("scorePostflopEvDecision — tournament blind conversion", () => {
  it("labels the spot in bb (and chips), not chips-as-bb", () => {
    const decision = scorePostflopEvDecision({
      postflop: evPostflop(),
      action: "call",
      evaluation: { evCall: -2400, equity: 0.2, requiredEquity: 0.35, toCall: 2838 },
      bb: BB,
    });

    // 2838 / 200 = 14.19 -> 14.2bb. Mirrors the seat convention "chips · Xbb".
    expect(decision.spot).toBe("BB turn facing 2,838 · 14.2bb");
    expect(decision.spot).not.toContain("2838 bb");
  });

  it("reports the EV cost in bb, not chips", () => {
    const decision = scorePostflopEvDecision({
      postflop: evPostflop(),
      action: "call",
      evaluation: { evCall: -2400, equity: 0.2, requiredEquity: 0.35, toCall: 2838 },
      bb: BB,
    });

    // -2400 / 200 = -12bb (was reported as -2400.4bb before the fix).
    expect(decision.evCall).toBe(-12);
    expect(decision.costBb).toBe(12);
    expect(decision.leak).toBe(true);
  });

  it("is unchanged in cash mode (bb defaults to 1, chips == bb)", () => {
    const decision = scorePostflopEvDecision({
      postflop: evPostflop({ street: "flop" }),
      action: "call",
      evaluation: { evCall: -1.5, equity: 0.3, requiredEquity: 0.4, toCall: 8 },
    });

    expect(decision.spot).toBe("BB flop facing 8 bb");
    expect(decision.evCall).toBe(-1.5);
    expect(decision.costBb).toBe(1.5);
  });
});

describe("scorePostflopSizing — tournament blind conversion", () => {
  it("labels a bet in bb (and chips)", () => {
    const decision = scorePostflopSizing({
      postflop: sizingPostflop(),
      action: "bet",
      committed: 8000,
      allIn: false,
      commitmentEval: { equity: 0.35, evCall: -1000 },
      board: ["Ah", "9h", "2h"],
      bb: BB,
    });

    // 8000 / 200 = 40bb; -1000 / 200 = -5bb.
    expect(decision.spot).toBe("BTN flop bet 8,000 · 40bb");
    expect(decision.leakType).toBe("overvalued your hand");
    expect(decision.costBb).toBe(5);
  });

  it("converts the all-in 'got it in light' EV to bb", () => {
    const decision = scorePostflopSizing({
      postflop: sizingPostflop(),
      action: "bet",
      committed: 20000,
      allIn: true,
      commitmentEval: { equity: 0.3, evCall: -1400 },
      board: ["Ah", "9h", "2h"],
      bb: BB,
    });

    expect(decision.leakType).toBe("got it in light");
    expect(decision.costBb).toBe(7); // -1400 / 200
  });
});
