import { createRng } from "../engine/deck.js";
import { PROFILE_IDS } from "../engine/player-model.js";

const PROFILE_ID_SET = new Set(PROFILE_IDS);

export function normalizeProfileId(profile, fallback = "standard") {
  if (typeof profile === "string" && PROFILE_ID_SET.has(profile)) {
    return profile;
  }

  return fallback && PROFILE_ID_SET.has(fallback) ? fallback : null;
}

export function normalizeWeights(weights, { baseProfile = "standard" } = {}) {
  const base = normalizeProfileId(baseProfile);
  const clean = [];
  let remaining = 100;

  if (!Array.isArray(weights)) {
    return clean;
  }

  for (const weight of weights) {
    const profile = normalizeProfileId(weight?.profile, null);
    const percent = cleanPercent(weight?.percent);

    if (!profile || profile === base || percent <= 0 || remaining <= 0) {
      continue;
    }

    const clampedPercent = roundPercent(Math.min(percent, remaining));

    if (clampedPercent <= 0) {
      continue;
    }

    clean.push({ profile, percent: clampedPercent });
    remaining = roundPercent(remaining - clampedPercent);
  }

  return clean;
}

export function profileWeightTotal(weights) {
  if (!Array.isArray(weights)) {
    return 0;
  }

  return roundPercent(Math.min(100, weights.reduce((sum, weight) => sum + cleanPercent(weight?.percent), 0)));
}

export function baseProfilePercent(player) {
  return roundPercent(100 - profileWeightTotal(player?.weights));
}

export function hasWeightedProfiles(player) {
  return normalizeWeights(player?.weights, { baseProfile: player?.profile }).length > 0;
}

export function resolveWeightedProfile(player, rng) {
  const baseProfile = normalizeProfileId(player?.profile);
  const weights = normalizeWeights(player?.weights, { baseProfile });

  if (!weights.length) {
    return baseProfile;
  }

  const roll = clampUnit(typeof rng === "function" ? rng() : 1) * 100;
  let cursor = 0;

  for (const weight of weights) {
    cursor += weight.percent;

    if (roll < cursor) {
      return weight.profile;
    }
  }

  return baseProfile;
}

export function resolveSeatProfilesForHand({ config, roster, seed }) {
  const seatProfiles = { ...(config?.seatProfiles || {}) };
  const seatModes = {};
  const rosterById = new Map((Array.isArray(roster) ? roster : [])
    .filter((player) => player?.id)
    .map((player) => [player.id, player]));
  const players = Number(config?.players) || 0;
  const heroSeat = Number(config?.heroSeat);

  for (let seat = 0; seat < players; seat += 1) {
    if (seat === heroSeat) {
      continue;
    }

    const key = String(seat);
    const playerId = config?.seatPlayers?.[key] ?? config?.seatPlayers?.[seat];
    const player = rosterById.get(playerId);

    if (!player) {
      continue;
    }

    const profile = resolveWeightedProfile(player, createRng(`${seed || "felt"}:${seat}`));
    seatProfiles[key] = profile;
    seatModes[key] = profile;
  }

  return { seatProfiles, seatModes };
}

function cleanPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  return roundPercent(Math.min(number, 100));
}

function roundPercent(value) {
  return Math.round(Number(value) * 100) / 100;
}

function clampUnit(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 1;
  }

  return Math.min(Math.max(number, 0), 0.999999999);
}
