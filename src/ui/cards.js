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

export function createCard(card, { hidden = false, placeholder = false } = {}) {
  const cardElement = document.createElement("span");
  cardElement.className = "card";

  if (placeholder) {
    cardElement.classList.add("card--placeholder");
    cardElement.setAttribute("aria-hidden", "true");
    return cardElement;
  }

  if (hidden) {
    cardElement.classList.add("card--back");
    cardElement.textContent = "";
    cardElement.setAttribute("aria-label", "Hidden card");
    return cardElement;
  }

  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  cardElement.classList.toggle("card--red", suit === "h" || suit === "d");
  cardElement.setAttribute("aria-label", `${rank} of ${SUIT_NAMES[suit]}`);

  const rankElement = document.createElement("span");
  rankElement.className = "card__rank";
  rankElement.textContent = rank;

  const suitElement = document.createElement("span");
  suitElement.className = "card__suit";
  suitElement.textContent = SUIT_SYMBOLS[suit];

  cardElement.append(rankElement, suitElement);
  return cardElement;
}

export function createCardRow(cards, options = {}) {
  const row = document.createElement("div");
  row.className = "card-row";

  cards.forEach((card) => row.append(createCard(card, options)));
  return row;
}
