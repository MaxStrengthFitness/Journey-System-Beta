/**
 * BODY & PULSE → BUILD — her build as the machines see it, in sentences.
 *
 * Client codex, Sep 2026 (phase 12). The long scroll showed height, wingspan
 * and weight as three input boxes and left the reader to work out what they
 * meant for the set-up. The Build card reads them instead: where she sits
 * against the height the catalog's machines are set for (the stature band the
 * machine window already uses), her reach, a scan's weight over a typed one,
 * her work and what she does outside the studio, and the Training story that
 * moved here from Life (AJ's decision 6).
 *
 * The rules it keeps:
 *  - UNKNOWN IS NOT A GUESS. Every number comes through machine fit's
 *    `factorsOf`, which reads "5'4"", "64" and "148 lbs" and returns null for
 *    anything it cannot — so a typo is said to be unreadable, never read as
 *    average. An empty field reads "Not recorded yet", never blank.
 *  - The form wins over the record: the card shows what Save will write, so
 *    an unsaved edit reads back at once (`formData` over `client`).
 *  - A scan is measured and a typed weight is remembered, so the scan wins —
 *    the same precedence `factorsOf` gives the set-up cohorts — and each value
 *    names where it came from.
 *  - No body-type label and no load: the stature band against the catalog's
 *    baseline is all the page says about "a type of person", and the trainer
 *    decides what it means.
 *
 * Pure: no React, no Firestore, no clock of its own. build.test.ts.
 */
import type { Client } from "../../../types";
import { factorsOf, formatInches, parsePounds } from "../../machine-fit/factors";
import { statureBand, type StatureBand } from "../../equipment/setting-suggestions";
import { pedigreeTrail, recreationSentence, workProfileOf, workSentence } from "../../client-life/life";
import { mindbodyIdOf } from "../../../lib/mindbody-id";
import type { Pronouns } from "../kit/pronouns";
import { dayKeyDate, monthDayYear } from "../kit/text";

/** What an empty field reads. Never blank. */
export const NOT_RECORDED = "Not recorded yet";

/** The fields Build reads, the form's value over the record's. */
type BuildFields = Pick<
  Client,
  | "height"
  | "wingspan"
  | "weight"
  | "gender"
  | "dateOfBirth"
  | "occupation"
  | "workProfile"
  | "isRetired"
  | "activityLevel"
  | "recreationActivities"
  | "fitnessBackground"
  | "needsUnteaching"
  | "trainingPedigree"
  | "pedigreeHistory"
  | "experienceLevel"
>;

/** The form's value when it holds one, else the saved one. */
function pick<K extends keyof BuildFields>(formData: Partial<Client>, client: Client, key: K): Client[K] {
  return (key in formData ? formData[key] : client[key]) as Client[K];
}

export interface BuildFact {
  text: string;
  source: string | null;
}

export interface BuildFacts {
  band: StatureBand | null;
  heightIn: number | null;
  /** The height as typed ("5'0\""), trimmed; "" when none. */
  heightRaw: string;
  /** Something is typed, and the app cannot read it as a height. */
  heightUnreadable: boolean;
  /** The card's one sentence: where she sits against the machines. */
  lede: string;
  height: BuildFact;
  /** Null when no wingspan is on file (the row is left out). */
  reach: BuildFact | null;
  weight: BuildFact;
  bodyFat: BuildFact;
  ageSex: BuildFact;
  work: BuildFact;
  outside: BuildFact;
  training: {
    before: BuildFact;
    protocol: BuildFact;
    strength: BuildFact;
  };
}

/**
 * The height the catalog's machines are set for, in the words the source
 * line uses — the same numbers `statureBand` measures against.
 */
export function baselineWords(gender: string | null | undefined): string {
  const g = (gender || "").trim().toLowerCase();
  if (g.startsWith("m")) return `men is 5'9"`;
  if (g.startsWith("f")) return `women is 5'4"`;
  return `clients with no gender on file is 5'6½"`;
}

