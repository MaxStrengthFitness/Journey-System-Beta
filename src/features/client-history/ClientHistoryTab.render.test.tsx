// @vitest-environment jsdom
/**
 * The History tab's container, MOUNTED, for the one read of her bookings
 * (Sep 26 2026, useClientBookings.ts).
 *
 * The read hangs off the sessions listener — it asks from the first day the
 * calendar draws, so it has to wait for her sessions — and the profile does
 * not remount this tab between clients. Both are effect-order problems that
 * typecheck perfectly, so this mounts the container against a fake Firestore
 * and checks:
 *   - the query: this client, from the Monday before the first month drawn,
 *     no upper bound, soonest first, cancelled rows included;
 *   - a failed read, or an answer from the offline cache, is "did not load",
 *     never "no bookings";
 *   - a switch to another client drops the first client's late answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, ScheduleEntry, Trainer } from "../../types";
import { setActiveTimeZone, wallClockToInstant } from "../../lib/studio-time";

type Read = { q: any; resolve: (snap: unknown) => void; reject: (error: unknown) => void };

const fake = vi.hoisted(() => ({
  /** Session documents by client id, for the listener. */
  sessions: {} as Record<string, Record<string, unknown>[]>,
  /** Every getDocs, held open until a test answers it. */
  reads: [] as Read[],
  /** The studio's "didn't come" marks (Operations wave 3), and every listener asked for them. */
  marks: [] as Array<Record<string, unknown> & { id: string }>,
  markReads: [] as any[],
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));

vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "solon", activeStudio: null, studios: [] }),
}));

vi.mock("firebase/firestore", () => ({
  Timestamp: { fromDate: (d: Date) => ({ __date: d }) },
  collection: (_db: unknown, ...path: string[]) => ({ __collection: path.join("/") }),
  query: (coll: any, ...constraints: any[]) => ({ ...coll, constraints }),
  where: (field: string, op: string, value: unknown) => ({ type: "where", field, op, value }),
  orderBy: (field: string, dir: string) => ({ type: "orderBy", field, dir }),
  limit: (n: number) => ({ type: "limit", n }),
  onSnapshot: (q: any, a: unknown, b: unknown) => {
    const next = (typeof a === "function" ? a : b) as (snap: unknown) => void;
    if (q.__collection.endsWith("/bookingMarks")) {
      fake.markReads.push(q);
      const docs = fake.marks.map((m) => ({ id: m.id, data: () => m }));
      next({ metadata: { fromCache: false }, docs, size: docs.length, docChanges: () => docs });
      return () => {};
    }
    const clientId = q.constraints.find((c: any) => c.field === "clientId")?.value;
    const docs = (fake.sessions[clientId] ?? []).map((s) => ({ id: String(s.id), data: () => s }));
    next({ metadata: { fromCache: false }, docs, size: docs.length, docChanges: () => docs });
    return () => {};
  },
  getDocs: (q: any) =>
    new Promise((resolve, reject) => {
      fake.reads.push({ q, resolve, reject });
    }),
}));

import { ClientHistoryTab } from "./ClientHistoryTab";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const g = globalThis as unknown as Record<string, unknown>;
const stubs = ["ResizeObserver", "IntersectionObserver"].filter((k) => !(k in g));

const ET = "America/New_York";
const at = (day: string, hm: string) => wallClockToInstant(`${day}T${hm}:00`, ET)!;
/* Thursday Sep 24 2026, 10:00 AM Eastern. */
const NOW = at("2026-09-24", "10:00");

const trainers = [{ id: "t1", fullName: "Giovanni Rossi", initials: "GR" }] as Trainer[];
const clientDoc = (id: string) => ({ id, homeStudioId: "solon", firstName: "Helen" }) as unknown as Client;

const session = (clientId: string, date: string) => ({
  id: `${clientId}-${date}`,
  clientId,
  status: "Completed",
  date,
  trainerInitials: "GR",
});

const booking = (id: string, clientId: string, day: string, extra: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  id,
  clientId,
  clientName: "Helen Marsh",
  trainerId: "t1",
  trainerName: "Giovanni Rossi",
  studioId: "solon",
  startTime: at(day, "15:00"),
  endTime: at(day, "15:30"),
  status: "Scheduled",
  serviceName: "Strength 30",
  source: "MindBody",
  createdAt: null,
  ...extra,
});

const answer = (rows: ScheduleEntry[], fromCache = false) => ({
  metadata: { fromCache },
  docs: rows.map(({ id, ...data }) => ({ id, data: () => data })),
});

const scheduleReads = () => fake.reads.filter((r) => r.q.__collection === "schedules");
const readsFor = (clientId: string) =>
  scheduleReads().filter((r) => r.q.constraints.some((c: any) => c.field === "clientId" && c.value === clientId));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function render(clientId: string) {
  if (!host) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => {
    root!.render(
      <StrictMode>
        <ClientHistoryTab clientId={clientId} client={clientDoc(clientId)} machines={[]} trainers={trainers} timeZone={ET} />
      </StrictMode>,
    );
  });
  return host;
}

/** Answer a read and let React draw what it says. */
async function settle(read: Read, snap: unknown) {
  await act(async () => {
    read.resolve(snap);
  });
}

beforeEach(() => {
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
  setActiveTimeZone(ET);
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  fake.sessions = {
    c1: [session("c1", "2026-09-10"), session("c1", "2026-09-17")],
    c2: [session("c2", "2026-08-05")],
  };
  fake.reads = [];
  fake.marks = [];
  fake.markReads = [];
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  for (const k of stubs) delete g[k];
});

