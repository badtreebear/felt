import { describe, expect, it } from "vitest";
import {
  advanceDrill,
  createDrillSession,
  drillSummary,
  emptyDrill,
  isDrillComplete,
  recordDrillResult,
} from "../src/drill/session.js";

const SPOTS = [
  { seed: "s1", street: "preflop", spot: "CO RFI", recommended: "fold" },
  { seed: "s2", street: "preflop", spot: "BTN RFI", recommended: "raise" },
];

function startHistory(spots = SPOTS) {
  return createDrillSession({ mode: "history", leakType: "opened too wide", spots });
}

describe("createDrillSession", () => {
  it("builds a history queue with fresh resurface flags", () => {
    const drill = startHistory([{ seed: "s1", resurfaced: true }]);
    expect(drill.active).toBe(true);
    expect(drill.mode).toBe("history");
    expect(drill.index).toBe(0);
    expect(drill.results).toEqual([]);
    expect(drill.spots[0].resurfaced).toBe(false); // stale flag cleared
  });

  it("ignores any passed spots for a generated drill", () => {
    const drill = createDrillSession({ mode: "generated", leakType: "x", targetStreet: "flop", spots: SPOTS });
    expect(drill.mode).toBe("generated");
    expect(drill.spots).toEqual([]);
    expect(drill.targetStreet).toBe("flop");
  });
});

describe("recordDrillResult", () => {
  it("appends a result and pauses for advance", () => {
    const drill = startHistory();
    recordDrillResult(drill, { seed: "s1", matched: true, evDeltaBb: 0 });
    expect(drill.results).toEqual([{ seed: "s1", matched: true, evDeltaBb: 0 }]);
    expect(drill.awaitingNext).toBe(true);
  });

  it("does not double-record while awaiting advance", () => {
    const drill = startHistory();
    recordDrillResult(drill, { seed: "s1", matched: true });
    recordDrillResult(drill, { seed: "s1", matched: false });
    expect(drill.results).toHaveLength(1);
  });

  it("resurfaces a missed spot once, at the end of the queue", () => {
    const drill = startHistory();
    recordDrillResult(drill, { seed: "s1", matched: false, evDeltaBb: -1.5 });
    expect(drill.spots).toHaveLength(3);
    expect(drill.spots[2]).toMatchObject({ seed: "s1", resurfaced: true });
  });

  it("does not resurface a spot that already resurfaced", () => {
    const drill = startHistory();
    // miss s1 -> resurfaces as spots[2]
    recordDrillResult(drill, { seed: "s1", matched: false });
    advanceDrill(drill); // -> index 1 (s2)
    recordDrillResult(drill, { seed: "s2", matched: true });
    advanceDrill(drill); // -> index 2 (resurfaced s1)
    recordDrillResult(drill, { seed: "s1", matched: false }); // miss the repeat
    expect(drill.spots).toHaveLength(3); // no second resurface
  });

  it("does not resurface a matched spot or a no-chart (null) decision", () => {
    const matched = startHistory();
    recordDrillResult(matched, { seed: "s1", matched: true });
    expect(matched.spots).toHaveLength(2);

    const noChart = startHistory();
    recordDrillResult(noChart, { seed: "s1", matched: null });
    expect(noChart.spots).toHaveLength(2);
  });

  it("never resurfaces in generated mode", () => {
    const drill = createDrillSession({ mode: "generated", leakType: "x", targetStreet: "flop" });
    recordDrillResult(drill, { seed: "g1", matched: false });
    expect(drill.spots).toEqual([]);
  });
});

describe("advanceDrill", () => {
  it("walks the history queue, then reports done", () => {
    const drill = startHistory();
    recordDrillResult(drill, { seed: "s1", matched: true });
    expect(advanceDrill(drill)).toEqual({ done: false, seed: "s2" });
    recordDrillResult(drill, { seed: "s2", matched: true });
    expect(advanceDrill(drill)).toEqual({ done: true, seed: null });
    expect(isDrillComplete(drill)).toBe(true);
  });

  it("extends the queue to play a resurfaced spot before finishing", () => {
    const drill = startHistory();
    recordDrillResult(drill, { seed: "s1", matched: false }); // s1 resurfaces
    expect(advanceDrill(drill)).toEqual({ done: false, seed: "s2" });
    recordDrillResult(drill, { seed: "s2", matched: true });
    expect(advanceDrill(drill)).toEqual({ done: false, seed: "s1" }); // the repeat
    recordDrillResult(drill, { seed: "s1", matched: true });
    expect(advanceDrill(drill)).toEqual({ done: true, seed: null });
  });

  it("for generated drills always continues with a fresh hand", () => {
    const drill = createDrillSession({ mode: "generated", leakType: "x", targetStreet: "flop" });
    recordDrillResult(drill, { seed: "g1", matched: false });
    expect(advanceDrill(drill)).toEqual({ done: false, seed: null });
    expect(drill.index).toBe(1);
    expect(isDrillComplete(drill)).toBe(false);
  });
});

describe("drillSummary", () => {
  it("totals matched, EV lost, and resurfaced count", () => {
    const drill = startHistory();
    recordDrillResult(drill, { seed: "s1", matched: false, evDeltaBb: -2.4 });
    advanceDrill(drill);
    recordDrillResult(drill, { seed: "s2", matched: true, evDeltaBb: 0 });
    advanceDrill(drill);
    recordDrillResult(drill, { seed: "s1", matched: true, evDeltaBb: 0 }); // the repeat
    expect(drillSummary(drill)).toEqual({
      total: 3,
      matched: 2,
      evLostBb: -2.4,
      resurfaced: 1,
    });
  });

  it("is safe on a fresh/empty drill", () => {
    expect(drillSummary(emptyDrill())).toEqual({ total: 0, matched: 0, evLostBb: 0, resurfaced: 0 });
  });
});
