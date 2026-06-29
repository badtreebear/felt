# Changelog

All notable changes to Felt are recorded here. Releases prior to v0.9.0 are
available as git tags (`v0.4.0`–`v0.8.0`).

## [0.11.0] — 2026-06-29

### Live grading — plain-English coaching

Live-grading feedback now explains itself instead of showing terse labels. Each
graded decision adds a coaching sentence — a leak says *why* it leaks and what to
do instead, and where "pot control" is the lesson it's phrased as an explanation
rather than a vague leak category.

- The **overplayed-hand** explanation now names the actual danger on the board
  (e.g. "the board already makes a flush or a straight possible") using the same
  threat read as the *what beats you* strip, instead of an abstract "respect the
  board".

### Outs — "Your outs / rule of 2 & 4"

- The Bet tip now lists your **clean outs** as mini cards with a rule-of-2/4
  improve estimate on the flop and turn, and the card row has room to breathe so
  it no longer sits cramped.

### Tournament fixes

- **Chips ↔ big blinds fixed in tournament grading.** Sizing labels and EV reads
  were treating chips as big blinds, so with 200-chip blinds a 2,838-chip call
  showed as "facing 2,838 bb" and a -12 bb loss showed as "-2,400 bb". Labels now
  read `2,838 · 14.2bb` and EV reads are correct. Cash play (1-chip blind) is
  unchanged.

### Sizing feedback fixes

- **No more "bet bigger with a weak hand."** The undersized-bet hint was pure
  bet/pot geometry and ignored your cards, so it could tell you to size up with
  bottom pair. Small bets now read as a neutral *blocker / thin / give-up* review
  by default.
- New **Deep sizing analysis** toggle (Settings → Coaching aids, off by default):
  when on, the equity sim runs on small bets too, so "size up for value" only
  appears when you're genuinely ahead of the calling range. Off by default
  because the sim is a brief main-thread cost.

### Grading correctness fix

- **Good all-ins are no longer graded as mistakes.** Getting the chips in ahead
  ("got it in good") was misrouted through the call/fold logic and shown as a
  negative "missed" with the sign of its EV flipped (your +56.5 bb of value read
  as -56.5 bb). It now reads as a good play with the value shown as a gain.

### UI

- The popover **close button is pinned to the top-right** corner (a proper ×) so
  it reads like a normal window close instead of sitting on the left.

[0.11.0]: https://github.com/badtreebear/felt/releases/tag/v0.11.0

## [0.10.1] — 2026-06-27

### Fixes

- **Dealer button now rotates one seat per hand** — clockwise, skipping busted
  seats — instead of jumping to a random seat each hand. The blinds stay one and
  two seats ahead of it, and replays/drills still reproduce their exact button.
- The preflop **Raise** box is hidden when no legal raise is possible (facing an
  all-in that already covers you), matching the postflop behaviour — you'll see
  Fold / Call only.
- Registered the `calculator` and `book-open` icons, silencing two console
  warnings and rendering those icons properly.

[0.10.1]: https://github.com/badtreebear/felt/releases/tag/v0.10.1

## [0.10.0] — 2026-06-27

### Tournament mode

Tournament play arrives on top of the push/fold engine: pick a **blind structure**
and the blinds rise as you play (advanced by hands, not a clock), so your stack
shrinks in big blinds and the stack-aware ranges take over on their own.

- **Buy-in (chips)** sets your starting stack; leave it blank to use the
  structure's default. Stacks are shown in chips with a big-blind readout
  (e.g. `1,000 · 5bb`).
- **Rebuy** tops you back up to the tournament buy-in (the cash stack when not in
  a tournament).
- No ICM, antes, or rebuys beyond the simple top-up — a home-game tournament feel.

### Betting correctness

- **Proper minimum raise**, preflop and postflop: a raise must match the current
  bet and then raise by at least the size of the last bet or raise. The raise box
  defaults to that minimum, and you type over it to size up.
- **Minimum bet is now one big blind** — no more 1-chip bets postflop. Short
  stacks can still shove for less.

### Live grading & table polish

- Grades no longer linger from a previous street. When you advance the panel
  clears and waits for your next gradable decision, so a preflop call's grade no
  longer looks like it's grading the turn.
- **Practice-from-Flop/Turn/River** shows the correct starting stacks and a clear
  "study spot" label instead of a misleading "resolving preflop action" message.
- The bet/raise amount box no longer clips larger numbers, and the green
  "Continue / Deal" cue no longer crowds the grading panel.

[0.10.0]: https://github.com/badtreebear/felt/releases/tag/v0.10.0

## [0.9.0] — 2026-06-25

### Heads-up & short-stack training

The headline of this release is a **stack-aware push/fold engine**: Felt now
understands how deep you are and switches its recommended ranges accordingly —
the foundation for proper heads-up play and, later, tournament "blinding out."

#### Heads-up play
- **Stack-aware opening.** Deep, the SB/BTN plays a normal raise-first-in
  opening range (~84%). As you get short, Felt switches to a Nash open-jam —
  using a ~10bb chart under ~12.5bb and a ~15bb chart in the upper push/fold band.
- **Heads-up BB defend.** Facing an open, the big blind now has a real chart
  instead of "no chart for this spot yet" — call / 3-bet / fold when deep, and
  call-or-fold versus an open-jam when short.
- Ranges are sourced from the HoldemResources Heads-Up Nash solution (no ante),
  labelled approximate for a home game.

#### Under the hood
- New effective-stack measure (in big blinds) computed once per hand, so the bet
  tip and the leak grader always agree on what they're grading.
- Tightened the ~10bb jam chart to the Nash ≥10bb set for consistency with the
  new 15bb chart.

#### Table feel & polish
- Table-dressing effects — animations, sound, and chip movement — for a livelier
  table.
- Assorted UI fixes and refinements throughout.

> Tournament mode (blind schedules, blinding out) builds on this engine and is
> still to come. No ICM, antes, or rebuys.

[0.9.0]: https://github.com/badtreebear/felt/releases/tag/v0.9.0
