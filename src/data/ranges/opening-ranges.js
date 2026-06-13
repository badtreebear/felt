import { normalizeRangePosition, rangeBucketForPlayers } from "../../engine/positions.js";
import {
  expandPositionRange,
  getChartPositionRange,
  rangeToGrid,
  validateRangeChart,
} from "../../engine/ranges.js";
import placeholderChart from "./placeholder-9max.json";

const chart = validateRangeChart(placeholderChart);

export function getOpeningRange({ players, position }) {
  const rangePosition = normalizeRangePosition(position);
  const positionRange = getChartPositionRange(chart, rangePosition);

  return {
    bucket: rangeBucketForPlayers(players),
    source: chart.meta.source,
    tableSize: chart.meta.tableSize,
    position: rangePosition,
    displayPosition: position,
    grid: rangeToGrid(positionRange),
    combos: expandPositionRange(positionRange),
  };
}
