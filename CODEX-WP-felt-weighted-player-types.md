# Felt - Codex Work Package: weighted (blended) known-player types - 13 Jun 2026

Implementer: Codex. Local filesystem only; Jason pushes to git. Design decisions by Claude
(confirmed with Jason).

## Goal

Let a known player be a **blend** of types instead of a single one, e.g. "Standard, +5% LAG,
+1% Maniac". Each hand the player **commits to one mode, decided preflop**, then plays that mode
consistently for the whole hand. Makes the regulars feel less robotic and rewards reading.

## Confirmed design decisions

1. **Model = base type + weighted splashes.** A player has a base `profile` (as today) plus an
   optional list of weighted alternates. The remaining percentage is the base type.
   Example: base Standard, splashes `[{profile:"lag", percent:5}, {profile:"maniac", percent:1}]`
   → 94% Standard / 5% LAG / 1% Maniac.
2. **Per-hand commitment, decided preflop.** At the start of each hand, roll once per seated
   weighted player to pick that hand's active type; use it for ALL of that player's decisions
   this hand (preflop + postflop). **No mid-hand switching** (that would create incoherent
   lines).
3. **Deterministic.** The per-hand roll MUST be derived from the hand's seed (so "Replay hand"
   reproduces the exact same modes). Use a seeded RNG keyed by `(hand seed, seat)` — reuse
   `createRng` from `src/engine/deck.js`; do NOT use `Math.random` for the roll.
4. **Visibility: hidden, except in Manual spot.** Normally the active mode is NOT shown (you read
   it from their actions). When the user is in **Manual spot** mode (the study mode), reveal the
   resolved mode on the seat (e.g. a small "LAG this hand" tag). (Revealing it alongside the
   existing "Reveal villain cards" toggle is an acceptable extension if cheap.)
5. **Known players only.** Anonymous seat presets stay single-type. Weights live on roster
   players.

## Current code to build on (slice 1 already shipped)

- `src/roster/store.js` — roster persisted in localStorage; player = `{id, name, profile, color,
  notes}`. Add an optional `weights: [{profile, percent}]` field (validate/normalize it here:
  drop entries with percent <= 0 or unknown profile; clamp the total of splashes to <= 100; the
  base `profile` covers the remainder).
- `src/main.js` — `dealHomeGame()` seats roster players (sets `config.seatPlayers[seat]=id` and
  `config.seatProfiles[seat]=player.profile`). `dealNewHand()` is where the per-hand resolution
  must happen (see below). `rosterSetProfile`, `rosterAdd`, `rosterRemove` exist.
- `src/ui/controls.js` — `createRosterManager` (collapsible). Each player row has a base-type
  `<select>` + delete. This is where the weight editor goes.
- `src/ui/table.js` — seat rendering; `rosterPlayerForSeat`, the `seat--named` accent, the
  `· Out` label. Seat profile/dials come from `config.seatProfiles[seat]` via the engine's
  `normalizeProfile`.

## Implementation

### Resolution (engine/state)
- Add a pure helper, e.g. `resolveWeightedProfile(player, rng)` → returns a concrete profile id
  by rolling against `weights` (base type = remainder). If no weights, returns `player.profile`.
- In `dealNewHand()`, after the hand seed is known, for every seat in `config.seatPlayers`,
  resolve the seated player's active profile for THIS hand with a seeded rng
  (`createRng(`${seed}:${seat}`)` or similar) and write it to `config.seatProfiles[seat]`. Also
  record the resolved mode in a new `config.seatModes[seat] = profileId` map for display.
- Because it's seeded, Replay reproduces identical modes. (`hand.startingStacks` + same seed
  already make replays deterministic — keep that intact.)

### Editor UI (`createRosterManager`)
- Keep the base-type select. Add a compact weight editor per player (e.g. an expandable area or a
  small "+ splash" control): choose a type + a percent, add it; show the splash list with the
  percent and an ✕ to remove each; show the computed base remainder ("Standard 94%"). Validate
  the splash total <= 100 (block or clamp). Wire to a new action, e.g.
  `rosterSetWeights(id, weights)` that saves via the store.
- Keep it space-conscious (the panel is already collapsible).

### Seat display (`table.js`)
- When `state.ui.spotMode === "manual"`, show the resolved mode for a seated weighted player
  (read `config.seatModes[seat]`), e.g. a subtle tag under the name. Otherwise show nothing extra
  (mode stays hidden). Anonymous/single-type seats show nothing new.

## Tests

- `resolveWeightedProfile`: given weights and a seeded rng, returns the expected type; same seed
  → same result; no-weights → base type; splash totals > 100 are clamped; unknown profiles
  dropped.
- Determinism: dealing then replaying the same seed yields identical `seatModes`.
- Store: weights round-trip through save/load and normalize correctly.
- Empty/invalid weights ⇒ behaves exactly like a single-type player (no regression).

## Acceptance

- A known player can be given splashes; over many hands their active mode follows the weights
  (roughly), and within a single hand it never changes.
- Replaying a hand reproduces the same modes.
- The mode is hidden in normal play and revealed on the seat in Manual spot mode.
- Single-type players and anonymous seats are unchanged. `npm test` + `npm run build` clean; no
  console errors.

## Out of scope / later
- Variants ("Matt after break"), dated notes + notes-on-hover, JSON export/import, the
  describe-player AI assist, IndexedDB migration — all still pending from the Phase 7 WP.
- Configurable starting stack + blind structure (separate, staged later per Jason).
