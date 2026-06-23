import { describe, expect, it } from "vitest";
import { villainRangeGridsForSpot } from "../src/engine/postflop-ev.js";

// A 3-handed spot: hero on the BTN, one live villain in the CO, one folded.
const postflop = {
  players: 3,
  heroSeat: 0,
  folded: { 2: true },
  positions: { 0: "BTN", 1: "CO", 2: "HJ" },
  seatProfiles: { 1: "standard", 2: "standard" },
};

describe("villainRangeGridsForSpot", () => {
  it("returns one entry per live, non-hero villain", () => {
    const grids = villainRangeGridsForSpot(postflop);
    expect(grids).toHaveLength(1);
    expect(grids[0]).toMatchObject({ seat: 1, position: "CO", profile: "standard" });
  });

  it("yields a 13x13 weight grid with hands in range", () => {
    const [villain] = villainRangeGridsForSpot(postflop);
    expect(villain.grid).toHaveLength(13);
    villain.grid.forEach((row) => expect(row).toHaveLength(13));

    const inRange = villain.grid.flat().filter((weight) => weight > 0).length;
    expect(inRange).toBeGreaterThan(0); // a CO opening range is not empty
  });

  it("is safe with no postflop state", () => {
    expect(villainRangeGridsForSpot(null)).toEqual([]);
    expect(villainRangeGridsForSpot({ players: 0 })).toEqual([]);
  });
});
