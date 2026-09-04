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
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { Client, ProgressReport, Trainer } from "../../types";
import type { SubjectiveAssessment } from "./types";
import { snapshotForClient, summarize, type PreviousAssessmentRef } from "./scoring";

export type CheckInOrigin = "pre_session" | "post_session" | "report";

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
    ? { reportId: prev.id!, date: prev.date, assessment: prev.subjective }
    : null;
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

/**
 * Save a quick check-in as a finalized, check-in-only report and stamp the
 * client's snapshot so the hub flag updates. Returns the new report id.
 */
export async function saveQuickCheckIn(opts: {
  client: Client;
  trainer: Trainer;
  assessment: SubjectiveAssessment;
  previous: PreviousAssessmentRef | null;
  origin: CheckInOrigin;
  sessionId?: string | null;
}): Promise<string> {
  const { client, trainer, assessment, previous, origin, sessionId } = opts;
  const date = assessment.completedAt || new Date().toISOString().split("T")[0];
  const summary = summarize(assessment, previous);
  const shell = emptyReportShell(client, trainer, date);

  const payload = stripUndefined({
    ...shell,
    status: "Finalized",
    isCheckInOnly: true,
    checkInOrigin: origin,
    checkInSessionId: sessionId ?? null,
    previousReportId: previous?.reportId ?? null,
    sessionNumber: client.sessionCount || 0,
    subjective: { ...assessment, completedAt: date, summary },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const ref = await addDoc(collection(db, "progressReports"), payload);

  // Best-effort: the report is saved either way.
  try {
    await updateDoc(doc(db, "clients", client.id!), {
      subjectiveSnapshot: snapshotForClient(ref.id, date, summary),
    });
  } catch (err) {
    console.error("subjectiveSnapshot update failed", err);
  }
  return ref.id;
}
