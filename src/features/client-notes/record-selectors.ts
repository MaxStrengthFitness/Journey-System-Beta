/**
 * THE RECORD'S NOTE SELECTORS — what every page of Notes & Profile needs to
 * know about a client's notes, from the ONE journal load.
 *
 * Client codex, Sep 2026. The profile's record tab became seven pages, and
 * five of them talk about notes: Notes itself, the red critical line under
 * the bar, Body & Pulse (injuries, and her notes on each machine), Goals &
 * Focus (how to coach her), FORD (older life notes) and the Overview. Each
 * area's spec wrote its own version of the same selection, and the versions
 * disagreed — one "how to coach her" pulled in every legacy session wrap-up,
 * one "machine notes" dropped every standing set-up note. So each selection
 * lives here ONCE, and every page reads `journal.threads` through it. The tab
 * loads the journal once (`useClientJournal`); switching pages reads nothing.
 *
 * The rules these keep:
 *  - Zones are derived, never set (`zoneOf` in threads.ts). Nothing here
 *    stores or invents a status.
 *  - The critical line uses the briefing's selection — `criticalEntries`,
 *    critical and mattering today — and ignores dismissals: the record never
 *    hides a note; "no need to remind me" only curates the briefing.
 *  - A critical note is never cut mid-sentence and never given an "…": the
 *    line is whole sentences (`firstSentences`, src/lib) and wraps.
 *  - Unknown is not zero: a count this module cannot know is `null`.
 *  - Sentences, not scores: counts sit beside words, nothing is ranked.
 *
 * Pure — no React, no Firestore, no clock of its own (every "today" is a
 * studio day key handed in). Tests: record-selectors.test.ts, run under
 * TZ=America/New_York.
 */
import type { Client, Machine } from "../../types";
import type { JournalEntry, LifeCategory } from "../../types/journal";
import { studioDateKey, toDate } from "../../lib/studio-time";
import { firstSentences } from "../../lib/first-sentences";
import { adaptClientEvents, fordSummaryOf } from "../ford/ford-rollup";
import { FORD_PILLARS, type FordEntry, type FordPillar } from "../ford/types";
import type { FordReadStatus } from "../ford/read-status";
import {
  SHOWN_ELSEWHERE_ON_RECORD,
  isUnfiled,
  noteCategoryOf,
  threadCategoryOf,
  withoutRecordFields,
} from "./note-catalog";
import {
  assembleThreads,
  isThreadUpdate,
  sortThreads,
  updateCountLabel,
  zoneOf,
  type NoteThread,
  type ThreadZone,
} from "./threads";
import { describeWindow, nextOccurrence, shapeOf, startDayOf, windowEnded } from "./mattering";
import { isDismissed, type NoteDismissals } from "./dismissals";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** The studio day of any stored date (a Timestamp, a Date, an ISO string). */
const dayOf = (v: unknown, tz?: string): string | null => {
  const d = toDate(v as Parameters<typeof toDate>[0]);
  return d ? studioDateKey(d, tz) : null;
};

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "Matters always" → "matters always". Only the first letter: "Only on Nov 5" keeps its "Nov". */
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** The journal's copy of a `client.events` row (useClientJournal). FORD draws the event itself. */
const LEGACY_EVENT_PREFIX = "legacy:clientEvents:";

/**
 * A life note FORD shows "from an older note": the journal's own FORD / Life
 * notes — not a `client.events` row (FORD already draws the event itself, via
 * `adaptClientEvents`), and not an update whose root is out of the load (an
 * orphan stands as a thread of its own, threads.ts, and stays on Notes).
 *
 * `notesOnRecord` settles ONLY these and `olderLifeNotesByPillar` places
 * exactly these, so a note that leaves Notes always has a place on FORD.
 * Two selections that disagreed here would drop a note off the tab.
 */
function isOlderLifeNote(t: NoteThread): boolean {
  if (threadCategoryOf(t) !== "ford") return false;
  if (t.id.startsWith(LEGACY_EVENT_PREFIX)) return false;
  return !isThreadUpdate(t.root) && !t.root.isArchived;
}

/* ------------------------------------------------------------------ */
/* What the Notes page lists                                           */
/* ------------------------------------------------------------------ */

export interface NotesOnRecord {
  /** The threads the Notes page draws in its three zones. */
  listed: NoteThread[];
  /** Notes saved without a category: the To-file tray, not a zone. Roots only. */
  unfiled: JournalEntry[];
  /**
   * Life notes that are no longer live (Standing or Resolved): FORD's to show,
   * in their pillar, "from an older note". Always computed; whether they also
   * stay on Notes is `lifeOnFord`.
   */
  lifeSettled: NoteThread[];
}

