// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFETTI_BITS_TOUCH, CONFETTI_GONE_AFTER_MS, WrapUpConfetti, makeBits } from "./WrapUpConfetti";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<WrapUpConfetti />));
  return host;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

describe("the Wrap-up's confetti (the iPad round, Oct 6 2026)", () => {
  it("is gone after the burst even when no animation reports its end (reduced motion, a hidden tab)", async () => {
    vi.useFakeTimers();
    const el = await mount();
    expect(el.querySelector(".wu-confetti")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(CONFETTI_GONE_AFTER_MS);
    });
    expect(el.querySelector(".wu-confetti")).toBeNull();
  });

  it("draws fewer bits on a touch screen", async () => {
    (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({ matches: q === "(pointer: coarse)" });
    const el = await mount();
    expect(el.querySelectorAll(".wu-confetti__bit")).toHaveLength(CONFETTI_BITS_TOUCH);
  });

  it("lands each bit where the old burst did, with its delay inside 0.15 s", () => {
    const bits = makeBits(36, () => 0.5);
    expect(bits[0]).toMatchObject({ x: 0, y: -70, delay: 0.075 });
    for (const b of makeBits(36)) {
      expect(b.delay).toBeGreaterThanOrEqual(0);
      expect(b.delay).toBeLessThanOrEqual(0.15);
      expect(b.size).toBeGreaterThanOrEqual(4);
      expect(b.size).toBeLessThanOrEqual(11);
    }
  });
});
