/**
 * MINDBODY'S ACCOUNT NOTES, LINE BY LINE — the intake matcher (client codex,
 * phase 17; AJ's decision 4).
 *
 * A studio types a new client's sign-up answers into the Mindbody account
 * notes: "OCC: Retired dental hygienist. / MED: R TKA Mar 2024. / ACTIVITY:
 * Pickleball 2x/wk, gardening. / GOALS: Keep up w/ grandkids." The real client
 * AJ looked at had all four in Mindbody and none of them in Journey. The
 * Mindbody webhook and Master Sync already bring the notes onto the record
 * (`client.mindbodyNotes`, the first 1,000 characters); this module reads
 * them as lines and says, for each one, where in Journey it belongs and
 * whether Journey already has something there. The Account page's card
 * (`IntakeNotesCard`) shows the answer beside
 * each line and offers ONE tap to put it there.
 *
 * WHAT IT WILL AND WILL NOT DO
 *  - The words are never rewritten. A line is copied exactly as Mindbody has
 *    it (whitespace aside), or not at all.
 *  - Nothing is copied on its own. Every copy is a trainer's tap.
 *  - Where each kind goes (INTEGRATION's ruling):
 *      Occ       → her job title (`occupation`), only while the job title is
 *                  empty, staged for the Save bar. A line that could not be
 *                  a job title (longer than the box, or more than one line)
 *                  is not offered.
 *      Activity  → a pinned FORD Recreation detail, saved at once, marked
 *                  `origin: "mindbody_intake"` so the FORD page says where
 *                  the words came from. FORD is a list, so it is offered
 *                  unless these exact words are already a detail — the app
 *                  cannot tell whether "Moderate · Golf" says the same thing.
 *                  Only to a reader the FORD create rule accepts: someone
 *                  who trains at or leads her home studio.
 *      Goals     → her why (`globalNotes`), only while it is empty, staged.
 *      Med       → her medical history (`medicalHistory`), staged: added to
 *                  what is there, never replacing it.
 *  - IT NEVER JUDGES WHETHER HER MEDICAL NOTES ARE COVERED. Two clinical flags
 *    and a paragraph of history may or may not say what "R TKA Mar 2024"
 *    says; only a person can tell. So the medical line is offered unless
 *    these exact words — whole words, in order — are already in the
 *    history ("knee" is not in "Kneecap fracture"), and when Body has
 *    anything on file the row says to read both side by side. The tests
 *    hold the wording to that.
 *  - A FORD answer it could not read is UNKNOWN, never "nothing": with FORD
 *    loading, failed or kept by another studio, the Activity line says so and
 *    offers nothing (a second copy of a line is the one harm a tap can do).
 *  - Notes as long as the sync keeps (1,000 characters) may have been cut, so
 *    their last line is shown but never offered: it may stop mid-sentence.
 *
 * THE PARSER only splits where a label says to. At the start of a line any
 * short label ("Occ:", "Occ.:", "OCCUPATION -", "Pmt:") starts a new line of
 * the card; in the middle of a line only a KNOWN label after a sentence break
 * does ("Occ: nurse. Med: asthma"), or one straight after an empty label
 * ("Occ:   Med: asthma", a blank field of the sign-up form), so "call re:
 * payment", "7:00" and "https://" are never cut. A line whose label it does
 * not know is shown exactly as typed, colon and all ("Pmt: autopay",
 * "Please call re: billing"), with no offer; so is unlabelled text. A line
 * with no label continues the one above it, unless a blank line came
 * between. No regex lookbehind anywhere (older iPadOS Safari fails the whole
 * module on one).
 *
 * Pure: no React, no Firestore. intake.test.ts.
 */
import type { Client } from "../../types";
import type { RecordAnchor, RecordPage } from "../client-profile/profile-nav";
import type { CodexFordStatus } from "../client-codex/codex-data";
import { MINDBODY_NOTES_MAX } from "../../lib/mindbody-demographics-map";
import { FORD_META, type FordEntry } from "../ford/types";
import { FORD_READ_NOTICE } from "../ford/read-status";
import { JOB_TITLE_MAX, isRetirementTitle, recreationSentence, workSentence } from "../client-life/life";
import { cap, curly, plural } from "../client-codex/kit/text";
import type { Pronouns } from "../client-codex/kit/pronouns";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type IntakeKind = "occupation" | "medical" | "activity" | "goals" | "other";