export interface NotesOnRecordOptions {
  tz?: string;
  /**
   * True once the FORD page draws the settled life notes in their pillars —
   * then, and only then, may they leave Notes. Until that page ships (the FORD
   * phase), they are in `listed` AND `lifeSettled`, so no note ever
   * disappears from the tab. Default false.
   */
  lifeOnFord?: boolean;
}

/**
 * Split the client's threads into what the Notes page lists, what waits in
 * the To-file tray, and the settled life notes FORD will carry.
 *
 *  1. The five profile fields the record edits in their own sections
 *     (`SHOWN_ELSEWHERE_ON_RECORD`) are left out, or each is read twice.
 *  2. An archived thread has left every screen.
 *  3. An unfiled note (capture now, tag at teardown) is in the tray only.
 *  4. A life note that is not live — standing or resolved — is settled. A LIVE
 *     one (a Heads up, a Critical, a current or coming window) stays on Notes,
 *     where live notes are read and where "Open the note" lands. Only a note
 *     `olderLifeNotesByPillar` places is settled (`isOlderLifeNote`): a
 *     `client.events` copy or an orphaned update stays on Notes, so nothing
 *     settled can fall between the two pages.
 */
export function notesOnRecord(
  threads: readonly NoteThread[],
  today: string,
  options: NotesOnRecordOptions = {},
): NotesOnRecord {
  const { tz, lifeOnFord = false } = options;
  const listed: NoteThread[] = [];
  const unfiled: JournalEntry[] = [];
  const lifeSettled: NoteThread[] = [];
  for (const t of threads) {
    if (SHOWN_ELSEWHERE_ON_RECORD.has(t.id)) continue;
    if (t.root.isArchived) continue;
    if (isUnfiled(t.root)) {
      unfiled.push(t.root);
      continue;
    }
    if (isOlderLifeNote(t) && zoneOf(t, today, tz) !== "open") {
      lifeSettled.push(t);
      if (lifeOnFord) continue;
    }
    listed.push(t);
  }
  return { listed, unfiled, lifeSettled };
}

/* ------------------------------------------------------------------ */
/* Counts: the Overview and the sub-toggle                             */
/* ------------------------------------------------------------------ */

export interface NotesSummary {
  open: number;
  standing: number;
  resolved: number;
  /** Threads listed on Notes, every zone. */
  total: number;
  /** Critical notes that matter today — the briefing's own selection. */
  critical: number;
  /** Notes waiting in the To-file tray: not in a zone, but notes all the same. */
  unfiled: number;
}

/**
 * How many listed threads sit in each zone, how many notes wait to be filed,
 * and how many critical notes matter today. Takes `notesOnRecord`'s result
 * whole, so the tray can never be left out of the count: a client whose only
 * notes are waiting for a category does not read "none yet".
 */
export function notesSummary(
  record: Pick<NotesOnRecord, "listed" | "unfiled">,
  criticalEntries: readonly JournalEntry[],
  today: string,
  tz?: string,
): NotesSummary {
  const out: NotesSummary = {
    open: 0,
    standing: 0,
    resolved: 0,
    total: 0,
    critical: criticalEntries.length,
    unfiled: record.unfiled.length,
  };
  for (const t of record.listed) {
    out[zoneOf(t, today, tz)] += 1;
    out.total += 1;
  }
  return out;
}

export interface NotesTabMeta {
  /** The sub-toggle's line under "Notes"; null while the notes are loading. */
  meta: string | null;
  /** The red dot: a critical note matters today. */
  flag: boolean;
}

/**
 * The Notes segment's line: "3 open · 1 critical", "8 standing", "2 to file",
 * "none yet" — or "couldn't load", which is never "none yet". Null while
 * loading: an unknown count is not zero.
 */
export function notesTabMeta(
  summary: NotesSummary | null,
  state: { isLoading: boolean; readFailed: boolean },
): NotesTabMeta {
  const flag = (summary?.critical ?? 0) > 0;
  if (state.readFailed) return { meta: "couldn't load", flag };
  if (state.isLoading || !summary) return { meta: null, flag: false };
  if (summary.open > 0) {
    return { meta: summary.critical > 0 ? `${summary.open} open · ${summary.critical} critical` : `${summary.open} open`, flag };
  }
  if (summary.critical > 0) return { meta: `${summary.critical} critical`, flag };
  if (summary.total > 0) return { meta: summary.standing > 0 ? `${summary.standing} standing` : `${summary.resolved} resolved`, flag };
  if (summary.unfiled > 0) return { meta: `${summary.unfiled} to file`, flag };
  return { meta: "none yet", flag };
}

