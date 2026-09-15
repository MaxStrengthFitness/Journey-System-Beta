/**
 * LIFE — the structured half of the record's Life section (client-profile
 * audit, Sep 2026). FORD holds the stories; this holds the few facts a
 * leader can count across a whole studio ("clients who are on their feet all
 * day gain strength fastest") and a coach reads to set expectations.
 *
 * WORK. The audit asks for "strategic, slightly vague categories rather than
 * hyper-specific job titles", grouped by what the job does to the body. The
 * old occupation list (data/occupational-matrix.ts) maps onto them, so every
 * client who already has an occupation lands in a category without anyone
 * touching them. RETIRED is a toggle that keeps the previous work: a retired
 * welder's back still carries forty years of welding.
 *
 * ACTIVITY is how active they are outside the studio, in words a client can
 * answer. EXPERIENCE is two things: where they came from (static-ish — and
 * experience is not always good: sometimes a coach has to unteach), and how
 * far they have come in the protocol (dynamic — every step up is dated).
 */

import { OCCUPATIONS } from "../../data/occupational-matrix";
import type { Client } from "../../types";

/* ------------------------------------------------------------------ *
 * Work
 * ------------------------------------------------------------------ */

export interface WorkProfile {
  id: string;
  label: string;
  /** What it means for training, one line. */
  note: string;
}

export const WORK_PROFILES: WorkProfile[] = [
  { id: "seated", label: "Seated / desk", note: "Long hours sitting — hips, low back and neck take the load." },
  { id: "on-feet", label: "On their feet", note: "Hours standing and walking — legs and feet arrive tired." },
  { id: "heavy", label: "Heavy physical work", note: "Lifting and labour — recovery between sessions matters." },
  { id: "driving", label: "Driving / travel-heavy", note: "Long drives or flights — schedules get disrupted." },
  { id: "high-stress", label: "High-stress leadership", note: "Big responsibility — stress and sleep swing." },
  { id: "mixed", label: "Moves around", note: "A mix of desk, standing and walking." },
  { id: "home", label: "Home & caregiving", note: "Lifting, floor-to-stand, unpredictable days." },
  { id: "student", label: "Student", note: "Seated study with an irregular schedule." },
];

const PROFILE_BY_OCCUPATION: Record<string, string> = {
  "occ-exec": "high-stress",
  "occ-lawyer": "seated",
  "occ-finance": "seated",
  "occ-consultant": "driving",
  "occ-md": "on-feet",
  "occ-dentist": "seated",
  "occ-rn": "on-feet",
  "occ-clinic-admin": "seated",
  "occ-software": "seated",
  "occ-aero-eng": "seated",
  "occ-scientist": "mixed",
  "occ-re-broker": "mixed",
  "occ-outside-sales": "driving",
  "occ-ops-manager": "mixed",
  "occ-logistics": "seated",
  "occ-uni-faculty": "seated",
  "occ-teacher": "on-feet",
  "occ-sah-active": "home",
  "occ-sah-sedentary": "home",
};

const KEYWORDS: [RegExp, string][] = [
  [/\b(ceo|cfo|coo|owner|founder|president|executive|director)\b/, "high-stress"],
  [/\b(nurse|teacher|retail|server|chef|cook|stylist|barber|pharmacist|surgeon|physician)\b/, "on-feet"],
  [/\b(construction|plumber|electrician|carpenter|mechanic|welder|landscap|farmer|warehouse|plant operator|laborer|labourer|firefighter)\b/, "heavy"],
  [/\b(driver|trucker|pilot|flight|sales rep|travel)\b/, "driving"],
  [/\b(software|developer|engineer|accountant|attorney|lawyer|analyst|admin|office|designer|writer)\b/, "seated"],
  [/\b(student)\b/, "student"],
  [/\b(stay at home|homemaker|caregiver|parent)\b/, "home"],
];

export function workProfileById(id: string | null | undefined): WorkProfile | null {
  return WORK_PROFILES.find((p) => p.id === id) ?? null;
}

/**
 * The work category for a client: the one a coach picked, else read from the
 * occupation they already have. Null when neither says.
 */
