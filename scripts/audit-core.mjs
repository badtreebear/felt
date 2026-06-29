// Phase 2 — preflop coverage auditor (the "where does the app go silent?" sweep).
//
// Enumerates every preflop spot the app can present (players 2-9 × each seat ×
// stack depth × facing-action) and asks getRangeForSpot + recommendedAction what
// it would show. It reports two things:
//
//   GAPS      — spots that fall through to "no chart" / fallback / unknown, i.e.
//               a missing table the user would hit mid-play.
//   ANOMALIES — spots that DO claim a chart but look wrong: empty grid while
//               chartAvailable, an all-fold chart, or a recommended action that
//               isn't a legal preflop action. ("general play things that are
//               wrong", per the request.)
//
// Pure enumeration, no poker oracle — it answers "is there advice at all, and is
// it internally coherent?", not "is the advice correct?".

import { getRangeForSpot } from "../src/data/ranges/contextual-ranges.js";
import { recommendedAction } from "../src/tracker/preflop-leaks.js";
import { getSeatPositions } from "../src/engine/positions.js";

const LEGAL_PREFLOP_ACTIONS = new Set(["raise", "threeBet", "fourBet", "call", "fold", "check", "unknown"]);

// Representative effective stack depths in bb, spanning the openDepth buckets
// (pushfold <=, shallow, deep) so depth-selected charts are all exercised.
const DEPTHS_BB = [8, 12, 18, 25, 40, 75, 150];

// A few representative hands to probe each spot's grid/recommendation. We don't
// need all 169 — just enough to tell "chart answers" from "chart is empty/all-fold".
const PROBE_HANDS = ["AA", "KK", "AKs", "AKo", "QJs", "T9s", "76s", "A5s", "K9o", "72o"];

// Build a minimal-but-faithful preflop object for a spot.
function buildPreflop({ players, heroSeat, buttonSeat, voluntaryRaiserSeat, raiseCount, effBb }) {
  const positions = getSeatPositions({ players, buttonSeat });
  const folded = {};

  // Build a faithful actionLog: the opener has a "raises to" entry, and for a
  // 3-bet spot a third seat has a "3-bets to" entry. getRangeForSpot reads this
  // to classify RFI vs defend vs re-raised — matching what the live app passes.
  const actionLog = [];
  if (voluntaryRaiserSeat !== null && voluntaryRaiserSeat !== undefined) {
    actionLog.push({ seat: voluntaryRaiserSeat, street: "preflop", action: "raises to", size: 3 });
    if (raiseCount >= 2) {
      const threeBettor = Object.keys(positions).map(Number)
        .find((s) => s !== voluntaryRaiserSeat && s !== heroSeat);
      if (threeBettor !== undefined) {
        actionLog.push({ seat: threeBettor, street: "preflop", action: "3-bets to", size: 9 });
      }
    }
  }

  return {
    players,
    heroSeat,
    buttonSeat,
    positions,
    status: "waitingHero",
    voluntaryRaiserSeat,
    raiseCount,
    effectiveStackBb: effBb,
    bigBlind: 1,
    contributions: {},
    folded,
    actionLog,
    currentBet: raiseCount > 0 ? 3 : 1,
  };
}

// Enumerate spots. For each player count and each hero seat, cover:
//   - RFI (no raiser yet)
//   - facing a single open from an earlier seat (vs-RFI / defend)
//   - facing a 3-bet (raiseCount 2)
function* enumerateSpots() {
  for (let players = 2; players <= 9; players += 1) {
    const buttonSeat = 0;
    const positions = getSeatPositions({ players, buttonSeat });
    const seats = Object.keys(positions).map(Number);

    // Preflop action order, earliest to latest. An opener facing `hero` must sit
    // earlier than hero here, otherwise the spot can't occur (e.g. CO can't face
    // a BTN open — CO acts first).
    const PREFLOP_ORDER = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
    const orderIndex = (pos) => PREFLOP_ORDER.indexOf(pos);

    for (const heroSeat of seats) {
      const heroPos = positions[heroSeat];
      for (const effBb of DEPTHS_BB) {
        // RFI: nobody has raised. (BB with no raiser is handled as a walk.)
        yield {
          label: `${players}max ${heroPos} RFI @${effBb}bb`,
          players, heroSeat, buttonSeat, heroPos, effBb,
          voluntaryRaiserSeat: null, raiseCount: 0,
        };

        // Facing a single open: only from a seat that acts BEFORE hero.
        const earlierOpener = seats.find((s) => {
          const op = positions[s];
          return s !== heroSeat && orderIndex(op) >= 0 && orderIndex(op) < orderIndex(heroPos);
        });
        if (earlierOpener !== undefined) {
          yield {
            label: `${players}max ${heroPos} vs ${positions[earlierOpener]} open @${effBb}bb`,
            players, heroSeat, buttonSeat, heroPos, effBb,
            voluntaryRaiserSeat: earlierOpener, raiseCount: 1,
          };
          yield {
            label: `${players}max ${heroPos} vs 3-bet @${effBb}bb`,
            players, heroSeat, buttonSeat, heroPos, effBb,
            voluntaryRaiserSeat: earlierOpener, raiseCount: 2,
          };
        }
      }
    }
  }
}

