# Felt - Note for Codex: coach + UI bugs (13 Jun 2026)

Found while exercising the AI coach. Design decisions by Claude.

## 1. Coach emits raw LaTeX — FIXED (verify)

Symptom: responses contained `$\text{K}\heartsuit\text{Q}\heartsuit$` instead of readable cards,
and sometimes read mid-sentence truncated.

Done: added two lines to `COACH_SYSTEM_PROMPT` in `src/coach/prompts.js` forbidding
LaTeX/markdown/formula notation and telling it to write cards as "K♥ Q♥" / words.

Still for Codex:
- **Belt-and-suspenders render strip:** even with the prompt fixed, strip any stray
  `$...$`, `\text{}`, `\heartsuit`/`\spadesuit`/etc. from coach responses before rendering
  (map suit macros to ♥♦♠♣). LLMs lapse.
- **Truncation:** the example cut off mid-sentence — check the `max_tokens` on the explain
  call is high enough to finish a ~120-word answer (LaTeX was also inflating length). Raise the
  budget or tighten the instruction so answers complete.

## 2. Coach doesn't auto-connect on load (design decision)

Symptom: with the coach enabled and fields filled, after a refresh it does not show as
connected — the user expects it to try the saved connection settings and connect if they work.

Design decision: **on app init, if the coach is `enabled` AND configured (baseUrl + model, key
if required), automatically run the connection test once** (the same lightweight `/models` or
1-token check the "Test connection" button uses) and set the state to reachable/unreachable from
the result. A health-check on load does NOT violate the "no auto-fired coaching calls" guardrail
— it is not a coaching completion. On failure, fall back to the existing greyed "Coach offline"
state and retry on the next user action (no background loop). Also: **saving the settings should
run the test immediately** so "save" effectively means "connect". Likely lives near
`loadCoachConfig` in main.js / the coach state init.

## 3. Range popover opens when not over the position button (design decision)

Symptom: the range chart sometimes appears when the cursor isn't on the position marker —
annoying. Cause: the hover handlers are on a wrapper/area larger than the button (see
`createPositionBadge` in `src/ui/table.js` — `mouseenter`/`mouseleave` on the
`.position-badge-wrap`).

Design decision: **trigger the range popover only from the position-badge BUTTON itself**
(tight target) on hover/focus — not the wrapper or any larger seat area. Ensure the wrapper has
no size beyond the button (no stray hover zone) and keep keyboard focus support on the button.

## Acceptance

- Coach answers are plain readable text (cards like "K♥ Q♥"), never LaTeX, and never cut off
  mid-sentence.
- With the coach enabled + configured, a page refresh auto-tests and shows connected when the
  endpoint is reachable; saving settings connects immediately.
- The range chart appears only when hovering/focusing a position marker button.
- `npm test` and `npm run build` clean; no console errors.
