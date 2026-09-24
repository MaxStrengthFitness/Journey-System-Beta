/**
 * THE OVERVIEW, WORKED OUT — what each of the Overview's six slots says, from
 * what the tab already loaded.
 *
 * Client codex, Sep 2026 (phase 18). The Overview is the codex's front page
 * and where the tab always opens (AJ's decision 1): Notes as the top band,
 * then FORD, Body & Pulse, Goals & Focus, Story and Account, each a few lines
 * and a door to its page. Every line here is built by the SAME selector the
 * page it summarises uses, so the front page can never disagree with the
 * page behind it:
 *
 *   Notes          notesSummarySentence and the open threads (Notes' own
 *                  selection, loudest first) — plus a critical note still in
 *                  the To-file tray, because a critical note is never left
 *                  off the front page
 *   FORD           fordOverview (the In one line, each pillar's lead and
 *                  counts, Coming up with the Mindbody birthday, the open
 *                  gestures) and askNext for a pillar with nothing on file
 *   Body & Pulse   buildFacts' stature lede with her height and wingspan,
 *                  the flags as Watch-outs chips them, generalWatchOuts[0]
 *                  QUOTED, and the Pulse through pulse-read (statementChange,
 *                  latestPain) over the tab's one history
 *   Goals & Focus  goalsGlance (the why, the goal, the newest focus, the
 *                  How-to-coach lead line)
 *   Story          the Story's own since line and its three newest moments
 *                  (`CodexData.story`, built once by the shell)
 *   Account        accountGlance, in its two columns
 *
 * THE RULES IT KEEPS.
 *  - ZERO READS. Everything is the tab's one load; nothing here opens,
 *    fetches or writes anything.
 *  - Each slot has a sentence for what is MISSING ("No line yet.", "No
 *    Pulse saved in Journey yet.") and a DIFFERENT one for what could not be
 *    READ ("Notes couldn't be loaded, so nothing here is certain.") or is
 *    still on its way. A failed read never reads as empty.
 *  - FORD text reaches only a reader the FORD rule lets in, and only once
 *    FORD answered (`fordStatus === "ready"`). While it loads the slot says
 *    so with the count the tab already holds (`fordCountOf`, the sub-toggle's
 *    number) — never the client document's copied lines, which a cross-train
 *    studio can read. For a reader FORD refuses, the slot says whose FORD it
 *    is and nothing else.
 *  - What is SAVED: the Overview reads the record as it is on file; an
 *    unsaved edit is the Save bar's to show.
 *  - Sentences, not scores: no percentage, no /10, no traffic light. The
 *    Pulse is quoted in the Dial's words, and "was …" needs an earlier round
 *    that answered the same thing (a minimum sample of two).
 *  - Verbatim: a watch-out, a Pulse statement, a note is quoted as written.
 *    A long one shows its whole first sentences (`firstSentences`) — never
 *    cut mid-sentence, never an ellipsis — and the page behind has it all.
 *  - Prior history is real history: the Story line is the Story's own
 *    (`sinceLine`), which never calls a migrating client new; "No notes in
 *    Journey yet" and "No Pulse saved in Journey yet" say where they looked.
 *  - Pronouns from the gender Mindbody holds (she / he / they); the client's
 *    name is the header's, never repeated here.
 *
 * Pure: no React, no Firestore, no clock of its own (`today` is the studio's
 * day, handed in). overview-model.test.ts, under TZ=America/New_York.
 */
