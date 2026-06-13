import { RANKS } from "../engine/deck.js";

export function createRangeGrid({ range, heroCards }) {
  const wrapper = document.createElement("div");
  wrapper.className = "range-grid-wrap";

  const verdict = heroRangeVerdict(heroCards, range.grid);
  const summary = document.createElement("p");
  summary.className = "range-verdict";
  summary.textContent = `${verdict.handLabel}: ${verdict.status}`;

  const grid = document.createElement("div");
  grid.className = "range-grid";
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", `${range.displayPosition} opening range`);

  RANKS.forEach((_, row) => {
    RANKS.forEach((__, column) => {
      const cell = document.createElement("span");
      const value = range.grid[row][column];
      const label = rangeCellLabel(row, column);
      cell.className = "range-cell";
      cell.classList.toggle("range-cell--open", value === 1);
      cell.classList.toggle("range-cell--mixed", value === 0.5);
      cell.classList.toggle("range-cell--hero", verdict.cell?.row === row && verdict.cell?.column === column);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `${label} ${value ? "open" : "fold"}`);
      cell.textContent = label;
      grid.append(cell);
    });
  });

  wrapper.append(summary, grid);
  return wrapper;
}

export function heroRangeVerdict(heroCards, grid) {
  const cell = handCell(heroCards);
  const handLabel = cell ? rangeCellLabel(cell.row, cell.column) : "--";
  const value = cell ? grid[cell.row][cell.column] : 0;

  if (value === 1) {
    return { cell, handLabel, status: "in range" };
  }

  if (value === 0.5) {
    return { cell, handLabel, status: "mixed" };
  }

  return { cell, handLabel, status: "not in range" };
}

export function handCell(cards) {
  if (!Array.isArray(cards) || cards.length !== 2) {
    return null;
  }

  const [first, second] = cards;
  const firstRank = first.slice(0, -1);
  const secondRank = second.slice(0, -1);
  const firstSuit = first.slice(-1);
  const secondSuit = second.slice(-1);
  const firstIndex = RANKS.indexOf(firstRank);
  const secondIndex = RANKS.indexOf(secondRank);

  if (firstIndex < 0 || secondIndex < 0) {
    return null;
  }

  if (firstIndex === secondIndex) {
    return { row: firstIndex, column: firstIndex };
  }

  const high = Math.min(firstIndex, secondIndex);
  const low = Math.max(firstIndex, secondIndex);

  if (firstSuit === secondSuit) {
    return { row: high, column: low };
  }

  return { row: low, column: high };
}

export function rangeCellLabel(row, column) {
  if (row === column) {
    return `${RANKS[row]}${RANKS[column]}`;
  }

  if (row < column) {
    return `${RANKS[row]}${RANKS[column]}s`;
  }

  return `${RANKS[column]}${RANKS[row]}o`;
}
