import { describe, expect, it } from "vitest";
import { resolveShowdown } from "../src/engine/hand-eval.js";

describe("resolveShowdown", () => {
  it("identifies the winning hand at showdown", () => {
    const showdown = resolveShowdown({
      board: ["2c", "3d", "4h", "5s", "9c"],
      holeCards: {
        0: ["Ah", "Kd"],
        1: ["Qh", "Qs"],
      },
    });

    expect(showdown.winnerSeats).toEqual([0]);
    expect(showdown.winningDescription.toLowerCase()).toContain("straight");
  });

  it("supports split pots", () => {
    const showdown = resolveShowdown({
      board: ["Ah", "Ad", "Ks", "Kc", "2d"],
      holeCards: {
        0: ["7s", "6s"],
        1: ["7h", "6h"],
      },
    });

    expect(showdown.winnerSeats).toEqual([0, 1]);
  });
});
