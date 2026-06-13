# SPEC — Poker Table Trainer ("Felt")

Interactive Texas Hold'em training table. Not a poker client — a *teaching surface*:
a dealt hand you can scrub through street by street, with live equity, pot odds,
EV, and positional range overlays explaining the maths at every decision point.

Successor to the static `poker-maths-trainer.html` prototype (single-file tutorial
tabs). This version is a real Vite project.

---

## 1. Goals / Non-goals

**Goals**
- Simulate a full NLHE hand at a configurable table (2–9 players).
- Street selector: preflop / flop / turn / river / full hand playthrough.
- Live maths layer: hero equity vs opponents, pot odds on facing a bet, EV of call.
- Positional teaching: position labels (UTG…BTN/SB/BB), per-position preflop
  opening ranges shown as 13×13 grid overlays.
- "Explain chips": clickable badges (EQUITY / POT ODDS / EV) that open popovers
  with the worked calculation for the current spot.
- Everything client-side. No backend, no accounts, no persistence required (v1).

**Non-goals (v1)**
- GTO solving, bet-sizing solvers, multi-street game trees.
- Opponent AI that plays "well" — opponents act from simple scripted profiles.
- Multiplayer, networking, real money anything.

---

## 2. Stack

- **Vite + vanilla JS (ES modules) + CSS.** No framework. (Owner is familiar with
  Vite from owlbear-mcp. If a framework is strongly preferred during build, Preact
  is the only acceptable substitute — keep the bundle small.)
- **Equity engine:** `poker-odds-calc` (MIT) as primary candidate; fallback
  `poker-tools` (fork of poker-odds-calculator, MIT). Validate at project start:
  must support N-way equity with partial boards in the browser. If neither
  browser-bundles cleanly, vendor a Cactus-Kev-style evaluator and write our own
  Monte Carlo loop (see §5).
- **Web Worker** for all equity simulation. Main thread never blocks.
- **No external network calls at runtime.** All assets local.

Repo: private, under `badtreebear`. Code is delivered to the local filesystem;
the owner pushes to git manually. Do NOT set up GitHub Actions or push directly.

---

## 3. Project layout

```
felt/
├── index.html
├── vite.config.js
├── package.json
├── src/
│   ├── main.js                # bootstrap, state store, event wiring
│   ├── state.js               # single source of truth (plain object + pubsub)
│   ├── engine/
│   │   ├── deck.js            # shuffle, deal, card model ("As", "Td" notation)
│   │   ├── hand-eval.js       # wrapper around evaluator lib
│   │   ├── equity.worker.js   # Monte Carlo equity (Web Worker)
│   │   ├── potodds.js         # pure functions: required equity, ratios
│   │   ├── ev.js              # pure functions: EV of call/fold
│   │   └── opponents.js       # scripted opponent action profiles
│   ├── data/
│   │   ├── ranges/            # one JSON per position per table size bucket
│   │   │   ├── 6max-utg.json  # 13x13 grid: 1=open, 0=fold, 0.5=mixed
│   │   │   ├── 6max-co.json   # ... etc
│   │   │   └── 9max-*.json
│   │   └── glossary.json      # term -> short explanation (for popovers)
│   ├── ui/
│   │   ├── table.js           # oval felt, seats, dealer button, pot
│   │   ├── cards.js           # card rendering (reuse prototype's CSS cards)
│   │   ├── controls.js        # player count, street selector, deal/next/replay
│   │   ├── chips.js           # the explain-chips (EQUITY/POT ODDS/EV badges)
│   │   ├── popover.js         # generic anchored popover component
│   │   ├── range-grid.js      # 13x13 range matrix renderer
│   │   └── theme.css          # felt/brass/card palette from prototype
│   └── util/
└── test/
    ├── potodds.test.js        # pure-function unit tests (vitest)
    ├── ev.test.js
    └── equity-sanity.test.js  # known matchups within tolerance (see §5)
```

---

## 4. Core state model