const legend = () => host?.querySelector(".hist-legend")?.textContent ?? "";
const cell = (day: string) => host!.querySelector<HTMLElement>(`[data-day="${day}"]`);

describe("ClientHistoryTab — a leader's \"didn't come\" on the calendar (Operations wave 3)", () => {
  it("reads the studio's marks once, over the days drawn, and draws a marked past booking as didn't come", async () => {
    fake.marks = [{ id: "missed", noShow: true, clientId: "c1", day: "2026-09-22", markedBy: { id: "lead", name: "Lead" }, markedAt: null }];
    await render("c1");
    for (const read of readsFor("c1")) await settle(read, answer([booking("missed", "c1", "2026-09-22"), booking("tue", "c1", "2026-09-29")]));
    const markReads = fake.markReads.filter((q) => q.__collection === "studios/solon/bookingMarks");
    expect(markReads.length).toBeGreaterThan(0);
    for (const q of markReads) {
      expect(q.constraints).toEqual([
        { type: "where", field: "day", op: ">=", value: "2026-08-31" },
        { type: "where", field: "day", op: "<=", value: "2026-09-24" },
      ]);
    }
    expect(cell("2026-09-22")?.className).toContain("hist-cell--changed");
    expect(cell("2026-09-22")?.getAttribute("aria-label")).toContain("didn't come");
    expect(legend()).toContain("Didn't come");
    expect(cell("2026-09-29")?.className).toContain("hist-cell--booked");
  });

  it("an unmarked past booking is not drawn, as before", async () => {
    await render("c1");
    for (const read of readsFor("c1")) await settle(read, answer([booking("quiet", "c1", "2026-09-22")]));
    expect(cell("2026-09-22")?.className).not.toContain("hist-cell--changed");
    expect(legend()).not.toContain("Didn't come");
  });
});

describe("ClientHistoryTab — the read of her bookings", () => {
  it("asks for this client's bookings from the Monday before the first month drawn, with no upper bound", async () => {
    await render("c1");
    const reads = readsFor("c1");
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      const c = read.q.constraints;
      // First visit Sep 10: the calendar draws from Tue Sep 1, whose week began Mon Aug 31.
      expect(c).toEqual([
        { type: "where", field: "clientId", op: "==", value: "c1" },
        { type: "where", field: "startTime", op: ">=", value: { __date: at("2026-08-31", "00:00") } },
        { type: "orderBy", field: "startTime", dir: "asc" },
      ]);
    }
    expect(legend()).toContain("Loading bookings");
  });

  it("draws what the answer holds, and does not ask again once it has", async () => {
    await render("c1");
    const rows = [
      booking("tue", "c1", "2026-09-29"),
      booking("gone", "c1", "2026-09-16", { status: "Cancelled", cancelledAt: at("2026-09-15", "09:00") }),
      booking("old-sweep", "c1", "2026-09-08", { status: "Cancelled" }),
    ];
    for (const read of readsFor("c1")) await settle(read, answer(rows));
    const asked = scheduleReads().length;

    expect(cell("2026-09-29")?.className).toContain("hist-cell--booked");
    expect(cell("2026-09-16")?.className).toContain("hist-cell--changed");
    expect(cell("2026-09-08")?.className).not.toContain("hist-cell--changed");
    expect(legend()).toContain("Booked");
    expect(legend()).toContain("Cancelled");
    expect(legend()).not.toContain("Loading bookings");

    await render("c1");
    expect(scheduleReads().length).toBe(asked);
  });

  it("says the bookings did not load when the read fails, and draws none", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render("c1");
    await act(async () => {
      for (const read of readsFor("c1")) read.reject(new Error("unavailable"));
    });
    expect(legend()).toContain("Bookings did not load");
    expect(host!.querySelector(".hist-cell--booked")).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("treats an answer from the offline cache as not loaded", async () => {
    await render("c1");
    for (const read of readsFor("c1")) await settle(read, answer([booking("tue", "c1", "2026-09-29")], true));
    expect(legend()).toContain("Bookings did not load");
    expect(cell("2026-09-29")?.className).not.toContain("hist-cell--booked");
  });

  it("never shows the first client's bookings under the second's name, even when they land last", async () => {
    await render("c1");
    const firstClientReads = readsFor("c1");
    await render("c2");

    // Switched, and the second client's read is on its way: nothing of the first's is drawn.
    expect(host!.querySelector(".hist-cell--booked")).toBeNull();
    expect(legend()).toContain("Loading bookings");
    const secondClientReads = readsFor("c2");
    expect(secondClientReads.length).toBeGreaterThan(0);
    // Her own first visit, Aug 5: from Mon Jul 27, the week of Aug 1.
    expect(secondClientReads[0].q.constraints[1].value).toEqual({ __date: at("2026-07-27", "00:00") });

    for (const read of secondClientReads) await settle(read, answer([booking("fri", "c2", "2026-10-02")]));
    expect(cell("2026-10-02")?.className).toContain("hist-cell--booked");

    // The first client's answer arrives late. It is dropped, not drawn over hers.
    for (const read of firstClientReads) await settle(read, answer([booking("tue", "c1", "2026-09-29")]));
    expect(cell("2026-10-02")?.className).toContain("hist-cell--booked");
    expect(cell("2026-09-29")?.className ?? "").not.toContain("hist-cell--booked");
    expect(legend()).not.toContain("Loading bookings");
  });
});
