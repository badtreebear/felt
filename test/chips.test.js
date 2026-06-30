import { describe, expect, it } from "vitest";
import { shouldShowMathsPanel, engineTipText } from "../src/ui/chips.js";
import { getSeatPositions } from "../src/engine/positions.js";

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


describe("engine tip — preflop first-in vs facing a raise", () => {
  // Builds a minimal state heroEngineTip/engineTipText can read. Hero is in the
  // LJ first-in with ATo; the maths layer reports a -EV "call" verdict (24% eq).
  function state({ voluntaryRaiserSeat = null, toCall = 1 } = {}) {
    const players = 6;
    const buttonSeat = 0;
    const heroSeat = 4; // LJ-ish early seat in 6-max
    const positions = getSeatPositions({ players, buttonSeat });
    return {
      config: { players, heroSeat },
      ui: {},
      maths: {
        heroEquity: 0.24,
        requiredEquity: 0.29,
        evCall: -34.7,
        verdict: "fold",
      },
      hand: {
        street: "preflop",
        toCall,
        buttonSeat,
        holeCards: { [heroSeat]: ["Ah", "Td"] },
        preflop: {
          status: "waitingHero",
          positions,
          voluntaryRaiserSeat,
          aggressorSeat: voluntaryRaiserSeat,
          raiseCount: voluntaryRaiserSeat === null ? 0 : 1,
          currentBet: toCall,
          contributions: { 0: 0, 1: 0.5, 2: voluntaryRaiserSeat === 2 ? 2.5 : 0, 3: 0, 4: 0, 5: 0 },
          effectiveStackBb: 100,
          actionLog: voluntaryRaiserSeat === null
            ? []
            : [{ seat: voluntaryRaiserSeat, street: "preflop", action: "raises to", size: 2.5 }],
        },
      },
    };
  }

  it("does NOT show a 'calling is fold' pot-odds line when first-in (unopened)", () => {
    const text = engineTipText(state({ voluntaryRaiserSeat: null, toCall: 1 }));
    expect(text.toLowerCase()).not.toContain("calling is");
    expect(text.toLowerCase()).not.toContain("pot odds");
    // It should still surface the chart's open recommendation.
    expect(text.toLowerCase()).toContain("raise");
  });

  it("DOES show the pot-odds detail when genuinely facing a raise", () => {
    const text = engineTipText(state({ voluntaryRaiserSeat: 2, toCall: 3 }));
    expect(text.toLowerCase()).toContain("calling is");
  });
});