/** One line of the card: a label as written (if any) and the words after it. */
export interface IntakeLine {
  /** Position on the card, from 0. */
  index: number;
  kind: IntakeKind;
  /**
   * A KNOWN label as written, without its colon or dash ("OCC", "Med Hx");
   * null when the line has none, or one the matcher does not know (that
   * label stays in `text`, as typed).
   */
  label: string | null;
  /** The words, verbatim but for whitespace (runs of spaces collapsed, each line trimmed). */
  text: string;
  /** The notes reached the sync's 1,000-character cap, and this is the last line: it may be cut off. */
  truncated: boolean;
}

export interface ParsedIntake {
  lines: IntakeLine[];
  /** The notes are as long as the sync keeps, so Mindbody may hold more. */
  truncated: boolean;
}

/** Where a line belongs. */
export type IntakeTarget = "occupation" | "body" | "recreation" | "her-why";

/** The record fields a tap may stage (the Save bar saves them). */
export type IntakeField = "occupation" | "globalNotes" | "medicalHistory";

export type IntakeAction =
  /** Saved at once: a pinned FORD Recreation detail, the words verbatim. */
  | { kind: "ford"; pillar: "recreation"; label: string; body: string; isPinned: true }
  /** Staged on the record form: `set` an empty field, or `append` to what is there. */
  | { kind: "field"; field: IntakeField; mode: "set" | "append"; label: string; text: string };

/**
 * What Journey has for one line:
 *  nothing    nothing in that place yet
 *  something  something is there; the app does not judge whether it says the same
 *  unknown    it could not be checked (FORD not read, or not readable here)
 *  present    these exact words are already there
 */
export type IntakeJourney = "nothing" | "something" | "unknown" | "present";

export interface IntakeDoor {
  page: RecordPage;
  anchor: RecordAnchor;
  /** The button's words: "Open Occupation". */
  label: string;
}

export interface IntakeMatch {
  line: IntakeLine;
  /** Stable across re-reads of the same notes: the kind and the words. */
  key: string;
  target: IntakeTarget | null;
  /** Where it belongs, in the page's words: "Occupation", "Her why". */
  targetLabel: string | null;
  journey: IntakeJourney;
  /** What the row says about it; null for a line with nowhere to go. */
  sentence: string | null;
  /** The one tap on offer; null when there is none (or nothing to offer). */
  action: IntakeAction | null;
  door: IntakeDoor | null;
}

/** The record's values as the editors hold them (the form's, else the record's). */
export type IntakeView = Partial<
  Pick<
    Client,
    | "occupation"
    | "isRetired"
    | "activityLevel"
    | "recreationActivities"
    | "clinicalFlags"
    | "medicalHistory"
    | "clinicalNotes"
    | "globalNotes"
  >
> & { workProfile?: string | null };

