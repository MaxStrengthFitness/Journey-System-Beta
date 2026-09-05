/**
 * A check-in that survives being interrupted.
 *
 * A session is twenty minutes. The check-in is eight topics, protein,
 * hydration, a pain map and a stress list — nobody fills that in while a
 * client waits on the lumbar machine, and asking them to meant it was
 * either rushed in one sitting or never started at all.
 *
 * So it is a DRAFT that lives between sessions. Same collection, same
 * shape, same archive as a finished one — a `progressReports` document
 * with `isCheckInOnly: true` — but `status: "Draft"` until a coach says it
 * is done. A client has at most one open draft; opening the panel resumes
 * it, and every edit merges into it.
 *
 * `checkInSectionsReviewed` is draft-only bookkeeping, deliberately kept
 * OFF the `subjective` block so it never reaches a finalized report or the
 * scoring code. It records the sections a coach has explicitly settled —
 * which is the only way "no pain anywhere" can be told apart from "we have
 * not talked about pain yet", since both store an empty list.
 */
import {
  addDoc,
  collection,
  deleteDoc,
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
import { emptyReportShell } from "./checkin-write";

export interface OpenCheckIn {
  id: string;
  assessment: SubjectiveAssessment;
  sectionsReviewed: string[];
  /** Epoch ms the draft was first created. */
  startedAt: number | null;
  /** Epoch ms of the last write. */
  updatedAt: number | null;
}

const millis = (v: any): number | null => {
  if (!v) return null;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Firestore rejects `undefined`; the assessment carries optional fields throughout. */
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

const toOpen = (id: string, data: any): OpenCheckIn => ({
  id,
  assessment: data.subjective as SubjectiveAssessment,
  sectionsReviewed: Array.isArray(data.checkInSectionsReviewed)
    ? (data.checkInSectionsReviewed as string[])
    : [],
  startedAt: millis(data.createdAt),
  updatedAt: millis(data.updatedAt),
});

/**
 * The client's open draft, or null.
 *
 * Asks for the draft directly. The first version read the ten newest reports
 * and filtered in the browser, which quietly broke for any client with ten
 * reports newer than their open draft: the panel found nothing, started a
 * SECOND draft, and orphaned a half-finished one. The wide read survives as
 * a fallback for the window before the composite index is deployed — the
 * same pattern the journal uses.
 */
export async function loadOpenCheckIn(clientId: string): Promise<OpenCheckIn | null> {
  try {
    const exact = await getDocs(
      query(
        collection(db, "progressReports"),
        where("clientId", "==", clientId),
        where("isCheckInOnly", "==", true),
        where("status", "==", "Draft"),
        orderBy("createdAt", "desc"),
        limit(1),
      ),
    );
    const d = exact.docs[0];
    if (!d) return null;
    const data = d.data() as any;
    return data.subjective ? toOpen(d.id, data) : null;
  } catch (err) {
    // failed-precondition = the index is not deployed yet. Anything else is
    // a real failure and should not be masked.
    if ((err as any)?.code !== "failed-precondition") throw err;
    console.warn(
      "[check-in] composite index missing; falling back to a wide read. " +
        "Run: firebase deploy --only firestore:indexes",
    );
  }

  const snap = await getDocs(
    query(
      collection(db, "progressReports"),
      where("clientId", "==", clientId),
      orderBy("createdAt", "desc"),
      limit(25),
    ),
  );
  const found = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as ProgressReport & Record<string, any>) }))
    .find((r) => r.status === "Draft" && r.isCheckInOnly && !!r.subjective);
  if (!found?.subjective) return null;
  return {
    id: found.id!,
    assessment: found.subjective as SubjectiveAssessment,
    sectionsReviewed: Array.isArray((found as any).checkInSectionsReviewed)
      ? ((found as any).checkInSectionsReviewed as string[])
      : [],
    startedAt: millis((found as any).createdAt),
    updatedAt: millis((found as any).updatedAt),
  };
}

/**
 * Create the draft, or merge into the one that exists. Returns its id so the
 * caller can keep writing to the same document.
 */
export async function saveCheckInDraft(opts: {
  draftId: string | null;
  client: Client;
  trainer: Trainer;
  assessment: SubjectiveAssessment;
  sectionsReviewed: string[];
}): Promise<string> {
  const { draftId, client, trainer, assessment, sectionsReviewed } = opts;

  if (draftId) {
    await updateDoc(
      doc(db, "progressReports", draftId),
      stripUndefined({
        subjective: assessment,
        checkInSectionsReviewed: sectionsReviewed,
        updatedAt: serverTimestamp(),
      }),
    );
    return draftId;
  }

  const date = assessment.completedAt || new Date().toISOString().split("T")[0];
  const ref = await addDoc(
    collection(db, "progressReports"),
    stripUndefined({
      ...emptyReportShell(client, trainer, date),
      status: "Draft",
      isCheckInOnly: true,
      checkInOrigin: "report",
      checkInSectionsReviewed: sectionsReviewed,
      sessionNumber: client.sessionCount || 0,
      subjective: assessment,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  return ref.id;
}

/**
 * Close the draft: score it, flip it to Finalized, and stamp the client's
 * snapshot so the hub flag updates. The snapshot write is best-effort — the
 * report is finalized either way.
 */
export async function finalizeCheckIn(opts: {
  draftId: string;
  client: Client;
  assessment: SubjectiveAssessment;
  previous: PreviousAssessmentRef | null;
}): Promise<void> {
  const { draftId, client, assessment, previous } = opts;
  const date = assessment.completedAt || new Date().toISOString().split("T")[0];
  const summary = summarize(assessment, previous);

  await updateDoc(
    doc(db, "progressReports", draftId),
    stripUndefined({
      status: "Finalized",
      date,
      previousReportId: previous?.reportId ?? null,
      subjective: { ...assessment, completedAt: date, summary },
      updatedAt: serverTimestamp(),
    }),
  );

  try {
    await updateDoc(doc(db, "clients", client.id!), {
      subjectiveSnapshot: snapshotForClient(draftId, date, summary),
    });
  } catch (err) {
    console.error("subjectiveSnapshot update failed", err);
  }
}

export async function discardCheckInDraft(draftId: string): Promise<void> {
  await deleteDoc(doc(db, "progressReports", draftId));
}
