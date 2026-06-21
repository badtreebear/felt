// Known-player roster: named villains with an assigned player type, persisted
// locally. Optional — with an empty roster the trainer behaves exactly as
// before. (v1 stores in localStorage; an IndexedDB upgrade can come later.)

import { normalizeProfileId, normalizeWeights } from "./weights.js";

const STORAGE_KEY = "felt.roster.v1";

export const ROSTER_PALETTE = [
  "#6fbf8f", "#d98f6f", "#6f9fd9", "#c97fd9",
  "#d9c96f", "#6fd9d0", "#d96f9f", "#9fd96f",
];

function randomId() {
  return `p_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizePlayer(player, { freshId = false, idFactory = randomId } = {}) {
  if (!player || typeof player.name !== "string" || !player.name.trim()) {
    return null;
  }

  const profile = normalizeProfileId(player.profile);
  const weights = normalizeWeights(player.weights, { baseProfile: profile });
  const clean = {
    id: freshId ? idFactory() : typeof player.id === "string" && player.id ? player.id : idFactory(),
    name: player.name.trim(),
    profile,
    color: typeof player.color === "string" && player.color ? player.color : ROSTER_PALETTE[0],
    notes: Array.isArray(player.notes) ? player.notes : [],
    createdAt: player.createdAt || new Date().toISOString(),
  };

  if (weights.length) {
    clean.weights = weights;
  }

  return clean;
}

export function createPlayer({ name, profile = "standard", color, notes = [], weights = [] } = {}) {
  return normalizePlayer({
    id: randomId(),
    name,
    profile,
    color: color || ROSTER_PALETTE[Math.floor(Math.random() * ROSTER_PALETTE.length)],
    notes,
    weights,
  });
}

function storage() {
  try {
    return globalThis?.localStorage || null;
  } catch {
    return null;
  }
}

export function loadRoster() {
  const store = storage();

  if (!store) {
    return [];
  }

  try {
    const raw = store.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizePlayer).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function saveRoster(roster) {
  const store = storage();
  const clean = Array.isArray(roster) ? roster.map(normalizePlayer).filter(Boolean) : [];

  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Storage may be unavailable; runtime state still carries the roster.
    }
  }

  return clean;
}

export function importedRosterEntries(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.players)) {
    return payload.players;
  }

  return payload && typeof payload === "object" ? [payload] : [];
}

export function mergeImportedRoster(existingRoster, payload, { idFactory = randomId } = {}) {
  const existing = Array.isArray(existingRoster) ? existingRoster : [];
  const usedNames = new Set(existing.map((player) => player?.name).filter(Boolean));
  const usedIds = new Set(existing.map((player) => player?.id).filter(Boolean));
  const imported = [];
  let skipped = 0;

  for (const entry of importedRosterEntries(payload)) {
    const player = normalizePlayer(entry, {
      freshId: true,
      idFactory: () => uniquePlayerId(usedIds, idFactory),
    });

    if (!player) {
      skipped += 1;
      continue;
    }

    player.name = uniquePlayerName(player.name, usedNames);
    usedNames.add(player.name);
    usedIds.add(player.id);
    imported.push(player);
  }

  return {
    roster: [...existing, ...imported],
    added: imported.length,
    skipped,
  };
}

function uniquePlayerName(name, usedNames) {
  if (!usedNames.has(name)) {
    return name;
  }

  let suffix = 2;
  let candidate = `${name} (${suffix})`;

  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${name} (${suffix})`;
  }

  return candidate;
}

function uniquePlayerId(usedIds, idFactory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = idFactory();

    if (typeof id === "string" && id && !usedIds.has(id)) {
      return id;
    }
  }

  let suffix = usedIds.size + 1;
  let fallback = `p_import_${suffix}`;

  while (usedIds.has(fallback)) {
    suffix += 1;
    fallback = `p_import_${suffix}`;
  }

  return fallback;
}
