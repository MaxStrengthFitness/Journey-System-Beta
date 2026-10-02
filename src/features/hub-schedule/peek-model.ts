/**
 * WHAT THE PEEK SAYS (calm Hub round, Sep 28 2026). Pure: peek-model.test.ts.
 *
 * Research-hub §6.0: a tap on a card opens a peek that says every mark in
 * words, with its proof, and holds Open profile and Start session (Hub
 * question 1's default: a peek, not the profile). It is the same content as
 * an opened Opportunities row, from the same entry, so the two can never
 * disagree:
 *
 *   - Read first, whole, in the Critical note's own colour;
 *   - every other moment as its sentence, in the Key's order ("Turns 80 on
 *     Thursday, Oct 1.", "No liability waiver signed in Mindbody.", the
 *     Wrap-up's own renewal words);
 *   - where she is: last in, her package (left in contract, extras beside
 *     it), each with "can't tell" rather than a guess;
 *   - standing context, quietly: clinical history on file (the dot that left
 *     the card), and a Critical read or a FORD read that couldn't be checked.
 *
 * Words on the peek are for the trainer who opened it; the grid itself shows
 * marks only (clients stand next to the iPad). Get to know's sentence (wave 2
 * hub, "Ask about: …") is one of the lines, in the Key's order: last. All
 * stars (wave 2 hub) is a sentence of its own under them — "All star: in 25
 * of the last 26 weeks, about twice a week." — only for a client the nightly
 * marks name.
 */
import { ordinal, type MomentFamily, type MomentKind, type RunSheetEntry } from "../hub-opportunities/moments-today";
import { ASK_UNREAD_LINE } from "../hub-opportunities/get-to-know";
import type { HubCardState } from "../../lib/hub-card-state";
import { canClaimMilestone, MINDBODY_GUESS_WORDS, sessionNumberWords, type SessionTotalBasis } from "../../lib/session-total";

export interface PeekLine {
  kind: MomentKind;
  family: MomentFamily;
  text: string;
}

export interface PeekFact {
  label: string;
  text: string;
  /** "Can't tell yet", not a fact: drawn quietly. */
  muted: boolean;
}

export interface PeekContent {
  name: string;
  /** "9:30 – 10:00 AM · with you · her 100th session". */
  subtitle: string;
  /** Read first: the note's words, whole, or null. */
  critical: string | null;
  lines: PeekLine[];
  /** "All star: in 25 of the last 26 weeks, about twice a week.", or null for everyone the marks don't name. */
  star: string | null;
  facts: PeekFact[];
  /** Quiet notes at the foot: clinical history on file, an unchecked Critical read. */
  notes: string[];
}

/**
 * Her number, in words, for the trainer who opened the peek (Atlas answers,
 * Oct 2 2026): "her 312th session · from Mindbody, not yet confirmed" while
 * the total is Mindbody's guess, "her first session" only off a total a
 * person confirmed or Journey holds whole, and "#6 in Journey" when there is
 * no total to say at all.
 */
export function numberWords(
  n: number | null,
  basis: SessionTotalBasis | null = "confirmed",
  journeyNumber: number | null = null,
): string | null {
  if (n === null || n < 1) return basis === "journey-only" ? sessionNumberWords(journeyNumber, "journey-only") : null;
  if (n === 1 && canClaimMilestone(basis)) return "her first session";
  const words = `her ${ordinal(n)} session`;
  return basis === "mindbody" ? `${words} \u00b7 ${MINDBODY_GUESS_WORDS}` : words;
}

export interface PeekOptions {
  /**
   * What the card may leave out when space is short, said here in full
   * (hub fixes, Oct 1 2026): "new to Journey", a service that isn't the
   * day's usual one.
   */
  extras?: ReadonlyArray<string>;
}

