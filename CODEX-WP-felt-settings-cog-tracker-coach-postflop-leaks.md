# Felt - Codex Work Package: settings cog + tracker coach + postflop-EV leaks - 14 Jun 2026

Implementer: Codex. Local filesystem only; Jason pushes to git. Design decisions by Claude
(confirmed with Jason). Three parts; ship/commit each independently. Suggested order: A (quick
declutter) → B (coach on tracker) → C (postflop-EV leaks, the heaviest). They're independent, so
reorder if you prefer to do the high-value C first.

---

## Part A — Settings cog (declutter the controls bar)

The controls bar is overloaded. Move the "set once and forget" config controls behind a single
**cog**, and keep only the per-hand play controls on the bar. No new logic — this is a UI
relocation of existing, working controls (`src/ui/controls.js`).

**Stays on the main bar (play):**
- Hero picker, Deal new hand, Next street / Continue / Start, Replay hand, New game, Pub game,
  Tracker (and the Known-players opener).

**Moves into the cog (a settings drawer/panel with small sections):**
- Gameplay: Mode (Dealt / Manual spot), Players count, Street selector, Pace (action speed),
  Reveal villain cards, the profile/show-profiles settings (`createPhaseFourSettings`),
  Manual-spot controls (shown in the panel when Manual is selected).
- Coach: **fold the existing coach gear (`createCoachSettingsControl`) into this one cog** so
  there aren't two gear icons.
- (Display unit $/bb if it exists.)
- Data (roster/hero import-export) may stay in their own panels (roster manager / tracker) — keep
  it where it's contextual; don't duplicate.

**Form:** a cog button that opens a settings drawer/overlay (same pattern as the current coach
settings panel, generalised), with a persisted open/close `ui` flag and outside-click/Escape to
close. Keep it from reflowing the table (overlay, not inline) — same rule as the popovers.
**Acceptance:** the main bar shows only play controls + the cog; all moved settings still work
from inside the cog; only one gear; opening/closing the cog doesn't move the table; `npm test` +
build clean.

---

## Part B — Coach button on the Tracker ("explain it all to me")

Jason is new to trackers and wants the AI coach to explain his results.

- In the tracker panel (`createTrackerPanel`), add an **"Explain my leaks"** button that sends the
  hero's leak summary + stats strip to the coach (reuse Phase 6 — `src/coach/*`) and renders a
  plain-language rundown (what each leak means, which to fix first). ~250-token budget.
- Add a per-leak / per-hand **"Explain this"** action (e.g. on a leak row or a drilled-in hand)
  so the coach can explain why that specific spot was a mistake and the better line. Pass the
  spot/hand context (cards, position, action log, recommended action, and — once Part C lands —
  the EV numbers) in the snapshot; numbers are authoritative, model only interprets.
- Gate on coach configured + reachable (hidden/greyed otherwise, exactly like the existing
  Explain buttons). Strip any stray LaTeX (the `sanitizeCoachContent` helper already exists).
**Acceptance:** with the coach reachable, the tracker can explain the leak report and an
individual leak/hand in plain English; with no coach, the buttons are hidden/greyed; no LaTeX.

---

## Part C — Postflop-EV leak detection (tracker slice 6, the headline value)

Today the tracker only scores **preflop** leaks (`src/tracker/preflop-leaks.js`), which is why a
hand where Jason spewed his stack postflop only showed "missed an open." Add postflop scoring.

- **Engine work first:** equity / pot-odds / EV(call) is currently computed only in the maths
  layer (Manual spot). Add a way to evaluate `{ equity, requiredEquity, evCall, verdict }` for a
  **hero postflop decision in normal dealt play** — run the existing seeded equity worker for the
  hero's hand vs the live opponents' assigned ranges at that decision point. Evaluate **only at
  hero decision points** (not every villain action); reuse the seeded worker; cache per decision
  so it's cheap and deterministic for a given seed.
- **Scoring (call/fold vs EV):** facing a bet, **called with evCall < 0** → "called -EV (paid
  off)"; **folded with evCall > 0** → "folded +EV". Record the bb delta (chips lost / EV given
  up) on the decision so leaks can rank by cost. (Scoring raise/bet *sizing* is out of v1 scope.)
- Feed these into the existing leak aggregation + ranking and the tracker UI, so the leaks list
  ranks by frequency AND total bb lost, and a stack-spew hand finally shows up.
**Acceptance:** a hero call the engine rates -EV is flagged with the right bb cost and appears in
the ranked leaks; deterministic for a seed; replay-by-seed still works; preflop scoring unchanged.

---

## Cross-cutting / tests
- Don't break solo/no-tracker, no-coach, or empty-roster behaviour.
- Tests: settings still function after the move (a couple of representative ones); coach-explain
  gating (hidden when unreachable); postflop EV scoring on a constructed -EV call (deterministic
  bb delta); existing preflop-leak + stats tests stay green.
- `npm test` + `npm run build` clean; no console errors in Chrome + Firefox.

## Notes
- Persisted-storage tip for the tracker (carry over from the tracker WP): call
  `navigator.storage.persist()` once so the browser is less likely to evict the hand history.
- One Codex thread per part is safest given context limits; commit between parts.