export function workProfileOf(client: Pick<Client, "occupation"> & { workProfile?: string | null }): WorkProfile | null {
  const picked = workProfileById(client.workProfile);
  if (picked) return picked;
  const title = (client.occupation || "").trim();
  if (!title) return null;
  const occ = OCCUPATIONS.find((o) => o.title === title || o.id === title);
  if (occ && PROFILE_BY_OCCUPATION[occ.id]) return workProfileById(PROFILE_BY_OCCUPATION[occ.id]);
  const lower = title.toLowerCase();
  for (const [re, id] of KEYWORDS) if (re.test(lower)) return workProfileById(id);
  return null;
}

/** Old list entries that were really a retirement status, not an occupation. */
export function isRetirementTitle(title: string | null | undefined): boolean {
  return /^retired\b/i.test((title || "").trim());
}

/** "Retired — was seated / desk (Software Developer / IT)". */
export function workSentence(client: Pick<Client, "occupation" | "isRetired"> & { workProfile?: string | null }): string {
  const profile = workProfileOf(client);
  const title = isRetirementTitle(client.occupation) ? "" : (client.occupation || "").trim();
  const what = [profile?.label.toLowerCase(), title ? `(${title})` : ""].filter(Boolean).join(" ");
  if (client.isRetired) return what ? `Retired — was ${what}` : "Retired";
  return what ? what.charAt(0).toUpperCase() + what.slice(1) : "Work not recorded yet";
}

/* ------------------------------------------------------------------ *
 * Activity outside the studio
 * ------------------------------------------------------------------ */

export const ACTIVITY_LEVELS: { value: NonNullable<Client["activityLevel"]>; label: string; hint: string }[] = [
  { value: "Sedentary", label: "Sedentary", hint: "Mostly sitting; quiet evenings" },
  { value: "Light", label: "Light", hint: "Walks, errands, light chores" },
  { value: "Moderate", label: "Moderate", hint: "An active hobby a few times a week" },
  { value: "High", label: "High", hint: "Plays or trains most days" },
  { value: "Manual Labor", label: "Physical job", hint: "Their work is the workout" },
];

/** Quick picks for what they do outside the studio. Free text is allowed too. */
export const RECREATION_CHOICES = [
  "Pickleball",
  "Golf",
  "Tennis",
  "Walking",
  "Running",
  "Cycling",
  "Swimming",
  "Hiking",
  "Yoga / Pilates",
  "Group fitness",
  "Gardening",
  "Dancing",
] as const;

/* ------------------------------------------------------------------ *
 * Experience
 * ------------------------------------------------------------------ */

export const FITNESS_BACKGROUNDS = [
  "Never trained",
  "Physical therapy",
  "General gym",
  "Strength training",
  "Athlete",
] as const;

export const PEDIGREE_LEVELS = ["Novice", "Intermediate", "Advanced", "Protocol Veteran"] as const;

export interface PedigreeStep {
  level: string;
  /** ISO date-time. */
  at: string;
  byName?: string;
}

/**
 * The protocol-mastery history after a change on the form. Always built from
 * the SAVED history, so changing the level twice before Save leaves one new
 * step, and changing it back to the saved level leaves none.
 */
export function nextPedigreeHistory(
  saved: readonly PedigreeStep[] | null | undefined,
  savedLevel: string | null | undefined,
  newLevel: string,
  at: string,
  byName?: string,
): PedigreeStep[] {
  const base = [...(saved || [])];
  if (!newLevel || newLevel === (savedLevel || "")) return base;
  // A client who had a level before history existed keeps it as step one.
  if (base.length === 0 && savedLevel) base.push({ level: savedLevel, at: "" });
  const step: PedigreeStep = { level: newLevel, at };
  if (byName) step.byName = byName;
  return [...base, step].slice(-20);
}

/** "Novice → Intermediate (Jun 2026)". */
export function pedigreeTrail(history: readonly PedigreeStep[] | null | undefined): string | null {
  if (!history || history.length < 2) return null;
  return history
    .map((s) => {
      const d = s.at ? new Date(s.at) : null;
      const when = d && !Number.isNaN(d.getTime()) ? ` (${d.toLocaleDateString(undefined, { month: "short", year: "numeric" })})` : "";
      return `${s.level}${when}`;
    })
    .join(" → ");
}
