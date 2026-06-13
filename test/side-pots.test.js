import { describe, expect, it } from "vitest";
import { buildSidePots, splitAmount } from "../src/engine/postflop-action.js";

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

describe("buildSidePots", () => {
  it("makes a single pot when everyone contributes equally", () => {
    const pots = buildSidePots({ 0: 10, 1: 10, 2: 10 }, {}, 3);

    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(30);
    expect(pots[0].eligible.sort()).toEqual([0, 1, 2]);
  });

  it("splits into a main pot and a side pot for a short all-in", () => {
    // Seat 0 is all-in for 10; seats 1 and 2 commit 30 each.
    const pots = buildSidePots({ 0: 10, 1: 30, 2: 30 }, {}, 3);

    expect(pots).toHaveLength(2);
    // Main pot: 10 from all three.
    expect(pots[0].amount).toBe(30);
    expect(pots[0].eligible.sort()).toEqual([0, 1, 2]);
    // Side pot: extra 20 from seats 1 and 2 only.
    expect(pots[1].amount).toBe(40);
    expect(pots[1].eligible.sort()).toEqual([1, 2]);
    // Chip conservation.
    expect(sum(pots.map((pot) => pot.amount))).toBe(70);
  });

  it("keeps a folded player's chips as dead money they cannot win", () => {
    // Seat 0 put in 10 then folded; seats 1 and 2 commit 30 each.
    const pots = buildSidePots({ 0: 10, 1: 30, 2: 30 }, { 0: true }, 3);

    expect(pots[0].amount).toBe(30); // includes seat 0's dead 10
    expect(pots[0].eligible.sort()).toEqual([1, 2]); // seat 0 can't win
    expect(sum(pots.map((pot) => pot.amount))).toBe(70);
  });

  it("conserves chips across a three-way different-stack all-in", () => {
    const contributions = { 0: 15, 1: 40, 2: 100 };
    const pots = buildSidePots(contributions, {}, 3);

    expect(sum(pots.map((pot) => pot.amount))).toBe(155);
    // Last layer (above 40) is only contestable by the deepest seat.
    const deepestPot = pots[pots.length - 1];
    expect(deepestPot.eligible).toEqual([2]);
  });
});

describe("splitAmount", () => {
  it("splits evenly to the half-chip", () => {
    expect(splitAmount(30, [0, 1])).toEqual({ 0: 15, 1: 15 });
  });

  it("gives the odd half-chip to the first listed winner", () => {
    const split = splitAmount(15, [0, 1]);
    expect(split[0]).toBe(7.5);
    expect(split[1]).toBe(7.5);
    expect(split[0] + split[1]).toBe(15);
  });

  it("returns nothing when there are no winners", () => {
    expect(splitAmount(20, [])).toEqual({});
  });
});
