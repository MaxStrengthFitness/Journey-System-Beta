// @vitest-environment jsdom
/**
 * OPERATIONS → WEEK MOUNTS — the Monday review (a bottom line by rules, day
 * by day, who slipped, the renewals decided, the team in name order, the
 * trust line), this week so far with its changes, and the week ahead (the
 * redesign's Operations room, phase 5).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));

const NOW = new Date("2026-09-28T13:00:00Z"); // Monday Sep 28, 9 AM Eastern
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  const snap = (rows: Array<Record<string, unknown>>) => ({
    docs: rows.map((r, i) => ({ id: String(r.id ?? i), data: () => r, exists: () => true })),
    size: rows.length,
    empty: rows.length === 0,
    forEach: (fn: (d: unknown) => void) => rows.forEach((r, i) => fn({ id: String(r.id ?? i), data: () => r })),
    docChanges: () => [],
    metadata: { fromCache: false },
  });
  const booking = (id: string, clientId: string, day: string, hm: string, extra: Record<string, unknown> = {}) => ({
    id,
    clientId,
    clientName: clientId,
    trainerId: "t1",
    trainerName: "Beregond Guard",
    studioId: "westlake",
    startTime: eastern(day, hm),
    endTime: new Date(eastern(day, hm).getTime() + 30 * 60_000),
    status: "Scheduled",
    ...extra,
  });
  let last = "";
  const answer = (path: string) => {
    if (path === "schedules")
      return snap([
        booking("a", "ann", "2026-09-21", "09:00"),
        booking("b", "bea", "2026-09-21", "10:00"),
        booking("c", "cy", "2026-09-23", "11:00", { status: "Cancelled", cancelledAt: eastern("2026-09-23", "07:00"), cancelSource: "sweep" }),
        booking("d", "dee", "2026-09-29", "10:00"),
        booking("e", "eve", "2026-10-01", "09:00"),
      ]);
    if (path === "sessions") return snap([{ id: "s1", status: "Completed", clientId: "ann", date: "2026-09-21", hostedAtStudioId: "westlake", trainerId: "t1", createdAt: eastern("2026-09-21", "09:40") }]);
    if (path === "studios/westlake/renewals") return snap([{ id: "cyc1", clientName: "Belladonna Took", outcome: "upgraded", closedOn: "2026-09-24", latestConcerns: [] }]);
    return snap([]);
  };
  return {
    collection: ref,
    doc: ref,
    query: (target: { path?: string }) => {
      if (target?.path) last = target.path;
      return target;
    },
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const t = setTimeout(() => next(target.path.split("/").length % 2 === 0 ? { exists: () => false, data: () => undefined, id: "id", metadata: { fromCache: false } } : answer(target.path)), 0);
      return () => clearTimeout(t);
    },
    getDocs: async (target: { path?: string }) => answer(target?.path ?? last),
    getDoc: async (target: { path: string }) =>
      target.path === "studios/westlake/scheduleCoverage/2026-09" ? { exists: () => true, data: () => ({ days: ["2026-09-21", "2026-09-23"] }) } : { exists: () => false, data: () => undefined },
    setDoc: async () => {},
    serverTimestamp: () => new Date(),
  };
});

import { WeekPage, type WeekSub } from "./WeekPage";
import type { Client, Studio, Trainer } from "../../../types";

const studio = { id: "westlake", name: "Westlake", timezone: "America/New_York" } as unknown as Studio;
const lead = { id: "lead", fullName: "Glorfindel Lord", role: "StudioLeader", primaryHomeStudioId: "westlake" } as unknown as Trainer;
const trainers = [lead, { id: "t1", fullName: "Beregond Guard", primaryHomeStudioId: "westlake" }] as unknown as Trainer[];
// Twice a week, last in Sep 18, nothing booked: crossed the drift line on Sep 25, last week.
const gil = {
  id: "gil",
  firstName: "Gil",
  lastName: "Galdor",
  isActive: true,
  homeStudioId: "westlake",
  renewal: { situation: "on-track", pacePerWeek: 2, proof: { weeksObserved: 12 }, flags: [], lastVisitDate: "2026-09-18", nextBookingDate: null, computedAt: new Date("2026-09-28T06:31:00Z"), focusDate: "2027-03-01" },
} as unknown as Client;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

async function mount(sub: WeekSub, onOpen: (to: string) => void = () => {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <WeekPage sub={sub} studio={studio} studios={[studio]} clients={[gil]} trainers={trainers} authTrainer={lead} onOpen={(to) => onOpen(to)} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return host;
}

describe("Week → Last week: the Monday review", () => {
  it("leads with the week's counts, and says how far to trust them only when it must", async () => {
    const el = await mount("last");
    // The calm round (Oct 3 2026): one line of counts in place of the written bottom line.
    const counts = el.querySelector(".ops-counts__line")?.textContent ?? "";
    expect(counts).toContain("2 booked");
    expect(counts).toContain("1 logged");
    expect(counts).toContain("1 cancelled late");
    expect(counts).toContain("1 started slipping");
    expect(counts).toContain("0 back");
    expect(counts).toContain("1 renewal decided");
    expect(el.querySelector(".ops-bluf")).toBeNull();
    const text = el.textContent ?? "";
    expect(text).toContain("Mon · Sep 212 booked1 logged");
    expect(text).toContain("Wed · Sep 230 booked1 cancelled late");
    expect(text).toContain("Started slipping: Gil Galdor");
    expect(text).toContain("Belladonna Took — renewed on a longer package");
    expect(text).toContain("Beregond Guard · 2 booked · 1 not logged");
    // Every day was read in full: no trust note, and no Trust section.
    expect(text).not.toContain("read in full");
    expect(el.querySelector(".ops-note")).toBeNull();
    // The subtitle is the dates, not a sentence.
    expect(el.querySelector(".adm-head__sub")?.textContent).toMatch(/^Mon, \w{3} \d+ – Sun, \w{3} \d+$/);
  });

  it("its doors open the Journey and Renewals", async () => {
    const opened: string[] = [];
    const el = await mount("last", (to) => opened.push(to));
    const button = (label: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim().startsWith(label))!;
    await act(async () => button("Journey").click());
    await act(async () => button("Renewals").click());
    expect(opened).toEqual(["journey", "renewals"]);
  });
});

describe("Week → This week and the week ahead", () => {
  it("says what has finished and what is still to come, with the week's changes", async () => {
    const el = await mount("now");
    const counts = el.querySelector(".ops-counts__line")?.textContent ?? "";
    expect(counts).toContain("0 booked so far");
    expect(counts).toContain("2 to come");
    expect(el.textContent).toContain("Changes");
    // How the list works is behind its (i), not two paragraphs on the page.
    expect(el.textContent).not.toContain("Mindbody doesn't say why a booking went");
  });

  it("names the busiest day and who to catch", async () => {
    const el = await mount("ahead");
    const counts = el.querySelector(".ops-counts__line")?.textContent ?? "";
    expect(counts).toContain("2 booked");
    expect(counts).toContain("1 on Tuesday, the busiest");
    expect(counts).toContain("0 due back");
    expect(counts).toContain("1 to catch");
    expect(el.textContent).toContain("1 client is drifting or at risk, with nothing booked.");
    // Nobody due back: one line at the foot, not a section saying so.
    expect(el.querySelector("#brief-ahead-back")).toBeNull();
    expect(el.querySelector("[data-testid='all-clear']")?.textContent).toContain("Due back");
  });
});
