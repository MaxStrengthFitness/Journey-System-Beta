// @vitest-environment jsdom
/**
 * The roster waits for the Hub's day, never longer than a few seconds, and a
 * studio it opened for stays open (the iPad round, Oct 6 2026).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ROSTER_HEAD_START_MS, useRosterHeadStart } from "./useRosterHeadStart";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let seen: boolean[] = [];
function Probe({ studio, answered }: { studio: string | null; answered: boolean }) {
  seen.push(useRosterHeadStart(studio, answered));
  return null;
}

let container: HTMLDivElement;
let root: Root;
const render = (studio: string | null, answered: boolean) =>
  act(() => {
    root.render(<Probe studio={studio} answered={answered} />);
  });
const last = () => seen[seen.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  seen = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("useRosterHeadStart", () => {
  it("holds the roster until the day has answered, then opens in the same render", async () => {
    await render("s1", false);
    expect(last()).toBe(false);
    await render("s1", true);
    expect(last()).toBe(true);
  });

  it("opens anyway after the wait when the day is slow", async () => {
    await render("s1", false);
    await act(async () => {
      vi.advanceTimersByTime(ROSTER_HEAD_START_MS - 1);
    });
    expect(last()).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(last()).toBe(true);
  });

  it("stays open when the day goes back to loading (a new day, a retry)", async () => {
    await render("s1", true);
    await render("s1", false);
    expect(last()).toBe(true);
  });

  it("waits again for a new studio, and never opens without one", async () => {
    await render("s1", true);
    await render("s2", false);
    expect(last()).toBe(false);
    await render(null, true);
    expect(last()).toBe(false);
  });
});
