// @vitest-environment jsdom
/**
 * TODAY MOUNTS — the brief for one studio, over a Firestore that answers with
 * a week of bookings (one cancelled this morning, one done because Journey
 * logged it, one never logged, one still to come for a client whose renewal
 * talk is due), a week of sessions (one with pain on the Dial, one from a
 * client who trained today with nothing booked), an open incident, a critical
 * note and the weekly job's watch document.
 *
 * The redesign's Operations room, phase 2 (Sep 28 2026): a bottom line written
 * by rules, Needs you counting only what clears on the page, Catch today from
 * the Hub's engine, the freshness line, and the false-comfort lines fixed. The
 * Openings round's rules still hold here: the week read waits for the server,
 * Openings' line keeps to Coming up's own days, and an unread week is never a
 * zero or an all-clear.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));

vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "solon",
    activeStudio: { id: "solon", name: "Solon" },
    availableStudios: [{ id: "solon", name: "Solon" }],
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));

vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));

const MONDAY = new Date("2026-09-21T13:00:00Z"); // Monday 9 AM Eastern
const SATURDAY = new Date("2026-09-26T13:00:00Z"); // Saturday 9 AM Eastern
/** The test's clock: Monday unless a test moves it. The fixture's days count from it. */
let NOW = MONDAY;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const dayKey = (n: number) => daysAgo(n).toISOString().slice(0, 10);
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

const writes: Array<{ op: string; path: string; data?: unknown }> = [];
/**
 * Flip to make the live read of today's sessions fail, or to have the week's
 * bookings answered by this iPad's cache alone: `serverLater` then holds each
 * live listener's server answer, delivered when a test says so. `quiet`
 * empties the sessions, incidents and notes.
 */
