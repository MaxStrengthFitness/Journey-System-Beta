/**
 * THE MACHINE MENU — the made-up client the tests read (test-only).
 *
 * "Avery Lindqvist" and the Leg Press series are the design round's
 * prototype data (harness/machine-menu/design/spec.md, section J): invented
 * for the mockup and kept here so the tests can check the very numbers the
 * design page promised ("24 times in the sessions loaded here", "Weight by
 * weight (14)"). Nothing in the app imports this file.
 *
 * Today is Sun Oct 4 2026. Journey numbers every session; Leg Press was done
 * at every other session, so the sessions between are visits on other
 * machines, except across the seven-week gap, when there were none.
 */
import type { JournalEntry } from "../../types/journal";
import type { SettingHistoryDoc } from "./setting-history";
import type { TimelineLogInput, TimelineSessionInput } from "./timeline-model";

export const TODAY = "2026-10-04";
export const STUDIO = "westlake";
export const CUTOVER = "2025-09-01";

/** [day, trainer, journey number, outcome, weight, reps, seconds, quality, set-up] */
type Row = [string, string, number, "performed" | "practice" | "skipped", number | null, number | null, number | null, 1 | 2 | 3 | null, "4/3" | "5/3" | "5/2" | ""];

/** The 36 Leg Press columns, oldest first (spec section J's series). */
export const LEG_PRESS: Row[] = [
  ["2025-09-09", "SR", 1, "performed", 84, 8, null, null, "4/3"],
  ["2025-09-18", "SR", 3, "performed", 84, 9, null, 2, "4/3"],
  ["2025-09-29", "AC", 5, "performed", 84, 11, null, 3, "4/3"],
  ["2025-10-08", "SR", 7, "performed", 86, 8, null, 2, "4/3"],
  ["2025-10-17", "TM", 9, "performed", 86, 9, null, null, ""],
  ["2025-10-28", "SR", 11, "performed", 86, 10, null, 2, "4/3"],
  ["2025-11-06", "SR", 13, "performed", 88, 8, null, 2, "4/3"],
  ["2025-11-15", "AC", 15, "performed", 88, 9, null, null, "4/3"],
  ["2025-11-25", "SR", 17, "performed", 88, 9, null, 1, "4/3"],
  ["2025-12-04", "SR", 19, "performed", 88, 11, null, 3, "4/3"],
  ["2025-12-15", "TM", 21, "performed", 90, 8, null, 2, "4/3"],
  ["2025-12-26", "SR", 23, "performed", 90, 9, null, null, "4/3"],
  ["2026-01-03", "AC", 25, "practice", 70, 14, null, null, "4/3"],
  ["2026-01-13", "SR", 27, "performed", 90, 9, null, 2, "5/3"],
  ["2026-01-22", "SR", 29, "performed", 90, 10, null, null, "5/3"],
  ["2026-02-02", "AC", 31, "performed", 92, 8, null, 2, "5/3"],
  ["2026-02-11", "AC", 33, "skipped", null, null, null, null, "5/3"],
  ["2026-02-21", "SR", 35, "performed", 92, 8, null, null, "5/3"],
  ["2026-03-03", "SR", 37, "performed", 92, 10, null, 2, "5/3"],
  ["2026-03-12", "TM", 39, "performed", 94, 8, null, null, "5/3"],
  ["2026-03-23", "SR", 41, "performed", 94, null, 90, null, "5/3"],
  ["2026-04-02", "SR", 43, "performed", 94, 9, null, 2, "5/3"],
  ["2026-04-13", "AC", 45, "performed", 94, 11, null, 3, "5/3"],
  ["2026-04-23", "SR", 47, "performed", 96, 8, null, null, "5/3"],
  ["2026-05-04", "SR", 49, "performed", 96, 9, null, 1, "5/3"],
  ["2026-05-14", "TM", 51, "performed", 96, 10, null, 2, "5/3"],
  ["2026-05-28", "SR", 53, "performed", 98, 8, null, null, "5/3"],
  ["2026-07-16", "SR", 54, "performed", 92, 9, null, 2, "5/3"],
  ["2026-07-23", "AC", 56, "performed", 94, 8, null, null, "5/3"],
  ["2026-07-30", "SR", 58, "performed", 96, 8, null, 1, "5/3"],
  ["2026-08-06", "SR", 60, "performed", 96, 10, null, 2, "5/3"],
  ["2026-08-18", "TM", 62, "performed", 98, 8, null, null, "5/2"],
  ["2026-08-27", "SR", 64, "performed", 98, 10, null, 2, "5/2"],
  ["2026-09-08", "SR", 66, "performed", 100, 8, null, null, "5/2"],
  ["2026-09-17", "AC", 68, "performed", 100, 9, null, 2, "5/2"],
  ["2026-10-01", "SR", 70, "performed", 100, 11, null, 3, "5/2"],
];

