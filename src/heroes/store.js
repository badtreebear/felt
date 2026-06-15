import { deleteByIndex, deleteRecord, getAll, put } from "../store/db.js";

const ACTIVE_HERO_KEY = "felt.activeHeroId.v1";

export const HERO_PALETTE = [
  "#c9a227", "#6fbf8f", "#6f9fd9", "#d98f6f",
  "#c97fd9", "#6fd9d0", "#d96f9f", "#9fd96f",
];

function randomId() {
  return `h_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeHero(hero, { freshId = false, idFactory = randomId } = {}) {
  if (!hero || typeof hero.name !== "string" || !hero.name.trim()) {
    return null;
  }

  return {
    id: freshId ? idFactory() : typeof hero.id === "string" && hero.id ? hero.id : idFactory(),
    name: hero.name.trim(),
    color: typeof hero.color === "string" && hero.color ? hero.color : HERO_PALETTE[0],
    createdAt: hero.createdAt || new Date().toISOString(),
  };
}

export function createHero({ name = "You", color } = {}) {
  return normalizeHero({
    id: randomId(),
    name,
    color: color || HERO_PALETTE[Math.floor(Math.random() * HERO_PALETTE.length)],
  });
}

export async function loadHeroes() {
  const heroes = (await getAll("heroes")).map(normalizeHero).filter(Boolean);
  return heroes.sort((first, second) => String(first.createdAt).localeCompare(String(second.createdAt)));
}

export async function saveHero(hero) {
  const clean = normalizeHero(hero);

  if (!clean) {
    return null;
  }

  await put("heroes", clean);
  return clean;
}

export async function ensureDefaultHero(heroes = []) {
  if (heroes.length) {
    return heroes;
  }

  const hero = createHero({ name: "You", color: HERO_PALETTE[0] });
  await saveHero(hero);
  return [hero];
}

export async function deleteHeroAndHands(id) {
  await deleteRecord("heroes", id);
  await deleteByIndex("hands", "heroId", id);
}

export function loadActiveHeroId(heroes = []) {
  const ids = new Set(heroes.map((hero) => hero.id));
  const saved = storage()?.getItem(ACTIVE_HERO_KEY) || "";

  if (saved && ids.has(saved)) {
    return saved;
  }

  return heroes[0]?.id || "";
}

export function saveActiveHeroId(id) {
  const store = storage();

  if (store && id) {
    try {
      store.setItem(ACTIVE_HERO_KEY, id);
    } catch {
      // Runtime state still keeps the active hero if storage is unavailable.
    }
  }

  return id || "";
}

export function mergeImportedHeroes(existingHeroes, payload, { idFactory = randomId } = {}) {
  const existing = Array.isArray(existingHeroes) ? existingHeroes : [];
  const usedNames = new Set(existing.map((hero) => hero?.name).filter(Boolean));
  const usedIds = new Set(existing.map((hero) => hero?.id).filter(Boolean));
  const imported = [];
  let skipped = 0;

  for (const entry of importedHeroEntries(payload)) {
    const hero = normalizeHero(entry, {
      freshId: true,
      idFactory: () => uniqueHeroId(usedIds, idFactory),
    });

    if (!hero) {
      skipped += 1;
      continue;
    }

    hero.name = uniqueHeroName(hero.name, usedNames);
    usedNames.add(hero.name);
    usedIds.add(hero.id);
    imported.push(hero);
  }

  return {
    heroes: [...existing, ...imported],
    imported,
    added: imported.length,
    skipped,
  };
}

export function heroExportPayload(hero, hands = []) {
  const clean = normalizeHero(hero);

  if (!clean) {
    return null;
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    hero: clean,
    hands: Array.isArray(hands) ? hands : [],
  };
}

export function importedHeroEntries(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.heroes)) {
    return payload.heroes;
  }

  if (payload?.hero) {
    return [payload.hero];
  }

  return payload && typeof payload === "object" ? [payload] : [];
}

function uniqueHeroName(name, usedNames) {
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

function uniqueHeroId(usedIds, idFactory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = idFactory();

    if (typeof id === "string" && id && !usedIds.has(id)) {
      return id;
    }
  }

  let suffix = usedIds.size + 1;
  let fallback = `h_import_${suffix}`;

  while (usedIds.has(fallback)) {
    suffix += 1;
    fallback = `h_import_${suffix}`;
  }

  return fallback;
}

function storage() {
  try {
    return globalThis?.localStorage || null;
  } catch {
    return null;
  }
}
