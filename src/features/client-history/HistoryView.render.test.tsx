// @vitest-environment jsdom
/**
 * The History tab, MOUNTED, for what it says about a client's absences and
 * her session numbers (Sep 24 2026, lib/history-claims.ts).
 *
 * FileMaker stays live through the migration, so a client in twice a week
 * can have weeks recorded only there. The tab used to open on "No visit in
 * 4 weeks" in crimson for her. Now:
 *   - a gap is a break only where Journey sees every session (`breakWindow`);
 *     a caller that passes none claims none;
 *   - with no such days yet, the break tiles become "In Journey since" and
 *     "Before Journey";
 *   - rows carry a number only through the session-number gate.
 *
 * HistoryView is drawn from plain props (no Firestore), so nothing is mocked.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HistoryView, type HistoryViewProps } from "./HistoryView";
import type { HistorySession } from "./model";
import type { PriorHistory } from "../../lib/prior-history";
import type { ScheduleEntry, Trainer } from "../../types";
import { wallClockToInstant } from "../../lib/studio-time";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const g = globalThis as unknown as Record<string, unknown>;
const stubs = ["ResizeObserver", "IntersectionObserver"].filter((k) => !(k in g));
beforeAll(() => {
  for (const k of stubs) {
    g[k] = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
});
afterAll(() => {
  for (const k of stubs) delete g[k];
});

const on = (date: string): HistorySession =>
  ({
    id: `s-${date}`,
    clientId: "c1",
    hostedAtStudioId: "solon",
    clientHomeStudioId: "solon",
    status: "Completed",
    date,
  }) as unknown as HistorySession;

/* Last Journey session Aug 24; "today" is Sep 24 - a month with nothing in Journey. */
const sessions = [on("2026-08-24"), on("2026-08-20"), on("2026-07-02"), on("2026-06-29"), on("2026-06-01")];
const TODAY = "2026-09-24";

let mounted: { root: Root; host: HTMLElement }[] = [];
async function mount(over: Partial<HistoryViewProps> = {}): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <HistoryView
          sessions={sessions}
          status="ready"
          hasMore={false}
          isFull
          onLoadAll={() => {}}
          trainers={[]}
          logsBySession={new Map()}
          onNeedLogs={() => {}}
          onOpenSessions={() => {}}
          today={TODAY}
          timeZone="America/New_York"
          {...over}
        />
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return host;
}
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

const prior: PriorHistory = { sessions: 412, importedCount: 0, through: "2026-05-31", source: "filemaker" };

describe("the History tab and a client whose story predates Journey", () => {
  it("claims no break and no absence when Journey owns none of her timeline", async () => {
    const host = await mount();
    expect(host.querySelector(".hist-notice")).toBeNull();
    expect(host.textContent).not.toMatch(/No visit in/);
    expect(host.textContent).not.toContain("Breaks of 2+ weeks");
    expect(host.textContent).not.toContain("Longest break");
    expect(host.querySelector(".hist-stat--alert")).toBeNull();
    // What IS known, instead.
    expect(host.textContent).toContain("In Journey since");
    expect(host.textContent).toContain("Jun 2026");
    expect(host.textContent).toContain("Before Journey");
    expect(host.textContent).toContain("not recorded yet");
  });

  it("says how many sessions came before Journey when somebody recorded them", async () => {
    // A cutover still to come: Journey owns no day yet, but the prior record is known.
    const host = await mount({ prior: { ...prior, through: "2026-12-31" }, breakWindow: { complete: false, from: "2027-01-01" } });
    expect(host.textContent).toContain("Before Journey");
    expect(host.textContent).toContain("412");
    expect(host.textContent).toContain("FileMaker");
    expect(host.querySelector(".hist-notice")).toBeNull();
  });

  it("claims only what falls inside the days Journey owns", async () => {
    // Her studio moved onto Journey on Aug 1: the June gap may be FileMaker's,
    // the month since Aug 24 is real.
    const host = await mount({ breakWindow: { complete: false, from: "2026-08-01" } });
    const notice = host.querySelector(".hist-notice");
    expect(notice?.textContent).toContain("No visit in");
    expect(host.textContent).toContain("Breaks of 2+ weeks");
    expect(host.textContent).toContain("since Aug 2026");
  });

  it("still tells a client whose whole story is here that she has been away", async () => {
    const host = await mount({ breakWindow: { complete: true, from: null } });
    expect(host.querySelector(".hist-notice")?.textContent).toContain("No visit in");
    expect(host.textContent).toContain("Longest break");
    // Jul 2 -> Aug 20, the longest - closed, so it is not flagged as ongoing.
    expect(host.textContent).toMatch(/7\s*weeks/);
  });
});

