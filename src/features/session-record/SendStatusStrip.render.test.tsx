// @vitest-environment jsdom
/**
 * The line under the session bar, MOUNTED with the hook that feeds it
 * (session record, Sep 26 2026). Only the mounted pair shows the three
 * moments that matter on the floor: the Wi-Fi drops, a save hangs while the
 * iPad thinks it is online, and everything arrives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({ db: {} }));

let settle: Array<() => void> = [];
vi.mock("firebase/firestore", () => ({
  waitForPendingWrites: vi.fn(() => new Promise<void>((resolve) => settle.push(resolve))),
}));

import { SendStatusStrip } from "./SendStatusStrip";
import { useSendState, type SendState } from "./useSendState";
import { STILL_SENDING_AFTER_MS } from "./send-status";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
let state: SendState | null = null;

function Harness() {
  state = useSendState();
  return <SendStatusStrip online={state.online} unsentForMs={state.unsentForMs} />;
}

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Harness />));
  return host;
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  settle = [];
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  state = null;
  vi.useRealTimers();
});

describe("SendStatusStrip with useSendState", () => {
  it("draws nothing while online with nothing waiting", () => {
    const el = mount();
    expect(el.querySelector(".sr-send")).toBeNull();
  });

  it("says so when the Wi-Fi drops, and goes when it's back", () => {
    const el = mount();
    setOnline(false);
    const line = el.querySelector(".sr-send");
    expect(line?.getAttribute("data-kind")).toBe("offline");
    expect(line?.getAttribute("role")).toBe("status");
    expect(line?.textContent).toContain("saved on this iPad");
    setOnline(true);
    expect(el.querySelector(".sr-send")).toBeNull();
  });

  it("says a save is still going once it has waited long enough, and clears when it arrives", async () => {
    const el = mount();
    act(() => state!.sent());
    act(() => {
      vi.advanceTimersByTime(STILL_SENDING_AFTER_MS - 1_000);
    });
    expect(el.querySelector(".sr-send")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(el.querySelector(".sr-send")?.getAttribute("data-kind")).toBe("sending");

    await act(async () => {
      settle.forEach((resolve) => resolve());
      await Promise.resolve();
    });
    expect(el.querySelector(".sr-send")).toBeNull();
  });

  it("keeps waiting on the newest save when an older one arrives first", async () => {
    const el = mount();
    act(() => state!.sent());
    act(() => state!.sent());
    await act(async () => {
      settle[0]();
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(STILL_SENDING_AFTER_MS + 1_000);
    });
    expect(el.querySelector(".sr-send")?.getAttribute("data-kind")).toBe("sending");
    await act(async () => {
      settle[1]();
      await Promise.resolve();
    });
    expect(el.querySelector(".sr-send")).toBeNull();
  });
});
