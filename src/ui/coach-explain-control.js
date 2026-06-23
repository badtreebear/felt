import { isCoachReachable } from "../coach/config.js";

// Ask/Hide toggle for a coach explanation box. While an answer is showing, the
// same button hides it (clears that topic); clicking again re-asks. Stays
// enabled when the coach is flagged offline so the request itself can re-probe
// and bring the coach back without a manual settings test.
export function coachAskButton({
  state,
  actions,
  topic,
  idleLabel,
  onAsk,
  className = "coach-explain__button",
  extraDisabled = false,
}) {
  const explain = state.coach.explain?.[topic] || { status: "idle", content: "" };
  const loading = explain.status === "loading";
  const hasAnswer = Boolean(explain.content);

  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.disabled = loading || extraDisabled;
  button.textContent = loading
    ? "Coach thinking..."
    : hasAnswer
      ? "Hide answer"
      : idleLabel;
  button.addEventListener("click", () => {
    if (hasAnswer) {
      actions.dismissCoachExplain(topic);
    } else {
      onAsk();
    }
  });

  return button;
}

// A small "was offline, will retry" hint, or null when the coach is reachable.
// Lets the offline state stay informative without disabling the entry point.
export function coachOfflineNote(state, { className = "coach-explain__note" } = {}) {
  if (isCoachReachable(state.coach)) {
    return null;
  }

  const note = document.createElement("p");
  note.className = className;
  note.textContent = "Coach was offline — this will retry.";
  return note;
}
