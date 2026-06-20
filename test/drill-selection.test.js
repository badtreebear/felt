import { describe, expect, it } from "vitest";
import { collectDrillSpots, leakStreet } from "../src/drill/selection.js";

const hands = [
  {
    id: "h1", seed: "seedA", ts: 100,
    decisions: [
      { street: "preflop", leak: true, leakType: "opened too wide", spot: "CO RFI", recommended: "fold" },
    ],
  },
  {
    id: "h2", seed: "seedB", ts: 300,
    decisions: [
      { street: "flop", leak: true, leakType: "folded to c-bet", spot: "BB vs CO", recommended: "call" },
    ],
  },
  {
    id: "h3", seed: "seedC", ts: 200,
    decisions: [
      { street: "preflop", leak: false, leakType: "", spot: "BTN RFI", recommended: "raise" },
      { street: "river", leak: true, leakType: "folded to c-bet", spot: "river barrel", recommended: "call" },
    ],
  },
];

describe("collectDrillSpots", () => {
  it("returns only hands containing the requested leak", () => {
    const spots = collectDrillSpots(hands, "opened too wide");
    expect(spots).toHaveLength(1);
    expect(spots[0].seed).toBe("seedA");
    expect(spots[0].street).toBe("preflop");
  });

  it("collects every hand with the leak, most recent first", () => {
    const spots = collectDrillSpots(hands, "folded to c-bet");
    expect(spots.map((spot) => spot.seed)).toEqual(["seedB", "seedC"]);
    expect(spots[1].street).toBe("river");
  });

  it("dedupes by seed and carries the leaked street/recommendation", () => {
    const dupes = [
      ...hands,
      { id: "h4", seed: "seedB", ts: 50, decisions: [{ street: "flop", leak: true, leakType: "folded to c-bet" }] },
    ];
    const spots = collectDrillSpots(dupes, "folded to c-bet");
    expect(spots.map((spot) => spot.seed)).toEqual(["seedB", "seedC"]);
    expect(spots[0].recommended).toBe("call");
  });

  it("respects the limit", () => {
    expect(collectDrillSpots(hands, "folded to c-bet", { limit: 1 })).toHaveLength(1);
  });

  it("is safe with bad input", () => {
    expect(collectDrillSpots(null, "x")).toEqual([]);
    expect(collectDrillSpots(hands, "")).toEqual([]);
    expect(collectDrillSpots([], "x")).toEqual([]);
  });
});

describe("leakStreet", () => {
  it("returns the street the leak happens on", () => {
    expect(leakStreet(hands, "opened too wide")).toBe("preflop");
    expect(leakStreet(hands, "folded to c-bet")).toBe("flop");
  });

  it("returns empty for unknown leaks or bad input", () => {
    expect(leakStreet(hands, "nope")).toBe("");
    expect(leakStreet(null, "x")).toBe("");
    expect(leakStreet(hands, "")).toBe("");
  });
});
