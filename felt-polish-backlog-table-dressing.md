# Felt — Polish backlog: table dressing (animations + sound) — parked

Captured 13 Jun 2026. NOT a work package yet — park until Phase 5 postflop core is verified.
For whoever implements (Antigrav). Jason's idea.

## What
Add "table feel" dressing so the action reads like a real table, not just a text log:

**Visual (Claude CAN verify via Chrome):**
- Cards dealt with a slight stagger/animation rather than appearing instantly.
- Chips animate OUT in front of a seat when that player bets/calls/raises (a bet stack
  appears at the seat).
- After a betting round closes, the seat bet-stacks sweep INTO the central pot.
- These double as legibility: you can *see* who acted, in what order, and how much —
  currently only visible in the hand-flow text log.

**Audio (Claude CANNOT verify — Jason is the ear):**
- Card-deal sound (riffle/deal).
- Chip sounds when bets are placed and when the pot is collected.
- IMPORTANT: Claude tests by reading DOM/pixels — it cannot hear audio. Claude can verify
  the sound-trigger events fire at the right moments and that mute/volume controls work,
  but NOT whether the sounds are pleasant or get grating. Jason must judge the actual audio.

## Constraints / sensible defaults
- **Mute by default** (or a clear sound toggle) — audio that plays unprompted on load is
  jarring; let the user opt in. Persist the preference for the session.
- Animations must not slow down play or block input — keep them short, and they must be
  skippable/instant if the user is clicking fast (don't queue a 2s animation per action in
  a hand that's resolving quickly).
- Respect `prefers-reduced-motion` — disable/curtail animations for users who set it.
- Must not break seeded determinism: animation is cosmetic, the underlying action
  sequence/result stays identical regardless of animation state.
- Keep it engine-agnostic: dressing is a UI layer over the existing action log; it should
  consume the action events, not compute anything.

## Sourcing the sound files
- Jason to supply or approve sound assets (licensing matters — use CC0/owned samples, not
  random clips). Claude can suggest where to find CC0 poker SFX but cannot evaluate how they
  sound.

## When
Phase 5 (polish) or later. Postflop play + showdown should land and be verified FIRST —
dressing on top of an unfinished hand flow is wasted effort. Revisit once a full hand
(preflop → showdown) plays end to end.
