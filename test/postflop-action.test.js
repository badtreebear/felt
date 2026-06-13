import { describe, expect, it } from "vitest";
import {
  applyHeroPostflopAction,
  legalPostflopActions,
  startPostflopStreet,
} from "../src/engine/postflop-action.js";

describe("postflop action engine", () => {
  it("continues from completed preflop to a deterministic flop action state", () => {
    const hand = fixedHand();
    const config = tableConfig({ players: 4, heroSeat: 2 });
    const first = startPostflopStreet({
      hand,
      config,
      street: "flop",
      seatProfiles: allVillains("standard", [2]),
    });
    const second = startPostflopStreet({
      hand,
      config,
      street: "flop",
      seatProfiles: allVillains("standard", [2]),
    });

    expect(first.board).toEqual(["As", "7h", "2c"]);
    expect(second.actionLog).toEqual(first.actionLog);
    expect(second.stacks).toEqual(first.stacks);
    expect(second.status).toBe(first.status);
  });

  it("lets hero fold facing a postflop bet and awards the bettor", () => {
    const postflop = startPostflopStreet({
      hand: headsUpHand({
        boardRunout: ["As", "7h", "2c", "9d", "4s"],
        villainCards: ["Ad", "Ac"],
        heroCards: ["Kd", "Qd"],
      }),
      config: tableConfig({ players: 2, heroSeat: 1 }),
      street: "flop",
      seatProfiles: { 0: "standard" },
    });

    expect(postflop.status).toBe("waitingHero");
    expect(postflop.currentSeat).toBe(1);
    expect(legalPostflopActions(postflop).callAmount).toBe(5);
    expect(totalStacks(postflop) + postflop.pot).toBe(210);

    const resolved = applyHeroPostflopAction(postflop, { action: "fold" });

    expect(resolved.status).toBe("complete");
    expect(resolved.result).toBe("winner");
    expect(resolved.winnerSeat).toBe(0);
    expect(resolved.stacks[0]).toBe(110);
    expect(totalStacks(resolved)).toBe(210);
    expect(resolved.folded[1]).toBe(true);
  });

  it("continues from a completed turn to river showdown and splits tied winners", () => {
    const river = startPostflopStreet({
      hand: headsUpHand({
        boardRunout: ["Ah", "Kd", "Qs", "Jc", "Td"],
        villainCards: ["2c", "3d"],
        heroCards: ["4c", "5d"],
        postflop: completedTurn(),
      }),
      config: tableConfig({ players: 2, heroSeat: 1 }),
      street: "river",
      seatProfiles: { 0: "standard" },
    });

    expect(river.status).toBe("waitingHero");
    expect(river.board).toEqual(["Ah", "Kd", "Qs", "Jc", "Td"]);

    const showdown = applyHeroPostflopAction(river, { action: "call" });

    expect(showdown.status).toBe("complete");
    expect(showdown.result).toBe("showdown");
    expect(showdown.winnerSeats).toEqual([0, 1]);
    expect(showdown.stacks[0]).toBe(105);
    expect(showdown.stacks[1]).toBe(105);
    expect(totalStacks(showdown)).toBe(210);
  });

  it("preserves total money when an odd half-chip pot is split three ways", () => {
    const river = startPostflopStreet({
      hand: threeWayChopHand(),
      config: tableConfig({ players: 3, heroSeat: 2 }),
      street: "river",
      seatProfiles: {
        0: "standard",
        1: "standard",
      },
    });

    expect(river.status).toBe("waitingHero");
    expect(river.pot).toBe(20);
    expect(totalStacks(river) + river.pot).toBe(310);

    const showdown = applyHeroPostflopAction(river, { action: "call" });

    expect(showdown.status).toBe("complete");
    expect(showdown.result).toBe("showdown");
    expect(showdown.winnerSeats).toEqual([0, 1, 2]);
    expect(showdown.pot).toBe(25);
    expect(totalStacks(showdown)).toBe(310);
    expect(showdown.stacks).toEqual({
      0: 103.5,
      1: 103.5,
      2: 103,
    });
  });
});

function tableConfig(overrides = {}) {
  return {
    players: 4,
    heroSeat: 2,
    blinds: { sb: 0.5, bb: 1 },
    stack: 200,
    ...overrides,
  };
}

function fixedHand() {
  return {
    seed: "postflop-fixed",
    buttonSeat: 0,
    boardRunout: ["As", "7h", "2c", "9d", "4s"],
    holeCards: {
      0: ["8d", "3d"],
      1: ["Ad", "Ac"],
      2: ["Kd", "Qd"],
      3: ["6c", "5c"],
    },
    preflop: completedPreflop({ players: 4 }),
  };
}

function headsUpHand({ boardRunout, villainCards, heroCards, postflop = null }) {
  return {
    seed: "postflop-heads-up",
    buttonSeat: 1,
    boardRunout,
    holeCards: {
      0: villainCards,
      1: heroCards,
    },
    preflop: completedPreflop({ players: 2, pot: 10, stacks: { 0: 100, 1: 100 }, contributions: { 0: 5, 1: 5 } }),
    postflop,
  };
}

function completedPreflop({ players, pot = 10, stacks, contributions } = {}) {
  return {
    status: "complete",
    result: "wouldSeeFlop",
    pot,
    folded: Object.fromEntries(Array.from({ length: players }, (_, seat) => [seat, false])),
    allIn: Object.fromEntries(Array.from({ length: players }, (_, seat) => [seat, false])),
    stacks: stacks || Object.fromEntries(Array.from({ length: players }, (_, seat) => [seat, 100])),
    contributions: contributions || Object.fromEntries(Array.from({ length: players }, (_, seat) => [seat, seat < 2 ? 5 : 0])),
    actionLog: [
      { seat: 0, street: "preflop", action: "preflop complete - would see flop", size: pot },
    ],
  };
}

function completedTurn() {
  return {
    ...completedPreflop({ players: 2, pot: 10, stacks: { 0: 100, 1: 100 }, contributions: { 0: 5, 1: 5 } }),
    status: "streetComplete",
    result: "nextStreet",
    street: "turn",
    board: ["Ah", "Kd", "Qs", "Jc"],
    streetContributions: { 0: 0, 1: 0 },
  };
}

function threeWayChopHand() {
  return {
    seed: "postflop-three-way-chop",
    buttonSeat: 2,
    boardRunout: ["Ah", "Kd", "Qs", "Jc", "Td"],
    holeCards: {
      0: ["2c", "3d"],
      1: ["4c", "5d"],
      2: ["6c", "7d"],
    },
    preflop: completedPreflop({
      players: 3,
      pot: 10,
      stacks: { 0: 100, 1: 100, 2: 100 },
      contributions: { 0: 3.5, 1: 3.5, 2: 3 },
    }),
  };
}

function allVillains(profile, heroSeats = []) {
  return Object.fromEntries(
    Array.from({ length: 4 }, (_, seat) => seat)
      .filter((seat) => !heroSeats.includes(seat))
      .map((seat) => [seat, profile]),
  );
}

function totalStacks(phase) {
  return Object.values(phase.stacks).reduce((sum, stack) => sum + stack, 0);
}
