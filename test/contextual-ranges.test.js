import { describe, expect, it } from "vitest";
import { getRangeForSpot } from "../src/data/ranges/contextual-ranges.js";
import { getOpeningRange } from "../src/data/ranges/opening-ranges.js";
import { getSeatPositions } from "../src/engine/positions.js";
import {
  actionRangeComboCounts,
  validateVsThreeBetChart,
  validateVsRfiChart,
} from "../src/engine/ranges.js";
import pokerCoachingVsThreeBetChart from "../src/data/ranges/default-vs3bet-9max.json";
import pokerCoachingVsRfiChart from "../src/data/ranges/default-vsrfi-9max.json";

describe("getRangeForSpot", () => {
  it("keeps first-in spots on the existing RFI chart", () => {
    const range = getRangeForSpot({
      players: 9,
      seat: 8,
      position: "CO",
      hand: handState({ buttonSeat: 0 }),
    });
    const opening = getOpeningRange({ players: 9, position: "CO" });

    expect(range.kind).toBe("rfi");
    expect(range.title).toBe("CO - open (RFI)");
    expect(range.grid).toEqual(opening.grid);
  });

  it("selects the 6-max SB RFI chart when the small blind is first in", () => {
    const range = getRangeForSpot({
      players: 6,
      seat: 1,
      position: "SB",
      hand: handState({ buttonSeat: 0 }),
    });

    expect(range.kind).toBe("rfi");
    expect(range.title).toBe("SB - open (RFI)");
    expect(range.chartAvailable).toBe(true);
    expect(range.tableSize).toBe(6);
    expect(range.combos).toHaveLength(838);
  });

  it("selects the defend chart when a seat faces one open", () => {
    const range = getRangeForSpot({
      players: 9,
      seat: 2,
      position: "BB",
      hand: handState({
        buttonSeat: 0,
        preflop: raisedPot({ openerSeat: 0 }),
      }),
    });

    expect(range.kind).toBe("vsRfi");
    expect(range.title).toBe("BB vs BTN open - defend");
    expect(range.grid[0][0]).toEqual({ action: "threeBetValue", weight: 1 });
    expect(range.actions.A5s).toBe("call");
    expect(range.combos).toEqual({
      threeBetValue: 44,
      threeBetBluff: 40,
      call: 314,
    });
  });

  it("keeps seats that acted before the opener on their first-in chart", () => {
    const range = getRangeForSpot({
      players: 9,
      seat: 3,
      position: "UTG",
      hand: handState({
        buttonSeat: 0,
        preflop: raisedPot({
          openerSeat: 8,
          actionLog: [
            { seat: 3, street: "preflop", action: "folds", size: 0 },
            { seat: 8, street: "preflop", action: "raises to", size: 2.5 },
          ],
        }),
      }),
    });

    expect(range.kind).toBe("rfi");
    expect(range.title).toBe("UTG - open (RFI)");
  });

  it("falls back when the pot is already 3-bet", () => {
    const range = getRangeForSpot({
      players: 9,
      seat: 2,
      position: "BB",
      hand: handState({
        buttonSeat: 0,
        preflop: raisedPot({ openerSeat: 0, raiseCount: 2 }),
      }),
    });

    expect(range.kind).toBe("fallback");
    expect(range.title).toContain("facing a 3-bet");
    // The message explains the re-raised spot is deliberately uncharted and what
    // to do instead. Assert on stable meaning, not exact marketing copy.
    expect(range.message).toMatch(/facing a 3-bet/i);
    expect(range.message).toMatch(/Bet tip|equity/i);
  });

  it("selects the continuation chart when the opener faces a 3-bet", () => {
    const range = getRangeForSpot({
      players: 9,
      seat: 3,
      position: "UTG",
      hand: handState({
        buttonSeat: 0,
        preflop: raisedPot({
          openerSeat: 3,
          raiseCount: 2,
          aggressorSeat: 4,
          actionLog: [
            { seat: 3, street: "preflop", action: "raises to", size: 2.5 },
            { seat: 4, street: "preflop", action: "3-bets to", size: 8 },
          ],
        }),
      }),
    });

    expect(range.kind).toBe("vs3bet");
    expect(range.title).toBe("UTG vs UTG+1 3-bet - continue");
    expect(range.grid[0][0]).toEqual({ action: "fourBetValue", weight: 1 });
    expect(range.actions.AQs).toBe("call");
    expect(range.combos).toEqual({
      fourBetValue: 28,
      fourBetBluff: 20,
      call: 50,
    });
    expect(range.foldToThreeBetCombos).toBe(36);
    expect(range.openingRangeCombos).toBe(134);
  });

  it("falls back for multiway open-and-call spots", () => {
    const range = getRangeForSpot({
      players: 9,
      seat: 2,
      position: "BB",
      hand: handState({
        buttonSeat: 0,
        preflop: raisedPot({
          openerSeat: 0,
          actionLog: [
            { seat: 0, street: "preflop", action: "raises to", size: 2.5 },
            { seat: 1, street: "preflop", action: "calls", size: 2.5 },
          ],
        }),
      }),
    });

    expect(range.kind).toBe("fallback");
    expect(range.title).toContain("multiway");
    expect(range.message).toContain("no longer applies");
  });

  it("resolves every 6-max first-in opener to a real RFI chart", () => {
    SIX_MAX_OPENERS.forEach((position) => {
      const seat = seatForSixMaxPosition(position);
      const range = getRangeForSpot({
        players: 6,
        seat,
        position,
        hand: handState({ buttonSeat: SIX_MAX_BUTTON_SEAT }),
      });

      expect(range.kind, position).toBe("rfi");
      expect(range.chartAvailable, position).toBe(true);
      expect(range.title, position).toBe(`${position} - open (RFI)`);
      expect(range.grid, position).toHaveLength(13);
    });
  });

  it("resolves every legal 6-max facing-RFI pair to a real defend chart", () => {
    sixMaxPairs().forEach(({ openerPosition, responderPosition }) => {
      const range = getRangeForSpot({
        players: 6,
        seat: seatForSixMaxPosition(responderPosition),
        position: responderPosition,
        hand: handState({
          buttonSeat: SIX_MAX_BUTTON_SEAT,
          preflop: raisedPot({
            openerSeat: seatForSixMaxPosition(openerPosition),
          }),
        }),
      });

      expect(range.kind, `${responderPosition} vs ${openerPosition}`).toBe("vsRfi");
      expect(range.chartAvailable, `${responderPosition} vs ${openerPosition}`).toBe(true);
      expect(range.title, `${responderPosition} vs ${openerPosition}`).toBe(`${responderPosition} vs ${openerPosition} open - defend`);
      expect(range.grid, `${responderPosition} vs ${openerPosition}`).toHaveLength(13);
    });
  });

  it("resolves every legal 6-max opener-facing-3-bet pair to a continuation chart", () => {
    sixMaxPairs().forEach(({ openerPosition, responderPosition: threeBettorPosition }) => {
      const range = getRangeForSpot({
        players: 6,
        seat: seatForSixMaxPosition(openerPosition),
        position: openerPosition,
        hand: handState({
          buttonSeat: SIX_MAX_BUTTON_SEAT,
          preflop: raisedPot({
            openerSeat: seatForSixMaxPosition(openerPosition),
            raiseCount: 2,
            aggressorSeat: seatForSixMaxPosition(threeBettorPosition),
            actionLog: [
              { seat: seatForSixMaxPosition(openerPosition), street: "preflop", action: "raises to", size: 2.5 },
              { seat: seatForSixMaxPosition(threeBettorPosition), street: "preflop", action: "3-bets to", size: 8 },
            ],
          }),
        }),
      });

      expect(range.kind, `${openerPosition} vs ${threeBettorPosition}`).toBe("vs3bet");
      expect(range.chartAvailable, `${openerPosition} vs ${threeBettorPosition}`).toBe(true);
      expect(range.title, `${openerPosition} vs ${threeBettorPosition}`).toBe(`${openerPosition} vs ${threeBettorPosition} 3-bet - continue`);
      expect(range.grid, `${openerPosition} vs ${threeBettorPosition}`).toHaveLength(13);
    });
  });
});

