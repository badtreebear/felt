import { positionToRfiLabel, rangeBucketForPlayers } from "../../engine/positions.js";
import {
  expandPositionRange,
  getChartPositionRange,
  rangeToGrid,
  validateRfiChart,
} from "../../engine/ranges.js";
import rfi6MaxChart from "./default-rfi-6max.json";
import rfiChart from "./default-rfi-9max.json";

const OPENING_CHARTS = {
  "6max": rfi6MaxChart,
  "9max": rfiChart,
};

const VALIDATED_OPENING_CHARTS = {
  "6max": loadOpeningChart(rfi6MaxChart, {
    positions: ["LJ", "HJ", "CO", "BTN", "SB"],
  }),
  "9max": loadOpeningChart(rfiChart),
};

export function getOpeningRange({ players, position }) {
  const bucket = rangeBucketForPlayers(players);
  const sourceChart = OPENING_CHARTS[bucket] || rfiChart;
  const { chart, error: chartError } = VALIDATED_OPENING_CHARTS[bucket] || VALIDATED_OPENING_CHARTS["9max"];
  const rangePosition = chart?.positions?.[position] ? position : positionToRfiLabel(position);

  if (chartError) {
    return unavailableRange({
      players,
      position,
      rangePosition,
      sourceChart,
      chartError,
      message: "RFI chart failed to load.",
      error: chartError.message,
    });
  }

  if (!rangePosition) {
    return unavailableRange({
      players,
      position,
      rangePosition,
      sourceChart,
      chartError,
      message: `No RFI chart for ${position} yet.`,
    });
  }

  const positionRange = getChartPositionRange(chart, rangePosition);

  return {
    bucket,
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
  return VALIDATED_OPENING_CHARTS["9max"].error || VALIDATED_OPENING_CHARTS["6max"].error;
}

function loadOpeningChart(chart, options = {}) {
  try {
    return { chart: validateRfiChart(chart, options), error: null };
  } catch (error) {
    console.error("Failed to load RFI chart.", error);
    return { chart: null, error };
  }
}

function unavailableRange({ players, position, rangePosition, sourceChart, chartError, message, error = null }) {
  return {
    bucket: rangeBucketForPlayers(players),
    source: sourceChart.meta?.source || "",
    url: sourceChart.meta?.url || "",
    meta: sourceChart.meta || {},
    tableSize: sourceChart.meta?.tableSize || 9,
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
