# Felt - Codex Work Package: Phase 6 - AI coach layer - 13 Jun 2026

Implementer: Codex. Local filesystem only; Jason pushes to git. Design decisions by Claude,
grounded in SPEC §9.

## Cardinal rules (non-negotiable)

1. **The engine computes, the AI explains.** Never ask the model to calculate equity, pot odds,
   or EV. Every number in a prompt comes from the engine; the model only interprets. If the
   model contradicts an engine number, the engine number wins and the UI must not surface the
   contradiction (instruct the model so in the system prompt).
2. **Offline-first.** The trainer is 100% functional with no AI backend. All maths, the
   deterministic explain popovers from Phase 2, ranges, and quiz work with zero network. The AI
   is a pure enhancement layer that appears only when a backend is configured AND reachable.
3. **No secrets in the repo or in logs.** API keys live only in the user's browser storage,
   are sent only to the user-configured endpoint, never logged, never put in URLs, never in
   snapshots. Never hardcode any upstream provider key.

## Backend config (build this first)

- `src/coach/config.js` — `coachDefaults = { enabled:false, baseUrl:"http://localhost:4000/v1",
  model:"", apiKey:"" }`, persisted in localStorage (standalone build only; gate behind a
  helper so artifact/no-storage contexts degrade to in-memory).
- Settings panel behind a **gear icon**. Runtime config (NOT build-time env). Fields: enabled
  toggle, baseUrl, model, apiKey. **Test connection** button: call `/models` or a 1-token
  completion; show ✓/✗ with the error text.
- OpenAI-compatible chat-completions only. Must accept LiteLLM proxy, OpenRouter direct, or
  local Ollama (`http://localhost:11434/v1`). Client in `src/coach/client.js` (thin fetch
  wrapper; configurable baseUrl/model/key; AbortController timeouts).
- State machine, enforced everywhere AI UI could appear:
  - `unconfigured` → no AI UI anywhere except the gear.
  - `configured + reachable` → Explain buttons, chat panel, hand review appear.
  - `configured + unreachable` → AI UI greys out with one line ("Coach offline — trainer fully
    functional"); retry on next user action. **Never block, never modal-error, never background
    retry-loop.**

## Spot snapshot (shared by all three features)

- `src/coach/snapshot.js`, **unit-tested**, pure function from current state → the JSON object
  in SPEC §9 (seed, table{players,heroSeat,heroPos,blinds}, street, hero, board, pot, toCall,
  actionLog[], engine{equity,ci,requiredEquity,evCall,verdict}). All engine numbers read from
  state — never recomputed in the coach layer.
- Player names are NOT included by default (forward-compat with Phase 7: include real names only
  if a future "share player names with coach" toggle is on; until Phase 7 exists, send profile
  types only, e.g. "station in MP").

## Three features — ship in this order, each independently shippable

1. **Explain button on each maths chip.** One-shot completion, ~150-token budget. Prompt =
   snapshot + template: "Explain this <pot-odds/EV/equity> spot to an improving home-game
   player. Numbers are authoritative; do not recompute them." Render the response inside the
   existing chip popover, under a divider. Spinner while loading; 10s timeout then hide.
2. **Coach chat panel.** Collapsible right-side panel. Conversation history kept per hand,
   cleared on new deal, full history resent each call (model has no memory). System prompt =
   coaching persona + current snapshot, refreshed each street.
3. **Hand review.** Post-showdown button. Sends full action log + final snapshot; requests a
   street-by-street review with one concrete "what to try differently", referencing the seed
   for replay.

## System prompt (`src/coach/prompts.js`)

Coaching persona for a home-game player; plain language; **never recompute or contradict engine
numbers**; answers under ~120 words except hand-review mode; mention range/position concepts
when relevant; no gambling encouragement beyond the strategy of the hand presented.

## Cost guardrails

- **No auto-fired calls** — every request is an explicit user click (debounced). Never call the
  model on deal/street change automatically.
- Per-hand call counter shown subtly in the panel; model name visible so the owner knows what
  routed.

## Tests

- `snapshot.js`: deterministic snapshot from a known seeded hand state matches a fixture; engine
  numbers passed through unchanged.
- `prompts.js`: prompt builder includes the snapshot + correct template per feature; never emits
  a "calculate" instruction.
- `config.js`: state-machine transitions (unconfigured/reachable/unreachable) from given inputs.
- `client.js`: with a **mocked fetch** (no real network) — success renders, timeout/abort hides
  gracefully, non-2xx greys the UI without throwing. No test makes a real network call.
- Offline guarantee: with `enabled:false`, no coach module issues any fetch and all existing
  tests still pass.

## Acceptance

- With the coach disabled/unconfigured: trainer is byte-for-byte the same experience as today,
  zero network, all existing features and tests green.
- With a reachable OpenAI-compatible endpoint (LiteLLM/Ollama/OpenRouter): Explain, chat, and
  hand review work; responses render in the right places with spinners/timeouts; the per-hand
  counter and model name show.
- Engine numbers are never recomputed by the coach; the model is never asked to do arithmetic.
- API key never appears in the repo, logs, URLs, or snapshots. Unreachable backend greys the AI
  UI with the one-line notice and never blocks play.
- `npm test` and `npm run build` clean; no console errors in Chrome + Firefox.

## Out of scope (defer)

- Player-name sharing and the describe-player assist (Phase 7 / SPEC §10).
- Any change to engine maths. The coach only reads and explains.
