import { positionToRfiLabel, rangeBucketForPlayers } from "../../engine/positions.js";
import {
  expandPositionRange,
  getChartPositionRange,
  rangeToGrid,
  validateRfiChart,
} from "../../engine/ranges.js";
import rfi6MaxChart from "./default-rfi-6max.json";
import rfiChart from "./default-rfi-9max.json";
import rfiSbChart from "./default-rfi-sb.json";
import rfi2maxChart from "./default-2max-pushfold.json";

const OPENING_CHARTS = {
  "6max": rfi6MaxChart,
  "9max": rfiChart,
  "sb": rfiSbChart,
  "2max": rfi2maxChart,
};

const VALIDATED_OPENING_CHARTS = {
  "6max": loadOpeningChart(rfi6MaxChart, {
    positions: ["LJ", "HJ", "CO", "BTN", "SB"],
  }),
  "9max": loadOpeningChart(rfiChart),
  "sb": loadOpeningChart(rfiSbChart, {
    positions: ["SB"],
  }),
  "2max": loadOpeningChart(rfi2maxChart, {
    positions: ["BTN"],
  }),
};

export function getOpeningRange({ players, position }) {
  // C1: 2-player (heads-up) uses a Nash push/fold open-jam chart.
  // Heads-up the SB is the button; both seats ("BTN/SB", "SB", "BB") map to the
  // single push-range key "BTN" so the open-jam chart always resolves.
  if (players === 2) {
    const headUpPos = "BTN";
    const { chart: chart2max, error: error2max } = VALIDATED_OPENING_CHARTS["2max"];
    if (!error2max && chart2max?.positions?.[headUpPos]) {
      const positionRange = getChartPositionRange(chart2max, headUpPos);
      return {
        bucket: "2max",
        source: chart2max.meta.source,
        url: chart2max.meta.url,
        meta: chart2max.meta,
        tableSize: chart2max.meta.tableSize,
        position: headUpPos,
        displayPosition: position,
        chartAvailable: true,
        chartLoaded: true,
        isPlaceholder: false,
        grid: rangeToGrid(positionRange),
        combos: expandPositionRange(positionRange),
      };
    }
  }

  // B1/A3: SB has a dedicated opening chart for all player counts (the 9-max
  // RFI chart has no SB, so this also covers SB at 7-9 players).
  if (position === "SB") {
    const { chart: sbChart, error: sbChartError } = VALIDATED_OPENING_CHARTS["sb"];
    if (!sbChartError && sbChart) {
      const positionRange = getChartPositionRange(sbChart, "SB");
      return {
        bucket: "sb",
        source: sbChart.meta.source,
        url: sbChart.meta.url,
        meta: sbChart.meta,
        tableSize: sbChart.meta.tableSize,
        position: "SB",
        displayPosition: position,
        chartAvailable: true,
        chartLoaded: true,
        isPlaceholder: false,
        grid: rangeToGrid(positionRange),
        combos: expandPositionRange(positionRange),
      };
    }
  }

  const bucket = rangeBucketForPlayers(players);
  let sourceChart = OPENING_CHARTS[bucket] || rfiChart;
  let { chart, error: chartError } = VALIDATED_OPENING_CHARTS[bucket] || VALIDATED_OPENING_CHARTS["9max"];

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