export function peekContent(entry: RunSheetEntry, sessionNumber: number | null = entry.sessionNumber, opts: PeekOptions = {}): PeekContent {
  const critical = entry.moments.find((m) => m.family === "read-first");
  const subtitle = [entry.timeText, entry.withText, numberWords(sessionNumber, entry.sessionBasis ?? "confirmed", entry.journeyNumber ?? null), ...(opts.extras ?? [])].filter(Boolean).join(" · ");
  const lines: PeekLine[] = entry.moments
    .filter((m) => m.family !== "read-first")
    .map((m) => ({ kind: m.kind, family: m.family, text: m.sentence }));
  const f = entry.facts;
  const facts: PeekFact[] = [
    { label: "Last in", text: f.lastSeen.sentence, muted: f.lastSeen.unknown },
    { label: "Package", text: f.left.sentence, muted: f.left.unknown },
  ];
  const notes: string[] = [];
  if (entry.criticalUnknown) notes.push("Couldn’t check her critical notes — her briefing shows them.");
  if (entry.askUnknown) notes.push(ASK_UNREAD_LINE);
  if (entry.clinicalOnFile) notes.push("Clinical history on file — her briefing has it.");
  return {
    name: entry.name,
    subtitle,
    critical: critical ? critical.words ?? critical.sentence : null,
    lines,
    star: entry.allStar?.words ?? null,
    facts,
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* What happened, and what the peek offers (hub fixes, Oct 1 2026)     */
/* ------------------------------------------------------------------ */

/**
 * AJ, Oct 1 2026: "if its a logged session i like the idea of switching
 * 'start session' to 'edit session' where you can edit the reps or weight or
 * add a machine or remove one from that days routine".
 *
 * The peek says what happened to the booking (the card's own state,
 * lib/hub-card-state) and its main button follows it. Every button opens
 * something that already exists; nothing here is a second editor:
 *
 *   coming up, or nothing to claim   Start session (as before)
 *   In session                       Open session — the Active Session decides
 *                                    by its own rules (resume your own, watch
 *                                    another trainer's read-only)
 *   Left open                        Resume or start new — the Active Session's
 *                                    unfinished-session question; her profile
 *                                    has Discard
 *   Logged                           Edit session — the Activity Archive's own
 *                                    session pop-up, for THAT day's session
 *   Not logged (over)                Log past session — her Activity Archive,
 *                                    where the form is (no new door)
 *   Didn't come                      nothing but Open profile
 */
export type PeekActionKind = "start" | "open-session" | "edit" | "log-past";

export interface PeekState {
  /** "Logged · 7 machines", "Not logged", "Didn't come", "In session", "Left open"; null when coming up. */
  words: string | null;
  /** The main button, or null for Open profile alone. */
  primary: { kind: PeekActionKind; label: string } | null;
  /** One quiet line about the button, when it needs one. */
  note: string | null;
}

export function peekState(
  state: HubCardState | null | undefined,
  opts: {
    /** Machines performed in the day's logged session (`sessionMachineIds`), when the session says. */
    machines?: number | null;
    /** The day's logged session is in hand to open. */
    loggedSessionHeld?: boolean;
  } = {},
): PeekState {
  switch (state) {
    case "in-session":
      return { words: "In session", primary: { kind: "open-session", label: "Open session" }, note: null };
    case "left-open":
      return {
        words: "Left open",
        primary: { kind: "open-session", label: "Resume or start new" },
        note: "Started and quiet for over an hour. Resume it here, or close it from her profile (Discard).",
      };
    case "done": {
      const n = opts.machines;
      const words = typeof n === "number" && Number.isFinite(n) && n > 0 ? `Logged · ${n} ${n === 1 ? "machine" : "machines"}` : "Logged";
      return { words, primary: opts.loggedSessionHeld ? { kind: "edit", label: "Edit session" } : null, note: null };
    }
    case "not-logged":
      return {
        words: "Not logged",
        primary: { kind: "log-past", label: "Log past session" },
        note: "Opens her Activity Archive, where Log past session is.",
      };
    case "didnt-come":
      return { words: "Didn't come", primary: null, note: null };
    default:
      return { words: null, primary: { kind: "start", label: "Start session" }, note: null };
  }
}
