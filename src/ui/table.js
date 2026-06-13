import { STREET_LABELS } from "../engine/deck.js";
import { PLAYER_PROFILES } from "../engine/player-model.js";
import { resolveShowdown } from "../engine/hand-eval.js";
import { legalHeroActions } from "../engine/preflop-action.js";
import { legalPostflopActions } from "../engine/postflop-action.js";
import { getSeatPositions } from "../engine/positions.js";
import { getOpeningRange } from "../data/ranges/opening-ranges.js";
import { createCard, createCardRow } from "./cards.js";
import { createMathsChips, shouldShowMathsPanel } from "./chips.js";
import { formatAmount } from "./formatting.js";
import { createPopover } from "./popover.js";
import { createRangeGrid, heroRangeVerdict } from "./range-grid.js";
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

  const showdown = state.hand.street === "showdown"
    ? resolveShowdown({ holeCards: showdownHoleCards(state), board: state.hand.board })
    : null;

  table.append(createBoard(state, showdown));
  table.append(createSeats(state, showdown, actions));
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
  pot.innerHTML = `
    <span>${potLabel}</span>
    <strong>${formatAmount(state.hand.pot, state)}</strong>
    ${!handTerminal && state.hand.toCall > 0 ? `<em>Call ${formatAmount(state.hand.toCall, state)}</em>` : ""}
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
    const winnerVerb = winnerNames.length === 1 ? "wins" : "win";
    result.textContent = `${winnerNames.join(" + ")} ${winnerVerb} with ${showdown.winningDescription}`;
  } else if (state.hand.postflop) {
    result.textContent = postflopResultText(state);
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
  const phase = currentPhaseState(state);
  const handTerminal = isTerminalHand(state);
  seats.dataset.players = String(players);

  for (let seat = 0; seat < players; seat += 1) {
    const seatElement = document.createElement("article");
    const isHero = seat === heroSeat;
    const isWinner = showdown?.winnerSeats.includes(seat) || phaseWinners(phase).includes(seat);
    const isFolded = Boolean(phase?.folded?.[seat]);
    const isActing = phase?.status === "waitingHero" && phase.currentSeat === seat;
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
    stack.textContent = formatAmount(phase?.stacks?.[seat] ?? state.config.stack, state);

    title.append(name, stack);

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
  const showProfile = !isHero && (state.ui.showProfiles || isTerminalHand(state));

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

  if (state.hand.postflop) {
    meta.append(createMeta("Postflop", postflopStatusText(state)));
  }

  const heroRfi = heroRfiText(state);

  if (heroRfi) {
    meta.append(createMeta("RFI", heroRfi));
  }

  if (shouldShowMathsPanel(state)) {
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
  log.reversed = true;

  [...state.hand.actionLog].reverse().forEach((entry) => {
    const item = document.createElement("li");
    const size = entry.size ? ` ${formatAmount(entry.size, state)}` : "";
    item.textContent = withSuitGlyphs(`${STREET_LABELS[entry.street]}: ${seatLabel(entry.seat, state.config.heroSeat)} ${entry.action}${size}`);
    log.append(item);
  });

  const heroControls = createHeroActionControls(state, actions);
  const completionCue = createCompletionCue(state, actions);

  panel.append(heading, meta);

  if (heroControls) {
    panel.append(heroControls);
  }

  if (completionCue) {
    panel.append(completionCue);
  }

  panel.append(log);
  return panel;
}

function createHeroActionControls(state, actions) {
  if (state.hand.postflop?.status === "waitingHero") {
    return createPostflopHeroActionControls(state, actions);
  }

  return createPreflopHeroActionControls(state, actions);
}

function createPreflopHeroActionControls(state, actions) {
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

  const callIsAllIn = legal.callAmount > 0 && legal.callAmount >= legal.stack;
  const foldButton = createHeroActionButton("Fold", () => actions.heroPreflopAction("fold"));
  const callLabel = legal.callAmount > 0
    ? (callIsAllIn ? `All in ${formatAmount(legal.stack, state)}` : `Call ${formatAmount(legal.callAmount, state)}`)
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

  // All-in raise (only when the hero has chips beyond a call).
  if (!callIsAllIn && legal.maxRaiseTo > legal.callAmount) {
    raiseRow.append(createHeroActionButton(
      `All in ${formatAmount(legal.maxRaiseTo, state)}`,
      () => actions.heroPreflopAction("raise", legal.maxRaiseTo),
    ));
  }

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

function createPostflopHeroActionControls(state, actions) {
  const legal = legalPostflopActions(state.hand.postflop);

  if (!actions || !legal.canAct) {
    return null;
  }

  const effectiveMinBet = Math.min(legal.minBet, legal.maxBet);
  const betAmount = clampAmount(
    state.ui.heroRaiseTo || state.hand.postflop.suggestedHeroBet || legal.minBet,
    effectiveMinBet,
    legal.maxBet,
  );
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
    return wrapper;
  }

  buttonRow.append(createHeroActionButton("Check", () => actions.heroPostflopAction("check")));

  const betRow = document.createElement("div");
  betRow.className = "hero-actions__raise";

  const input = document.createElement("input");
  input.type = "number";
  input.min = String(effectiveMinBet);
  input.max = String(legal.maxBet);
  input.step = "0.5";
  input.value = String(betAmount);
  input.setAttribute("aria-label", "Bet amount");
  input.addEventListener("input", (event) => {
    actions.setHeroRaiseTo(Number(event.currentTarget.value));
  });

  betRow.append(
    input,
    createHeroActionButton(`Bet ${formatAmount(betAmount, state)}`, () => actions.heroPostflopAction("bet", betAmount)),
  );

  // All-in bet shoves the hero's full remaining stack.
  if (legal.maxBet > 0 && legal.maxBet > betAmount) {
    betRow.append(createHeroActionButton(
      `All in ${formatAmount(legal.maxBet, state)}`,
      () => actions.heroPostflopAction("bet", legal.maxBet),
    ));
  }

  const presetRow = document.createElement("div");
  presetRow.className = "hero-actions__presets";

  uniqueNumbers([state.hand.pot * 0.5, state.hand.pot, betAmount]).forEach((amount) => {
    const target = clampAmount(amount, legal.minBet, legal.maxBet);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = amount === state.hand.pot ? "Pot" : formatAmount(target, state);
    button.addEventListener("click", () => actions.setHeroRaiseTo(target));
    presetRow.append(button);
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
    return `${seatLabel(preflop.winnerSeat, state.config.heroSeat)} wins preflop uncontested.`;
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
    return `${seatLabel(postflop.winnerSeat, state.config.heroSeat)} wins the ${postflop.street} uncontested.`;
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

function currentPhaseState(state) {
  return state.hand.postflop || state.hand.preflop;
}

function phaseWinners(phase) {
  if (!phase) {
    return [];
  }

  if (Array.isArray(phase.winnerSeats) && phase.winnerSeats.length) {
    return phase.winnerSeats;
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
