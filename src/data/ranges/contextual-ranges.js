import { getSeatPositions, rangeBucketForPlayers } from "../../engine/positions.js";
import {
  actionRangeComboCounts,
  actionRangeToGrid,
  validateVsThreeBetChart,
  validateVsRfiChart,
} from "../../engine/ranges.js";
import { getOpeningRange } from "./opening-ranges.js";
import vsThreeBetChartData from "./default-vs3bet-9max.json";
import vsRfiChartData from "./default-vsrfi-9max.json";

const { chart: vsRfiChart, error: vsRfiChartError } = loadVsRfiChart();
const { chart: vsThreeBetChart, error: vsThreeBetChartError } = loadVsThreeBetChart();

export function getRangeForSpot({ players, seat, position, hand }) {
  const openingRange = getOpeningRange({ players, position });
  const preflop = hand?.preflop;

  if (!preflop || preflop.voluntaryRaiserSeat === null || preflop.voluntaryRaiserSeat === undefined) {
    // A1: the BB is never an RFI/open spot. Folded around to the BB is a check/walk,
    // not an opening decision, so show a friendly option note instead of "no chart".
    if (position === "BB") {
      return bbOptionRange({ players, position });
    }

    return titledOpeningRange(openingRange, `${position} - open (RFI)`, "rfi");
  }

  const positions = getSeatPositions({ players, buttonSeat: hand.buttonSeat });
  const openerSeat = preflop.voluntaryRaiserSeat;
  const openerPosition = positions[openerSeat];

  if (seat === openerSeat) {
    if (preflop.raiseCount === 2) {
      return threeBetContinuationRange({ players, position, openingRange, preflop, positions, openerPosition });
    }

    if (preflop.raiseCount > 2) {
      return fallbackOpeningRange(openingRange, `${openerPosition} - no chart for this spot yet`);
    }

    return titledOpeningRange(openingRange, `${position} - open (RFI)`, "rfi");
  }

  if (actedBeforeOpen({ preflop, targetSeat: seat, openerSeat })) {
    return titledOpeningRange(openingRange, `${position} - open (RFI)`, "rfi");
  }

  const contextTitle = `${position} vs ${openerPosition} open`;

  // Facing a 3-bet/4-bet (the pot was re-raised before this seat acts). The
  // heads-up defend chart only covers a single raise, so explain that rather
  // than implying the whole spot is uncharted.
  if (preflop.raiseCount !== 1) {
    const raiseLabel = preflop.raiseCount >= 3 ? "4-bet+" : "3-bet";
    return fallbackOpeningRange(
      openingRange,
      `${contextTitle}, facing a ${raiseLabel}`,
      null,
      `${position} is facing a ${raiseLabel} after the ${openerPosition} open - no chart for this re-raised spot yet. The ${position} vs ${openerPosition} defend chart only covers a single open.`,
    );
  }

  // Multiway: another player cold-called the open, so this is no longer the
  // heads-up defend spot the chart models.
  if (hasOtherCallerAfterOpen({ preflop, targetSeat: seat, openerSeat })) {
    return fallbackOpeningRange(
      openingRange,
      `${contextTitle}, multiway`,
      null,
      `Multiway pot - another player called the ${openerPosition} open, so the heads-up ${position} vs ${openerPosition} defend chart no longer applies.`,
    );
  }

  if (vsRfiChartError) {
    return fallbackOpeningRange(openingRange, `${contextTitle} - defend chart failed to load`, vsRfiChartError.message);
  }

  const spot = findVsRfiSpot({ responderPosition: position, openerPosition });

  if (!spot) {
    return fallbackOpeningRange(openingRange, `${contextTitle} - no chart for this spot yet`);
  }

  return {
    bucket: rangeBucketForPlayers(players),
    source: vsRfiChart.meta.source,
    url: vsRfiChart.meta.url,
    meta: vsRfiChart.meta,
    tableSize: vsRfiChart.meta.tableSize,
    position: spot.responderPosition,
    openerPosition,
    displayPosition: position,
    chartAvailable: true,
    chartLoaded: true,
    isPlaceholder: false,
    kind: "vsRfi",
    title: `${position} vs ${openerPosition} open - defend`,
    grid: actionRangeToGrid(spot.actions),
    combos: actionRangeComboCounts(spot.actions),
    actions: spot.actions,
  };
}

export function getVsRfiRangeLoadError() {
  return vsRfiChartError;
}

export function getVsThreeBetRangeLoadError() {
  return vsThreeBetChartError;
}

function loadVsRfiChart() {
  try {
    return { chart: validateVsRfiChart(vsRfiChartData), error: null };
  } catch (error) {
    console.error("Failed to load Facing-RFI chart.", error);
    return { chart: null, error };
  }
}

function loadVsThreeBetChart() {
  try {
    return { chart: validateVsThreeBetChart(vsThreeBetChartData), error: null };
  } catch (error) {
    console.error("Failed to load RFI vs 3-bet chart.", error);
    return { chart: null, error };
  }
}

