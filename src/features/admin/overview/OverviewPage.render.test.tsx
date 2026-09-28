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
const failures = vi.hoisted(() => ({ liveSessions: false, weekCacheOnly: false, quiet: false, serverLater: [] as Array<() => void> }));

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
  failures.serverLater.length = 0;
  NOW = MONDAY;
  localStorage.clear();
  vi.useRealTimers();
});

async function mount(onOpen: (t: string) => void = () => {}, extra: { studio?: Studio; onOpenMyStudio?: () => void; clients?: Client[]; onNeedsCount?: (n: number | null) => void } = {}) {
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
const bottomLine = (el: HTMLElement) => el.querySelector(".ops-bluf__say")?.textContent ?? "";

describe("Today, the brief", () => {
  it("leads with a bottom line written by rules, then the sections in their fixed order", async () => {
    const counts: Array<number | null> = [];
    const el = await mount(undefined, { onNeedsCount: (n) => counts.push(n) });
    // Two things clear here (Ann's critical note and pain, Bea's incident); Eve is in at 11 with
    // her renewal talk due and Fay trained today with nothing booked; Dee's session is unlogged.
    expect(bottomLine(el)).toBe(
      "Two things need you this morning, and two clients are worth catching in person. One of today's finished sessions has no workout logged yet.",
    );
    expect([...el.querySelectorAll(".ops-sec__t")].map((h) => h.textContent)).toEqual(["Needs you", "Catch today", "Slipping away", "Since yesterday", "Coming up", "Going right", "Worth a look"]);
    // The count reaches the menu's badge.
    expect(counts.at(-1)).toBe(2);
    // The freshness line says when the schedule was read.
    expect(el.querySelector(".ops-fresh__line")?.textContent).toContain("Schedule read");
    // The day's facts: four live bookings, two done (Ann's in Mindbody, Bea's logged in Journey).
    const facts = el.querySelector(".ops-bluf__facts")?.textContent ?? "";
    expect(facts).toContain("4 booked");
    expect(facts).toContain("2 done");
    // The rules are one tap away.
    await click(buttonByText(el, "How this line is written"));
    expect(el.querySelector(".ops-bluf__rules")?.textContent).toContain("Needs you: 2 rows you can clear on this page");
  });

  it("Needs you holds only what clears here, and Acknowledge all writes one acknowledgement per thing as the signed-in person", async () => {
    const el = await mount();
    const needs = section(el, "needs");
    expect(needs.textContent).toContain("Ann Able");
    expect(needs.textContent).toContain("Bea Best");
    // Dee's unlogged session is a door under the bottom line, never a Needs-you row.
    expect(needs.textContent).not.toContain("Dee Dunn");
    await click(buttonByText(el, "See who to ask"));
    expect(el.querySelector(".ops-bluf__chase")?.textContent).toContain("7:00 AM with AJ Jurgens — past its slot, nothing logged.");
    // Bea's session is logged: she is not chased.
    expect(el.querySelector(".ops-bluf__chase")?.textContent).not.toContain("7:30 AM with AJ Jurgens");

    await click(buttonByText(el, "Acknowledge all"));
    const acks = writes.filter((w) => w.path.startsWith("studios/solon/acknowledgements/"));
    expect(acks.map((w) => w.path).sort()).toEqual(["studios/solon/acknowledgements/incident:i1", "studios/solon/acknowledgements/note:j1", `studios/solon/acknowledgements/pain:c1:${dayKey(1)}`]);
    expect(acks.every((w) => (w.data as { acknowledgedBy: string }).acknowledgedBy === "lead")).toBe(true);
  });

  it("Catch today names who is in with a reason, in the order they're in, and who trained with nothing booked", async () => {
    const el = await mount();
    const catchSec = section(el, "catch");
    expect(catchSec.textContent).toContain("Eve Eames");
    expect(catchSec.textContent).toContain("In at 11:00 AM with AJ.");
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
    expect(slipping).toContain("She usually trains every 3–4 days. It has been 10 days, and nothing is booked.");
    expect(slipping).toContain("1 drifting · 0 at risk · 1 booked again after a gap");
    expect(slipping).not.toContain("Bea Best");
    await click(buttonByText(section(el, "slipping"), "Snooze"));
    expect(el.textContent).toContain("Remind me again in");
    await click(buttonByText(el, "1 week"));
    const watch = writes.find((w) => w.path === "studios/solon/watchlist/c7");
    expect((watch!.data as { snoozedUntil: string }).snoozedUntil).toBe(dayKey(-7));

    const since = section(el, "since").textContent ?? "";
    expect(since).toContain("Cy Cole");
    expect(since).toContain("Held against today.");
    expect(since).toContain("Gone from Mindbody by 7:12 AM.");
  });

  it("Coming up says who has nothing booked only off a nightly record, and names who nobody has talked to", async () => {
    const el = await mount();
    const coming = section(el, "coming").textContent ?? "";
    expect(coming).toContain("Tomorrow");
    expect(coming).toContain("with a live note: Bea Best");
    expect(coming).toContain("1 of 6 active clients with a nightly record have nothing booked ahead.");
    expect(coming).toContain("2 renewal talks due now, 0 before a charge, 2 with no conversation logged yet.");
    // With no nightly record at all, nobody is called booked ahead (the old line said "Everyone active is booked ahead").
    act(() => root?.unmount());
    host?.remove();
    const bare = await mount(undefined, { clients: clients().map((c) => ({ ...c, renewal: undefined })) as Client[] });
    expect(section(bare, "coming").textContent).toContain("no client has a nightly record yet, so nobody is called booked ahead");
    expect(bare.textContent).not.toContain("Everyone active is booked ahead");
  });

  it("when today's sessions cannot be read, what was done is unknown — not zero, not a chase", async () => {
    failures.liveSessions = true;
    // handleFirestoreError says so out loud; jsdom has no alert to say it with.
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const el = await mount();
    alert.mockRestore();
    expect(bottomLine(el)).toContain("Today's logging couldn't be read, so what was done is unknown.");
    expect(el.querySelector(".ops-bluf__facts")?.textContent).toContain("— done");
    expect(buttonByText(el, "See who to ask")).toBeUndefined();
    expect(section(el, "catch").textContent).toContain("who trained today and has nothing booked can't be told yet");
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
    expect(bottomLine(el)).toContain("Today's bookings are still being read.");
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
    expect(bottomLine(el)).toContain("Today's bookings couldn't be read, so the floor is unknown.");
    expect(text).toContain("Today's numbers are missing, not zero");
    expect(section(el, "catch").textContent).toContain("who to catch is unknown");
    expect(section(el, "since").textContent).toContain("Could not be read just now.");
    expect(text).not.toContain("Nothing cancelled or moved since yesterday");
    expect(text).not.toContain("steady");
    expect(el.querySelector(".ops-days")).toBeNull();

    await act(async () => {
      for (const deliver of failures.serverLater) deliver();
    });
    text = el.textContent ?? "";
    expect(text).toContain("4 booked");
    expect(section(el, "since").textContent).toContain("Cy Cole");
    expect(el.querySelector("[aria-label='Openings in the next three days']")?.textContent).toContain("Tue, Sep 22 · 10:30 AM, marked always full, has room");
  });

  it("with nothing else waiting and every read answered, the day looks steady — and says so only then", async () => {
    failures.quiet = true;
    const el = await mount(undefined, { clients: [] });
    // Dee's and Bea's sessions are never logged here (the sessions read is empty): named, not steady.
    expect(bottomLine(el)).toContain("of today's finished sessions have no workout logged yet.");
    expect(bottomLine(el)).not.toContain("steady");
    expect(section(el, "needs").textContent).toContain("Nothing to acknowledge, take or review.");
  });
});
