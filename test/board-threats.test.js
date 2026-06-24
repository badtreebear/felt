import { describe, expect, it } from "vitest";
import { boardThreats } from "../src/engine/board-threats.js";

// Helper: pull the threat for a given kind, or undefined.
const threatFor = (result, kind) => result.threats.find((t) => t.kind === kind);
const kinds = (result) => result.threats.map((t) => t.kind);

describe("boardThreats — possibility detection", () => {
  it("returns nothing with less than a flop", () => {
    expect(boardThreats([]).threats).toEqual([]);
    expect(boardThreats(["Ah", "Kd"]).threats).toEqual([]);
  });

  it("a dry rainbow board enables only the low categories", () => {
    // A-7-2 rainbow: no flush, no straight, no pair on board.
    const { threats } = boardThreats(["Ah", "7d", "2c"]);
    expect(kinds({ threats })).toContain("set");
    expect(kinds({ threats })).toContain("twoPair");
    expect(threatFor({ threats }, "flush")).toBeUndefined();
    expect(threatFor({ threats }, "straight")).toBeUndefined();
    expect(threatFor({ threats }, "fullHouse")).toBeUndefined();
  });

  it("flags a flush when three of a suit are on the board", () => {
    const { threats } = boardThreats(["Ah", "9h", "2h"]);
    expect(threatFor({ threats }, "flush")?.possible).toBe(true);
  });

  it("flags a straight on a connected board", () => {
    // 9-8-7 → many 5-runs hold 3 of these ranks.
    const { threats } = boardThreats(["9h", "8d", "7c"]);
    expect(threatFor({ threats }, "straight")?.possible).toBe(true);
  });

  it("flags the wheel straight using the ace as low", () => {
    const { threats } = boardThreats(["Ah", "2d", "3c"]);
    expect(threatFor({ threats }, "straight")?.possible).toBe(true);
  });

  it("enables full house and quads only on a paired board", () => {
    const dry = boardThreats(["Ah", "7d", "2c"]);
    expect(threatFor(dry, "fullHouse")).toBeUndefined();
    expect(threatFor(dry, "quads")).toBeUndefined();

    const paired = boardThreats(["7h", "7d", "2c"]);
    expect(threatFor(paired, "fullHouse")?.possible).toBe(true);
    expect(threatFor(paired, "quads")?.possible).toBe(true);
  });

  it("flags a straight flush on a suited connected board", () => {
    const { threats } = boardThreats(["9h", "8h", "7h"]);
    expect(threatFor({ threats }, "straightFlush")?.possible).toBe(true);
  });
});

describe("boardThreats — beatsHero (relative strength)", () => {
  it("warns top pair that two pair / sets / flushes beat it", () => {
    // Hero AK on A-9-2 monotone hearts: hero has top pair (one pair).
    const result = boardThreats(["Ah", "9h", "2h"], ["As", "Ks"]);
    expect(result.hero.name).toBe("Pair");
    expect(threatFor(result, "twoPair").beatsHero).toBe(true);
    expect(threatFor(result, "set").beatsHero).toBe(true);
    expect(threatFor(result, "flush").beatsHero).toBe(true);
  });

  it("does not warn the nut hand about lower categories", () => {
    // Hero flopped a set of nines on 9-8-7; a straight is possible and beats a set,
    // but two pair / trips do not.
    const result = boardThreats(["9h", "8d", "7c"], ["9s", "9c"]);
    expect(result.hero.name).toBe("Three of a Kind");
    expect(threatFor(result, "straight").beatsHero).toBe(true);
    expect(threatFor(result, "twoPair").beatsHero).toBe(false);
  });

  it("marks same-category threats rather than claiming they beat hero", () => {
    // Hero has a flush; another flush is possible but we only model categories.
    const result = boardThreats(["Ah", "9h", "2h"], ["Kh", "Qh"]);
    expect(result.hero.name).toBe("Flush");
    const flush = threatFor(result, "flush");
    expect(flush.beatsHero).toBe(false);
    expect(flush.note).toBe("same-category");
  });

  it("returns beatsHero:null when hero cards are unknown", () => {
    const result = boardThreats(["Ah", "9h", "2h"]);
    expect(result.hero).toBeNull();
    expect(threatFor(result, "flush").beatsHero).toBeNull();
  });
});

describe("boardThreats — draws and wetness", () => {
  it("flags a flush draw with two of a suit before the river", () => {
    const { threats } = boardThreats(["Ah", "9h", "2c"]);
    expect(threats.find((t) => t.kind === "flushDraw")?.draw).toBe(true);
  });

  it("emits no draw hints on a complete (river) board", () => {
    const { threats } = boardThreats(["Ah", "9h", "2c", "5d", "Kc"]);
    expect(threats.find((t) => t.draw)).toBeUndefined();
  });

  it("reports a higher wetness for a wet board than a dry one", () => {
    const wet = boardThreats(["9h", "8h", "7h"]).wetness;
    const dry = boardThreats(["Ah", "7d", "2c"]).wetness;
    expect(wet).toBeGreaterThan(dry);
  });

  it("is deterministic for a given board", () => {
    const a = boardThreats(["9h", "8d", "7c"], ["As", "Kd"]);
    const b = boardThreats(["9h", "8d", "7c"], ["As", "Kd"]);
    expect(a).toEqual(b);
  });
});
