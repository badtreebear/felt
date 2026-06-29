import { describe, expect, it } from "vitest";
import { explainLeak, LEAK_EXPLANATIONS, GOOD_EXPLANATIONS } from "../src/ui/leak-explanations.js";

// The exact leak strings the trackers emit. If a tracker adds a leakType, this
// list (and the explanation map) must grow with it — the coverage test below
// fails loudly otherwise, so live grading never shows a bare label.
const TRACKER_LEAKS = [
  // preflop-leaks.js
  "open-folded too tight",
  "missed an open",
  "opened too wide",
  "defended too wide",
  "3-bet too wide",
  "over-folded a defend hand",
  "flatted a 3-bet hand",
  "3-bet a call hand",
  "continued too wide vs 3-bet",
  "over-folded vs 3-bet",
  "flatted a 4-bet hand",
  "4-bet a call hand",
  // postflop-leaks.js
  "called -EV (paid off)",
  "folded +EV",
  "got it in light",
  "overvalued your hand",
  "oversized bet (review)",
  "undersized value bet",
  "small bet (review)",
];

const GOOD_LABELS = ["good call (+EV)", "good fold", "got it in good"];

describe("explainLeak — coverage", () => {
  it("has a plain-English explanation for every leak the trackers emit", () => {
    const missing = TRACKER_LEAKS.filter((leak) => !explainLeak(leak));
    expect(missing).toEqual([]);
  });

  it("has a coaching note for every good-play label", () => {
    const missing = GOOD_LABELS.filter((label) => !explainLeak(label));
    expect(missing).toEqual([]);
  });

  it("returns a full sentence (capitalised, ends with a period)", () => {
    for (const leak of TRACKER_LEAKS) {
      const text = explainLeak(leak);
      expect(text[0]).toBe(text[0].toUpperCase());
      expect(text.endsWith(".")).toBe(true);
    }
  });
});

describe("explainLeak — pot-control language lives in explanations, not labels", () => {
  it("frames the overvalued leak as pot control in the EXPLANATION", () => {
    // The collaborator's design: 'pot control' is an explanation, never its own
    // leak category. The leak stays 'overvalued your hand'; the lesson is pot control.
    expect(TRACKER_LEAKS).not.toContain("pot control");
    expect(explainLeak("overvalued your hand")).toMatch(/control the pot|pot control/i);
  });

  it("explains the called -EV leak in terms of price vs equity", () => {
    expect(explainLeak("called -EV (paid off)")).toMatch(/equity|price/i);
  });
});

describe("explainLeak — defensive", () => {
  it("returns null for unknown or empty labels (caller falls back to raw reason)", () => {
    expect(explainLeak("")).toBeNull();
    expect(explainLeak(null)).toBeNull();
    expect(explainLeak(undefined)).toBeNull();
    expect(explainLeak("some future leak we haven't mapped")).toBeNull();
  });

  it("keeps the leak and good maps disjoint", () => {
    const overlap = Object.keys(LEAK_EXPLANATIONS).filter((k) => k in GOOD_EXPLANATIONS);
    expect(overlap).toEqual([]);
  });
});

describe("explainLeak — overvalued names real board threats", () => {
  it("names a single threat", () => {
    const text = explainLeak("overvalued your hand", { beats: ["flush"] });
    expect(text).toMatch(/a flush possible/);
    expect(text).toMatch(/control the pot/i);
  });

  it("joins two threats with 'or'", () => {
    const text = explainLeak("overvalued your hand", { beats: ["flush", "straight"] });
    expect(text).toMatch(/a flush or a straight possible/);
  });

  it("joins three+ threats with commas and a final 'or'", () => {
    const text = explainLeak("overvalued your hand", { beats: ["flush", "straight", "full house"] });
    expect(text).toMatch(/a flush, a straight, or a full house possible/);
  });

  it("falls back to a generic sentence when no threats are named (wet texture only)", () => {
    const text = explainLeak("overvalued your hand", { beats: [] });
    expect(text).toMatch(/dangerous board/);
    expect(text).toMatch(/control the pot/i);
  });

  it("falls back gracefully when no context is passed at all", () => {
    const text = explainLeak("overvalued your hand");
    expect(typeof text).toBe("string");
    expect(text).toMatch(/control the pot/i);
  });
});
