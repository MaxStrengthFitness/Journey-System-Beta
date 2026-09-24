/**
 * THE RECORD'S FORM — which client fields the codex edits, where each one
 * lives, and what one Save writes. The pure half of `useRecordForm`.
 *
 * Client codex, Sep 2026. The long scroll kept every editable field of the
 * client document in one form (ClientInfoSheet) with one Save bar. The codex
 * spreads those fields over four pages and still saves them together, so the
 * Save bar has to say WHERE an unsaved edit is ("1 unsaved change · FORD ·
 * Occupation") and take the trainer back to it. Three things live here:
 *
 *  1. RECORD_FORM_KEYS — only the fields some codex editor writes. The old
 *     form also seeded `recoveryMetric` (retired from every screen, AJ's
 *     decision 7) and the Mindbody-owned fields (the ids, the account notes,
 *     the photo, the package tier, `events`), which no control edits; a key
 *     that is not on this list can never be written from here.
 *  2. FIELD_HOME — the page and card each field is edited on. It is TOTAL
 *     over the keys (a test holds it), and every anchor is in the profile's
 *     anchor registry, so "Show" always lands on a real card.
 *  3. The dirty rules and the payload — ClientInfoSheet's rules, kept: an edit
 *     that returns to the saved value is not a change; nothing and nothing
 *     (undefined, null, "", false, []) are the same; and a save writes ONLY
 *     the changed fields plus `lastUpdatedBy`, never the whole client (the
 *     nightly job owns `renewal`, and the rules refuse a write that touches
 *     it). Two things are new: arrays and plain objects compare by value
 *     (an edit-then-revert of a checklist or a lock is clean), and the
 *     payload is stripped of `undefined`, which Firestore refuses.
 *
 * The one bug the old form had that this fixes: it never seeded `wingspan`,
 * so a saved wingspan showed as an empty box and the next save of any other
 * field left it alone only by luck.
 *
 * Pure: no React, no Firestore. record-form.test.ts.
 */
import type { Client } from "../../types";
import { withoutUndefined } from "../studio-tasks/task-wizard";
import {
  RECORD_ANCHORS,
  RECORD_PAGE_IDS,
  type RecordAnchor,
  type RecordPage,
} from "../client-profile/profile-nav";
import type { SaveBarPlace } from "./kit/save-bar";

/** Every client field a codex editor writes, in the order the pages show them. */
export const RECORD_FORM_KEYS = [
  // FORD · Occupation
  "occupation",
  "workProfile",
  "isRetired",
  // FORD · Recreation
  "activityLevel",
  "recreationActivities",
  // Body & Pulse · Build
  "height",
  "wingspan",
  "weight",
  // Body & Pulse · Training story
  "fitnessBackground",
  "needsUnteaching",
  "trainingPedigree",
  "pedigreeHistory",
  "experienceLevel",
  // Body & Pulse · Watch-outs
  "clinicalFlags",
  "medicalHistory",
  "clinicalNotes",
  // Goals & Focus
  "discoveryNotes",
  "globalNotes",
  "smartGoal",
  "smartChecks",
  "goalTargetDate",
  "goalHistory",
  // Account · Contact (identity and contact only on a client Mindbody does not own)
  "nickname",
  "firstName",
  "lastName",
  "dateOfBirth",
  "gender",
  "phone",
  "email",
  "address",
  "emergencyContactName",
  "emergencyContactPhone",
  // Account · Membership (the tier lock), and where they can train
  "contractTierOverride",
  "approvedCrossTrainStudioIds",
  // Account · How they found us
  "leadSource",
  "referredBy",
] as const satisfies readonly (keyof Client)[];

export type RecordFormKey = (typeof RECORD_FORM_KEYS)[number];

/** The form's values: the record's fields as the editors hold them. */
export type RecordFormData = Partial<Pick<Client, RecordFormKey>>;

export function isRecordFormKey(key: unknown): key is RecordFormKey {
  return typeof key === "string" && (RECORD_FORM_KEYS as readonly string[]).includes(key);
}

/* ------------------------------------------------------------------ */
/* Where each field lives                                              */
/* ------------------------------------------------------------------ */