const TRAINERS: Record<string, string> = { SR: "Sam Reyes", AC: "Ana Cole", TM: "Theo Marsh" };

/** The set's own write time on the three days the set-up changed the same day. */
const LOGGED_AT: Record<string, string> = {
  "2025-09-09": "2025-09-09T10:05:00-04:00",
  "2026-01-13": "2026-01-13T15:38:00-05:00",
  "2026-08-18": "2026-08-18T10:09:00-04:00",
  // Entered after the session, from the paper chart.
  "2025-10-17": "2025-11-02T12:00:00-05:00",
};

/** Where Leg Press came in the session's own order, on the sessions that recorded one. */
const ORDER: Record<string, [number, number]> = {
  "2026-08-27": [3, 7],
  "2026-09-08": [3, 7],
  "2026-09-17": [4, 7],
  "2026-10-01": [3, 7],
};

export const OTHER_MACHINES = ["chest-press", "pulldown", "leg-curl", "row", "abdominal", "lumbar"];

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

const SETUP: Record<string, Record<string, string>> = {
  "4/3": { seat: "4", backPad: "3", footPlate: "High" },
  "5/3": { seat: "5", backPad: "3", footPlate: "High" },
  "5/2": { seat: "5", backPad: "2", footPlate: "High" },
  "": {},
};

export const LEG_PRESS_FIELDS = [
  { key: "seat", label: "Seat" },
  { key: "backPad", label: "Back pad" },
  { key: "footPlate", label: "Foot plate" },
];

export interface AveryRead {
  sessions: TimelineSessionInput[];
  logs: TimelineLogInput[];
  everythingRead: boolean;
  moreToLoad: boolean;
}

/** Every session Avery has had (#1–#70), oldest first, with its Leg Press set where there was one. */
export function averyAll(): { sessions: (TimelineSessionInput & { id: string; sessionNumber: number })[]; logs: TimelineLogInput[] } {
  const sessions: (TimelineSessionInput & { id: string; sessionNumber: number })[] = [];
  const logs: TimelineLogInput[] = [];
  LEG_PRESS.forEach(([day, tr, n, outcome, w, reps, secs, q, setup], i) => {
    if (i > 0) {
      const [prevDay, , prevN] = LEG_PRESS[i - 1];
      for (let k = prevN + 1; k < n; k++) {
        const fillerDay = addDays(prevDay, k - prevN);
        const id = `s-${fillerDay}`;
        sessions.push({ id, date: fillerDay, sessionNumber: k, trainerInitials: "SR", trainerName: "Sam Reyes", hostedAtStudioId: STUDIO, status: "Completed" });
        logs.push({ id: `${id}_chest-press`, sessionId: id, machineId: "chest-press", weight: "60", reps: "9", outcome: "performed" });
      }
    }
    const id = `s-${day}`;
    const order = ORDER[day];
    sessions.push({
      id,
      date: day,
      sessionNumber: n,
      trainerInitials: tr,
      trainerName: TRAINERS[tr],
      hostedAtStudioId: STUDIO,
      status: "Completed",
      ...(order
        ? { sessionMachineIds: [...OTHER_MACHINES.slice(0, order[0] - 1), "leg-press", ...OTHER_MACHINES.slice(order[0] - 1)].slice(0, order[1]) }
        : {}),
    });
    logs.push({
      id: `${id}_leg-press`,
      sessionId: id,
      machineId: "leg-press",
      studioId: STUDIO,
      ...(w !== null ? { weight: String(w) } : {}),
      ...(reps !== null ? { reps: String(reps) } : {}),
      ...(secs !== null ? { seconds: String(secs), isTSC: true } : {}),
      ...(q !== null ? { repQuality: q } : {}),
      outcome,
      ...(outcome === "practice" ? { bloodFlow: true } : {}),
      ...(outcome === "skipped" ? { skipReason: "pain_injury", skipNote: "Left knee sore going in" } : {}),
      machineSettings: SETUP[setup],
      ...(LOGGED_AT[day] ? { createdAt: new Date(LOGGED_AT[day]) } : {}),
    });
  });
  return { sessions, logs };
}

/**
 * What a door has read: the sessions numbered `from` and up, with their sets.
 * The profile's first page is #21–#70; the session's window is #42–#70, and
 * one Load older reads #12–#41.
 */