function findVsRfiSpot({ responderPosition, openerPosition }) {
  return Object.values(vsRfiChart.spots).find((spot) => (
    spot.responderPosition === responderPosition
    && spot.openerPositions.includes(openerPosition)
  ));
}

function threeBetContinuationRange({ players, position, openingRange, preflop, positions, openerPosition }) {
  const threeBettorSeat = preflop.aggressorSeat;
  const threeBettorPosition = positions[threeBettorSeat];
  const contextTitle = `${openerPosition} vs ${threeBettorPosition} 3-bet`;

  if (!threeBettorPosition || threeBettorSeat === preflop.voluntaryRaiserSeat) {
    return fallbackOpeningRange(openingRange, `${openerPosition} - no 3-bettor chart for this spot yet`);
  }

  if (vsThreeBetChartError) {
    return fallbackOpeningRange(openingRange, `${contextTitle} - continuation chart failed to load`, vsThreeBetChartError.message);
  }

  const spot = findVsThreeBetSpot({ openerPosition, threeBettorPosition });

  if (!spot) {
    return fallbackOpeningRange(openingRange, `${contextTitle} - no chart for this spot yet`);
  }

  return {
    bucket: rangeBucketForPlayers(players),
    source: vsThreeBetChart.meta.source,
    url: vsThreeBetChart.meta.url,
    meta: vsThreeBetChart.meta,
    tableSize: vsThreeBetChart.meta.tableSize,
    position: spot.openerPosition,
    threeBettorPosition,
    displayPosition: position,
    chartAvailable: true,
    chartLoaded: true,
    isPlaceholder: false,
    kind: "vs3bet",
    title: `${contextTitle} - continue`,
    grid: actionRangeToGrid(spot.actions),
    combos: actionRangeComboCounts(spot.actions),
    actions: spot.actions,
    foldToThreeBetCombos: spot.foldToThreeBetCombos,
    notInOpeningRangeCombos: spot.notInOpeningRangeCombos,
    openingRangeCombos: spot.openingRangeCombos,
  };
}

function findVsThreeBetSpot({ openerPosition, threeBettorPosition }) {
  return Object.values(vsThreeBetChart.spots).find((spot) => (
    spot.openerPosition === openerPosition
    && spot.threeBettorPositions.includes(threeBettorPosition)
  ));
}

function bbOptionRange({ players, position }) {
  // Folded to the BB with no raise: a check/walk, not a charted decision.
  // chartAvailable stays false (the grid renderer needs a grid), but the message
  // is a friendly option note, never the "no chart for {pos}" fallback string.
  return {
    bucket: rangeBucketForPlayers(players),
    source: "",
    url: "",
    meta: {},
    tableSize: players,
    position,
    displayPosition: position,
    chartAvailable: false,
    chartLoaded: true,
    isPlaceholder: false,
    kind: "walk",
    title: "BB - checks option",
    message: "Folded to the big blind: check your option. No preflop decision to train here.",
    error: null,
    grid: null,
    combos: [],
  };
}

function titledOpeningRange(openingRange, title, kind) {
  return {
    ...openingRange,
    kind,
    title,
  };
}

function fallbackOpeningRange(openingRange, title, error = null, message = null) {
  return {
    ...openingRange,
    kind: "fallback",
    title: openingRange.chartAvailable ? `${title}; showing ${openingRange.displayPosition} RFI` : title,
    message: message || (openingRange.chartAvailable
      ? `No defend chart for this spot yet. Showing ${openingRange.displayPosition} RFI.`
      : "No chart for this spot yet."),
    error,
  };
}

function hasOtherCallerAfterOpen({ preflop, targetSeat, openerSeat }) {
  const openIndex = preflop.actionLog.findIndex((entry) => (
    entry.seat === openerSeat && isRaiseAction(entry.action)
  ));

  if (openIndex < 0) {
    return false;
  }

  return preflop.actionLog.slice(openIndex + 1).some((entry) => (
    entry.action === "calls"
    && entry.seat !== targetSeat
    && entry.seat !== openerSeat
  ));
}

function actedBeforeOpen({ preflop, targetSeat, openerSeat }) {
  const openIndex = preflop.actionLog.findIndex((entry) => (
    entry.seat === openerSeat && isRaiseAction(entry.action)
  ));

  if (openIndex < 0) {
    return false;
  }

  return preflop.actionLog.slice(0, openIndex).some((entry) => (
    entry.seat === targetSeat && isVoluntaryPreflopAction(entry.action)
  ));
}

function isRaiseAction(action) {
  return [
    "raises to",
    "3-bets to",
    "4-bets to",
  ].includes(action);
}

function isVoluntaryPreflopAction(action) {
  return [
    "folds",
    "calls",
    "checks",
    "raises to",
    "3-bets to",
    "4-bets to",
  ].includes(action);
}
