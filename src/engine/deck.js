import { getBlindSeats } from "./positions.js";

export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
export const SUITS = ["s", "h", "d", "c"];

export const STREET_BOARD_COUNTS = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
  showdown: 5,
};

export const STREET_LABELS = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
};

export function createDeck() {
  return RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`));
}

export function createSeed() {
  const cryptoObject = globalThis.crypto;

  if (cryptoObject?.getRandomValues) {
    const values = new Uint32Array(2);
    cryptoObject.getRandomValues(values);
    return Array.from(values, (value) => value.toString(36)).join("");
  }

  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function createRng(seed) {
  let state = hashSeed(String(seed || "felt"));

  return function rng() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleDeck(deck = createDeck(), seedOrRng = createSeed()) {
  const shuffled = [...deck];
  const rng = typeof seedOrRng === "function" ? seedOrRng : createRng(seedOrRng);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function dealHoldemHand({ players = 6, heroSeat = Math.floor(players / 2), blinds, seed, liveSeats, buttonSeat: requestedButtonSeat } = {}) {
  if (!Number.isInteger(players) || players < 2 || players > 9) {
    throw new Error("Texas Hold'em requires 2 to 9 players.");
  }

  const handSeed = seed || createSeed();
  const rng = createRng(handSeed);
  const deck = shuffleDeck(createDeck(), rng);
  const holeCards = Object.fromEntries(
    Array.from({ length: players }, (_, seat) => [seat, []]),
  );

  for (let round = 0; round < 2; round += 1) {
    for (let seat = 0; seat < players; seat += 1) {
      holeCards[seat].push(deck.shift());
    }
  }

  const burnCards = [];
  burnCards.push(deck.shift());
  const flop = deck.splice(0, 3);
  burnCards.push(deck.shift());
  const turn = deck.splice(0, 1);
  burnCards.push(deck.shift());
  const river = deck.splice(0, 1);
  const boardRunout = [...flop, ...turn, ...river];
  // B5: deal the button + blinds only among live (non-busted) seats, so
  // eliminated players don't get the button or post blinds. With everyone live
  // this matches the old behaviour exactly (same rng draw).
  const live = Array.isArray(liveSeats) && liveSeats.length >= 2
    ? [...liveSeats].sort((a, b) => a - b)
    : Array.from({ length: players }, (_, seat) => seat);
  // Use the caller-supplied button (the session rotates it one seat per hand) when
  // it's a valid live seat; otherwise fall back to a random draw (first hand of a
  // session, or a seed-based deal that reproduces its own button). This rng draw
  // is the LAST one, after all cards are dealt, so skipping it never changes the
  // cards a seed produces.
  const buttonSeat = (Number.isInteger(requestedButtonSeat) && live.includes(requestedButtonSeat))
    ? requestedButtonSeat
    : live[Math.floor(rng() * live.length)];
  const { sbSeat, bbSeat } = getBlindSeats({ players, buttonSeat, liveSeats: live });
  const postedBlinds = blinds || { sb: 0.5, bb: 1 };

  return {
    seed: handSeed,
    deck,
    holeCards,
    board: [],
    boardRunout,
    burnCards,
    street: "preflop",
    pot: postedBlinds.sb + postedBlinds.bb,
    toCall: 0,
    actionLog: [
      { seat: buttonSeat, street: "preflop", action: "dealer button", size: 0 },
      { seat: sbSeat, street: "preflop", action: "small blind", size: postedBlinds.sb },
      { seat: bbSeat, street: "preflop", action: "big blind", size: postedBlinds.bb },
      { seat: heroSeat, street: "preflop", action: "hero dealt in", size: 0 },
    ],
    buttonSeat,
    sbSeat,
    bbSeat,
  };
}

export function boardForStreet(boardRunout, street) {
  const count = STREET_BOARD_COUNTS[street] ?? 0;
  return boardRunout.slice(0, count);
}

export function nextStreet(street) {
  const currentIndex = Object.keys(STREET_BOARD_COUNTS).indexOf(street);
  const streets = Object.keys(STREET_BOARD_COUNTS);
  return streets[Math.min(currentIndex + 1, streets.length - 1)];
}

function hashSeed(seed) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