/** 1 → "1", 1.5 → "1.5": an inch count as the source line prints it. */
function inches(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * The card's lede. `heightUnreadable` wins over the band: a typed height the
 * app cannot read is neither average nor missing.
 */
export function statureLede(
  band: StatureBand | null,
  opts: { heightUnreadable?: boolean; heightRaw?: string; pronouns: Pick<Pronouns, "object"> },
): string {
  if (opts.heightUnreadable) {
    return `The height on file (“${(opts.heightRaw ?? "").trim()}”) isn't one the app can read. Write it like 5'4" or 64.`;
  }
  if (band === "shorter") return "Shorter than our machines are set for.";
  if (band === "taller") return "Taller than our machines are set for.";
  if (band === "average") return `Within 3" of the height our machines are set for.`;
  return `No height on file, so machine set-up can't be matched to ${opts.pronouns.object}.`;
}

/** How her reach compares with her height: "1" less than her height". Null without both. */
export function reachSentence(
  heightIn: number | null,
  wingspanIn: number | null,
  pronouns: Pick<Pronouns, "possessive">,
): string | null {
  if (wingspanIn === null) return null;
  if (heightIn === null) return `No height on file to compare it with.`;
  const diff = wingspanIn - heightIn;
  if (Math.abs(diff) < 0.05) return `The same as ${pronouns.possessive} height`;
  return diff < 0
    ? `${inches(-diff)}" less than ${pronouns.possessive} height`
    : `${inches(diff)}" more than ${pronouns.possessive} height`;
}

/** "Mar 3", or "Mar 3, 2025" when it is not this year; "" for anything that is not a day key. */
function scanDay(key: string | null | undefined, today: Date): string {
  const d = dayKeyDate(key);
  return d ? monthDayYear(d, today) : "";
}

function positive(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** 34.1 → "34.1%". */
function pct(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

export function buildFacts({
  client,
  formData,
  pronouns,
  now,
}: {
  client: Client;
  formData: Partial<Client>;
  pronouns: Pronouns;
  /** The studio's today, for age and for "Mar 3" against "Mar 3, 2025". */
  now: Date;
}): BuildFacts {
  const heightRaw = String(pick(formData, client, "height") ?? "").trim();
  const gender = (pick(formData, client, "gender") as string | undefined) ?? null;
  const factors = factorsOf(
    {
      height: heightRaw,
      wingspan: (pick(formData, client, "wingspan") as string | undefined) ?? null,
      weight: (pick(formData, client, "weight") as string | undefined) ?? null,
      gender,
      dateOfBirth: (pick(formData, client, "dateOfBirth") as string | undefined) ?? null,
      inbodySummary: client.inbodySummary ?? null,
    },
    now,
  );
  const heightUnreadable = heightRaw !== "" && factors.heightIn === null;
  const band = statureBand(factors.heightIn, gender);

  const height: BuildFact = {
    text:
      factors.heightIn !== null ? formatInches(factors.heightIn) : heightUnreadable ? `“${heightRaw}”` : NOT_RECORDED,
    source: `The catalog baseline for ${baselineWords(gender)}; 3" or more under it counts as shorter, 3" or more over it as taller.`,
  };

  const reachLine = reachSentence(factors.heightIn, factors.wingspanIn, pronouns);
  const reach: BuildFact | null =
    factors.wingspanIn !== null && reachLine
      ? { text: `${formatInches(factors.wingspanIn)} wingspan`, source: reachLine }
      : null;

  // A scan is measured, a typed weight remembered: the scan wins (factorsOf's order).
  const latest = client.inbodySummary?.latest ?? null;
  const scanWeight = parsePounds(positive(latest?.weightLb));
  const typedWeight = parsePounds((pick(formData, client, "weight") as string | undefined) ?? null);
  const scanDate = scanDay(client.inbodySummary?.latestTestedAt, now);
  const weight: BuildFact =
    scanWeight !== null
      ? { text: `${scanWeight} lb`, source: scanDate ? `InBody, ${scanDate}` : "InBody" }
      : typedWeight !== null
        ? { text: `${typedWeight} lb`, source: `Typed on ${pronouns.possessive} record` }
        : { text: NOT_RECORDED, source: null };

  const fat = positive(latest?.percentBodyFat);
  const bodyFat: BuildFact =
    fat !== null
      ? { text: pct(fat), source: scanDate ? `InBody, ${scanDate}` : "InBody" }
      : { text: "No InBody scan yet", source: null };

  const linked = !!mindbodyIdOf(client) && !client.provisional;
  const sex = (gender ?? "").trim().toLowerCase();
  const ageSexParts = [factors.ageYears !== null ? String(factors.ageYears) : "", sex].filter(Boolean);
  const ageSex: BuildFact = ageSexParts.length
    ? { text: ageSexParts.join(" · "), source: linked ? "From Mindbody" : `On ${pronouns.possessive} record` }
    : { text: NOT_RECORDED, source: null };

  const workFields = {
    occupation: pick(formData, client, "occupation") as string | undefined,
    workProfile: pick(formData, client, "workProfile") as string | null | undefined,
    isRetired: pick(formData, client, "isRetired") as boolean | undefined,
  };
  const profile = workProfileOf(workFields);
  const workText = workSentence(workFields);
  const work: BuildFact = {
    text: workText === "Work not recorded yet" ? NOT_RECORDED : workText,
    source: profile ? `From FORD · Occupation. ${profile.note}` : "From FORD · Occupation",
  };

  const outsideText = recreationSentence({
    activityLevel: pick(formData, client, "activityLevel") as Client["activityLevel"],
    recreationActivities: pick(formData, client, "recreationActivities") as string[] | undefined,
  });
  const outside: BuildFact = { text: outsideText, source: "From FORD · Recreation" };

  const background = ((pick(formData, client, "fitnessBackground") as string[] | undefined) ?? [])
    .map((b) => (b ?? "").trim())
    .filter(Boolean);
  const unteach = !!pick(formData, client, "needsUnteaching");
  const beforeText = background.length
    ? `${background.join(", ")}${unteach ? ", has habits to unteach" : ""}`
    : unteach
      ? "Has habits to unteach"
      : NOT_RECORDED;

  const pedigree = String(pick(formData, client, "trainingPedigree") ?? "").trim();
  const history =
    (pick(formData, client, "pedigreeHistory") as Client["pedigreeHistory"]) ?? client.pedigreeHistory ?? [];
  const trail = pedigreeTrail(history);
  const cue = "Sets the rep range the Journey grid's cue reads";
  const experience = String(pick(formData, client, "experienceLevel") ?? "").trim();

  return {
    band,
    heightIn: factors.heightIn,
    heightRaw,
    heightUnreadable,
    lede: statureLede(band, { heightUnreadable, heightRaw, pronouns }),
    height,
    reach,
    weight,
    bodyFat,
    ageSex,
    work,
    outside,
    training: {
      before: { text: beforeText, source: null },
      protocol: { text: pedigree || NOT_RECORDED, source: trail ? `${trail} · ${cue}` : cue },
      strength: { text: experience || NOT_RECORDED, source: "Sets the studio's suggested starting weights" },
    },
  };
}

/**
 * The live reading under the height box while it is typed: what the app
 * will read it as, or that it cannot — so a trainer sees "5'4"" before Save.
 */
export function heightHint(raw: string | null | undefined, heightIn: number | null): string {
  const text = (raw ?? "").trim();
  if (!text) return `Write it like 5'4" or 64. Used for machine set-up.`;
  return heightIn === null
    ? `The app can't read this as a height. Write it like 5'4" or 64.`
    : `Reads as ${formatInches(heightIn)}.`;
}
