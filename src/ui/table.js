import { STREET_LABELS } from "../engine/deck.js";
import { PLAYER_PROFILES, canonicalHandKey } from "../engine/player-model.js";
import { resolveShowdown } from "../engine/hand-eval.js";
import { legalHeroActions } from "../engine/preflop-action.js";
import { legalPostflopActions } from "../engine/postflop-action.js";
import { getSeatPositions } from "../engine/positions.js";
import { getBlindStructure } from "../engine/tournament.js";
import { hasWeightedProfiles } from "../roster/weights.js";
import { getRangeForSpot } from "../data/ranges/contextual-ranges.js";
import { recommendedAction } from "../tracker/preflop-leaks.js";
import { drillSummary, isDrillComplete } from "../drill/session.js";
import { createCard, createCardRow } from "./cards.js";
import { createCoachPanel } from "./coach-panel.js";
import { createMathsChips, shouldShowMathsPanel, relativeStrength, overbetVerdict } from "./chips.js";
import { formatAmount, formatNumber } from "./formatting.js";
import { createPopover } from "./popover.js";
import { createRangeGrid, heroRangeVerdict } from "./range-grid.js";
import { createHeroControl, createSeatAssignmentGrid, createSelectControl } from "./controls.js";
import { STREET_ORDER } from "../state.js";
import { rangePopoverPlacement } from "./range-popover-placement.js";

const RANGE_CLOSE_DELAY_MS = 120;
let rangeCloseTimer = null;

const SUIT_GLYPHS = { s: "♠", h: "♥", d: "♦", c: "♣" };

// Render embedded card codes (e.g. "Jh", "Tc") as rank + suit glyph ("J♥",
// "10♣") in action-log text. Suit colour is left as the surrounding text.
function withSuitGlyphs(text) {
  return text.replace(/\b([2-9TJQKA])([shdc])\b/g, (match, rank, suit) => (
    `${rank === "T" ? "10" : rank}${SUIT_GLYPHS[suit]}`
  ));
}

export function renderTable(container, state, actions) {
  container.replaceChildren();

  const shell = document.createElement("main");
  shell.className = "table-shell";

  const table = document.createElement("section");
  table.className = "poker-table";
  table.setAttribute("aria-label", "Poker table");
  table.style.setProperty("--seat-scale", String(state.ui.seatScale ?? 1));

  const showdown = state.hand.street === "showdown"
    ? resolveShowdown({ holeCards: showdownHoleCards(state), board: state.hand.board })
    : null;

  table.append(createBoard(state, showdown));
  table.append(createSeats(state, actions));
  shell.append(table, createHandPanel(state, showdown, actions));
  container.append(shell);
}

function createBoard(state, showdown) {
  const board = document.createElement("div");
  board.className = "board";
  const handTerminal = isTerminalHand(state);
  const potLabel = handTerminal ? "Final pot" : state.hand.toCall > 0 ? "Pot before bet" : "Pot";

  const pot = document.createElement("div");
  pot.className = "pot";
  const callLine = !handTerminal && state.hand.toCall > 0
    ? `<em>Call ${formatAmount(state.hand.toCall, state)}</em>`
    : `<em class="pot__placeholder" aria-hidden="true">&nbsp;</em>`;
  pot.innerHTML = `
    <span>${potLabel}</span>
    <strong>${formatAmount(state.hand.pot, state)}</strong>
    ${callLine}
  `;

  const street = document.createElement("div");
  street.className = "street-badge";
  street.textContent = state.ui.awaitingStart ? "Set up" : STREET_LABELS[state.hand.street];

  const cards = document.createElement("div");
  cards.className = "board-cards";

  state.hand.board.forEach((card) => cards.append(createCard(card)));
  const missingCards = Math.max(0, 5 - state.hand.board.length);
  Array.from({ length: missingCards }, () => cards.append(createCard("", { placeholder: true })));

  const result = document.createElement("div");
  result.className = "showdown-result";

  if (state.ui.awaitingStart) {
    result.textContent = " "; // reserve the row height
    result.setAttribute("aria-hidden", "true");
  } else if (showdown) {
    const winnerNames = showdown.winnerSeats.map((seat) => seatLabel(seat, state.config.heroSeat, state));
    const winnerVerb = winnerNames.length === 1 ? "wins" : "win";
    result.textContent = `${winnerNames.join(" + ")} ${winnerVerb} with ${showdown.winningDescription}`;
  } else if (state.hand.postflop) {
    result.textContent = postflopResultText(state);
  } else if (state.hand.preflop?.status === "complete") {
    result.textContent = preflopResultText(state);
  } else if (state.hand.preflop?.status === "waitingHero") {
    result.textContent = "Hero to act preflop.";
  } else if (!state.hand.preflop && state.hand.street !== "preflop") {
    // Practice-from-Flop/Turn/River sets up the board with no betting phase —
    // it's a study spot, not villains mid-action. Label it accurately.
    result.textContent = `Practice spot — study the ${state.hand.street}.`;
  } else {
    result.textContent = "Villains are resolving preflop action.";
  }

  board.append(pot, street, cards, result);

  // Phase 15 — opt-in coaching aids (default off): "what beats you" strip and
  // the overbet warning, so the player needn't open the Bet tip each time.
  const aids = createCoachingAids(state);
  if (aids) {
    board.append(aids);
  }

  return board;
}

function createCoachingAids(state) {
  const wrap = document.createElement("div");
  wrap.className = "board-aids";

  if (state.ui.showThreats) {
    const rel = relativeStrength(state);
    if (rel) {
      const strip = document.createElement("p");
      strip.className = "board-aids__threats";
      const equityText = rel.equity !== null
        ? `Your equity ~${Math.round(rel.equity * 100)}% — `
        : "";
      const beats = rel.beats.map((threat) => threat.label.toLowerCase());
      strip.textContent = beats.length
        ? `${equityText}beats you: ${beats.join(", ")}.`
        : `${equityText}nothing the board allows beats you yet.`;
      wrap.append(strip);
    }
  }

  if (state.ui.overbetWarn) {
    const verdict = overbetVerdict(state);
    if (verdict) {
      const warn = document.createElement("p");
      warn.className = "board-aids__overbet";
      warn.textContent = `⚠ ${verdict.reason}`;
      wrap.append(warn);
    }
  }

  return wrap.childNodes.length ? wrap : null;
}

// Pre-calculated seat positions for crowded counts where the ellipse formula
// places seats too close together near the shoulders of the oval.
// [visualIndex] → [x%, y%] — percentage of the seats container (hero = index 0).
// NOTE: these are authored counter-clockwise; seatXY() mirrors the x-axis so the
// table actually runs CLOCKWISE (BTN → SB → BB → ...).
const SEAT_POSITIONS_6 = [
  [50, 85], // hero — bottom centre
  [81, 67], // bottom right
  [81, 33], // upper right
  [50, 24], // top centre  (lowered ~50% closer to the board info box)
  [19, 33], // upper left
  [19, 67], // bottom left
];

