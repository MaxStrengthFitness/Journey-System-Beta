// @vitest-environment jsdom
/**
 * THE ACTIVE STUDIO NEVER PAINTS THE APP'S ORANGE (the colour round, Oct 4
 * 2026, AJ's answer 3A).
 *
 * An effect in ActiveStudioContext used to write --cta, --color-cta and
 * --color-cta-strong inline on <html>: the studio's Accent colour
 * (brandColor), or a fixed #F37427 / #E45F0F when it had none. An inline
 * style beats :root and .dark, so the orange in index.css never rendered
 * once a studio was active, and no palette change could reach it. The effect
 * and the Accent colour control are gone; a studio's stored brandColor is
 * left as it is and nothing reads it.
 *
 * Mounted for real, because the old write was an effect that only a mounted
 * provider runs: switching studios here, with and without a brandColor,
 * must leave <html> with no inline colour at all.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ActiveStudioProvider, useActiveStudio } from "./ActiveStudioContext";
import type { Studio } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const westlake = {
  id: "westlake",
  name: "Westlake",
  ownerId: "o",
  timezone: "America/New_York",
  brandColor: "#123456",
} as unknown as Studio;

const solon = {
  id: "solon",
  name: "Solon",
  ownerId: "o",
  timezone: "America/New_York",
} as unknown as Studio;

/** The provider's setter, caught by a consumer so the test can switch studios. */
let switchTo: ((id: string | null) => void) | null = null;
let activeName: string | null = null;

function Catch() {
  const ctx = useActiveStudio();
  switchTo = ctx.setActiveStudioId;
  activeName = ctx.activeStudio?.name ?? null;
  return null;
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <ActiveStudioProvider studios={[westlake, solon]} authTrainer={null} onLogout={async () => {}}>
        <Catch />
      </ActiveStudioProvider>,
    );
  });
}

const html = () => document.documentElement.style;

/** The three properties the old effect wrote, as <html> carries them inline. */
function inlineOrange() {
  return {
    cta: html().getPropertyValue("--cta"),
    colorCta: html().getPropertyValue("--color-cta"),
    colorCtaStrong: html().getPropertyValue("--color-cta-strong"),
  };
}

const NONE = { cta: "", colorCta: "", colorCtaStrong: "" };

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* no storage in this environment: the provider starts with no studio either way */
  }
  document.documentElement.removeAttribute("style");
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
  switchTo = null;
  activeName = null;
  document.documentElement.removeAttribute("style");
});

describe("ActiveStudioProvider and the app's orange", () => {
  it("writes no colour to <html> before any studio is active", async () => {
    await mount();
    expect(activeName).toBeNull();
    expect(inlineOrange()).toEqual(NONE);
    expect(html().cssText).toBe("");
  });

  it("writes no colour to <html> when a studio with a brandColor becomes active", async () => {
    await mount();
    await act(async () => switchTo!("westlake"));
    expect(activeName).toBe("Westlake");
    expect(inlineOrange()).toEqual(NONE);
    expect(html().cssText).toBe("");
  });

  it("writes no colour to <html> for a studio without one, or after switching between them", async () => {
    await mount();
    await act(async () => switchTo!("solon"));
    expect(activeName).toBe("Solon");
    expect(inlineOrange()).toEqual(NONE);
    await act(async () => switchTo!("westlake"));
    await act(async () => switchTo!("solon"));
    expect(inlineOrange()).toEqual(NONE);
    expect(html().cssText).toBe("");
  });
});