const failures = vi.hoisted(() => ({ liveSessions: false, weekCacheOnly: false, quiet: false, leftOpen: false, serverLater: [] as Array<() => void>, marks: [] as Array<Record<string, unknown>> }));

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
  let lastCollection = "";
  const q = (target: { path?: string }) => {
    if (target?.path) lastCollection = target.path;
    return target;
  };
  // Built at call time, never at factory time: vi.mock factories are hoisted
  // above the constants at the top of the file.
  const booking = (id: string, clientId: string, clientName: string, day: string, hm: string, status: string, extra: Record<string, unknown> = {}) => ({
    id,
    clientId,
    clientName,
    trainerId: "t1",
    trainerName: "AJ Jurgens",
    studioId: "solon",
    startTime: eastern(day, hm),
    endTime: new Date(eastern(day, hm).getTime() + 30 * 60_000),
    status,
    serviceName: "Training Session",
    source: "MindBody",
    ...extra,
  });
  const answer = (path: string) => {
    const today = dayKey(0);
    const tomorrow = dayKey(-1);
    const wednesday = dayKey(-2);
    if (failures.quiet && (path === "sessions" || path === "clinicalIncidents" || path === "journalEntries")) return snap([]);
    if (path === "sessions")
      return snap([
        { trainerId: "t1", trainerInitials: "AJ", status: "Completed", date: dayKey(1), hostedAtStudioId: "solon", clientId: "c1", preSessionCheckIn: { bodyStates: [{ region: "Lower back", state: "stiff", dial: -2 }] } },
        { trainerId: "t1", trainerInitials: "AJ", status: "Completed", date: dayKey(0), hostedAtStudioId: "solon", clientId: "c2" },
        // Fay trained today and has nothing booked: leaving with nothing booked.
        { trainerId: "t1", trainerInitials: "AJ", status: "Completed", date: dayKey(0), hostedAtStudioId: "solon", clientId: "c6" },
        // A session left open since yesterday (Oct 2 2026), only when a test asks.
        ...(failures.leftOpen
          ? [{ id: "open1", trainerId: "t1", trainerInitials: "AJ", status: "In-Progress", date: dayKey(1), hostedAtStudioId: "solon", clientId: "c3", clientName: "Cy Cole", createdAt: daysAgo(1), sessionMachineIds: ["m1", "m2"] }]
          : []),
      ]);
    if (path === "schedules")
      return snap([
        booking("s1", "c1", "Ann Able", today, "08:00", "Completed"),
        booking("s2", "c2", "Bea Best", today, "07:30", "Scheduled"), // past its slot — and Journey logged Bea today: done
        booking("s7", "c4", "Dee Dunn", today, "07:00", "Scheduled"), // past its slot, nothing logged
        booking("s8", "c5", "Eve Eames", today, "11:00", "Scheduled"), // still to come, renewal talk due
        booking("s4", "c3", "Cy Cole", today, "09:30", "Cancelled", { cancelledAt: eastern(today, "07:12"), cancelSource: "sweep" }),
        booking("s5", "c1", "Ann Able", tomorrow, "10:00", "Scheduled"),
        booking("s6", "c2", "Bea Best", wednesday, "10:00", "Scheduled"),
      ]);
    if (path === "clinicalIncidents")
      return snap([{ id: "i1", clientId: "c2", studioId: "solon", region: "Shoulder", severity: "moderate", description: "pinch on the press", reportedByTrainerId: "t1", createdAt: daysAgo(2).toISOString() }]);
    if (path === "journalEntries")
      return snap([{ id: "j1", clientId: "c1", studioId: "solon", importance: "critical", body: "Post-op: no overhead work until cleared.", occurredAt: daysAgo(10).toISOString(), effectiveUntil: eastern(dayKey(-20), "23:59"), resolvedAt: null, isArchived: false }]);
    // Openings: AJ usually takes clients on Tuesdays 10:00 to 11:00 and Saturdays 3:00 to 4:00 PM
    // (agreed), and 10:30 on a Tuesday and 3:00 PM on a Saturday are marked Always full.
    if (path === "studios/solon/standingWeeks")
      return snap([
        {
          id: "t1",
          studioId: "solon",
          trainerUid: "t1",
          trainerId: "t1",
          trainerName: "AJ Jurgens",
          final: { hours: [{ weekday: 2, from: "10:00", to: "11:00" }, { weekday: 6, from: "15:00", to: "16:00" }], regulars: [] },
          finalAt: daysAgo(30),
        },
      ]);
    // A leader's "didn't come" marks on today's bookings (wave 2).
    if (path === "studios/solon/bookingMarks") return snap(failures.marks);
    if (path === "studios/solon/openingsMarks")
      return snap([
        { id: "2-1030", weekday: 2, time: "10:30", mark: "full", note: "", by: { id: "lead", name: "Lee Leader" }, at: daysAgo(3) },
        { id: "6-1500", weekday: 6, time: "15:00", mark: "full", note: "", by: { id: "lead", name: "Lee Leader" }, at: daysAgo(3) },
      ]);
    return snap([]);
  };
  return {
    collection: ref,
    collectionGroup: ref,
    doc: ref,
    query: q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    documentId: () => "__name__",
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown, c?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const fail = (typeof a === "function" ? b : c) as ((e: unknown) => void) | undefined;
      let live = true;
      const t = setTimeout(() => {
        if (target.path === "sessions" && failures.liveSessions) fail?.(new Error("permission-denied"));
        else if (target.path === "schedules" && failures.weekCacheOnly) {
          next({ ...answer(target.path), metadata: { fromCache: true } });
          failures.serverLater.push(() => {
            if (live) next(answer(target.path));
          });
        } else next(target.path.split("/").length % 2 === 0 ? { exists: () => false, data: () => undefined, id: "id" } : answer(target.path));
      }, 0);
      return () => {
        live = false;
        clearTimeout(t);
      };
    },
    getDocs: async (target: { path?: string }) => answer(target?.path ?? lastCollection),
    getDoc: async (target: { path: string }) =>
      target.path === "studios/solon/watch/performance"
        ? {
            exists: () => true,
            data: () => ({
              version: 1,
              studioId: "solon",
              builtAt: "2026-09-20T07:00:00.000Z",
              windowStart: "2026-06-22",
              windowEnd: "2026-09-20",
              rows: [{ clientId: "c2", machineId: "m-leg-press", weight: 90, reps: 5, medianReps: 10, priorSets: 5, day: dayKey(3), drop: 0.5 }],
              clients: 1,
            }),
          }
        : { exists: () => false, data: () => undefined },
    updateDoc: async () => {},
    setDoc: async (target: { path: string }, data: unknown) => {
      writes.push({ op: "set", path: target.path, data });
    },
    deleteDoc: async (target: { path: string }) => {
      writes.push({ op: "delete", path: target.path });
    },
    writeBatch: () => ({
      set: (target: { path: string }, data: unknown) => writes.push({ op: "set", path: target.path, data }),
      update: (target: { path: string }, data: unknown) => writes.push({ op: "update", path: target.path, data }),
      delete: (target: { path: string }) => writes.push({ op: "delete", path: target.path }),
      commit: async () => {},
    }),
    serverTimestamp: () => new Date(),
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
  };
});