/** The tab's one FORD stream, as this reader may see it. */
export interface IntakeFord {
  status: CodexFordStatus;
  /** FORD's details (the legacy events included; the one-line document is never here). */
  entries: readonly FordEntry[];
  /** The studio FORD is read by and written with (`fordStudioIdOf`); "" when the client has none. */
  studioId: string;
  /**
   * The FORD create rule would take a detail from this reader
   * (`codexAccess().fordWritable`: trains at or leads her home studio). An
   * administrator or franchise owner who works elsewhere READS FORD but is
   * refused a new detail, so is offered none.
   */
  canAdd: boolean;
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

/**
 * The labels the matcher knows, by kind. A label is compared lower-case,
 * with a trailing "." dropped, hyphens read as spaces and spaces collapsed —
 * so "OCC", "Occ.", "Med-Hx" and "long-term goal" all count.
 */
export const INTAKE_ALIASES: Readonly<Record<Exclude<IntakeKind, "other">, readonly string[]>> = {
  occupation: ["occ", "occupation", "job", "work", "career", "profession", "employment", "employer"],
  medical: [
    "med",
    "meds",
    "medical",
    "medical history",
    "med hx",
    "medication",
    "medications",
    "health",
    "health history",
    "hx",
    "pmh",
    "injury",
    "injuries",
    "surgery",
    "surgeries",
    "condition",
    "conditions",
    "limitation",
    "limitations",
    "restrictions",
    "precautions",
  ],
  activity: [
    "activity",
    "activities",
    "act",
    "active",
    "exercise",
    "hobby",
    "hobbies",
    "recreation",
    "rec",
    "sport",
    "sports",
    "fitness",
  ],
  goals: ["goal", "goals", "why", "ltg", "long term goal", "long term goals", "objective", "objectives"],
};

const ALIAS_KIND: ReadonlyMap<string, Exclude<IntakeKind, "other">> = new Map(
  (Object.keys(INTAKE_ALIASES) as Exclude<IntakeKind, "other">[]).flatMap((kind) =>
    INTAKE_ALIASES[kind].map((alias) => [alias, kind] as const),
  ),
);

/**
 * A label's kind, or null when the matcher does not know it. A label that
 * joins known words of ONE kind — "Hobbies/Activities", "Meds & injuries",
 * "Hobbies and sports" — is that kind; one that joins two kinds
 * ("Occupation & hobbies") is not known, so it is shown with nothing offered.
 */
export function aliasKind(label: string): Exclude<IntakeKind, "other"> | null {
  const key = label
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "")
    .trim();
  const direct = ALIAS_KIND.get(key);
  if (direct) return direct;
  const parts = key.split(/\s*[/&]\s*| and /).filter(Boolean);
  if (parts.length < 2) return null;
  const kinds = new Set(parts.map((part) => ALIAS_KIND.get(part) ?? null));
  const [only] = [...kinds];
  return kinds.size === 1 && only ? only : null;
}

/** An unknown label is a label only when it is short: "Pmt", "Emergency contact name". */
const UNKNOWN_LABEL_WORDS = 3;

function wordCount(label: string): number {
  return label.split(/[\s-]+/).filter((w) => /[A-Za-z]/.test(w)).length;
}

/**
 * "Label:" at the start of the text — after a list mark ("- ", "* ", "• ")
 * if there is one — letters (and & / ' - space), no digits (so "7:00" is
 * never one), an optional "." before the colon, and never "https://". The
 * label is group 1.
 */
