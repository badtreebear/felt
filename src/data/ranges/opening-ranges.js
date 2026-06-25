import { positionToRfiLabel, rangeBucketForPlayers } from "../../engine/positions.js";
import { openDepth } from "../../engine/stack-depth.js";
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
import rfi2maxJam15Chart from "./default-2max-pushfold-15bb.json";
import rfi2maxDeepChart from "./default-2max-open-deep.json";

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
  // Heads-up charts, selected by effective stack depth (A2). All keyed on the
  // single push-range position "BTN" (heads-up the SB is the button).
  "2max": loadOpeningChart(rfi2maxChart, { positions: ["BTN"] }), // ~10bb Nash jam
  "2max15": loadOpeningChart(rfi2maxJam15Chart, { positions: ["BTN"] }), // ~15bb Nash jam
  "2maxDeep": loadOpeningChart(rfi2maxDeepChart, { positions: ["BTN"] }), // deep raise-first-in
};

// Pick the heads-up chart by effective stack in bb. Deep/unknown play a
// raise-first-in open; short stacks switch to a Nash open-jam (the ~10bb chart
// under ~12.5bb, the ~15bb chart in the upper push/fold band).
function headsUpChartKey(effBb) {
  const depth = openDepth(effBb);
  if (depth === "pushfold") {
    return Number(effBb) <= 12.5 ? "2max" : "2max15";
  }
  // shallow (~15-25bb), deep (>25bb), or unknown -> raise-first-in open.
  return "2maxDeep";
}

export function getOpeningRange({ players, position, effBb }) {
  // C1/A2: heads-up uses a stack-aware chart — deep raise-first-in when deep,
  // a Nash open-jam when short. Both seats ("BTN/SB", "SB", "BB") map to the
  // single push-range key "BTN" so the chart always resolves.
  if (players === 2) {
    const headUpPos = "BTN";
    const chartKey = headsUpChartKey(effBb);
    const { chart: chart2max, error: error2max } =
      VALIDATED_OPENING_CHARTS[chartKey] || VALIDATED_OPENING_CHARTS["2max"];
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
