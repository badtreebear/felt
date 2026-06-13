import { STREET_LABELS } from "../engine/deck.js";
import { PLAYER_PROFILES } from "../engine/player-model.js";
import { resolveShowdown } from "../engine/hand-eval.js";
import { legalHeroActions } from "../engine/preflop-action.js";
import { getSeatPositions } from "../engine/positions.js";
import { getOpeningRange } from "../data/ranges/opening-ranges.js";
import { createCard, createCardRow } from "./cards.js";
import { createMathsChips } from "./chips.js";
import { formatAmount } from "./formatting.js";
import { createPopover } from "./popover.js";
import { createRangeGrid, heroRangeVerdict } from "./range-grid.js";
import { rangePopoverPlacement } from "./range-popover-placement.js";

const RANGE_CLOSE_DELAY_MS = 120;
let rangeCloseTimer = null;

export function renderTable(container, state, actions) {
  container.replaceChildren();

  const shell = document.createElement("main");
  shell.className = "table-shell";

  const table = document.createElement("section");
  table.className = "poker-table";
  table.setAttribute("aria-label", "Poker table");

  const showdown = state.hand.street === "showdown"
    ? resolveShowdown({ holeCards: state.hand.holeCards, board: state.hand.board })
    : null;

  table.append(createBoard(state, showdown));
  table.append(createSeats(state, showdown, actions));
  shell.append(table, createHandPanel(state, showdown, actions));
  container.append(shell);
}

function createBoard(state, showdown) {
  const board = document.createElement("div");
  board.className = "board";

  const pot = document.createElement("div");
  pot.className = "pot";
  pot.innerHTML = `
    <span>${state.hand.toCall > 0 ? "Pot before bet" : "Pot"}</span>
    <strong>${formatAmount(state.hand.pot, state)}</strong>
    ${state.hand.toCall > 0 ? `<em>Call ${formatAmount(state.hand.toCall, state)}</em>` : ""}
  `;

  const street = document.createElement("div");
  street.className = "street-badge";
  street.textContent = STREET_LABELS[state.hand.street];

  const cards = document.createElement("div");
  cards.className = "board-cards";

  state.hand.board.forEach((card) => cards.append(createCard(card)));
  const missingCards = Math.max(0, 5 - state.hand.board.length);
  Array.from({ length: missingCards }, () => cards.append(createCard("", { placeholder: true })));

  const result = document.createElement("div");
  result.className = "showdown-result";

  if (showdown) {
    const winnerNames = showdown.winnerSeats.map((seat) => seatLabel(seat, state.config.heroSeat));
    result.textContent = `${winnerNames.join(" + ")} win with ${showdown.winningDescription}`;
  } else if (state.hand.preflop?.status === "complete") {
    result.textContent = preflopResultText(state);
  } else if (state.hand.preflop?.status === "waitingHero") {
    result.textContent = "Hero to act preflop.";
  } else {
    result.textContent = "Villains are resolving preflop action.";
  }

  board.append(pot, street, cards, result);
  return board;
}

