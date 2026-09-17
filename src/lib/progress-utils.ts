import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { ExerciseLog, WorkoutSession } from "../types";
import { parseSessionDate } from "./utils";
import { isPerformedLog } from "./set-outcome";

/* ------------------------------------------------------------------ *
 * The progress report's window data
 *
 * Until the accolades round (Sep 2026) the report page read the client's
 * whole session list and every exercise log TWICE for the attendance tiles,
 * and then, for each of the app's machines, the session list again plus that
 * machine's logs — two reads per machine, every time the window changed. All
 * of it is the same two collections for one client, so they are now read
 * ONCE per report (`loadTrainingHistory`) and every number on the report is
 * computed from that in memory (`attendanceStatsFrom`, `machineStatsFrom`).
 * Changing the report window costs no read at all.
 * ------------------------------------------------------------------ */

/** Everything the report counts from, for one client. */
export interface TrainingHistory {
  /** Completed sessions, oldest first. */
  sessions: WorkoutSession[];
  /** Every exercise log for the client, in no particular order. */
  logs: ExerciseLog[];
}

/**
 * The two reads behind a progress report. A client with no completed
 * sessions has nothing to count, so the logs are not read at all.
 * Throws on a failed read — the caller treats that as "unknown", never as an
 * empty history.
 */
export async function loadTrainingHistory(clientId: string): Promise<TrainingHistory> {
  const sessionsSnap = await getDocs(
    query(
      collection(db, "sessions"),
      where("clientId", "==", clientId),
      where("status", "==", "Completed"),
      orderBy("date", "asc"),
    ),
  );
  const sessions = sessionsSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as WorkoutSession,
  );
  if (sessions.length === 0) return { sessions, logs: [] };

  const logsSnap = await getDocs(
    query(collection(db, "exerciseLogs"), where("clientId", "==", clientId)),
  );
  const logs = logsSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as ExerciseLog,
  );
  return { sessions, logs };
}

/** Sessions on or after the window start (blank = every session). */
export function sessionsInWindow(
  sessions: WorkoutSession[],
  startDateStr?: string,
): WorkoutSession[] {
  if (!startDateStr) return sessions;
  return sessions.filter((s) => typeof s.date === "string" && s.date >= startDateStr);
}

/**
 * NAMED MINIMUMS for the two averages on the report's stat tiles. Below them
 * the average is reported as 0, which every screen reads as "not enough data
 * yet" — a real average session is never 0 minutes (sessions of 5 minutes or
 * less are not counted) and a real rest is never 0 days (same-day gaps are
 * not counted), so 0 is never a true value for either.
 *
 * Legacy imports carry no start / end time, so a client whose history is
 * mostly imported has no session length at all; that is "unknown", not zero.
 */
export const AVG_DURATION_MIN_SESSIONS = 3;
/** Two gaps means three sessions: one gap is a single interval, not an average. */
export const AVG_REST_MIN_GAPS = 2;

export interface AttendanceStats {
  totalSessions: number;
  firstSessionDate: string;
  totalVolume: number;
  totalReps: number;
  totalGoodReps: number;
  /** 0 = fewer than AVG_REST_MIN_GAPS gaps (not enough data yet). */
  avgRestDays: number;
  /** 0 = fewer than AVG_DURATION_MIN_SESSIONS timed sessions (not enough data yet). */
  avgDuration: number;
  score: number;
  punctuality: string;
}

const timeOf = (v: any): Date | null => {
  if (!v) return null;
  const d = typeof v.toDate === "function" ? v.toDate() : new Date(v);
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
};

/**
 * Attendance, volume and rest for the window. Pure: the same numbers the
 * report page always showed, computed from an already-loaded history.
 * Target: 24 sessions for a full score.
 */