const SEAT_POSITIONS_8 = [
  [50, 89], // hero — bottom centre
  [72, 81], // bottom right
  [91, 54], // right
  [80, 24], // top right
  [50, 24], // top centre  (lowered ~50% closer to the board info box)
  [20, 24], // top left
  [ 9, 54], // left
  [28, 81], // bottom left
];

const SEAT_POSITIONS_9 = [
  [50, 89], // hero — bottom centre
  [71, 82], // bottom right
  [90, 56], // right
  [83, 22], // top right
  [63, 24], // top right-centre  (lowered ~50% closer to the board info box)
  [37, 24], // top left-centre
  [17, 22], // top left
  [10, 56], // left
  [29, 82], // bottom left
];

function seatXY(visualIndex, players) {
  const [x, y] = baseSeatXY(visualIndex, players);
  // Mirror horizontally so increasing seat order runs CLOCKWISE around the
  // table (BTN → SB → BB → ...). Authored layouts above are counter-clockwise;
  // hero stays centred because 100 - 50 = 50.
  return [100 - x, y];
}

function baseSeatXY(visualIndex, players) {
  if (players === 6) return SEAT_POSITIONS_6[visualIndex];
  if (players === 8) return SEAT_POSITIONS_8[visualIndex];
  if (players === 9) return SEAT_POSITIONS_9[visualIndex];
  const angle = 90 - visualIndex * (360 / players);
  return [
    50 + Math.cos((angle * Math.PI) / 180) * 36,
    50 + Math.sin((angle * Math.PI) / 180) * 35,
  ];
}

function createSeats(state, actions) {
  const seats = document.createElement("div");
  seats.className = "seats";

  const players = state.config.players;
  const heroSeat = state.config.heroSeat;
  // B5: prefer the engine's positions (live-aware — busted seats are skipped).
  const positions = state.hand.preflop?.positions
    || getSeatPositions({ players, buttonSeat: state.hand.buttonSeat });
  const phase = currentPhaseState(state);
  const handTerminal = isTerminalHand(state);
  const winnerSeats = winnerSeatsForBadges(state);
  seats.dataset.players = String(players);

  for (let seat = 0; seat < players; seat += 1) {
    const seatElement = document.createElement("article");
    const isHero = seat === heroSeat;
    const isWinner = winnerSeats.includes(seat);
    const isFolded = Boolean(phase?.folded?.[seat]);
    const isActing = phase?.status === "waitingHero" && phase.currentSeat === seat;
    const position = positions[seat];
    const showCards = isHero || state.ui.revealVillains || state.hand.street === "showdown";
    const visualIndex = (seat - heroSeat + players) % players;
    const [x, y] = seatXY(visualIndex, players);

    seatElement.className = "seat";
    seatElement.classList.toggle("seat--hero", isHero);
    seatElement.classList.toggle("seat--winner", Boolean(isWinner));
    seatElement.classList.toggle("seat--folded", isFolded);
    seatElement.classList.toggle("seat--acting", isActing);
    // Lift the seat above the board's stacking context while its range popover
    // is open, so the popover paints above the community cards.
    seatElement.classList.toggle("seat--popover-open", state.ui.openRangeSeat === seat);
    seatElement.style.setProperty("--seat-x", `${x}%`);
    seatElement.style.setProperty("--seat-y", `${y}%`);
    // Top seats (y < 46%) anchor at their bottom so cards push them upward.
    // Bottom seats (y > 62%) anchor at their top so cards push them downward.
    const anchorY = y < 46 ? "-100%" : y > 62 ? "0%" : "-50%";
    seatElement.style.setProperty("--seat-anchor-y", anchorY);

    const title = document.createElement("div");
    title.className = "seat__title";

    const seatPlayer = isHero ? null : rosterPlayerForSeat(state, seat);
    if (seatPlayer?.color) {
      seatElement.style.setProperty("--seat-accent", seatPlayer.color);
      seatElement.classList.add("seat--named");
    }

    const isOut = !isHero && Boolean(phase?.out?.[seat]);
    seatElement.classList.toggle("seat--out", isOut);

    const stack = document.createElement("span");
    // Fall back to the dealt table stacks (which hold the tournament buy-in or
    // configured stack) before the generic config.stack, so seats show the real
    // starting stack when there's no live phase yet (e.g. Practice-from-Flop).
    const stackChips = phase?.stacks?.[seat] ?? state.config.tableStacks?.[seat] ?? state.config.stack;
    // B2: in tournament mode also show the stack in big blinds, since blinding
    // out is the whole point — that's the number that drives push/fold.
    if (state.tournament?.enabled) {
      const bb = Number(state.config.blinds?.bb) || 1;
      const stackBb = Math.round((stackChips / bb) * 10) / 10;
      stack.textContent = `${formatAmount(stackChips, state)} · ${stackBb}bb`;
    } else {
      stack.textContent = formatAmount(stackChips, state);
    }

    if (!isHero) {
      const wildName = !seatPlayer ? (state.config.seatNames?.[seat] || null) : null;
      const baseName = seatPlayer ? seatPlayer.name : wildName || seatLabel(seat, heroSeat, state);
      const name = document.createElement("strong");
      name.textContent = isOut ? `${baseName} · Out` : baseName;
      title.append(name, stack);
    } else {
      title.append(stack);
    }

    const cards = createCardRow(state.hand.holeCards[seat] || [], { hidden: !showCards });

    if (isFolded) {
      const foldStamp = document.createElement("span");
      foldStamp.className = "fold-stamp";
      foldStamp.textContent = "Fold";
      foldStamp.setAttribute("aria-hidden", "true");
      cards.append(foldStamp);
    }

    const badges = document.createElement("div");
    badges.className = "seat__badges";

    if (state.hand.buttonSeat === seat) {
      const button = document.createElement("span");
      button.className = "dealer-button";
      button.textContent = "D";
      button.setAttribute("aria-label", "Dealer button");
      badges.append(button);
    }

    if (isWinner) {
      const winner = document.createElement("span");
      winner.className = "winner-badge";
      winner.textContent = "Winner";
      badges.append(winner);
    }

    const actionBadge = createLastActionBadge({ state, seat });

    if (actionBadge) {
      badges.append(actionBadge);
    }

    const committed = phase?.contributions?.[seat] || 0;

    if (committed > 0 && !handTerminal) {
      const commit = document.createElement("span");
      commit.className = "commit-badge";
      commit.textContent = `In ${formatAmount(committed, state)}`;
      badges.append(commit);
    }

    const profileBadge = createProfileBadge({ seat, isHero, state, seatPlayer });

    if (profileBadge) {
      badges.append(profileBadge);
    }

    const modeBadge = createResolvedModeBadge({ seat, isHero, state, seatPlayer });

    if (modeBadge) {
      badges.append(modeBadge);
    }

    badges.append(createPositionBadge({ seat, position, state, actions }));

    seatElement.append(title, cards, badges);

    // Maths chips render in the hand panel (outside the table) so they never
    // overlap the board or reflow the seat frames.

    seats.append(seatElement);
  }

  return seats;
}

