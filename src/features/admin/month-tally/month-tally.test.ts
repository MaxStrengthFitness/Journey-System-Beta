import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../../types";
import { hoursTally, queryWindowForMonth } from "../hours/hours";
import { returnRate, studioSummary, trainerMetrics } from "../insights/metrics";
import { studioDateKey } from "../../../lib/studio-time";
import {
  MONTHS_KEPT,
  approximateBytes,
  decodeMonth,
  digestRow,
  encodeMonth,
  hoursFromNightAndLive,
  hoursMonthDoc,
  insightsSessions,
  monthsForWindow,
  monthsKept,
  rowAsSession,
  usableHoursDoc,
  usableSessionsDoc,
  type DigestRow,
} from "./month-tally";

const ET = "America/New_York";
const at = (iso: string) => new Date(iso);
const names = { t1: "Ann Lee", "initials:GR": "Giovanni Rossi" };

/** A spread of sessions in September and October 2026, some odd on purpose. */
function sessions(): WorkoutSession[] {
  const out: WorkoutSession[] = [];
  let n = 0;
  for (let d = 1; d <= 30; d += 1) {
    const day = `2026-09-${String(d).padStart(2, "0")}`;
    for (let k = 0; k < 3; k += 1) {
      n += 1;
      const start = at(`${day}T${String(13 + k).padStart(2, "0")}:00:00Z`);
      out.push({
        id: `s${n}`,
        date: day,
        createdAt: start,
        startTime: start,
        endTime: k === 2 ? undefined : new Date(start.getTime() + (18 + k + (n % 5) * 0.37) * 60_000),
        totalPausedMs: k === 1 ? 30_000 : undefined,
        status: n % 11 === 0 ? "In-Progress" : "Completed",
        trainerId: n % 7 === 0 ? undefined : n % 2 ? "t1" : "t2",
        trainerInitials: n % 7 === 0 && n % 14 !== 0 ? "GR" : undefined,
        clientId: `c${n % 23}`,
        notes: n % 3 === 0 ? "a note" : "",
        clientFeel: n % 4 === 0 ? "good" : undefined,
        isCrossTrain: n % 9 === 0,
        sessionNumber: n % 13 === 0 ? 1 : 5,
        sessionMachineIds: Array.from({ length: n % 6 }, (_, i) => `m${(n + i) % 8}`),
        hostedAtStudioId: "solon",
      } as unknown as WorkoutSession);
    }
  }
  // Logged late: a session on Sep 3 entered on Sep 12.
  out.push({ id: "late", date: "2026-09-03", createdAt: at("2026-09-12T15:00:00Z"), status: "Completed", trainerId: "t1", clientId: "c1" } as unknown as WorkoutSession);
  // Logged too late for Hours: Sep 2, entered Oct 20.
  out.push({ id: "toolate", date: "2026-09-02", createdAt: at("2026-10-20T15:00:00Z"), status: "Completed", trainerId: "t1", clientId: "c2" } as unknown as WorkoutSession);
  return out;
}

const rowsOf = (list: WorkoutSession[]) => list.map((s) => digestRow(s.id!, s)).filter((r): r is DigestRow => r !== null);