```js
state = {
  config: { players: 6, heroSeat: 3, blinds: { sb: 1, bb: 2 }, stack: 200 },
  hand: {
    deck: [...],                  // remaining cards
    holeCards: { 0: ["As","Kd"], ... },  // hero's always visible; others
                                          // hidden until showdown or "reveal" toggle
    board: ["7h","8h","2c"],      // 0/3/4/5 cards
    street: "flop",               // preflop|flop|turn|river|showdown
    pot: 24,
    toCall: 8,                    // 0 when no bet facing hero
    actionLog: [ { seat, street, action, size } ],
    buttonSeat: 0,
  },
  maths: {                        // written by worker / pure fns, read by UI
    heroEquity: 0.41,             // vs active opponents' assigned ranges
    equityCI: 0.01,               // Monte Carlo confidence half-width
    requiredEquity: 0.20,
    evCall: +3.6,
    simStatus: "done",            // idle|running|done
  },
  ui: { openPopover: null, revealVillains: false, speed: "step" },
}
```

Pubsub: `state.subscribe(path, cb)`. Keep it dumb — no framework reactivity.

---

## 5. Equity engine requirements

- Monte Carlo in `equity.worker.js`. Inputs: hero cards, board, list of opponent
  models (either exact cards, a range grid, or "random"). Output: equity + tie %
  + iteration count, posted incrementally (e.g. every 5k iterations) so the UI
  number visibly converges.
- Default 20k iterations preflop multiway, 10k postflop; cap wall time ~300ms.
- Opponent ranges: **conditioned on (position, profile, preflop action)** —
  not flat positional ranges. Implementation:
  - `data/hand-rankings.json`: the standard strength-ordered list of all 169
    starting hands (sourced from published rankings, NOT AI-generated;
    transcribe and cite source in the file header).
  - Each opponent model carries a `rangeWidth` dial (from its profile preset
    or per-player override, see §10): multiplier on the position's base
    opening percentage. Preset anchors: tight 0.7, standard 1.0, aggro 1.4,
    station 1.6.
  - Preflop action selects a band of the ranked list:
    `raise` → top portion of the profile-adjusted range;
    `call` → middle band (top ~3% excluded — raises cap the calling range);
    `limp` → wide weak band; `fold` → removed from simulation entirely.
  - Pure function `assignRange(position, profile, action) -> weighted combo
    list` in `engine/ranges.js`, unit-tested (e.g. tight UTG raise yields a
    range several times narrower than station BB call).
  - Sample opponent hole cards from the assigned combo list
    (rejection-sample against dead cards).
  - **v1 limitation, by design:** ranges are assigned from preflop action and
    held fixed postflop (dead cards aside). No street-by-street narrowing —
    that is solver territory and explicitly out of scope. UI labels equity
    honestly: "vs their preflop range".
  - "Random" opponent model remains available = uniform from remaining deck
    (used in sandbox spot mode by default).
- **Sanity tests (must pass, ±2% tolerance):**
  - AA vs KK preflop heads-up ≈ 81/19
  - AKs vs 22 preflop ≈ 50/50 (coin flip, 22 slightly ahead ≈ 51/49 — accept 48–53)
  - Flush draw (9 outs) vs made top pair on flop ≈ 35% to win by river
  - Hero equity vs 1 random hand on river = exact win/tie check, no MC needed
    (enumerate the single comparison).

---

## 6. Opponent action profiles (v1: scripted, not smart)

Three preset profiles assignable per seat (default mix) — each is a bundle of
the three dials defined in §10 (`rangeWidth`, `aggression`, `sizing`):
- **Tight:** narrow range, low aggression, standard sizing; bets strong made
  hands, checks/folds otherwise.
- **Station:** wide range, very low aggression; calls any bet ≤ pot, rarely raises.
- **Aggro:** loose range, high aggression, large sizing.

Action scripts consume the dials, not the profile name — so a named roster
player (§10) with custom dials plugs into the same scripts with no special
casing. Sizing is jittered ±20% so betting lines aren't robotic.

Purpose is to generate *plausible betting lines* that create pot-odds decisions
for the hero, not to play well. Deterministic given a seeded RNG (seed shown in
UI for replayable hands — useful for "discuss this hand" later).

Profiles do double duty: they drive opponent **actions** (above) and they
condition opponent **ranges** in the equity engine (§5). The same profile
constant must feed both — one enum, two consumers. UI hook: clicking an
opponent's seat shows their assigned range band on the 13×13 grid ("Tight MP,
raised → top 9% — these hands"), which is the hand-reading teaching moment.

---

## 7. UI behaviours

**Table.** Oval felt, seats arranged radially, dealer button, blinds posted.
Hero seat fixed bottom-center. Position labels (BTN/SB/BB/UTG/MP/CO) update
with player count. Pot displayed center. Bet amounts appear in front of seats.