function createSeats(state, showdown, actions) {
  const seats = document.createElement("div");
  seats.className = "seats";

  const players = state.config.players;
  const heroSeat = state.config.heroSeat;
  const positions = getSeatPositions({ players, buttonSeat: state.hand.buttonSeat });
  const preflop = state.hand.preflop;
  seats.dataset.players = String(players);

  for (let seat = 0; seat < players; seat += 1) {
    const seatElement = document.createElement("article");
    const isHero = seat === heroSeat;
    const isWinner = showdown?.winnerSeats.includes(seat) || preflop?.winnerSeat === seat;
    const isFolded = Boolean(preflop?.folded?.[seat]);
    const isActing = preflop?.status === "waitingHero" && preflop.currentSeat === seat;
    const position = positions[seat];
    const showCards = isHero || state.ui.revealVillains || state.hand.street === "showdown";
    const visualIndex = (seat - heroSeat + players) % players;
    const angle = 90 + visualIndex * (360 / players);
    const x = 50 + Math.cos((angle * Math.PI) / 180) * 36;
    const y = 50 + Math.sin((angle * Math.PI) / 180) * 35;

    seatElement.className = "seat";
    seatElement.classList.toggle("seat--hero", isHero);
    seatElement.classList.toggle("seat--winner", Boolean(isWinner));
    seatElement.classList.toggle("seat--folded", isFolded);
    seatElement.classList.toggle("seat--acting", isActing);
    seatElement.style.setProperty("--seat-x", `${x}%`);
    seatElement.style.setProperty("--seat-y", `${y}%`);

    const title = document.createElement("div");
    title.className = "seat__title";

    const name = document.createElement("strong");
    name.textContent = seatLabel(seat, heroSeat);

    const stack = document.createElement("span");
    stack.textContent = formatAmount(preflop?.stacks?.[seat] ?? state.config.stack, state);

    title.append(name, stack);

    const cards = createCardRow(state.hand.holeCards[seat] || [], { hidden: !showCards });
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

    const committed = preflop?.contributions?.[seat] || 0;

    if (committed > 0) {
      const commit = document.createElement("span");
      commit.className = "commit-badge";
      commit.textContent = `In ${formatAmount(committed, state)}`;
      badges.append(commit);
    }

    const profileBadge = createProfileBadge({ seat, isHero, state });

    if (profileBadge) {
      badges.append(profileBadge);
    }

    badges.append(createPositionBadge({ seat, position, state, actions }));

    seatElement.append(title, cards, badges);

    if (isHero) {
      const chips = createMathsChips(state, actions);

      if (chips) {
        seatElement.append(chips);
      }
    }

    seats.append(seatElement);
  }

  return seats;
}

function createProfileBadge({ seat, isHero, state }) {
  const showProfile = !isHero && (state.ui.showProfiles || state.hand.preflop?.status === "complete");

  if (!showProfile) {
    return null;
  }

  const profileId = state.config.seatProfiles?.[String(seat)] || "standard";
  const profile = PLAYER_PROFILES[profileId] || PLAYER_PROFILES.standard;
  const badge = document.createElement("span");
  badge.className = "profile-badge";
  badge.textContent = profile.label || profileId;
  badge.title = `Range ${profile.rangeWidth} / aggression ${profile.aggression} / sizing ${profile.sizing}`;
  return badge;
}

