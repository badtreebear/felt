import { describe, expect, it } from "vitest";
import { getSeatPositions, rangeBucketForPlayers } from "../src/engine/positions.js";

describe("positions", () => {
  it("assigns 6-max labels clockwise from the button", () => {
    expect(getSeatPositions({ players: 6, buttonSeat: 2 })).toEqual({
      0: "MP",
      1: "CO",
      2: "BTN",
      3: "SB",
      4: "BB",
      5: "UTG",
    });
  });

  it("assigns 9-max labels with early and late position names", () => {
    expect(getSeatPositions({ players: 9, buttonSeat: 0 })).toEqual({
      0: "BTN",
      1: "SB",
      2: "BB",
      3: "UTG",
      4: "UTG+1",
      5: "LJ",
      6: "MP",
      7: "HJ",
      8: "CO",
    });
  });

  it("uses 6-max buckets up to six seats and 9-max above that", () => {
    expect(rangeBucketForPlayers(6)).toBe("6max");
    expect(rangeBucketForPlayers(7)).toBe("9max");
  });
});
