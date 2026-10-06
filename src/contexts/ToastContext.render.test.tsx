// @vitest-environment jsdom
/**
 * A TOAST DRAWS ONLY ITSELF (speed round, Oct 5 2026, R7). The provider's
 * value used to be a new object each time a toast came or went, so every
 * screen that calls useToast() — AppContent, so the whole app — drew again
 * twice per toast. Mounted: a reader of the context, a toast shown and gone.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// No motion mock: the toasts come and go with CSS since the speed round
// (Oct 5 2026, R13), and nothing here imports the motion library.

import { TOAST_EXIT_MS, ToastProvider, useToast } from "./ToastContext";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("shows a toast and takes it away without drawing its readers again", () => {
    vi.useFakeTimers();
    const seen: unknown[] = [];
    let show: ((m: string) => void) | null = null;
    function Reader() {
      const t = useToast();
      seen.push(t);
      show = t.success;
      return null;
    }
    // The reader sits under a parent that never re-renders, as the app's tree does.
    const Tree = React.memo(function Tree() {
      return <Reader />;
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        <ToastProvider>
          <Tree />
        </ToastProvider>,
      ),
    );
    const before = seen.length;
    act(() => show!("Saved"));
    expect(document.body.textContent).toContain("Saved");
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(document.body.textContent).not.toContain("Saved");
    expect(seen.length).toBe(before);
  });

  it("fades a toast out for TOAST_EXIT_MS before it goes, and a tap and the timer together drop it once", () => {
    vi.useFakeTimers();
    let show: ((m: string) => void) | null = null;
    function Reader() {
      show = useToast().info;
      return null;
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        <ToastProvider>
          <Reader />
        </ToastProvider>,
      ),
    );
    act(() => show!("Synced"));
    const toast = () => document.body.querySelector<HTMLButtonElement>("button[aria-label=\"Dismiss\"]")?.parentElement ?? null;
    expect(toast()?.getAttribute("data-leaving")).toBeNull();
    expect(toast()?.className).toContain("motion-safe:animate-in");
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    // Leaving: still drawn, fading, and only under "reduce motion" still.
    expect(toast()?.getAttribute("data-leaving")).toBe("true");
    expect(toast()?.className).toContain("motion-safe:animate-out");
    // A tap on Dismiss while it fades changes nothing.
    act(() => toast()!.querySelector("button")!.click());
    act(() => {
      vi.advanceTimersByTime(TOAST_EXIT_MS);
    });
    expect(document.body.textContent).not.toContain("Synced");
  });
});
