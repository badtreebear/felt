import { describe, test, expect } from "vitest";
import { getRangeForSpot } from "../src/data/ranges/contextual-ranges.js";

// Part A acceptance: enumerate players 2-9 x every hero position x {RFI, vsRFI, vs3bet}
// and assert every realistic spot is usable, i.e. either:
//   - chartAvailable === true (a real chart or a graceful "showing X RFI" fallback), or
//   - kind === "walk" (folded to the BB - a check, no decision to train).
// Accepted edge cases that are allowed to lack a chart (per WP A4): 2-player
// contextual spots and 4+ bet scenarios (we do not enumerate 4+bets here).
// The user-facing "No RFI chart for ..." string must never appear anywhere.

const POSITION_BY_BUTTON_ORDER = {
  2: ["BTN/SB", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "CO"],
  5: ["BTN", "SB", "BB", "HJ", "CO"],
  6: ["BTN", "SB", "BB", "LJ", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG+2", "LJ", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG+1", "UTG+2", "LJ", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO"],
};

// Preflop action order (earliest to act -> latest).
const PREFLOP_ORDER = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];

function seatOf(position, players) {
  // With buttonSeat = 0, getSeatPositions maps seat i -> labels[i].
  return POSITION_BY_BUTTON_ORDER[players].indexOf(position);
}

function orderIndex(position) {
  return PREFLOP_ORDER.indexOf(position);
}

function isUsable(result) {
  return result.chartAvailable === true || result.kind === "walk";
}

const FORBIDDEN = /No RFI chart for/i;

describe("range chart coverage", () => {
  const failures = [];
  const forbidden = [];

  for (let players = 2; players <= 9; players += 1) {
    const positions = POSITION_BY_BUTTON_ORDER[players];
    const orderedPlay = positions.filter((p) => orderIndex(p) >= 0); // excludes HU "BTN/SB"

    positions.forEach((position) => {
      const heroSeat = seatOf(position, players);

      // --- RFI: nobody has raised ---
      const rfi = safe(() => getRangeForSpot({
        players,
        seat: heroSeat,
        position,
        hand: { buttonSeat: 0, preflop: { voluntaryRaiserSeat: null, raiseCount: 0, actionLog: [] } },
      }));
      record(rfi, { players, position, kind: "RFI" });

      if (players === 2) {
        return; // WP A4: heads-up contextual spots are an accepted edge case
      }

      // --- vs-RFI: one earlier position opens, hero defends ---
      const earlierOpeners = orderedPlay.filter((p) => orderIndex(p) < orderIndex(position));
      if (orderIndex(position) >= 0 && earlierOpeners.length > 0) {
        const opener = earlierOpeners[0];
        const openerSeat = seatOf(opener, players);
        const vsrfi = safe(() => getRangeForSpot({
          players,
          seat: heroSeat,
          position,
          hand: {
            buttonSeat: 0,
            preflop: {
              voluntaryRaiserSeat: openerSeat,
              raiseCount: 1,
              actionLog: [{ seat: openerSeat, action: "raises to" }],
            },
          },
        }));
        record(vsrfi, { players, position, kind: `vsRFI(${opener})` });
      }

      // --- vs-3bet: hero opens, a later position 3-bets, hero must continue ---
      const laterPlayers = orderedPlay.filter((p) => orderIndex(p) > orderIndex(position));
      if (orderIndex(position) >= 0 && position !== "BB" && laterPlayers.length > 0) {
        const threeBettor = laterPlayers[laterPlayers.length - 1];
        const threeBettorSeat = seatOf(threeBettor, players);
        const vs3bet = safe(() => getRangeForSpot({
          players,
          seat: heroSeat,
          position,
          hand: {
            buttonSeat: 0,
            preflop: {
              voluntaryRaiserSeat: heroSeat,
              aggressorSeat: threeBettorSeat,
              raiseCount: 2,
              actionLog: [
                { seat: heroSeat, action: "raises to" },
                { seat: threeBettorSeat, action: "3-bets to" },
              ],
            },
          },
        }));
        record(vs3bet, { players, position, kind: `vs3bet(${threeBettor})` });
      }
    });
  }

  function safe(fn) {
    try {
      return fn();
    } catch (error) {
      return { __threw: true, message: String(error && error.message) };
    }
  }

  function record(result, ctx) {
    const tag = `P${ctx.players} ${ctx.position} ${ctx.kind}`;
    if (result.__threw) {
      failures.push(`${tag} THREW: ${result.message}`);
      return;
    }
    if (!isUsable(result)) {
      failures.push(`${tag}: chartAvailable=${result.chartAvailable} kind=${result.kind} msg="${result.message || ""}"`);
    }
    if (result.message && FORBIDDEN.test(result.message)) {
      forbidden.push(`${tag}: "${result.message}"`);
    }
    if (result.title && FORBIDDEN.test(result.title)) {
      forbidden.push(`${tag} (title): "${result.title}"`);
    }
  }

  test("every realistic spot resolves to a chart, graceful RFI fallback, or BB walk", () => {
    expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
  });

  test('no "No RFI chart for ..." message ever leaks to the user', () => {
    expect(forbidden, `\n${forbidden.join("\n")}\n`).toEqual([]);
  });
});
