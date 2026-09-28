// @vitest-environment jsdom
/**
 * THE OVERVIEW MOUNTS — one studio, over a Firestore that answers with a
 * week of bookings (one cancelled, one done because Journey logged it, one
 * never logged), a renewal cycle, a week of sessions (one with pain on the
 * Dial), an open incident, a critical note and the weekly job's watch
 * document. Catches a hook-order slip, a render that throws on a half-empty
 * answer, a panel whose sentence does not match its rows, and an action
 * button that writes the wrong document. And the rule AJ set on Sep 24 2026:
 * a booking is done when a Journey session was logged for that client that
 * day, and a failed read of the sessions is missing, never "never logged".
 *
 * Openings (Sep 27 2026, phase 7): the week read waits for the server, so a
 * snapshot only this iPad's cache answered says nothing, and the next three
 * days carry Openings' line (a usually-full time with room) with a door to
 * My Studio -> Openings.
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

const NOW = new Date("2026-09-21T13:00:00Z"); // Monday 9 AM Eastern
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const dayKey = (n: number) => daysAgo(n).toISOString().slice(0, 10);
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

const writes: Array<{ op: string; path: string; data?: unknown }> = [];
/**
 * Flip to make the live read of today's sessions fail (the listener's error callback), or to have
 * the week's bookings answered by this iPad's cache alone: `serverLater` then holds each live
 * listener's server answer, delivered when a test says so.
 */
const failures = vi.hoisted(() => ({ liveSessions: false, weekCacheOnly: false, serverLater: [] as Array<() => void> }));

vi.mock("firebase/firestore", () => {
  // doc(db, "a", "b") and doc(collection(db, "a"), "b") both become "a/b".
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
    if (path === "sessions")
      return snap([
        { trainerId: "t1", trainerInitials: "AJ", status: "Completed", date: dayKey(1), hostedAtStudioId: "solon", clientId: "c1", preSessionCheckIn: { bodyStates: [{ region: "Lower back", state: "stiff", dial: -2 }] } },
        { trainerId: "t1", trainerInitials: "AJ", status: "Completed", date: dayKey(0), hostedAtStudioId: "solon", clientId: "c2" },
      ]);
    if (path === "schedules")
      return snap([
        booking("s1", "c1", "Ann Able", today, "08:00", "Completed"),
        booking("s2", "c2", "Bea Best", today, "07:30", "Scheduled"), // past its slot — and Journey logged Bea today: done
        booking("s7", "c4", "Dee Dunn", today, "07:00", "Scheduled"), // past its slot, nothing logged
        booking("s3", "c1", "Ann Able", today, "14:00", "Scheduled"),
        booking("s4", "c3", "Cy Cole", today, "09:30", "Cancelled", { cancelledAt: eastern(today, "07:12"), cancelSource: "sweep" }),
        booking("s5", "c1", "Ann Able", tomorrow, "10:00", "Scheduled"),
        booking("s6", "c2", "Bea Best", wednesday, "10:00", "Scheduled"),
      ]);
    if (path === "clinicalIncidents")
      return snap([{ id: "i1", clientId: "c2", studioId: "solon", region: "Shoulder", severity: "moderate", description: "pinch on the press", reportedByTrainerId: "t1", createdAt: daysAgo(2).toISOString() }]);
    if (path === "journalEntries")
      return snap([{ id: "j1", clientId: "c1", studioId: "solon", importance: "critical", body: "Post-op: no overhead work until cleared.", occurredAt: daysAgo(10).toISOString(), effectiveUntil: eastern(dayKey(-20), "23:59"), resolvedAt: null, isArchived: false }]);
    // Openings: AJ usually takes clients on Tuesdays 10:00 to 11:00 (agreed), and 10:30 on a
    // Tuesday is marked Always full. Ann is booked at 10:00 tomorrow; nobody at 10:30.
    if (path === "studios/solon/standingWeeks")
      return snap([{ id: "t1", studioId: "solon", trainerUid: "t1", trainerId: "t1", trainerName: "AJ Jurgens", final: { hours: [{ weekday: 2, from: "10:00", to: "11:00" }], regulars: [] }, finalAt: daysAgo(30) }]);
    if (path === "studios/solon/openingsMarks") return snap([{ id: "2-1030", weekday: 2, time: "10:30", mark: "full", note: "", by: { id: "lead", name: "Lee Leader" }, at: daysAgo(3) }]);
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
  proof: {},
  coachIds: [],
  dataGaps: [],
  ...extra,
});
const clients = [
  { id: "c1", firstName: "Ann", lastName: "Able", isActive: true, renewal: snapshot({ conversationDue: true, sessionsLeft: 6, focusDate: "2026-10-10" }) },
  { id: "c2", firstName: "Bea", lastName: "Best", isActive: true, renewal: snapshot({ lastVisitDate: dayKey(16), nextBookingDate: null, flags: [{ code: "no-future-booking", text: "Nothing booked in the next 14 days." }] }) },
  { id: "c3", firstName: "Cy", lastName: "Cole", isActive: true, renewal: snapshot({}) },
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
  failures.serverLater.length = 0;
  localStorage.clear();
  vi.useRealTimers();
});