function createProfileBadge({ seat, isHero, state, seatPlayer }) {
  const showProfile = !isHero && state.ui.showProfiles;

  if (!showProfile) {
    return null;
  }

  if (state.config.seatModes?.[String(seat)] === "wild") {
    return null;
  }

  const profileId = hasWeightedProfiles(seatPlayer)
    ? seatPlayer.profile
    : state.config.seatProfiles?.[String(seat)] || "standard";
  const profile = PLAYER_PROFILES[profileId] || PLAYER_PROFILES.standard;
  const badge = document.createElement("span");
  badge.className = "profile-badge";
  badge.textContent = profile.label || profileId;
  badge.title = `Range ${profile.rangeWidth} / aggression ${profile.aggression} / sizing ${profile.sizing}`;
  return badge;
}

function createResolvedModeBadge({ seat, isHero, state, seatPlayer }) {
  if (isHero || state.ui.spotMode !== "manual" || !hasWeightedProfiles(seatPlayer)) {
    return null;
  }

  const profileId = state.config.seatModes?.[String(seat)];

  if (!profileId) {
    return null;
  }

  const profile = PLAYER_PROFILES[profileId] || PLAYER_PROFILES.standard;
  const badge = document.createElement("span");
  badge.className = "mode-badge";
  badge.textContent = `${profile.label || profileId} this hand`;
  badge.title = "Resolved player type for this hand.";
  return badge;
}

function createLastActionBadge({ state, seat }) {
  const action = latestSeatAction(state.hand.actionLog, seat, state);

  if (!action) {
    return null;
  }

  const badge = document.createElement("span");
  badge.className = "action-badge";
  badge.classList.toggle("action-badge--fold", action.kind === "fold");
  badge.classList.toggle("action-badge--aggressive", action.kind === "aggressive");
  badge.classList.toggle("action-badge--win", action.kind === "win");
  badge.textContent = action.label;
  return badge;
}

function latestSeatAction(actionLog, seat, state) {
  const currentStreet = state.hand.street;

  for (let index = actionLog.length - 1; index >= 0; index -= 1) {
    const entry = actionLog[index];

    if (entry.seat !== seat || isHiddenSeatAction(entry.action)) {
      continue;
    }

    // A fold persists for the rest of the hand, regardless of street.
    if (entry.action === "folds") {
      return formatSeatAction(entry, state);
    }

    // Call/check/raise/bet badges only apply to the current street, so they
    // clear when the hand advances to the next street.
    if (entry.street === currentStreet) {
      return formatSeatAction(entry, state);
    }
  }

  return null;
}

function isHiddenSeatAction(action) {
  return [
    "dealer button",
    "small blind",
    "big blind",
    "hero dealt in",
    "all live hands revealed",
  ].includes(action)
    || action.includes("dealt")
    || action.includes("complete");
}

function formatSeatAction(entry, state) {
  const phase = currentPhaseState(state);
  const isAllIn = Boolean(phase?.allIn?.[entry.seat]);

  if (entry.action === "folds") {
    return { label: "Fold", kind: "fold" };
  }

  if (entry.action === "checks") {
    return { label: "Check", kind: "neutral" };
  }

  if (entry.action === "calls") {
    if (isAllIn) {
      return { label: `All in ${formatAmount(entry.size, state)}`, kind: "aggressive" };
    }

    return { label: `Call ${formatAmount(entry.size, state)}`, kind: "neutral" };
  }

  if (entry.action === "bets") {
    if (isAllIn) {
      return { label: `All in ${formatAmount(entry.size, state)}`, kind: "aggressive" };
    }

    return { label: `Bet ${formatAmount(entry.size, state)}`, kind: "aggressive" };
  }

  if (entry.action === "raises to") {
    if (isAllIn) {
      return { label: `All in ${formatAmount(entry.size, state)}`, kind: "aggressive" };
    }

    return { label: `Raise ${formatAmount(entry.size, state)}`, kind: "aggressive" };
  }

  if (entry.action === "3-bets to") {
    if (isAllIn) {
      return { label: `All in ${formatAmount(entry.size, state)}`, kind: "aggressive" };
    }

    return { label: `3-bet ${formatAmount(entry.size, state)}`, kind: "aggressive" };
  }

  if (entry.action === "4-bets to") {
    if (isAllIn) {
      return { label: `All in ${formatAmount(entry.size, state)}`, kind: "aggressive" };
    }

    return { label: `4-bet ${formatAmount(entry.size, state)}`, kind: "aggressive" };
  }

  if (entry.action === "wins pot" || entry.action.startsWith("wins showdown")) {
    return { label: `Wins ${formatAmount(entry.size, state)}`, kind: "win" };
  }

  return null;
}

function createPositionBadge({ seat, position, state, actions }) {
  const wrapper = document.createElement("span");
  wrapper.className = "position-badge-wrap";
  // Close when the cursor leaves the whole wrapper (button + open popover).
  wrapper.addEventListener("mouseleave", () => scheduleRangeClose(actions));

  const button = document.createElement("button");
  button.type = "button";
  button.className = "position-badge";
  button.textContent = position;
  button.setAttribute("aria-expanded", String(state.ui.openRangeSeat === seat));
  // Open only when hovering/focusing the position button itself, so the chart
  // doesn't pop up from stray hovers near the seat.
  const openRange = () => {
    cancelRangeClose();

    if (state.ui.openRangeSeat !== seat) {
      actions.setOpenRangeSeat(seat);
    }
  };
  button.addEventListener("mouseenter", openRange);
  button.addEventListener("focus", openRange);
  button.addEventListener("click", openRange);

  wrapper.append(button);

  if (state.ui.openRangeSeat === seat) {
    const range = getRangeForSpot({
      players: state.config.players,
      seat,
      position,
      hand: state.hand,
      effBb: state.hand.preflop?.effectiveStackBb,
    });
    const heroCards = state.hand.holeCards[state.config.heroSeat] || [];
    const popover = createPopover({
      id: `range-popover-${seat}`,
      title: rangePopoverTitle(range),
      onClose: () => actions.setOpenRangeSeat(null),
      children: createRangeGrid({ range, heroCards }),
    });
    popover.classList.add("range-popover");
    wrapper.append(popover);
    requestAnimationFrame(() => placeRangePopover(wrapper, popover));
  }

  return wrapper;
}

