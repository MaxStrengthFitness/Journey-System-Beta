import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLUMN_WIDTH,
  OLDER_RAIL_LABEL,
  isAtOlderEdge,
  isOlderGesture,
  isOlderWheel,
  olderRailState,
  shouldAutoLoadOlder,
  type AutoLoadInput,
} from "./older-autoload";

const at = (over: Partial<AutoLoadInput> = {}): AutoLoadInput => ({
  scrollLeft: 0,
  columnWidth: 72,
  userTouched: true,
  loading: false,
  canLoadOlder: true,
  pending: false,
  ...over,
});

describe("shouldAutoLoadOlder", () => {
  it("loads when the trainer reaches the left edge", () => {
    expect(shouldAutoLoadOlder(at())).toBe(true);
  });

  it("loads within one column of the edge, not beyond it", () => {
    expect(shouldAutoLoadOlder(at({ scrollLeft: 72 }))).toBe(true);
    expect(shouldAutoLoadOlder(at({ scrollLeft: 73 }))).toBe(false);
    expect(shouldAutoLoadOlder(at({ scrollLeft: 900 }))).toBe(false);
  });

  it("never fires before the trainer has touched the grid (the open frame sits at 0)", () => {
    expect(shouldAutoLoadOlder(at({ userTouched: false }))).toBe(false);
  });

  it("never fires while a page is on its way", () => {
    expect(shouldAutoLoadOlder(at({ loading: true }))).toBe(false);
  });

  it("stops at the start of history", () => {
    expect(shouldAutoLoadOlder(at({ canLoadOlder: false }))).toBe(false);
  });

  it("asks once per arrival at the edge, so an empty page cannot loop", () => {
    expect(shouldAutoLoadOlder(at({ pending: true }))).toBe(false);
  });
});

describe("isAtOlderEdge", () => {
  it("treats iOS rubber-band overscroll (negative scrollLeft) as the edge", () => {
    expect(isAtOlderEdge(-30, 60)).toBe(true);
  });

  it("falls back to a default column when the width cannot be measured", () => {
    expect(isAtOlderEdge(DEFAULT_COLUMN_WIDTH, 0)).toBe(true);
    expect(isAtOlderEdge(DEFAULT_COLUMN_WIDTH + 1, Number.NaN)).toBe(false);
  });
});

describe("gestures on a timeline too short to scroll", () => {
  it("a sideways pull to the right asks for older sessions", () => {
    expect(isOlderGesture(40, 6)).toBe(true);
  });

  it("a tap's wobble, a pull to the left and a vertical page scroll do not", () => {
    expect(isOlderGesture(8, 0)).toBe(false);
    expect(isOlderGesture(-40, 0)).toBe(false);
    expect(isOlderGesture(30, 80)).toBe(false);
  });

  it("a wheel toward the older end counts; a vertical wheel does not", () => {
    expect(isOlderWheel(-20, 2)).toBe(true);
    expect(isOlderWheel(20, 0)).toBe(false);
    expect(isOlderWheel(-5, 40)).toBe(false);
  });
});

describe("the rail's status", () => {
  it("says loading first, then whether there is more", () => {
    expect(olderRailState(true, true)).toBe("loading");
    expect(olderRailState(true, false)).toBe("loading");
    expect(olderRailState(false, true)).toBe("more");
    expect(olderRailState(false, false)).toBe("start");
  });

  it("uses words a trainer reads, not a spinner", () => {
    expect(OLDER_RAIL_LABEL).toEqual({ more: "Older", loading: "Loading…", start: "Start of history" });
  });
});
