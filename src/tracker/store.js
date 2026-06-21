import { deleteByIndex, getAllByIndex, put } from "../store/db.js";

export async function saveHandRecord(record) {
  if (!record?.id || !record.heroId) {
    return null;
  }

  return put("hands", {
    ...record,
    ts: Number(record.ts) || Date.now(),
  });
}

export async function loadHandsForHero(heroId) {
  if (!heroId) {
    return [];
  }

  const hands = await getAllByIndex("hands", "heroId", heroId);
  return hands.sort((first, second) => Number(second.ts || 0) - Number(first.ts || 0));
}

export async function deleteHandsForHero(heroId) {
  if (!heroId) {
    return 0;
  }

  return deleteByIndex("hands", "heroId", heroId);
}