function cancelRangeClose() {
  if (rangeCloseTimer) {
    clearTimeout(rangeCloseTimer);
    rangeCloseTimer = null;
  }
}

function scheduleRangeClose(actions) {
  cancelRangeClose();
  rangeCloseTimer = setTimeout(() => {
    rangeCloseTimer = null;

    if (!document.querySelector(".position-badge-wrap:hover")) {
      actions.setOpenRangeSeat(null);
    }
  }, RANGE_CLOSE_DELAY_MS);
}

function placeRangePopover(wrapper, popover) {
  if (!wrapper.isConnected || !popover.isConnected) {
    return;
  }

  popover.classList.remove("range-popover--below", "range-popover--placed");
  popover.style.removeProperty("--range-popover-x");
  popover.style.removeProperty("--range-popover-y");

  const placement = rangePopoverPlacement({
    anchorRect: wrapper.getBoundingClientRect(),
    avoidRects: seatRects(),
    popoverRect: popover.getBoundingClientRect(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });

  popover.classList.toggle("range-popover--below", placement.vertical === "below");
  popover.dataset.placement = `${placement.vertical}-${placement.horizontal}`;
  popover.style.setProperty("--range-popover-x", `${placement.x}px`);
  popover.style.setProperty("--range-popover-y", `${placement.y}px`);
  popover.classList.add("range-popover--placed");
}

function seatRects() {
  return Array.from(document.querySelectorAll(".seat")).map((seat) => {
    const rect = seat.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  });
}

function rangePopoverTitle(range) {
  if (range.title) {
    return range.title;
  }

  const tableSize = Number(range.meta?.tableSize || range.tableSize);
  const tableLabel = Number.isFinite(tableSize) ? `${tableSize}-max` : "range";
  const chartLabel = range.meta?.chart?.includes("RFI") ? "RFI" : "opening";

  if (!range.chartAvailable) {
    return `${range.displayPosition} - no RFI chart (${tableLabel})`;
  }

  return `${range.displayPosition} - ${chartLabel} opening range (${tableLabel})`;
}

function createHandPanel(state, showdown, actions) {
  const panel = document.createElement("aside");
  panel.className = "hand-panel";
  panel.setAttribute("aria-label", "Current hand details");

  if (state.ui.awaitingStart) {
    const heading = document.createElement("h2");
    heading.textContent = "Set up the table";

    const setup = document.createElement("div");
    setup.className = "setup-panel";

    const heroRow = document.createElement("div");
    heroRow.className = "setup-row";
    heroRow.append(createHeroControl(state, actions));

    const configRow = document.createElement("div");
    configRow.className = "setup-row setup-row--config";
    configRow.append(
      createSelectControl({
        id: "setup-players",
        label: "Players",
        value: String(state.config.players),
        options: Array.from({ length: 8 }, (_, i) => ({ value: String(i + 2), label: String(i + 2) })),
        onChange: (value) => actions.setPlayers(Number(value)),
      }),
      createSelectControl({
        id: "setup-street",
        label: "Practice from",
        value: state.config.startStreet || "preflop",
        options: STREET_ORDER.filter((s) => s !== "showdown").map((s) => ({
          value: s,
          label: STREET_LABELS[s],
        })),
        onChange: (street) => actions.setStartStreet(street),
      }),
    );

    const seatGrid = createSeatAssignmentGrid(state, actions);
    seatGrid.classList.add("setup-seats");

    const dealRow = document.createElement("div");
    dealRow.className = "setup-row setup-row--deal";

    const pubBtn = document.createElement("button");
    pubBtn.type = "button";
    pubBtn.className = "button";
    pubBtn.disabled = state.roster.length === 0;
    pubBtn.title = "Fill seats with your known players.";
    pubBtn.innerHTML = '<i data-lucide="users" aria-hidden="true"></i><span>Pub game</span>';
    pubBtn.addEventListener("click", () => actions.dealHomeGame());

    const wildBtn = document.createElement("button");
    wildBtn.type = "button";
    wildBtn.className = "button";
    wildBtn.title = "Fill seats with random players.";
    wildBtn.innerHTML = '<i data-lucide="zap" aria-hidden="true"></i><span>Wild Table</span>';
    wildBtn.addEventListener("click", () => actions.dealWildTable());

    const scaleRow = document.createElement("div");
    scaleRow.className = "setup-row setup-row--scale";

    const scaleLabel = document.createElement("label");
    scaleLabel.className = "setup-scale-label";
    scaleLabel.htmlFor = "setup-seat-scale";

    const scaleLabelText = document.createElement("span");
    scaleLabelText.textContent = "Seat size";

    const scaleSlider = document.createElement("input");
    scaleSlider.type = "range";
    scaleSlider.id = "setup-seat-scale";
    scaleSlider.min = "0.6";
    scaleSlider.max = "1.4";
    scaleSlider.step = "0.05";
    scaleSlider.value = String(state.ui.seatScale ?? 1);
    scaleSlider.addEventListener("input", (e) => actions.setSeatScale(Number(e.currentTarget.value)));

    scaleLabel.append(scaleLabelText, scaleSlider);
    scaleRow.append(scaleLabel);

    const start = createHeroActionButton("Start game", () => actions.startGame());
    start.classList.add("setup-start");

    dealRow.append(pubBtn, wildBtn);
    setup.append(heroRow, configRow, seatGrid, dealRow, scaleRow, start);
    panel.append(heading, setup);
    return panel;
  }

  const meta = document.createElement("dl");
  meta.className = "hand-meta";

  // Seed / Board / Preflop / Postflop / To-call / RFI hint used to live here but
  // duplicated the table itself or the Bet tip (the board cards, the pot's "Call"
  // line, the board result text, and the Bet tip's actual verdict). Removed to
  // declutter; Seed moves to the foot of the panel. The top now leads with chips.

  // Clickable Equity / Pot odds / EV chips when the Maths layer is on, plus the
  // constant Bet tip button whenever the hero is to act. Popover renders here in
  // the hand panel.
  const handChips = createMathsChips(state, actions, { renderPopover: true });
  if (handChips) {
    meta.append(handChips);
  }

  if (showdown) {
    meta.append(createMeta("Best hand", showdown.winningDescription));
  }

  const log = document.createElement("ol");
  log.className = "action-log";
  log.reversed = true;

  [...state.hand.actionLog].reverse().forEach((entry) => {
    const item = document.createElement("li");
    const size = entry.size ? ` ${formatAmount(entry.size, state)}` : "";
    item.textContent = withSuitGlyphs(`${STREET_LABELS[entry.street]}: ${seatLabel(entry.seat, state.config.heroSeat, state)} ${entry.action}${size}`);
    log.append(item);
  });

  const heroControls = createHeroActionControls(state, actions);
  const completionCue = createCompletionCue(state, actions);
  const coachPanel = createCoachPanel(state, actions, { handComplete: isTerminalHand(state) });

  const drillPanel = createDrillPanel(state, actions);
  const bustBanner = createBustBanner(state, actions);
  const lead = drillPanel ? [drillPanel] : [];
  if (bustBanner) {
    panel.append(...lead, bustBanner, meta);
  } else {
    panel.append(...lead, meta);
  }

  if (heroControls) {
    panel.append(heroControls);
  }

  const liveGradingPanel = createLiveGradingPanel(state);
  if (liveGradingPanel) {
    panel.append(liveGradingPanel);
  }

  if (completionCue) {
    panel.append(completionCue);
  }

  if (coachPanel) {
    panel.append(coachPanel);
  }

  // Hand flow now lives down here, where the action log actually is, with an h3
  // heading matching "Hero action" / "AI coach".
  const flow = document.createElement("section");
  flow.className = "hand-flow";
  const flowHeading = document.createElement("h3");
  flowHeading.textContent = "Hand flow";
  flow.append(flowHeading, log);
  panel.append(flow);

  // Seed lives at the very foot now — rarely needed (replay/determinism), so it
  // shouldn't take prime space at the top.
  const seedFoot = document.createElement("p");
  seedFoot.className = "hand-seed-foot";
  seedFoot.textContent = `Seed: ${state.hand.seed || "pending"}`;
  panel.append(seedFoot);

  return panel;
}

function createHeroActionControls(state, actions) {
  if (state.hand.postflop?.status === "waitingHero") {
    return createPostflopHeroActionControls(state, actions) || createIdleHeroActionControls();
  }

  if (state.hand.preflop?.status === "waitingHero") {
    return createPreflopHeroActionControls(state, actions) || createIdleHeroActionControls();
  }

  // Not the hero's turn (villains acting, or hand resolved) — keep the section in
  // place with a disabled skeleton so the panel doesn't jump around.
  return createIdleHeroActionControls();
}

function idleActionButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hero-action-button";
  button.disabled = true;
  button.textContent = label;
  return button;
}

