import { describe, expect, it } from "vitest";
import { winnerSeatsForBadges } from "../src/ui/table.js";

describe("winnerSeatsForBadges", () => {
  it("uses only terminal engine chip winners for showdown badges", () => {
    const state = tableState({
      postflop: {
        status: "complete",
        result: "showdown",
        winnerSeat: 2,
        winnerSeats: [2],
      },
    });

    expect(winnerSeatsForBadges(state)).toEqual([2]);
  });

  it("does not show stale winner seats before a hand is terminal", () => {
    const state = tableState({
      postflop: {
        status: "streetComplete",
        result: "nextStreet",
        winnerSeat: 1,
        winnerSeats: [1],
      },
    });

    expect(winnerSeatsForBadges(state)).toEqual([]);
  });

  it("keeps preflop uncontested winners eligible for badges", () => {
    const state = tableState({
      postflop: null,
      preflop: {
        status: "complete",
        result: "winner",
        winnerSeat: 0,
        winnerSeats: [],
      },
    });

    expect(winnerSeatsForBadges(state)).toEqual([0]);
  });
});

function tableState({ preflop = null, postflop = null }) {
  return {
    hand: {
      street: postflop ? "showdown" : "preflop",
      preflop,
      postflop,
    },
  };
}