/**
 * The Overview's one line: "3 open, 1 critical · 8 standing · 5 resolved ·
 * 2 to file". Zero parts are dropped. "No notes in Journey yet" only when
 * there are none, the tray included — in Journey, because a migrating
 * client's older notes may live elsewhere.
 */
export function notesSummarySentence(summary: NotesSummary): string {
  const parts: string[] = [];
  if (summary.open > 0) {
    parts.push(summary.critical > 0 ? `${summary.open} open, ${summary.critical} critical` : `${summary.open} open`);
  } else if (summary.critical > 0) {
    parts.push(`${summary.critical} critical`);
  }
  if (summary.standing > 0) parts.push(`${summary.standing} standing`);
  if (summary.resolved > 0) parts.push(`${summary.resolved} resolved`);
  if (summary.unfiled > 0) parts.push(`${summary.unfiled} to file`);
  return parts.length ? parts.join(" · ") : "No notes in Journey yet";
}

/* ------------------------------------------------------------------ */
/* One thread, in words                                                */
/* ------------------------------------------------------------------ */

/**
 * Who wrote a note, the way a row says it: "Jess", "AJ", or where an import
 * came from ("Mindbody account notes") when nobody in the app wrote it.
 * Never "Unknown coach" when initials are there to say more.
 */
export function whoOf(
  entry: Pick<JournalEntry, "authorId" | "authorName" | "authorInitials" | "isLegacy" | "legacySource">,
): string {
  const noAuthor = !entry.authorId || entry.authorId === "unknown";
  if (entry.isLegacy && noAuthor) return (entry.legacySource ?? "").trim() || "Imported";
  const name = (entry.authorName ?? "").trim();
  if (name && !name.toLowerCase().startsWith("unknown")) return name.split(/\s+/)[0];
  const initials = (entry.authorInitials ?? "").trim();
  if (initials && initials !== "—") return initials;
  return "Unknown";
}

/**
 * A studio day key as "Mar 9" — "Mar 9, 2025" when it is not this year.
 * Read as UTC, like `describeWindow`, so the key's day is the day printed.
 * Empty for anything that is not a day key.
 */
