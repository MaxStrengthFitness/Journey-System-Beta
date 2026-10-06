// @vitest-environment jsdom
/**
 * THE STAIRCASE, MOUNTED (the machine menu, phase 4).
 *
 * The chart measures its width in a layout effect and keeps its window and
 * its selection in state, so only a mount proves (at width={712}, a portrait
 * session dialog's content):
 *
 *   - twelve whole-column targets, each saying its outcome and its mark;
 *   - the fold and its words (claimed only through canClaimGap);
 *   - a tap fills the fixed readout and the selection stays; tapping again,
 *     or ✕, goes back to the sentence;
 *   - ‹ › and the arrow keys step one session and cross a page by themselves;
 *   - below the minimum the sentence shows and nothing is drawn; a failed
 *     read and a cache-only read say so;
 *   - Load older calls the door's own reader, and the window then shows what
 *     was read;
 *   - settings copies draw no note glyph (unless the history read failed); an
 *     empty snapshot and a Save + Undo draw no set-up boundary;
 *   - the reps frame never spans less than 4;
 *   - a Start placeholder draws no Today column.
 *
 * The data is the design round's made-up client (fixtures.ts).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ownedWindow } from "../../lib/history-claims";
import { sessionTotalOf } from "../../lib/session-total";
import { CUTOVER, LEG_PRESS_FIELDS, LEG_PRESS_HISTORY, LEG_PRESS_JOURNAL, STUDIO, TODAY, averyRead } from "./fixtures";
import { MachineTimeline, TIMELINE_FALLBACK_WIDTH, type OlderLoad } from "./MachineTimeline";
import { progressFromModel } from "./progress-figure";
import { parseSettingHistory, type SettingHistoryDoc } from "./setting-history";
import { countedRuns, stepRuns } from "./step-runs";
import { buildTimelineModel, type TimelineInput, type TimelineLogInput, type TimelineSessionInput } from "./timeline-model";
import { CACHE_ONLY_LINE, ONE_SESSION_TAIL, type WordsContext } from "./timeline-words";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CTX: WordsContext = { name: "Avery", today: TODAY, coverage: "partial" };
const W = 712;

function avery(from: number, over: Partial<TimelineInput> = {}) {
  return buildTimelineModel({
    machineId: "leg-press",
    machineName: "Leg Press",
    fields: LEG_PRESS_FIELDS,
    ...averyRead(from),
    today: TODAY,
    unitStudioId: STUDIO,
    history: parseSettingHistory(LEG_PRESS_HISTORY, "avery"),
    journal: LEG_PRESS_JOURNAL,
    window: ownedWindow({ coverage: "partial", cutover: CUTOVER }),
    ...over,
  });
}

type Row = [day: string, log: Partial<TimelineLogInput>, session?: Partial<TimelineSessionInput>];

function small(rows: Row[], over: Partial<TimelineInput> = {}) {
  const sessions: TimelineSessionInput[] = rows.map(([day, , s], i) => ({
    id: `s${i}`,
    date: day,
    status: "Completed",
    hostedAtStudioId: STUDIO,
    trainerInitials: "SR",
    ...s,
  }));
  const logs: TimelineLogInput[] = rows.map(([, l], i) => ({ sessionId: sessions[i].id as string, machineId: "m", weight: "100", reps: "10", ...l }));
  return buildTimelineModel({
    machineId: "m",
    machineName: "Torso Rotation",
    fields: [{ key: "seat", label: "Seat" }],
    sessions,
    logs,
    today: TODAY,
    unitStudioId: STUDIO,
    everythingRead: true,
    moreToLoad: false,
    history: [],
    journal: [],
    ...over,
  });
}

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  mounted.push({ root, host });
  return { host, root };
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
});

const q = (host: HTMLElement, sel: string) => host.querySelector(sel);
const cols = (host: HTMLElement) => [...host.querySelectorAll<SVGRectElement>("[data-col]")];
const colIds = (host: HTMLElement) => cols(host).map((c) => c.getAttribute("data-col"));
const readout = (host: HTMLElement) => host.querySelector<HTMLElement>(".mm-readout")!;

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function key(el: Element, k: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
}

const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === label) ?? null;

describe("the Staircase's width", () => {
  it("mounts with no ResizeObserver, at the fallback width, and at the width it is given", async () => {
    expect(typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver).toBe("undefined");
    const a = await mount(<MachineTimeline model={avery(21)} ctx={CTX} />);
    expect(q(a.host, ".mm-chart")?.getAttribute("data-width")).toBe(String(TIMELINE_FALLBACK_WIDTH));
    const b = await mount(<MachineTimeline model={avery(21)} ctx={CTX} width={W} />);
    expect(q(b.host, ".mm-chart")?.getAttribute("data-width")).toBe("712");
    expect(q(b.host, ".mm-plot svg")?.getAttribute("viewBox")).toMatch(/^0 0 712 /);
  });

  it("draws the Staircase once, at the width it read, and at the fallback when the card measures 0 (the iPad round, Oct 6 2026)", async () => {
    // jsdom measures every box 0: the card is drawn at the fallback, as a hidden card is.
    const a = await mount(<MachineTimeline model={avery(21)} ctx={CTX} />);
    expect(q(a.host, ".mm-plot svg")?.getAttribute("viewBox")).toMatch(new RegExp(`^0 0 ${TIMELINE_FALLBACK_WIDTH} `));
    // A card that measures 600px is drawn at 600, and never first at the fallback.
    const drawn: string[] = [];
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 600 });
    const seen = new MutationObserver((records) => {
      for (const r of records) {
        // A plot drawn at one width and then changed to another says so here.
        if (r.type === "attributes" && (r.target as Element).matches(".mm-plot > svg")) drawn.push(r.oldValue ?? "");
        for (const n of r.addedNodes)
          if (n instanceof Element) for (const svg of n.matches(".mm-plot > svg") ? [n] : n.querySelectorAll(".mm-plot > svg")) drawn.push(svg.getAttribute("viewBox") ?? "");
      }
    });
    seen.observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ["viewBox"] });
    try {
      const b = await mount(<MachineTimeline model={avery(21)} ctx={CTX} />);
      expect(q(b.host, ".mm-plot svg")?.getAttribute("viewBox")).toMatch(/^0 0 600 /);
      for (const r of seen.takeRecords()) for (const n of r.addedNodes) if (n instanceof Element) for (const svg of n.querySelectorAll(".mm-plot > svg")) drawn.push(svg.getAttribute("viewBox") ?? "");
      expect(drawn.length).toBeGreaterThan(0);
      expect(drawn.every((v) => v.startsWith("0 0 600 "))).toBe(true);
    } finally {
      seen.disconnect();
      if (desc) Object.defineProperty(HTMLElement.prototype, "clientWidth", desc);
      else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  });

  it("follows a ResizeObserver when there is one, and stops observing when it goes", async () => {
    let disconnected = 0;
    class FakeObserver {
      constructor(private cb: () => void) {}
      observe(el: HTMLElement) {
        Object.defineProperty(el, "clientWidth", { configurable: true, value: 1032 });
        this.cb();
      }
      disconnect() {
        disconnected += 1;
      }
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeObserver;
    const { host, root } = await mount(<MachineTimeline model={avery(21)} ctx={CTX} />);
    expect(q(host, ".mm-chart")?.getAttribute("data-width")).toBe("1032");
    await act(async () => root.unmount());
    mounted = [];
    expect(disconnected).toBeGreaterThan(0);
  });
});

describe("the Staircase at 712px", () => {
  it("draws twelve whole-column targets, each saying its outcome and its mark", async () => {
    const { host } = await mount(<MachineTimeline model={avery(21)} ctx={CTX} width={W} />);
    const c = cols(host);
    expect(c).toHaveLength(12);
    for (const el of c) {
      expect(el.getAttribute("data-outcome")).toBe("performed");
      expect(["max", "poor", "none"]).toContain(el.getAttribute("data-quality"));
      expect(el.getAttribute("width")).toBe("52");
    }
    expect(colIds(host)[0]).toBe("s-2026-05-04");
    expect(colIds(host)[11]).toBe("s-2026-10-01");
    expect(q(host, '[data-col="s-2026-10-01"]')?.getAttribute("data-quality")).toBe("max");
    expect(q(host, '[data-col="s-2026-07-30"]')?.getAttribute("data-quality")).toBe("poor");
    expect(q(host, '[data-col="s-2026-09-17"]')?.getAttribute("data-quality")).toBe("none");
    const svg = q(host, ".mm-plot svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.querySelector("title")?.textContent).toBe("Leg Press: weight and reps, session by session");
    expect(svg.querySelector("desc")?.textContent).toMatch(/^12 sessions shown, May 4 to Oct 1 2026\./);
  });

  it("prints the rep counts as the grid's marks, and the loads where they change", async () => {
    const { host } = await mount(<MachineTimeline model={avery(21)} ctx={CTX} width={W} />);
    const chip = q(host, '[data-chip="reps"][data-at="s-2026-10-01"]')!;
    expect(chip.textContent).toBe("11");
    expect(chip.querySelector(".mm-chip--max")).not.toBeNull();
    expect(chip.querySelector(".mm-star svg")).not.toBeNull();
    const poor = q(host, '[data-chip="reps"][data-at="s-2026-07-30"]')!;
    expect(poor.querySelector(".mm-chip--poor")).not.toBeNull();
    expect(poor.querySelector(".mm-kaizen svg")).not.toBeNull();
    expect(q(host, '[data-chip="reps"][data-at="s-2026-09-17"] .mm-chip--done')).not.toBeNull();
    // 7 of the 12 newest columns carry their load (the design page's count).
    expect(host.querySelectorAll("[data-load]")).toHaveLength(7);
  });

  it("folds the seven weeks away, and says so only through the readout", async () => {
    const { host } = await mount(<MachineTimeline model={avery(21)} ctx={CTX} width={W} />);
    const fold = q(host, '[data-fold="s-2026-07-16"]')!;
    expect(fold.getAttribute("data-days")).toBe("49");
    expect(fold.textContent).toBe("7 wk");
    expect(readout(host).textContent).toContain("long gap, folded");
    await click(q(host, '[data-col="s-2026-07-16"]'));
    expect(readout(host).textContent).toContain("7 weeks away before this session");
  });

  it("fills the readout on a tap, keeps the selection, and goes back to the sentence on a second tap or ✕", async () => {
    const onOpenNote = vi.fn();
    const progress = progressFromModel(avery(21), 80, "partial");
    const { host } = await mount(<MachineTimeline model={avery(21)} ctx={CTX} width={W} progress={progress} onOpenNote={onOpenNote} />);
    const idle = readout(host);
    expect(idle.getAttribute("data-readout")).toBe("idle");
    expect(idle.textContent).toContain("24 times in the sessions loaded here, Dec 15 2025 – Oct 1 2026 · Starting weight 80 lb, +25%");
    expect(q(host, ".mm-gain")?.textContent).toBe("+25%");
    expect(idle.textContent).toContain("Tap a session for its set, set-up and notes. Older sessions aren't loaded yet.");
    for (const word of ["max strength", "needs improvement", "Heads up", "set-up changed"]) expect(idle.textContent).toContain(word);

    await click(q(host, '[data-col="s-2026-09-17"]'));
    const r = readout(host);
    expect(r.getAttribute("data-readout")).toBe("s-2026-09-17");
    expect(r.getAttribute("aria-live")).toBe("polite");
    expect(r.querySelector(".mm-ro__a-text")?.textContent).toBe("Thu Sep 17 · AC · 4th machine of 7");
    expect(r.querySelector(".mm-ro__fig")?.textContent).toBe("100 lb × 9");
    expect(r.querySelector(".mm-ro__c")?.textContent).toBe("Seat 5 · Back pad 2 · Foot plate High (as saved)");
    expect(r.querySelector(".mm-ro__event")?.textContent).toBe("Heads up · Ana: “Pushes through the toes near the end of the set; cue heels down.”");
    expect(q(host, '[data-col="s-2026-09-17"]')?.hasAttribute("data-selected")).toBe(true);

    await click(button(host, "Open note"));
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(onOpenNote.mock.calls[0][0].journalEntryId).toBe("n3");

    await click(q(host, '[data-col="s-2026-09-17"]'));
    expect(readout(host).getAttribute("data-readout")).toBe("idle");

    await click(q(host, '[data-col="s-2026-10-01"]'));
    expect(readout(host).querySelector(".mm-ro__mark")?.textContent).toBe("Max strength");
    await click(button(host, "Back to the summary"));
    expect(readout(host).getAttribute("data-readout")).toBe("idle");
  });

  it("steps with ‹ › one session at a time, crossing a page by itself", async () => {
    const { host } = await mount(<MachineTimeline model={avery(21)} ctx={CTX} width={W} />);
    await click(q(host, '[data-col="s-2026-05-04"]'));
    await click(button(host, "Older session"));
    expect(readout(host).getAttribute("data-readout")).toBe("s-2026-04-23");
    expect(colIds(host)).toContain("s-2026-04-23");
    expect(colIds(host)).not.toContain("s-2026-10-01");
    expect(cols(host)).toHaveLength(12);

    await click(button(host, "Newer session"));
    expect(readout(host).getAttribute("data-readout")).toBe("s-2026-05-04");
    await click(button(host, "Newer session"));
    expect(readout(host).getAttribute("data-readout")).toBe("s-2026-05-14");
    expect(colIds(host)).toContain("s-2026-07-16");

    // The newest has no newer; the oldest loaded has no older.
    await click(q(host, '[data-col="s-2026-10-01"]'));
    expect(button(host, "Newer session")?.hasAttribute("disabled")).toBe(true);
  });

  it("answers the arrow keys, Home and End on the plot", async () => {
    const { host } = await mount(<MachineTimeline model={avery(21)} ctx={CTX} width={W} />);
    const plot = q(host, ".mm-plot")!;
    expect(plot.getAttribute("tabindex")).toBe("0");
    // A group, so its name and the keys it takes are announced (a role-less div's label is dropped).
    expect(plot.getAttribute("role")).toBe("group");
    expect(plot.getAttribute("aria-label")).toBe("Chart of every loaded session. Left and right arrow keys step through sessions.");
    await key(plot, "ArrowLeft");
    expect(readout(host).getAttribute("data-readout")).toBe("s-2026-10-01");
    await key(plot, "ArrowLeft");
    expect(readout(host).getAttribute("data-readout")).toBe("s-2026-09-17");
    await key(plot, "Home");
    expect(readout(host).getAttribute("data-readout")).toBe("s-2025-12-15");
    expect(colIds(host)).toContain("s-2025-12-15");
    expect(button(host, "Older session")?.hasAttribute("disabled")).toBe(true);
    await key(plot, "End");
    expect(readout(host).getAttribute("data-readout")).toBe("s-2026-10-01");
    await key(plot, "Escape");
    expect(readout(host).getAttribute("data-readout")).toBe("idle");
  });

  it("draws a hold in its own row, practice off the line, and a skip with its note as one mark of two", async () => {
    const { host } = await mount(<MachineTimeline model={avery(21)} ctx={CTX} width={W} />);
    // The hold on Mar 23 is loaded, so its row is there even where none is in view.
    expect(q(host, '[data-chip="hold"]')).toBeNull();
    expect([...host.querySelectorAll(".mm-plot text")].some((t) => t.textContent === "hold")).toBe(true);
    // ‹ Older: Jan 13 – May 4, keeping May 4 for context.
    await click(q(host, '[data-page="older"]'));
    expect(colIds(host)[0]).toBe("s-2026-01-13");
    expect(colIds(host).at(-1)).toBe("s-2026-05-04");
    expect(q(host, '[data-chip="hold"][data-at="s-2026-03-23"]')?.textContent).toBe("1:30");
    expect(q(host, '[data-chip="reps"][data-at="s-2026-03-23"]')).toBeNull();
    expect(q(host, 'rect[data-dot="s-2026-03-23"]')).not.toBeNull();
    const skip = q(host, '[data-lane][data-at="s-2026-02-11"]')!;
    expect(skip.getAttribute("data-lane")).toBe("note");
    expect(skip.getAttribute("data-count")).toBe("2");
    expect(q(host, '[data-col="s-2026-02-11"]')?.getAttribute("data-outcome")).toBe("skipped");
    // ‹ Older again: the oldest loaded page, the blood-flow set off the line.
    await click(q(host, '[data-page="older"]'));
    const practice = q(host, '[data-chip="practice"][data-at="s-2026-01-03"]')!;
    expect(practice.textContent).toContain("BF");
    expect(q(host, '[data-ring="s-2026-01-03"]')?.textContent).toBe("70↓");
    expect(q(host, '[data-col="s-2026-01-03"]')?.getAttribute("data-outcome")).toBe("practice");
  });

  it("draws the overview strip only when the loaded sessions don't fit, and a tap on it moves the window there", async () => {
    const { host } = await mount(<MachineTimeline model={avery(21)} ctx={CTX} width={W} />);
    const strip = q(host, "[data-overview]")!;
    expect(strip).not.toBeNull();
    expect(strip.getAttribute("aria-label")).toMatch(/^Every loaded session on calendar time, Dec 15 2025 to today\./);
    const pointer = (type: string) => {
      const ev = new MouseEvent(type, { bubbles: true, clientX: 8 });
      Object.defineProperty(ev, "pointerId", { value: 1 });
      return ev;
    };
    await act(async () => {
      strip.dispatchEvent(pointer("pointerdown"));
      strip.dispatchEvent(pointer("pointerup"));
    });
    expect(readout(host).getAttribute("data-readout")).toBe("s-2025-12-15");
    expect(colIds(host)).toContain("s-2025-12-15");

    const few = small([
      ["2026-09-01", { reps: "9" }],
      ["2026-09-08", { reps: "10" }],
      ["2026-09-15", { reps: "11" }],
    ]);
    const other = await mount(<MachineTimeline model={few} ctx={CTX} width={W} />);
    expect(q(other.host, "[data-overview]")).toBeNull();
    expect(q(other.host, "[data-page]")).toBeNull();
    expect(cols(other.host)).toHaveLength(3);
    expect(q(other.host, "[data-wall]")?.textContent).toBe("Start ofJourney");
  });

  it("opens Every session and Weight by weight in place", async () => {
    const m = avery(21);
    const { host } = await mount(<MachineTimeline model={m} ctx={CTX} width={W} />);
    await click(button(host, "Every session (26)"));
    expect(host.querySelectorAll("[data-list='sessions'] tbody tr")).toHaveLength(20);
    expect(q(host, "[data-list='sessions'] tbody tr")?.getAttribute("data-row")).toBe("s-2026-10-01");
    await click(button(host, "Show 6 more"));
    expect(host.querySelectorAll("[data-list='sessions'] tbody tr")).toHaveLength(26);
    await click(button(host, `Weight by weight (${countedRuns(stepRuns(m))})`));
    const runs = host.querySelectorAll("[data-list='runs'] .mm-run");
    expect(runs.length).toBe(stepRuns(m).length);
    expect(runs[0].textContent).toMatch(/^100 lb · 3 times · /);
    expect(host.querySelectorAll("[data-list='runs'] [data-divider]").length).toBeGreaterThan(0);
  });

  it("says the client's sessions before Journey in one client-level line, and never guesses a pronoun", async () => {
    const total = sessionTotalOf({ sessionCount: 70, clientsNumberOfVisitsAtSite: 372, firstSessionDate: "2025-09-09" }, "partial");
    const { host } = await mount(<MachineTimeline model={avery(21)} ctx={CTX} width={W} sessionTotal={total} />);
    expect(q(host, ".mm-before")?.textContent).toBe("About 302 sessions before Journey (from Mindbody, not yet confirmed). No machine detail for those.");
    expect(q(host, ".mm-chart__title")?.textContent).toBe("How Avery has done here");
    expect(host.textContent).not.toMatch(/\b(her|she|best|started)\b|at the studio/i);
  });
});

describe("the Staircase's states", () => {
  it("shows the sentence below the minimum, and draws nothing", async () => {
    const one = small([["2026-09-24", { reps: "9" }]], { everythingRead: false, moreToLoad: false });
    const { host } = await mount(<MachineTimeline model={one} ctx={CTX} width={W} />);
    expect(q(host, ".mm-chart")?.getAttribute("data-state")).toBe("one");
    expect(q(host, ".mm-chart__state")?.textContent).toBe(`Once in the sessions loaded here (Thu Sep 24 2026). ${ONE_SESSION_TAIL}`);
    expect(host.querySelector("svg")).toBeNull();
    expect(host.querySelector("[data-col]")).toBeNull();
  });

  it("says a failed read, offers Try again, and draws nothing", async () => {
    const onRetry = vi.fn();
    const { host } = await mount(<MachineTimeline model={avery(21, { readState: "failed" })} ctx={CTX} width={W} onRetry={onRetry} />);
    expect(q(host, ".mm-chart__state")?.textContent).toBe("Couldn't load Avery's sessions on Leg Press");
    expect(host.querySelector("svg")).toBeNull();
    await click(button(host, "Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says a cache-only read in one line, and still draws what was read", async () => {
    const { host } = await mount(<MachineTimeline model={avery(21, { readState: "cache-only" })} ctx={CTX} width={W} />);
    expect(host.textContent).toContain(CACHE_ONLY_LINE);
    expect(cols(host)).toHaveLength(12);
  });

  it("waits with the loading words, never the first-time ones", async () => {
    const loading = small([], { readState: "loading", everythingRead: false, moreToLoad: true });
    const { host } = await mount(<MachineTimeline model={loading} ctx={CTX} width={W} />);
    expect(host.textContent).toContain("Loading Avery's sessions on Torso Rotation…");
    expect(host.textContent).not.toMatch(/first time/i);
  });

  it("offers Load them when a running total knows the machine and nothing is loaded", async () => {
    const onLoad = vi.fn();
    const none = small([], { everythingRead: false, moreToLoad: true });
    const { host } = await mount(<MachineTimeline model={none} ctx={CTX} width={W} knownElsewhere older={{ state: "idle", onLoad }} />);
    expect(host.textContent).toContain("Done here in Journey before · not in the sessions loaded here");
    await click(button(host, "Load them"));
    expect(onLoad).toHaveBeenCalledTimes(1);
  });
});

describe("Load older", () => {
  it("calls the door's own reader from the oldest page, and then shows what was read", async () => {
    for (const door of ["profile", "session"] as const) {
      const from = door === "profile" ? 21 : 42;
      const onLoad = vi.fn();
      const older: OlderLoad = { state: "idle", onLoad };
      const { host, root } = await mount(<MachineTimeline model={avery(from)} ctx={CTX} width={W} older={older} />);
      // Page back to the oldest loaded page: ‹ Older becomes Load older there.
      for (let guard = 0; guard < 5 && q(host, '[data-page="older"]'); guard++) await click(q(host, '[data-page="older"]'));
      const load = q(host, "[data-load-older]")!;
      expect(load.textContent).toBe("Load older");
      await click(load);
      expect(onLoad, door).toHaveBeenCalledTimes(1);
      const oldFirst = avery(from).columns[0].sessionId;
      await act(async () => root.render(<MachineTimeline model={avery(1)} ctx={CTX} width={W} older={older} />));
      // The window now ends at what used to be the oldest column.
      expect(colIds(host).at(-1), door).toBe(oldFirst);
    }
  });

  it("says loading, failed and offline", async () => {
    const onLoad = vi.fn();
    const m = small([["2026-09-24", { reps: "9" }]], { everythingRead: false, moreToLoad: true });
    const a = await mount(<MachineTimeline model={m} ctx={CTX} width={W} older={{ state: "loading", onLoad }} />);
    expect(q(a.host, "[data-load-older]")?.textContent).toBe("Loading…");
    expect(q(a.host, "[data-load-older]")?.hasAttribute("disabled")).toBe(true);
    const b = await mount(<MachineTimeline model={m} ctx={CTX} width={W} older={{ state: "failed", onLoad }} />);
    expect(b.host.textContent).toContain("Couldn't load older sessions");
    expect(q(b.host, "[data-load-older]")?.textContent).toBe("Try again");
    const c = await mount(<MachineTimeline model={m} ctx={CTX} width={W} older={{ state: "offline", onLoad }} />);
    expect(c.host.textContent).toContain("Can't load older sessions offline");
  });
});

describe("notes and set-up on the lanes", () => {
  it("draws no glyph for a settings copy, and shows it as a note only when the history couldn't be read", async () => {
    const { host } = await mount(<MachineTimeline model={avery(21)} ctx={CTX} width={W} />);
    const notes = [...host.querySelectorAll('[data-lane="note"]')];
    expect(notes.map((n) => n.getAttribute("data-at"))).toEqual(["s-2026-09-17"]);
    expect(q(host, '[data-lane][data-at="s-2026-08-18"]')).toBeNull();
    expect(q(host, '[data-boundary="s-2026-08-18"]')).not.toBeNull();

    const unread = await mount(<MachineTimeline model={avery(21, { history: null })} ctx={CTX} width={W} />);
    expect(q(unread.host, '[data-lane="note"][data-at="s-2026-08-18"]')).not.toBeNull();
  });

  it("draws no boundary for an empty snapshot, nor for a Save and its Undo", async () => {
    const empty = small([
      ["2026-09-01", { machineSettings: { seat: "4" } }],
      ["2026-09-08", { machineSettings: {} }],
      ["2026-09-15", { machineSettings: { seat: "4" } }],
    ]);
    const a = await mount(<MachineTimeline model={empty} ctx={CTX} width={W} />);
    expect(a.host.querySelector("[data-boundary]")).toBeNull();
    expect(a.host.querySelector('[data-lane-row="setup"]')).toBeNull();

    const docs: SettingHistoryDoc[] = [
      { id: "u1", clientId: "c", timestamp: "2026-09-10T10:00:00-04:00", changeType: "SETTINGS", oldValue: "Seat: 4", newValue: "Seat: 5", reason: "Comfort or fit", trainerName: "Sam Reyes" },
      { id: "u2", clientId: "c", timestamp: "2026-09-10T10:00:08-04:00", changeType: "SETTINGS", oldValue: "Seat: 5", newValue: "Seat: 4", reason: "Undone", trainerName: "Sam Reyes" },
    ];
    const undone = small(
      [
        ["2026-09-08", { machineSettings: { seat: "4" } }],
        ["2026-09-15", { machineSettings: { seat: "4" } }],
      ],
      { history: parseSettingHistory(docs, "c") },
    );
    const b = await mount(<MachineTimeline model={undone} ctx={CTX} width={W} />);
    expect(b.host.querySelector("[data-boundary]")).toBeNull();

    // A real change does draw one: the sliders, never the wrench.
    const moved = small([
      ["2026-09-08", { machineSettings: { seat: "4" } }],
      ["2026-09-15", { machineSettings: { seat: "5" } }],
    ]);
    const c = await mount(<MachineTimeline model={moved} ctx={CTX} width={W} />);
    const boundary = q(c.host, '[data-boundary="s1"]')!;
    expect(boundary).not.toBeNull();
    expect(boundary.querySelector(".lucide-sliders-horizontal")).not.toBeNull();
    expect(c.host.querySelector(".lucide-wrench")).toBeNull();
  });
});

describe("the reps frame", () => {
  const cy = (host: HTMLElement, at: string) => Number(q(host, `[data-chip="reps"][data-at="${at}"]`)?.getAttribute("data-cy"));

  it("never spans less than 4 reps, so 9 and 10 never fill the track", async () => {
    const close = small([
      ["2026-09-01", { reps: "9" }],
      ["2026-09-08", { reps: "10" }],
      ["2026-09-15", { reps: "9" }],
    ]);
    const { host } = await mount(<MachineTimeline model={close} ctx={CTX} width={W} />);
    // The 104px track less a chip's room at each end (68px) over 4 reps.
    expect(cy(host, "s0") - cy(host, "s1")).toBeCloseTo(68 / 4, 1);

    const wide = small([
      ["2026-09-01", { reps: "6" }],
      ["2026-09-08", { reps: "12" }],
    ]);
    const other = await mount(<MachineTimeline model={wide} ctx={CTX} width={W} />);
    expect(cy(other.host, "s0") - cy(other.host, "s1")).toBeCloseTo(68, 1);
  });
});

describe("the Today column", () => {
  const today = (log: Partial<TimelineLogInput>) =>
    small(
      [
        ["2026-09-01", { reps: "9" }],
        ["2026-09-08", { reps: "10" }],
        [TODAY, log, { id: "run", status: "In-Progress" }],
      ],
      { runningSessionId: "run" },
    );

  it("is not drawn for a set Start seeded and nobody worked on", async () => {
    const { host } = await mount(<MachineTimeline model={today({ reps: undefined })} ctx={CTX} width={W} />);
    expect(colIds(host)).toEqual(["s0", "s1"]);
    expect([...host.querySelectorAll(".mm-dl")].some((t) => t.textContent === "Today")).toBe(false);
  });

  it("is drawn once a set has been worked on, in the hero orange, and never counted", async () => {
    const { host } = await mount(<MachineTimeline model={today({ reps: "11" })} ctx={CTX} width={W} />);
    expect(colIds(host)).toEqual(["s0", "s1", "run"]);
    expect(q(host, '[data-date="run"]')?.textContent).toBe("Today");
    expect(q(host, '[data-date="run"]')?.getAttribute("class")).toContain("mm-dl--today");
    // Today's set is drawn, never counted: two times, not three.
    expect(readout(host).textContent).toContain("2 times in Journey since Tue Sep 1 2026");
  });
});
