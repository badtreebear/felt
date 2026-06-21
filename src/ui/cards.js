const SUIT_SYMBOLS = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

const SUIT_NAMES = {
  s: "spades",
  h: "hearts",
  d: "diamonds",
  c: "clubs",
};

const SUIT_FILE = {
  s: "S",
  h: "H",
  d: "D",
  c: "C",
};

// Public-domain (CC0) SVG deck generated from Adrian Kennard's (RevK) card maker
// — https://www.me.uk/cards/ — vendored locally under public/cards/.
const CARD_BASE = "/cards";
const CARD_BACK = "1B"; // diamond-pattern back

function cardFileCode(rank, suit) {
  // RevK filenames use the same rank letters as our internal codes (incl. "T"),
  // with an uppercase suit letter — e.g. "TH", "KS", "AC".
  return `${rank}${SUIT_FILE[suit]}`;
}

function displayRank(rank) {
  return rank === "T" ? "10" : rank;
}

function buildTextFace(cardElement, rank, suit) {
  const rankElement = document.createElement("span");
  rankElement.className = "card__rank";
  rankElement.textContent = displayRank(rank);

  const suitElement = document.createElement("span");
  suitElement.className = "card__suit";
  suitElement.textContent = SUIT_SYMBOLS[suit];

  cardElement.append(rankElement, suitElement);
}

export function createCard(card, { hidden = false, placeholder = false } = {}) {
  const cardElement = document.createElement("span");
  cardElement.className = "card";

  if (placeholder) {
    cardElement.classList.add("card--placeholder");
    cardElement.setAttribute("aria-hidden", "true");
    return cardElement;
  }

  if (hidden) {
    cardElement.classList.add("card--image", "card--hidden");
    cardElement.setAttribute("aria-label", "Hidden card");

    const back = document.createElement("img");
    back.className = "card__face";
    back.alt = "Hidden card";
    back.draggable = false;
    back.src = `${CARD_BASE}/${CARD_BACK}.svg`;
    cardElement.append(back);
    return cardElement;
  }

  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const label = `${displayRank(rank)} of ${SUIT_NAMES[suit]}`;
  cardElement.classList.toggle("card--red", suit === "h" || suit === "d");
  cardElement.setAttribute("aria-label", label);

  const face = document.createElement("img");
  face.className = "card__face";
  face.alt = label;
  face.loading = "lazy";
  face.draggable = false;
  face.src = `${CARD_BASE}/${cardFileCode(rank, suit)}.svg`;

  // If the asset can't load, fall back to the text rendering.
  face.addEventListener("error", () => {
    cardElement.classList.remove("card--image");
    face.remove();
    buildTextFace(cardElement, rank, suit);
  });

  cardElement.classList.add("card--image");
  cardElement.append(face);
  return cardElement;
}

export function createCardRow(cards, options = {}) {
  const row = document.createElement("div");
  row.className = "card-row";

  cards.forEach((card) => row.append(createCard(card, options)));
  return row;
}
