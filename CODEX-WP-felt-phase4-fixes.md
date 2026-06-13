# Felt — Codex Work Package: Phase 4 fixes (mode/EV leak + end-of-preflop cue) — 13 Jun 2026

Implementer: Codex. Tester: Claude (confirmed both via Chrome). Local FS only; Jason pushes to git.

## Issue 1 (BUG) — EV/equity panel shows in "Dealt hand" mode on load

**Confirmed:** on initial load, the mode toggle has **"Dealt hand" active** (`aria-pressed: true`),
but the **EQUITY / POT ODDS / EV** readout — which belongs to **Manual spot** mode — is rendered
anyway (observed "EQUITY 66% / POT ODDS 21%" with Dealt hand selected). The equity panel is
leaking into Dealt-hand mode.

**Expected:** the EQUITY/POT ODDS/EV panel is a Manual-spot feature. In Dealt-hand mode (the
default, scripted-opponents flow) it should NOT be shown. It should appear only when "Manual spot"
is the active mode.

**Fix:** gate the equity/EV panel's render on `mode === 'manual'` (or whatever the internal flag
is). Ensure the initial state renders the panel hidden when Dealt-hand is the default active mode —
this looks like an initial-state bug where the panel's visibility isn't synced to the default mode
on first paint. Verify toggling Manual spot ↔ Dealt hand shows/hides it correctly both directions.

**Acceptance:** fresh load (Dealt hand active) → no EQUITY/POT ODDS/EV panel. Switch to Manual spot
→ panel appears. Switch back → panel hidden. No leak in either direction.

## Issue 2 (UX, not a logic bug) — end-of-preflop state isn't obvious

**Confirmed working as designed:** after hero bets and villains respond, the hand correctly resolves
to "Preflop complete - would see flop $16" (verified: hero raised $5, two villains called, pot $16,
log correct, "Next street" disabled because postflop is Phase 5). The LOGIC is right — this is the
intended Phase-4 boundary (preflop only). **Do not add postflop play here.**

The problem is purely that it *feels* stuck: "Next street" is disabled with no clear signal that the
hand is over and the user should deal again. Jason read this as "no way to progress after I bet."

**Fix (small, cosmetic):** when the hand reaches the preflop-complete terminal state, surface a clear
cue that the hand is finished and the next action is to deal — e.g.:
- A visible "Hand complete — deal next hand" message in the action area (not just buried as the last
  log line), and/or
- Visually emphasise the "Deal new hand" button (it's the next step) and/or show why "Next street"
  is unavailable (e.g. tooltip or subtext "postflop coming in a later phase").
Keep it honest — postflop genuinely isn't built yet, so the cue should point to "deal next", not
imply a flop is coming.

**Acceptance:** when preflop resolves, it's immediately obvious the hand has ended and that dealing a
new hand is the way forward; no impression of being stuck.

## Out of scope
- Postflop play (flop/turn/river) — Phase 5.
- Everything else parked as before.

## Report back
Confirm the equity panel is mode-gated (hidden in Dealt-hand, including on first load), and describe
the end-of-preflop cue added.
