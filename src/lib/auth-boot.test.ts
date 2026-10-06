/**
 * AUTH STARTS WITHOUT ITS POPUP HELPER ON A SIGNED-IN OPEN (the speed round,
 * Oct 5 2026, R14). See lib/auth-boot.ts.
 *
 * The flag is pure and tested directly. The rest leans on the installed
 * Firebase Auth SDK's insides, so this file reads them and fails LOUDLY when
 * an upgrade moves what the mechanism depends on:
 *
 *  - `@firebase/auth/internal` is exported for browsers and exports
 *    `_getInstance` (src/firebase.ts warms the helper through it, so the
 *    sign-in screen loads the SAME instance signInWithPopup will use);
 *  - the helper's `_initialize(auth)` and `_shouldInitProactively` exist;
 *  - Auth loads the helper before reporting the user ONLY when one was
 *    passed to initializeAuth (`this._popupRedirectResolver?._shouldInitProactively`),
 *    and signInWithPopup takes one as its third argument.
 *
 * And it holds the app's half: src/firebase.ts uses initializeAuth (never
 * getAuth, which always installs the helper), and AppContent hands the
 * helper to signInWithPopup.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SIGNED_IN_HERE_KEY, rememberSignedInHere, wasSignedInHere } from "./auth-boot";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("the signed-in-here flag", () => {
  it("is set while someone is signed in and gone when nobody is", () => {
    const s = memoryStorage();
    expect(wasSignedInHere(s)).toBe(false);
    rememberSignedInHere(s, true);
    expect(s.getItem(SIGNED_IN_HERE_KEY)).toBe("1");
    expect(wasSignedInHere(s)).toBe(true);
    rememberSignedInHere(s, false);
    expect(wasSignedInHere(s)).toBe(false);
  });

  it("blocked storage means 'not signed in here', the old way", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(wasSignedInHere(blocked)).toBe(false);
    expect(() => rememberSignedInHere(blocked, true)).not.toThrow();
    expect(wasSignedInHere(null)).toBe(false);
  });
});

describe("the installed Firebase Auth SDK still has what this relies on", () => {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("@firebase/auth/package.json");
  const root = dirname(pkgPath);
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { exports: Record<string, Record<string, unknown>> };

  it("exports ./internal for browsers", () => {
    const browser = pkg.exports["./internal"]?.browser as { import?: string } | undefined;
    expect(browser?.import, "@firebase/auth no longer exports ./internal for browsers").toBeTruthy();
  });

  const internalFile = resolve(root, (pkg.exports["./internal"].browser as { import: string }).import);
  const internal = readFileSync(internalFile, "utf8");
  const chunkName = internal.match(/from '\.\/(index-[0-9a-f]+\.js)'/)?.[1];
  const chunk = chunkName ? readFileSync(resolve(dirname(internalFile), chunkName), "utf8") : "";

  it("exports _getInstance and browserPopupRedirectResolver from ./internal", () => {
    expect(internal).toMatch(/as _getInstance\b/);
    expect(internal).toMatch(/as browserPopupRedirectResolver\b/);
    expect(chunkName, "the internal entry no longer shares the main chunk").toBeTruthy();
  });

  it("caches one instance per helper class, so the warmed one is the one sign-in uses", () => {
    expect(chunk).toMatch(/function _getInstance\(cls\)\s*\{[\s\S]{0,300}instanceCache\.get\(cls\)/);
  });

  it("loads the helper before reporting the user only when one was passed in", () => {
    expect(chunk).toContain("this._popupRedirectResolver?._shouldInitProactively");
    expect(chunk).toMatch(/if \(popupRedirectResolver\) \{\s*this\._popupRedirectResolver = _getInstance\(popupRedirectResolver\);/);
  });

  it("the helper still has _initialize(auth) and _shouldInitProactively", () => {
    expect(chunk).toMatch(/class BrowserPopupRedirectResolver[\s\S]*?_initialize\(auth\) \{/);
    expect(chunk).toMatch(/get _shouldInitProactively\(\)/);
  });

  it("signInWithPopup takes the helper as its third argument", () => {
    expect(chunk).toMatch(/async function signInWithPopup\(auth, provider, resolver\)/);
    expect(chunk).toMatch(/function _withDefaultResolver\(auth, resolverOverride\)/);
  });
});

describe("the app's half", () => {
  const src = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

  it("firebase.ts starts Auth with initializeAuth, never getAuth", () => {
    const f = src("firebase.ts");
    expect(f).toMatch(/initializeAuth\(app,/);
    // Code only: the comments may name getAuth to say why it went.
    const code = f.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bgetAuth\b/);
    expect(f).toContain("from '@firebase/auth/internal'");
  });

  it("AppContent hands the helper to signInWithPopup", () => {
    const a = src("AppContent.tsx");
    const calls = a.match(/signInWithPopup\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toContain("browserPopupRedirectResolver");
  });
});