function createIdleHeroActionControls() {
  const wrapper = document.createElement("section");
  wrapper.className = "hero-actions hero-actions--idle";
  wrapper.setAttribute("aria-label", "Hero action");

  const heading = document.createElement("h3");
  heading.textContent = "Hero action";

  const buttonRow = document.createElement("div");
  buttonRow.className = "hero-actions__row";
  buttonRow.append(idleActionButton("Fold"), idleActionButton("Call"));

  const raiseRow = document.createElement("div");
  raiseRow.className = "hero-actions__raise";

  const input = document.createElement("input");
  input.type = "text";
  input.disabled = true;
  input.placeholder = "—";
  input.setAttribute("aria-label", "Raise amount");

  raiseRow.append(input, idleActionButton("Raise to —"));

  wrapper.append(heading, buttonRow, raiseRow);
  return wrapper;
}

// Sizing shortcuts — always the same three (½ pot, ¾ pot, Pot), in every spot,
// so they don't change or disappear. Each sets the amount to that fraction of the
// pot, clamped to the legal range for the action.
function createPotPresetRow({ actions, pot, min, max }) {
  const potValue = Math.max(0, Number(pot) || 0);
  const row = document.createElement("div");
  row.className = "hero-actions__presets";

  [
    { label: "½ pot", frac: 0.5 },
    { label: "¾ pot", frac: 0.75 },
    { label: "Pot", frac: 1 },
  ].forEach(({ label, frac }) => {
    const target = clampAmount(potValue * frac, min, max);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hero-actions__preset";
    button.textContent = label;
    button.addEventListener("click", () => actions.setHeroRaiseTo(target));
    row.append(button);
  });

  return row;
}

function createSizePresetRow(presets) {
  const row = document.createElement("div");
  row.className = "hero-actions__presets";

  presets
    .filter((preset) => Number.isFinite(preset.amount) && preset.amount > 0)
    .forEach((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hero-actions__preset";
      button.textContent = preset.label;
      button.addEventListener("click", preset.onClick);
      row.append(button);
    });

  return row;
}

function createPreflopHeroActionControls(state, actions) {
  const legal = legalHeroActions(state.hand.preflop);

  if (!actions || !legal.canAct) {
    return null;
  }

  const wrapper = document.createElement("section");
  wrapper.className = "hero-actions";
  wrapper.setAttribute("aria-label", "Hero preflop action");

  const heading = document.createElement("h3");
  heading.textContent = "Hero action";

  const buttonRow = document.createElement("div");
  buttonRow.className = "hero-actions__row";

  const callIsAllIn = legal.callAmount > 0 && legal.callAmount >= legal.stack;
  const foldButton = createHeroActionButton("Fold", () => actions.heroPreflopAction("fold"));
  const callLabel = legal.callAmount > 0
    ? (callIsAllIn ? `All in ${formatAmount(legal.stack, state)}` : `Call ${formatAmount(legal.callAmount, state)}`)
    : "Check";
  const callButton = createHeroActionButton(callLabel, () => actions.heroPreflopAction("call"));

  buttonRow.append(foldButton, callButton);

  const raiseRow = createWagerRow({
    state,
    actions,
    min: legal.minRaiseTo,
    max: legal.maxRaiseTo,
    initial: state.ui.heroRaiseTo || legal.minRaiseTo,
    label: "Raise to",
    confirmLabel: "Raise",
    onCommit: (amount) => actions.heroPreflopAction("raise", amount),
  });

  // All-in raise (only when the hero has chips beyond a call).
  if (!callIsAllIn && legal.maxRaiseTo > legal.callAmount) {
    raiseRow.append(createHeroActionButton(
      `All in ${formatAmount(legal.maxRaiseTo, state)}`,
      () => actions.heroPreflopAction("raise", legal.maxRaiseTo),
    ));
  }

  const presetRow = createPotPresetRow({
    actions,
    pot: state.hand.pot,
    min: legal.minRaiseTo,
    max: legal.maxRaiseTo,
  });

  wrapper.append(heading, buttonRow, raiseRow, presetRow);
  return wrapper;
}

