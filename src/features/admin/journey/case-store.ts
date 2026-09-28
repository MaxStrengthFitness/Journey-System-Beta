/**
 * A CLIENT'S CASE, STORED — the Firestore half. What a case MEANS on the page
 * (the owner, the next step, when it comes to the leader, the outcome) is
 * case.ts; this file reads and writes the document and nothing else.
 *
 * Wave 2 of the Operations room (Sep 28 2026; AJ: "all yes" to the case
 * fields the first wave worked out but couldn't keep):
 *
 *   studios/{studioId}/cases/{clientId}
 *     { clientId, clientName,
 *       owner: { id: <Auth uid>, name },
 *       nextStep: string,
 *       dueOn: 'yyyy-mm-dd' | null,
 *       outcome: 'open' | 'booked-again' | 'paused' | 'lost',
 *       reason?: string,
 *       openedAt, updatedAt, updatedBy: <Auth uid> }
 *
 * EXACTLY this shape: Relay reads it tonight for a trainer's own cases
 * (`where('owner.id', '==', uid)`, the cases index), so `owner.id` is the
 * owner's SIGN-IN uid, never the trainer document's id (the two differ on
 * older accounts, and the rules pin it).
 *
 * WHO (firestore.rules, "WAVE 2 OPERATIONS: a client's case"): the studio's
 * leaders read and write every case; the case's owner reads theirs and may
 * change its next step, due day, outcome and reason — never the owner, the
 * name or when it opened. Nothing is ever deleted: an outcome closes a case,
 * and a leader reopening one sets a new owner, step and openedAt.
 *
 * "Booked again" is also WORKED OUT on read (case.ts), from her bookings,
 * and never written by the sync: the sync is the Mindbody integration.
 *
 * WRITES send only what changed (`casePatch`), with `updatedAt` and
 * `updatedBy`; a cleared reason is removed (deleteField). Firestore refuses
 * `undefined`, so nothing here ever sends one.
 */