const COLON_LABEL = /^\s*(?:[-*\u2022]\s+)?([A-Za-z][A-Za-z&/' -]{0,29}?)\s*\.?\s*:(?!\/)\s*/;

/** "Label - text" (a hyphen, en or em dash with spaces round it). Counts only for a known label. */
const DASH_LABEL = /^\s*(?:[-*\u2022]\s+)?([A-Za-z][A-Za-z&/' ]{0,29}?)\s+[-\u2013\u2014]\s+/;

/** Where a new line may start mid-line: after ". ", ";", " | ", " • " or two spaces. */
const MID_BREAK = /\.\s+|;\s*|\s+\|\s+|\s+\u2022\s+|\s{2,}/g;

interface Head {
  kind: IntakeKind;
  /** A known label as written; null for one the matcher does not know (kept in the words). */
  label: string | null;
  /** Where the words start, within the text the head was read from. */
  textStart: number;
}

/** The label at the very start of a line, if it has one. */
function headAtLineStart(line: string): Head | null {
  const colon = COLON_LABEL.exec(line);
  const colonLabel = colon ? colon[1].trim() : "";
  const colonKind = colon ? aliasKind(colonLabel) : null;
  if (colon && colonKind) return { kind: colonKind, label: colonLabel, textStart: colon[0].length };
  const dash = DASH_LABEL.exec(line);
  const dashLabel = dash ? dash[1].trim() : "";
  const dashKind = dash ? aliasKind(dashLabel) : null;
  if (dash && dashKind) return { kind: dashKind, label: dashLabel, textStart: dash[0].length };
  // A short label it does not know ("Pmt:") still starts a new line of the
  // card — it is not the line above going on — but the line is kept exactly
  // as typed, colon and all: "Please call re: billing" is a sentence, and
  // nothing is offered on it either way.
  if (colon && wordCount(colonLabel) <= UNKNOWN_LABEL_WORDS) {
    return { kind: "other", label: null, textStart: 0 };
  }
  return null;
}

/** A KNOWN "Label:" at the start of `rest` — the only label that may start a line mid-line. */
function knownHeadAt(rest: string): Head | null {
  const colon = COLON_LABEL.exec(rest);
  if (!colon) return null;
  const label = colon[1].trim();
  const kind = aliasKind(label);
  return kind ? { kind, label, textStart: colon[0].length } : null;
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/** Mindbody's notes as plain text: line breaks, no tags, entities decoded, tabs as spaces. */
function plainText(raw: string): string {
  let s = raw.replace(/\r\n?/g, "\n");
  if (/<\/?[a-z][^>]*>/i.test(s)) {
    s = s
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "");
  }
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[\u00a0\t]/g, " ");
}

/** One piece of a physical line: its label (if it starts with one) and its words. */
interface Piece {
  head: Head | null;
  text: string;
}

/** A physical line cut at its line-start label and any known mid-line labels. */
function piecesOf(line: string): Piece[] {
  const first = headAtLineStart(line);
  const bodyStart = first ? first.textStart : 0;
  const cuts: { end: number; next: number; head: Head }[] = [];
  // A label with nothing after it but a KNOWN label ("Occ:   Med: asthma" —
  // a blank field of the sign-up form, its line break lost): the first has
  // no words, and the next starts its own line. Read as one, "Med: asthma"
  // would be offered as her job title.
  let at = bodyStart;
  for (let next = at > 0 ? knownHeadAt(line.slice(at)) : null; next; next = knownHeadAt(line.slice(at))) {
    cuts.push({ end: at, next: at + next.textStart, head: next });
    at += next.textStart;
  }
  MID_BREAK.lastIndex = at;
  let m: RegExpExecArray | null;
  while ((m = MID_BREAK.exec(line)) !== null) {
    const after = m.index + m[0].length;
    if (m.index < at) continue;
    const head = knownHeadAt(line.slice(after));
    if (!head) continue;
    // A full stop ends the sentence before it; a ";", "|", "•" or a gap is only a separator.
    const end = m[0].startsWith(".") ? m.index + 1 : m.index;
    cuts.push({ end, next: after + head.textStart, head });
    MID_BREAK.lastIndex = after + head.textStart;
  }
  const pieces: Piece[] = [];
  let start = bodyStart;
  let head: Head | null = first;
  for (const cut of cuts) {
    pieces.push({ head, text: line.slice(start, cut.end) });
    head = cut.head;
    start = cut.next;
  }
  pieces.push({ head, text: line.slice(start) });
  return pieces;
}

/** Runs of spaces collapsed, ends trimmed. Never touches the words. */
function tidyLine(s: string): string {
  return s.replace(/ {2,}/g, " ").trim();
}

/**
 * Mindbody's account notes as the card's lines. `cap` is how much of the
 * notes the sync keeps (MINDBODY_NOTES_MAX): notes that long may have been
 * cut, so the result and its last line say `truncated`.
 */
export function parseIntakeNotes(
  raw: string | null | undefined,
  opts: { cap?: number } = {},
): ParsedIntake {
  const cap = opts.cap ?? MINDBODY_NOTES_MAX;
  if (typeof raw !== "string" || !raw.trim()) return { lines: [], truncated: false };
  const truncated = raw.length >= cap;

  const segments: { kind: IntakeKind; label: string | null; parts: string[] }[] = [];
  let afterBlank = true;
  for (const line of plainText(raw).split("\n")) {
    if (!line.trim()) {
      afterBlank = true;
      continue;
    }
    piecesOf(line).forEach((piece, i) => {
      if (piece.head) {
        segments.push({ kind: piece.head.kind, label: piece.head.label, parts: [piece.text] });
      } else if (i === 0 && !afterBlank && segments.length > 0) {
        // No label: the line goes on with the one above it.
        segments[segments.length - 1].parts.push(piece.text);
      } else {
        segments.push({ kind: "other", label: null, parts: [piece.text] });
      }
    });
    afterBlank = false;
  }

  const lines: IntakeLine[] = [];
  for (const seg of segments) {
    const text = seg.parts.map(tidyLine).filter(Boolean).join("\n");
    if (!text) continue;
    lines.push({ index: lines.length, kind: seg.kind, label: seg.label, text, truncated: false });
  }
  if (truncated && lines.length > 0) lines[lines.length - 1] = { ...lines[lines.length - 1], truncated: true };
  return { lines, truncated };
}

/**
 * The Goals lines, verbatim — Goals & Focus shows them, read only, under her
 * why. A line the sync may have cut short (the last of notes at the
 * 1,000-character cap) ends in "…", as any quotation cut short does, so it
 * never reads there as her whole sentence.
 */
export function intakeGoalsLines(parsed: ParsedIntake): string[] {
  return parsed.lines.filter((l) => l.kind === "goals").map((l) => (l.truncated ? `${l.text}…` : l.text));
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

/** Words compared, not read: lower-case, whitespace collapsed, a trailing ".,;!" dropped. */
export function intakeNorm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;!]+$/, "")
    .trim();
}

/** Only the words, for "are these words in there": letters and digits, lower-case, one space between, padded. */
function wordRun(s: string): string {
  return ` ${s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
}

/**
 * These words — whole words, in order — are somewhere in `text`. Punctuation
 * and spacing are not words, so "R TKA  Mar 2024" holds "R TKA Mar 2024.";
 * a word is never part of a longer one, so "Kneecap fracture" does not hold
 * "knee", nor "HIPAA form" "hip".
 */
function holdsWords(text: string, words: string): boolean {
  const needle = wordRun(words);
  return needle.trim() !== "" && wordRun(text).includes(needle);
}

const trimmed = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A sentence's full stop, unless the words already end on one ("Retired dental hygienist."). */
function endSentence(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** What one kind's rule decides about a line: the rest of an IntakeMatch is the same for every kind. */
type Found = Pick<IntakeMatch, "journey" | "sentence" | "action">;

/** Where each target is on the record, and what its door says. */
function doorOf(target: IntakeTarget, p: Pronouns): IntakeDoor {
  switch (target) {
    case "occupation":
      return { page: "ford", anchor: "ford-occupation", label: "Open Occupation" };
    case "recreation":
      return { page: "ford", anchor: "ford-recreation", label: "Open Recreation" };
    case "her-why":
      return { page: "goals", anchor: "goals-why", label: `Open ${p.possessive} why` };
    case "body":
      return { page: "body", anchor: "body-watchouts", label: "Open Watch-outs" };
  }
}

function targetLabelOf(target: IntakeTarget, p: Pronouns): string {
  switch (target) {
    case "occupation":
      return "Occupation";
    case "recreation":
      return "Recreation";
    case "her-why":
      return `${cap(p.possessive)} why`;
    case "body":
      return "Body";
  }
}

const TARGET_OF: Readonly<Record<Exclude<IntakeKind, "other">, IntakeTarget>> = {
  occupation: "occupation",
  medical: "body",
  activity: "recreation",
  goals: "her-why",
};

/** A FORD detail filed under `pillar` that is on the page (not archived). */
function liveIn(entries: readonly FordEntry[], pillar: FordEntry["pillar"]): number {
  return entries.filter((e) => !e.isArchived && e.pillar === pillar).length;
}

/** The FORD detail already holding these exact words, if any (archived ones included). */
function fordWithWords(entries: readonly FordEntry[], words: string): FordEntry | null {
  if (!words) return null;
  return entries.find((e) => e.kind !== "one-line" && intakeNorm(e.body) === words) ?? null;
}

/**
 * Why FORD could not answer, for a line that needs it; null once it has.
 * `studioId` "" is a client with no home studio: FORD can be neither read
 * nor written for them, and a retry cannot change that.
 */
function fordUnread(ford: IntakeFord, p: Pronouns, where: string): string | null {
  if (ford.status === "ready") return null;
  if (!ford.studioId) return FORD_READ_NOTICE.noStudio;
  if (ford.status === "loading") return `Still reading FORD, so it isn't known yet whether this line is in ${where}.`;
  if (ford.status === "failed") {
    return `Couldn't check FORD just now, so it isn't known whether this line is already in ${where}. Open the profile again to retry.`;
  }
  // denied, or off: a cross-train reader, whom the FORD rule refuses.
  return `FORD is kept by ${p.possessive} home studio, so this line can't be checked or added to ${where} here.`;
}

function occupationMatch(line: IntakeLine, view: IntakeView, ford: IntakeFord, p: Pronouns): Found {
  const words = intakeNorm(line.text);
  const title = trimmed(view.occupation);
  // What FORD holds under Occupation — said only when FORD answered; this
  // line goes to the job title, so an unread FORD is no reason to hold it.
  const inFord = ford.status === "ready" ? liveIn(ford.entries, "occupation") : 0;
  const fordPart = inFord > 0 ? `${plural(inFord, "FORD detail")} in Occupation` : null;

  if (title && intakeNorm(title) === words) {
    return { journey: "present", sentence: `This is ${p.possessive} job title in Journey.`, action: null };
  }
  // Only while the job title is empty is anything offered: a title that is
  // there is never replaced, whatever it says.
  if (title) {
    const retired = view.isRetired && !isRetirementTitle(title) ? ", retired" : "";
    const has = [`${curly(title)} as ${p.possessive} job title${retired}`, fordPart].filter(Boolean).join(" · ");
    return { journey: "something", sentence: `Journey has: ${endSentence(has)}`, action: null };
  }

  // No title, but the work category or "retired" may be on the record.
  const work = workSentence({ occupation: "", workProfile: view.workProfile ?? null, isRetired: !!view.isRetired });
  const has = [work !== "Work not recorded yet" ? work : null, fordPart].filter(Boolean).join(" · ");
  const lead = `No job title on ${p.possessive} record yet.${has ? ` Journey has: ${endSentence(has)}` : ""}`;
  // A job title is one short line. Anything longer is not offered as one:
  // the Work editor's box holds JOB_TITLE_MAX characters.
  if (line.text.includes("\n") || line.text.length > JOB_TITLE_MAX) {
    return {
      journey: has ? "something" : "nothing",
      sentence: `${lead} This line is longer than a job title (${JOB_TITLE_MAX} characters on one line), so it isn't offered as one.`,
      action: null,
    };
  }
  return {
    journey: has ? "something" : "nothing",
    sentence: lead,
    action: { kind: "field", field: "occupation", mode: "set", label: "Add to Occupation", text: line.text },
  };
}

function activityMatch(line: IntakeLine, view: IntakeView, ford: IntakeFord, p: Pronouns): Found {
  const unread = fordUnread(ford, p, "Recreation");
  if (unread) return { journey: "unknown", sentence: unread, action: null };

  const found = fordWithWords(ford.entries, intakeNorm(line.text));
  if (found) {
    if (found.isArchived) {
      return {
        journey: "present",
        sentence: "These words were added to FORD before and have since been archived, so they aren't offered again.",
        action: null,
      };
    }
    const where = found.pillar ? FORD_META[found.pillar].label : null;
    return {
      journey: "present",
      sentence: where ? `This line is already a detail in ${where}.` : "This line is already in FORD, waiting to be filed.",
      action: null,
    };
  }

  const onRecord = recreationSentence({
    activityLevel: view.activityLevel,
    recreationActivities: [...(view.recreationActivities ?? [])],
  });
  const inFord = liveIn(ford.entries, "recreation");
  const has = [
    onRecord !== "Not recorded yet" ? onRecord : null,
    inFord > 0 ? `${plural(inFord, "detail")} in Recreation` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const lead = has ? `Journey has: ${endSentence(has)}` : "Nothing in Recreation yet.";
  const journey: IntakeJourney = has ? "something" : "nothing";
  // The FORD create rule takes a detail only from someone who trains at or
  // leads her home studio — not from an administrator or franchise owner who
  // works elsewhere, though they read FORD. Offering them the tap would only
  // end in a refusal that reads like a dropped connection.
  if (!ford.canAdd) {
    return {
      journey,
      sentence: `${lead} Only a trainer at ${p.possessive} home studio can add a FORD detail, so it isn't offered here.`,
      action: null,
    };
  }
  const action: IntakeAction = { kind: "ford", pillar: "recreation", label: "Add to Recreation", body: line.text, isPinned: true };
  return { journey, sentence: lead, action };
}

function goalsMatch(line: IntakeLine, view: IntakeView, p: Pronouns): Found {
  const why = trimmed(view.globalNotes);
  const Why = `${cap(p.possessive)} why`;
  if (why && holdsWords(why, line.text)) {
    return { journey: "present", sentence: `${Why} already says this.`, action: null };
  }
  if (why) {
    return { journey: "something", sentence: `${Why} is already written on ${p.possessive} record.`, action: null };
  }
  return {
    journey: "nothing",
    sentence: `${Why} isn't written yet.`,
    action: { kind: "field", field: "globalNotes", mode: "set", label: `Use as ${p.possessive} why`, text: line.text },
  };
}

/**
 * The medical line. It never decides whether what Body holds already says
 * what this line says — only whether these exact words (whole words, in
 * order) are in the history.
 */
function medicalMatch(line: IntakeLine, view: IntakeView, p: Pronouns): Found {
  const history = trimmed(view.medicalHistory);
  if (history && holdsWords(history, line.text)) {
    return { journey: "present", sentence: `This exact line is in ${p.possessive} medical history.`, action: null };
  }
  const flags = (view.clinicalFlags ?? []).filter((f) => typeof f === "string" && f.trim()).length;
  const has = [
    flags > 0 ? plural(flags, "clinical flag") : null,
    history ? "a medical history" : null,
    trimmed(view.clinicalNotes) ? "contraindications & constraints" : null,
  ].filter((s): s is string => !!s);
  const action: IntakeAction = history
    ? { kind: "field", field: "medicalHistory", mode: "append", label: "Add to medical history", text: line.text }
    : { kind: "field", field: "medicalHistory", mode: "set", label: "Add as medical history", text: line.text };
  if (has.length > 0) {
    const listed = has.length === 1 ? has[0] : `${has.slice(0, -1).join(", ")} and ${has[has.length - 1]}`;
    return {
      journey: "something",
      sentence: `Body has ${listed} on file. Read both side by side; the app can't tell whether they say the same thing.`,
      action,
    };
  }
  return { journey: "nothing", sentence: "Nothing in Body's watch-outs yet.", action };
}

/**
 * Each line of the notes, with where it belongs, what Journey has there, and
 * the one tap on offer. `view` is the record as the editors hold it (the
 * form's values), so a line staged a moment ago already reads as there.
 */
export function matchIntake(parsed: ParsedIntake, view: IntakeView, ford: IntakeFord, p: Pronouns): IntakeMatch[] {
  return parsed.lines.map((line) => {
    const key = `${line.kind}:${intakeNorm(line.text)}`;
    if (line.kind === "other") {
      return { line, key, target: null, targetLabel: null, journey: "nothing", sentence: null, action: null, door: null };
    }
    const target = TARGET_OF[line.kind];
    let found =
      line.kind === "occupation"
        ? occupationMatch(line, view, ford, p)
        : line.kind === "activity"
          ? activityMatch(line, view, ford, p)
          : line.kind === "goals"
            ? goalsMatch(line, view, p)
            : medicalMatch(line, view, p);
    // The last line of notes the sync cut at 1,000 characters may stop
    // mid-sentence: it is shown, and never copied anywhere as if whole.
    if (line.truncated && found.action) {
      found = {
        ...found,
        action: null,
        sentence: `${found.sentence ?? ""} This line may be cut off where Journey's copy of the notes ends, so it isn't offered.`.trim(),
      };
    }
    return { line, key, target, targetLabel: targetLabelOf(target, p), door: doorOf(target, p), ...found };
  });
}

/** The field's next value for a staged tap: the line itself, or the history with the line added after a blank line. */
export function nextFieldValue(current: string | null | undefined, action: Extract<IntakeAction, { kind: "field" }>): string {
  const now = typeof current === "string" ? current : "";
  if (action.mode === "append" && now.trim()) return `${now.trimEnd()}\n\n${action.text}`;
  return action.text;
}