**Controls bar.**
- Players: dropdown 2–9 (re-deals on change).
- Mode: dropdown — `Preflop only | To flop | To turn | To river | Full hand`.
- Buttons: `Deal new hand`, `Next action` (step through action log), `Auto-play`
  (steps with 800ms delay), `Replay hand` (same seed).
- Toggle: `Reveal villain cards` (off by default — teaches range thinking first).

**Explain chips.** When it's hero's decision and a bet is faced, three badges
render near hero's seat: `EQUITY 41%`, `POT ODDS 20%`, `EV +$3.60`. EV chip is
green/red by sign. Clicking any chip opens a popover with the worked maths,
substituted with live numbers, e.g.:

> Required equity = call ÷ (pot + bet + call) = 8 ÷ (24 + 8 + 8) = **20%**
> Your equity vs CO's range: **41%** (±1%, 10,000 simulations)
> Edge: +21% → calling is profitable long-run.

**Range overlays.** Hovering (desktop) or tapping (mobile) a position label
shows that position's 13×13 opening range grid in a popover. Hero's actual
hole cards highlighted on the grid with "in range / not in range" verdict.

**Accessibility/quality floor:** keyboard focus visible, popovers dismiss on
Esc, responsive down to ~380px (chips stack, table scales), reduced-motion
respected, no console errors.

**Theme:** reuse prototype palette — felt `#0e3a2f`, brass `#c9a227`, card
white `#f7f4ed`, suit red `#c34a3d`. Georgia/serif display, system sans body.

---

## 8. Build phases (each independently shippable)

1. **Table + dealing.** Layout, player count, deal, street scrubbing, card
   rendering, showdown winner via evaluator. No maths layer yet.
2. **Maths layer.** Equity worker + pot odds + EV pure functions; explain chips
   with popovers. Unit + sanity tests green. Since scripted betting doesn't
   exist until Phase 4, Phase 2 includes **sandbox spot mode**: manual inputs
   for pot size and bet faced (sliders or number fields) that drive `pot` and
   `toCall` in state. The maths chips read from state and don't care where the
   numbers came from. Sandbox mode is permanent, not scaffolding — it remains
   available after Phase 4 as a "set up any spot manually" study feature
   (toggle: Dealt hand / Manual spot).
3. **Positions + ranges.** Position labels, range JSONs (6-max and 9-max sets),
   range-grid overlay, "your hand in/out of range" verdict.
4. **Opponents + full-hand mode.** Scripted profiles, action log stepping,
   auto-play, seeded replay.
5. **Polish.** Quiz hooks ("hide the chips, you guess, then reveal"), settings
   persistence in memory only (NO localStorage in artifact contexts; in the
   standalone Vite build localStorage is acceptable for settings).
6. **AI coach layer.** See §9.
7. **Player roster & persistence.** See §10.

Definition of done per phase: `npm run build` clean, `npm test` green, no
runtime console errors, works in Chrome + Firefox.

---

## 9. AI coach layer (Phase 6)

**Cardinal rule: the engine computes, the AI explains.** Never ask the LLM to
calculate equity, pot odds, or EV. All numbers in prompts come from the engine;
the model's job is contextual interpretation, never arithmetic. If the model
contradicts an engine number, the engine number wins and the UI must not show
the contradiction (instruct the model accordingly in the system prompt).

**Offline-first requirement.** The app must be 100% functional with no AI
backend configured. The trainer's default state is "no coach": all maths,
explain popovers (deterministic worked calculations from Phase 2), ranges, and
quiz work with zero network access. AI features are an enhancement layer that
appears only when a backend is configured and reachable.

**Backend.** OpenAI-compatible chat completions endpoint, configured at
RUNTIME via a settings panel (gear icon), not build-time env vars — the same
build runs on any machine:

```js
// src/coach/config.js — persisted in localStorage (standalone build only)
export const coachDefaults = {
  enabled: false,                      // explicit opt-in
  baseUrl: "http://localhost:4000/v1", // prefilled suggestion (LiteLLM)
  model: "",
  apiKey: "",
};
```

Settings panel includes a **Test connection** button (calls `/models` or a
1-token completion, shows ✓/✗ with the error). State machine:

- `unconfigured` → no AI UI anywhere except the gear icon.
- `configured + reachable` → Explain buttons, chat panel, hand review appear.
- `configured + unreachable` → AI UI greys out with a one-line notice
  ("Coach offline — trainer fully functional"); retry on next user action.
  Never block, never modal-error, never retry-loop in the background.

Accepts any OpenAI-compatible target: LiteLLM proxy, OpenRouter direct
(key pasted by user, browser-stored only — acceptable for a personal local
tool, never for public hosting), or local Ollama (`http://localhost:11434/v1`).
Never hardcode upstream provider keys in client code or the repo.

**Spot snapshot format.** Single JSON object passed in every prompt; the
serializer lives in `src/coach/snapshot.js` and is unit-tested:

```json
{
  "seed": "84club3",
  "table": { "players": 6, "heroSeat": 3, "heroPos": "CO", "blinds": [1,2] },
  "street": "turn",
  "hero": ["Ah","6h"], "board": ["Kh","9h","2s","Qc"],
  "pot": 46, "toCall": 20,
  "actionLog": ["UTG fold", "MP(tight) raise 6", "CO(hero) call 6", "..."],
  "engine": { "equity": 0.196, "ci": 0.01, "requiredEquity": 0.233,
              "evCall": -3.1, "verdict": "fold" }
}
```

**Three features, built in this order:**

