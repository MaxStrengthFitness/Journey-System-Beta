/**
 * THE CASE FORM — the pure half: who may change what, who may own a case,
 * and what a new case starts from. Tested in case-form.test.ts.
 *
 * Operations room, wave 3 (Sep 29 2026; the second wave's item 6, "the case
 * form", left unbuilt). A leader opens a case on the client page inside
 * Operations and changes it; the owner changes their own. What is stored
 * and how it is written is case-store.ts (`openCase`, `saveCase`,
 * `casePatch` — the shape the rules and Relay's query fix); what a case
 * MEANS is case.ts.
 *
 * WHO MAY DO WHAT mirrors firestore.rules ("WAVE 2 OPERATIONS: a client's
 * case") so the screen never offers what the database refuses:
 *
 *   a leader of the studio (`leadsHere`)   opens a case, and changes every
 *                                          field of one
 *   the case's owner (owner.id == uid)     changes the next step, the due
 *                                          day, the outcome and the reason —
 *                                          never the owner
 *   everyone else                          reads
 *
 * WHO MAY OWN a case is everyone who works at the studio
 * (`lib/who-works-here.ts`), stored by their SIGN-IN uid (`authUid`, else
 * the trainer id for an account keyed on it) — the id Relay asks for.
 *
 * A NEW CASE starts from what the page already worked out (case.ts): her
 * usual trainer as the owner when the record names one, the rules' due day,
 * open, and an EMPTY next step — an empty step reads the rules' own on
 * every screen, so the leader types only when they have something to say.
 */
import type { Trainer } from "../../../types";
import { whoWorksHere } from "../../../lib/who-works-here";
import type { CaseView } from "./case";
import type { CaseDraft, StoredCase } from "./case-store";

/** What the signed-in person may do with this client's case. */
export type CaseEditing = "all" | "own" | "none";

export interface CaseRights {
  /** May open a case where none is stored (a leader). */
  mayOpen: boolean;
  /** On a stored case: every field, the owner's four, or nothing. */
  editing: CaseEditing;
}

export function caseRights(input: { leads: boolean; uid: string | null; stored: StoredCase | null }): CaseRights {
  if (input.leads) return { mayOpen: true, editing: "all" };
  const own = Boolean(input.stored && input.uid && input.stored.owner.id === input.uid);
  return { mayOpen: false, editing: own ? "own" : "none" };
}

/** The fields the owner may change. The rules allow exactly these (plus the stamps). */
export const OWNER_FIELDS: ReadonlySet<keyof CaseDraft> = new Set<keyof CaseDraft>(["nextStep", "dueOn", "outcome", "reason"]);

/** May this person change this field? */
export function mayEditField(editing: CaseEditing, field: keyof CaseDraft): boolean {
  if (editing === "all") return true;
  if (editing === "own") return OWNER_FIELDS.has(field);
  return false;
}

export interface OwnerChoice {
  /** The sign-in uid: what `owner.id` stores. */
  id: string;
  name: string;
}

/** The uid a trainer's cases are keyed by: the sign-in uid, else the id for an account keyed on it. */
export function ownerIdOf(t: Pick<Trainer, "id" | "authUid">): string | null {
  return t.authUid || t.id || null;
}

/**
 * Who may own a case at this studio: everyone who works there, by name. A
 * stored owner who no longer works there (or whose uid no list carries) is
 * kept as a choice, so the form never shows a case as owned by nobody.
 */
export function ownerChoices(trainers: readonly Trainer[], studioId: string | null, keep?: { id: string; name: string } | null): OwnerChoice[] {
  const seen = new Set<string>();
  const out: OwnerChoice[] = [];
  for (const t of whoWorksHere(trainers, studioId)) {
    const id = ownerIdOf(t);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: (t.nickname?.trim() || t.fullName || "").trim() || "Unnamed" });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  if (keep && keep.id && !seen.has(keep.id)) out.push({ id: keep.id, name: keep.name || "Someone who worked here" });
  return out;
}

/** What a new case starts from: the page's own answer, with an empty step. */
export function startingDraft(view: Pick<CaseView, "owner" | "dueDay">): CaseDraft {
  return {
    owner: view.owner.id ? { id: view.owner.id, name: view.owner.name } : null,
    nextStep: "",
    dueOn: view.dueDay,
    outcome: "open",
    reason: "",
  };
}

/** The whole draft after a change, from the committed value and the diff: what a save sends to the store. */
export function draftAfter(committed: CaseDraft, patch: Partial<CaseDraft>): CaseDraft {
  return { ...committed, ...patch };
}

/** "Fri, Oct 2" for a due day; "" for none. */
export function dueWords(day: string | null): string {
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
