import { describe, expect, it } from "vitest";
import { boardForStreet, createDeck, dealHoldemHand, shuffleDeck } from "../src/engine/deck.js";

describe("deck", () => {
  it("creates 52 unique cards", () => {
    const deck = createDeck();

    expect(deck).toHaveLength(52);
    expect(new Set(deck)).toHaveLength(52);
  });

  it("shuffles deterministically from a seed", () => {
    expect(shuffleDeck(createDeck(), "phase-one")).toEqual(shuffleDeck(createDeck(), "phase-one"));
  });

  it("deals unique hole cards, board cards, and burn cards", () => {
    const hand = dealHoldemHand({ players: 6, heroSeat: 3, seed: "table-test" });
    const dealt = [
      ...Object.values(hand.holeCards).flat(),
      ...hand.boardRunout,
      ...hand.burnCards,
      ...hand.deck,
    ];

    expect(Object.keys(hand.holeCards)).toHaveLength(6);
    expect(hand.boardRunout).toHaveLength(5);
    expect(hand.burnCards).toHaveLength(3);
    expect(dealt).toHaveLength(52);
    expect(new Set(dealt)).toHaveLength(52);
  });

  it("reveals the board street by street", () => {
    const runout = ["As", "Kd", "7h", "2c", "9d"];

    expect(boardForStreet(runout, "preflop")).toEqual([]);
    expect(boardForStreet(runout, "flop")).toEqual(["As", "Kd", "7h"]);
    expect(boardForStreet(runout, "turn")).toEqual(["As", "Kd", "7h", "2c"]);
    expect(boardForStreet(runout, "river")).toEqual(runout);
    expect(boardForStreet(runout, "showdown")).toEqual(runout);
  });
});
