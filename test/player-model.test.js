import { describe, expect, it } from "vitest";
import pokerCoachingRfiChart from "../src/data/ranges/default-rfi-9max.json";
import {
  PLAYER_MODEL_CONSTANTS,
  adjustedOpeningRange,
  canonicalHandKey,
  openingSizeForPosition,
  profileComboReport,
} from "../src/engine/player-model.js";

describe("player model", () => {
  it("keeps the standard profile equal to the loaded RFI chart", () => {
    const range = adjustedOpeningRange({ position: "UTG", profile: "standard" });
    const chartHands = chartHandSet("UTG");

    expect(range.comboCount).toBe(pokerCoachingRfiChart.meta.comboCounts.UTG);
    expect(range.hands).toEqual(chartHands);
  });

  it("widens and tightens ranges by profile while retaining premiums", () => {
    const standard = adjustedOpeningRange({ position: "CO", profile: "standard" });
    const nit = adjustedOpeningRange({ position: "CO", profile: "nit" });
    const station = adjustedOpeningRange({ position: "CO", profile: "station" });
    const maniac = adjustedOpeningRange({ position: "CO", profile: "maniac" });

    expect(nit.comboCount).toBeLessThan(standard.comboCount);
    expect(station.comboCount).toBeGreaterThan(standard.comboCount);
    expect(maniac.comboCount).toBeGreaterThan(station.comboCount);

    for (const premium of PLAYER_MODEL_CONSTANTS.premiumHands) {
      expect(nit.hands.has(premium)).toBe(true);
      expect(station.hands.has(premium)).toBe(true);
    }
  });

  it("uses a tightened button range as the SB and heads-up BTN/SB baseline", () => {
    const button = adjustedOpeningRange({ position: "BTN", profile: "standard" });
    const smallBlind = adjustedOpeningRange({ position: "SB", profile: "standard" });
    const headsUpButton = adjustedOpeningRange({ position: "BTN/SB", profile: "standard" });

    expect(smallBlind.chartPosition).toBe("BTN");
    expect(headsUpButton.chartPosition).toBe("BTN");
    expect(smallBlind.comboCount).toBeLessThan(button.comboCount);
    expect(headsUpButton.comboCount).toBe(smallBlind.comboCount);
    expect(openingSizeForPosition("SB", "standard")).toBe(3);
    expect(openingSizeForPosition("BTN/SB", "standard")).toBe(3);
  });

  it("reports profile combo counts in profile order for tuning review", () => {
    const report = profileComboReport(["UTG", "CO", "BTN"]);

    expect(report.nit.UTG).toBeLessThan(report.standard.UTG);
    expect(report.standard.CO).toBe(pokerCoachingRfiChart.meta.comboCounts.CO);
    expect(report.lag.BTN).toBeGreaterThan(report.standard.BTN);
  });

  it("normalizes two real cards to canonical 169-hand keys", () => {
    expect(canonicalHandKey(["Ah", "6c"])).toBe("A6o");
    expect(canonicalHandKey(["2c", "3c"])).toBe("32s");
    expect(canonicalHandKey(["3d", "2c"])).toBe("32o");
    expect(canonicalHandKey(["As", "Ad"])).toBe("AA");
  });
});

function chartHandSet(position) {
  return new Set(
    Object.entries(pokerCoachingRfiChart.positions[position])
      .filter(([, value]) => value > 0)
      .map(([hand]) => hand),
  );
}
