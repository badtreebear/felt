import { isCoachConfigured, isCoachReachable } from "../coach/config.js";

export function createCoachPanel(state, actions) {
  if (!isCoachConfigured(state.coach.config)) {
    return null;
  }

  const panel = document.createElement("section");
  panel.className = "coach-panel";
  panel.classList.toggle("coach-panel--offline", !isCoachReachable(state.coach));
  panel.setAttribute("aria-label", "AI coach");

  const header = document.createElement("div");
  header.className = "coach-panel__header";

  const title = document.createElement("h3");
  title.textContent = "AI coach";

  const meta = document.createElement("span");
  meta.textContent = `${state.coach.config.model || "No model"} - ${state.coach.callCount || 0} calls this hand`;

  header.append(title, meta);
  panel.append(header);

  if (!isCoachReachable(state.coach)) {
    const offline = document.createElement("p");
    offline.className = "coach-offline";
    offline.textContent = "Coach offline - trainer fully functional.";
    panel.append(offline);
    return panel;
  }

  const actionRow = document.createElement("div");
  actionRow.className = "coach-panel__actions";
  actionRow.append(
    createChatToggle(state, actions),
    createReviewButton(state, actions),
  );
  panel.append(actionRow);

  if (state.coach.chatOpen) {
    panel.append(createChat(state, actions));
  }

  const review = createReview(state);
  if (review) {
    panel.append(review);
  }

  return panel;
}

function createChatToggle(state, actions) {
  const chatToggle = document.createElement("button");
  chatToggle.type = "button";
  chatToggle.className = "coach-panel__toggle";
  chatToggle.textContent = state.coach.chatOpen ? "Hide chat" : "Open chat";
  chatToggle.addEventListener("click", () => actions.setCoachChatOpen(!state.coach.chatOpen));
  return chatToggle;
}

function createReviewButton(state, actions) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "coach-panel__review-button";
  button.disabled = state.coach.review.status === "loading";
  button.textContent = state.coach.review.status === "loading" ? "Reviewing..." : "Review";
  button.addEventListener("click", () => actions.requestCoachReview());
  return button;
}

function createChat(state, actions) {
  const wrapper = document.createElement("div");
  wrapper.className = "coach-chat";

  const messages = document.createElement("div");
  messages.className = "coach-chat__messages";

  if (!state.coach.chatHistory.length && state.coach.chatStatus !== "loading") {
    const empty = document.createElement("p");
    empty.className = "coach-muted";
    empty.textContent = "Ask about this hand, position, range, pot odds, or EV.";
    messages.append(empty);
  }

  state.coach.chatHistory.forEach((message) => {
    const item = document.createElement("p");
    item.className = `coach-message coach-message--${message.role}`;
    item.textContent = message.content;
    messages.append(item);
  });

  if (state.coach.chatStatus === "loading") {
    const loading = document.createElement("p");
    loading.className = "coach-muted";
    loading.textContent = "Coach thinking...";
    messages.append(loading);
  }

  const form = document.createElement("form");
  form.className = "coach-chat__form";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    actions.sendCoachChat(input.value);
  });

  const input = document.createElement("textarea");
  input.rows = 3;
  input.value = state.coach.chatInput || "";
  input.placeholder = "Ask the coach...";
  input.setAttribute("aria-label", "Coach chat message");

  const send = document.createElement("button");
  send.type = "submit";
  send.className = "button";
  send.disabled = state.coach.chatStatus === "loading" || !state.coach.chatInput?.trim();
  send.textContent = state.coach.chatStatus === "loading" ? "Sending..." : "Send";
  input.addEventListener("input", () => {
    send.disabled = state.coach.chatStatus === "loading" || !input.value.trim();
  });

  form.append(input, send);
  wrapper.append(messages, form);
  return wrapper;
}

function createReview(state) {
  if (state.coach.review.status !== "loading" && !state.coach.review.content) {
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "coach-review";

  if (state.coach.review.status === "loading") {
    const loading = document.createElement("p");
    loading.className = "coach-muted";
    loading.textContent = "Coach reviewing this spot...";
    wrapper.append(loading);
  }

  if (state.coach.review.content) {
    const response = document.createElement("p");
    response.className = "coach-response";
    response.textContent = state.coach.review.content;
    wrapper.append(response);
  }

  return wrapper;
}
