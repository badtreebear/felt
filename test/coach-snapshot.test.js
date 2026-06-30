import { describe, expect, it } from "vitest";
import { buildCoachSnapshot } from "../src/coach/snapshot.js";

describe("coach snapshot", () => {
  it("serializes the current hand and passes engine numbers through unchanged", () => {
    const state = {
      config: {
        players: 6,
        heroSeat: 3,
        blinds: { sb: 0.5, bb: 1 },
        seatProfiles: {
          4: "station",
        },
      },
      hand: {
        seed: "coach-seed",
        buttonSeat: 0,
        street: "turn",
        holeCards: {
          3: ["Ah", "6h"],
        },
        board: ["Kh", "9h", "2s", "Qc"],
        pot: 24,
        toCall: 8,
        actionLog: [
          { seat: 3, street: "preflop", action: "raises to", size: 2.5 },
          { seat: 4, street: "preflop", action: "calls", size: 2.5 },
        ],
      },
      maths: {
        heroEquity: 0.196,
        equityCI: 0.01,
        requiredEquity: 0.233,
        evCall: -2.52,
        verdict: "fold",
      },
    };

    const snapshot = buildCoachSnapshot(state, { recommendation: "Call — pot odds met." });

    expect(snapshot).toEqual({
      seed: "coach-seed",
      table: {
        players: 6,
        heroSeat: 3,
        heroPos: "LJ",
        blinds: [0.5, 1],
        effectiveStackBb: null,
      },
      street: "turn",
      hero: ["Ah", "6h"],
      board: ["Kh", "9h", "2s", "Qc"],
      pot: 24,
      toCall: 8,
      facingRaise: true,
      recommendation: "Call — pot odds met.",
      villains: [],
      actionLog: [
        "preflop: LJ(hero) raises to 2.5",
        "preflop: HJ(station) calls 2.5",
      ],
      engine: {
        equity: 0.196,
        ci: 0.01,
        requiredEquity: 0.233,
        evCall: -2.52,
        verdict: "fold",
      },
    });
  });

  it("marks a first-in preflop spot as facingRaise:false (raise-or-fold)", () => {
    const state = {
      config: { players: 6, heroSeat: 4, blinds: { sb: 0.5, bb: 1 }, seatProfiles: {} },
      hand: {
        seed: "s",
        buttonSeat: 0,
        street: "preflop",
        holeCards: { 4: ["Qs", "Tc"] },
        board: [],
        pot: 1.5,
        toCall: 1, // only the blind to complete
        actionLog: [],
        preflop: { status: "waitingHero", voluntaryRaiserSeat: null, effectiveStackBb: 100 },
      },
      maths: { heroEquity: 0.22, requiredEquity: 0.29, evCall: -46.7, verdict: "fold" },
    };

    const snapshot = buildCoachSnapshot(state, { recommendation: "Raise (open)." });
    expect(snapshot.facingRaise).toBe(false);
    expect(snapshot.recommendation).toBe("Raise (open).");
  });

  it("marks a facing-a-raise preflop spot as facingRaise:true", () => {
    const state = {
      config: { players: 6, heroSeat: 4, blinds: { sb: 0.5, bb: 1 }, seatProfiles: {} },
      hand: {
        seed: "s",
        buttonSeat: 0,
        street: "preflop",
        holeCards: { 4: ["Qs", "Tc"] },
        board: [],
        pot: 4,
        toCall: 2.5,
        actionLog: [],
        preflop: { status: "waitingHero", voluntaryRaiserSeat: 2, effectiveStackBb: 100 },
      },
      maths: { heroEquity: 0.4, requiredEquity: 0.3, evCall: 1.2, verdict: "call" },
    };

    const snapshot = buildCoachSnapshot(state, { recommendation: "Call." });
    expect(snapshot.facingRaise).toBe(true);
  });
});
