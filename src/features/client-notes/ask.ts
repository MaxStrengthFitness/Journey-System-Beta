/**
 * ASK ABOUT HER — the Notes page answers the question a reader comes with
 * (notes round, Oct 3 2026).
 *
 * AJ: "I don't think [seeing every note] is... it's just really too basic.
 * When I go into a client's profile and I go to their notes I should be able
 * to kind of ask the question of like, oh hey, I want to learn about their
 * life, or I want to learn about their time here at Max Strength, or I want
 * to learn about what's going on with them right now... you're going in there
 * to look about something with that client."
 *
 * The research behind the shape (docs/rounds/2026-10-03-client-notes.md):
 *   • Weed's problem-oriented record put a short, maintained list of what is
 *     going on at the FRONT of the chart, instead of a feed every reader
 *     rebuilds the story from — "Right now" is that list.
 *   • Faceted classification: a question is a VIEW over a note's facets (its
 *     category, its timing, open or closed, its body parts), never a folder.
 *     One note can answer two questions — a fresh knee note is both "right
 *     now" and "her health" — and is never copied to do it.
 *   • Information scent: each question says, before it is tapped, how much is
 *     behind it and the newest line, so a reader knows whether to look.
 *   • "Her time here" is a chronology of the things that mattered, which the
 *     Story page already is; it is a door, never a second Story.
 *
 * The questions, in the order a trainer and a leader reach for them:
 *
 *   now      What's going on with her right now?  the notes that matter
 *            today: Critical, a Heads up still being read out, a window that
 *            covers today or starts within a month (a surgery date, a trip),
 *            and any Health, Incident or Retention note from the last two
 *            weeks that is still open; and an open question from Relay
 *   health   Her health: Health and Incident, every zone; door Body & Pulse
 *   train    How to train her: Coaching & equipment and Preference; door
 *            Goals & Focus
 *   staying  Is she staying with us? Retention, every zone; door Account
 *   life     Her life: FORD's, so a door to FORD with FORD's own line, and
 *            any older life note still on Notes
 *   story    Her time here: a door to the Story with its line
 *   all      Every note: the catalog as it was, every filter
 *
 * Pure: no React, no Firebase. `ask.test.ts` pins it.
 */
import type { RecordPage } from "../client-profile/profile-nav";
import { addDays } from "../client-history/model";
import { studioDateKey, toDate } from "../../lib/studio-time";
import { bodyMarkWords, normaliseBodyMarks } from "./body-parts";
import { mattersOn, nextOccurrence, shapeOf, startDayOf } from "./mattering";
import { machinesWithNotes, threadCategoryOf, type NoteCategory } from "./note-catalog";
import type { NoteThread } from "./threads";

export type AskId = "now" | "health" | "train" | "staying" | "life" | "story" | "all";

/** The questions, in their fixed order (the same place every time). */
export const ASK_ORDER: readonly AskId[] = ["now", "health", "train", "staying", "life", "story", "all"];

/** How far ahead "right now" looks for a date that is coming: a surgery, a trip. */
export const ASK_COMING_DAYS = 30;
/** How far back "right now" counts a Health, Incident or Retention note as news. */
export const ASK_RECENT_DAYS = 14;

export interface AskPronouns {
  object: string;
  possessive: string;
  subject: string;
  plural: boolean;
}

export interface AskLens {
  id: AskId;
  /** The question on the button, in the client's own pronouns. */
  question: string;
  /** The threads that answer it, in the briefing's order. Empty for a door-only question. */
  threads: NoteThread[];
  /** True when the catalog of notes is the answer (every question but Story). */
  showsNotes: boolean;
  /** The deeper page this question opens, when it has one. */
  door: { page: RecordPage; label: string } | null;
  /** One line under the question: how much is behind it, and the newest word. Null while unknown. */
  preview: string | null;
  /** What the answer says when no note answers it. */
  empty: string;
}