function createPositionBadge({ seat, position, state, actions }) {
  const wrapper = document.createElement("span");
  wrapper.className = "position-badge-wrap";
  wrapper.addEventListener("mouseenter", () => {
    cancelRangeClose();

    if (state.ui.openRangeSeat !== seat) {
      actions.setOpenRangeSeat(seat);
    }
  });
  wrapper.addEventListener("mouseleave", () => scheduleRangeClose(actions));

  const button = document.createElement("button");
  button.type = "button";
  button.className = "position-badge";
  button.textContent = position;
  button.setAttribute("aria-expanded", String(state.ui.openRangeSeat === seat));
  button.addEventListener("focus", () => {
    cancelRangeClose();
    actions.setOpenRangeSeat(seat);
  });
  button.addEventListener("click", () => {
    cancelRangeClose();
    actions.setOpenRangeSeat(seat);
  });

  wrapper.append(button);

  if (state.ui.openRangeSeat === seat) {
    const range = getOpeningRange({ players: state.config.players, position });
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

  const heading = document.createElement("h2");
  heading.textContent = "Hand flow";

  const meta = document.createElement("dl");
  meta.className = "hand-meta";
  meta.append(createMeta("Seed", state.hand.seed || "Pending"));
  meta.append(createMeta("Board", state.hand.board.length ? state.hand.board.join(" ") : "No board yet"));

  if (state.hand.preflop) {
    meta.append(createMeta("Preflop", preflopStatusText(state)));
  }

  const heroRfi = heroRfiText(state);

  if (heroRfi) {
    meta.append(createMeta("RFI", heroRfi));
  }

  if (state.hand.toCall > 0) {
    meta.append(createMeta("To call", formatAmount(state.hand.toCall, state)));
    meta.append(createMeta("Equity", `${formatPercent(state.maths.heroEquity)} ${state.maths.simStatus === "running" ? "running" : ""}`.trim()));
    meta.append(createMeta("Pot odds", formatPercent(state.maths.requiredEquity)));
    meta.append(createMeta("EV call", formatAmount(state.maths.evCall, state, { signed: true })));
  }

  if (showdown) {
    meta.append(createMeta("Best hand", showdown.winningDescription));
  }

  const log = document.createElement("ol");
  log.className = "action-log";

  state.hand.actionLog.forEach((entry) => {
    const item = document.createElement("li");
    const size = entry.size ? ` ${formatAmount(entry.size, state)}` : "";
    item.textContent = `${STREET_LABELS[entry.street]}: ${seatLabel(entry.seat, state.config.heroSeat)} ${entry.action}${size}`;
    log.append(item);
  });

  const heroControls = createHeroActionControls(state, actions);

  panel.append(heading, meta);

  if (heroControls) {
    panel.append(heroControls);
  }

  panel.append(log);
  return panel;
}

function createHeroActionControls(state, actions) {
  const legal = legalHeroActions(state.hand.preflop);

  if (!actions || !legal.canAct) {
    return null;
  }

  const raiseTo = clampAmount(
    state.ui.heroRaiseTo || legal.minRaiseTo,
    legal.minRaiseTo,
    legal.maxRaiseTo,
  );
  const wrapper = document.createElement("section");
  wrapper.className = "hero-actions";
  wrapper.setAttribute("aria-label", "Hero preflop action");

  const heading = document.createElement("h3");
  heading.textContent = "Hero action";

  const buttonRow = document.createElement("div");
  buttonRow.className = "hero-actions__row";

  const foldButton = createHeroActionButton("Fold", () => actions.heroPreflopAction("fold"));
  const callLabel = legal.callAmount > 0
    ? `Call ${formatAmount(legal.callAmount, state)}`
    : "Check";
  const callButton = createHeroActionButton(callLabel, () => actions.heroPreflopAction("call"));

  buttonRow.append(foldButton, callButton);

  const raiseRow = document.createElement("div");
  raiseRow.className = "hero-actions__raise";

  const input = document.createElement("input");
  input.type = "number";
  input.min = String(legal.minRaiseTo);
  input.max = String(legal.maxRaiseTo);
  input.step = "0.5";
  input.value = String(raiseTo);
  input.setAttribute("aria-label", "Raise amount");
  input.addEventListener("input", (event) => {
    actions.setHeroRaiseTo(Number(event.currentTarget.value));
  });

  const raiseButton = createHeroActionButton(
    `Raise to ${formatAmount(raiseTo, state)}`,
    () => actions.heroPreflopAction("raise", raiseTo),
  );

  raiseRow.append(input, raiseButton);

  const presetRow = document.createElement("div");
  presetRow.className = "hero-actions__presets";

  uniqueNumbers([2.5, 3, state.hand.pot]).forEach((amount) => {
    const target = clampAmount(amount, legal.minRaiseTo, legal.maxRaiseTo);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = amount === state.hand.pot ? "Pot" : formatAmount(amount, state);
    button.addEventListener("click", () => actions.setHeroRaiseTo(target));
    presetRow.append(button);
  });

  wrapper.append(heading, buttonRow, raiseRow, presetRow);
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

function preflopResultText(state) {
  const preflop = state.hand.preflop;

  if (!preflop) {
    return "";
  }

  if (preflop.result === "winner") {
    return `${seatLabel(preflop.winnerSeat, state.config.heroSeat)} wins preflop.`;
  }

  return "Preflop complete - would see flop.";
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

function heroRfiText(state) {
  if (state.hand.street !== "preflop") {
    return null;
  }

  const positions = getSeatPositions({
    players: state.config.players,
    buttonSeat: state.hand.buttonSeat,
  });
  const heroPosition = positions[state.config.heroSeat];
  const range = getOpeningRange({ players: state.config.players, position: heroPosition });

  if (!range.chartAvailable) {
    return range.message || "No RFI chart for this position yet.";
  }

  if (range.isPlaceholder) {
    return null;
  }

  const heroCards = state.hand.holeCards[state.config.heroSeat] || [];
  const verdict = heroRangeVerdict(heroCards, range.grid);

  if (verdict.status === "not in range") {
    return "fold";
  }

  if (verdict.status === "mixed") {
    return "mixed";
  }

  return "raise";
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

function seatLabel(seat, heroSeat) {
  return seat === heroSeat ? "Hero" : `Seat ${seat + 1}`;
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