import { useEffect, useState } from "react";
import { collection, deleteField, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";

export const CASES = "cases";

export type CaseOutcome = "open" | "booked-again" | "paused" | "lost";

export const CASE_OUTCOMES: readonly CaseOutcome[] = ["open", "booked-again", "paused", "lost"];

export const OUTCOME_WORDS: Record<CaseOutcome, string> = {
  open: "Open",
  "booked-again": "Booked again",
  paused: "Paused",
  lost: "Lost",
};

/** The rules' limits (firestore.rules caseValid). */
export const CASE_LIMITS = { name: 120, ownerId: 128, nextStep: 500, reason: 300 } as const;

const DAY_KEY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export interface StoredCase {
  clientId: string;
  clientName: string;
  owner: { id: string; name: string };
  nextStep: string;
  dueOn: string | null;
  outcome: CaseOutcome;
  /** Absent in the document reads as null. */
  reason: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
  /** The Auth uid of whoever last changed it. */
  updatedBy: string | null;
}

/** What a person edits: the case less its stamps. */
export interface CaseDraft {
  owner: { id: string; name: string } | null;
  nextStep: string;
  dueOn: string | null;
  outcome: CaseOutcome;
  reason: string;
}

const toDateOrNull = (v: unknown): Date | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (v && typeof (v as { toDate?: unknown }).toDate === "function") {
    const d = (v as { toDate: () => Date }).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
};

/** One case as stored; null when the document isn't a case a screen can stand behind. */
export function parseCase(id: string, data: Record<string, unknown> | null | undefined): StoredCase | null {
  if (!data) return null;
  const owner = data.owner as { id?: unknown; name?: unknown } | undefined;
  if (!owner || typeof owner.id !== "string" || !owner.id) return null;
  const outcome = CASE_OUTCOMES.includes(data.outcome as CaseOutcome) ? (data.outcome as CaseOutcome) : null;
  if (!outcome) return null;
  return {
    clientId: typeof data.clientId === "string" && data.clientId ? data.clientId : id,
    clientName: typeof data.clientName === "string" ? data.clientName : "",
    owner: { id: owner.id, name: typeof owner.name === "string" ? owner.name : "" },
    nextStep: typeof data.nextStep === "string" ? data.nextStep : "",
    dueOn: typeof data.dueOn === "string" && DAY_KEY.test(data.dueOn) ? data.dueOn : null,
    outcome,
    reason: typeof data.reason === "string" && data.reason.trim() ? data.reason : null,
    openedAt: toDateOrNull(data.openedAt),
    updatedAt: toDateOrNull(data.updatedAt),
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null,
  };
}

/** The draft a stored case starts an editor from. */
export function draftOf(c: StoredCase): CaseDraft {
  return { owner: { ...c.owner }, nextStep: c.nextStep, dueOn: c.dueOn, outcome: c.outcome, reason: c.reason ?? "" };
}

/** Why a draft can't be saved, in words, or null when it can. */
export function draftProblem(d: CaseDraft): string | null {
  if (!d.owner || !d.owner.id) return "Choose who owns it.";
  if (d.nextStep.trim().length > CASE_LIMITS.nextStep) return `Keep the next step to ${CASE_LIMITS.nextStep} characters.`;
  if (d.reason.trim().length > CASE_LIMITS.reason) return `Keep the reason to ${CASE_LIMITS.reason} characters.`;
  if (d.dueOn !== null && !DAY_KEY.test(d.dueOn)) return "Pick a due day, or leave it empty.";
  return null;
}

const clip = (s: string, n: number) => s.trim().slice(0, n);

/**
 * Only what changed between two drafts, in the document's own fields. A
 * reason cleared is `"clear"` (the write removes it); every other value is
 * what goes to Firestore. `{}` when nothing changed.
 */
export function casePatch(before: CaseDraft, after: CaseDraft): Partial<{ owner: { id: string; name: string }; nextStep: string; dueOn: string | null; outcome: CaseOutcome; reason: string | "clear" }> {
  const out: ReturnType<typeof casePatch> = {};
  if (after.owner && (!before.owner || before.owner.id !== after.owner.id || before.owner.name !== after.owner.name)) {
    out.owner = { id: after.owner.id, name: clip(after.owner.name, CASE_LIMITS.name) };
  }
  if (clip(after.nextStep, CASE_LIMITS.nextStep) !== clip(before.nextStep, CASE_LIMITS.nextStep)) out.nextStep = clip(after.nextStep, CASE_LIMITS.nextStep);
  if ((after.dueOn ?? null) !== (before.dueOn ?? null)) out.dueOn = after.dueOn ?? null;
  if (after.outcome !== before.outcome) out.outcome = after.outcome;
  const reasonBefore = clip(before.reason, CASE_LIMITS.reason);
  const reasonAfter = clip(after.reason, CASE_LIMITS.reason);
  if (reasonAfter !== reasonBefore) out.reason = reasonAfter ? reasonAfter : "clear";
  return out;
}

/** The whole document a new case writes (a leader opening it). */
export function newCaseDoc(clientId: string, clientName: string, d: CaseDraft, uid: string, now: unknown) {
  if (!d.owner) throw new Error("Choose who owns it.");
  const reason = clip(d.reason, CASE_LIMITS.reason);
  return {
    clientId,
    clientName: clip(clientName, CASE_LIMITS.name),
    owner: { id: d.owner.id, name: clip(d.owner.name, CASE_LIMITS.name) },
    nextStep: clip(d.nextStep, CASE_LIMITS.nextStep),
    dueOn: d.dueOn ?? null,
    outcome: d.outcome,
    ...(reason ? { reason } : {}),
    openedAt: now,
    updatedAt: now,
    updatedBy: uid,
  };
}

export interface CasesRead {
  cases: ReadonlyMap<string, StoredCase>;
  loading: boolean;
  /** The read failed (refused or offline): cases are worked out, never "none stored". */
  failed: boolean;
}

const EMPTY: ReadonlyMap<string, StoredCase> = new Map();

/** Every case at the studio — the leaders' read (one small collection, no index). */
export function useStudioCases(studioId: string | null): CasesRead {
  const [state, setState] = useState<CasesRead>({ cases: EMPTY, loading: Boolean(studioId), failed: false });
  useEffect(() => {
    if (!studioId) {
      setState({ cases: EMPTY, loading: false, failed: false });
      return;
    }
    setState({ cases: EMPTY, loading: true, failed: false });
    return onSnapshot(
      collection(db, "studios", studioId, CASES),
      (snap) => {
        const next = new Map<string, StoredCase>();
        snap.docs.forEach((d) => {
          const c = parseCase(d.id, d.data() as Record<string, unknown>);
          if (c) next.set(d.id, c);
        });
        setState({ cases: next, loading: false, failed: false });
      },
      () => setState({ cases: EMPTY, loading: false, failed: true }),
    );
  }, [studioId]);
  return state;
}

const signedIn = (): string => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again to save: the app can't tell who is changing this.");
  return uid;
};

/** A leader opens (or reopens) a case: the whole document, stamped now. */
export async function openCase(studioId: string, clientId: string, clientName: string, draft: CaseDraft): Promise<void> {
  const problem = draftProblem(draft);
  if (problem) throw new Error(problem);
  const uid = signedIn();
  try {
    await setDoc(doc(db, "studios", studioId, CASES, clientId), newCaseDoc(clientId, clientName, draft, uid, serverTimestamp()));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, CASES);
    throw err;
  }
}

/** Only what changed, stamped. Nothing to send is not a write. */
export async function saveCase(studioId: string, clientId: string, before: CaseDraft, after: CaseDraft): Promise<void> {
  const problem = draftProblem(after);
  if (problem) throw new Error(problem);
  const patch = casePatch(before, after);
  if (Object.keys(patch).length === 0) return;
  const uid = signedIn();
  const { reason, ...rest } = patch;
  const write: Record<string, unknown> = { ...rest, updatedAt: serverTimestamp(), updatedBy: uid };
  if (reason !== undefined) write.reason = reason === "clear" ? deleteField() : reason;
  try {
    await updateDoc(doc(db, "studios", studioId, CASES, clientId), write);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, CASES);
    throw err;
  }
}