function createPostflopHeroActionControls(state, actions) {
  const legal = legalPostflopActions(state.hand.postflop);

  if (!actions || !legal.canAct) {
    return null;
  }

  const effectiveMinBet = Math.min(legal.minBet, legal.maxBet);
  const wrapper = document.createElement("section");
  wrapper.className = "hero-actions";
  wrapper.setAttribute("aria-label", "Hero postflop action");

  const heading = document.createElement("h3");
  heading.textContent = "Hero action";

  const buttonRow = document.createElement("div");
  buttonRow.className = "hero-actions__row";

  if (legal.callAmount > 0) {
    const callIsAllIn = legal.callAmount >= legal.maxBet;
    const callLabel = callIsAllIn
      ? `All in ${formatAmount(legal.maxBet, state)}`
      : `Call ${formatAmount(legal.callAmount, state)}`;
    buttonRow.append(
      createHeroActionButton("Fold", () => actions.heroPostflopAction("fold")),
      createHeroActionButton(callLabel, () => actions.heroPostflopAction("call")),
    );
    wrapper.append(heading, buttonRow);

    // Raising is allowed when the hero has chips beyond a call.
    if (legal.canRaise) {
      const raiseRow = createWagerRow({
        state,
        actions,
        min: legal.minRaiseTo,
        max: legal.maxRaiseTo,
        initial: state.ui.heroRaiseTo || legal.minRaiseTo,
        label: "Raise to",
        confirmLabel: "Raise",
        onCommit: (amount) => actions.heroPostflopAction("raise", amount),
      });

      if (legal.maxRaiseTo > legal.minRaiseTo) {
        raiseRow.append(createHeroActionButton(
          `All in ${formatAmount(legal.maxRaiseTo, state)}`,
          () => actions.heroPostflopAction("raise", legal.maxRaiseTo),
        ));
      }

      const raisePresets = createPotPresetRow({
        actions,
        pot: state.hand.pot,
        min: legal.minRaiseTo,
        max: legal.maxRaiseTo,
      });

      wrapper.append(raiseRow, raisePresets);
    }

    return wrapper;
  }

  buttonRow.append(createHeroActionButton("Check", () => actions.heroPostflopAction("check")));

  const betRow = createWagerRow({
    state,
    actions,
    min: effectiveMinBet,
    max: legal.maxBet,
    initial: state.ui.heroRaiseTo || state.hand.postflop.suggestedHeroBet || effectiveMinBet,
    label: "Bet",
    confirmLabel: "Bet",
    onCommit: (amount) => actions.heroPostflopAction("bet", amount),
  });

  // All-in bet shoves the hero's full remaining stack.
  if (legal.maxBet > 0 && legal.maxBet > effectiveMinBet) {
    betRow.append(createHeroActionButton(
      `All in ${formatAmount(legal.maxBet, state)}`,
      () => actions.heroPostflopAction("bet", legal.maxBet),
    ));
  }

  const presetRow = createPotPresetRow({
    actions,
    pot: state.hand.pot,
    min: effectiveMinBet,
    max: legal.maxBet,
  });

  wrapper.append(heading, buttonRow, betRow, presetRow);
  return wrapper;
}

function createCompletionCue(state, actions) {
  const cue = completionCueForState(state);

  if (!actions || !cue) {
    return null;
  }

  const wrapper = document.createElement("section");
  wrapper.className = "completion-cue";
  wrapper.setAttribute("aria-label", cue.ariaLabel);

  const heading = document.createElement("h3");
  heading.textContent = cue.heading;

  const text = document.createElement("p");
  text.textContent = cue.text;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "completion-cue__button";
  button.textContent = cue.buttonLabel;
  button.addEventListener("click", cue.action === "continue"
    ? () => actions.continueScriptedHand()
    : () => actions.dealNewHand());

  wrapper.append(heading, text, button);
  return wrapper;
}

function createHeroActionButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hero-action-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

// Shared bet/raise sizing row. The amount lives ONLY in the box (with a clear
// "Raise to" affordance), and the confirm button carries no number — so the two
// can never show different values. The button commits whatever's in the box,
// clamped to the legal range; the box snaps to the clamped value on blur.
function createWagerRow({ state, actions, min, max, initial, label, confirmLabel, onCommit }) {
  const row = document.createElement("div");
  row.className = "hero-actions__raise";

  // The engine works in big blinds, but the table (Call / All-in buttons, pot)
  // shows the player's display unit — $ by default. Show and accept the box in
  // that SAME unit so the numbers agree, converting back to bb on commit. This
  // is what made a 3bb min-raise read "3" next to a "$3" call.
  // Tournament mode works in chips (no $/bb conversion); cash shows the player's
  // display unit ($ by default), so the box agrees with the Call / All-in labels.
  const isTournament = Boolean(state.tournament?.enabled);
  const isBb = !isTournament && state.ui?.displayUnit === "bb";
  const rate = isTournament || isBb ? 1 : (Number(state.config?.bbDollarValue) || 2);
  // Chips is implied by the table (stacks read "1,000 · 5bb"), so don't repeat it
  // here — it just crowds the box and clips the number. Keep the unit for $/bb.
  const unitLabel = isTournament ? "" : (isBb ? "(bb)" : "($)");
  const toDisplay = (bb) => formatNumber(bb * rate);
  const fromDisplay = (text) => clampAmount(Number(text) / rate, min, max);

  const valueBb = clampAmount(initial ?? (state.ui.heroRaiseTo || min), min, max);

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.value = toDisplay(valueBb);
  input.setAttribute("aria-label", `${confirmLabel} to amount`);
  input.addEventListener("change", () => {
    const bb = fromDisplay(input.value);
    input.value = toDisplay(bb);
    actions.setHeroRaiseTo(bb);
  });

  const field = document.createElement("div");
  field.className = "hero-actions__field";
  const span = document.createElement("span");
  span.className = "hero-actions__field-label";
  span.textContent = unitLabel ? `${label} ${unitLabel}` : label;
  field.append(span, input);

  const confirm = createHeroActionButton(confirmLabel, () => onCommit(fromDisplay(input.value)));

  row.append(field, confirm);
  return row;
}

function completionCueForState(state) {
  if (state.hand.postflop?.status === "streetComplete") {
    const nextStreet = state.hand.postflop.street === "flop" ? "turn" : "river";

    return {
      ariaLabel: "Street complete",
      heading: `${capitalize(state.hand.postflop.street)} complete`,
      text: `Continue to the ${nextStreet}.`,
      buttonLabel: `Continue to ${nextStreet}`,
      action: "continue",
    };
  }

  if (!state.hand.postflop && state.hand.preflop?.status === "complete" && state.hand.preflop.result === "wouldSeeFlop") {
    return {
      ariaLabel: "Preflop complete",
      heading: "Preflop complete",
      text: "Continue to the flop.",
      buttonLabel: "Continue to flop",
      action: "continue",
    };
  }

  if (isTerminalHand(state)) {
    return {
      ariaLabel: "Hand complete",
      heading: "Hand complete",
      text: "Deal next hand to continue.",
      buttonLabel: "Deal next hand",
      action: "deal",
    };
  }

  return null;
}