export function attendanceStatsFrom(
  history: TrainingHistory,
  startDateStr?: string,
): AttendanceStats {
  const allSessions = history.sessions;
  if (allSessions.length === 0) {
    return {
      totalSessions: 0,
      firstSessionDate: "",
      totalVolume: 0,
      totalReps: 0,
      totalGoodReps: 0,
      avgRestDays: 0,
      avgDuration: 0,
      score: 0,
      punctuality: "No data",
    };
  }

  const filteredSessions = sessionsInWindow(allSessions, startDateStr);
  const totalSessions = filteredSessions.length;
  const firstSessionDate = allSessions[0]?.date || "";

  let totalDuration = 0;
  let durationCount = 0;
  let previousDate: Date | null = null;
  let totalRestDays = 0;
  let restIntervalCount = 0;

  filteredSessions.forEach((s) => {
    const start = timeOf(s.startTime);
    const end = timeOf(s.endTime);
    if (start && end) {
      const duration = (end.getTime() - start.getTime()) / (1000 * 60);
      if (duration > 5 && duration < 120) {
        totalDuration += duration;
        durationCount++;
      }
    }

    const ts = parseSessionDate(s.date);
    if (ts > 0) {
      const sDate = new Date(ts);
      if (previousDate) {
        const diffDays = Math.round(
          (sDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diffDays > 0 && diffDays < 100) {
          totalRestDays += diffDays;
          restIntervalCount++;
        }
      }
      previousDate = sDate;
    }
  });

  const avgDuration =
    durationCount >= AVG_DURATION_MIN_SESSIONS
      ? Math.round(totalDuration / durationCount)
      : 0;
  const avgRestDays =
    restIntervalCount >= AVG_REST_MIN_GAPS
      ? Math.round((totalRestDays / restIntervalCount) * 10) / 10
      : 0;

  let totalVolume = 0;
  let totalRepsRaw = 0;
  let totalGoodReps = 0;

  const filteredSessionIds = new Set(filteredSessions.map((s) => s.id));

  history.logs.forEach((log) => {
    if (!isPerformedLog(log)) return; // practice and skips never add volume or a good rep
    if (filteredSessionIds.has(log.sessionId)) {
      if (log.repQuality === 3) {
        totalGoodReps++;
      }
      const w = parseInt(log.weight || "0", 10);
      if (!isNaN(w) && w > 0) {
        if (log.isStaticHold || log.isTSC) {
          const s = parseInt(log.seconds || "0", 10);
          if (!isNaN(s) && s > 0) {
            const equiv = (s / 30) * 2;
            totalVolume += w * equiv;
            totalRepsRaw += equiv;
          }
        } else {
          const r = parseInt(log.reps || "0", 10) || 1;
          totalVolume += w * r;
          totalRepsRaw += r;
        }
      }
    }
  });

  const finalVolume = Math.round(totalVolume);
  const finalReps = Math.round(totalRepsRaw);

  return {
    totalSessions,
    firstSessionDate,
    totalVolume: isNaN(finalVolume) ? 0 : finalVolume,
    totalReps: isNaN(finalReps) ? 0 : finalReps,
    totalGoodReps,
    avgRestDays,
    avgDuration,
    score: Math.min(100, Math.round((totalSessions / 24) * 100)),
    punctuality: "Generally punctual with minor variations.",
  };
}

/** One machine's numbers for the window (the highlight picker and step 3). */
export interface MachineWindowStats {
  startWeight: number;
  currentWeight: number;
  percentageIncrease: number;
  totalVolume: number;
  perfectSets: number;
  timeUnderTension: number;
  /**
   * Distinct sessions with a performed, weighted set on this machine in the
   * window — the sample behind the start → current figure.
   */
  sessionCount: number;
}

const millisOf = (v: any): number =>
  typeof v?.toMillis === "function" ? v.toMillis() : 0;

/**
 * Start → current weight and the running totals for EVERY machine the client
 * performed a set on in the window, from one history. Same rules the old
 * per-machine reader used: performed sets only, ordered by session number,
 * then session date, then when the log was written; start is the first
 * weighted set and current the last.
 */
export function machineStatsFrom(
  history: TrainingHistory,
  startDateStr?: string,
): Record<string, MachineWindowStats> {
  const windowSessions = sessionsInWindow(history.sessions, startDateStr);
  if (windowSessions.length === 0) return {};

  const sessionInfo = new Map<string, { sessionNumber: number; date: string }>();
  windowSessions.forEach((s) => {
    if (!s.id) return;
    sessionInfo.set(s.id, {
      sessionNumber: s.sessionNumber || 0,
      date: s.date || "",
    });
  });

  const byMachine = new Map<string, ExerciseLog[]>();
  history.logs.forEach((l) => {
    if (!l.machineId || !sessionInfo.has(l.sessionId) || !isPerformedLog(l)) return;
    const list = byMachine.get(l.machineId);
    if (list) list.push(l);
    else byMachine.set(l.machineId, [l]);
  });

  const out: Record<string, MachineWindowStats> = {};
  byMachine.forEach((logs, machineId) => {
    const sorted = [...logs].sort((a, b) => {
      const sessA = sessionInfo.get(a.sessionId)!;
      const sessB = sessionInfo.get(b.sessionId)!;
      if (sessA.sessionNumber !== sessB.sessionNumber) {
        return sessA.sessionNumber - sessB.sessionNumber;
      }
      if (sessA.date !== sessB.date) {
        return sessA.date.localeCompare(sessB.date);
      }
      return millisOf(a.createdAt) - millisOf(b.createdAt);
    });

    const weightOf = (l: ExerciseLog) => parseFloat(l.weight || "0") || 0;
    const weighted = sorted.filter((l) => weightOf(l) > 0);
    if (weighted.length === 0) return;

    const startW = weightOf(weighted[0]);
    const currentW = weightOf(weighted[weighted.length - 1]);

    let percentageIncrease = 0;
    if (startW > 0) {
      percentageIncrease = Math.round(((currentW - startW) / startW) * 100);
    }
    if (isNaN(percentageIncrease)) percentageIncrease = 0;

    let totalVolume = 0;
    let perfectSets = 0;
    let timeUnderTension = 0;

    sorted.forEach((l) => {
      const w = weightOf(l);
      const sVal = parseFloat(l.seconds || "0") || 0;
      if (l.isStaticHold || l.isTSC) {
        totalVolume += w * ((sVal / 30) * 2);
      } else {
        const r = parseFloat(l.reps || "0") || 1;
        totalVolume += w * r;
      }
      if (l.repQuality === 3) perfectSets++;
      timeUnderTension += sVal;
    });

    const finalVolume = Math.round(totalVolume);
    out[machineId] = {
      startWeight: startW,
      currentWeight: currentW,
      percentageIncrease,
      totalVolume: isNaN(finalVolume) ? 0 : finalVolume,
      perfectSets,
      timeUnderTension: isNaN(timeUnderTension) ? 0 : timeUnderTension,
      sessionCount: new Set(weighted.map((l) => l.sessionId)).size,
    };
  });
  return out;
}
``;
