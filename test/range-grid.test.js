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

    expect(range.source).toContain("Standard 100bb preflop ranges");
    expect(range.isPlaceholder).toBe(false);
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

  it("uses the shipped 6-max SB opening chart when first in", () => {
    const smallBlind = getOpeningRange({ players: 6, position: "SB" });

    expect(smallBlind.chartAvailable).toBe(true);
    expect(smallBlind.tableSize).toBe(6);
    expect(smallBlind.position).toBe("SB");
    expect(smallBlind.combos).toHaveLength(838);
  });

  it("describes action-valued cells for defend charts", () => {
    const grid = Array.from({ length: 13 }, () => Array.from({ length: 13 }, () => null));
    grid[0][0] = { action: "threeBetValue", weight: 1 };

    expect(heroRangeVerdict(["Ah", "Ad"], grid).status).toBe("3-bet for value");
  });

  it("describes action-valued cells for 4-bet continuation charts", () => {
    const grid = Array.from({ length: 13 }, () => Array.from({ length: 13 }, () => null));
    grid[0][0] = { action: "fourBetValue", weight: 1 };

    expect(heroRangeVerdict(["Ah", "Ad"], grid).status).toBe("4-bet for value");
  });

  it("resolves SB at a full ring and leaves BB as the only no-RFI blind", () => {
    const smallBlind = getOpeningRange({ players: 9, position: "SB" });
    const bigBlind = getOpeningRange({ players: 9, position: "BB" });

    // SB now has a dedicated opening chart at every table size (was a gap before).
    expect(smallBlind.chartAvailable).toBe(true);
    expect(smallBlind.position).toBe("SB");
    expect(smallBlind.grid).not.toBeNull();

    // BB is never an RFI spot; the contextual layer handles its walk/defense.
    expect(bigBlind.chartAvailable).toBe(false);
    expect(bigBlind.message).toContain("No RFI chart");
  });
});
