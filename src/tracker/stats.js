export function summarizeHands(hands = []) {
  const tracked = Array.isArray(hands) ? hands : [];
  const total = tracked.length;
  const counts = tracked.reduce((summary, hand) => {
    const heroEntries = (hand.actionLog || []).filter((entry) => entry.seat === hand.heroSeat);
    const preflopEntries = heroEntries.filter((entry) => entry.street === "preflop");

    if (preflopEntries.some((entry) => ["calls", "raises to", "3-bets to", "4-bets to"].includes(entry.action))) {
      summary.vpip += 1;
    }

    if (preflopEntries.some((entry) => ["raises to", "3-bets to", "4-bets to"].includes(entry.action))) {
      summary.pfr += 1;
    }

    if ((hand.decisions || []).some((decision) => decision.heroAction === "threeBet")
      || preflopEntries.some((entry) => entry.action === "3-bets to")) {
      summary.threeBet += 1;
    }

    if ((hand.board || []).length >= 5 || heroEntries.some((entry) => entry.street === "showdown")) {
      summary.wtsd += 1;
    }

    summary.net += Number(hand.net) || 0;
    return summary;
  }, { vpip: 0, pfr: 0, threeBet: 0, wtsd: 0, net: 0 });

  return {
    handsTracked: total,
    vpip: ratio(counts.vpip, total),
    pfr: ratio(counts.pfr, total),
    threeBet: ratio(counts.threeBet, total),
    foldToCbet: null,
    wtsd: ratio(counts.wtsd, total),
    netBb: round(counts.net),
    leaks: rankedLeaks(tracked),
  };
}

function rankedLeaks(hands) {
  const grouped = new Map();

  hands.forEach((hand) => {
    (hand.decisions || []).filter((decision) => decision.leak).forEach((decision) => {
      const key = decision.leakType || "Uncategorized leak";
      const item = grouped.get(key) || {
        leakType: key,
        count: 0,
        recommended: decision.recommended || "",
        examples: [],
      };

      item.count += 1;
      item.recommended = item.recommended || decision.recommended || "";

      if (item.examples.length < 8) {
        item.examples.push({
          id: hand.id,
          seed: hand.seed,
          hand: decision.hand,
          spot: decision.spot,
          heroAction: decision.heroAction,
          recommended: decision.recommended,
          net: hand.net,
          ts: hand.ts,
        });
      }

      grouped.set(key, item);
    });
  });

  return [...grouped.values()].sort((first, second) => (
    second.count - first.count || first.leakType.localeCompare(second.leakType)
  ));
}

function ratio(count, total) {
  return total > 0 ? count / total : null;
}

function round(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
