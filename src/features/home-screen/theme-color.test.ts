// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { HEADER_TOKEN, syncThemeColor } from "./theme-color";

function setUp(token: string | null, withMeta = true) {
  document.head.innerHTML = withMeta ? '<meta name="theme-color" content="#16263D">' : "";
  document.documentElement.removeAttribute("style");
  if (token !== null) document.documentElement.style.setProperty(HEADER_TOKEN, token);
}

afterEach(() => {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("style");
});

describe("syncThemeColor", () => {
  it("copies the header's colour into the theme-color tag", () => {
    setUp("#FFFFFF");
    expect(syncThemeColor()).toBe("#FFFFFF");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#FFFFFF");
  });

  it("leaves the tag alone while the stylesheet has not supplied the token", () => {
    setUp(null);
    expect(syncThemeColor()).toBeNull();
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#16263D");
  });

  it("does nothing on a page with no theme-color tag", () => {
    setUp("#FFFFFF", false);
    expect(syncThemeColor()).toBeNull();
  });
});