describe("a session as a line, and back", () => {
  it("the metrics read a line back exactly as they read the session", () => {
    const raw = sessions();
    const back = rowsOf(raw).map(rowAsSession);
    const strip = (m: ReturnType<typeof trainerMetrics>) => m.map((t) => ({ ...t, medianMinutes: t.medianMinutes === null ? null : Math.round(t.medianMinutes * 100) / 100 }));
    expect(strip(trainerMetrics(back, names))).toEqual(strip(trainerMetrics(raw, names)));
    const sum = (s: ReturnType<typeof studioSummary>) => ({ ...s, medianMinutes: s.medianMinutes === null ? null : Math.round(s.medianMinutes * 100) / 100 });
    expect(sum(studioSummary(back))).toEqual(sum(studioSummary(raw)));
    const start = at("2026-09-01T00:00:00Z").getTime();
    const end = at("2026-10-01T00:00:00Z").getTime();
    expect(returnRate(back, start, end)).toEqual(returnRate(raw, start, end));
  });

  it("encodes and decodes a month without losing anything the metrics use", () => {
    const rows = rowsOf(sessions()).filter((r) => r.day.startsWith("2026-09"));
    const doc = encodeMonth("2026-09", rows, { throughDay: "2026-09-30", liveFromMs: at("2026-10-01T06:00:00Z").getTime() });
    const back = decodeMonth(doc)!;
    expect(back).toHaveLength(rows.length);
    const key = (r: DigestRow) => ({ ...r, id: "" });
    const sort = (a: DigestRow, b: DigestRow) => a.createdMs - b.createdMs || a.day.localeCompare(b.day);
    expect([...back].sort(sort).map(key)).toEqual(
      [...rows].sort((a, b) => sort(a, b) || (a.id < b.id ? -1 : 1)).map(key),
    );
    expect(doc.lateIds).toEqual(["toolate"]);
    expect(approximateBytes(doc)).toBeLessThan(20_000);
  });

  it("refuses a document it can't read rather than guessing", () => {
    expect(decodeMonth(null)).toBeNull();
    expect(decodeMonth({ v: 99, rows: [] })).toBeNull();
    expect(decodeMonth({ v: 1, rows: ["2026-09-01|x|9|0|1||"], trainers: [], clients: ["c"], machines: [] })).toBeNull();
    expect(decodeMonth({ v: 1, tooBig: true, rows: [] })).toBeNull();
  });
});

describe("Hours from the night and the live read", () => {
  it("adds up to exactly what the raw read of the month says", () => {
    const raw = sessions();
    const month = "2026-09";
    const window = queryWindowForMonth(month, ET);
    // The raw read: the month's createdAt window, as the screen asks for it.
    const rawRead = raw.filter((s) => {
      const t = (s.createdAt as Date).getTime();
      return t >= window.startMs && t <= window.endMs;
    });
    const expected = hoursTally(rawRead, { month, sessionMinutes: 30, names });

    // The night ran at 2:30 am on Sep 20: closed days up to Sep 19.
    const liveFromMs = at("2026-09-20T04:00:00Z").getTime();
    const closed = rowsOf(raw).filter((r) => r.day <= "2026-09-19" && r.createdMs < at("2026-09-20T06:30:00Z").getTime());
    const doc = hoursMonthDoc(month, closed, { throughDay: "2026-09-19", liveFromMs, tz: ET });
    const live = raw.filter((s) => (s.createdAt as Date).getTime() >= liveFromMs);
    const got = hoursFromNightAndLive(doc, live, { sessionMinutes: 30, names, tz: ET });
    // Measured minutes are kept to the hundredth; the screen shows whole minutes.
    const even = (h: typeof got) => ({ ...h, rows: h.rows.map((r) => ({ ...r, measured: { ...r.measured, minutes: Math.round(r.measured.minutes * 100) / 100 } })) });
    expect(even(got)).toEqual(even(expected));
  });

  it("never counts a session twice when it was logged while the night was reading", () => {
    const month = "2026-09";
    const liveFromMs = at("2026-09-20T06:25:00Z").getTime();
    const s = { id: "edge", date: "2026-09-19", createdAt: at("2026-09-20T06:27:00Z"), status: "Completed", trainerId: "t1", clientId: "c1" } as unknown as WorkoutSession;
    const doc = hoursMonthDoc(month, rowsOf([s]), { throughDay: "2026-09-19", liveFromMs, tz: ET });
    expect(doc.lateIds).toEqual(["edge"]);
    const got = hoursFromNightAndLive(doc, [s], { sessionMinutes: 30, names, tz: ET });
    expect(got.totals.month.sessions).toBe(1);
  });

  it("a document from before last night isn't used", () => {
    const doc = hoursMonthDoc("2026-10", [], { throughDay: "2026-10-03", liveFromMs: 1, tz: ET });
    expect(usableHoursDoc(doc, "2026-10", "2026-10-04")).toBe(true);
    expect(usableHoursDoc(doc, "2026-10", "2026-10-05")).toBe(false);
    expect(usableHoursDoc(doc, "2026-09", "2026-10-04")).toBe(false);
    expect(usableHoursDoc(null, "2026-10", "2026-10-04")).toBe(false);
  });
});

