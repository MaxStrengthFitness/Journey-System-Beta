// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { BASE_COLLISION_PADDING, popupCollisionPadding, readSafeAreaInsets } from "./safe-area";

describe("popupCollisionPadding", () => {
  it("is base-ui's own 5px on every side when there are no insets (a Safari tab, a desktop)", () => {
    expect(popupCollisionPadding({ top: 0, bottom: 0 })).toEqual({ top: 5, bottom: 5, left: 5, right: 5 });
  });

  it("keeps a popup clear of the status bar and the home indicator", () => {
    expect(popupCollisionPadding({ top: 24, bottom: 20 })).toEqual({
      top: BASE_COLLISION_PADDING + 24,
      bottom: BASE_COLLISION_PADDING + 20,
      left: BASE_COLLISION_PADDING,
      right: BASE_COLLISION_PADDING,
    });
  });
});

describe("readSafeAreaInsets", () => {
  it("reads 0 where the browser has no insets, and leaves nothing behind in the page", () => {
    const before = document.body.childElementCount;
    expect(readSafeAreaInsets()).toEqual({ top: 0, bottom: 0 });
    expect(document.body.childElementCount).toBe(before);
  });
});