function preflopResultText(state) {
  const preflop = state.hand.preflop;

  if (!preflop) {
    return "";
  }

  if (preflop.result === "winner") {
    return `${seatLabel(preflop.winnerSeat, state.config.heroSeat, state)} wins preflop uncontested.`;
  }

  return "Preflop complete - continue to flop.";
}

function postflopResultText(state) {
  const postflop = state.hand.postflop;

  if (!postflop) {
    return "";
  }

  if (postflop.status === "waitingHero") {
    return `Hero to act on the ${postflop.street}.`;
  }

  if (postflop.status === "streetComplete") {
    return `${capitalize(postflop.street)} complete.`;
  }

  if (postflop.result === "winner") {
    return `${seatLabel(postflop.winnerSeat, state.config.heroSeat, state)} wins the ${postflop.street} uncontested.`;
  }

  if (postflop.result === "showdown") {
    return "Hand complete at showdown.";
  }

  return `${capitalize(postflop.street)} action running.`;
}

function preflopStatusText(state) {
  const preflop = state.hand.preflop;

  if (!preflop) {
    return "Not started";
  }

  if (preflop.status === "waitingHero") {
    return "Hero to act";
  }

  if (preflop.status === "complete") {
    return preflopResultText(state);
  }

  return "Running";
}

function postflopStatusText(state) {
  const postflop = state.hand.postflop;

  if (!postflop) {
    return null;
  }

  if (postflop.status === "waitingHero") {
    return `Hero to act on ${postflop.street}`;
  }

  if (postflop.status === "streetComplete") {
    return `${capitalize(postflop.street)} complete`;
  }

  if (postflop.status === "complete") {
    return postflopResultText(state);
  }

  return `${capitalize(postflop.street)} running`;
}

// The inline preflop hint near the action controls. Returns { label, text } so
// the caller can title it for the actual spot, or null to stay quiet. Uses the
// same spot-aware lookup + action mapping as the bet tip and the tracker grader
// (getRangeForSpot + recommendedAction), so all three agree — opens, blind
// defense, vs-raise, and vs-3-bet — rather than only showing the RFI read.
function heroRfiText(state) {
  if (state.hand.street !== "preflop") {
    return null;
  }

  const positions = state.hand.preflop?.positions || getSeatPositions({
    players: state.config.players,
    buttonSeat: state.hand.buttonSeat,
  });
  const heroSeat = state.config.heroSeat;
  const heroPosition = positions[heroSeat];
  const heroCards = state.hand.holeCards[heroSeat] || [];

  const range = getRangeForSpot({
    players: state.config.players,
    seat: heroSeat,
    position: heroPosition,
    hand: state.hand,
    effBb: state.hand.preflop?.effectiveStackBb,
  });

  // Folded to the BB (a check/walk) — no decision to train, stay quiet.
  if (range.kind === "walk") {
    return null;
  }

  // RFI opens keep the three-way open / mixed / fold read off the opening grid.
  if (range.kind === "rfi") {
    if (!range.chartAvailable) {
      return { label: "RFI", text: range.message || "No RFI chart for this position yet." };
    }
    if (range.isPlaceholder) {
      return null;
    }
    const verdict = heroRangeVerdict(heroCards, range.grid);
    if (verdict.status === "not in range") return { label: "RFI", text: "fold" };
    if (verdict.status === "mixed") return { label: "RFI", text: "mixed" };
    return { label: "RFI", text: "raise" };
  }

  // Facing action: defend-vs-open or vs-3-bet. Map via the shared grader.
  const action = recommendedAction({ range, handKey: canonicalHandKey(heroCards) });
  const label = range.kind === "vs3bet" ? "Vs 3-bet" : "Defend";

  switch (action) {
    case "raise": return { label, text: "raise" };
    case "threeBet": return { label, text: "3-bet" };
    case "fourBet": return { label, text: "4-bet" };
    case "call": return { label, text: "call" };
    case "fold": return { label, text: "fold" };
    default: return null; // fallback / no chart — the bet tip explains the spot
  }
}

function currentPhaseState(state) {
  return state.hand.postflop || state.hand.preflop;
}

export function winnerSeatsForBadges(state) {
  if (!isTerminalHand(state)) {
    return [];
  }

  const postflopWinners = phaseChipWinners(state.hand.postflop);

  if (postflopWinners.length) {
    return postflopWinners;
  }

  return phaseChipWinners(state.hand.preflop);
}

function phaseChipWinners(phase) {
  if (!phase || phase.status !== "complete") {
    return [];
  }

  if (Array.isArray(phase.winnerSeats) && phase.winnerSeats.length) {
    return phase.winnerSeats;
  }

  if (phase.result !== "winner") {
    return [];
  }

  return phase.winnerSeat === null || phase.winnerSeat === undefined ? [] : [phase.winnerSeat];
}

function showdownHoleCards(state) {
  const phase = currentPhaseState(state);

  if (!phase) {
    return state.hand.holeCards;
  }

  return Object.fromEntries(
    Object.entries(state.hand.holeCards)
      .filter(([seat]) => !phase.folded?.[seat]),
  );
}

function isTerminalHand(state) {
  return state.hand.postflop?.status === "complete"
    || (state.hand.preflop?.status === "complete" && state.hand.preflop.result === "winner")
    || state.hand.street === "showdown";
}

function capitalize(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";
}

function createMeta(label, value) {
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  description.textContent = value;
  wrapper.append(term, description);
  return wrapper;
}

function seatLabel(seat, heroSeat, state = null) {
  if (seat === heroSeat) {
    return activeHeroName(state) || "Hero";
  }

  return `Seat ${seat + 1}`;
}

function activeHeroName(state) {
  if (!state?.activeHeroId) {
    return "";
  }

  return state.heroes?.find((hero) => hero.id === state.activeHeroId)?.name || "";
}

function rosterPlayerForSeat(state, seat) {
  const id = state.config.seatPlayers?.[seat];

  if (!id) {
    return null;
  }

  return state.roster?.find((player) => player.id === id) || null;
}

function heroIsBusted(state) {
  if (!isTerminalHand(state)) {
    return false;
  }

  const phase = currentPhaseState(state);
  const stack = phase?.stacks?.[state.config.heroSeat];
  return typeof stack === "number" && stack <= 0;
}

