import { describe, expect, it } from "vitest";
import {
  expandPositionRange,
  getChartPositionRange,
  handKeyToCombos,
  rangeToGrid,
  validateRangeChart,
} from "../src/engine/ranges.js";
import placeholderChart from "../src/data/ranges/placeholder-9max.json";

describe("range loader", () => {
  it("validates the placeholder chart schema", () => {
    expect(() => validateRangeChart(placeholderChart)).not.toThrow();
  });

  it("rejects malformed files with useful errors", () => {
    expect(() => validateRangeChart({ positions: {} })).toThrow("missing meta");
    expect(() => validateRangeChart({
      meta: {
        source: "bad",
        url: "bad",
        tableSize: 6,
        transcribedBy: "test",
        date: "2026-06-13",
      },
      positions: { UTG: { AXs: 1 } },
    })).toThrow("Unknown hand key");
    expect(() => validateRangeChart({
      meta: {
        source: "bad",
        url: "bad",
        tableSize: 6,
        transcribedBy: "test",
        date: "2026-06-13",
      },
      positions: { UTG: { AA: 1.5 } },
    })).toThrow("must be from 0 to 1");
  });

  it("expands canonical hand keys into concrete combo counts", () => {
    expect(handKeyToCombos("AA")).toHaveLength(6);
    expect(handKeyToCombos("AKs")).toHaveLength(4);
    expect(handKeyToCombos("AKo")).toHaveLength(12);
  });

  it("expands a loaded position range and renders a 13x13 grid", () => {
    const buttonRange = getChartPositionRange(placeholderChart, "BTN");
    const combos = expandPositionRange(buttonRange);
    const grid = rangeToGrid(buttonRange);

    expect(combos.length).toBeGreaterThan(0);
    expect(grid).toHaveLength(13);
    expect(grid.every((row) => row.length === 13)).toBe(true);
  });
});
