// Drill session controller (Phase 10, slice 10.2).
//
// Pure, framework-free helpers that own a drill's queue, score, and the
// "resurface on miss" rule (light spaced repetition). They operate on a plain
// drill object so they're trivially unit-testable and so the immer-style
// reducers in main.js can call them on a draft.
//
// Drill shape:
//   {
//     active:       boolean,
//     mode:         "history" | "generated",
//     leakType:     string,
//     targetStreet: string,            // the street whose decision is graded
//     spots:        Array<{ seed, street, spot, recommended, resurfaced? }>,
//     index:        number,            // current position in `spots`
//     results:      Array<{ seed, matched, evDeltaBb }>,
//     awaitingNext: boolean,           // true once the current spot is graded
//   }
//
// Generated drills carry no fixed queue (`spots` stays empty); they deal a fresh
// hand each advance, so resurfacing and the done-check don't apply to them.

export function emptyDrill() {
  return {
    active: false,
    mode: "history",
    leakType: "",
    targetStreet: "",
    spots: [],
    index: 0,
    results: [],
    awaitingNext: false,
  };
}

export function createDrillSession({ mode = "history", leakType = "", targetStreet = "", spots = [] } = {}) {
  const generated = mode === "generated";

  return {
    active: true,
    mode: generated ? "generated" : "history",
    leakType,
    targetStreet: targetStreet || "",
    // Clear any stale resurface flags so a re-run starts fresh.
    spots: generated ? [] : spots.map((spot) => ({ ...spot, resurfaced: false })),
    index: 0,
    results: [],
    awaitingNext: false,
  };
}

// Record the graded result for the spot the player just played and pause for
// them to advance. For history drills, a *missed* spot resurfaces once: a copy
// is appended to the end of the queue, flagged so it can't resurface again.
// Mutates `drill` in place (immer-draft friendly) and returns it.
export function recordDrillResult(drill, { seed = "", matched, evDeltaBb = 0 } = {}) {
  if (!drill || !drill.active || drill.awaitingNext) {
    return drill;
  }

  const didMatch = matched === true;

  drill.results = [...drill.results, {
    seed,
    matched: didMatch,
    evDeltaBb: Number(evDeltaBb) || 0,
  }];
  drill.awaitingNext = true;

  // Resurface only a genuine miss (matched === false), not a "no chart" (null).
  if (drill.mode !== "generated" && matched === false) {
    const current = drill.spots[drill.index];

    if (current && !current.resurfaced) {
      drill.spots = [...drill.spots, { ...current, resurfaced: true }];
    }
  }

  return drill;
}

// Advance to the next spot. Clears `awaitingNext` and moves the index forward.
// Returns { done, seed }: `done` is true for a history drill once the index
// passes the (possibly grown) queue; `seed` is the hand to deal next, or null
// for a fresh generated hand / when done. Mutates `drill` in place.
export function advanceDrill(drill) {
  if (!drill || !drill.active) {
    return { done: true, seed: null };
  }

  drill.awaitingNext = false;

  if (drill.mode === "generated") {
    drill.index += 1;
    return { done: false, seed: null };
  }

  const next = drill.index + 1;
  drill.index = next;

  if (next >= drill.spots.length) {
    return { done: true, seed: null };
  }

  return { done: false, seed: drill.spots[next].seed };
}

// True when a history drill has played every queued spot (including any that
// resurfaced). Always false for generated drills, which never run out.
export function isDrillComplete(drill) {
  if (!drill || !drill.active || drill.mode === "generated") {
    return false;
  }

  return drill.index >= drill.spots.length;
}

// Aggregate read for the progress strip and end-of-drill summary.
//   total      — spots graded so far
//   matched    — how many matched the engine
//   evLostBb   — summed negative EV deltas, rounded to 0.1bb (<= 0)
//   resurfaced — how many graded spots were a resurfaced repeat
export function drillSummary(drill) {
  const results = drill?.results || [];
  const total = results.length;
  const matched = results.filter((result) => result.matched).length;
  const evLostBb = results.reduce(
    (sum, result) => (result.evDeltaBb < 0 ? sum + result.evDeltaBb : sum),
    0,
  );
  const resurfaced = (drill?.spots || []).filter((spot) => spot.resurfaced).length;

  return {
    total,
    matched,
    evLostBb: Math.round(evLostBb * 10) / 10,
    resurfaced,
  };
}