describe("PokerCoaching Facing RFI data", () => {
  it("validates every shipped spot and combo checksum", () => {
    expect(() => validateVsRfiChart(pokerCoachingVsRfiChart)).not.toThrow();
    expect(Object.keys(pokerCoachingVsRfiChart.spots)).toHaveLength(31);

    Object.values(pokerCoachingVsRfiChart.spots).forEach((spot) => {
      expect(actionRangeComboCounts(spot.actions)).toEqual(spot.comboCounts);
    });
  });

  it("includes high-frequency blind defense spots", () => {
    expect(pokerCoachingVsRfiChart.spots.BB_vs_BTN.comboCounts).toEqual({
      threeBetValue: 44,
      threeBetBluff: 40,
      call: 314,
    });
    expect(pokerCoachingVsRfiChart.spots.BB_vs_CO.comboCounts.call).toBe(726);
    expect(pokerCoachingVsRfiChart.spots.SB_vs_BTN.comboCounts.threeBetBluff).toBe(180);
  });
});

describe("PokerCoaching RFI vs 3-bet data", () => {
  it("validates every shipped spot and combo-percentage checksum", () => {
    expect(() => validateVsThreeBetChart(pokerCoachingVsThreeBetChart)).not.toThrow();
    expect(Object.keys(pokerCoachingVsThreeBetChart.spots)).toHaveLength(28);

    Object.values(pokerCoachingVsThreeBetChart.spots).forEach((spot) => {
      expect(actionRangeComboCounts(spot.actions)).toEqual(spot.comboCounts);

      const continueCombos = Object.values(spot.comboCounts).reduce((sum, count) => sum + count, 0);
      expect(continueCombos + spot.foldToThreeBetCombos).toBe(spot.openingRangeCombos);
      expect(spot.openingRangeCombos + spot.notInOpeningRangeCombos).toBe(1326);
    });
  });

  it("includes representative late-position continuation spots", () => {
    expect(pokerCoachingVsThreeBetChart.spots.CO_vs_BTN_SB.comboCounts).toEqual({
      fourBetValue: 46,
      fourBetBluff: 56,
      call: 144,
    });
    expect(pokerCoachingVsThreeBetChart.spots.BTN_vs_SB_BB.comboCounts.call).toBe(246);
    expect(pokerCoachingVsThreeBetChart.spots.SB_vs_BB.foldToThreeBetCombos).toBe(104);
  });
});

