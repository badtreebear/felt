// Known-player roster: named villains with an assigned player type, persisted
// locally. Optional — with an empty roster the trainer behaves exactly as
// before. (v1 stores in localStorage; an IndexedDB upgrade can come later.)

const STORAGE_KEY = "felt.roster.v1";

export const ROSTER_PALETTE = [
  "#6fbf8f", "#d98f6f", "#6f9fd9", "#c97fd9",
  "#d9c96f", "#6fd9d0", "#d96f9f", "#9fd96f",
];

function randomId() {
  return `p_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizePlayer(player) {
  if (!player || typeof player.name !== "string" || !player.name.trim()) {
    return null;
  }

  return {
    id: typeof player.id === "string" && player.id ? player.id : randomId(),
    name: player.name.trim(),
    profile: typeof player.profile === "string" && player.profile ? player.profile : "standard",
    color: typeof player.color === "string" && player.color ? player.color : ROSTER_PALETTE[0],
    notes: Array.isArray(player.notes) ? player.notes : [],
    createdAt: player.createdAt || new Date().toISOString(),
  };
}

export function createPlayer({ name, profile = "standard", color, notes = [] } = {}) {
  return normalizePlayer({
    id: randomId(),
    name,
    profile,
    color: color || ROSTER_PALETTE[Math.floor(Math.random() * ROSTER_PALETTE.length)],
    notes,
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