export function shortDay(dayKey: string | null | undefined, todayKey: string): string {
  const m = DAY_KEY.exec((dayKey ?? "").trim());
  if (!m) return "";
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const date = new Date(Date.UTC(Number(m[1]), month, day));
  // "2026-02-30" is not a day; Date.UTC would quietly call it Mar 2.
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return "";
  const sameYear = todayKey.slice(0, 4) === m[1];
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/**
 * The quiet meta line for a thread in a zone:
 *   standing  "Jess · Mar 9 · 3 updates"
 *   resolved  "Jess · Nov 3 · closed Nov 7", or "· ended Oct 3" when its window ran out
 *   open      "AJ · Mar 4 · matters always · 2 updates" (a full card's meta)
 */
export function threadRowMeta(thread: NoteThread, zone: ThreadZone, today: string, tz?: string): string {
  const root = thread.root;
  const parts: string[] = [whoOf(root)];
  const written = shortDay(dayOf(root.occurredAt, tz), today);
  if (written) parts.push(written);
  const updates = updateCountLabel(thread);

  if (zone === "resolved") {
    if (root.resolvedAt) {
      const closed = shortDay(dayOf(root.resolvedAt, tz), today);
      parts.push(closed ? `closed ${closed}` : "closed");
    } else if (windowEnded(root, today, tz)) {
      const ended = shortDay(dayOf(root.effectiveUntil, tz), today);
      parts.push(ended ? `ended ${ended}` : "ended");
    }
    return parts.join(" · ");
  }
  if (zone === "open") parts.push(lowerFirst(describeWindow(root, tz)));
  if (updates) parts.push(updates);
  return parts.join(" · ");
}

export interface CloseWords {
  close: string;
  reopen: string;
}

/**
 * The words on a thread's close button. "All healed up" / "It's back" is for
 * a body — an injury or an incident — and reads wrong on an equipment note or
 * a preference, which simply close and reopen.
 */
export function closeWordsOf(root: Pick<JournalEntry, "kind" | "category" | "origin" | "isLegacy">): CloseWords {
  const cat = noteCategoryOf(root);
  if (cat === "injury" || cat === "incident") return { close: "All healed up", reopen: "It’s back" };
  return { close: "Close", reopen: "Reopen" };
}

/* ------------------------------------------------------------------ */
/* The briefing, as the record sees it                                 */
/* ------------------------------------------------------------------ */

/**
 * Where a thread stands with THIS trainer's next briefing:
 *   on        it will be read out. `checked` is false when the trainer's
 *             dismissals have not been read, so the screen cannot say whether
 *             they hushed it (and offers no hush until it can).
 *   hushed    this trainer said "no need to remind me", and nothing has
 *             happened to it since. Only they see this.
 *   from      it starts being read out on `day` (a pushed-ahead start, or a
 *             dated note's next day).
 *   aged-off  a Heads up with no end day is read out for three weeks; this
 *             one went quiet on `since`.
 */
export type BriefingStatus =
  | { kind: "on"; checked: boolean }
  | { kind: "hushed" }
  | { kind: "from"; day: string }
  | { kind: "aged-off"; since: string };

export interface BriefingContext {
  /** Ids of the hook's `criticalEntries`. */
  criticalIds: ReadonlySet<string>;
  /** Ids of the hook's `headsUpEntries`. */
  headsUpIds: ReadonlySet<string>;
  /** This trainer's dismissals; null when not read (yet, or at all). */
  dismissals: NoteDismissals | null;
  today: string;
  /** `HEADS_UP_WINDOW_DAYS`, passed in so this module never imports the hook. */
  headsUpWindowDays: number;
  tz?: string;
}

/**
 * The briefing line on a thread card. Null when the briefing has nothing to
 * do with it: a plain note, or one that is closed or whose window has run out.
 * Uses the hook's own selections (`criticalEntries` / `headsUpEntries`), so
 * the record and the briefing can never disagree about what is read out.
 */
export function briefingStatusOf(thread: NoteThread, ctx: BriefingContext): BriefingStatus | null {
  const root = thread.root;
  if (root.importance === "standard") return null;
  if (root.resolvedAt || root.isArchived) return null;
  if (windowEnded(root, ctx.today, ctx.tz)) return null;

  if (ctx.criticalIds.has(thread.id) || ctx.headsUpIds.has(thread.id)) {
    if (ctx.dismissals === null) return { kind: "on", checked: false };
    return isDismissed(thread, ctx.dismissals) ? { kind: "hushed" } : { kind: "on", checked: true };
  }

  if (shapeOf(root, ctx.tz) === "day") {
    const next = nextOccurrence(root, ctx.today, ctx.tz);
    return next ? { kind: "from", day: next } : null;
  }
  const start = startDayOf(root, ctx.tz);
  if (start && start > ctx.today) return { kind: "from", day: start };

  if (root.importance === "elevated" && !root.effectiveFrom && !root.effectiveUntil) {
    const written = toDate(root.occurredAt as Parameters<typeof toDate>[0]);
    if (!written) return null;
    const since = studioDateKey(new Date(written.getTime() + ctx.headsUpWindowDays * 86_400_000), ctx.tz);
    return since && since <= ctx.today ? { kind: "aged-off", since } : null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The critical line                                                   */
/* ------------------------------------------------------------------ */

/**
 * The critical line shows whole sentences until it holds at least this many
 * characters — then it stops at the end of a sentence and wraps. It is never
 * cut inside one, and never gets an "…".
 */
export const CRITICAL_LINE_MIN_CHARS = 90;

export interface CriticalLineModel {
  /** The thread "Open the note" goes to. */
  thread: NoteThread;
  /** The machine it is about, in full; null when none (or not on this studio's list). */
  machineName: string | null;
  /** The note's first whole sentence(s), on one line. Never cut, never "…"; the rest is one tap away. */
  text: string;
  /** How many other critical notes matter today. */
  more: number;
}

/**
 * A note written as lines ("Right knee\nNo lunges") read as one line: a line
 * that already ends in punctuation runs on with a space, any other is joined
 * with " · ", so two instructions never run together as one.
 */
function oneLine(text: string): string {
  let out = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    out += ".!?:;,".includes(out.charAt(out.length - 1)) ? ` ${line}` : ` · ${line}`;
  }
  return out;
}

/**
 * The one line under the bar: "Critical · Leg Press: stop at 90° at the
 * bottom turn." — the newest critical note that matters today (the hook's
 * order), with how many more there are. Null when there are none.
 *
 * Paired to its thread by id; an entry with no thread in hand (a fixture, a
 * screen that never assembled them) becomes a thread of one, as on the
 * briefing, so the line never has less to say than the note does.
 */
export function criticalLineOf(
  criticalEntries: readonly JournalEntry[],
  threads: readonly NoteThread[] | null | undefined,
  machines: readonly Pick<Machine, "id" | "name">[],
): CriticalLineModel | null {
  const first = criticalEntries.find((e) => !!e?.id);
  if (!first) return null;
  const thread = (threads ?? []).find((t) => t.id === first.id) ?? assembleThreads([first])[0];
  const root = thread.root;
  const machine = root.machineId ? machines.find((m) => m.id === root.machineId) : undefined;
  const machineName = machine?.name?.trim() || null;
  const body = root.body ?? "";
  return {
    thread,
    machineName,
    text: oneLine(firstSentences(body, CRITICAL_LINE_MIN_CHARS)),
    more: criticalEntries.filter((e) => !!e?.id).length - 1,
  };
}

/**
 * Critical threads a Notes filter is hiding: listed, critical today, and not
 * among what the filter kept. The Notes page draws the critical line for
 * these, so a chip or a search can never quietly hide the note that matters.
 */
export function hiddenCriticalThreads(
  listed: readonly NoteThread[],
  keptIds: ReadonlySet<string>,
  criticalIds: ReadonlySet<string>,
): NoteThread[] {
  return listed.filter((t) => criticalIds.has(t.id) && !keptIds.has(t.id));
}

/* ------------------------------------------------------------------ */
/* The door into FORD                                                  */
/* ------------------------------------------------------------------ */

/**
 * How many things FORD holds, for the "Life · in FORD" door on Notes.
 *
 *  - Null when this reader cannot read FORD (a cross-train visit): the door
 *    leads somewhere they may not open, and a number would be a claim about
 *    another studio's record.
 *  - Once FORD has been read: its live details, plus the older life notes it
 *    shows (`olderLifeCount`, once the FORD page carries them).
 *  - While it loads, or if it failed: the COUNTS the client document already
 *    carries (`fordSummary` — counts only; its text is never read here), plus
 *    the `client.events` rows FORD adds to what it read (`adaptClientEvents`,
 *    also on the client document — no read). `fordSummary` counts only FORD's
 *    own details, so without the events the number would jump when FORD
 *    arrives. It can still differ by an event a trainer has re-typed as a
 *    detail (FORD shows that once; this cannot see the bodies to match).
 *  - Null when `fordSummary` is missing: the events alone would be a
 *    confident undercount. Unknown is never 0.
 */
export function fordDoorCount(args: {
  readable: boolean;
  ford?: { status: FordReadStatus; entries: readonly Pick<FordEntry, "isArchived">[] } | null;
  client?: Client | null;
  olderLifeCount?: number;
}): number | null {
  if (!args.readable) return null;
  if (args.ford?.status === "denied") return null;
  const older = Math.max(0, args.olderLifeCount ?? 0);
  if (args.ford?.status === "ready") {
    return args.ford.entries.filter((e) => !e.isArchived).length + older;
  }
  const raw = (args.client as { fordSummary?: unknown } | null | undefined)?.fordSummary;
  if (!raw || typeof raw !== "object") return null;
  const summary = fordSummaryOf(args.client);
  let n = Math.max(0, Number(summary.untagged) || 0);
  for (const p of FORD_PILLARS) n += Math.max(0, Number(summary.counts[p]) || 0);
  return n + adaptClientEvents(args.client).length + older;
}

/* ------------------------------------------------------------------ */
/* What the other pages read                                           */
/* ------------------------------------------------------------------ */

/** Open or standing — a note that is still true. */
const isLive = (t: NoteThread, today: string, tz?: string) => zoneOf(t, today, tz) !== "resolved";

/**
 * How to coach her (Goals & Focus): Preference and Coaching-tip notes that are
 * still true, loudest first.
 *
 * By KIND, not by category: the catalog files every "general" note under
 * "Preferences & other", which would pull in every legacy session wrap-up and
 * label it a Preference. A focus check-in stays on its focus card.
 */
export function howToCoachThreads(threads: readonly NoteThread[], today: string, tz?: string): NoteThread[] {
  return sortThreads(
    withoutRecordFields(threads).filter((t) => {
      const r = t.root;
      if (r.isArchived || isUnfiled(r) || r.focusId) return false;
      if (r.kind !== "preference" && r.kind !== "coaching") return false;
      return isLive(t, today, tz);
    }),
  );
}

export interface InjuryThreads {
  open: NoteThread[];
  standing: NoteThread[];
  /** Resolved injury threads, counted — the whole story is on Notes. */
  resolved: number;
}

/**
 * Injury notes (Body & Pulse), by the catalog's category — an injury, or an
 * old life note about a surgery or an injury. With `includeIncidents`, open
 * incidents too ("knee pain on leg press, stopped the set" is exactly what the
 * load has to work around). The medical-history and clinical-notes FIELDS are
 * left out: Body draws them as fields. Critical ones are included; a page
 * that already carries them in the critical line drops them itself.
 */
export function injuryThreads(
  threads: readonly NoteThread[],
  today: string,
  options: { includeIncidents?: boolean; tz?: string } = {},
): InjuryThreads {
  const { includeIncidents = false, tz } = options;
  const open: NoteThread[] = [];
  const standing: NoteThread[] = [];
  let resolved = 0;
  for (const t of withoutRecordFields(threads)) {
    if (t.root.isArchived) continue;
    const cat = threadCategoryOf(t);
    if (cat !== "injury" && !(includeIncidents && cat === "incident")) continue;
    const zone = zoneOf(t, today, tz);
    if (zone === "open") open.push(t);
    else if (zone === "standing") standing.push(t);
    else resolved += 1;
  }
  return { open: sortThreads(open), standing: sortThreads(standing), resolved };
}

/**
 * Her notes on each machine (Body & Pulse → On our floor): every open or
 * standing thread tied to a machine, keyed by machine id, loudest first — a
 * standing "seat 7, gap 6" is exactly what the set-up card is for. An unfiled
 * note counts (it is still her note on that machine); a focus check-in does
 * not — it is a running log on its focus card, and dozens of them would bury
 * the set-up notes.
 */
export function threadsByMachine(
  threads: readonly NoteThread[],
  today: string,
  tz?: string,
): Map<string, NoteThread[]> {
  const out = new Map<string, NoteThread[]>();
  for (const t of withoutRecordFields(threads)) {
    const r = t.root;
    const machineId = typeof r.machineId === "string" ? r.machineId.trim() : "";
    if (!machineId || r.isArchived || r.focusId) continue;
    if (!isLive(t, today, tz)) continue;
    const list = out.get(machineId);
    if (list) list.push(t);
    else out.set(machineId, [t]);
  }
  for (const [id, list] of out) out.set(id, sortThreads(list));
  return out;
}

/** Where an older life note belongs on FORD, by the category it was written with. */
export const LIFE_CATEGORY_PILLAR: Readonly<Record<Exclude<LifeCategory, "Surgery" | "Injury">, FordPillar | null>> = {
  Birthday: "family",
  Anniversary: "family",
  Vacation: "recreation",
  Milestone: null,
  Other: null,
};

export type OlderLifeNotes = Record<FordPillar | "unplaced", NoteThread[]>;

/**
 * Older life notes (the journal's `life` kind, from before FORD) grouped by
 * the pillar FORD shows them in — "From an older note". Pass the settled ones
 * (`notesOnRecord(...).lifeSettled`).
 *
 * Only FORD / Life notes: a surgery or an injury is a load constraint first
 * and stays with Injury. The `client.events` rows are left out, because the
 * FORD page already draws those events itself (`adaptClientEvents`); an
 * orphaned thread update is left out too — it is part of a thread, not an
 * older note of its own. Newest first. The same test (`isOlderLifeNote`) is
 * what `notesOnRecord` settles by, so every settled note is placed here.
 */
export function olderLifeNotesByPillar(threads: readonly NoteThread[]): OlderLifeNotes {
  const out: OlderLifeNotes = { family: [], occupation: [], recreation: [], dreams: [], unplaced: [] };
  const time = (t: NoteThread) => toDate(t.root.occurredAt as Parameters<typeof toDate>[0])?.getTime() ?? 0;
  const sorted = threads.slice().sort((a, b) => time(b) - time(a));
  for (const t of sorted) {
    if (!isOlderLifeNote(t)) continue;
    const category = t.root.category as keyof typeof LIFE_CATEGORY_PILLAR | null;
    const pillar = category && category in LIFE_CATEGORY_PILLAR ? LIFE_CATEGORY_PILLAR[category] : null;
    out[pillar ?? "unplaced"].push(t);
  }
  return out;
}
