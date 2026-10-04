// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { HEADER_TOKEN, syncThemeColor } from "./theme-color";

// The frame's navy (--chrome), the header's colour in both themes since the
// Navy Frame (Oct 4 2026). The fixtures were the old #16263D / #FFFFFF.
const FRAME = "#002341";

function setUp(token: string | null, withMeta = true) {
  document.head.innerHTML = withMeta ? `<meta name="theme-color" content="${FRAME}">` : "";
  document.documentElement.removeAttribute("style");
  if (token !== null) document.documentElement.style.setProperty(HEADER_TOKEN, token);
}

afterEach(() => {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("style");
});

describe("syncThemeColor", () => {
  it("copies the header's token, the frame, into the theme-color tag", () => {
    expect(HEADER_TOKEN).toBe("--chrome");
    document.head.innerHTML = '<meta name="theme-color" content="#14293D">';
    document.documentElement.style.setProperty(HEADER_TOKEN, FRAME);
    expect(syncThemeColor()).toBe(FRAME);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(FRAME);
  });

  it("leaves the tag alone while the stylesheet has not supplied the token", () => {
    setUp(null);
    expect(syncThemeColor()).toBeNull();
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(FRAME);
  });

  it("does nothing on a page with no theme-color tag", () => {
    setUp(FRAME, false);
    expect(syncThemeColor()).toBeNull();
  });
});
