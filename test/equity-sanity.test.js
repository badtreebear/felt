import { describe, expect, it } from "vitest";
import { expandPositionRange } from "../src/engine/ranges.js";
import { runEquitySimulation } from "../src/engine/equity.js";

describe("equity sanity checks", () => {
  it("AA vs KK preflop is about 81/19 heads up", () => {
    const result = runEquitySimulation({
      heroCards: ["As", "Ah"],
      opponents: [{ type: "exact", cards: ["Kc", "Kd"] }],
      iterations: 20000,
      seed: "aa-vs-kk",
    });

    expect(result.heroEquity).toBeGreaterThan(0.79);
    expect(result.heroEquity).toBeLessThan(0.83);
  }, 12000);

  it("AKs vs 22 preflop is a coin flip with 22 slightly ahead", () => {
    const result = runEquitySimulation({
      heroCards: ["As", "Ks"],
      opponents: [{ type: "exact", cards: ["2c", "2d"] }],
      iterations: 20000,
      seed: "aks-vs-22",
    });

    expect(result.heroEquity).toBeGreaterThan(0.48);
    expect(result.heroEquity).toBeLessThan(0.53);
  }, 12000);

  it("a naked flop flush draw has about 35% equity by the river", () => {
    const result = runEquitySimulation({
      heroCards: ["7h", "8h"],
      board: ["Ah", "Kh", "2c"],
      opponents: [{ type: "exact", cards: ["As", "Qd"] }],
    });

    expect(result.exact).toBe(true);
    expect(result.heroEquity).toBeGreaterThan(0.33);
    expect(result.heroEquity).toBeLessThan(0.38);
  });

  it("uses exact enumeration for one random hand on the river", () => {
    const result = runEquitySimulation({
      heroCards: ["As", "Ks"],
      board: ["Qs", "Js", "Ts", "2d", "3c"],
      opponents: [{ type: "random" }],
      iterations: 1,
      seed: "river-exact",
    });

    expect(result.exact).toBe(true);
    expect(result.iterations).toBe(990);
    expect(result.heroEquity).toBe(1);
    expect(result.tieRate).toBe(0);
  });

  it("credits exact chopped pots as split equity, not zero", () => {
    const result = runEquitySimulation({
      heroCards: ["2c", "3d"],
      board: ["Ah", "Kd", "Qs", "Jc", "Tc"],
      opponents: [{ type: "exact", cards: ["2s", "3h"] }],
      iterations: 1,
      seed: "low-cards-board-chop",
    });

    expect(result.exact).toBe(true);
    expect(result.heroEquity).toBeCloseTo(0.5, 6);
    expect(result.winRate).toBe(0);
    expect(result.tieRate).toBe(1);
  });

  it("credits preflop chop-heavy ties as split equity, not win-only", () => {
    const result = runEquitySimulation({
      heroCards: ["2c", "3d"],
      opponents: [{ type: "exact", cards: ["2s", "3h"] }],
      iterations: 5000,
      seed: "preflop-low-card-chop",
      progressEvery: 5000,
    });

    expect(result.heroEquity).toBeGreaterThan(0.49);
    expect(result.heroEquity).toBeLessThan(0.51);
    expect(result.winRate).toBeLessThan(0.05);
    expect(result.tieRate).toBeGreaterThan(0.9);
  }, 10000);

  it("credits tie-split equity for A6o against five random hands", () => {
    const result = runEquitySimulation({
      heroCards: ["Ah", "6c"],
      opponents: Array.from({ length: 5 }, () => ({ type: "random" })),
      iterations: 8000,
      seed: "a6-vs-five-random",
      progressEvery: 8000,
    });

    expect(result.heroEquity).toBeGreaterThan(0.161);
    expect(result.heroEquity).toBeLessThan(0.191);
    expect(result.winRate).toBeLessThan(result.heroEquity);
  }, 15000);

  it("is deterministic for identical seed and spot", () => {
    const input = {
      heroCards: ["Ah", "6c"],
      villains: Array.from({ length: 5 }, () => ({ type: "random" })),
      iterations: 2000,
      seed: "determinism-random",
      progressEvery: 2000,
    };

    expect(runEquitySimulation(input)).toEqual(runEquitySimulation(input));
  });

  it("uses revealed villain cards as exact cards", () => {
    const result = runEquitySimulation({
      heroCards: ["Ah", "As"],
      villains: [{ type: "cards", cards: ["Kh", "Ks"] }],
      iterations: 20000,
      seed: "aa-vs-revealed-kk",
      progressEvery: 20000,
    });

    expect(result.heroEquity).toBeGreaterThan(0.804);
    expect(result.heroEquity).toBeLessThan(0.834);
  }, 12000);

  it("samples weighted range villains deterministically", () => {
    const aaOnlyRange = expandPositionRange({ AA: 1 });
    const input = {
      heroCards: ["Kh", "Ks"],
      villains: [{ type: "range", range: aaOnlyRange }],
      iterations: 20000,
      seed: "kk-vs-aa-range",
      progressEvery: 20000,
    };
    const first = runEquitySimulation(input);
    const second = runEquitySimulation(input);

    expect(first).toEqual(second);
    expect(first.heroEquity).toBeGreaterThan(0.166);
    expect(first.heroEquity).toBeLessThan(0.196);
  }, 12000);
});
