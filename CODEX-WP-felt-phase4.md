# Felt — Codex Work Package: Phase 4 (scripted opponents + preflop betting) — 13 Jun 2026

Implementer: Codex. Architect/reviewer/tester: Claude. Spec: `SPEC-felt-poker-trainer.md`
(§4 opponents, §8 dials/profiles). Local filesystem only; Jason pushes to git.
Repo `badtreebear/felt` (private). Phase 3 complete & verified.

## Goal

Opponents stop being static and start ACTING preflop. Each villain decides open / call /
3-bet / fold, driven by the three dials (`rangeWidth`, `aggression`, `sizing`) modulating
the loaded RFI charts. A "standard" player = neutral dials = plays the chart exactly.
Profiles are named dial presets; roster players (Phase 7) will override dials later.

**Scope this phase: PREFLOP ONLY.** Open, facing-open call/3bet/fold, facing-3bet
call/4bet/fold. No postflop — streets past preflop are Phase 5+. Hand ends when betting
resolves preflop (everyone folds to a raise → winner; or action closes → "would go to
flop", no flop play yet).

Standing constraints: engine computes all maths/decisions, NO AI (scripted only — this is
the deterministic opponent layer, the AI coach is Phase 6). Vanilla JS + Vite, client-side,
no new deps without flagging. Seeded/replayable: same seed + same profiles → identical
action sequence. Do NOT build §11 parking-lot items.

## Existing engine surface to build on (confirmed via inspection — use these, don't reinvent)

- `ranges.js`: `getChartPositionRange`, `expandPositionRange`, `handKeyToCombos`,
  `isCanonicalHandKey`, `rangeToGrid`, `validateRfiChart`.
- `positions.js`: `getSeatPositions`, `positionToRfiLabel`, `normalizeRangePosition`,
  `rangeBucketForPlayers`.
- `data/ranges/pokercoaching-rfi-9max.json` (7 RFI positions, SB/BB absent).
- `state.js` holds game/hand state. `equity.js` for any equity needs.
- There is NO player/profile/dial module yet — you are creating it.

## Task 1 — Player model: 3 dials + profiles

New module `src/engine/player-model.js` (or similar):

- A player has `{ rangeWidth, aggression, sizing }`, each a float; neutral = `1.0`.
  - `rangeWidth`: scales how many hands the player plays vs the chart. 1.0 = chart;
    >1 = wider (adds hands beyond the chart edge); <1 = tighter (removes weakest).
  - `aggression`: shifts the action mix toward raising. 1.0 = chart's raise/call/fold
    split; >1 = more raising/3-betting where chart calls or folds; <1 = more
    calling/folding where chart raises (passive).
  - `sizing`: scales bet/raise amounts. 1.0 = standard sizes (2.5bb open etc., per the
    chart's stated sizing). >1 = larger, <1 = smaller.
- **Profiles = named presets.** Ship a small set as data (e.g. `src/data/profiles.json`):
  - `standard`  → {1.0, 1.0, 1.0}  (plays the chart)
  - `nit`       → {0.7, 0.7, 1.0}  (tight + passive)
  - `tag`       → {0.95, 1.15, 1.0} (tight-aggressive)
  - `lag`       → {1.35, 1.4, 1.1}  (loose-aggressive)
  - `station`   → {1.4, 0.6, 0.9}   (wide + very passive, calls too much)
  - `maniac`    → {1.6, 1.8, 1.3}   (very wide + very aggressive + big sizing)
  (These numbers are a starting point — Claude will tune them in verification against
  expected combo counts. Treat them as adjustable constants, not load-bearing.)
- Each seat (non-hero) gets assigned a profile at hand start. For now: assignable via a
  simple per-seat selector in the UI, defaulting to `standard`. Variants (e.g.
  "Matt (after break)" +stack) are Phase 7 roster — not now.

## Task 2 — Dial mechanic: how a dial deforms a chart (THE KEY DESIGN — review before building)

This must be **deterministic and seeded**. Proposed mechanic for Claude/Jason sign-off:

**Strength ordering.** Precompute a single canonical ranking of all 169 hands by preflop
strength (a fixed ordering — e.g. by chart-inclusion-depth: hands that appear in the
tightest position rank highest, hands appearing only on the button rank lower, hands in no
chart rank lowest by a simple heuristic like Chen/Sklansky or raw equity-vs-random). Store
this ordering once; it is the spine for widening/tightening.

**rangeWidth** deforms the chart range by moving along this ordering:
- Start from the position's chart range (the set of hands at frequency ≥ some threshold).
- `rangeWidth > 1`: add the next-strongest hands NOT already in range, in ranking order,
  until the range's combo count ≈ chart_combos × rangeWidth.
- `rangeWidth < 1`: remove the weakest in-range hands (lowest ranking) until combo count
  ≈ chart_combos × rangeWidth.
- Clamp to [0, 1326]; never drop premium hands (AA/KK/AKs always stay regardless).

**aggression** sets the action split for hands IN the (width-adjusted) range, facing a
given situation:
- Unopened pot (RFI): in-range hands → raise (size from `sizing`); the small top of range
  may "trap"/call at very high aggression is OUT OF SCOPE — keep RFI as raise-or-fold.
- Facing an open: partition the player's range into 3bet / call / fold by strength bands.
  Higher `aggression` pushes the 3bet band wider (more bluff-3bets from the bottom of the
  continuing range) and the call band may shrink; lower `aggression` widens call, shrinks
  3bet. Define band boundaries as functions of aggression so they move smoothly.
- Facing a 3bet (as the original raiser): 4bet / call / fold partition, same idea.
- The exact band formulas: propose simple linear boundaries (e.g. 3bet-value band = top X%
  of continuing range, 3bet-bluff band = bottom Y% where Y grows with aggression), and
  surface the constants so Claude can tune them against sane frequencies.

**sizing**: multiply the chart's stated raise sizes (2.5bb open IP / 3.5bb OOP, 3× the
raise for 3bet IP / 3.5× OOP, etc. per the chart instructions) by `sizing`. Round to a
sensible increment.

**Determinism:** any randomness (e.g. choosing which specific bluff-combos to 3bet within a
band when not taking the whole band) must draw from the hand's seeded RNG so replays match.
Prefer deterministic band membership (whole bands) over per-combo sampling where possible.

> Codex: implement the mechanic as described, expose all band/threshold constants, and
> report the resulting combo counts per profile per position so Claude can verify the
> widening/tightening behaves (e.g. `station` UTG should be meaningfully wider than chart;
> `nit` should be tighter; premiums never dropped).

## Task 3 — Preflop betting engine

New module `src/engine/preflop-action.js`:

- Drive action around the table in correct order (UTG first preflop, … , BB last), each
  non-hero seat consulting its profile + the dial mechanic to choose open/call/3bet/fold,
  hero acts via UI (buttons: fold / call / raise — raise amount input or preset sizes).
- Track pot, current bet, who's to act, who's folded, who's all-in (stacks matter:
  default 200bb from current state; a raise can't exceed stack).
- Resolve preflop: if all fold to a raiser → that player wins the pot (update stacks,
  log to hand-flow). If action closes with multiple players → hand stops at "preflop
  complete, would see flop" (no flop dealt this phase; show a clear end-of-preflop state).
- SB **is in scope here** as an acting player (it must open/complete/fold facing action) —
  but it still has no RFI *chart*. For SB opens use the dial mechanic over a reasonable SB
  baseline: derive SB's opening range from the BTN chart tightened by rangeWidth, OR flag
  to Jason that SB needs its own data. **Pick the simplest correct option and state which.**
  (BB has no open decision; it checks its option or defends facing a raise via the mechanic.)
- Everything seeded: same seed + same seat profiles → identical betting sequence.

## Task 4 — UI: dials, profiles, betting controls, stakes toggle

- Per-seat profile assignment (dropdown on each villain seat, or a settings panel listing
  seats). Default `standard`.
- **Villain profile visibility: toggle in settings** (Jason's choice). When ON, show each
  villain's profile name (and optionally its 3 dial values) on/near the seat. When OFF,
  hidden during the hand; reveal at hand end. Default: your call, suggest OFF (play blind).
- Hero betting controls: fold / call / raise, with raise sizing (input + a couple of preset
  buttons like 2.5bb / 3bb / pot). Wire into the preflop-action engine.
- **Stakes display toggle (§12): BB vs $ — default $.** A settings toggle converts all
  displayed stacks/bets/pot between dollars and big blinds. Need a BB value (e.g. blinds
  $1/$2 → 1bb = $2) configurable or sensible default. Persist the toggle for the session.
- Hand-flow panel: log each preflop action ("UTG raises to $5", "CO 3-bets to $17",
  "Hero folds") so the sequence is readable and matches the seeded replay.

## Out of scope (explicit)
- All postflop play (flop/turn/river/showdown betting) — Phase 5+.
- AI coach (§9/Phase 6), roster + variants + persistence (§10/Phase 7).
- §11 parking-lot (decision log, self-dossier, pattern tells) — do NOT build.
- Range-grid clipping/placement — already done in 3d/3e.

## Report back
Per task: files created/touched, the dial mechanic as implemented (with the tunable
constants and the per-profile/per-position combo counts), how SB opening was handled
(which option chosen), and confirmation of seeded determinism (same seed + profiles →
identical action log). Claude will verify via Chrome: profile combo counts behave
(nit<chart<station etc., premiums retained), betting resolves correctly and reconciles
pot/stack math, hero controls work, both toggles (visibility, $/BB) function, and replays
are identical.
