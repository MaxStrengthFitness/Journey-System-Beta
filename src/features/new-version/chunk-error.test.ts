import { describe, expect, it } from "vitest";
import { isChunkLoadError, noteChunkLoadError } from "./chunk-error";

describe("isChunkLoadError", () => {
  it("knows the error Vite reported, whatever it says", () => {
    const err = new Error("something unhelpful");
    expect(isChunkLoadError(err)).toBe(false);
    noteChunkLoadError(err);
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("knows each browser's words for a module that would not load", () => {
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(
      isChunkLoadError(
        new TypeError("Failed to fetch dynamically imported module: https://x/assets/ClientProfileView-DPUUN7C5.js"),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module: https://x/a.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/x.css"))).toBe(true);
  });

  it("is not any other error", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isChunkLoadError(new Error("Missing or insufficient permissions."))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
  });

  it("reads a bare string too", () => {
    expect(isChunkLoadError("Importing a module script failed.")).toBe(true);
  });
});
