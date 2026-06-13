export const RANGE_POPOVER_GAP = 10;
export const RANGE_POPOVER_MARGIN = 12;

export function rangePopoverPlacement({
  anchorRect,
  popoverRect,
  avoidRects = [],
  viewportWidth,
  viewportHeight,
  gap = RANGE_POPOVER_GAP,
  margin = RANGE_POPOVER_MARGIN,
}) {
  const popoverWidth = popoverRect.width;
  const popoverHeight = popoverRect.height;
  const desiredLefts = horizontalCandidates({
    anchorRect,
    margin,
    popoverWidth,
    viewportWidth,
  });
  const desiredTops = verticalCandidates({
    anchorRect,
    margin,
    popoverHeight,
    viewportHeight,
    gap,
  });
  const candidates = desiredTops.flatMap((verticalCandidate) => (
    desiredLefts.map((horizontalCandidate) => placementCandidate({
      anchorRect,
      popoverHeight,
      popoverWidth,
      verticalCandidate,
      horizontalCandidate,
      avoidRects,
      viewportWidth,
      viewportHeight,
      gap,
      margin,
    }))
  ));

  return candidates.sort((first, second) => first.score - second.score)[0];
}

function placementCandidate({
  anchorRect,
  popoverHeight,
  popoverWidth,
  verticalCandidate,
  horizontalCandidate,
  avoidRects,
  viewportWidth,
  viewportHeight,
  gap,
  margin,
}) {
  const desiredTop = verticalCandidate.value;
  const desiredLeft = horizontalCandidate.value;
  const maxTop = viewportHeight - margin - popoverHeight;
  const maxLeft = viewportWidth - margin - popoverWidth;
  const top = clamp(desiredTop, margin, maxTop);
  const left = clamp(desiredLeft, margin, maxLeft);
  const rect = toRect({ left, top, width: popoverWidth, height: popoverHeight });
  const vertical = top >= anchorRect.bottom + gap ? "below" : "above";
  const defaultTop = vertical === "below"
    ? anchorRect.bottom + gap
    : anchorRect.top - gap - popoverHeight;
  const viewportOverflow = overflowArea(rect, {
    left: margin,
    top: margin,
    right: viewportWidth - margin,
    bottom: viewportHeight - margin,
  });
  const collisionArea = avoidRects.reduce((total, avoidRect) => total + overlapArea(rect, avoidRect), 0);
  const movement = Math.abs(left - desiredLeft) + Math.abs(top - desiredTop);
  const score = viewportOverflow * 1000 + collisionArea * 10 + movement;

  return {
    vertical,
    horizontal: horizontalCandidate.name,
    verticalPreference: verticalCandidate.name,
    x: Math.round(left - anchorRect.left),
    y: Math.round(top - defaultTop),
    collisionArea: Math.round(collisionArea),
    viewportOverflow: Math.round(viewportOverflow),
    score: Math.round(score),
  };
}

function horizontalCandidates({ anchorRect, margin, popoverWidth, viewportWidth }) {
  return uniqueCandidates([
    { name: "right", value: anchorRect.left },
    { name: "left", value: anchorRect.right - popoverWidth },
    { name: "center", value: anchorRect.left + anchorRect.width / 2 - popoverWidth / 2 },
    { name: "viewport-left", value: margin },
    { name: "viewport-right", value: viewportWidth - margin - popoverWidth },
  ]);
}

function verticalCandidates({ anchorRect, margin, popoverHeight, viewportHeight, gap }) {
  return uniqueCandidates([
    { name: "above", value: anchorRect.top - gap - popoverHeight },
    { name: "below", value: anchorRect.bottom + gap },
    { name: "viewport-top", value: margin },
    { name: "viewport-bottom", value: viewportHeight - margin - popoverHeight },
    { name: "viewport-center", value: (viewportHeight - popoverHeight) / 2 },
  ]);
}

function uniqueCandidates(candidates) {
  const seen = new Set();

  return candidates.filter((candidate) => {
    const key = Math.round(candidate.value);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function clamp(value, min, max) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function toRect({ left, top, width, height }) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

function overlapArea(first, second) {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return width * height;
}

function overflowArea(rect, bounds) {
  const left = Math.max(0, bounds.left - rect.left);
  const right = Math.max(0, rect.right - bounds.right);
  const top = Math.max(0, bounds.top - rect.top);
  const bottom = Math.max(0, rect.bottom - bounds.bottom);
  return (left + right) * rect.height + (top + bottom) * rect.width;
}
