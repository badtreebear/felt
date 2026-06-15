export const TRACKER_SUMMARY_TOPIC = "tracker:summary";

export function trackerLeakTopic(leakType) {
  return `tracker:leak:${slug(leakType)}`;
}

export function trackerExampleTopic(example) {
  return `tracker:example:${slug(example?.id || example?.seed || "spot")}`;
}

export function buildTrackerSummarySnapshot(state) {
  const summary = state.tracker.summary || {};

  return {
    hero: activeHeroName(state),
    stats: {
      handsTracked: summary.handsTracked || 0,
      vpip: summary.vpip ?? null,
      pfr: summary.pfr ?? null,
      threeBet: summary.threeBet ?? null,
      foldToCbet: summary.foldToCbet ?? null,
      wtsd: summary.wtsd ?? null,
      netBb: summary.netBb ?? 0,
    },
    leaks: (summary.leaks || []).map((leak) => ({
      leakType: leak.leakType,
      count: leak.count,
      recommended: leak.recommended || "",
      totalCostBb: leak.totalCostBb ?? null,
      examples: (leak.examples || []).slice(0, 3).map(exampleSummary),
    })),
  };
}

export function buildTrackerLeakSnapshot(state, { leakType, exampleId } = {}) {
  const highlights = state.tracker.summary?.highlights || [];
  const leak = (state.tracker.summary?.leaks || []).find((candidate) => candidate.leakType === leakType)
    || highlights.find((candidate) => candidate.leakType === leakType)
    || null;
  const isGood = highlights.some((candidate) => candidate.leakType === leakType);
  const example = selectedExample(leak, exampleId);
  const handId = example?.handId || example?.id;
  const hand = handId
    ? (state.tracker.hands || []).find((candidate) => candidate.id === handId) || null
    : null;
  const decision = matchingDecision(hand, leakType, example);

  return {
    hero: activeHeroName(state),
    isGood,
    leak: leak ? {
      leakType: leak.leakType,
      count: leak.count,
      recommended: leak.recommended || "",
      totalCostBb: leak.totalCostBb ?? null,
      totalBenefitBb: leak.totalBenefitBb ?? null,
    } : { leakType: leakType || "", count: 0, recommended: "", totalCostBb: null, totalBenefitBb: null },
    example: example ? exampleSummary(example) : null,
    hand: hand ? {
      id: hand.id,
      seed: hand.seed,
      players: hand.players,
      heroPosition: hand.heroPos || "",
      heroCards: hand.heroCards || [],
      board: hand.board || [],
      netBb: hand.net ?? 0,
      result: hand.result || "",
      won: Boolean(hand.won),
      actionLog: (hand.actionLog || []).map((entry) => formatTrackedAction(entry, hand)),
    } : null,
    decision: decision ? {
      street: decision.street || "",
      spot: decision.spot || "",
      hand: decision.hand || "",
      heroAction: decision.heroAction || "",
      recommended: decision.recommended || "",
      leakType: decision.leakType || leakType || "",
      ev: decision.ev ?? decision.evCall ?? null,
      evCall: decision.evCall ?? null,
      requiredEquity: decision.requiredEquity ?? null,
      equity: decision.equity ?? null,
      costBb: decision.costBb ?? decision.bbDelta ?? null,
      benefitBb: decision.benefitBb ?? null,
      good: Boolean(decision.good),
    } : null,
  };
}

function activeHeroName(state) {
  const hero = (state.heroes || []).find((candidate) => candidate.id === state.activeHeroId)
    || state.heroes?.[0];
  return hero?.name || "Hero";
}

function selectedExample(leak, exampleId) {
  const examples = leak?.examples || [];

  if (!exampleId) {
    return examples[0] || null;
  }

  return examples.find((example) => example.id === exampleId || example.seed === exampleId) || examples[0] || null;
}

function matchingDecision(hand, leakType, example) {
  if (!hand) {
    return null;
  }

  return (hand.decisions || []).find((decision) => (
    decision.leakType === leakType
      && (!example?.spot || decision.spot === example.spot)
      && (!example?.heroAction || decision.heroAction === example.heroAction)
  )) || (hand.decisions || []).find((decision) => decision.leakType === leakType) || null;
}

function exampleSummary(example) {
  return {
    id: example.id || "",
    handId: example.handId || example.id || "",
    seed: example.seed || "",
    hand: example.hand || "",
    spot: example.spot || "",
    heroAction: example.heroAction || "",
    recommended: example.recommended || "",
    netBb: example.net ?? null,
    costBb: example.costBb ?? null,
  };
}

function formatTrackedAction(entry, hand) {
  const seat = Number(entry.seat);
  const street = entry.streetLabel || entry.street || "";
  const actor = seat === hand.heroSeat
    ? `${hand.heroPos || `Seat ${seat + 1}`}(hero)`
    : `Seat ${Number.isFinite(seat) ? seat + 1 : "?"}`;
  const size = Number(entry.size) > 0 ? ` ${entry.size}` : "";
  return `${street}: ${actor} ${entry.action || ""}${size}`.trim();
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "unknown";
}