describe("the History list's session numbers", () => {
  const numbers = (host: HTMLElement) => Array.from(host.querySelectorAll(".hist-num")).map((n) => n.textContent);

  it("numbers nothing until her total is known", async () => {
    const host = await mount({ view: "list", onViewChange: () => {} });
    expect(numbers(host)).toEqual([]);
  });

  it("numbers on top of the sessions before Journey once it is", async () => {
    const host = await mount({ view: "list", onViewChange: () => {}, quoteSessionNumbers: true, prior });
    expect(numbers(host)).toEqual(["S417", "S416", "S415", "S414", "S413"]);
  });
});

/*
 * Her bookings on the calendar (Sep 26 2026, bookings.ts). AJ: "here was a
 * canceled session ... Are the rescheduled sessions here? Are there upcoming
 * sessions here?" — upcoming days outlined, cancellations Journey saw happen
 * and moves marked in the cell's corner, and every one of them written under
 * its month.
 */
describe("the calendar with her bookings", () => {
  const ET = "America/New_York";
  const at = (day: string, hm: string) => wallClockToInstant(`${day}T${hm}:00`, ET)!;
  /* Thursday Sep 24 2026, 10:00 AM Eastern. */
  const NOW = at(TODAY, "10:00");
  const trainers = [{ id: "t1", fullName: "Giovanni Rossi", initials: "GR" }] as Trainer[];

  const booking = (id: string, day: string, hm: string, extra: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
    id,
    clientId: "c1",
    clientName: "Helen Marsh",
    trainerId: "t1",
    trainerName: "Giovanni Rossi",
    studioId: "solon",
    startTime: at(day, hm),
    endTime: new Date(at(day, hm).getTime() + 30 * 60_000),
    status: "Scheduled",
    serviceName: "Strength 30",
    source: "MindBody",
    createdAt: null,
    ...extra,
  });

  const bookings: ScheduleEntry[] = [
    // The old sweep's: "Cancelled" with no stamp. Never drawn.
    booking("old-sweep", "2026-09-09", "15:00", { status: "Cancelled" }),
    // Cancelled, and Journey saw it happen. Nothing else booked that week.
    booking("gone", "2026-09-16", "15:00", { status: "Cancelled", cancelledAt: at("2026-09-15", "19:00"), cancelSource: "mindbody" }),
    // Moved from Fri Sep 18 to Tue Sep 22 (both past).
    booking("moved", "2026-09-22", "15:00", { movedFromDay: "2026-09-18", movedFromStart: at("2026-09-18", "15:00") }),
    // Later today, next Tuesday, and into October.
    booking("today", TODAY, "15:00"),
    booking("tue", "2026-09-29", "15:00"),
    booking("oct", "2026-10-06", "15:00"),
  ];

  const withBookings = (over: Partial<HistoryViewProps> = {}) =>
    mount({ trainers, now: NOW, bookings, bookingsStatus: "ready", ...over });

  const cell = (host: HTMLElement, day: string) => host.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
  const lines = (host: HTMLElement, month: string) =>
    Array.from(host.querySelectorAll(`[aria-label="${month} bookings"] li`)).map((li) => li.textContent);
  const legend = (host: HTMLElement) => host.querySelector(".hist-legend")?.textContent ?? "";

  it("outlines the days she is booked, today's later booking included, and draws next month", async () => {
    const host = await withBookings();
    expect(cell(host, TODAY).className).toContain("hist-cell--booked");
    expect(cell(host, TODAY).className).toContain("hist-cell--today");
    expect(cell(host, "2026-09-29").className).toContain("hist-cell--booked");
    expect(cell(host, "2026-09-29").getAttribute("aria-label")).toContain("booked with Giovanni");
    // October is on the calendar only because she is booked in it.
    expect(cell(host, "2026-10-06").className).toContain("hist-cell--booked");
    const october = host.querySelector('section[aria-label^="October 2026"]');
    expect(october?.getAttribute("aria-label")).toBe("October 2026: 1 booked");
    expect(october?.querySelector(".hist-month__count")?.textContent).toBe("1booked");
  });

  it("marks a cancellation Journey saw and a move in the cell's corner, and never the old sweep's", async () => {
    const host = await withBookings();
    expect(cell(host, "2026-09-16").className).toContain("hist-cell--changed");
    expect(cell(host, "2026-09-16").querySelector(".hist-cell__mark svg")).not.toBeNull();
    expect(cell(host, "2026-09-18").className).toContain("hist-cell--changed");
    expect(cell(host, "2026-09-18").getAttribute("aria-label")).toContain("moved to Tue Sep 22");
    expect(cell(host, "2026-09-09").className).not.toContain("hist-cell--changed");
    expect(cell(host, "2026-09-09").querySelector(".hist-cell__mark")).toBeNull();
  });

  it("writes every mark under its month, one line each", async () => {
    const host = await withBookings();
    expect(lines(host, "September")).toEqual([
      "Sep 16 · cancelled",
      "Sep 18 · moved to Tue Sep 22",
      "Thu Sep 24 · 3:00 PM · booked with Giovanni",
      "Tue Sep 29 · 3:00 PM · booked with Giovanni",
    ]);
    expect(lines(host, "October")).toEqual(["Tue Oct 6 · 3:00 PM · booked with Giovanni"]);
    // The old sweep's row says nothing anywhere.
    expect(host.textContent).not.toContain("Sep 9 · cancelled");
  });

  it("names in the legend only what the calendar draws", async () => {
    const host = await withBookings();
    expect(legend(host)).toContain("Booked");
    expect(legend(host)).toContain("Cancelled");
    expect(legend(host)).toContain("Moved");

    const onlyAhead = await withBookings({ bookings: [booking("tue", "2026-09-29", "15:00")] });
    expect(legend(onlyAhead)).toContain("Booked");
    expect(legend(onlyAhead)).not.toContain("Cancelled");
    expect(legend(onlyAhead)).not.toContain("Moved");
  });

  it("draws the past only, as before, without her bookings", async () => {
    const host = await mount({ trainers, now: NOW });
    expect(host.querySelector(".hist-cell--booked")).toBeNull();
    expect(host.querySelector(".hist-month__bookings")).toBeNull();
    expect(legend(host)).not.toContain("Booked");
    expect(host.querySelector('section[aria-label^="October 2026"]')).toBeNull();
  });

  it("says so when the read failed, and draws no booking layer — unknown, never 'no bookings'", async () => {
    const host = await withBookings({ bookingsStatus: "error" });
    expect(legend(host)).toContain("Bookings did not load");
    expect(host.querySelector(".hist-cell--booked")).toBeNull();
    expect(host.querySelector(".hist-cell__mark")).toBeNull();
    expect(host.querySelector(".hist-month__bookings")).toBeNull();
    expect(host.querySelector('section[aria-label^="October 2026"]')).toBeNull();
  });

  it("says so while the read is on its way", async () => {
    const host = await withBookings({ bookings: [], bookingsStatus: "loading" });
    expect(legend(host)).toContain("Loading bookings");
    expect(host.querySelector(".hist-cell--booked")).toBeNull();
  });
});