export function averyRead(from: number): AveryRead {
  const all = averyAll();
  const sessions = all.sessions.filter((s) => s.sessionNumber >= from);
  const ids = new Set(sessions.map((s) => s.id));
  return {
    sessions,
    logs: all.logs.filter((l) => ids.has(l.sessionId)),
    everythingRead: from <= 1,
    moreToLoad: from > 1,
  };
}

/** Leg Press's setting changes for Avery (device time). */
export const LEG_PRESS_HISTORY: SettingHistoryDoc[] = [
  {
    id: "h1",
    clientId: "avery",
    timestamp: "2025-09-09T09:58:12-04:00",
    changeType: "INITIAL_SETUP",
    oldValue: "Seat: —, Back pad: —, Foot plate: —",
    newValue: "Seat: 4, Back pad: 3, Foot plate: High",
    reason: "Initial setup",
    trainerName: "Sam Reyes",
  },
  {
    id: "h2",
    clientId: "avery",
    timestamp: "2026-01-13T15:31:40-05:00",
    changeType: "SETTINGS",
    oldValue: "Seat: 4",
    newValue: "Seat: 5",
    reason: "Range of motion",
    trainerName: "Sam Reyes",
  },
  {
    id: "h3",
    clientId: "avery",
    timestamp: "2026-02-20T11:20:05-05:00",
    changeType: "WEIGHT",
    oldValue: "Start: 84, Current: 92",
    newValue: "Start: 80, Current: 92",
    reason: "Weight update",
    trainerName: "Ana Cole",
  },
  {
    id: "h4",
    clientId: "avery",
    timestamp: "2026-08-18T10:02:31-04:00",
    changeType: "SETTINGS",
    oldValue: "Back pad: 3",
    newValue: "Back pad: 2",
    reason: "Comfort or fit",
    trainerName: "Theo Marsh",
  },
];

function entry(over: Partial<JournalEntry> & Pick<JournalEntry, "id" | "body">): JournalEntry {
  return {
    clientId: "avery",
    studioId: STUDIO,
    kind: "equipment",
    category: null,
    importance: "standard",
    machineId: "leg-press",
    focusId: null,
    threadId: null,
    sessionId: null,
    origin: "profile",
    authorId: "uid-sam",
    authorInitials: "SR",
    authorName: "Sam Reyes",
    occurredAt: new Date(),
    createdAt: null,
    updatedAt: null,
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  };
}

/** Avery's journal on Leg Press: three settings copies and three notes (one with an update). */
export const LEG_PRESS_JOURNAL: JournalEntry[] = [
  entry({
    id: "copy-1",
    body: "Leg Press — Seat — → 4, Back pad — → 3, Foot plate — → High. Initial setup",
    occurredAt: new Date("2025-09-09T09:58:13-04:00"),
  }),
  entry({ id: "copy-2", body: "Leg Press — Seat 4 → 5. Range of motion", occurredAt: new Date("2026-01-13T15:31:41-05:00") }),
  entry({
    id: "copy-3",
    body: "Leg Press — Back pad 3 → 2. Comfort or fit",
    occurredAt: new Date("2026-08-18T10:02:32-04:00"),
    authorName: "Theo Marsh",
  }),
  entry({
    id: "n1",
    kind: "coaching",
    category: "Pace",
    body: "Comes down nicely; cue a full stop at the bottom before the turnaround.",
    sessionId: "s-2025-10-28",
    sessionDay: "2025-10-28",
    occurredAt: new Date("2025-10-28T11:00:00-04:00"),
  }),
  entry({
    id: "n2",
    kind: "injury",
    category: "Injury",
    body: "Left knee sore going in; Leg Press skipped today.",
    sessionId: "s-2026-02-11",
    sessionDay: "2026-02-11",
    occurredAt: new Date("2026-02-11T10:00:00-05:00"),
    resolvedAt: new Date("2026-02-21T10:00:00-05:00"),
    authorName: "Ana Cole",
  }),
  entry({
    id: "n2-u1",
    kind: "injury",
    category: "Injury",
    threadId: "n2",
    body: "Knee fine today; full range, no pain.",
    occurredAt: new Date("2026-02-21T10:00:00-05:00"),
  }),
  entry({
    id: "n3",
    kind: "coaching",
    category: "Posture",
    importance: "elevated",
    body: "Pushes through the toes near the end of the set; cue heels down.",
    sessionId: "s-2026-09-17",
    sessionDay: "2026-09-17",
    occurredAt: new Date("2026-09-17T10:30:00-04:00"),
    authorName: "Ana Cole",
  }),
];
