# Felt – Phase 5 Verification Results — 13 Jun 2026

Implementer: Antigrav (Codex). Verified against work package `CODEX-WP-felt-phase5-verification.md`.

## Summary

**All checks passed. No bugs found.**

## Harness run

- **Hands played:** 200
- **Showdown winner mismatches (app vs treys):** 0
- **Pot conservation errors:** 0
- **Split-pot hands correctly identified:** multiple (e.g. hand 49, 50, 182 — treys and app agreed on all)
- **Determinism checks (replay same seed):** 5/5 passed

The loop ran at instant pace (`actionDelayMs = 0` injected via `window.__feltActions`) and completed without any hang, crash, or timeout.

## Unit tests

- `npm test` — **58/58 tests passing** (was 57/57 before; 1 new test added: `engine-determinism.test.js`)
- New test covers: same seed → identical serialized hand state after a full preflop + flop simulation

## Files changed

| File | Change |
|------|--------|
| `src/main.js` | Added `window.__feltState` / `window.__feltActions` dev-only hook at end of module |
| `test/deck.test.js` | Added `river` assertion to `boardForStreet` test |
| `test/engine-determinism.test.js` | **[NEW]** Engine-level determinism test |
| `verify_showdown.py` | Expanded to 200-hand loop with treys cross-check, pot conservation, and replay determinism |
| `ANTIGRAV-felt-phase5-boardjs-hang.md` | **[DELETED]** — obsolete, startup hang is resolved |

## Regression guards confirmed (manual inspection of harness output)

- Split pots: app correctly split with `+` notation matching treys ties
- Hand ranks rendered: `10` seen correctly in result strings (e.g. "Two Pair, 10's & ..."), not clipped
- No hang or infinite loop observed at any street boundary across 200 hands

## Out of scope (not tested here)

- AI coach layer (Phase 6 / SPEC §9)
- Player roster + persistence (Phase 7 / SPEC §10)
- Range-popover highlight behaviour (separate open design question)
