/**
 * Firestore writes for a check-in run OUTSIDE the full progress report — from
 * the pre-session briefing or the post-session screen.
 *
 * A quick check-in is saved as a `progressReports` document with
 * `isCheckInOnly: true` and only the `subjective` block filled. That keeps
 * one collection, one archive, one "previous check-in" query, and lets a
 * trainer later open it and press "Build the full 90-day report" — the
 * check-in becomes step 5 of that report instead of being re-asked.
 */
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { Client, ProgressReport, Trainer } from "../../types";
import { type PreviousAssessmentRef } from "./scoring";
import {
  ASSESSMENT_HISTORY_LIMIT,
  historyFromDocs,
  type AssessmentHistory,
} from "./assessment-history";

/** The most recent FINALIZED report for the client that carries a check-in. */
export async function loadPreviousCheckIn(
  clientId: string,
  excludeReportId?: string,
): Promise<PreviousAssessmentRef | null> {
  const snap = await getDocs(
    query(
      collection(db, "progressReports"),
      where("clientId", "==", clientId),
      orderBy("createdAt", "desc"),
      limit(10),
    ),
  );
  const prev = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as ProgressReport) }))
    .find((r) => r.id !== excludeReportId && r.status === "Finalized" && !!r.subjective);
  return prev && prev.subjective
    ? {
        reportId: prev.id!,
        date: prev.date,
        assessment: prev.subjective,
        trainerName: prev.trainerName ?? null,
        enteredBy: prev.subjective.enteredBy ?? null,
      }
    : null;
}

/**
 * The client's saved assessments, for the history log (Assessment round).
 *
 * The same bounded read as `loadPreviousCheckIn` — `clientId` +
 * `createdAt desc`, one query, no per-report reads, no new index — just a
 * wider window. `complete` says whether it reached the client's first
 * report, so the log never calls something "new" that it could not see.
 */
export async function loadAssessmentHistory(
  clientId: string,
  max: number = ASSESSMENT_HISTORY_LIMIT,
): Promise<AssessmentHistory> {
  const snap = await getDocs(
    query(
      collection(db, "progressReports"),
      where("clientId", "==", clientId),
      orderBy("createdAt", "desc"),
      limit(max),
    ),
  );
  return historyFromDocs(
    snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
    max,
  );
}

/** Empty shells for the report fields the full editor expects to exist. */
export function emptyReportShell(client: Client, trainer: Trainer, date: string): ProgressReport {
  return {
    clientId: client.id!,
    trainerId: trainer.id!,
    trainerName: trainer.fullName,
    trainerInitials: trainer.initials,
    date,
    isManual: false,
    status: "Draft",
    attendance: {
      score: 0,
      totalSessions: 0,
      avgDuration: 0,
      punctuality: "",
      narrative: "",
    },
    highlights: [],
    performanceMatrix: {
      posture: { score: 80, note: "", talkingPoints: [] },
      pace: { score: 80, note: "", talkingPoints: [] },
      path: { score: 80, note: "", talkingPoints: [] },
      purpose: { score: 80, note: "", talkingPoints: [] },
    },
    milestones: { originalWhy: client.globalNotes || "", smartGoal: client.smartGoal || "" },
    strategy: { primaryPlan: "", focusAreas: "" },
    createdAt: null,
  };
}

const stripUndefined = (obj: any): any => {
  if (obj === undefined) return undefined;
  if (obj === null || typeof obj !== "object") return obj;
  if (obj.serverTime || obj.isEqual) return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined).filter((v) => v !== undefined);
  const out: any = {};
  for (const k in obj) {
    const v = stripUndefined(obj[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
};