export interface FieldHome {
  page: RecordPage;
  anchor: RecordAnchor;
  /** The card, in the page's words — the Save bar's "FORD · Occupation". */
  label: string;
}

const OCCUPATION: FieldHome = { page: "ford", anchor: "ford-occupation", label: "Occupation" };
const RECREATION: FieldHome = { page: "ford", anchor: "ford-recreation", label: "Recreation" };
const BUILD: FieldHome = { page: "body", anchor: "body-build", label: "Build" };
const TRAINING_STORY: FieldHome = { page: "body", anchor: "body-training-story", label: "Training story" };
const WATCH_OUTS: FieldHome = { page: "body", anchor: "body-watchouts", label: "Watch-outs" };
const HOW_TO_COACH: FieldHome = { page: "goals", anchor: "goals-coach", label: "How to coach" };
const THE_WHY: FieldHome = { page: "goals", anchor: "goals-why", label: "The why" };
const WORKING_TOWARD: FieldHome = { page: "goals", anchor: "goals-now", label: "Working toward" };
const CONTACT: FieldHome = { page: "account", anchor: "account-contact", label: "Contact" };
const MEMBERSHIP: FieldHome = { page: "account", anchor: "account-membership", label: "Membership" };
const TRAIN_AT: FieldHome = { page: "account", anchor: "account-train-at", label: "Where they can train" };
const FOUND_US: FieldHome = { page: "account", anchor: "account-found-us", label: "How they found us" };

/** The page and card every editable field lives on. Total: a key with no home fails the suite. */
export const FIELD_HOME: Readonly<Record<RecordFormKey, FieldHome>> = {
  occupation: OCCUPATION,
  workProfile: OCCUPATION,
  isRetired: OCCUPATION,
  activityLevel: RECREATION,
  recreationActivities: RECREATION,
  height: BUILD,
  wingspan: BUILD,
  weight: BUILD,
  fitnessBackground: TRAINING_STORY,
  needsUnteaching: TRAINING_STORY,
  trainingPedigree: TRAINING_STORY,
  pedigreeHistory: TRAINING_STORY,
  experienceLevel: TRAINING_STORY,
  clinicalFlags: WATCH_OUTS,
  medicalHistory: WATCH_OUTS,
  clinicalNotes: WATCH_OUTS,
  discoveryNotes: HOW_TO_COACH,
  globalNotes: THE_WHY,
  smartGoal: WORKING_TOWARD,
  smartChecks: WORKING_TOWARD,
  goalTargetDate: WORKING_TOWARD,
  goalHistory: WORKING_TOWARD,
  nickname: CONTACT,
  firstName: CONTACT,
  lastName: CONTACT,
  dateOfBirth: CONTACT,
  gender: CONTACT,
  phone: CONTACT,
  email: CONTACT,
  address: CONTACT,
  emergencyContactName: CONTACT,
  emergencyContactPhone: CONTACT,
  contractTierOverride: MEMBERSHIP,
  approvedCrossTrainStudioIds: TRAIN_AT,
  leadSource: FOUND_US,
  referredBy: FOUND_US,
};

const pageRank = (page: RecordPage) => RECORD_PAGE_IDS.indexOf(page);
const anchorRank = (anchor: RecordAnchor) => (RECORD_ANCHORS as readonly string[]).indexOf(anchor);

/**
 * Where the unsaved fields are, for the Save bar: one place per card, in
 * page order and then in the order the cards sit on the page. Occupation
 * and "retired" are one card, so they are one place.
 */
export function dirtyWhere(keys: Iterable<RecordFormKey>): SaveBarPlace[] {
  const seen = new Map<RecordAnchor, FieldHome>();
  for (const key of keys) {
    const home = FIELD_HOME[key];
    if (home && !seen.has(home.anchor)) seen.set(home.anchor, home);
  }
  return [...seen.values()]
    .sort((a, b) => pageRank(a.page) - pageRank(b.page) || anchorRank(a.anchor) - anchorRank(b.anchor))
    .map(({ page, anchor, label }) => ({ page, anchor, label }));
}

