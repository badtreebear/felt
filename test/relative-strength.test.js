import { describe, expect, it } from "vitest";
import { relativeStrength } from "../src/ui/chips.js";

// Minimal postflop state: hero to act, with the equity the engine already
// simulated against the villains' ranges sitting on state.maths.heroEquity.
const spot = ({ board, hero, equity = 0.5, status = "waitingHero" }) => ({
  config: { heroSeat: 0 },
  maths: { heroEquity: equity },
  hand: {
    board,
    holeCards: { 0: hero },
    postflop: { status },
  },
});

describe("relativeStrength", () => {
  it("is null off the postflop hero decision", () => {
    expect(relativeStrength(spot({ board: ["Ah", "9h", "2h"], hero: ["As", "Ks"], status: "complete" }))).toBeNull();
    expect(relativeStrength(null)).toBeNull();
  });

  it("is null before the flop is out", () => {
    expect(relativeStrength(spot({ board: [], hero: ["As", "Ks"] }))).toBeNull();
    expect(relativeStrength(spot({ board: ["Ah"], hero: ["As", "Ks"] }))).toBeNull();
  });

  it("passes the engine's equity through unchanged", () => {
    const rel = relativeStrength(spot({ board: ["Ah", "9h", "2h"], hero: ["As", "Ks"], equity: 0.42 }));
    expect(rel.equity).toBe(0.42);
  });

  it("treats equity as null when it has not simulated yet", () => {
    const rel = relativeStrength(spot({ board: ["Ah", "9h", "2h"], hero: ["As", "Ks"], equity: null }));
    expect(rel.equity).toBeNull();
  });

  it("lists the categories that beat top pair on a wet board", () => {
    const rel = relativeStrength(spot({ board: ["Ah", "9h", "2h"], hero: ["As", "Ks"] }));
    expect(rel.hero.name).toBe("Pair");
    const beatKinds = rel.beats.map((t) => t.kind);
    expect(beatKinds).toContain("twoPair");
    expect(beatKinds).toContain("flush");
  });

  it("does not list lower categories as beating a set", () => {
    const rel = relativeStrength(spot({ board: ["9h", "8d", "7c"], hero: ["9s", "9c"], equity: 0.78 }));
    expect(rel.hero.name).toBe("Three of a Kind");
    const beatKinds = rel.beats.map((t) => t.kind);
    expect(beatKinds).toContain("straight");
    expect(beatKinds).not.toContain("twoPair");
  });

  it("is deterministic for a given spot", () => {
    const a = relativeStrength(spot({ board: ["9h", "8d", "7c"], hero: ["As", "Kd"] }));
    const b = relativeStrength(spot({ board: ["9h", "8d", "7c"], hero: ["As", "Kd"] }));
    expect(a).toEqual(b);
  });
});
