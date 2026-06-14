import { normalizeProfileId } from "./weights.js";

export function applySeatAssignment(config, roster, seat, assignment) {
  const key = String(seat);
  const seatPlayers = { ...(config?.seatPlayers || {}) };
  const seatProfiles = { ...(config?.seatProfiles || {}) };
  const seatModes = { ...(config?.seatModes || {}) };
  const seatAssignments = { ...(config?.seatAssignments || {}) };

  if (assignment === "default") {
    delete seatPlayers[key];
    delete seatProfiles[key];
    delete seatModes[key];
    seatAssignments[key] = "default";
    return { seatPlayers, seatProfiles, seatModes, seatAssignments };
  }

  if (assignment?.startsWith("player:")) {
    const playerId = assignment.slice("player:".length);
    const player = (Array.isArray(roster) ? roster : []).find((rosterPlayer) => rosterPlayer.id === playerId);

    if (!player) {
      return null;
    }

    seatPlayers[key] = player.id;
    seatProfiles[key] = player.profile;
    delete seatModes[key];
    seatAssignments[key] = `player:${player.id}`;
    return { seatPlayers, seatProfiles, seatModes, seatAssignments };
  }

  if (assignment?.startsWith("profile:")) {
    const profileId = normalizeProfileId(assignment.slice("profile:".length), null);

    if (!profileId) {
      return null;
    }

    seatProfiles[key] = profileId;
    delete seatPlayers[key];
    delete seatModes[key];
    seatAssignments[key] = `profile:${profileId}`;
    return { seatPlayers, seatProfiles, seatModes, seatAssignments };
  }

  return null;
}
