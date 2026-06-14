# Felt - Codex Work Package: Phase 7 - player roster & persistence - 13 Jun 2026

Implementer: Codex. Local filesystem only; Jason pushes to git. Design decisions by Claude,
grounded in SPEC §10. Do Phase 6 (AI coach) first — one sub-feature here depends on it.

## Purpose

Let the owner model his real weekly game: named villains with assigned player types and dated
observation notes, and practise against them. **Entirely optional** — with an empty roster the
trainer behaves exactly as it does today.

## Hard constraints

- Empty roster ⇒ zero behavioural change vs current build.
- All data is local-only. No telemetry, no sync; nothing leaves the browser except a
  user-initiated export. Real player names go into AI snapshots ONLY if a settings toggle
  "share player names with coach" is ON (default OFF — otherwise send profile type only, e.g.
  "station in MP").
- Reuse the existing engine dials — do NOT add new engine systems. `rangeWidth`, `aggression`,
  `sizing` already drive action generation (§6) and range assignment (§5).

## Data model

- IndexedDB, single object store `players`, keyed by `id`. Profile types are PRESETS over the
  three numeric dials (in `src/data/profiles.json` — adding a type is one JSON entry, no code).
  Named players may override any dial and may define variants. Shape (per SPEC §10):

```json
{
  "id": "p_matt", "name": "Matt", "profile": "aggro",
  "dials": { "rangeWidth": 1.4, "aggression": 0.7, "sizing": 0.75 },
  "variants": [
    { "name": "after break",
      "dials": { "rangeWidth": 1.9, "aggression": 0.85, "sizing": 1.0 },
      "stackMultiplier": 1.5, "note": "loads up on beers, deeper, much looser" }
  ],
  "color": "#6fbf8f",
  "notes": [ { "date": "2026-06-13", "text": "Called 3 streets with bottom pair again." } ],
  "createdAt": "...", "updatedAt": "..."
}
```

- Dial semantics (each consumed by exactly one engine system, already built): `rangeWidth`
  multiplier on positional base range (0.7 tight … 2.0 anything shiny); `aggression` 0–1 prob of
  the aggressive line; `sizing` bet as fraction of pot, jittered ±20%.
- Variants share the parent's notes history; `stackMultiplier` (default 1) scales that seat's
  starting stack. Seat dropdown lists them as "Matt" / "Matt (after break)".

## Build in three sub-phases (each shippable)

### 7a — store + roster manager (no coach needed)
- `src/store/db.js`, thin IndexedDB wrapper (~50 lines; `idb` from npm is fine; no heavy ORM).
- Roster manager UI (modal or side panel), reachable **directly from the top bar without
  dealing a hand** — the app doubles as a personal player book/journal. Add / edit / archive
  players; pick player **type** from a dropdown of `profiles.json` presets (selecting one fills
  the three dials, which stay individually adjustable via sliders); append **dated notes**
  (newest first, free-text only — no stat fields in v1); manage variants.
- **Export / Import JSON** buttons: full roster + settings as a downloadable file (the canonical
  backup + cross-machine transfer). Nudge an export after edits (subtle, not nagging).
- **Delete all data** button (with confirm) wipes IndexedDB completely.

### 7b — seat assignment + play integration
- When dealing, each villain seat shows a dropdown: `Anonymous (tight/station/aggro/…)`, or any
  roster player and their variants. The chosen player's dials drive BOTH action generation (§6)
  and range assignment (§5) via the existing `seatProfiles` plumbing; `stackMultiplier` scales
  that seat's starting stack. Seat shows the player's name and colour.
- **"Deal my home game"** preset: one click seats the whole roster (up to table size) in random
  order.
- Hovering/clicking a named seat shows their range band (existing §6 hook) **plus their two most
  recent notes**.

### 7c — describe-player AI assist (REQUIRES Phase 6; hidden if coach disabled)
- Free-text box in the player editor: owner types a natural-language read ("loose aggressive,
  drinks at break, gets sloppy and deep-stacked after"); the coach returns suggested dial values,
  an optional suggested variant, and a one-line rationale per number. This is language
  interpretation, not calculation, so it does not violate the engine-computes rule.
- Response requested as **strict JSON** (`{dials, variant?, rationale}`), validated and each dial
  **clamped to its legal range** before touching the UI. Suggestions **PRE-FILL the sliders
  only**; nothing persists until the owner clicks save. Prompt template in `src/coach/prompts.js`.

## Tests

- `db.js`: CRUD round-trip (create/read/update/archive/delete), survives a reload (persisted).
- Export → Import round-trips a roster + settings with full fidelity.
- Variant resolution: selecting "Matt (after break)" yields the merged dials + stackMultiplier.
- Seat assignment maps a roster player's dials into `seatProfiles` so the engine uses them
  (action + range), and `stackMultiplier` scales that seat's starting stack.
- Describe-player assist: a stubbed coach JSON response is validated + clamped; out-of-range
  dials are rejected; nothing persists without an explicit save.
- Empty-roster invariant: with no players, dealing/behaviour is identical to current build.

## Acceptance

- Empty roster ⇒ unchanged trainer. CRUD, dated notes, variants persist across reloads.
- Export/import round-trips; delete-all wipes IndexedDB; nothing leaves the browser except export.
- Assigning a roster player to a seat visibly drives that villain's action + range (and stack via
  stackMultiplier); "Deal my home game" seats the roster; named seats show name/colour + 2 latest
  notes on hover.
- 7c appears only when the coach is enabled+reachable; pre-fills sliders only; validated/clamped.
- Names reach AI snapshots only when the "share player names with coach" toggle is on (default off).
- `npm test` and `npm run build` clean; no console errors in Chrome + Firefox.

## Weighted / blended player types — OUT of v1 scope (design decision)

Do NOT build blended types in v1 (e.g. "80% tight, 20% LAG"). Rationale:
- A single averaged blend point is already expressible via the adjustable dials (set
  rangeWidth/aggression/sizing directly).
- The genuine "this player has two modes" case is already served by **variants**
  (Matt / Matt-after-break) — discrete modes the owner chooses to practise against.
- For a trainer, a by-design-random villain is harder to read/exploit deliberately, which
  muddies the learning signal the notes are built around.

If, after playing v1, villains feel too robotic, revisit as a small follow-up: a **per-hand
weighted pick among a player's existing variants** (e.g. 70% base / 30% "after break"), where
the seat **commits to one variant for the whole hand** at deal time (a single weighted choice —
no mid-hand type switching, which would create incoherent lines and is explicitly disallowed).
Not part of this WP.

## Out of scope (explicitly, per SPEC §10)

- Auto-computed stats from simulated hands, real-game hand-history import, HUD-style overlays.
  v1 tracking = the owner's own dated notes only.
