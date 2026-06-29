import { describe, it, expect } from "vitest";
import { heroOuts } from "../src/engine/outs.js";

describe("heroOuts", () => {
  it("counts cards that pair a hole card and excludes board pairs", () => {
    // Ace-high, no draw. Outs = pair the A (3) or the 2 (3). Pairing the board
    // (K / 9 / 4) must NOT count — that pair is shared, not the hero's.
    const r = heroOuts({ holeCards: ["Ah", "2c"], board: ["Kd", "9s", "4h"] });
    expect(r.cardsToCome).toBe(2);
    expect(r.outs).toBe(6);
    expect(r.improvePct).toBe(24); // rule of 4: 6 * 4
  });

  it("counts a flush draw's outs and applies the rule of 4 on the flop", () => {
    const r = heroOuts({ holeCards: ["Ad", "Kd"], board: ["Qd", "7d", "2c"] });
    expect(r.cardsToCome).toBe(2);
    expect(r.outs).toBeGreaterThanOrEqual(9); // at least the 9 remaining diamonds
    expect(r.improvePct).toBe(Math.min(100, r.outs * 4));
  });

  it("uses the rule of 2 on the turn", () => {
    const r = heroOuts({ holeCards: ["Ad", "Kd"], board: ["Qd", "7d", "2c", "9s"] });
    expect(r.cardsToCome).toBe(1);
    expect(r.improvePct).toBe(Math.min(100, r.outs * 2));
  });

  it("has no outs preflop or on the river", () => {
    expect(heroOuts({ holeCards: ["Ad", "Kd"], board: [] }).cardsToCome).toBe(0);
    expect(heroOuts({ holeCards: ["Ad", "Kd"], board: ["Qd", "7d", "2c", "9s", "3h"] }).cardsToCome).toBe(0);
  });
});
