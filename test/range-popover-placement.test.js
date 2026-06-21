import { describe, expect, it } from "vitest";
import { rangePopoverPlacement } from "../src/ui/range-popover-placement.js";

const POPOVER = { width: 430, height: 520 };

describe("range popover placement", () => {
  it("keeps bottom seats above the badge when there is room", () => {
    expect(rangePopoverPlacement({
      anchorRect: rect({ left: 520, top: 650, width: 42, height: 24 }),
      popoverRect: POPOVER,
      viewportWidth: 1280,
      viewportHeight: 720,
    })).toMatchObject({ vertical: "above", x: 0, y: 0, viewportOverflow: 0 });
  });

  it("flips top seats below the badge when there is not room above", () => {
    expect(rangePopoverPlacement({
      anchorRect: rect({ left: 520, top: 120, width: 42, height: 24 }),
      popoverRect: POPOVER,
      viewportWidth: 1280,
      viewportHeight: 720,
    }).vertical).toBe("below");
  });

  it("chooses the lower-collision horizontal placement", () => {
    expect(rangePopoverPlacement({
      anchorRect: rect({ left: 500, top: 500, width: 20, height: 20 }),
      avoidRects: [
        rect({ left: 520, top: 390, width: 120, height: 100 }),
      ],
      popoverRect: { width: 120, height: 100 },
      viewportWidth: 1280,
      viewportHeight: 720,
    })).toMatchObject({ vertical: "above", horizontal: "left", collisionArea: 0 });
  });

  it("clamps side seats horizontally into the viewport", () => {
    expect(rangePopoverPlacement({
      anchorRect: rect({ left: 1180, top: 360, width: 42, height: 24 }),
      popoverRect: POPOVER,
      viewportWidth: 1280,
      viewportHeight: 720,
    }).x).toBeLessThan(0);

    expect(rangePopoverPlacement({
      anchorRect: rect({ left: -20, top: 360, width: 42, height: 24 }),
      popoverRect: POPOVER,
      viewportWidth: 1280,
      viewportHeight: 720,
    }).x).toBeGreaterThan(0);
  });
});

function rect({ left, top, width, height }) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}
