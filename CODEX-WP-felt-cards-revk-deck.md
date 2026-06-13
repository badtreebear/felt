# Felt - Codex Work Package: Proper card faces (RevK deck) + card sizing - 13 Jun 2026

Implementer: Antigrav (Codex). Local filesystem only; Jason pushes to git.

## Context

We tried real card faces using Byron Knoll's deck loaded from a CDN, with a bold
corner-index overlay drawn on top. Two problems:
1. That deck's court SVGs are huge (KC.svg ~1.1 MB) and its baked-in indices are tiny,
   so we hacked a white-pill index overlay on top — which looks clunky.
2. Board (community) cards render larger than seat/hero cards, so the same index is
   smaller on seats and hard to read.

Decision: switch to Adrian Kennard's (RevK) public-domain SVG deck generated with a
**Large index**, vendored locally, and fix the card-size disparity. Remove the overlay.

Current relevant code (all landed, to be revised):
- `src/ui/cards.js` — `createCard` builds an `<img class="card__face">` pointing at the
  jsDelivr CDN, plus `buildCornerIndex()` overlay elements. Has a text fallback.
- `src/ui/theme.css` — `.card--image`, `.card__face`, `.card__index*` rules.
- Card sizing: base `.card` = `clamp(42px, 5.2vw, 68px)`; `.board-cards` uses the base
  (~68px). `.seat .card` = `clamp(38px, 4.4vw, 52px)`; `.seats[data-players="8"|"9"] .seat
  .card` = `clamp(34px, 3.7vw, 44px)`; plus responsive overrides at 1080px/430px.

## Deck: generate + vendor

1. Generate the deck at https://www.me.uk/cards/makeadeck.cgi (public domain / CC0,
   attribution not required but appreciated). Recommended options:
   - Size: **Poker**
   - Index size: **Large** — IMPORTANT: this is a dropdown that defaults to "Normal".
     It MUST be changed to "Large" (this is the whole point of the swap — readable indices).
   - Index: Normal (Numeric/French optional)
   - Pips: Normal
   - Standard two-colour suits (red/black). Do NOT use the four-colour deck option —
     Jason prefers the standard red/black.
   - Back: pick one (e.g. Diamond or Goodall) — we use it for the hidden-card back.
   - Download the ZIP.
2. Vendor the SVGs into `public/cards/` (so Vite serves them at `/cards/...`). These files
   are small and geometric — vendoring all 52 + back is fine (no CDN, works offline).
3. Add a short `public/cards/LICENSE.txt` crediting RevK / me.uk and noting CC0/public
   domain.
4. Inspect the ZIP's filenames and build the rank+suit -> filename map in code. Felt's
   internal codes are rank `A K Q J T 9 8 7 6 5 4 3 2` + suit `s h d c` (e.g. `Th`, `Ks`,
   `Ac`). Note internal `T` = ten. Map to whatever the ZIP uses (do NOT change the engine's
   internal representation — display/asset layer only).

## cards.js changes

- Point `card__face` `src` at the local vendored asset (`/cards/<mapped-name>.svg`) instead
  of the CDN URL. Drop the `CARD_FACE_CDN` constant.
- **Remove** `buildCornerIndex()` and the two overlay appends — the Large-index deck makes
  the overlay unnecessary. Keep the `aria-label` for accessibility.
- Keep the offline/load-error **text fallback** (`buildTextFace`) — still good resilience.
- Hidden cards: use the deck's back SVG for `card--back` (replace/augment the CSS-pattern
  back) so the back matches the faces. Placeholder unchanged.

## theme.css changes

- Remove `.card__index`, `.card__index--br`, `.card__index--red`, `.card__index-rank`,
  `.card__index-suit` (overlay styles).
- Keep `.card--image` / `.card__face` (container shape + `object-fit: contain`).
- **Unify card sizing so indices read consistently.** Bring seat cards up toward board-card
  size rather than leaving a large gap. Suggested: board/base and seat `.card` within ~10%
  of each other at 6-max (e.g. base ~60px, seat ~56px), and don't let 9-max seat cards fall
  below ~46px. Tune by eye; the acceptance test below is the real bar. Keep cards from
  overflowing seats at 9-max (seats are `clamp(118px,12vw,148px)` wide there).

## Acceptance

- Hero, seat, and board card ranks are all clearly legible at 6-max AND 9-max, at a normal
  desktop width — no overlay needed. (Grav: verify in Chrome via the existing dev hooks /
  harness; check rendered `.card__face` images load, and eyeball index legibility.)
- Tens show as "10"; red/black (or four-colour) suits correct.
- Hidden cards show the deck back; placeholders unchanged; offline text fallback still works.
- No CDN dependency remains (all assets local under `public/cards/`).
- `npm test` and `npm run build` pass; no console errors in Chrome + Firefox.

## Out of scope

- Animations / sound (separate table-dressing backlog).
- AI coach (Phase 6) and player roster (Phase 7).