import type { Client, Machine, Studio } from "../../types";
import type { JournalImportance } from "../../types/journal";
import type { UseClientJournalResult } from "../../hooks/useClientJournal";
import type { UseClientFordResult } from "../ford/useClientFord";
import { sortThreads, zoneOf } from "../client-notes/threads";
import { notesSummarySentence, olderLifeNotesByPillar, threadRowMeta } from "../client-notes/record-selectors";
import { FORD_META, GESTURE_STATUS_LABEL, type FordPillar, type FordUrgency } from "../ford/types";
import { fordOverview } from "../ford/page-model";
import { birthdayLabel, studioNoon } from "../ford/coming-up";
import { oneLineMeta } from "../ford/one-line";
import { askNext } from "../ford/ask-next";
import { fordReadNotice } from "../ford/read-status";
import { fordStudioIdOf } from "../ford/ford-rollup";
import { isRetiredClient } from "../client-life/life";
import { selectedFlags } from "../clinical-flags/flag-search";
import { generalWatchOuts } from "../../lib/clinical-watchouts";
import { ASSESSMENT_PILLARS } from "../subjective-report/pillars";
import { SUBJECTIVE_CATEGORY_KEYS, type SubjectiveCategoryKey } from "../subjective-report/types";
import { goalsGlance } from "../goals/goals-page";
import { STORY_READ_LABEL, type Story, type StoryRead } from "../client-story/story";
import { accountGlance } from "../client-admin/account";
import { buildFacts } from "./body/build";
import { flagChip } from "./body/watchout-groups";
import {
  dayWords,
  latestPain,
  latestPulseReadings,
  previousReading,
  shownStatement,
  spotWords,
  statementChange,
  type PulseSource,
} from "./body/pulse-read";
import { newestPulseDay } from "./body/page-lines";
import { cap, curly, dayKeyDate, firstSentences, inTime, joinDots, monthDay, monthDayYear, monthLabel, plural } from "./kit/text";
import { agree, type Pronouns } from "./kit/pronouns";
import type { CodexAccess } from "./access";
import { fordCountOf, type CodexFordStatus, type CodexNotes, type CodexPulse } from "./codex-data";

/* ------------------------------------------------------------------ */
/* What the Overview is handed                                         */
/* ------------------------------------------------------------------ */

/** The parts of the tab's one load (`CodexData`) the Overview reads. */
export interface OverviewInput {
  client: Client;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
  tz?: string;
  access: Pick<CodexAccess, "fordReadable" | "fordWritable" | "homeStudioName">;
  pronouns: Pronouns;
  machines: readonly Pick<Machine, "id" | "name">[];
  notes: CodexNotes;
  journal: Pick<UseClientJournalResult, "threads" | "focuses" | "loadState" | "capped">;
  ford: Pick<UseClientFordResult, "status" | "buckets" | "entries" | "oneLine">;
  fordStatus: CodexFordStatus;
  pulse: CodexPulse;
  story: Story;
  /** The studios this reader may see (Account's "Home: Westlake · also trains at Solon"). */
  studios: readonly Pick<Studio, "id" | "name">[];
}

/** How many open notes the Notes band lists before "All N notes". */
export const OV_NOTE_ROWS = 3;
/** How far ahead FORD's Coming up looks on the Overview, in days. */
export const OV_COMING_UP_DAYS = 60;
/** How many dates, and how many gestures, the FORD slot lists. */
export const OV_FORD_ROWS = 2;
/** How many of the Story's newest moments the Story slot lists. */
export const OV_STORY_ROWS = 3;

/** How long a one-line lead may run before it stops at a sentence's end (never mid-sentence). */
const NOTE_LINE = 120;
const TILE_LINE = 90;
const DATE_LINE = 60;

const machineNameOf = (machines: OverviewInput["machines"], id: string | null | undefined): string | null =>
  id ? machines.find((m) => m.id === id)?.name?.trim() || null : null;

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export interface OverviewNoteRow {
  threadId: string;
  importance: JournalImportance;
  /** The machine the note is about, named first and in full. */
  machine: string | null;
  /** The note's whole first sentences, verbatim. */
  text: string;
  meta: string;
}

export interface NotesGlance {
  state: "ready" | "loading" | "failed";
  /** The counts ("3 open, 1 critical · 8 standing · 5 resolved"), or what could not be counted. */
  line: string;
  /** Read, and there are none: `line` is then "No notes in Journey yet." */
  none: boolean;
  /** The loudest open notes: critical first, then Heads up, then the newest. */
  rows: OverviewNoteRow[];
  /** Under the counts when nothing is open: "Nothing open. 8 standing notes are on Notes." */
  nothingOpen: string | null;
  /** The door's words: "All 16 notes", or "Notes" when the count is not known. */
  allLabel: string;
}

