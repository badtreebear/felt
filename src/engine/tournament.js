// Tournament blind schedule (Phase 16, slice B1). PURE + deterministic.
//
// A tournament is just a blind structure (a named list of levels, each with
// sb/bb and a hand quota) plus a starting stack. Felt advances the level by
// HANDS played, not a clock, so as the blinds rise and the stack stays fixed,
// the effective stack shrinks in bb and the stack-aware push/fold ranges from
// Phase A take over on their own. No antes, no rebuys (rebuy is metadata only).

import structuresData from "../data/blind-structures.json";

export function listBlindStructures() {
  return structuresData.structures;
}

export function defaultStructureId() {
  return structuresData.meta.defaultStructureId;
}

export function getBlindStructure(id) {
  return (
    structuresData.structures.find((structure) => structure.id === id)
    || structuresData.structures.find((structure) => structure.id === defaultStructureId())
    || structuresData.structures[0]
  );
}

function clampLevelIndex(structure, index) {
  const max = structure.levels.length - 1;
  return Math.max(0, Math.min(max, Number(index) || 0));
}

export function levelAt(structure, levelIndex) {
  return structure.levels[clampLevelIndex(structure, levelIndex)];
}

export function blindsForLevel(structure, levelIndex) {
  const level = levelAt(structure, levelIndex);
  return { sb: level.sb, bb: level.bb };
}

export function isLastLevel(structure, levelIndex) {
  return clampLevelIndex(structure, levelIndex) >= structure.levels.length - 1;
}

// Fresh tournament progress: level 1, no hands played yet.
export function startTournament(structureId) {
  const structure = getBlindStructure(structureId);
  return { structureId: structure.id, levelIndex: 0, handsAtLevel: 0 };
}

// After a hand is played at the current level, bump the counter; once the
// level's hand quota is reached, advance to the next level (capped at the last
// level — blinds stop rising at the top of the structure).
export function advanceAfterHand(progress, structure) {
  const level = levelAt(structure, progress.levelIndex);
  const handsAtLevel = (Number(progress.handsAtLevel) || 0) + 1;

  if (!isLastLevel(structure, progress.levelIndex) && handsAtLevel >= level.hands) {
    return { ...progress, levelIndex: progress.levelIndex + 1, handsAtLevel: 0 };
  }

  return { ...progress, handsAtLevel };
}
