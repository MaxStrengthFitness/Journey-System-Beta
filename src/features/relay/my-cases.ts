/**
 * MY CASES — the clients whose case a trainer owns, on the Tracker's
 * Follow-ups (Relay's third wave, Sep 29 2026; the second wave's item 8).
 *
 * A case is Operations' record of catching a client who is drifting
 * (features/admin/journey/case-store.ts): a leader opens it and names an
 * owner, and the owner is the trainer who will do the catching. Until now
 * the owner saw it only inside Operations, which most trainers never open.
 * The Tracker is the trainer's own list by WHEN, so an open case sits under
 * Follow-ups with its next step and its due day, and a small editor changes
 * exactly what the rules let the owner change: the next step, the due day,
 * the outcome and its reason (never the owner, the name or when it opened).
 *
 * The read is `where('owner.id', '==', uid)`, `outcome == 'open'`, by
 * `dueOn` (the cases index): the owner's SIGN-IN uid, which is what the
 * rules pin (the trainer document's id differs on older accounts).
 *
 * Nothing pings anyone: a step written here is read by the leader's
 * Operations page the next time it opens, and by nobody's bell.
 *
 * Pure: no React, no Firestore, no clock of its own. Day keys compare as
 * text (the date trap in CLAUDE.md).
 */
import type { StoredCase } from "../admin/journey/case-store";
import { dayWords } from "./jobs/jobs";

export type CaseDue = "overdue" | "today" | "soon" | "later" | "none";

export interface MyCaseRow {
  key: string;
  case: StoredCase;
  due: CaseDue;
  /** "Overdue — was due yesterday" · "Due today" · "Due Thursday" · "No day yet". */
  when: string;
  /** The next step, or what to say when there isn't one yet. */
  step: string;
}

const addDaysKey = (key: string, n: number): string => {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
};

/** How pressing the due day is. "soon" is within three days, like a job's. */
export function caseDue(dueOn: string | null, todayKey: string): CaseDue {
  if (!dueOn || !todayKey) return "none";
  if (dueOn < todayKey) return "overdue";
  if (dueOn === todayKey) return "today";
  if (dueOn <= addDaysKey(todayKey, 3)) return "soon";
  return "later";
}

export function caseWhenWords(dueOn: string | null, todayKey: string): string {
  const due = caseDue(dueOn, todayKey);
  if (due === "none" || !dueOn) return "No day yet";
  const when = dayWords(dueOn, todayKey);
  return due === "overdue" ? `Overdue — was due ${when}` : `Due ${when}`;
}

export function caseStepWords(c: Pick<StoredCase, "nextStep">): string {
  const step = c.nextStep.trim();
  return step || "No next step yet — add one";
}

const RANK: Record<CaseDue, number> = { overdue: 0, today: 1, soon: 2, later: 3, none: 4 };

/**
 * The trainer's open cases in the order to read them: overdue first, then
 * today, then by day, and the ones with no day last; by the client's name
 * inside each. A closed case is not a follow-up and is left out even if the
 * read handed it over.
 */
export function myCaseRows(cases: readonly StoredCase[], todayKey: string): MyCaseRow[] {
  return cases
    .filter((c) => c.outcome === "open")
    .map((c) => ({
      key: `case:${c.clientId}`,
      case: c,
      due: caseDue(c.dueOn, todayKey),
      when: caseWhenWords(c.dueOn, todayKey),
      step: caseStepWords(c),
    }))
    .sort(
      (a, b) =>
        RANK[a.due] - RANK[b.due] ||
        (a.case.dueOn ?? "9999").localeCompare(b.case.dueOn ?? "9999") ||
        a.case.clientName.localeCompare(b.case.clientName),
    );
}

/** The first name, for a sentence: "Hugo's case". */
export function caseFirstName(c: Pick<StoredCase, "clientName">): string {
  return c.clientName.trim().split(/\s+/)[0] || "this client";
}