function handState({ buttonSeat, preflop = null }) {
  return {
    buttonSeat,
    preflop,
  };
}

function raisedPot({ openerSeat, raiseCount = 1, aggressorSeat = openerSeat, actionLog } = {}) {
  return {
    status: "waitingHero",
    raiseCount,
    voluntaryRaiserSeat: openerSeat,
    aggressorSeat,
    actionLog: actionLog || [
      { seat: openerSeat, street: "preflop", action: "raises to", size: 2.5 },
    ],
  };
}

const SIX_MAX_BUTTON_SEAT = 0;
const SIX_MAX_ACTION_ORDER = ["LJ", "HJ", "CO", "BTN", "SB", "BB"];
const SIX_MAX_OPENERS = SIX_MAX_ACTION_ORDER.slice(0, -1);

function sixMaxPairs() {
  return SIX_MAX_OPENERS.flatMap((openerPosition) => {
    const openerIndex = SIX_MAX_ACTION_ORDER.indexOf(openerPosition);

    return SIX_MAX_ACTION_ORDER.slice(openerIndex + 1).map((responderPosition) => ({
      openerPosition,
      responderPosition,
    }));
  });
}

function seatForSixMaxPosition(position) {
  const positions = getSeatPositions({ players: 6, buttonSeat: SIX_MAX_BUTTON_SEAT });
  const entry = Object.entries(positions).find(([, seatPosition]) => seatPosition === position);

  if (!entry) {
    throw new Error(`No 6-max seat for position: ${position}`);
  }

  return Number(entry[0]);
}
