import { describe, expect, it } from "vitest";
import { getSeatPositions, positionToRfiLabel, rangeBucketForPlayers } from "../src/engine/positions.js";

describe("positions", () => {
  it("assigns 6-max labels clockwise from the button", () => {
    expect(getSeatPositions({ players: 6, buttonSeat: 2 })).toEqual({
      0: "HJ",
      1: "CO",
      2: "BTN",
      3: "SB",
      4: "BB",
      5: "LJ",
    });
  });

  it("assigns 9-max labels with early and late position names", () => {
    expect(getSeatPositions({ players: 9, buttonSeat: 0 })).toEqual({
      0: "BTN",
      1: "SB",
      2: "BB",
      3: "UTG",
      4: "UTG+1",
      5: "UTG+2",
      6: "LJ",
      7: "HJ",
      8: "CO",
    });
  });

  it("maps table positions to RFI chart labels in one lookup", () => {
    expect(positionToRfiLabel("UTG+2")).toBe("UTG+2");
    expect(positionToRfiLabel("LJ")).toBe("LJ");
    expect(positionToRfiLabel("BTN")).toBe("BTN");
    expect(positionToRfiLabel("SB")).toBeNull();
    expect(positionToRfiLabel("BB")).toBeNull();
    expect(positionToRfiLabel("BTN/SB")).toBeNull();
  });

  it("uses 6-max buckets up to six seats and 9-max above that", () => {
    expect(rangeBucketForPlayers(6)).toBe("6max");
    expect(rangeBucketForPlayers(7)).toBe("9max");
  });
});