async function mount(onOpen: (t: string) => void = () => {}, extra: { studio?: Studio; onOpenMyStudio?: () => void } = {}) {
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
          clients={clients}
          schedules={[]}
          activeStudioId="solon"
          onOpen={(t) => onOpen(t)}
          onOpenMyStudio={extra.onOpenMyStudio}
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

describe("the Overview", () => {
  it("leads with today, counts what needs you, and answers every panel with a sentence and its rows", async () => {
    const opened: string[] = [];
    const el = await mount((t) => opened.push(t));
    const text = el.textContent ?? "";

    // Today: four live bookings (the cancelled one is a change, not a booking). Two done —
    // Ann's marked in Mindbody, Bea's because Journey logged a session for her today —
    // and Dee's never logged. Mindbody never sends "Completed"; Journey's session is the proof.
    expect(text).toContain("Booked today4");
    expect(text).toContain("Done2");
    expect(text).toContain("Never logged1");
    expect(text).toContain("tap to see who to chase");

    // Needs you counts every action waiting.
    expect(text).toContain("Needs you");
    expect(text).toContain("1session never logged");
    expect(text).toContain("1change today");
    expect(text).toContain("pain and critical notes to acknowledge");

    // Changes today: Cy's cancellation, held against today, noticed by the sweep.
    expect(text).toContain("Cy Cole");
    expect(text).toContain("Cancelled — 9:30 AM with AJ Jurgens.");
    expect(text).toContain("Gone from Mindbody by 7:12 AM.");

    // The next three days start tomorrow and count Bea's live note on Wednesday.
    expect(text).toContain("Tomorrow");
    expect(text).toContain("with a live note: Bea Best");

    // Renewals: Ann is due a conversation, nobody has talked to her.
    expect(text).toContain("1 to talk to now");
    expect(text).toContain("Start the conversation");

    // Attendance: Bea, twice a week, last seen 16 days ago.
    expect(text).toContain("No visit in 16 days — they usually come every 4 days.");

    // Pain: Bea's open incident and Ann's critical note plus her pain on the Dial.
    expect(text).toContain("1 open incident, 1 critical note mattering today, 1 reporting pain this week");
    expect(text).toContain("Pain on the Dial in the last 7 days: Lower back");

    // Strength: Sunday's read named Bea on the Leg Press.
    expect(text).toContain("Leg Press: down from 10 reps to 5 at 90 lb");

    // Team: a list, not a ranking — and Dee's is the one unlogged session today.
    expect(text).toContain("AJ Jurgens");
    expect(text).toContain("1 of today's sessions still unlogged");
    expect(text).toContain("A list, not a ranking.");

    // A line opens its tab.
    const insights = [...el.querySelectorAll<HTMLButtonElement>(".adm-ov__line--tappable")].find((b) => b.textContent?.includes("Insights"))!;
    await click(insights);
    expect(opened).toEqual(["insights"]);
  });

  it("Acknowledge all writes one acknowledgement per thing, as the signed-in person, and the rows leave", async () => {
    const el = await mount();
    await click(buttonByText(el, "Acknowledge all"));
    const acks = writes.filter((w) => w.path.startsWith("studios/solon/acknowledgements/"));
    expect(acks.map((w) => w.path).sort()).toEqual(["studios/solon/acknowledgements/incident:i1", "studios/solon/acknowledgements/note:j1", `studios/solon/acknowledgements/pain:c1:${dayKey(1)}`]);
    expect(acks.every((w) => (w.data as { acknowledgedBy: string }).acknowledgedBy === "lead")).toBe(true);
  });

  it("Snooze offers the four choices and writes the watchlist; the chase list opens from the tile", async () => {
    const el = await mount();
    await click(buttonByText(el, "Snooze"));
    expect(el.textContent).toContain("Remind me again in");
    await click(buttonByText(el, "1 week"));
    const watch = writes.find((w) => w.path === "studios/solon/watchlist/c2");
    expect(watch).toBeTruthy();
    expect((watch!.data as { snoozedUntil: string }).snoozedUntil).toBe(dayKey(-7));

    await click(buttonByText(el, "Never logged"));
    // Dee is chased; Bea is not — her session is logged.
    expect(el.textContent).toContain("7:00 AM with AJ Jurgens — past its slot, nothing logged.");
    expect(el.textContent).not.toContain("7:30 AM with AJ Jurgens — past its slot");
  });

  it("when today's sessions cannot be read, what was done and never logged are missing — not zero, not a chase", async () => {
    failures.liveSessions = true;
    // handleFirestoreError says so out loud; jsdom has no alert to say it with.
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const el = await mount();
    expect(alert).toHaveBeenCalled();
    alert.mockRestore();
    const text = el.textContent ?? "";
    expect(text).toContain("Done—");
    expect(text).toContain("Never logged—");
    expect(text).toContain("Today's Journey sessions could not be read just now");
    expect(text).toContain("today's logging could not be read");
    expect(text).not.toMatch(/\dsessions? never logged/);
    expect(text).not.toContain("Unlogged today");
    // The tile is not a door to a list nobody can know.
    expect(buttonByText(el, "Never logged")).toBeUndefined();
  });

  it("opens the week's changes and the attendance watch, and comes back", async () => {
    const el = await mount();
    await click(buttonByText(el, "The week"));
    expect(el.textContent).toContain("Solon — Changes");
    expect(el.textContent).toContain("1 cancelled outright");
    await click(buttonByText(el, "Overview"));
    await click(buttonByText(el, "The whole list"));
    expect(el.textContent).toContain("Solon — Attendance watch");
    expect(el.textContent).toContain("To look at1");
    await click(buttonByText(el, "Overview"));
    expect(el.textContent).toContain("Solon — Overview");
  });

  it("the next three days carry Openings' line, and its door opens Openings in trainer mode", async () => {
    rememberOpeningsPart("usual");
    rememberWhoseTimes({ kind: "you" });
    rememberMyStudioSection("relay");
    let opened = 0;
    const el = await mount(undefined, { studio: linked, onOpenMyStudio: () => (opened += 1) });
    const group = el.querySelector("[aria-label='Openings in the next three days']");
    expect(group?.textContent).toContain("Tue, Sep 22 · 10:30 AM, marked always full, has room · See it on Openings.");
    // Only usually-full times: today's cancellation at 9:30 is Openings' to list, not the Overview's.
    expect(group?.querySelectorAll(".adm-ov__line")).toHaveLength(1);
    await click(group!.querySelector<HTMLButtonElement>(".adm-ov__line--tappable") ?? undefined);
    expect(opened).toBe(1);
    // As the Staff & Roles door does for Team: the section first, then the switch to My Studio.
    expect(rememberedMyStudioSection()).toBe("openings");
    expect(rememberedOpeningsPart()).toBe("next");
    expect(rememberedWhoseTimes()).toEqual({ kind: "anyone" });
    rememberMyStudioSection("relay");
    rememberOpeningsPart("usual");
    rememberWhoseTimes(null);
  });

  it("says Openings' line without a door when the shell gives none, and nothing where Mindbody isn't linked", async () => {
    let el = await mount(undefined, { studio: linked });
    const group = el.querySelector("[aria-label='Openings in the next three days']");
    expect(group?.textContent).toContain("Tue, Sep 22 · 10:30 AM, marked always full, has room");
    expect(group?.querySelector(".adm-ov__line--tappable")).toBeNull();
    act(() => root?.unmount());
    host?.remove();
    // The plain studio (no Mindbody site) has no bookings Openings can read: no line at all.
    el = await mount(undefined, { onOpenMyStudio: () => {} });
    expect(el.querySelector("[aria-label='Openings in the next three days']")).toBeNull();
    expect(el.textContent).not.toContain("See it on Openings");
  });

  it("says nothing from the week until the server answers: reading, then could not be read, never zero", async () => {
    failures.weekCacheOnly = true;
    const el = await mount(undefined, { studio: linked, onOpenMyStudio: () => {} });
    // The cache answered with the whole week, and none of it is said.
    let text = el.textContent ?? "";
    expect(text).toContain("Reading the week…");
    expect(text).not.toContain("Booked today4");
    expect(text).not.toContain("Cy Cole");
    expect(text).not.toContain("See it on Openings");
    expect(el.querySelector(".adm-ov__days")).toBeNull();

    // The server keeps it waiting: the week could not be read. Missing, never zero.
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    text = el.textContent ?? "";
    expect(text).toContain("The week's schedule could not be read just now");
    expect(text).toContain("Booked today—");
    expect(text).toContain("Never logged—");
    expect(text).not.toContain("Nothing cancelled or moved for today");
    expect(text).not.toContain("No changes for today.");
    expect(text).not.toMatch(/\d booked over/);
    expect(text).not.toContain("See it on Openings");
    expect(el.querySelector(".adm-ov__days")).toBeNull();

    // The server answers: now the week is said, Openings' line with it.
    await act(async () => {
      for (const deliver of failures.serverLater) deliver();
    });
    text = el.textContent ?? "";
    expect(text).toContain("Booked today4");
    expect(text).toContain("Cy Cole");
    expect(text).not.toContain("could not be read just now");
    expect(el.querySelector("[aria-label='Openings in the next three days']")?.textContent).toContain("Tue, Sep 22 · 10:30 AM, marked always full, has room");
  });

  it("a folded panel keeps its sentence and remembers the fold on this device", async () => {
    const el = await mount();
    await click(el.querySelector<HTMLButtonElement>('button[aria-label="Fold Renewals"]') ?? undefined);
    expect(el.querySelector("#ov-renewals .adm-ov__panel--folded")).toBeTruthy();
    expect(el.textContent).toContain("1 to talk to now");
    expect(el.textContent).not.toContain("Start the conversation");
    expect(JSON.parse(localStorage.getItem("journey.operations.overview.folded") ?? "[]")).toEqual(["renewals"]);
  });
});
