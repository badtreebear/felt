import { getSeatPositions, rangeBucketForPlayers } from "../../engine/positions.js";
import { openDepth } from "../../engine/stack-depth.js";
import {
  actionRangeComboCounts,
  actionRangeToGrid,
  validateVsThreeBetChart,
  validateVsRfiChart,
} from "../../engine/ranges.js";
import { getOpeningRange } from "./opening-ranges.js";
import vsThreeBetChartData from "./default-vs3bet-9max.json";
import vsRfiChartData from "./default-vsrfi-9max.json";
import huDefendDeepData from "./default-2max-bb-defend-deep.json";
import huCallJam15Data from "./default-2max-bb-calljam-15bb.json";
import huCallJam10Data from "./default-2max-bb-calljam-10bb.json";

const { chart: vsRfiChart, error: vsRfiChartError } = loadVsRfiChart();
const { chart: vsThreeBetChart, error: vsThreeBetChartError } = loadVsThreeBetChart();

// A3: heads-up BB defend, selected by effective stack depth — deep plays
// call/3-bet/fold, short plays call-or-fold vs the SB's open-jam.
const HU_DEFEND_CHARTS = {
  deep: loadActionRangeChart(huDefendDeepData),
  jam15: loadActionRangeChart(huCallJam15Data),
  jam10: loadActionRangeChart(huCallJam10Data),
};

export function getRangeForSpot({ players, seat, position, hand, effBb }) {
  const openingRange = getOpeningRange({ players, position, effBb });
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

  // A3: heads-up BB defend vs the SB/BTN open. Single raise only (re-raised and
  // multiway spots fall through to the shared handling below). Depth-aware:
  // deep -> call/3-bet/fold; short -> call-or-fold vs the open-jam.
  if (players === 2 && position === "BB" && preflop.raiseCount === 1) {
    const huDefend = headsUpDefendRange({ position, openerPosition, effBb });
    if (huDefend) {
      return huDefend;
    }
  }

  // Facing a 3-bet/4-bet (the pot was re-raised before this seat acts). The
  // heads-up defend chart only covers a single raise, so explain that rather
  // than implying the whole spot is uncharted.
  if (preflop.raiseCount !== 1) {
    const raiseLabel = preflop.raiseCount >= 3 ? "4-bet+" : "3-bet";
    return fallbackOpeningRange(
      openingRange,
      `${contextTitle}, facing a ${raiseLabel}`,
      null,
      `${position} is facing a ${raiseLabel} after the ${openerPosition} open. Re-raised pots swing heavily on exact bet sizing, stack depth, and the specific players, so a fixed chart would mislead more than help - that's why one isn't built in yet (the ${position} vs ${openerPosition} chart only covers a single open). For now: continue a tight, value-heavy range - premiums and hands that play well in position - and lean on the Bet tip and the equity / pot-odds tools for the read.`,
    );
  }

  // Multiway: another player cold-called the open, so this is no longer the
  // heads-up defend spot the chart models.
  if (hasOtherCallerAfterOpen({ preflop, targetSeat: seat, openerSeat })) {
    return fallbackOpeningRange(
      openingRange,
      `${contextTitle}, multiway`,
      null,
      `Multiway pot - another player called the ${openerPosition} open, so the heads-up ${position} vs ${openerPosition} defend chart no longer applies (those charts assume you're one-on-one with the opener). Multiway ranges tighten up - play stronger, more straightforward hands and rely on the Bet tip and equity tools here.`,
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

function loadActionRangeChart(data) {
  try {
    return { chart: validateVsRfiChart(data), error: null };
  } catch (error) {
    console.error("Failed to load heads-up defend chart.", error);
    return { chart: null, error };
  }
}

// A3: pick the heads-up BB-defend chart by effective stack depth and return a
// vsRfi-kind range so the popover and the leak grader handle it like any other
// facing-open spot. Returns null if the chart can't be resolved (caller falls
// back to the shared handling).
function headsUpDefendRange({ position, openerPosition, effBb }) {
  const depth = openDepth(effBb);
  let key;
  let title;
  if (depth === "pushfold") {
    key = Number(effBb) <= 12.5 ? "jam10" : "jam15";
    const label = key === "jam10" ? "~10bb" : "~15bb";
    title = `${position} vs ${openerPosition} jam - call/fold (${label})`;
  } else {
    key = "deep";
    title = `${position} vs ${openerPosition} open - defend`;
  }

  const { chart, error } = HU_DEFEND_CHARTS[key] || {};
  if (error || !chart) {
    return null;
  }

  const spot = chart.spots.BB_vs_BTNSB;
  if (!spot) {
    return null;
  }

  return {
    bucket: "2max",
    source: chart.meta.source,
    url: chart.meta.url,
    meta: chart.meta,
    tableSize: chart.meta.tableSize,
    position: spot.responderPosition,
    openerPosition,
    displayPosition: position,
    chartAvailable: true,
    chartLoaded: true,
    isPlaceholder: false,
    kind: "vsRfi",
    title,
    grid: actionRangeToGrid(spot.actions),
    combos: actionRangeComboCounts(spot.actions),
    actions: spot.actions,
  };
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