describe("Insights from the night and the live read", () => {
  it("the window's sessions match the raw read's, sums, medians and distinct counts alike", () => {
    const raw = sessions();
    const nowMs = at("2026-10-25T16:00:00Z").getTime();
    const startMs = nowMs - 30 * 86_400_000;
    const rawRead = raw.filter((s) => (s.createdAt as Date).getTime() >= startMs);

    const liveFromMs = at("2026-10-25T04:00:00Z").getTime();
    const run = { throughDay: "2026-10-24", liveFromMs };
    const rows = rowsOf(raw).filter((r) => r.day <= run.throughDay && r.createdMs < at("2026-10-25T06:30:00Z").getTime());
    const months = monthsForWindow(startMs, "2026-10-25", (ms) => studioDateKey(ms, ET)!)!;
    expect(months).toEqual(["2026-10", "2026-09"]);
    const docs = months.map((m) => encodeMonth(m, rows.filter((r) => r.day.startsWith(m)), run));
    const live = raw.filter((s) => (s.createdAt as Date).getTime() >= liveFromMs);
    const got = insightsSessions(docs, live, { startMs, endMs: nowMs })!;
    const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
    expect({ ...studioSummary(got), medianMinutes: round(studioSummary(got).medianMinutes) }).toEqual({
      ...studioSummary(rawRead),
      medianMinutes: round(studioSummary(rawRead).medianMinutes),
    });
    expect(trainerMetrics(got, names).map((t) => ({ ...t, medianMinutes: round(t.medianMinutes) }))).toEqual(
      trainerMetrics(rawRead, names).map((t) => ({ ...t, medianMinutes: round(t.medianMinutes) })),
    );
    expect(returnRate(got, startMs, nowMs)).toEqual(returnRate(rawRead, startMs, nowMs));
  });

  it("months from two different nights aren't mixed", () => {
    const a = encodeMonth("2026-10", [], { throughDay: "2026-10-24", liveFromMs: 1 });
    const b = encodeMonth("2026-09", [], { throughDay: "2026-10-23", liveFromMs: 2 });
    expect(insightsSessions([a, b], [], { startMs: 0, endMs: 10 })).toBeNull();
  });

  it("a window reaching past the months the night keeps is read raw", () => {
    const today = "2026-10-25";
    const old = at("2026-03-01T12:00:00Z").getTime();
    expect(monthsForWindow(old, today, (ms) => studioDateKey(ms, ET)!)).toBeNull();
    expect(monthsKept(today)).toHaveLength(MONTHS_KEPT);
    // Ninety days before any day of the year, less two weeks, is always kept.
    for (const day of ["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31", "2026-12-31"]) {
      const end = at(`${day}T23:00:00Z`).getTime();
      expect(monthsForWindow(end - 90 * 86_400_000, day, (ms) => studioDateKey(ms, ET)!)).not.toBeNull();
    }
  });

  it("a stale or oversized month isn't used", () => {
    const doc = encodeMonth("2026-10", [], { throughDay: "2026-10-24", liveFromMs: 1 });
    expect(usableSessionsDoc(doc, "2026-10", "2026-10-25")).toBe(true);
    expect(usableSessionsDoc(doc, "2026-10", "2026-10-26")).toBe(false);
    expect(usableSessionsDoc({ ...doc, tooBig: true }, "2026-10", "2026-10-25")).toBe(false);
  });
});