/* ------------------------------------------------------------------ */
/* Seeding                                                             */
/* ------------------------------------------------------------------ */

/**
 * What an editor shows for a field the record does not have. Text starts
 * empty and a choice starts unpicked — never "Sedentary" or "Novice", which
 * made an unset field look assessed and was written on the first save.
 * A key not listed here (a checklist, a date, the history, the lock) is
 * seeded only when the record has it, so an editor reads "not on file" as
 * the record's own value.
 */
const BLANK: Partial<Record<RecordFormKey, unknown>> = {
  occupation: "",
  workProfile: null,
  isRetired: false,
  activityLevel: "",
  recreationActivities: [],
  height: "",
  wingspan: "",
  weight: "",
  fitnessBackground: [],
  needsUnteaching: false,
  trainingPedigree: "",
  pedigreeHistory: [],
  experienceLevel: "",
  clinicalFlags: [],
  medicalHistory: "",
  clinicalNotes: "",
  discoveryNotes: "",
  globalNotes: "",
  smartGoal: "",
  nickname: "",
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  email: "",
  address: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  approvedCrossTrainStudioIds: [],
  leadSource: "",
  referredBy: "",
};

/** The form as the record stands: every editable field, blanks for the missing ones. */
export function seedForm(client: Partial<Client> | null | undefined): RecordFormData {
  const out: Record<string, unknown> = {};
  for (const key of RECORD_FORM_KEYS) {
    const saved = (client as Record<string, unknown> | null | undefined)?.[key];
    const hasSaved = saved !== undefined && saved !== null && saved !== "";
    if (hasSaved) out[key] = saved;
    else if (Object.prototype.hasOwnProperty.call(BLANK, key)) out[key] = BLANK[key];
    else if (saved !== undefined) out[key] = saved;
  }
  return out as RecordFormData;
}

/* ------------------------------------------------------------------ */
/* What counts as a change                                             */
/* ------------------------------------------------------------------ */

/** "Nothing on file", in any of the shapes an editor or the record uses for it. */
function isNothing(v: unknown): boolean {
  return v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Whether two values of a field are the same thing. Nothing equals nothing
 * (a cleared lock is null, a field never set is undefined, an empty box is
 * ""); arrays and plain objects compare by value, so ticking a checklist
 * and unticking it again is not an edit; a Firestore Timestamp compares with
 * its own `isEqual`.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isNothing(a) && isNothing(b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      // A key that is absent and a key that is undefined are the same.
      if (a[k] === undefined && b[k] === undefined) continue;
      if (!sameValue(a[k], b[k])) return false;
    }
    return true;
  }
  const eq = (a as { isEqual?: (other: unknown) => boolean } | null)?.isEqual;
  if (typeof eq === "function" && b && typeof b === "object") {
    try {
      return Boolean(eq.call(a, b));
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * The dirty set after one edit: the field is unsaved when its new value is
 * not the SAVED value (not the last typed one), so typing a word and
 * deleting it again leaves nothing to save.
 */
export function nextDirty(
  prev: ReadonlySet<RecordFormKey>,
  key: RecordFormKey,
  value: unknown,
  client: Partial<Client> | null | undefined,
): ReadonlySet<RecordFormKey> {
  const saved = (client as Record<string, unknown> | null | undefined)?.[key];
  const changed = !sameValue(value, saved);
  if (changed === prev.has(key)) return prev;
  const next = new Set(prev);
  if (changed) next.add(key);
  else next.delete(key);
  return next;
}

/* ------------------------------------------------------------------ */
/* What a save writes                                                  */
/* ------------------------------------------------------------------ */

/**
 * The update for one Save: the changed fields and who changed them, nothing
 * else. Never `renewal` (it is not a form key, and nothing else gets through)
 * and never `undefined` anywhere, which Firestore refuses.
 */
export function savePayload(
  dirty: Iterable<RecordFormKey>,
  formData: RecordFormData,
  trainerId: string | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of dirty) {
    if (!isRecordFormKey(key)) continue;
    out[key] = (formData as Record<string, unknown>)[key];
  }
  if (trainerId) out.lastUpdatedBy = trainerId;
  return withoutUndefined(out);
}
