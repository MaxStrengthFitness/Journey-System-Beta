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

vi.mock("motion/react", async () => {
  const R = await import("react");
  const strip = ({ initial: _i, animate: _a, exit: _e, layout: _l, transition: _t, ...rest }: Record<string, unknown>) => rest;
  const made = new Map<string, unknown>();
  const motion = new Proxy({}, {
    get: (_t, tag: string) => {
      if (!made.has(tag)) made.set(tag, R.forwardRef((p: Record<string, unknown>, ref) => R.createElement(tag, { ...strip(p), ref })));
      return made.get(tag);
    },
  });
  return { motion, AnimatePresence: ({ children }: { children: React.ReactNode }) => R.createElement(R.Fragment, null, children) };
});

import { ToastProvider, useToast } from "./ToastContext";

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
});
