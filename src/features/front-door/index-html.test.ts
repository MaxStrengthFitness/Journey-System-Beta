/**
 * WHAT index.html DOES BEFORE THE APP'S SCRIPT ARRIVES (the speed round,
 * Oct 5 2026).
 *
 * R5: it warms the connections every open needs (Firestore and Firebase
 * Auth's two, with crossorigin because the SDKs call them with CORS), and
 * the sign-in popup helper's two only where the sign-in screen is likely
 * next, read from the same flag src/firebase.ts picks Auth's start from.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SIGNED_IN_HERE_KEY } from "../../lib/auth-boot";

const HTML = readFileSync(resolve(__dirname, "..", "..", "..", "index.html"), "utf8");

describe("index.html warms the connections an open needs (R5)", () => {
  it.each(["https://firestore.googleapis.com", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"])(
    "preconnects to %s with crossorigin",
    (origin) => {
      expect(HTML).toContain(`<link rel="preconnect" href="${origin}" crossorigin />`);
    },
  );

  it("warms the popup helper's origins only when nobody was signed in here, by the same flag as firebase.ts", () => {
    expect(HTML).toContain(`localStorage.getItem("${SIGNED_IN_HERE_KEY}") === "1"`);
    expect(HTML).toMatch(/if \(signedIn\) return;\s*\[\s*"https:\/\/apis\.google\.com", "https:\/\/[a-z0-9-]+\.firebaseapp\.com"\]/);
  });

  it("names no font host (fonts are self-hosted)", () => {
    expect(HTML).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
  });
});

/*
 * R15: the first frame. index.html paints the front door's three squares on
 * its dark ground before the app's script has run, in plain CSS and inline
 * SVG, and React replaces it on mount.
 */
describe("index.html paints the first frame itself (R15)", () => {
  const KIT = readFileSync(resolve(__dirname, "kit.tsx"), "utf8");
  const CSS = readFileSync(resolve(__dirname, "front-door.css"), "utf8");
  const frame = HTML.match(/<div id="root">([\s\S]*?)<\/div>\s*<script type="module"/)?.[1] ?? "";

  it("sits inside #root, so React replaces it when it mounts", () => {
    expect(frame).toContain('<div id="first-frame"');
  });

  it("draws the logo's three squares with the kit's own glyphs", () => {
    for (const key of ["m", "a", "x"]) {
      const d = KIT.match(new RegExp(`\\b${key}: "([^"]+)"`))?.[1];
      expect(d, `kit.tsx glyph ${key}`).toBeTruthy();
      expect(frame).toContain(`<path d="${d}" />`);
    }
  });

  it("in the front door's colours", () => {
    for (const token of ["--fd-blue", "--fd-orange", "--fd-grey", "--fd-ground"]) {
      const hex = CSS.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
      expect(hex, token).toBeTruthy();
      expect(HTML.toLowerCase()).toContain(hex!.toLowerCase());
    }
  });

  it("fetches nothing and pays the safe areas", () => {
    expect(frame).not.toMatch(/\b(?:src|href)=/);
    expect(HTML).toMatch(/#first-frame \{[\s\S]*?env\(safe-area-inset-top, 0px\)[\s\S]*?env\(safe-area-inset-bottom, 0px\)/);
  });
});