1. **Explain button** on each maths chip. One-shot completion, ~150 token
   response budget, snapshot + question template ("Explain this pot-odds spot
   to an improving home-game player. Numbers are authoritative; do not
   recompute them."). Response renders inside the existing popover under a
   divider. Show a spinner; timeout 10s then hide.
2. **Coach chat panel.** Collapsible right-side panel. Conversation history
   kept per hand (cleared on new deal, full history resent each call — the
   model has no memory between requests). System prompt = coaching persona +
   current snapshot, refreshed each street.
3. **Hand review.** Post-showdown button. Sends full action log + final
   snapshot, requests street-by-street review with one concrete "what to try
   differently" suggestion, referencing the seed for replay.

**System prompt requirements** (store in `src/coach/prompts.js`): coaching
persona for a home-game player; plain language; never recompute or contradict
engine numbers; keep answers under ~120 words unless in hand-review mode;
mention range/position concepts when relevant; no gambling encouragement
beyond strategy of the hand presented.

**Cost guardrails:** debounce (no auto-fired calls — every request is a user
click), per-hand call counter shown subtly in the panel, model name visible so
the owner knows what LiteLLM routed to.

## 10. Player roster & persistence (Phase 7)

Purpose: let the owner model his real weekly game — named villains with
assigned player types and dated observation notes — and practice against them.
Entirely optional: with an empty roster the trainer behaves exactly as before.

**Data model** (IndexedDB, single object store `players`, keyed by id).
Profile types (tight/station/aggro/...) are PRESETS over three numeric dials;
named players may override any dial, and may define variants (alternate
states of the same person — e.g. before/after the beer break):

```json
{
  "id": "p_matt",
  "name": "Matt",
  "profile": "aggro",
  "dials": { "rangeWidth": 1.4, "aggression": 0.7, "sizing": 0.75 },
  "variants": [
    { "name": "after break",
      "dials": { "rangeWidth": 1.9, "aggression": 0.85, "sizing": 1.0 },
      "stackMultiplier": 1.5,
      "note": "loads up on beers, deeper stack, much looser" }
  ],
  "color": "#6fbf8f",
  "notes": [
    { "date": "2026-06-13", "text": "Called 3 streets with bottom pair again." }
  ],
  "createdAt": "...", "updatedAt": "..."
}
```

Dial semantics (each consumed by exactly one engine system):
- `rangeWidth`: multiplier on positional base range (§5). 0.7 = tight,
  1.0 = standard, 1.6 = station-wide, 2.0 = anything suited or shiny.
- `aggression`: 0–1, probability of taking the aggressive line (bet/raise)
  when the action script offers a choice (§6).
- `sizing`: typical bet as fraction of pot (0.5 = half-pot poker,
  1.0 = pot-sized bombs). Jittered ±20% so lines aren't robotic.

Profile presets are just named dial bundles in `data/profiles.json` —
adding a new type (tight-passive, maniac) is one JSON entry, no code.
Variants share the parent's notes history; seat assignment dropdown lists
them as "Matt" / "Matt (after break)". `stackMultiplier` (optional, default 1)
scales that seat's starting stack — deeper stacks change implied odds, which
is part of what makes a variant worth rehearsing against.

**Behaviours:**
- Roster manager UI (modal or side panel): add/edit/archive players, edit
  profile type, append dated notes (newest first). Free-text only — no stat
  fields in v1. Player type is a dropdown of presets from
  `data/profiles.json`; selecting one fills the three dials, which remain
  individually adjustable via sliders.
- **Standalone access:** the roster manager is reachable directly from the
  top bar without dealing a hand — the app doubles as a personal player
  book/journal independent of the trainer.
- **Describe-player AI assist** (requires AI coach configured, §9; hidden
  otherwise): a free-text box in the player editor — owner types a natural-
  language read ("loose aggressive, drinks at break, gets sloppy and deep-
  stacked after") and the coach returns suggested dial values, an optional
  suggested variant, and a one-line rationale per number. Suggestions PRE-FILL
  the sliders only; nothing persists without the owner clicking save. This is
  language interpretation, not calculation, so it does not violate the
  engine-computes rule. Prompt template in `src/coach/prompts.js`; response
  requested as strict JSON ({dials, variant?, rationale}) and validated
  (each dial clamped to its legal range) before touching the UI.
- Seat assignment: when dealing, each villain seat shows a dropdown —
  `Anonymous (tight/station/aggro/...)`, or any roster player and their
  variants ("Matt", "Matt (after break)"). Roster player's dials drive both
  action generation (§6) and range assignment (§5). Seat shows their name
  and colour.
- "Deal my home game" preset: one click seats the whole roster (up to table
  size) in random order.
- Hovering/clicking a named seat shows their range band (per §6 UI hook) plus
  their two most recent notes.

**Persistence rules:**
- IndexedDB via a thin wrapper (`src/store/db.js`, ~50 lines, no heavy ORM;
  `idb` from npm is acceptable).
- **Export / Import JSON** buttons in the roster manager — full roster +
  settings as a downloadable file. Export is the canonical backup and the
  cross-machine transfer mechanism; the UI should nudge an export after edits
  (subtle, not nagging).
- **Delete all data** button (with confirm) wipes IndexedDB completely.
- All data local-only. No telemetry, no sync, nothing leaves the browser
  except user-initiated export. If the AI coach is enabled, roster names are
  included in snapshots ONLY if a settings toggle "share player names with
  coach" is on (default off — send profile types only, e.g. "station in MP").

**Out of scope (explicitly):** auto-computed stats from simulated hands
(measures the simulator, not the real player), real-game hand history import,
HUD-style overlays. v1 tracking = the owner's own dated notes.

---

## 11. v2 parking lot — NOT for the current build

Captured for later; agents must not implement anything in this section
during Phases 1–7.

**Decision log & self-review.** At every hero decision point, append to an
IndexedDB store: `{ seed, snapshot, heroAction, engineVerdict, evDelta,
handOutcome, timestamp }`. Session summary view: accuracy %, and conditional
accuracy (after a lost pot vs after a won pot; by minutes into session).
AI hand-review extension: narrate observed patterns from the log, citing
specific hands by seed. Design rule: the tool reports behavioral patterns
("3 -EV calls in the 5 hands after the big loss"); it never labels the
owner's emotional or mental state — interpretation belongs to the owner.

**Hero self-dossier.** Owner appears in the roster as a player entry with
dated notes for real-game self-observations; AI review may cross-reference
trainer decision log with self-notes when explicitly asked.

**Pattern-level opponent modelling.** Sizing tells and action-pattern
conditioning (e.g. "overbets when bluffing") beyond the three dials.

---

## 12. Open questions for the owner (answer before Phase 3)

1. 6-max ranges, 9-max ranges, or both? (Home game is probably closer to 9-max
   loose-passive — ranges could include a "home game" loosened set.)
2. Currency/stakes display: dollars, big blinds, or toggle?
3. Should villain profiles be visible (labelled "tight"/"aggro") or hidden so
   you practice inferring them from the action log?
4. (Phase 7) Beyond tight/station/aggro, are extra profile types needed to map
   the real game — e.g. "tight-passive" (folds too much, never raises) or
   "maniac"? Adding a profile = one enum value + one tightness multiplier +
   one action script, so cheap to extend.
