import { describe, expect, it } from "vitest";
import { dealHoldemHand } from "../src/engine/deck.js";
import {
  advancePreflopAction,
  applyHeroPreflopAction,
  legalHeroActions,
  startPreflopAction,
} from "../src/engine/preflop-action.js";

const BLINDS = { sb: 0.5, bb: 1 };

describe("preflop action engine", () => {
  it("is deterministic for the same seed, hand, and seat profiles", () => {
    const hand = dealHoldemHand({
      players: 6,
      heroSeat: 3,
      blinds: BLINDS,
      seed: "phase-four-determinism",
    });
    const config = tableConfig();
    const seatProfiles = {
      0: "standard",
      1: "nit",
      2: "lag",
      4: "station",
      5: "maniac",
    };

    const first = startPreflopAction({ hand, config, seatProfiles });
    const second = startPreflopAction({ hand, config, seatProfiles });

    expect(second.actionLog).toEqual(first.actionLog);
    expect(second.contributions).toEqual(first.contributions);
    expect(second.stacks).toEqual(first.stacks);
  });

  it("waits for the hero in preflop order and exposes legal actions", () => {
    const waiting = startPreflopAction({
      hand: fixedHand(),
      config: tableConfig(),
      seatProfiles: allVillains("standard"),
    });

    expect(waiting.status).toBe("waitingHero");
    expect(waiting.currentSeat).toBe(3);

    const legal = legalHeroActions(waiting);
    expect(legal.canAct).toBe(true);
    expect(legal.callAmount).toBe(1);
    expect(legal.minRaiseTo).toBe(2.5);
    expect(totalStacks(waiting) + waiting.pot).toBe(tableConfig().players * tableConfig().stack);
  });

  it("starts a new hand from carried table stacks", () => {
    const waiting = startPreflopAction({
      hand: fixedHand(),
      config: tableConfig({
        tableStacks: {
          0: 210,
          1: 190,
          2: 205,
          3: 180,
          4: 215,
          5: 200,
        },
      }),
      seatProfiles: allVillains("standard"),
    });

    expect(waiting.stacks).toMatchObject({
      0: 210,
      1: 189.5,
      2: 204,
      3: 180,
      4: 215,
      5: 200,
    });
    expect(totalStacks(waiting) + waiting.pot).toBe(1200);
  });

  it("can pause and advance automatic villain actions one at a time", () => {
    const paused = startPreflopAction({
      hand: fixedHand({ buttonSeat: 1 }),
      config: tableConfig(),
      seatProfiles: allVillains("nit"),
      autoActionLimit: 0,
    });

    expect(paused.status).toBe("active");
    expect(paused.toAct[0]).toBe(4);

    const next = advancePreflopAction(paused, { autoActionLimit: 1 });

    expect(next.status).toBe("active");
    expect(next.actionLog.at(-1)).toEqual({
      seat: 4,
      street: "preflop",
      action: "folds",
      size: 0,
    });
    expect(next.toAct[0]).toBe(5);
  });

  it("applies a hero raise, resolves folds, and pays the winner stack", () => {
    const waiting = startPreflopAction({
      hand: fixedHand(),
      config: tableConfig(),
      seatProfiles: allVillains("nit"),
    });

    const resolved = applyHeroPreflopAction(waiting, { action: "raise", raiseTo: 2.5 });

    expect(resolved.status).toBe("complete");
    expect(resolved.result).toBe("winner");
    expect(resolved.winnerSeat).toBe(3);
    expect(resolved.pot).toBe(4);
    expect(totalStacks(resolved)).toBe(tableConfig().players * tableConfig().stack);
    expect(resolved.stacks[3]).toBe(201.5);
    expect(resolved.actionLog).toContainEqual({
      seat: 3,
      street: "preflop",
      action: "raises to",
      size: 2.5,
    });
    expect(resolved.actionLog.at(-1)).toEqual({
      seat: 3,
      street: "preflop",
      action: "wins pot",
      size: 4,
    });
  });

  it("continues to the flop when hero limps and the big blind checks", () => {
    const waiting = startPreflopAction({
      hand: fixedHand(),
      config: tableConfig(),
      seatProfiles: allVillains("nit"),
    });

    const resolved = applyHeroPreflopAction(waiting, { action: "call" });

    expect(resolved.status).toBe("complete");
    expect(resolved.result).toBe("wouldSeeFlop");
    expect(resolved.winnerSeat).toBeNull();
    expect(resolved.pot).toBe(2.5);
    expect(totalStacks(resolved) + resolved.pot).toBe(tableConfig().players * tableConfig().stack);
    expect(resolved.actionLog).toContainEqual({
      seat: 2,
      street: "preflop",
      action: "checks",
      size: 0,
    });
    expect(resolved.actionLog.at(-1)).toEqual({
      seat: 2,
      street: "preflop",
      action: "preflop complete - would see flop",
      size: 2.5,
    });
  });

  it("uses the button as small blind heads-up", () => {
    const hand = dealHoldemHand({
      players: 2,
      heroSeat: 0,
      blinds: BLINDS,
      seed: "phase-four-heads-up",
    });
    const smallBlind = hand.actionLog.find((entry) => entry.action === "small blind");
    const bigBlind = hand.actionLog.find((entry) => entry.action === "big blind");

    expect(smallBlind.seat).toBe(hand.buttonSeat);
    expect(bigBlind.seat).not.toBe(hand.buttonSeat);
  });
});

function tableConfig(overrides = {}) {
  return {
    players: 6,
    heroSeat: 3,
    blinds: BLINDS,
    stack: 200,
    ...overrides,
  };
}

function allVillains(profile) {
  return {
    0: profile,
    1: profile,
    2: profile,
    4: profile,
    5: profile,
  };
}

function fixedHand(overrides = {}) {
  return {
    seed: "fixed-preflop",
    buttonSeat: 0,
    holeCards: {
      0: ["2c", "7d"],
      1: ["3c", "8d"],
      2: ["4c", "9d"],
      3: ["As", "Ad"],
      4: ["5c", "Td"],
      5: ["6c", "Jd"],
    },
    actionLog: [
      { seat: 0, street: "preflop", action: "dealer button", size: 0 },
      { seat: 1, street: "preflop", action: "small blind", size: 0.5 },
      { seat: 2, street: "preflop", action: "big blind", size: 1 },
      { seat: 3, street: "preflop", action: "hero dealt in", size: 0 },
    ],
    ...overrides,
  };
}

function totalStacks(phase) {
  return Object.values(phase.stacks).reduce((sum, stack) => sum + stack, 0);
}
