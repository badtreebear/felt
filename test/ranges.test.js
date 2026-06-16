import { describe, expect, it } from "vitest";
import {
  expandPositionRange,
  getChartPositionRange,
  handKeyToCombos,
  isCanonicalHandKey,
  RFI_POSITIONS_9MAX,
  rangeToGrid,
  validateRangeChart,
  validateRfiChart,
} from "../src/engine/ranges.js";
import placeholderChart from "../src/data/ranges/placeholder-9max.json";
import pokerCoachingRfiChart from "../src/data/ranges/default-rfi-9max.json";

describe("range loader", () => {
  it("validates the placeholder chart schema", () => {
    expect(() => validateRangeChart(placeholderChart)).not.toThrow();
    expect(Object.keys(placeholderChart.positions)).toEqual(RFI_POSITIONS_9MAX);
  });

  it("rejects malformed files with useful errors", () => {
    expect(() => validateRangeChart({ positions: {} })).toThrow("missing meta");
    expect(() => validateRangeChart({
      meta: { tableSize: 6 },
      positions: {},
    })).toThrow("meta.source");
    expect(() => validateRangeChart({
      meta: {
        source: "bad",
        tableSize: 6,
      },
      positions: { UTG: { AXs: 1 } },
    })).toThrow("Unknown hand key");
    expect(() => validateRangeChart({
      meta: {
        source: "bad",
        tableSize: 6,
      },
      positions: { UTG: { AA: 1.5 } },
    })).toThrow("must be from 0 to 1");
  });

  it("loads each shipped real RFI chart with checksum-matched positions", () => {
    [pokerCoachingRfiChart].forEach((chart) => {
      expect(() => validateRfiChart(chart)).not.toThrow();
      expect(Object.keys(chart.positions)).toEqual(RFI_POSITIONS_9MAX);

      RFI_POSITIONS_9MAX.forEach((position) => {
        const range = chart.positions[position];
        const comboCount = expandPositionRange(range).length;

        expect(Object.keys(range).every(isCanonicalHandKey)).toBe(true);
        expect(comboCount).toBe(chart.meta.comboCounts[position]);
      });
    });
  });

  it("keeps shipped RFI ranges monotonic by combo count", () => {
    [pokerCoachingRfiChart].forEach((chart) => {
      const comboCounts = RFI_POSITIONS_9MAX.map((position) => chart.meta.comboCounts[position]);

      comboCounts.slice(1).forEach((count, index) => {
        expect(count).toBeGreaterThanOrEqual(comboCounts[index]);
      });
    });
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