import { OverviewPage } from "./OverviewPage";
import type { Client, Machine, Studio, Trainer } from "../../../types";
import { rememberMyStudioSection, rememberedMyStudioSection } from "../../my-studio/section-memory";
import { rememberOpeningsPart, rememberWhoseTimes, rememberedOpeningsPart, rememberedWhoseTimes } from "../../openings/ui/part-memory";

const studio = { id: "solon", name: "Solon", timezone: "America/New_York", sessionMinutes: 30 } as unknown as Studio;
/** Solon with its Mindbody linked, so Openings reads its bookings, its summary and its marks. */
const linked = { ...studio, mindbodySiteId: "5746957" } as unknown as Studio;
const lead = { id: "lead", fullName: "Lee Leader", initials: "LL", role: "HeadTrainer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;
const trainers = [lead, { id: "t1", fullName: "AJ Jurgens", initials: "AJ", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] }] as unknown as Trainer[];
const machines = [{ id: "m-leg-press", name: "Leg Press" }] as unknown as Machine[];
const snapshot = (extra: Record<string, unknown>) => ({
  version: 1,
  cycleKey: null,
  renewalOnBooks: null,
  situation: "on-track",
  conversationDue: false,
  chargeWarning: false,
  focusDate: "2027-01-05",
  flags: [],
  pacePerWeek: 2,
  lastVisitDate: dayKey(1),
  nextBookingDate: dayKey(-2),
  sessionsLeft: 40,
  proof: { weeksObserved: 12, weeksAttended: 12 },
  coachIds: [],
  dataGaps: [],
  primaryTrainerId: "t1",
  // Written by last night's job: the studio's nightly record is fresh.
  computedAt: daysAgo(0),
  ...extra,
});
const clients = () =>
  [
    { id: "c1", firstName: "Ann", lastName: "Able", isActive: true, homeStudioId: "solon", renewal: snapshot({ conversationDue: true, sessionsLeft: 6, focusDate: "2026-10-10" }) },
    // Sixteen days out, and booked again on Wednesday: Back.
    { id: "c2", firstName: "Bea", lastName: "Best", isActive: true, homeStudioId: "solon", renewal: snapshot({ lastVisitDate: dayKey(16), nextBookingDate: null, flags: [{ code: "no-future-booking", text: "Nothing booked in the next 14 days." }] }) },
    { id: "c3", firstName: "Cy", lastName: "Cole", isActive: true, homeStudioId: "solon", renewal: snapshot({}) },
    { id: "c5", firstName: "Eve", lastName: "Eames", isActive: true, homeStudioId: "solon", renewal: snapshot({ conversationDue: true, sessionsLeft: 5, focusDate: "2026-10-08" }) },
    { id: "c6", firstName: "Fay", lastName: "Fern", isActive: true, homeStudioId: "solon", renewal: snapshot({ nextBookingDate: null }) },
    // Twice a week, ten days out, nothing booked: Drifting.
    { id: "c7", firstName: "Gil", lastName: "Galdor", isActive: true, homeStudioId: "solon", renewal: snapshot({ lastVisitDate: dayKey(10), nextBookingDate: null }) },
  ] as unknown as Client[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  writes.length = 0;
  failures.liveSessions = false;
  failures.weekCacheOnly = false;
  failures.quiet = false;
  failures.leftOpen = false;
  failures.serverLater.length = 0;
  failures.marks = [];
  NOW = MONDAY;
  localStorage.clear();
  vi.useRealTimers();
});

async function mount(onOpen: (t: string) => void = () => {}, extra: { studio?: Studio; onOpenMyStudio?: () => void; clients?: Client[]; onNeedsCount?: (n: number | null) => void; onOpenSession?: (id: string) => void } = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <OverviewPage
          authTrainer={lead}
          studios={[extra.studio ?? studio]}
          trainers={trainers}
          machines={machines}
          clients={extra.clients ?? clients()}
          schedules={[]}
          activeStudioId="solon"
          onOpen={(t) => onOpen(t)}
          onOpenMyStudio={extra.onOpenMyStudio}
          onNeedsCount={extra.onNeedsCount}
          onOpenSession={extra.onOpenSession}
        />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return host;
}

