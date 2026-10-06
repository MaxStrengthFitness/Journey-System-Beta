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
