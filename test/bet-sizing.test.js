import { describe, expect, it } from "vitest";
import { recommendHeroSize, boardTextureScore } from "../src/engine/bet-sizing.js";

describe("board texture", () => {
  it("scores a rainbow disconnected board as dry", () => {
    expect(boardTextureScore(["As", "8d", "2c"])).toBeLessThan(0.3);
  });

  it("scores a connected two-tone board as wetter", () => {
    expect(boardTextureScore(["9h", "8h", "7c"])).toBeGreaterThan(0.5);
  });

  it("returns neutral-dry with no board (preflop)", () => {
    expect(boardTextureScore([])).toBe(0);
  });
});

describe("recommendHeroSize", () => {
  it("is pending until equity is known", () => {
    expect(recommendHeroSize({ pot: 10, equity: null }).status).toBe("pending");
  });

  it("always returns a pot-fraction and a worked amount (one consistent helper)", () => {
    const rec = recommendHeroSize({ facingBet: false, pot: 10, equity: 0.65, board: ["As", "8d", "2c"], minAmount: 1, maxAmount: 100 });
    expect(rec.status).toBe("ready");
    expect(rec.mode).toBe("bet");
    expect(typeof rec.fractionPct).toBe("number");
    expect(rec.amount).toBeGreaterThan(0);
  });

  it("advises a check on marginal hands when first in but still shows a size", () => {
    const rec = recommendHeroSize({ facingBet: false, pot: 10, equity: 0.35, board: ["As", "8d", "2c"], minAmount: 1, maxAmount: 100 });
    expect(rec.advice).toBe("check");
    expect(rec.fractionPct).toBeGreaterThan(0);
    expect(rec.amount).toBeGreaterThan(0);
  });

  it("advises call/fold (not raise) on marginal hands facing a bet", () => {
    const rec = recommendHeroSize({ facingBet: true, pot: 10, toCall: 6, equity: 0.3, board: ["As", "8d", "2c"], minAmount: 8, maxAmount: 100 });
    expect(rec.advice).toBe("callFold");
    expect(rec.mode).toBe("raise");
  });

  it("sizes bigger with strong equity on a wet board than a dry one", () => {
    const wet = recommendHeroSize({ facingBet: false, pot: 10, equity: 0.8, board: ["9h", "8h", "7c"], minAmount: 1, maxAmount: 100 });
    const dry = recommendHeroSize({ facingBet: false, pot: 10, equity: 0.8, board: ["As", "8d", "2c"], minAmount: 1, maxAmount: 100 });
    expect(wet.advice).toBe("value");
    expect(wet.amount).toBeGreaterThan(dry.amount);
  });

  it("jams when the sized bet commits most of a short stack", () => {
    const rec = recommendHeroSize({ facingBet: false, pot: 20, equity: 0.8, board: ["Kd", "7s", "2c"], minAmount: 1, maxAmount: 12 });
    expect(rec.shove).toBe(true);
    expect(rec.amount).toBe(12);
  });

  it("clamps to the legal minimum", () => {
    const rec = recommendHeroSize({ facingBet: false, pot: 2, equity: 0.7, board: ["Ks", "7d", "2c"], minAmount: 3, maxAmount: 100 });
    expect(rec.amount).toBeGreaterThanOrEqual(3);
  });
});
