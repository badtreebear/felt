import { describe, expect, it } from "vitest";
import { dealHoldemHand } from "../src/engine/deck.js";
import { startPreflopAction, advancePreflopAction, applyHeroPreflopAction } from "../src/engine/preflop-action.js";
import { startPostflopStreet, advancePostflopAction, applyHeroPostflopAction } from "../src/engine/postflop-action.js";

describe("engine determinism", () => {
  it("generates identical serialized state for the same seed across two identical action sequences", () => {
    function simulateFixedHand(seed) {
      const config = { players: 6, heroSeat: 3, blinds: { sb: 0.5, bb: 1 }, stack: 200, tableStacks: { 0: 200, 1: 200, 2: 200, 3: 200, 4: 200, 5: 200 } };
      const hand = dealHoldemHand({ players: 6, heroSeat: 3, blinds: config.blinds, seed });
      const seatProfiles = { 0: "standard", 1: "standard", 2: "standard", 4: "standard", 5: "standard" };
      
      let preflop = startPreflopAction({ hand, config, seatProfiles, autoActionLimit: Infinity });
      
      // Auto actions until hero
      while (preflop.status === "active") {
        preflop = advancePreflopAction(preflop, { autoActionLimit: Infinity });
      }

      if (preflop.status === "waitingHero") {
        preflop = applyHeroPreflopAction(preflop, { action: "call", raiseTo: 0 }, { autoActionLimit: Infinity });
        while (preflop.status === "active") {
          preflop = advancePreflopAction(preflop, { autoActionLimit: Infinity });
        }
      }
      
      hand.preflop = preflop;
      hand.pot = preflop.pot;

      if (preflop.result !== "wouldSeeFlop") {
        return { hand, finalStacks: preflop.stacks };
      }

      let postflop = startPostflopStreet({ hand, config, street: "flop", seatProfiles, autoActionLimit: Infinity });
      while (postflop.status === "active") {
        postflop = advancePostflopAction(postflop, { autoActionLimit: Infinity });
      }

      if (postflop.status === "waitingHero") {
        postflop = applyHeroPostflopAction(postflop, { action: "check", betAmount: 0 }, { autoActionLimit: Infinity });
        while (postflop.status === "active") {
          postflop = advancePostflopAction(postflop, { autoActionLimit: Infinity });
        }
      }

      hand.postflop = postflop;
      return { hand, finalStacks: postflop.stacks };
    }

    const firstRun = simulateFixedHand("determinism-test-seed");
    const secondRun = simulateFixedHand("determinism-test-seed");

    expect(JSON.stringify(firstRun)).toBe(JSON.stringify(secondRun));
  });
});
