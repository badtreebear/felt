# Felt - Codex Work Package: roster import/export + per-seat player picker - 14 Jun 2026

Implementer: Codex. Local filesystem only; Jason pushes to git. Design decisions by Claude
(confirmed with Jason). Builds on the known-player roster (slice 1) and the in-progress
weighted-types work — same files. Do this AFTER the weighted-types change lands (or in the same
push), since it touches `roster/store.js`, `main.js`, `controls.js`, `table.js`.

## Why

(1) localStorage is fragile (per-origin, wiped by clearing site data) — Jason needs a file
backup so the effort spent building regulars can't be lost. (2) Jason wants to hand the app to
other people who build their OWN rosters, and to share/seed rosters between them. (3) He wants to
tailor a specific table (assign exact known players to seats), not only random pub-game fills.

## Feature 1 — Roster Import / Export (in the Known players dropdown panel)

- **Export:** a button that downloads the whole roster as JSON (e.g. `felt-roster.json`) via a
  Blob — all player fields (name, profile, color, weights, notes, etc.). This is the durable
  backup + the sharing format. (A backup of Jason's current 8 players already exists at
  `roster-backup.json` in the repo root — same shape; use it as a fixture.)
- **Import:** a file picker that **merges into** the existing roster — never replaces it.
  Decision (confirmed): on a **name collision, add the imported player with a numbered suffix**
  (e.g. importing "Matt" when "Matt" exists → add as "Matt (2)", next as "Matt (3)"). Always
  additive; Jason prunes later. Generate a **fresh id** for every imported player (don't trust /
  reuse incoming ids — avoids id clashes). Run each imported entry through the store's
  `normalizePlayer` / `normalizeWeights` so weights and profiles are validated; silently drop
  malformed entries. Accept the export array format (and tolerate a single-object or
  `{players:[...]}` wrapper if cheap).
- Both buttons live inside the collapsible roster panel (`createRosterManager`).
- Add actions, e.g. `rosterExport()` and `rosterImport(players)` (the file read/parse happens in
  the UI; the action does the merge + suffixing + save).

## Feature 2 — Per-seat known-player picker (tailor a table)

- Each **villain** seat gets a compact dropdown (on the seat, or in a small "Tailor table" list —
  your call, keep it uncluttered) listing, in order: a default ("Random / Standard"), the
  **anonymous types** (Standard, Nit, TAG, LAG, Station, Maniac), then the **known players**.
- Selecting a known player sets `config.seatPlayers[seat] = id` and
  `config.seatProfiles[seat] = <that player's resolved profile>`. Selecting an anonymous type
  clears `seatPlayers[seat]` and sets `seatProfiles[seat] = type`. Selecting the default clears
  both (seat reverts to the standard/unassigned behaviour).
- **Sticky across hands:** manual assignments persist hand to hand (they already do via
  `config.seatPlayers`/`seatProfiles` surviving `dealNewHand`) until changed, or until "Pub game"
  / "New game" reassigns. "Pub game" continues to random-fill, but manual picks let Jason override
  individual seats to build an exact lineup.
- Respect the weighted-types resolution: if a seated known player has weights, the per-hand mode
  resolution (from the weighted-types work) still applies — the seat picker just chooses WHO sits
  there, not their per-hand mode.

## Tests

- Import merge: importing a file with a duplicate name adds it as "Name (2)"; non-duplicates add
  as-is; every imported player gets a new id; malformed entries are skipped; existing players are
  never modified or removed.
- Export → Import round-trips (export, clear, import → same players, allowing for new ids).
- Seat picker: selecting a known player seats them (seatPlayers + seatProfiles set); selecting a
  type clears the player and sets the profile; selecting default clears both; assignments persist
  across `dealNewHand`.

## Acceptance

- Export downloads a JSON backup of the roster; Import merges a file in without overwriting,
  numbering name clashes; nothing existing is lost.
- Each villain seat can be set to a specific known player or a generic type from a dropdown, and
  the choice sticks across hands until changed. Pub game still random-fills.
- Empty roster / no manual picks ⇒ behaviour unchanged. `npm test` + `npm run build` clean; no
  console errors.

## Out of scope / later
- Dated notes + notes-on-hover, variants, IndexedDB, the describe-player AI assist (still pending
  from the Phase 7 WP).
- Packaging for other users (PWA/standalone/mobile) — separate later phase; export/import is the
  sharing mechanism in the meantime.
