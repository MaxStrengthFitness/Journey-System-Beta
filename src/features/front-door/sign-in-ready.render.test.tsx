// @vitest-environment jsdom
/**
 * The sign-in buttons wait for the popup helper only where a popup must be
 * opened straight from the tap, and never longer than the cap (the speed
 * round, Oct 5 2026, R14).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSignInReady } from "./sign-in-ready";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let ready = false;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
});

function Probe(props: Parameters<typeof useSignInReady>[0]) {
  ready = useSignInReady(props);
  return null;
}

async function mount(props: Parameters<typeof useSignInReady>[0]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Probe {...props} />));
}

describe("useSignInReady", () => {
  it("on Safari, waits for the helper", async () => {
    let finish!: () => void;
    const prepare = vi.fn(() => new Promise<void>((r) => (finish = r)));
    await mount({ active: true, prepare, mustWait: true });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(ready).toBe(false);
    await act(async () => finish());
    expect(ready).toBe(true);
  });

  it("a helper that fails to load does not hold the buttons", async () => {
    const prepare = vi.fn(() => Promise.reject(new Error("blocked")));
    await mount({ active: true, prepare, mustWait: true });
    expect(ready).toBe(true);
  });

  it("never waits longer than the cap", async () => {
    vi.useFakeTimers();
    await mount({ active: true, prepare: () => new Promise(() => {}), mustWait: true, capMs: 1000 });
    expect(ready).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(ready).toBe(true);
  });

  it("elsewhere never waits, but still warms the helper", async () => {
    const prepare = vi.fn(() => new Promise<void>(() => {}));
    await mount({ active: true, prepare, mustWait: false });
    expect(ready).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("signed in: does nothing", async () => {
    const prepare = vi.fn(async () => {});
    await mount({ active: false, prepare, mustWait: true });
    expect(prepare).not.toHaveBeenCalled();
  });
});
