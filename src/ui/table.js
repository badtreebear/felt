import { STREET_LABELS } from "../engine/deck.js";
import { resolveShowdown } from "../engine/hand-eval.js";
import { getSeatPositions } from "../engine/positions.js";
import { getOpeningRange } from "../data/ranges/opening-ranges.js";
import { createCard, createCardRow } from "./cards.js";
import { createMathsChips } from "./chips.js";
import { createPopover } from "./popover.js";
import { createRangeGrid } from "./range-grid.js";

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
  shell.append(table, createHandPanel(state, showdown));
  container.append(shell);
}

function createBoard(state, showdown) {
  const board = document.createElement("div");
  board.className = "board";

  const pot = document.createElement("div");
  pot.className = "pot";
  pot.innerHTML = `
    <span>${state.hand.toCall > 0 ? "Pot before bet" : "Pot"}</span>
    <strong>${formatBb(state.hand.pot)}</strong>
    ${state.hand.toCall > 0 ? `<em>Call ${formatBb(state.hand.toCall)}</em>` : ""}
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
  } else {
    result.textContent = "Advance streets to reveal the full board.";
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

  for (let seat = 0; seat < players; seat += 1) {
    const seatElement = document.createElement("article");
    const isHero = seat === heroSeat;
    const isWinner = showdown?.winnerSeats.includes(seat);
    const position = positions[seat];
    const showCards = isHero || state.ui.revealVillains || state.hand.street === "showdown";
    const visualIndex = (seat - heroSeat + players) % players;
    const angle = 90 + visualIndex * (360 / players);
    const x = 50 + Math.cos((angle * Math.PI) / 180) * 36;
    const y = 50 + Math.sin((angle * Math.PI) / 180) * 35;

    seatElement.className = "seat";
    seatElement.classList.toggle("seat--hero", isHero);
    seatElement.classList.toggle("seat--winner", Boolean(isWinner));
    seatElement.style.setProperty("--seat-x", `${x}%`);
    seatElement.style.setProperty("--seat-y", `${y}%`);

    const title = document.createElement("div");
    title.className = "seat__title";

    const name = document.createElement("strong");
    name.textContent = seatLabel(seat, heroSeat);

    const stack = document.createElement("span");
    stack.textContent = `${state.config.stack} BB`;

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

function createPositionBadge({ seat, position, state, actions }) {
  const wrapper = document.createElement("span");
  wrapper.className = "position-badge-wrap";
  wrapper.addEventListener("mouseleave", () => {
    if (state.ui.openRangeSeat === seat) {
      actions.setOpenRangeSeat(null);
    }
  });

  const button = document.createElement("button");
  button.type = "button";
  button.className = "position-badge";
  button.textContent = position;
  button.setAttribute("aria-expanded", String(state.ui.openRangeSeat === seat));
  button.addEventListener("mouseenter", () => actions.setOpenRangeSeat(seat));
  button.addEventListener("focus", () => actions.setOpenRangeSeat(seat));
  button.addEventListener("click", () => actions.setOpenRangeSeat(seat));

  wrapper.append(button);

  if (state.ui.openRangeSeat === seat) {
    const range = getOpeningRange({ players: state.config.players, position });
    const heroCards = state.hand.holeCards[state.config.heroSeat] || [];
    const popover = createPopover({
      id: `range-popover-${seat}`,
      title: `${position} ${range.bucket} opening range`,
      onClose: () => actions.setOpenRangeSeat(null),
      children: createRangeGrid({ range, heroCards }),
    });
    popover.classList.add("range-popover");
    wrapper.append(popover);
  }

  return wrapper;
}

function createHandPanel(state, showdown) {
  const panel = document.createElement("aside");
  panel.className = "hand-panel";
  panel.setAttribute("aria-label", "Current hand details");

  const heading = document.createElement("h2");
  heading.textContent = "Hand flow";

  const meta = document.createElement("dl");
  meta.className = "hand-meta";
  meta.append(createMeta("Seed", state.hand.seed || "Pending"));
  meta.append(createMeta("Board", state.hand.board.length ? state.hand.board.join(" ") : "No board yet"));

  if (state.hand.toCall > 0) {
    meta.append(createMeta("To call", formatBb(state.hand.toCall)));
    meta.append(createMeta("Equity", `${formatPercent(state.maths.heroEquity)} ${state.maths.simStatus === "running" ? "running" : ""}`.trim()));
    meta.append(createMeta("Pot odds", formatPercent(state.maths.requiredEquity)));
    meta.append(createMeta("EV call", formatBb(state.maths.evCall, { signed: true })));
  }

  if (showdown) {
    meta.append(createMeta("Best hand", showdown.winningDescription));
  }

  const log = document.createElement("ol");
  log.className = "action-log";

  state.hand.actionLog.forEach((entry) => {
    const item = document.createElement("li");
    const size = entry.size ? ` ${entry.size} BB` : "";
    item.textContent = `${STREET_LABELS[entry.street]}: ${seatLabel(entry.seat, state.config.heroSeat)} ${entry.action}${size}`;
    log.append(item);
  });

  panel.append(heading, meta, log);
  return panel;
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

function formatBb(value, { signed = false } = {}) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  const sign = signed && number > 0 ? "+" : "";
  return `${sign}${number.toFixed(1).replace(/\.0$/, "")} BB`;
}
