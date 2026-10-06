// @vitest-environment jsdom
/**
 * OPENING JOURNEY, MOUNTED (the speed round, Oct 5 2026, R15).
 *
 * After six seconds it says the wait is slow, in Checking you in's words;
 * and when index.html's first frame was on screen, the squares stay still
 * rather than dropping in a second time.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CheckingIn, OpeningJourney, SLOW_LINE } from "./CheckingIn";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.getElementById("first-frame")?.remove();
  vi.useRealTimers();
});

async function mount(ui: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
  return host;
}

describe("OpeningJourney", () => {
  it("says the wait is slow after six seconds, as Checking you in does", async () => {
    vi.useFakeTimers();
    const el = await mount(<OpeningJourney />);
    expect(el.textContent).toContain("Opening Journey");
    expect(el.textContent).not.toContain(SLOW_LINE);
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(el.textContent).toContain(SLOW_LINE);
  });

  it("drops the squares in when nothing was on screen before it", async () => {
    const el = await mount(<OpeningJourney />);
    expect(el.querySelector(".fd-tiles--assemble")).toBeTruthy();
  });

  it("keeps them still after index.html's first frame", async () => {
    const frame = document.createElement("div");
    frame.id = "first-frame";
    document.body.appendChild(frame);
    const el = await mount(<OpeningJourney />);
    expect(el.querySelector(".fd-tiles--still")).toBeTruthy();
  });
});

describe("CheckingIn", () => {
  it("uses the same slow line, and offers the way out when given one", async () => {
    vi.useFakeTimers();
    const signOut = vi.fn();
    const el = await mount(<CheckingIn step={1} onSignOut={signOut} />);
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(el.textContent).toContain(SLOW_LINE);
    const out = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Not you? Sign out"))!;
    await act(async () => out.click());
    expect(signOut).toHaveBeenCalled();
  });
});