export interface AskInput {
  /** Notes' listed threads (`notesOnRecord`): the tray's unfiled notes are not here. */
  threads: readonly NoteThread[];
  /** The briefing's own selections, so "right now" and the briefing agree. */
  criticalIds: ReadonlySet<string>;
  headsUpIds: ReadonlySet<string>;
  machines: readonly { id?: string; name: string }[];
  today: string;
  pronouns: AskPronouns;
  /** The sub-toggle's line for each page (page-meta.ts), for the door-only questions' previews. */
  pageLines?: Partial<Record<RecordPage, string | null>>;
  /** The notes have answered; until then no count is said. */
  known: boolean;
  tz?: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const inCategories = (t: NoteThread, cats: readonly NoteCategory[]) => cats.includes(threadCategoryOf(t));

/**
 * The day a thread last moved: its newest entry, by when it was WRITTEN
 * (else its date). A date ahead — a surgery in three months — is the
 * window's business (the month-ahead horizon), never "recent" news.
 */
function lastDayOf(t: NoteThread, tz?: string): string | null {
  let best = 0;
  for (const e of t.entries) {
    const ms =
      toDate(e.createdAt as Parameters<typeof toDate>[0])?.getTime() ??
      toDate(e.occurredAt as Parameters<typeof toDate>[0])?.getTime() ??
      0;
    if (ms > best) best = ms;
  }
  return best ? studioDateKey(new Date(best), tz) : null;
}

/**
 * Does this thread answer "what's going on right now"? The briefing's own
 * selections first (Critical that matters today, a Heads up still read out),
 * then a window that covers today or starts within a month, then a Health,
 * Incident or Retention note still open from the last two weeks, then an
 * open question.
 */
export function isRightNow(
  t: NoteThread,
  ctx: { criticalIds: ReadonlySet<string>; headsUpIds: ReadonlySet<string>; today: string; tz?: string },
): boolean {
  const root = t.root;
  if (root.resolvedAt || root.isArchived) return false;
  if (ctx.criticalIds.has(t.id) || ctx.headsUpIds.has(t.id)) return true;
  if (root.kind === "question") return true;
  const shape = shapeOf(root, ctx.tz);
  if (shape !== "always") {
    if (mattersOn(root, ctx.today, ctx.tz)) return true;
    const horizon = addDays(ctx.today, ASK_COMING_DAYS);
    const next = shape === "day" ? nextOccurrence(root, ctx.today, ctx.tz) : startDayOf(root, ctx.tz);
    if (next && next >= ctx.today && next <= horizon) return true;
  }
  if (inCategories(t, ["health", "incident", "retention"])) {
    const last = lastDayOf(t, ctx.tz);
    if (last && last >= addDays(ctx.today, -ASK_RECENT_DAYS)) return true;
  }
  return false;
}

/** "left knee in 3" — the part her Health and Incident notes name most, when one is named twice or more. */
export function mostNamedPart(threads: readonly NoteThread[]): string | null {
  const counts = new Map<string, number>();
  for (const t of threads) {
    for (const m of normaliseBodyMarks(t.root.bodyParts ?? [])) {
      const words = bodyMarkWords(m);
      counts.set(words, (counts.get(words) ?? 0) + 1);
    }
  }
  let best: [string, number] | null = null;
  for (const [words, n] of counts) if (!best || n > best[1]) best = [words, n];
  return best && best[1] >= 2 ? `${best[0]} in ${best[1]}` : null;
}

/**
 * "1 Critical · 2 Heads up · 1 coming up · 1 new" — what "right now" holds,
 * by why it is there. Counts, never a quote: a Critical note is drawn once,
 * on its card (the codex rule), and a preview that quoted it would draw it
 * twice.
 */
export function nowBreakdown(
  now: readonly NoteThread[],
  ctx: { criticalIds: ReadonlySet<string>; headsUpIds: ReadonlySet<string>; today: string; tz?: string },
): string | null {
  let critical = 0;
  let headsUp = 0;
  let coming = 0;
  let other = 0;
  for (const t of now) {
    if (ctx.criticalIds.has(t.id)) critical += 1;
    else if (ctx.headsUpIds.has(t.id)) headsUp += 1;
    else if (shapeOf(t.root, ctx.tz) !== "always" && !mattersOn(t.root, ctx.today, ctx.tz)) coming += 1;
    else other += 1;
  }
  return joinLine(
    critical > 0 && `${critical} Critical`,
    headsUp > 0 && `${headsUp} Heads up`,
    coming > 0 && `${coming} coming up`,
    other > 0 && `${other} ${critical + headsUp + coming > 0 ? "more" : "open"}`,
  );
}

const joinLine = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ") || null;

/** Every question, with what answers it. */
export function askLenses(input: AskInput): AskLens[] {
  const { threads, today, pronouns: p, known, tz } = input;
  const live = threads.filter((t) => !t.root.isArchived);
  const open = (ts: NoteThread[]) => ts.filter((t) => !t.root.resolvedAt);
  const lines = input.pageLines ?? {};

  const now = live
    .filter((t) => isRightNow(t, { criticalIds: input.criticalIds, headsUpIds: input.headsUpIds, today, tz }));
  const health = live.filter((t) => inCategories(t, ["health", "incident"]));
  const train = live.filter((t) => inCategories(t, ["coaching", "preference"]));
  const staying = live.filter((t) => inCategories(t, ["retention"]));
  const life = live.filter((t) => inCategories(t, ["ford"]));

  // "5 notes" — the ones not closed; never "open", which is a zone's name on
  // the same page and means something narrower.
  const countLine = (ts: NoteThread[]) => {
    const n = open(ts).length;
    return n ? plural(n, "note") : ts.length ? "All closed" : null;
  };

  const lenses: Record<AskId, AskLens> = {
    now: {
      id: "now",
      question: `What's going on with ${p.object} right now?`,
      threads: now,
      showsNotes: true,
      door: null,
      preview: known
        ? now.length
          ? nowBreakdown(now, { criticalIds: input.criticalIds, headsUpIds: input.headsUpIds, today, tz })
          : "Nothing open right now"
        : null,
      empty: `Nothing is open for ${p.object} right now: no Critical note, no Heads up still being read out, nothing dated this month, and nothing new about ${p.possessive} health, an incident or ${p.possessive} renewal in the last two weeks.`,
    },
    health: {
      id: "health",
      question: `${cap(p.possessive)} health`,
      threads: health,
      showsNotes: true,
      door: { page: "body", label: "Body & Pulse" },
      preview: known ? joinLine(countLine(health), mostNamedPart(health), lines.body) : null,
      empty: `No Health or Incident notes yet. Body & Pulse has ${p.possessive} watch-outs and Pulse.`,
    },
    train: {
      id: "train",
      question: `How to train ${p.object}`,
      threads: train,
      showsNotes: true,
      door: { page: "goals", label: "Goals & Focus" },
      preview: known
        ? joinLine(
            plural(train.length, "note"),
            (() => {
              const n = machinesWithNotes(train, input.machines).length;
              return n ? plural(n, "machine") : null;
            })(),
          )
        : null,
      empty: `No coaching, set-up or preference notes yet.`,
    },
    staying: {
      id: "staying",
      question: `${p.plural ? "Are" : "Is"} ${p.subject} staying with us?`,
      threads: staying,
      showsNotes: true,
      door: { page: "account", label: "Account" },
      preview: known ? joinLine(staying.length ? countLine(staying) : "No retention notes", lines.account) : null,
      empty: `No retention notes yet — nothing said about renewing, ${p.possessive} package, staying or leaving. ${cap(p.possessive)} package is on Account.`,
    },
    life: {
      id: "life",
      question: `${cap(p.possessive)} life`,
      threads: life,
      showsNotes: life.length > 0,
      door: { page: "ford", label: "FORD" },
      preview: lines.ford ?? null,
      empty: `${cap(p.possessive)} family, work, what ${p.subject} ${p.plural ? "do" : "does"} for fun and ${p.possessive} dreams are kept in FORD.`,
    },
    story: {
      id: "story",
      question: `${cap(p.possessive)} time here`,
      threads: [],
      showsNotes: false,
      door: { page: "story", label: "Story" },
      preview: lines.story ?? null,
      empty: `${cap(p.possessive)} time at Max Strength — ${p.possessive} first day, milestones, renewals, and what ${p.subject} came through — is ${p.possessive} Story.`,
    },
    all: {
      id: "all",
      question: "Every note",
      threads: live,
      showsNotes: true,
      door: null,
      preview: known ? plural(live.length, "note") : null,
      empty: "No notes yet.",
    },
  };
  return ASK_ORDER.map((id) => lenses[id]);
}
