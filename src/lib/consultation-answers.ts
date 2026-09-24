/**
 * WHAT A CONSULTATION MAY WRITE — only what somebody answered.
 *
 * Interim fix, Sep 24 2026 (AJ: "Eliminate Ghost Data Injection"). Both
 * consultation screens started every client as a 40-year-old man: the Initial
 * Consultation defaulted age to 40 and gender to Male and saved both, and the
 * tracker's First-Time Setup started on Male and wrote it over whatever gender
 * the client already had — on Skip too. New-client intake wrote a height of
 * 5'10" and a session count nobody had sold. Height, gender and age feed
 * Machine fit's cohorts (features/machine-fit/factors.ts) and the session's
 * cohort snapshot, so an invented profile did not stay on one screen: it
 * became a data point about people like her.
 *
 * The rules this file holds:
 *
 *   - An unanswered field is never written. It is left ABSENT — not null, not
 *     a default, not an empty string.
 *   - A default never overwrites a stored value. The screens start from what
 *     is on file, and a blank answer leaves the stored value alone.
 *   - A suggestion that needs an unanswered fact is not made. A starting load
 *     worked out for a man of 40 is a confident wrong number, and a confident
 *     wrong number is worse than a missing one.
 *
 * Pure, no Firestore. The consultation redesign will replace these screens;
 * until then this is the one place they decide what to write.
 */
import { calculateStartingWeight, type Gender, type SkillLevel } from "./consultation-utils";
import { safeToDate } from "./utils";
import { withoutUndefined } from "../features/studio-tasks/task-wizard";

/** A gender the consultation screens can pick, or null when nobody has said. */
export function knownGender(value: unknown): Gender | null {
  return value === "Male" || value === "Female" ? value : null;
}

/**
 * A typed age, or null when it is blank or not an age.
 *
 * `parseInt("") || 0` used to turn a cleared box into 0, and `parseInt("abc")`
 * into NaN — both then saved as the client's age.
 */
export function parseAge(input: unknown): number | null {
  const n = typeof input === "number" ? input : parseInt(String(input ?? "").trim(), 10);
  if (!Number.isFinite(n)) return null;
  const whole = Math.floor(n);
  return whole >= 1 && whole <= 120 ? whole : null;
}

/** The age already on file: the typed age, then one worked out from the birth date. */
export function ageOnFile(
  client: { age?: unknown; dateOfBirth?: unknown } | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!client) return null;
  const typed = parseAge(client.age);
  if (typed !== null) return typed;
  const birth = safeToDate(client.dateOfBirth);
  if (!birth) return null;
  const years = new Date(now.getTime() - birth.getTime()).getUTCFullYear() - 1970;
  return parseAge(years);
}

/** Gender and age for the client record: only the ones that were answered. */
export function demographicsPatch(answers: {
  gender?: Gender | null;
  age?: number | null;
}): { gender?: Gender; age?: number } {
  const gender = knownGender(answers.gender);
  const age = parseAge(answers.age);
  return withoutUndefined({
    gender: gender ?? undefined,
    age: age ?? undefined,
  });
}

/**
 * Everything the Initial Consultation writes to the client record.
 *
 * A text answer is written when something was typed. A blank one is left out,
 * so it never replaces what is already on file with an empty string.
 */
export function consultationPatch(answers: {
  gender: Gender | null;
  age: number | null;
  occupation: string;
  medicalHistory: string;
  activity: string;
  goals: string;
}): Record<string, string | number> {
  const typed = (s: string) => (s.trim() ? s : undefined);
  return withoutUndefined({
    ...demographicsPatch(answers),
    occupation: typed(answers.occupation),
    medicalHistory: typed(answers.medicalHistory),
    activity: typed(answers.activity),
    goals: typed(answers.goals),
  }) as Record<string, string | number>;
}

/**
 * The suggested starting load, or null when gender or age is unanswered.
 * (A known machine name with both answered can still come back 0 — see the
 * exact-name note in calculateStartingWeight. That is left as found.)
 */
export function suggestedStartingWeight(
  machineName: string,
  gender: Gender | null,
  age: number | null,
  skillLevel: SkillLevel,
): number | null {
  if (!gender || age === null) return null;
  return calculateStartingWeight(machineName, gender, age, skillLevel);
}

/** The setup note the Initial Consultation files to the Journal. */
export function consultationNoteBody(answers: {
  age: number | null;
  skillLevel: SkillLevel;
  goals: string;
}): string {
  const facts = [answers.age !== null ? `Age: ${answers.age}` : null, `Skill: ${answers.skillLevel}`]
    .filter(Boolean)
    .join(", ");
  const goals = answers.goals.trim();
  return `Consultation. ${facts}.${goals ? ` Goals: ${goals}` : ""}`;
}

/* ------------------------------------------------------------------ *
 * New-client intake (CreateClientModal)
 * ------------------------------------------------------------------ */

export type NewClientKind = "prospect" | "existing";

export interface NewClientAnswers {
  kind: NewClientKind;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  gender: string;
  age: string;
  homeStudioId: string;
  discoveryNotes: string;
}

/**
 * Whether the intake can be saved. A home studio is required: the clients
 * create rule (firestore.rules) lets a trainer create a client only at a
 * studio they belong to, and a client with no studio belongs to nobody — so
 * an "optional" blank studio was a form that refused every save below super
 * admin, with a permission error.
 */
export function canSaveNewClient(a: Pick<NewClientAnswers, "firstName" | "lastName" | "homeStudioId">): boolean {
  return !!a.firstName && !!a.lastName && !!a.homeStudioId.trim();
}

/**
 * The new client document, before its timestamps.
 *
 * `remainingSessions: 0` is not a claim about her package. The rules refuse a
 * client without a numeric `remainingSessions`, Mindbody owns packages, and
 * every other place Journey creates a client (the Mindbody pull sync, Limbo,
 * temporary profiles) writes the same 0. The old 1 for a prospect and 10 for
 * an existing client were invented. `height` is not written at all.
 */
export function newClientPayload(a: NewClientAnswers): Record<string, unknown> {
  const typed = (s: string) => (s.trim() ? s : undefined);
  return withoutUndefined({
    firstName: a.firstName,
    lastName: a.lastName,
    phone: typed(a.phone),
    email: typed(a.email),
    discoveryNotes: typed(a.discoveryNotes),
    isActive: true,
    completedSessions: 0,
    sessionCount: 0,
    remainingSessions: 0,
    gender: typed(a.gender),
    age: parseAge(a.age) ?? undefined,
    homeStudioId: a.homeStudioId.trim(),
    consultationCompleted: a.kind === "existing",
    requiresConsultation: a.kind === "prospect",
  });
}
