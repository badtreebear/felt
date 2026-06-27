// Heads-up short-stack push/fold hand-sets (Phase 16, slice A4). PURE.
//
// Villains need to play the short-stack game the same way the trainer grades it:
// when the effective stack is in push/fold territory, the opener jams-or-folds
// and the defender calls-or-folds. This module exposes the relevant hand-sets,
// selected by effective stack in bb, by reusing the very same chart JSONs the
// UI/coach read — so engine behaviour and on-screen ranges can't drift apart.

import { openDepth } from "./stack-depth.js";
import { handKeyToCombos } from "./ranges.js";
import jam10Chart from "../data/ranges/default-2max-pushfold.json";
import jam15Chart from "../data/ranges/default-2max-pushfold-15bb.json";
import caller10Chart from "../data/ranges/default-2max-bb-calljam-10bb.json";
import caller15Chart from "../data/ranges/default-2max-bb-calljam-15bb.json";

// The ~12.5bb split mirrors headsUpChartKey in opening-ranges.js /
// headsUpDefendRange in contextual-ranges.js: under ~12.5bb use the ~10bb
// charts, in the upper push/fold band use the ~15bb charts.
const JAM_SPLIT_BB = 12.5;

const jam10 = new Set(Object.keys(jam10Chart.positions.BTN));
const jam15 = new Set(Object.keys(jam15Chart.positions.BTN));
const caller10 = new Set(Object.keys(caller10Chart.spots.BB_vs_BTNSB.actions));
const caller15 = new Set(Object.keys(caller15Chart.spots.BB_vs_BTNSB.actions));

function shortDepth(effBb) {
  return openDepth(effBb) === "pushfold";
}

function jamHands(effBb) {
  return Number(effBb) <= JAM_SPLIT_BB ? jam10 : jam15;
}

function callerHands(effBb) {
  return Number(effBb) <= JAM_SPLIT_BB ? caller10 : caller15;
}

/**
 * What a heads-up villain should do at push/fold depth.
 *
 * @param {{ effBb: number|null, players: number, hand: string|null, facingOpen: boolean }} args
 *   facingOpen: false = this seat is first in (the opener); true = a raise/jam is
 *   already in front of this seat (the defender).
 * @returns {"jam"|"call"|"fold"|null} null when push/fold play doesn't apply
 *   (not heads-up, or the stacks are deep enough for normal play).
 */
export function headsUpPushFoldAction({ effBb, players, hand, facingOpen }) {
  if (players !== 2 || !shortDepth(effBb)) {
    return null;
  }

  if (!hand) {
    return "fold";
  }

  if (facingOpen) {
    return callerHands(effBb).has(hand) ? "call" : "fold";
  }

  return jamHands(effBb).has(hand) ? "jam" : "fold";
}

const TOTAL_PREFLOP_COMBOS = 1326;

/**
 * The heads-up BB calling range vs an open-jam at the given depth, as an
 * expanded weighted combo list (for the equity sim) plus the unconditional call
 * frequency (calling combos / 1326). Returns null when not push/fold depth.
 *
 * @param {number|null} effBb
 * @returns {{ hands: Set<string>, combos: Array<{hand:string,cards:string[],weight:number}>, callFreq: number }|null}
 */
export function headsUpCallerRange(effBb) {
  if (!shortDepth(effBb)) {
    return null;
  }

  const hands = callerHands(effBb);
  const combos = [...hands].flatMap((hand) => (
    handKeyToCombos(hand).map((cards) => ({ hand, cards, weight: 1 }))
  ));

  return { hands, combos, callFreq: combos.length / TOTAL_PREFLOP_COMBOS };
}
