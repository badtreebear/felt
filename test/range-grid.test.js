import { describe, expect, it } from "vitest";
import { getOpeningRange } from "../src/data/ranges/opening-ranges.js";
import { handCell, heroRangeVerdict, rangeCellLabel } from "../src/ui/range-grid.js";

describe("range grid", () => {
  it("maps pairs, suited hands, and offsuit hands to canonical cells", () => {
    expect(rangeCellLabel(handCell(["As", "Ah"]).row, handCell(["As", "Ah"]).column)).toBe("AA");
    expect(rangeCellLabel(handCell(["As", "Ks"]).row, handCell(["As", "Ks"]).column)).toBe("AKs");
    expect(rangeCellLabel(handCell(["As", "Kd"]).row, handCell(["As", "Kd"]).column)).toBe("AKo");
  });

  it("marks a premium hero hand in range for UTG", () => {
    const range = getOpeningRange({ players: 9, position: "UTG" });

    expect(heroRangeVerdict(["Ah", "Ad"], range.grid).status).toBe("in range");
    expect(heroRangeVerdict(["7c", "2d"], range.grid).status).toBe("not in range");
  });

  it("returns 13 by 13 grids for both range buckets", () => {
    const sixMax = getOpeningRange({ players: 6, position: "CO" });
    const nineMax = getOpeningRange({ players: 9, position: "UTG+1" });

    expect(sixMax.grid).toHaveLength(13);
    expect(sixMax.grid.every((row) => row.length === 13)).toBe(true);
    expect(nineMax.grid).toHaveLength(13);
    expect(nineMax.grid.every((row) => row.length === 13)).toBe(true);
  });
});