export function notesGlance(input: Pick<OverviewInput, "notes" | "journal" | "machines" | "today" | "tz">): NotesGlance {
  const { notes, journal, machines, today, tz } = input;
  if (notes.state === "failed") {
    return {
      state: "failed",
      line: "Notes couldn't be loaded, so nothing here is certain.",
      none: false,
      rows: [],
      nothingOpen: null,
      allLabel: "Notes",
    };
  }
  const summary = notes.summary;
  if (notes.state !== "ready" || !summary) {
    return { state: "loading", line: "Loading notes…", none: false, rows: [], nothingOpen: null, allLabel: "Notes" };
  }
  const total = summary.total + summary.unfiled;
  if (total === 0) {
    // "in Journey": a migrating client's older notes may live elsewhere.
    return { state: "ready", line: "No notes in Journey yet.", none: true, rows: [], nothingOpen: null, allLabel: "Notes" };
  }

  // A critical note still waiting in the To-file tray matters today like any
  // other: it is counted as critical, so it is drawn here too (its door lands
  // on its tray card on Notes).
  const unfiledIds = new Set(notes.record.unfiled.map((e) => e.id));
  const unfiledCritical = (journal.threads ?? []).filter(
    (t) => unfiledIds.has(t.id) && t.root.importance === "critical" && zoneOf(t, today, tz) === "open",
  );
  const open = notes.record.listed.filter((t) => zoneOf(t, today, tz) === "open");
  const shown = sortThreads([...open, ...unfiledCritical]).slice(0, OV_NOTE_ROWS);
  const rows = shown.map((t): OverviewNoteRow => {
    const importance: JournalImportance =
      t.root.importance === "elevated" || t.root.importance === "critical" ? t.root.importance : "standard";
    const meta = threadRowMeta(t, "open", today, tz);
    return {
      threadId: t.id,
      importance,
      machine: machineNameOf(machines, t.root.machineId),
      text: firstSentences(t.root.body ?? "", NOTE_LINE),
      meta: unfiledIds.has(t.id) ? joinDots([meta, "waiting to be filed"]) : meta,
    };
  });

  return {
    state: "ready",
    line: `${notesSummarySentence(summary)}${journal.capped ? " · some older items not loaded" : ""}`,
    none: false,
    rows,
    nothingOpen:
      rows.length > 0
        ? null
        : summary.standing > 0
          ? `Nothing open. ${plural(summary.standing, "standing note is", "standing notes are")} on Notes.`
          : "Nothing open.",
    allLabel: `All ${plural(total, "note")}`,
  };
}

/* ------------------------------------------------------------------ */
/* FORD                                                                */
/* ------------------------------------------------------------------ */

export interface OverviewFordTile {
  pillar: FordPillar;
  label: string;
  /** The pillar's first standing fact (or newest moment), or her work, as whole sentences. */
  lead: string | null;
  /** "Nothing on file yet." — only once FORD answered and the pillar holds nothing. */
  empty: string | null;
  /** 'Ask: “How is retirement going?”' — once FORD answered and nothing leads. */
  ask: string | null;
  /** "6 details · 1 idea" — what FORD holds under it, once known. */
  meta: string | null;
}

export interface OverviewDateRow {
  key: string;
  /** "in 17 days". */
  when: string;
  urgency: FordUrgency;
  /** "Her 69th birthday · Apr 2". */
  what: string;
}

export interface OverviewGestureRow {
  key: string;
  /** Idea · Planned. */
  status: string;
  idea: string;
  /** Who is doing it, in full; "no owner yet" until someone says "I'll do it". */
  owner: string;
}

export interface FordGlance {
  /** `off` is a reader the FORD rule refuses (never read), and a refused read. */
  state: "ready" | "loading" | "failed" | "off";
  /** Said instead of FORD's contents while it loads, when it failed, and to a reader it refuses. */
  notice: string | null;
  /** In one line, once FORD answered: the team's sentence and who wrote it last. */
  line: { text: string; meta: string } | null;
  /** "No line yet." — only once FORD answered and there is none. */
  lineMissing: string | null;
  /** Offer "Write one": no line, and this reader may write FORD. */
  writeLine: boolean;
  /**
   * The four pillars, once FORD answered. None while it loads, when it
   * failed, or for a reader it refuses: four empty tiles would read as
   * "nothing on file" beside the sentence that says it isn't known.
   */
  tiles: OverviewFordTile[];
  /** Coming up within OV_COMING_UP_DAYS; null until FORD answered (unknown, not none). */
  dates: OverviewDateRow[] | null;
  datesEmpty: string | null;
  /** The ideas and plans still open; null until FORD answered. */
  gestures: OverviewGestureRow[] | null;
  gesturesEmpty: string | null;
}