export function runAudit() {
  const gaps = [];
  const anomalies = [];
  let total = 0;

  for (const spot of enumerateSpots()) {
    total += 1;
    const preflop = buildPreflop(spot);
    let range;
    try {
      range = getRangeForSpot({
        players: spot.players,
        seat: spot.heroSeat,
        position: spot.heroPos,
        hand: { buttonSeat: spot.buttonSeat, preflop },
        effBb: spot.effBb,
      });
    } catch (err) {
      anomalies.push(`${spot.label}: getRangeForSpot threw — ${err.message}`);
      continue;
    }

    const kind = range?.kind || "(none)";
    const titleSaysNoChart = /no chart|failed to load/i.test(range?.title || "");

    // "walk" = BB checks its option with no raiser. Intentional, not a gap.
    if (kind === "walk") {
      continue;
    }

    if (kind === "fallback" || titleSaysNoChart || range?.chartAvailable === false) {
      // Distinguish KNOWN-unsupported (re-raised / multiway / HU-vs-open, which the
      // code deliberately explains) from FILLABLE gaps (a normal RFI or vs-single-
      // open spot that simply has no chart yet — the ones worth authoring).
      const reRaised = spot.raiseCount >= 2;
      const headsUp = spot.players === 2;
      const known = reRaised || headsUp; // documented "no chart for this re-raised/HU spot yet"
      // Collapse the depth dimension: a missing vs-open/RFI table is the same gap
      // at every stack depth, so we key on the depth-stripped label to dedupe.
      const spotKey = spot.label.replace(/ @\d+bb$/, "");
      gaps.push({ tier: known ? "known" : "fillable", key: spotKey, text: `${spotKey}: ${range?.title || kind}` });
      continue;
    }

    // The spot claims a usable chart — sanity-check it.
    const recs = PROBE_HANDS.map((h) => recommendedAction({ range, handKey: h }));

    // ANOMALY: recommended action outside the legal set.
    const illegal = recs.find((r) => !LEGAL_PREFLOP_ACTIONS.has(r));
    if (illegal !== undefined) {
      anomalies.push(`${spot.label}: illegal recommended action "${illegal}" (kind=${kind})`);
    }

    // ANOMALY: chart claims to be available but every probe maps to fold AND
    // even premiums fold — a chart that never plays anything is almost certainly
    // empty/misloaded rather than a real strategy.
    if (range?.chartAvailable === true && kind !== "fallback") {
      const allFold = recs.every((r) => r === "fold");
      if (allFold) {
        anomalies.push(`${spot.label}: chartAvailable but every probe hand folds (incl. AA/KK) — likely empty grid (kind=${kind})`);
      }
    }

    // ANOMALY: an RFI/vsRfi/vs3bet chart with no grid/actions data at all.
    if (["rfi", "vsRfi", "vs3bet"].includes(kind) && !range.grid && !range.actions && !range.combos) {
      anomalies.push(`${spot.label}: kind=${kind} but no grid/actions/combos present`);
    }
  }

  // Dedupe gaps collapsed across depths (keep first occurrence per key+tier).
  const seen = new Set();
  const dedupedGaps = [];
  for (const g of gaps) {
    const id = `${g.tier}|${g.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    dedupedGaps.push(g);
  }
  return { total, gaps: dedupedGaps, anomalies };
}
