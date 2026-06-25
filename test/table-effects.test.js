import { describe, expect, it } from "vitest";
import { tableSnapshot, computeTableEffects } from "../src/ui/effects/table-effects.js";

const snap = (overrides = {}) => ({
  handId: "seed-1",
  street: "flop",
  board: ["Ah", "Kd", "7c"],
  contrib: { 0: 0, 1: 0 },
  pot: 20,
  status: "waitingHero",
  winnerSeats: [],
  ...overrides,
});

const types = (effects) => effects.map((e) => e.type);

describe("computeTableEffects", () => {
  it("emits a hole-card deal on a new hand", () => {
    const next = snap({ handId: "seed-2", street: "preflop", board: [] });
    expect(computeTableEffects(null, next)).toEqual([{ type: "deal-hole" }]);
    expect(computeTableEffects(snap(), next)).toEqual([{ type: "deal-hole" }]);
  });

  it("emits nothing when nothing changed", () => {
    expect(computeTableEffects(snap(), snap())).toEqual([]);
  });

  it("emits a chip-bet with the per-seat delta on the same street", () => {
    const effects = computeTableEffects(snap(), snap({ contrib: { 0: 5, 1: 0 } }));
    expect(effects).toEqual([{ type: "chip-bet", seat: 0, amount: 5 }]);
  });

  it("burns and deals the new community cards when the board grows", () => {
    const prev = snap();
    const next = snap({ street: "turn", board: ["Ah", "Kd", "7c", "2s"], contrib: { 0: 0, 1: 0 } });
    expect(types(computeTableEffects(prev, next))).toEqual(["burn", "deal-board"]);
    const deal = computeTableEffects(prev, next).find((e) => e.type === "deal-board");
    expect(deal.cards).toEqual(["2s"]);
  });

  it("sweeps to the pot when the street advances with chips out", () => {
    const prev = snap({ contrib: { 0: 8, 1: 8 } });
    const next = snap({ street: "turn", board: ["Ah", "Kd", "7c", "2s"], contrib: { 0: 0, 1: 0 } });
    const effects = computeTableEffects(prev, next);
    expect(effects[0]).toEqual({ type: "chip-sweep", amount: 16 });
    expect(types(effects)).toContain("deal-board");
    // No false chip-bet across a street change.
    expect(types(effects)).not.toContain("chip-bet");
  });

  it("awards the pot once when winners appear", () => {
    const prev = snap();
    const next = snap({ status: "complete", winnerSeats: [0, 1], pot: 20 });
    expect(computeTableEffects(prev, next)).toEqual([
      { type: "pot-award", seats: [0, 1], amount: 20 },
    ]);
    // Stable winners → not re-emitted.
    expect(computeTableEffects(next, next)).toEqual([]);
  });

  it("is deterministic for the same transition", () => {
    const prev = snap();
    const next = snap({ contrib: { 0: 12, 1: 0 } });
    expect(computeTableEffects(prev, next)).toEqual(computeTableEffects(prev, next));
  });
});

describe("tableSnapshot", () => {
  it("reads the postflop phase contributions, board, and pot", () => {
    const state = {
      hand: {
        seed: "s",
        street: "flop",
        board: ["Ah", "Kd", "7c"],
        pot: 30,
        postflop: { status: "waitingHero", streetContributions: { 0: 4, 1: 0 }, winnerSeats: [] },
      },
    };
    expect(tableSnapshot(state)).toEqual({
      handId: "s",
      street: "flop",
      board: ["Ah", "Kd", "7c"],
      contrib: { 0: 4, 1: 0 },
      pot: 30,
      status: "waitingHero",
      winnerSeats: [],
    });
  });

  it("is null without a hand", () => {
    expect(tableSnapshot({})).toBeNull();
  });
});