export function fordGlance(
  input: Pick<OverviewInput, "client" | "today" | "access" | "pronouns" | "notes" | "ford" | "fordStatus">,
): FordGlance {
  const { client, today, access, pronouns: p, notes, ford, fordStatus } = input;
  const nothing = { line: null, lineMissing: null, writeLine: false, dates: null, datesEmpty: null, gestures: null, gesturesEmpty: null };

  if (fordStatus === "off" || fordStatus === "denied") {
    return {
      state: "off",
      notice: `FORD is kept by ${access.homeStudioName ?? "the home studio"}. It opens for the people who work there.`,
      tiles: [],
      ...nothing,
    };
  }

  const now = studioNoon(today);
  const ready = fordStatus === "ready";
  const olderByPillar = notes.state === "ready" ? olderLifeNotesByPillar(notes.record.lifeSettled) : null;
  const ov = fordOverview({
    status: fordStatus,
    buckets: ford.buckets,
    entries: ford.entries,
    oneLine: ford.oneLine,
    olderByPillar,
    client,
    // The record as it is on file: an unsaved edit is the Save bar's to show.
    work: client,
    todayKey: today,
  });
  const retired = isRetiredClient(client);

  const tiles = ov.pillars.map((pl): OverviewFordTile => {
    const lead = pl.lead ? firstSentences(pl.lead, TILE_LINE) : null;
    const known = ready && pl.detailCount !== null;
    return {
      pillar: pl.pillar,
      label: FORD_META[pl.pillar].label,
      lead,
      empty: known && pl.detailCount === 0 && !lead ? "Nothing on file yet." : null,
      ask: ready && !lead ? `Ask: ${curly(askNext(pl.pillar, { retired, seed: now, entries: ford.entries }).question)}` : null,
      meta:
        joinDots([
          known && pl.detailCount ? plural(pl.detailCount, "detail") : null,
          ready && pl.ideas ? plural(pl.ideas, "idea") : null,
          ready && pl.planned ? `${pl.planned} planned` : null,
        ]) || null,
    };
  });

  if (!ready) {
    const count = fordCountOf({ readable: access.fordReadable, ford, client }, notes);
    const notice =
      fordStatus === "failed"
        ? (fordReadNotice("failed", fordStudioIdOf(client)) ?? "FORD couldn't be read just now.")
        : count !== null && count > 0
          ? `Reading FORD… ${plural(count, "detail")} on file.`
          : "Reading FORD…";
    return { state: fordStatus === "failed" ? "failed" : "loading", notice, tiles: [], ...nothing };
  }

  const dates = ov.comingUp
    .filter((r) => r.daysAway >= 0 && r.daysAway <= OV_COMING_UP_DAYS)
    .slice(0, OV_FORD_ROWS)
    .map(
      (r): OverviewDateRow => ({
        key: r.key,
        when: inTime(r.daysAway),
        urgency: r.urgency,
        what: `${r.kind === "birthday" ? birthdayLabel(r, p) : firstSentences(r.entry.body ?? "", DATE_LINE)} · ${monthDay(r.when)}`,
      }),
    );
  const gestures = ov.openGestures.slice(0, OV_FORD_ROWS).map((e): OverviewGestureRow => {
    const opp = e.opportunity!;
    return {
      key: e.id,
      status: GESTURE_STATUS_LABEL[opp.status],
      idea: (opp.idea ?? "").trim() || firstSentences(e.body ?? "", DATE_LINE),
      owner: (opp.ownerName ?? "").trim() || "no owner yet",
    };
  });

  return {
    state: "ready",
    notice: null,
    line: ov.oneLine ? { text: ov.oneLine.text, meta: oneLineMeta(ov.oneLine, now) } : null,
    lineMissing: ov.oneLine ? null : "No line yet.",
    writeLine: !ov.oneLine && access.fordWritable,
    tiles,
    dates,
    datesEmpty: dates.length ? null : "No dates in the next two months.",
    gestures,
    gesturesEmpty: gestures.length ? null : "No ideas yet.",
  };
}

