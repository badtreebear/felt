import { positionToRfiLabel, rangeBucketForPlayers } from "../../engine/positions.js";
import {
  expandPositionRange,
  getChartPositionRange,
  rangeToGrid,
  validateRfiChart,
} from "../../engine/ranges.js";
import pokerCoachingRfiChart from "./pokercoaching-rfi-9max.json";

const { chart, error: chartError } = loadOpeningChart();

export function getOpeningRange({ players, position }) {
  const rangePosition = positionToRfiLabel(position);

  if (chartError) {
    return unavailableRange({
      players,
      position,
      rangePosition,
      message: "RFI chart failed to load.",
      error: chartError.message,
    });
  }

  if (!rangePosition) {
    return unavailableRange({
      players,
      position,
      rangePosition,
      message: `No RFI chart for ${position} yet.`,
    });
  }

  const positionRange = getChartPositionRange(chart, rangePosition);

  return {
    bucket: rangeBucketForPlayers(players),
    source: chart.meta.source,
    url: chart.meta.url,
    meta: chart.meta,
    tableSize: chart.meta.tableSize,
    position: rangePosition,
    displayPosition: position,
    chartAvailable: true,
    chartLoaded: true,
    isPlaceholder: false,
    grid: rangeToGrid(positionRange),
    combos: expandPositionRange(positionRange),
  };
}

export function getOpeningRangeLoadError() {
  return chartError;
}

function loadOpeningChart() {
  try {
    return { chart: validateRfiChart(pokerCoachingRfiChart), error: null };
  } catch (error) {
    console.error("Failed to load PokerCoaching RFI chart.", error);
    return { chart: null, error };
  }
}

function unavailableRange({ players, position, rangePosition, message, error = null }) {
  return {
    bucket: rangeBucketForPlayers(players),
    source: pokerCoachingRfiChart.meta?.source || "",
    url: pokerCoachingRfiChart.meta?.url || "",
    meta: pokerCoachingRfiChart.meta || {},
    tableSize: pokerCoachingRfiChart.meta?.tableSize || 9,
    position: rangePosition,
    displayPosition: position,
    chartAvailable: false,
    chartLoaded: !chartError,
    isPlaceholder: false,
    message,
    error,
    grid: null,
    combos: [],
  };
}
