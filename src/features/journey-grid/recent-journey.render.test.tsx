// @vitest-environment jsdom
/**
 * The profile's Journey grid, MOUNTED (see profile-nav.render.test.tsx for
 * why these exist). JourneyGrid does real work in layout effects — scroll
 * anchoring, the auto-fit, and now the older-sessions listener — and none of
 * that runs in a pure unit test.
 *
 * What is pinned here:
 *   - the profile draws no "Recent journey" caption, no "Older +7" pill, no
 *     LATEST column and no "Latest session" key;
 *   - scrolling to the left edge (after a touch) reveals the next page, and
 *     the rail then says where the history stops;
 *   - a machine's name opens it on every tap, not only on odd ones;
 *   - the Active Session's grid keeps its own rail, untouched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RecentJourneyView } from "./RecentJourneyView";
import { JourneyGrid } from "./JourneyGrid";
import type { JourneyRow, JourneySession, LiveColumn } from "./types";

/* jsdom has no ResizeObserver; the grid's touch listener lives in the same
   effect as its observer, so give it an inert one. */
const hadRO = "ResizeObserver" in globalThis;
beforeAll(() => {
  if (!hadRO) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});
afterAll(() => {
  if (!hadRO) delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
});

async function mount(ui: React.ReactNode): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  return { host, root };
}

const wait = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

function sessionsOf(n: number): JourneySession[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(2026, 0, 1 + i * 3);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { id: `s${i + 1}`, sessionNumber: i + 1, date: iso, trainerInitials: "AJ" };
  });
}

function rowsFor(sessions: JourneySession[]): JourneyRow[] {
  return ["leg-press", "chest-press"].map((id, r) => ({
    machine: { id, name: r === 0 ? "Leg Press" : "Chest Press", group: "Push" as const },
    sets: Object.fromEntries(
      // The newest session logs nothing: the case that used to draw a
      // blue column of dashes.
      sessions.slice(0, -1).map((s, i) => [
        s.id,
        { sessionId: s.id, outcome: "performed" as const, weight: 100 + i, reps: 10, quality: 2 as const },
      ]),
    ),
  }));
}

/** Put the scroller at the left edge and tell the grid it moved. */
async function scrollToOldest(host: HTMLElement) {
  const scroller = host.querySelector<HTMLElement>(".jg-scroller")!;
  Object.defineProperty(scroller, "scrollLeft", { configurable: true, get: () => 0, set: () => {} });
  await act(async () => {
    scroller.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    scroller.dispatchEvent(new Event("scroll"));
  });
  await wait();
}

const columns = (host: HTMLElement) => host.querySelectorAll(".jg-head[data-session-id]").length;