/* ------------------------------------------------------------------ */
/* Body & Pulse                                                        */
/* ------------------------------------------------------------------ */

export interface PulseGlance {
  /** "She says:" once there is something she said; null for a state sentence. */
  label: string | null;
  text: string;
}

/** The Pulse areas with statements, in the Pulse's own pillar order (Sleep & Recovery first). */
const STATEMENT_AREAS: readonly SubjectiveCategoryKey[] = ASSESSMENT_PILLARS.flatMap((pl) =>
  pl.sectionIds.filter((id): id is SubjectiveCategoryKey => (SUBJECTIVE_CATEGORY_KEYS as readonly string[]).includes(id)),
);

/**
 * What she says, from the saved rounds (the tab's one history — the Body
 * page's open draft is that page's editor, not the front page's): the Sleep &
 * Recovery statement when she has answered one, else the first area in the
 * Pulse's own order that has an answer — a fixed rule, never "the one that
 * moved most". Quoted verbatim with the Dial's word; "up from …" only against
 * an earlier round that answered it with another word. Then up to two
 * pain-map spots, most severe first, with the last different word for the
 * same spot.
 *
 * Each answer is the latest one to ITS question (the living rule), so it can
 * be older than the newest round the slot's footer names ("Pulse Mar 10").
 * An answer from an older round carries its own day — "Often (Jan 10), up
 * from …", "Right knee Mild (Jan 10)" — so an old word is never read as
 * today's.
 */
export function pulseGlance(pulse: CodexPulse, p: Pronouns, now: Date): PulseGlance {
  if (pulse.status === "failed") {
    return { label: null, text: `The Pulse couldn't be loaded, so what ${p.subject} ${agree(p, "says", "say")} isn't shown here.` };
  }
  const history = pulse.status === "ready" ? pulse.history : null;
  if (!history) return { label: null, text: "Loading the Pulse…" };
  if (history.reports.length === 0) {
    return {
      label: null,
      text: history.complete ? "No Pulse saved in Journey yet." : "No Pulse among the reports read here.",
    };
  }

  const source: PulseSource = { draft: null, history };
  const readings = latestPulseReadings(source);
  let shown: ReturnType<typeof shownStatement> = null;
  for (const area of STATEMENT_AREAS) {
    shown = shownStatement(area, readings);
    if (shown) break;
  }
  const newest = newestPulseDay(history);
  // An answer's own day, in words, when it is older than the round the footer names.
  const olderDay = (day: string) => (day && day !== newest ? dayWords(day, now) : "");
  const parts: string[] = [];
  if (shown) {
    const previous = previousReading(shown.id, source, shown.reading);
    const change = statementChange(shown.text, shown.reading, previous, now, olderDay(shown.reading.day));
    const day = dayWords(shown.reading.day, now);
    parts.push(change ?? `${curly(shown.text)} ${shown.reading.word}${day ? `, ${day}` : ""}.`);
  }
  const pain = latestPain(source);
  const painDay = pain ? olderDay(pain.day) : "";
  for (const spot of pain?.spots.slice(0, 2) ?? []) {
    const was = spot.prev ? dayKeyDate(spot.prev.day) : null;
    const prev = spot.prev ? `, was ${spot.prev.word}${was ? ` in ${monthLabel(was, now)}` : ""}` : "";
    parts.push(`${cap(spotWords(spot.point))} ${spot.word}${painDay ? ` (${painDay})` : ""}${prev}.`);
  }
  if (parts.length === 0) {
    const day = dayWords(newest, now);
    return { label: null, text: day ? `Pulse saved ${day}.` : "Pulse saved." };
  }
  return { label: `${cap(p.subject)} ${agree(p, "says", "say")}:`, text: parts.join(" ") };
}