function createBustBanner(state, actions) {
  if (!actions || !heroIsBusted(state)) {
    return null;
  }

  const banner = document.createElement("div");
  banner.className = "bust-banner";

  const text = document.createElement("p");
  text.textContent = "You're out of chips — rebuy or start a new game.";

  const row = document.createElement("div");
  row.className = "bust-banner__actions";
  const rebuyAmount = state.tournament?.enabled
    ? (Number(state.tournament.buyIn) > 0
      ? Number(state.tournament.buyIn)
      : getBlindStructure(state.tournament.structureId).startingStack)
    : state.config.stack;
  row.append(
    createHeroActionButton(`Rebuy ${formatAmount(rebuyAmount, state)}`, () => actions.rebuyHero()),
    createHeroActionButton("New game", () => actions.newGame()),
  );

  banner.append(text, row);
  return banner;
}

function formatPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  return `${Math.round(number * 100)}%`;
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Number(value)).filter(Number.isFinite))];
}

function clampAmount(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(Math.max(number, min), max);
}

// Drill panel: a guided sequence of replayed leak spots. Shows progress and the
// advance/end controls; the per-decision grade renders in the live-grading panel
// below (drills force live grading on). Returns null when no drill is running.
function createDrillPanel(state, actions) {
  const drill = state?.drill;

  if (!drill?.active) {
    return null;
  }

  const generated = drill.mode === "generated";
  const total = drill.spots.length;
  const stats = drillSummary(drill);
  const matched = stats.matched;
  const answered = stats.total;
  const done = isDrillComplete(drill);

  const panel = document.createElement("section");
  panel.className = "drill-panel";
  panel.setAttribute("aria-label", "Drill");

  const header = document.createElement("div");
  header.className = "drill-panel__header";

  const title = document.createElement("strong");
  title.textContent = `${generated ? "Generated drill" : "Drill"}: ${drill.leakType}`;

  const end = document.createElement("button");
  end.type = "button";
  end.className = "drill-panel__end";
  end.textContent = "End drill";
  end.addEventListener("click", () => actions.endDrill());

  header.append(title, end);
  panel.append(header);

  if (done) {
    const summary = document.createElement("p");
    summary.className = "drill-panel__summary";
    const extras = [];
    if (stats.resurfaced) {
      extras.push(`${stats.resurfaced} replayed after a miss`);
    }
    if (stats.evLostBb < 0) {
      extras.push(`${Math.abs(stats.evLostBb)}bb EV lost`);
    }
    const tail = extras.length ? ` (${extras.join(", ")})` : "";
    summary.textContent = `Done - matched the engine on ${matched}/${answered} spot${answered === 1 ? "" : "s"}${tail}.`;

    const finish = document.createElement("button");
    finish.type = "button";
    finish.className = "drill-panel__next";
    finish.textContent = "Finish";
    finish.addEventListener("click", () => actions.endDrill());

    panel.append(summary, finish);
    return panel;
  }

  const progress = document.createElement("p");
  progress.className = "drill-panel__progress";
  progress.textContent = generated
    ? `Spot ${drill.index + 1}  -  ${matched}/${answered} matched`
    : `Spot ${drill.index + 1} of ${total}  -  ${matched}/${answered} matched so far`;
  panel.append(progress);

  if (drill.awaitingNext) {
    const next = document.createElement("button");
    next.type = "button";
    next.className = "drill-panel__next";
    next.textContent = !generated && drill.index + 1 >= total ? "See results" : "Next spot";
    next.addEventListener("click", () => actions.drillAdvance());
    panel.append(next);
  } else {
    const hint = document.createElement("p");
    hint.className = "drill-panel__hint";
    hint.textContent = "Play the spot - your decision is graded below.";
    panel.append(hint);
  }

  return panel;
}

// Live-grading panel: shows the most recent hero decision's matched/missed
// state and a one-line reason. Gated on `state.session.enabled` so it's quiet
// by default. Returns null when there's nothing to show (no decision yet, or
// session disabled).
export function createLiveGradingPanel(state) {
  if (!state?.session?.enabled) {
    return null;
  }

  const wrapper = document.createElement("section");
  wrapper.className = "live-grading-panel";
  wrapper.setAttribute("aria-label", "Live grading");

  wrapper.append(createSessionScoreboard(state.session));

  const feedback = state.hand.lastFeedback;

  if (feedback) {
    const line = document.createElement("p");
    line.className = "live-grading-line";

    if (feedback.matched === null) {
      line.classList.add("live-grading-line--unknown");
    } else if (feedback.matched) {
      line.classList.add("live-grading-line--matched");
    } else {
      line.classList.add("live-grading-line--missed");
    }

    line.textContent = describeFeedback(feedback);
    wrapper.append(line);
  }

  return wrapper;
}

// Session tally: graded decisions, how many matched the engine, and net EV delta
// (0 = perfect, negative = leaked). A session runs from the last New game.
function createSessionScoreboard(session) {
  const strip = document.createElement("dl");
  strip.className = "session-scoreboard";

  const decisions = Number(session.decisions) || 0;
  const matched = Number(session.matched) || 0;
  const accuracy = decisions > 0 ? Math.round((matched / decisions) * 100) : null;

  [
    ["Graded", String(decisions)],
    ["Matched", decisions > 0 ? `${matched}/${decisions} (${accuracy}%)` : "--"],
    ["Net", formatSignedBb(session.evDeltaBb).replace(/^EV /, "")],
  ].forEach(([label, value]) => {
    const cell = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    cell.append(term, description);
    strip.append(cell);
  });

  return strip;
}

function describeFeedback(feedback) {
  const handLabel = feedback.hand ? `${feedback.hand} ` : "";
  const actionLabel = formatActionLabel(feedback.heroAction);
  const recommendedLabel = formatActionLabel(feedback.recommended);
  const spotLabel = feedback.spot ? ` (${feedback.spot})` : "";

  if (feedback.matched === null) {
    return `${handLabel}${actionLabel}${spotLabel} - no chart for the engine to grade.`;
  }

  if (feedback.matched) {
    return `${handLabel}${actionLabel}${spotLabel} - matched the engine (${recommendedLabel}).`;
  }

  const delta = formatSignedBb(feedback.evDeltaBb);
  const reason = feedback.reason ? ` - ${feedback.reason}` : "";
  return `${handLabel}${actionLabel}${spotLabel} - missed (engine: ${recommendedLabel}, ${delta})${reason}.`;
}

function formatActionLabel(action) {
  if (!action) {
    return "no action";
  }

  return {
    raise: "raise",
    threeBet: "3-bet",
    fourBet: "4-bet",
    call: "call",
    check: "check",
    fold: "fold",
    bet: "bet",
  }[action] || action;
}

function formatSignedBb(value) {
  const number = Number(value) || 0;
  const rounded = Math.round(number * 10) / 10;
  if (rounded === 0) {
    return "EV 0.0 bb";
  }

  const sign = rounded > 0 ? "+" : "-";
  return `EV ${sign}${Math.abs(rounded).toFixed(1)} bb`;
}