describe("RecentJourneyView (the profile's Journey tab)", () => {
  it("has no caption, no Older pill, no Latest frame and no Latest key", async () => {
    const sessions = sessionsOf(20);
    const { host, root } = await mount(
      <RecentJourneyView sessions={sessions} rows={rowsFor(sessions)} layout="page" resetKey="judy" />,
    );
    expect(host.querySelector(".jg-toolbar__title")).toBeNull();
    expect(host.textContent).not.toContain("Recent journey");
    expect(host.textContent).not.toMatch(/Older \+\d/);
    expect(host.querySelector(".is-latest")).toBeNull();
    expect(host.textContent).not.toContain("Latest");
    // The key itself is still there.
    expect(host.textContent).toContain("Skipped");
    expect(host.querySelector(".jg")?.getAttribute("data-autoload")).toBe("true");
    await act(async () => root.unmount());
  });

  it("reveals the next page when the trainer scrolls to the oldest column", async () => {
    const sessions = sessionsOf(20);
    const { host, root } = await mount(
      <RecentJourneyView sessions={sessions} rows={rowsFor(sessions)} layout="page" resetKey="judy" />,
    );
    expect(columns(host)).toBe(14);
    expect(host.querySelector(".jg-older__label")?.textContent).toBe("Older");

    await scrollToOldest(host);
    // 14 + 7 would be 21; only 20 exist.
    expect(columns(host)).toBe(20);
    expect(host.querySelector(".jg-older__label")?.textContent).toBe("Start of history");
    expect(host.querySelector<HTMLButtonElement>(".jg-older__btn")?.disabled).toBe(true);
    await act(async () => root.unmount());
  });

  it("does not load on open, before the trainer has touched the grid", async () => {
    const sessions = sessionsOf(20);
    const { host, root } = await mount(
      <RecentJourneyView sessions={sessions} rows={rowsFor(sessions)} layout="page" resetKey="judy" />,
    );
    const scroller = host.querySelector<HTMLElement>(".jg-scroller")!;
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    await wait();
    expect(columns(host)).toBe(14);
    await act(async () => root.unmount());
  });

  it("asks the server for more once the loaded sessions run out", async () => {
    const sessions = sessionsOf(14);
    let asked = 0;
    const { host, root } = await mount(
      <RecentJourneyView
        sessions={sessions}
        rows={rowsFor(sessions)}
        layout="page"
        resetKey="judy"
        hasMoreOnServer
        onLoadMore={() => {
          asked += 1;
        }}
      />,
    );
    await scrollToOldest(host);
    expect(asked).toBe(1);
    await act(async () => root.unmount());
  });

  it("says Loading… on the rail and does not cover the grid while a page loads", async () => {
    const sessions = sessionsOf(14);
    const { host, root } = await mount(
      <RecentJourneyView sessions={sessions} rows={rowsFor(sessions)} layout="page" resetKey="judy" hasMoreOnServer loadingMore />,
    );
    expect(host.querySelector(".jg-older__label")?.textContent).toBe("Loading…");
    expect(host.querySelector(".jg-view__loading")).toBeNull();
    await act(async () => root.unmount());
  });

  it("opens the machine on every tap — including the second tap on the same row", async () => {
    // The bug: the grid toggled its selection and reported null on the
    // second tap, so a machine the trainer had just closed would not reopen.
    const sessions = sessionsOf(5);
    const opened: string[] = [];
    const { host, root } = await mount(
      <RecentJourneyView
        sessions={sessions}
        rows={rowsFor(sessions)}
        layout="page"
        resetKey="judy"
        onOpenMachine={(id) => opened.push(id)}
      />,
    );
    const name = host.querySelector<HTMLButtonElement>(".jg-machine__btn")!;
    expect(name.getAttribute("aria-label")).toContain("Tap to open this machine.");
    await act(async () => name.click());
    await act(async () => name.click());
    await act(async () => name.click());
    expect(opened).toEqual(["leg-press", "leg-press", "leg-press"]);
    await act(async () => root.unmount());
  });

  it("the rail itself is a tap target while there is more", async () => {
    const sessions = sessionsOf(30);
    const { host, root } = await mount(
      <RecentJourneyView sessions={sessions} rows={rowsFor(sessions)} layout="page" resetKey="judy" />,
    );
    const strip = host.querySelector<HTMLElement>(".jg-cell--older.is-tappable")!;
    expect(strip).not.toBeNull();
    await act(async () => {
      strip.click();
    });
    expect(columns(host)).toBe(21);
    await act(async () => root.unmount());
  });
});

describe("the Active Session's grid is unchanged", () => {
  it("keeps its Latest column and its own Older rail", async () => {
    const sessions = sessionsOf(6);
    const live: LiveColumn = {
      session: { id: "today", sessionNumber: 7, date: "2026-03-01", trainerInitials: "AJ" },
      routineMachineIds: ["leg-press"],
      values: {},
      onChange: () => {},
    };
    const { host, root } = await mount(
      <JourneyGrid
        sessions={sessions}
        sections={[{ id: "r", label: "Today", rows: rowsFor(sessions) }]}
        live={live}
        showStats={false}
        onLoadOlder={() => {}}
        canLoadOlder
        layout="fill"
      />,
    );
    const grid = host.querySelector(".jg")!;
    expect(grid.getAttribute("data-autoload")).toBe("false");
    expect(host.querySelector(".jg-head.is-latest")).not.toBeNull();
    expect(host.querySelector(".jg-older__label")).toBeNull();
    expect(host.querySelector(".jg-head--older")?.textContent).toContain("Older");
    expect(host.querySelectorAll(".jg-cell--older__mark").length).toBeGreaterThan(0);
    // The name still traces the row, and says so.
    expect(host.querySelector(".jg-machine__btn")?.getAttribute("aria-label")).toContain("Tap to trace this row.");
    await act(async () => root.unmount());
  });
});
