// @vitest-environment jsdom
/**
 * THE MONDAY PAGE MOUNTS — one studio, over a Firestore that answers with a
 * renewal cycle, a week of sessions (one with pain on the Dial), an open
 * incident, a critical note and the weekly job's watch document. Catches a
 * hook-order slip, a render that throws on a half-empty answer, and a
 * question whose sentence does not match its rows.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));

vi.mock("../../../ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "solon",
    activeStudio: { id: "solon", name: "Solon" },
    availableStudios: [{ id: "solon", name: "Solon" }],
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));

const NOW = new Date("2026-09-21T13:00:00Z"); // Monday 9 AM Eastern
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const dayKey = (n: number) => daysAgo(n).toISOString().slice(0, 10);

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
  const answer = (path: string) => {
    if (path === "sessions")
      return snap([
        { trainerId: "t1", trainerInitials: "AJ", status: "Completed", date: dayKey(1), hostedAtStudioId: "solon", clientId: "c1", preSessionCheckIn: { bodyStates: [{ region: "Lower back", state: "stiff", dial: -2 }] } },
        { trainerId: "t1", trainerInitials: "AJ", status: "Completed", date: dayKey(0), hostedAtStudioId: "solon", clientId: "c2" },
      ]);
    if (path === "clinicalIncidents")
      return snap([{ id: "i1", clientId: "c2", studioId: "solon", region: "Shoulder", severity: "moderate", description: "pinch on the press", reportedByTrainerId: "t1", createdAt: daysAgo(2).toISOString() }]);
    if (path === "journalEntries")
      return snap([{ id: "j1", clientId: "c1", studioId: "solon", importance: "critical", body: "Post-op: no overhead work until cleared.", occurredAt: daysAgo(10).toISOString(), effectiveUntil: dayKey(-20), resolvedAt: null, isArchived: false }]);
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
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const t = setTimeout(() => next(target.path.split("/").length % 2 === 0 ? { exists: () => false, data: () => undefined, id: "id" } : answer(target.path)), 0);
      return () => clearTimeout(t);
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
    setDoc: async () => {},
    serverTimestamp: () => new Date(),
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
  };
});

import { MondayPage } from "./MondayPage";
import type { Client, Machine, Studio, Trainer } from "../../../types";

const studio = { id: "solon", name: "Solon", timezone: "America/New_York", sessionMinutes: 30 } as unknown as Studio;
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
] as unknown as Client[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe("the Monday page", () => {
  it("answers the four questions with sentences, rows and the proof, and draws the four lines", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    const opened: string[] = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <StrictMode>
          <MondayPage
            authTrainer={lead}
            studios={[studio]}
            trainers={trainers}
            machines={machines}
            clients={clients}
            schedules={[]}
            activeStudioId="solon"
            onOpen={(t) => opened.push(t)}
          />
        </StrictMode>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const text = host.textContent ?? "";

    // 1. Renewals: Ann is due a conversation, nobody has talked to her.
    expect(text).toContain("1 to talk to now");
    expect(text).toContain("Ann Able");
    expect(text).toContain("Start the conversation");

    // 2. Attendance: Bea, twice a week, last seen 16 days ago.
    expect(text).toContain("No visit in 16 days — they usually come every 4 days.");
    expect(text).toContain("Nothing booked ahead.");

    // 3. Performance: Sunday's read named Bea on the Leg Press.
    expect(text).toContain("1 client dropped by a third or more");
    expect(text).toContain("Leg Press: down from 10 reps to 5 at 90 lb");

    // 4. Pain: Bea's open incident and Ann's critical note plus her pain on the Dial.
    expect(text).toContain("1 open incident, 1 critical note still live, 1 client reporting pain");
    expect(text).toContain("Incident on");
    expect(text).toContain("Critical note");
    expect(text).toContain("Pain on the Dial in the last 7 days: Lower back");

    // The lines.
    expect(text).toContain("0 gestures due this week");
    // Sunday's session was last week; Monday's is this week's only one.
    expect(text).toContain("0.5 h this week so far, over 1 session by 1 trainer");
    const hours = [...host.querySelectorAll<HTMLButtonElement>(".adm-mon__line--tappable")].find((b) => b.textContent?.includes("Hours"))!;
    await act(async () => {
      hours.click();
    });
    expect(opened).toEqual(["hours"]);
  });
});
