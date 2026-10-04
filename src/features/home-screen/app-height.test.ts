import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { visibleHeight } from "./app-height";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("visibleHeight", () => {
  it("takes the smallest height iPadOS reports, so the bar is never under the strip", () => {
    expect(visibleHeight([1180, 1160, 1180])).toBe(1160);
  });
  it("ignores what is missing or nonsense", () => {
    expect(visibleHeight([null, undefined, 0, -5, Number.NaN, 1024.6])).toBe(1024);
  });
  it("is null when nothing usable is reported", () => {
    expect(visibleHeight([null, 0])).toBeNull();
  });
});

describe("the shell's height", () => {
  it("is the app-shell class, which index.css sizes, never a bare 100dvh", () => {
    const shell = readFileSync(join(SRC, "AppContent.tsx"), "utf8");
    expect(shell).toContain("app-shell");
    expect(shell).not.toMatch(/className="[^"]*h-\[100dvh\]/);
  });
  it("follows --app-h only once it has been measured, with 100vh before 100dvh", () => {
    const css = readFileSync(join(SRC, "index.css"), "utf8");
    expect(css).toMatch(/\.app-shell\s*\{\s*height:\s*100vh;/);
    expect(css).toMatch(/@supports \(height: 100dvh\)\s*\{\s*\.app-shell\s*\{\s*height:\s*100dvh;/);
    expect(css).toMatch(/html\[data-app-h\] \.app-shell\s*\{\s*height:\s*var\(--app-h\);/);
  });
});
