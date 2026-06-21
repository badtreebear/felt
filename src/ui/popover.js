export function createPopover({ id, title, onClose, children }) {
  const popover = document.createElement("div");
  popover.className = "popover";
  popover.id = id;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", title);

  const header = document.createElement("div");
  header.className = "popover__header";

  const heading = document.createElement("strong");
  heading.textContent = title;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "popover__close";
  close.title = "Close";
  close.setAttribute("aria-label", "Close popover");
  close.textContent = "X";
  close.addEventListener("click", onClose);

  const body = document.createElement("div");
  body.className = "popover__body";
  body.append(children);

  header.append(heading, close);
  popover.append(header, body);
  return popover;
}