const buttonByText = (rootEl: ParentNode, text: string) => [...rootEl.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim().startsWith(text));
const click = async (el: HTMLElement | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
};
const section = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`#brief-${id}`)!;
const countsLine = (el: HTMLElement) => el.querySelector(".ops-counts__line")?.textContent ?? "";
const allClear = (el: HTMLElement) => el.querySelector("[data-testid='all-clear']")?.textContent ?? "";
/** A row's (i): how to clear it and where it came from, on a tap (the calm round). */
const why = (rootEl: ParentNode, name: string) => rootEl.querySelector<HTMLButtonElement>(`button[aria-label='Why: ${name}']`) ?? undefined;

describe("Today, the brief", () => {
  it("leads with the day's counts, then the sections in their fixed order, and folds the empty ones into one line", async () => {
    const counts: Array<number | null> = [];
    const el = await mount(undefined, { onNeedsCount: (n) => counts.push(n) });
    // The calm round (Oct 3 2026): one line of counts in place of the written bottom line.
    // Four live bookings, two logged (Ann's in Mindbody, Bea's logged in Journey).
    expect(countsLine(el)).toContain("4 booked");
    expect(countsLine(el)).toContain("2 logged");
    expect(el.querySelector(".ops-bluf")).toBeNull();
    // Only the sections with something in them; the order never changes.
    expect([...el.querySelectorAll(".ops-sec__t")].map((h) => h.textContent)).toEqual(["Needs you", "Catch today", "Slipping away", "Since yesterday", "Coming up", "Worth a look"]);
    // Going right has nothing this week: one line at the foot, not a section saying "No milestones, dates or gestures".
    expect(allClear(el)).toBe("All clear: Going right");
    expect(el.textContent).not.toContain("No milestones");
    // Worth a look says only the signal it has (Bea's drop), not four lines of "nobody".
    expect(section(el, "look").textContent).toContain("Strength dropped");
    expect(section(el, "look").textContent).not.toContain("Machine fit");
    // No captions under the headings.
    expect(el.querySelector(".ops-sec__sub")).toBeNull();
    // Three things clear here (Ann's critical note and pain, Bea's incident, Dee's unlogged session); the count reaches the menu's badge.
    expect(counts.at(-1)).toBe(3);
    // The rules, and when the schedule was read, are one tap away.
    await click(el.querySelector<HTMLButtonElement>("button[aria-label='How these are counted']") ?? undefined);
    expect(el.querySelector(".ops-counts__rules")?.textContent).toContain("Bookings as Mindbody last sent them, read");
    // The nightly record is fresh and every client placed: no note.
    expect(el.querySelector(".ops-note")).toBeNull();
  });

  it("Start huddle opens the morning's agenda from the brief's own lines, and writes nothing", async () => {
    const el = await mount();
    const before = writes.length;
    await click(buttonByText(el, "Start huddle"));
    const huddle = document.querySelector<HTMLElement>("[data-testid='huddle']");
    expect(huddle).not.toBeNull();
    const item = (n: number) => huddle!.querySelectorAll(".ops-huddle__i")[n]?.textContent ?? "";
    // The first thing Needs you is waiting on, and who is back.
    expect(item(0)).toMatch(/Concern(Ann Able|Bea Best): /);
    expect(item(0)).toContain("WinBea Best is booked again after a gap.");
    // Who to catch, in the order they're in, and whose usual trainer may know why.
    expect(item(1)).toContain("11:00 AMEve Eames: Renewal: 5 left. Talk about it today?");
    expect(item(1)).toContain("Nothing bookedFay Fern: Trained today, and has nothing booked in the next 7 days.");
    expect(item(1)).toContain("AskAJ may know why Gil Galdor hasn't been in.");
    // The floor: the session nobody logged.
    expect(item(2)).toContain("AJ Jurgens: Dee Dunn's 7:00 AM session has no workout logged yet.");
    expect(item(3)).toContain("Bea Best is booked again after a gap, usually with AJ.");
    expect(item(4)).toContain("None showing in the bell.");
    const end = [...huddle!.querySelectorAll("button")].find((b) => b.textContent?.includes("End huddle"));
    await click(end);
    expect(document.querySelector("[data-testid='huddle']")).toBeNull();
    expect(writes.length).toBe(before);
  });

  it("Needs you holds only what clears here, and Acknowledge all writes one acknowledgement per thing as the signed-in person", async () => {
    const el = await mount();
    const needs = section(el, "needs");
    expect(needs.textContent).toContain("Ann Able");
    expect(needs.textContent).toContain("Bea Best");
    // Dee's unlogged session is a Needs-you row a leader clears with "Late cancel" (wave 2), in ONE row for her trainer (the calm round).
    expect(needs.textContent).toContain("AJ Jurgens");
    expect(needs.textContent).toContain("1 not logged: Dee Dunn");
    expect(buttonByText(needs, "Late cancel · session taken")).toBeUndefined();
    // How to clear it is on the row's (i), printed once, not on every session.
    expect(needs.textContent).not.toContain("Ask on the floor");
    await click(why(needs, "AJ Jurgens"));
    expect(needs.textContent).toContain("Ask on the floor");
    await click(buttonByText(needs, "Show"));
    expect(needs.textContent).toContain("7:00 AM");
    // Bea's session is logged: she is not chased.
    expect(needs.textContent).not.toContain("7:30 AM");
    await click(buttonByText(needs, "Late cancel · session taken"));
    const mark = writes.find((w) => w.path === "studios/solon/bookingMarks/s7");
    expect(mark?.op).toBe("set");
    expect(mark?.data).toMatchObject({ noShow: true, clientId: "c4", day: dayKey(0), markedBy: { id: "lead", name: "Lee Leader" } });

    await click(buttonByText(el, "Acknowledge all"));
    const acks = writes.filter((w) => w.path.startsWith("studios/solon/acknowledgements/"));
    expect(acks.map((w) => w.path).sort()).toEqual(["studios/solon/acknowledgements/incident:i1", "studios/solon/acknowledgements/note:j1", `studios/solon/acknowledgements/pain:c1:${dayKey(1)}`]);
    expect(acks.every((w) => (w.data as { acknowledgedBy: string }).acknowledgedBy === "lead")).toBe(true);
  });

  it("Needs you lists a session left open, by the Hub's rule, with a door to finish it (the Atlas answers, Oct 2 2026)", async () => {
    failures.leftOpen = true;
    const opened: string[] = [];
    const el = await mount(() => {}, { onOpenSession: (id) => opened.push(id) });
    const needs = section(el, "needs");
    expect(needs.textContent).toContain("Cy Cole");
    expect(needs.textContent).toContain("A session was left open \u2014 Started by AJ");
    expect(needs.textContent).toContain("2 machines logged");
    await click(buttonByText(needs, "Open the session"));
    expect(opened).toEqual(["c3"]);
  });

  it("Catch today names who is in with a reason, in the order they're in, and who trained with nothing booked", async () => {
    const el = await mount();
    const catchSec = section(el, "catch");
    expect(catchSec.textContent).toContain("Eve Eames");
    expect(catchSec.textContent).toContain("In at 11:00 AM with AJ.");
    // Why she is worth catching is on her row's (i).
    expect(catchSec.textContent).not.toContain("Renewal: 5 left. Talk about it today?");
    await click(why(catchSec, "Eve Eames"));
    expect(catchSec.textContent).toContain("Renewal: 5 left. Talk about it today?");
    expect(catchSec.textContent).toContain("Fay Fern");
    expect(catchSec.textContent).toContain("Trained today, and has nothing booked in the next 7 days.");
    // Bea trained today too, and is booked Wednesday.
    expect(catchSec.textContent).not.toContain("Bea Best");
  });

  it("Slipping away is the Journey's rule, snoozes through the watchlist; Since yesterday holds this morning's cancellation against today", async () => {
    const el = await mount();
    const slipping = section(el, "slipping").textContent ?? "";
    // Gil: twice a week, ten days out, nothing booked. Bea booked again on Wednesday: Back, not slipping.
    expect(slipping).toContain("Gil Galdor");
    expect(slipping).toContain("Usually trains every 3–4 days. It has been 10 days, and nothing is booked.");
    expect(slipping).not.toContain("Bea Best");
    await click(buttonByText(section(el, "slipping"), "Snooze"));
    expect(el.textContent).toContain("Remind me again in");
    await click(buttonByText(el, "1 week"));
    const watch = writes.find((w) => w.path === "studios/solon/watchlist/c7");
    expect((watch!.data as { snoozedUntil: string }).snoozedUntil).toBe(dayKey(-7));

    const sinceSec = section(el, "since");
    expect(sinceSec.textContent).toContain("Cy Cole");
    expect(sinceSec.textContent).not.toContain("Held against today.");
    await click(why(sinceSec, "Cy Cole"));
    expect(sinceSec.textContent).toContain("Held against today.");
    expect(sinceSec.textContent).toContain("Gone from Mindbody by 7:12 AM.");
  });

  it("Coming up says who has nothing booked only off a nightly record, and names who nobody has talked to", async () => {
    const el = await mount();
    const coming = section(el, "coming").textContent ?? "";
    expect(coming).toContain("Tomorrow");
    expect(coming).toContain("with a live note: Bea Best");
    // A day's zero facts are not said ("no moments", "nobody with a live note").
    expect(coming).not.toContain("no moments");
    expect(coming).not.toContain("nobody with a live note");
    expect(coming).toContain("Not booked");
    expect(coming).toContain("2 renewal talks due now, 0 before a charge, 2 with no conversation logged yet");
    // With no nightly record at all, nobody is called booked ahead, and the page says why ONCE, at the top.
    act(() => root?.unmount());
    host?.remove();
    const bare = await mount(undefined, { clients: clients().map((c) => ({ ...c, renewal: undefined })) as Client[] });
    expect(section(bare, "coming").textContent).not.toContain("Not booked");
    expect(bare.querySelector(".ops-note")?.textContent).toContain("Solon isn't live in Journey yet. Rhythm, MIA and renewals start after its first nightly run.");
    expect(bare.querySelectorAll(".ops-note")).toHaveLength(1);
    // Slipping away is the note's to explain: neither a section of its own nor "all clear".
    expect(section(bare, "slipping")).toBeNull();
    expect(allClear(bare)).not.toContain("Slipping away");
    expect(bare.textContent).not.toContain("nightly record yet, so nobody");
  });

  it("when today's sessions cannot be read, what was done is unknown — not zero, not a chase", async () => {
    failures.liveSessions = true;
    // handleFirestoreError says so out loud; jsdom has no alert to say it with.
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const el = await mount();
    alert.mockRestore();
    expect(countsLine(el)).toContain("— logged");
    expect(el.textContent).not.toContain("not logged:");
    expect(section(el, "catch").textContent).toContain("who trained with nothing booked can't be told yet");
  });

  it("its doors open the pages each section summarises: the Journey, the week's changes, Renewals", async () => {
    const opened: string[] = [];
    const el = await mount((t) => opened.push(t));
    await click(buttonByText(section(el, "slipping"), "Journey"));
    await click(buttonByText(section(el, "since"), "All changes"));
    await click(buttonByText(section(el, "coming"), "Renewals"));
    expect(opened).toEqual(["journey", "week", "renewals"]);
  });

  it("Coming up carries Openings' line, and its door opens Openings in trainer mode", async () => {
    rememberOpeningsPart("usual");
    rememberWhoseTimes({ kind: "you" });
    rememberMyStudioSection("relay");
    let opened = 0;
    const el = await mount(undefined, { studio: linked, onOpenMyStudio: () => (opened += 1) });
    const group = el.querySelector("[aria-label='Openings in the next three days']");
    expect(group?.textContent).toContain("Tue, Sep 22 · 10:30 AM, marked always full, has room · See it on Openings.");
    expect(group?.querySelectorAll(".adm-ov__line")).toHaveLength(1);
    await click(group!.querySelector<HTMLButtonElement>(".adm-ov__line--tappable") ?? undefined);
    expect(opened).toBe(1);
    expect(rememberedMyStudioSection()).toBe("openings");
    expect(rememberedOpeningsPart()).toBe("next");
    expect(rememberedWhoseTimes()).toEqual({ kind: "anyone" });
    rememberMyStudioSection("relay");
    rememberOpeningsPart("usual");
    rememberWhoseTimes(null);
  });

  it("keeps Openings' line to Coming up's own days: on a Saturday, never later today, and the panel's third day too", async () => {
    NOW = SATURDAY;
    const el = await mount(undefined, { studio: linked, onOpenMyStudio: () => {} });
    const labels = [...el.querySelectorAll(".ops-day__label")].map((d) => d.textContent ?? "");
    expect(labels.map((l) => l.split(" · ")[1])).toEqual(["Sep 27", "Sep 28", "Sep 29"]);
    const group = el.querySelector("[aria-label='Openings in the next three days']");
    expect(group?.textContent).toContain("Tue, Sep 29 · 10:30 AM, marked always full, has room · See it on Openings.");
    expect(el.textContent).not.toContain("Sat, Sep 26 · 3:00 PM");
  });

  it("says nothing from the week until the server answers: reading, then could not be read, never zero", async () => {
    failures.weekCacheOnly = true;
    const el = await mount(undefined, { studio: linked, onOpenMyStudio: () => {} });
    let text = el.textContent ?? "";
    expect(countsLine(el)).toContain("Reading today's bookings…");
    expect(text).not.toContain("4 booked");
    expect(text).not.toContain("Cy Cole");
    expect(text).not.toContain("See it on Openings");
    expect(el.querySelector(".ops-days")).toBeNull();
    // Needs you counts what it can: the pain and notes don't need the week.
    expect(section(el, "needs").textContent).toContain("Ann Able");

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    text = el.textContent ?? "";
    expect(countsLine(el)).toContain("Today's numbers are missing, not zero");
    expect(section(el, "catch").textContent).toContain("Today's bookings couldn't be read just now.");
    expect(section(el, "since").textContent).toContain("Could not be read just now.");
    // An unread week is never "all clear".
    expect(allClear(el)).not.toContain("Since yesterday");
    expect(allClear(el)).not.toContain("Catch today");
    expect(el.querySelector(".ops-days")).toBeNull();

    await act(async () => {
      for (const deliver of failures.serverLater) deliver();
    });
    text = el.textContent ?? "";
    expect(text).toContain("4 booked");
    expect(section(el, "since").textContent).toContain("Cy Cole");
    expect(el.querySelector("[aria-label='Openings in the next three days']")?.textContent).toContain("Tue, Sep 22 · 10:30 AM, marked always full, has room");
  });

  it("with nothing else waiting, the sessions nobody logged are still named — never folded into All clear", async () => {
    failures.quiet = true;
    const el = await mount(undefined, { clients: [] });
    // Dee's and Bea's sessions are never logged here (the sessions read is empty): one row for their trainer.
    const needs = section(el, "needs").textContent ?? "";
    expect(needs).toContain("2 not logged:");
    expect(needs).toContain("Dee Dunn");
    expect(needs).toContain("Bea Best");
    expect(allClear(el)).not.toContain("Needs you");
  });

  it("clears a session a leader marked didn't come, and Take back puts it back", async () => {
    failures.marks = [{ id: "s7", noShow: true, clientId: "c4", day: dayKey(0), markedBy: { id: "lead", name: "Lee Leader" }, markedAt: new Date() }];
    const el = await mount();
    // Off Needs you.
    expect(section(el, "needs").textContent).not.toContain("Dee Dunn");
    expect(section(el, "needs").textContent).not.toContain("not logged");
    // One quiet row under the counts, with who marked it and Take back on Show.
    const marked = el.querySelector<HTMLElement>(".ops-brief > .ops-sec__card")!;
    expect(marked.textContent).toContain("Late cancels marked today: 1");
    expect(marked.textContent).toContain("Dee Dunn");
    await click(buttonByText(marked, "Show"));
    expect(marked.textContent).toContain("7:00 AM with AJ Jurgens");
    await click(why(marked, "Dee Dunn"));
    expect(marked.textContent).toContain("Marked by Lee Leader.");
    await click(buttonByText(marked, "Take back"));
    expect(writes.find((w) => w.path === "studios/solon/bookingMarks/s7")?.op).toBe("delete");
  });

  it("keeps a session nobody logged as a door for someone who can't mark it at this studio", async () => {
    act(() => root?.unmount());
    const visitor = { id: "lead", fullName: "Lee Leader", role: "HeadTrainer", primaryHomeStudioId: "elsewhere", accessibleStudioIds: ["elsewhere", "solon"] } as unknown as Trainer;
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<OverviewPage authTrainer={visitor} studios={[studio]} trainers={trainers} machines={machines} clients={clients()} schedules={[]} activeStudioId="solon" onOpen={() => {}} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(section(host, "needs").textContent).not.toContain("Dee Dunn");
    // Its own section, one row for the trainer, to ask from: never a Needs-you count, never a Late cancel button.
    const unlogged = section(host, "unlogged");
    expect(unlogged.textContent).toContain("1 not logged: Dee Dunn");
    await click(buttonByText(unlogged, "Show"));
    expect(unlogged.textContent).toContain("7:00 AM");
    expect(buttonByText(host, "Late cancel · session taken")).toBeUndefined();
  });
});