export interface BodyGlance {
  /** Where she sits against the machines, with her height and wingspan. */
  lede: string;
  chips: { id: string; text: string; tone: "alert" | "warn" | "live" }[];
  /** "No clinical flags on file." */
  chipsEmpty: string | null;
  /** The first "every set" instruction, verbatim, and how many more there are. */
  everySet: { quote: string; more: number } | null;
  says: PulseGlance;
  /** Where the lines come from: the clinical list, the Pulse's day, the InBody scan's. */
  foot: string;
}

export function bodyGlance(input: Pick<OverviewInput, "client" | "today" | "pronouns" | "pulse">): BodyGlance {
  const { client, today, pronouns: p, pulse } = input;
  const now = studioNoon(today);
  const facts = buildFacts({ client, formData: {}, pronouns: p, now });
  const lede =
    facts.band !== null && facts.heightIn !== null
      ? `${facts.lede.replace(/\.$/, "")}: ${facts.height.text}${facts.reach ? `, with a ${facts.reach.text}` : ""}.`
      : facts.lede;

  const chips = selectedFlags(client.clinicalFlags).map((f) => ({ id: f.id, ...flagChip(f) }));
  const general = generalWatchOuts(client.clinicalFlags);
  const instructions = [...new Set(general.map((w) => w.instruction))];

  const pulseDay = pulse.status === "ready" ? newestPulseDay(pulse.history) : null;
  const pulseWhen = dayWords(pulseDay, now);
  const scanWhen = dayWords(client.inbodySummary?.latestTestedAt, now);

  return {
    lede,
    chips,
    chipsEmpty: chips.length ? null : "No clinical flags on file.",
    everySet: general.length ? { quote: general[0].instruction, more: instructions.length - 1 } : null,
    says: pulseGlance(pulse, p, now),
    foot: joinDots([
      general.length ? "Watch-outs quoted from the studio's clinical list" : null,
      pulseWhen ? `Pulse ${pulseWhen}` : null,
      scanWhen ? `InBody ${scanWhen}` : null,
    ]),
  };
}

/* ------------------------------------------------------------------ */
/* Goals & Focus                                                       */
/* ------------------------------------------------------------------ */

export interface OverviewLine {
  /** Bold, before the words: "Working toward:", "Focus ·", "How to coach her:". */
  label: string;
  text: string;
  /** A coaching note's Loudness, when it is Heads up or Critical. */
  importance?: JournalImportance | null;
}

export interface GoalsOverview {
  /** Her why, verbatim (the page draws the quote marks). */
  why: string | null;
  /** "Her why isn't written down yet." */
  whyMissing: string | null;
  lines: OverviewLine[];
  /** "2 focuses running · 2 goals reached"; empty when there is nothing to count. */
  foot: string;
}

export function goalsOverview(
  input: Pick<OverviewInput, "client" | "today" | "tz" | "pronouns" | "notes" | "journal" | "machines">,
): GoalsOverview {
  const { client, today, tz, pronouns: p, notes, journal, machines } = input;
  const focusState = journal.loadState?.focuses ?? "loading";
  const g = goalsGlance({
    client,
    focuses: focusState === "ready" ? journal.focuses : null,
    threads: journal.threads,
    notesState: notes.state,
    today,
    tz,
  });

  const focus: OverviewLine =
    focusState === "failed"
      ? { label: "Focus:", text: "the focuses couldn't be loaded." }
      : focusState !== "ready"
        ? { label: "Focus:", text: "loading…" }
        : g.focusLine
          ? { label: "Focus ·", text: g.focusLine }
          : { label: "Focus:", text: "none running." };

  const coachLabel = `How to coach ${p.object}:`;
  let coach: OverviewLine;
  const lead = g.coach;
  if (lead.kind === "strategy") {
    coach = { label: coachLabel, text: firstSentences(lead.text, NOTE_LINE) };
  } else if (lead.kind === "note") {
    const machine = machineNameOf(machines, lead.machineId);
    coach = {
      label: coachLabel,
      text: `${machine ? `${machine}: ` : ""}${firstSentences(lead.text, NOTE_LINE)} — ${lead.author}`,
      importance: lead.importance === "standard" ? null : lead.importance,
    };
  } else if (lead.kind === "none") {
    coach = { label: coachLabel, text: "not written yet." };
  } else {
    coach = {
      label: coachLabel,
      text: lead.state === "failed" ? `${p.possessive} notes couldn't be loaded.` : "loading…",
    };
  }

  return {
    why: g.why,
    whyMissing: g.why ? null : `${cap(p.possessive)} why isn't written down yet.`,
    lines: [
      { label: "Working toward:", text: g.workingToward ?? "nothing set yet." },
      focus,
      coach,
    ],
    foot: g.foot,
  };
}

/* ------------------------------------------------------------------ */
/* Story                                                               */
/* ------------------------------------------------------------------ */

export interface OverviewStoryRow {
  key: string;
  /** "Mar 14" ("Mar 14, 2025" in another year); "Before Journey" for the undated panel. */
  day: string;
  text: string;
}

export interface StoryGlance {
  /** The Story's own since line, or what is missing. */
  lede: string;
  rows: OverviewStoryRow[];
  /** "Nothing dated yet. …" — only when nothing is unknown. */
  empty: string | null;
  /** What could not be read, so a moment may be missing. */
  unread: string | null;
}

/** "notes", "notes and FORD", "notes, FORD and InBody scans". */
function readWords(reads: readonly StoryRead[]): string {
  const words = reads.map((r) => STORY_READ_LABEL[r]);
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function storyGlance(input: Pick<OverviewInput, "story" | "today" | "pronouns">): StoryGlance {
  const { story, today, pronouns: p } = input;
  const now = studioNoon(today);
  const rows = story.beats.slice(0, OV_STORY_ROWS).map((b): OverviewStoryRow => {
    const date = dayKeyDate(b.day);
    const q = b.quotes?.[0];
    return {
      key: b.key,
      day: date ? monthDayYear(date, now) : "Before Journey",
      text: `${firstSentences(b.text, NOTE_LINE)}${q ? ` ${curly(q.text)} ${q.to}, was ${q.from}.` : ""}`,
    };
  });

  let unread: string | null = null;
  if (story.failed.length) unread = `Couldn't read ${readWords(story.failed)} here, so a moment may be missing.`;
  else if (story.pending.length) unread = `Still reading ${readWords(story.pending)}, so a moment may be missing.`;
  else if (story.off.includes("ford")) unread = "FORD is kept by the home studio, so FORD moments aren't shown here.";
  else if (story.capped) unread = "This record is unusually large, so an older moment may be missing.";

  return {
    lede: story.sinceLine ?? `When ${p.subject} started isn't on file yet.`,
    rows,
    empty: rows.length || unread ? null : "Nothing dated yet. It fills in as the team records things.",
    unread,
  };
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

export interface AccountOverview {
  /** Age and birthday, the emergency contact, the waiver. */
  who: string[];
  /** What is left, the package, where she trains. */
  membership: string[];
  /** "Nothing on file for the account yet." when both columns are empty. */
  empty: string | null;
  /** "From Mindbody, synced 2 days ago · the renewal is worked out nightly". */
  foot: string;
}

export function accountOverview(input: Pick<OverviewInput, "client" | "studios" | "today">): AccountOverview {
  const g = accountGlance(input.client, input.studios, input.today, studioNoon(input.today));
  return {
    who: g.who,
    membership: g.membership,
    empty: g.lines.length ? null : "Nothing on file for the account yet.",
    foot: g.foot,
  };
}

/* ------------------------------------------------------------------ */
/* The whole front page                                                */
/* ------------------------------------------------------------------ */

export interface OverviewModel {
  notes: NotesGlance;
  ford: FordGlance;
  body: BodyGlance;
  goals: GoalsOverview;
  story: StoryGlance;
  account: AccountOverview;
}

export function overviewModel(input: OverviewInput): OverviewModel {
  return {
    notes: notesGlance(input),
    ford: fordGlance(input),
    body: bodyGlance(input),
    goals: goalsOverview(input),
    story: storyGlance(input),
    account: accountOverview(input),
  };
}

/** The FORD slot's eyebrow: "Who she is · FORD". */
export function fordEyebrow(p: Pronouns): string {
  return `Who ${p.subject} ${agree(p, "is", "are")} · FORD`;
}
