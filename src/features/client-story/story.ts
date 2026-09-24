/**
 * THE STORY — a client's time with Max Strength, newest first, worked out
 * from what the team already recorded. The pure half of the Story page
 * (client codex, phase 15).
 *
 * Client codex, Sep 2026. AJ: "their profile is their history, their
 * journey, who they are". The long scroll had no page for the first of
 * those — a client's history was scattered over the contract list, the
 * goal history, the Pulse shelf, the InBody card and FORD, each in its own
 * corner. The Story puts the dated moments in one column, newest first, and
 * every line comes from a record somebody already made, so nothing is typed
 * twice and nothing here is ever written anywhere:
 *
 *   contract     a package started, renewed, came back after a gap, was
 *                cancelled, or ended with nothing after it (Mindbody)
 *   mindbody     the first visit, as Mindbody records it — or, when the date
 *                was inferred (a schedule pull, a backfill), "the earliest …
 *                Journey has" in words that name what it was taken from: a
 *                ceiling, not the first (`firstVisitOf`)
 *   prior        the years before Journey (the prior record: FileMaker,
 *                paper), as ONE panel that says they happened and how many
 *                sessions they held — never as a blank, and never lost to a
 *                last day typed after today
 *   journey      the first session in Journey — "First session." only when
 *                Journey holds her whole story
 *   goal/focus   goals marked achieved; focuses achieved (a retired focus is
 *                not a moment)
 *   pedigree     each dated step in protocol mastery
 *   inbody       each scan's printed weight and skeletal muscle — NO change
 *                clause: whether a change is real is Body & Pulse's call,
 *                against the scanner's normal variation (AJ's decision 8)
 *   pulse        each saved round, and the statements whose answer moved,
 *                quoted verbatim with their words ("Sometimes", "Often")
 *   note         a critical or injury note opened, and closed
 *   ford         a FORD moment, and a gesture marked done
 *
 * The rules it keeps:
 *  - NO READS. Everything is handed in from the tab's one load, each source
 *    as a `Src<T>`: a source still loading is PENDING, one that failed is
 *    FAILED, one this reader may not open (FORD for a cross-train studio) is
 *    OFF — and none of them makes a beat. The page names them, so a missing
 *    moment is never mistaken for "it didn't happen".
 *  - Prior history is real history. A migrated client is never "new", never
 *    "First session.", and her first Pulse in Journey is "First Pulse in
 *    Journey" only when the Pulse read reached her first report.
 *  - Sentences, not scores. The beats state recorded facts: no trend, no
 *    average, no pace. A Pulse beat quotes words, never 0–10 numbers.
 *  - Verbatim. A note, a goal, a FORD line, a Pulse statement is the words
 *    as written; the page may fold a long one behind "Read all", never
 *    reword it.
 *  - Dates are days: a Mindbody contract date is a UTC day (`mindbodyDayKey`),
 *    a stored instant is the studio's day (`studioDayKeyOf`), a day key is
 *    itself. Nothing dated after today is a moment yet (the panel for the
 *    years before Journey is moved back to today rather than dropped).
 *  - No regex lookbehind (older iPadOS Safari fails the whole module).
 *
 * Pure: no React, no Firestore. story.test.ts, under TZ=America/New_York.
 */
import type { Client } from "../../types";
import type { ClientFocus } from "../../types/journal";
import type { NoteThread } from "../client-notes/threads";
import { updateCountLabel } from "../client-notes/threads";
import { noteCategoryOf } from "../client-notes/note-catalog";
import { shortDay, whoOf } from "../client-notes/record-selectors";
import { FORD_META, type FordEntry } from "../ford/types";
import type { InBodyScan } from "../inbody/types";
import { ALL_STATEMENT_IDS } from "../subjective-report/questions";
import {
  EMPTY_BASELINE,
  advanceBaseline,
  dayOrInstantMs,
  statementAnswer,
  type AssessmentHistory,
  type AssessmentHistoryReport,
  type LivingBaseline,
} from "../subjective-report/assessment-history";
import { FREQUENCY_SCALE, dialWord, tenToAbsolute } from "../rating/scales";
import { statementTextOf } from "../client-codex/body/pulse-read";
import { buildContractHistory, tierLabel } from "../client-admin/contract";
import { mindbodyDayKey } from "../renewals/engine";
import { focusDaysActive, focusEndDate, focusStartDate, formatSpan } from "../goals/focus";
import { readGoalHistory } from "../goals/goals";
import { isRecordAnchor, noteAnchor, type RecordAnchor, type RecordPage } from "../client-profile/profile-nav";
import { resolveClientSince } from "../../lib/client-since";
import {
  COVERAGE_CAVEAT,
  priorHistoryOf,
  type HistoryCoverage,
  type PriorHistory,
  type PriorHistorySource,
} from "../../lib/prior-history";
import { studioDayKeyOf, type DateLike } from "../../lib/studio-time";
import { firstSentences } from "../../lib/first-sentences";
import { cap, curly, dayKeyDate, joinDots, plural } from "../client-codex/kit/text";
import { agree, pronounsOf, type Pronouns } from "../client-codex/kit/pronouns";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * One source of the story as the tab holds it. Only `ready` carries data;
 * `off` is a read this reader may not make (FORD is the home studio's), so
 * it is neither loading nor failed.
 */
export type Src<T> =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "off" }
  | { status: "ready"; data: T };

/** What a beat is about — the page's filters. */
export type StoryKind = "milestone" | "coaching" | "body" | "life";

/** Where a beat came from. */
export type StorySource =
  | "contract"
  | "mindbody"
  | "prior"
  | "journey"
  | "goal"
  | "focus"
  | "pedigree"
  | "inbody"
  | "pulse"
  | "note"
  | "ford";

/** The sources the tab READS (the rest are the client document, always in hand). */
export type StoryRead = "notes" | "focuses" | "ford" | "inbody" | "pulse";

/** How the page names a read in "Still reading …" and "Couldn't read …". */
export const STORY_READ_LABEL: Record<StoryRead, string> = {
  notes: "notes",
  focuses: "focuses",
  ford: "FORD",
  inbody: "InBody scans",
  pulse: "Pulse rounds",
};

/** Where a beat's door goes: a page, and a card on it (RECORD_ANCHORS). */
export interface StoryDoor {
  page: RecordPage;
  anchor?: RecordAnchor;
}

/** A Pulse statement whose answer moved: the statement verbatim, and its words. */
export interface StoryQuote {
  statementId: string;
  text: string;
  from: string;
  to: string;
}

export interface StoryBeat {
  key: string;
  /** The studio day, yyyy-mm-dd. Null only for the "Before Journey" panel. */
  day: string | null;
  kind: StoryKind;
  source: StorySource;
  /** The sentence, or the words as written (a note, a FORD line). */
  text: string;
  quotes?: StoryQuote[];
  /** Where it came from and who: "Critical note · Jess · 2 updates". */
  sourceLine: string;
  door: StoryDoor | null;
  /** The panel for the years before Journey (the prior record, or none). */
  isEra?: true;
  eraDetail?: string;
}

export interface StoryYear {
  /** Null for the "Before Journey" panel, which has no day. */
  year: number | null;
  beats: StoryBeat[];
}

export interface Story {
  /** Newest first; the undated "Before Journey" panel last. */
  beats: StoryBeat[];
  years: StoryYear[];
  /** Reads still on their way: their moments aren't shown yet. */
  pending: StoryRead[];
  /** Reads that failed: their moments aren't shown, and may exist. */
  failed: StoryRead[];
  /** Reads this reader may not make (FORD at a cross-train studio). */
  off: StoryRead[];
  /** "With Max Strength since Mar 2019. 412 sessions in FileMaker before Journey, and 49 in Journey." */
  sinceLine: string | null;
  /** The journal hit its guard rail, so an older note or focus may be missing. */
  capped: boolean;
}

/** The client-document fields the story reads. */
export type StoryClient = Pick<
  Client,
  | "goalHistory"
  | "pedigreeHistory"
  | "priorHistory"
  | "firstSessionDate"
  | "firstAppointmentDate"
  | "firstAppointmentDateSource"
  | "mindbodyCreatedAt"
  | "referredBy"
  | "mindbodyContracts"
  | "mindbodyServices"
  | "mindbodyMemberships"
  | "createdAt"
>;

/**
 * The header's own session numbers ("461 · 49 in Journey · 412 before"), so
 * the since line can never disagree with it: `journey` is null until the
 * count answers for this client, `total` with it.
 */
export interface StoryTotals {
  total: number | null;
  journey: number | null;
  before: number;
}

export interface StoryInput {
  /** The studio's day, yyyy-mm-dd. */
  today: string;
  tz?: string;
  client: StoryClient;
  /** How much of her story Journey holds (the home studio's cutover). */
  coverage: HistoryCoverage;
  totals?: StoryTotals | null;
  /** she / he / they, for the panel's and the line's own words. Default: they. */
  pronouns?: Pronouns;
  notes: Src<readonly NoteThread[]>;
  focuses: Src<readonly ClientFocus[]>;
  ford: Src<readonly FordEntry[]>;
  inbody: Src<readonly InBodyScan[]>;
  pulse: Src<AssessmentHistory>;
  /** The journal hit its guard rail (`useClientJournal().capped`). */
  capped?: boolean;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const THEY = pronounsOf(null);

/** A gap longer than this between one package's end and the next one's start is "came back", not "renewed". */
export const COME_BACK_GAP_DAYS = 60;

/** Text as typed, with Windows line ends made plain and the ends trimmed. */
const tidy = (text: string | null | undefined): string => (text ?? "").replace(/\r\n?/g, "\n").trim();

/** A real calendar day key, or null. */
const asDay = (key: string | null | undefined): string | null => (key && dayKeyDate(key) ? key : null);

/** The studio day of a stored instant (a Timestamp, a Date, an ISO string); a day key passes through. */
const instantDay = (value: unknown, tz?: string): string | null => {
  if (value === null || value === undefined || value === "") return null;
  return asDay(studioDayKeyOf(value as DateLike, tz));
};

/** The day of a Mindbody date: a UTC day (lib/mindbody-dates.ts). */
const mindbodyDay = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  return asDay(mindbodyDayKey(value));
};

/** Whole days from day key `a` to day key `b`. */
function daysBetween(a: string, b: string): number {
  const utc = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** "Mar 2019" for a day key. */
export function monthYear(day: string): string {
  const d = dayKeyDate(day);
  return d ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "";
}

/** A sentence's own end, kept; one full stop added only when it has none. */
function withStop(text: string): string {
  const t = text.trim();
  if (!t) return t;
  let i = t.length - 1;
  while (i > 0 && "\"'”’)]".includes(t[i])) i -= 1;
  return ".!?…".includes(t[i]) ? t : `${t}.`;
}

/** "Jess" from "Jess Moreno"; null for nothing. */
function firstWord(name: string | null | undefined): string | null {
  const n = tidy(name);
  return n ? n.split(/\s+/)[0] : null;
}

/** One decimal at most: 142 → "142", 48.25 → "48.3". Null for anything not a number. */
function lb(v: unknown): string | null {
  return typeof v === "number" && Number.isFinite(v) ? String(Number(v.toFixed(1))) : null;
}

/** A door to one thread on Notes; the page when the id cannot be an anchor. */
function noteDoor(threadId: string): StoryDoor {
  const anchor = noteAnchor(threadId);
  return isRecordAnchor(anchor) ? { page: "notes", anchor } : { page: "notes" };
}

const MEMBERSHIP: StoryDoor = { page: "account", anchor: "account-membership" };
const ON_FILE: StoryDoor = { page: "account", anchor: "account-on-file" };
const REACHED: StoryDoor = { page: "goals", anchor: "goals-reached" };
const TRAINING_STORY: StoryDoor = { page: "body", anchor: "body-training-story" };
const INBODY: StoryDoor = { page: "body", anchor: "body-inbody" };
const PULSE: StoryDoor = { page: "body", anchor: "body-pulse" };

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/* ------------------------------------------------------------------ */

/**
 * The packages as moments. Each term with a start is one beat — "Started a
 * package:" for the first Journey holds, "Renewed:" when it follows the one before
 * within COME_BACK_GAP_DAYS (or that one has no end on file), "Came back:"
 * after a longer gap. A cancelled term says when (the webhook's stamp; with
 * none it gives no cancel beat — a date is never guessed), and a term that
 * ended with nothing starting within the gap after it says so. One rule for
 * both passes: a term that started counts as what came next, even if it was
 * cancelled later — so a term is never both "Renewed" into and "ended".
 */
function contractBeats(client: StoryClient, today: string): StoryBeat[] {
  const rows = buildContractHistory(client, today).map((row) => ({
    row,
    start: row.start ? mindbodyDay(row.start) : null,
    end: row.end ? mindbodyDay(row.end) : null,
  }));
  const started = rows
    .filter((r): r is typeof r & { start: string } => r.start !== null)
    .sort((a, b) => a.start.localeCompare(b.start) || a.row.key.localeCompare(b.row.key));

  const beats: StoryBeat[] = [];
  let prev: (typeof started)[number] | null = null;
  for (const r of started) {
    const name = tidy(r.row.name) || "A package";
    const tier = r.row.tier ? tierLabel(r.row.tier.term, r.row.tier.payment) : null;
    const tierPart = tier && tier !== "Not known yet" ? ` (${tier})` : "";
    // "Started a package", never "Started": for a client whose story began
    // before Journey, the first package Journey holds is not her start.
    let lead = "Started a package";
    if (prev) {
      const gap = prev.end ? daysBetween(prev.end, r.start) : null;
      lead = gap !== null && gap > COME_BACK_GAP_DAYS ? "Came back" : "Renewed";
    }
    beats.push({
      key: `contract-start:${r.row.key}`,
      day: r.start,
      kind: "milestone",
      source: "contract",
      text: `${lead}: ${name}${tierPart}.`,
      sourceLine: "Contract history · Mindbody",
      door: MEMBERSHIP,
    });
    if (r.row.status !== "cancelled") prev = r;
  }

  for (const r of rows) {
    const name = tidy(r.row.name) || "A package";
    if (r.row.status === "cancelled") {
      const day = r.row.cancelledAt ? instantDay(r.row.cancelledAt) : null;
      if (day) {
        beats.push({
          key: `contract-cancel:${r.row.key}`,
          day,
          kind: "milestone",
          source: "contract",
          text: `Cancelled: ${name}.`,
          sourceLine: "Contract history · Mindbody",
          door: MEMBERSHIP,
        });
      }
      continue;
    }
    if (!r.end || !(r.end < today)) continue;
    const end = r.end;
    // A term signed within the gap carries her on even if it was cancelled
    // later: the start pass called it "Renewed", so this one did not end
    // with nothing after it (its cancellation is its own beat).
    const followed = started.some(
      (o) =>
        o.row.key !== r.row.key &&
        (!r.start || o.start > r.start) &&
        daysBetween(end, o.start) <= COME_BACK_GAP_DAYS,
    );
    if (followed) continue;
    beats.push({
      key: `contract-end:${r.row.key}`,
      day: end,
      kind: "milestone",
      source: "contract",
      text: `${name} ended.`,
      sourceLine: "Contract history · Mindbody",
      door: MEMBERSHIP,
    });
  }
  return beats;
}

/* ------------------------------------------------------------------ */
/* Mindbody's first visit                                              */
/* ------------------------------------------------------------------ */

/**
 * What `firstAppointmentDate` was taken from, by its `firstAppointmentDateSource`:
 *
 *   mindbody  absent, or "mindbody": Mindbody said so (the webhook, Master
 *             Sync). THE first visit, a Mindbody date read as its UTC day.
 *   booking   "pull-sync:…", "rehome:…": the earliest booking a schedule pull
 *             happened to see — a real appointment's instant (the studio's
 *             day), and a ceiling: the first may be earlier.
 *   session   "backfill:firstSessionDate", "backfill:earliest-session":
 *             Journey's own earliest session (scripts/backfill-client-since.ts),
 *             not a Mindbody visit at all. The studio's day.
 *   contract  "backfill:earliest-contract": the earliest package start on
 *             file, a Mindbody date (its UTC day).
 *   other     any other marker: an inference of unknown kind.
 *
 * Only `mindbody` is authoritative; the rest are "the earliest Journey has".
 */
export type FirstVisitBasis = "mindbody" | "booking" | "session" | "contract" | "other";

export function firstVisitOf(
  client: Pick<StoryClient, "firstAppointmentDate" | "firstAppointmentDateSource">,
  tz?: string,
): { day: string; authoritative: boolean; basis: FirstVisitBasis } | null {
  const source = tidy(client.firstAppointmentDateSource);
  const basis: FirstVisitBasis =
    !source || source === "mindbody"
      ? "mindbody"
      : source.startsWith("pull-sync:") || source.startsWith("rehome:")
        ? "booking"
        : source === "backfill:firstSessionDate" || source === "backfill:earliest-session"
          ? "session"
          : source === "backfill:earliest-contract"
            ? "contract"
            : "other";
  const mindbodyDate = basis === "mindbody" || basis === "contract";
  const day = mindbodyDate ? mindbodyDay(client.firstAppointmentDate) : instantDay(client.firstAppointmentDate, tz);
  return day ? { day, authoritative: basis === "mindbody", basis } : null;
}

/** The first-visit beat's words, where it came from and its door, by what the date was taken from. */
const FIRST_VISIT_WORDS: Record<FirstVisitBasis, { text: string; sourceLine: string; door: StoryDoor | null }> = {
  mindbody: { text: "First visit, as Mindbody records it.", sourceLine: "Mindbody · first appointment", door: ON_FILE },
  booking: {
    text: "The earliest Mindbody visit Journey has seen; the first may be earlier.",
    sourceLine: "Mindbody · earliest booking seen",
    door: ON_FILE,
  },
  session: {
    text: "The earliest session Journey has on file; the first visit may be earlier.",
    sourceLine: "Journey · earliest session on file",
    door: null,
  },
  contract: {
    text: "The earliest package Journey has on file began; the first visit may be earlier.",
    sourceLine: "Mindbody · earliest package on file",
    door: MEMBERSHIP,
  },
  other: {
    text: "The earliest date Journey has on file; the first visit may be earlier.",
    sourceLine: "Client record · earliest date on file",
    door: ON_FILE,
  },
};

function mindbodyBeats(client: StoryClient, tz?: string): StoryBeat[] {
  const visit = firstVisitOf(client, tz);
  const created = mindbodyDay(client.mindbodyCreatedAt);
  const referred = tidy(client.referredBy);
  const referral = referred ? ` Referred by ${withStop(referred)}` : "";
  const beats: StoryBeat[] = [];
  const showCreated = !!created && (!visit || created < visit.day);
  if (visit) {
    const words = FIRST_VISIT_WORDS[visit.basis];
    beats.push({
      key: "mindbody-first-visit",
      day: visit.day,
      kind: "milestone",
      source: visit.basis === "session" ? "journey" : "mindbody",
      text: words.text + referral,
      sourceLine: words.sourceLine,
      door: words.door,
    });
  }
  if (showCreated && created) {
    beats.push({
      key: "mindbody-created",
      day: created,
      kind: "milestone",
      source: "mindbody",
      text: `Added to Mindbody.${visit ? "" : referral}`,
      sourceLine: "Mindbody · client record",
      door: ON_FILE,
    });
  }
  return beats;
}

/* ------------------------------------------------------------------ */
/* The years before Journey                                            */
/* ------------------------------------------------------------------ */

/** The panel's "412 sessions in FileMaker", by where the prior record came from. */
const PRIOR_ERA_WHERE: Record<PriorHistorySource, string> = {
  filemaker: "in FileMaker",
  paper: "on paper records",
  "trainer-estimate": "by a trainer's estimate",
  other: "recorded before Journey",
};

/**
 * The since line's "412 sessions in FileMaker before Journey", by source. Its
 * own words, each saying "before Journey" once — the panel's "recorded before
 * Journey" would say it twice.
 */
const PRIOR_SINCE_WHERE: Record<PriorHistorySource, string> = {
  filemaker: "in FileMaker before Journey",
  paper: "on paper records before Journey",
  "trainer-estimate": "before Journey (a trainer's estimate)",
  other: "before Journey",
};

/**
 * The prior record the story tells, or null. A record of NO sessions says
 * nothing happened before Journey (the coverage rule reads it as complete),
 * so it makes no panel and dates nothing.
 */
function storyPrior(client: { priorHistory?: unknown }): PriorHistory | null {
  const prior = priorHistoryOf(client);
  return prior && Math.trunc(prior.sessions) > 0 ? prior : null;
}

/** Where the detail of those years is, by source. */
const PRIOR_ERA_DETAIL: Record<PriorHistorySource, string> = {
  filemaker: "The detail of those years lives in FileMaker.",
  paper: "The detail of those years is on paper.",
  "trainer-estimate": "The number is a trainer's estimate, and the detail of those years isn't in Journey.",
  other: "The detail of those years isn't in Journey.",
};

/**
 * The panel for the years before Journey. With a prior record it is dated
 * on the record's last day, where Journey takes over, and says how many
 * sessions it holds and where their detail is. With no record and a story
 * Journey does not hold whole, it is undated ("Before Journey") and sits at
 * the end: this page starts partway through. A client whose whole story is
 * in Journey has no panel.
 *
 * The record's last day is typed by hand with no upper limit, so a studio
 * that enters its planned cutover (or a slip of the finger) can put it after
 * today. Those years still happened: the panel then sits at today instead of
 * falling to the story's after-today rule — its words keep the day as typed.
 */
function eraBeat(prior: PriorHistory | null, coverage: HistoryCoverage, p: Pronouns, today: string): StoryBeat | null {
  if (prior) {
    const through = asDay(prior.through);
    const from = asDay(prior.from ?? null);
    const range = through
      ? from
        ? `${monthYear(from)} – ${monthYear(through)}`
        : `Until ${monthYear(through)}`
      : "Before Journey";
    const stated = Math.max(0, Math.trunc(prior.sessions));
    const imported = Math.min(stated, Math.max(0, Math.trunc(prior.importedCount ?? 0)));
    // Every one of them brought in: Journey CAN show each one now.
    const allIn = stated > 0 && imported >= stated;
    const note = tidy(prior.note);
    const counted = `Journey counts them in ${p.possessive} total, so ${p.subject} ${agree(p, "is", "are")} never treated as new`;
    const detail = [
      PRIOR_ERA_DETAIL[prior.source] ?? PRIOR_ERA_DETAIL.other,
      allIn ? `${counted}.` : `${counted}, but it can't show what happened in each one.`,
      allIn
        ? "All of them have since been brought into Journey."
        : imported > 0
          ? `${plural(imported, "of them has", "of them have")} since been brought into Journey.`
          : null,
      note ? `Note: ${curly(note)}` : null,
    ];
    return {
      key: "era",
      day: through && through > today ? today : through,
      kind: "milestone",
      source: "prior",
      text: `${range} · ${plural(stated, "session")} ${PRIOR_ERA_WHERE[prior.source] ?? PRIOR_ERA_WHERE.other}`,
      sourceLine: "The record from before Journey",
      door: null,
      isEra: true,
      eraDetail: detail.filter((s): s is string => !!s).join(" "),
    };
  }
  if (coverage === "complete") return null;
  // Unknown: the since line above already carries COVERAGE_CAVEAT.unknown
  // (it is also the Overview's line), so the panel says it in its own words
  // rather than twice on one page.
  const detail =
    coverage === "partial"
      ? `${cap(p.subject)} trained here before Journey, and those sessions aren't recorded in Journey yet, so this page starts partway through.`
      : "Anything from before this studio moved onto Journey may not be recorded here, so this page may start partway through.";
  return {
    key: "era",
    day: null,
    kind: "milestone",
    source: "prior",
    text: "Before Journey",
    sourceLine: "Not recorded here",
    door: null,
    isEra: true,
    eraDetail: detail,
  };
}

/* ------------------------------------------------------------------ */
/* Journey, goals, focuses, protocol mastery                           */
/* ------------------------------------------------------------------ */

function journeyBeat(client: StoryClient, coverage: HistoryCoverage, prior: PriorHistory | null, tz?: string): StoryBeat | null {
  const day = instantDay(client.firstSessionDate, tz);
  if (!day) return null;
  return {
    key: "journey-first",
    day,
    kind: "milestone",
    source: "journey",
    // "First session." is a claim about her whole story; only Journey holding
    // all of it can make it (the migration rule).
    text: coverage === "complete" && !prior ? "First session." : "First session recorded in Journey.",
    sourceLine: "Journey",
    door: null,
  };
}

function goalBeats(client: StoryClient, tz?: string): StoryBeat[] {
  const out: StoryBeat[] = [];
  readGoalHistory(client.goalHistory).forEach((g, i) => {
    const day = instantDay(g.achievedAt, tz);
    const goal = tidy(g.goal);
    if (!day || !goal) return;
    const reward = tidy(g.reward);
    out.push({
      key: `goal:${g.achievedAt}:${i}`,
      day,
      kind: "coaching",
      source: "goal",
      text: `Goal reached: ${withStop(goal)}${reward ? ` Reward: ${withStop(reward)}` : ""}`,
      sourceLine: joinDots(["Goal", g.byName ? `marked by ${tidy(g.byName)}` : null]),
      door: REACHED,
    });
  });
  return out;
}

function focusBeats(focuses: readonly ClientFocus[], tz?: string): StoryBeat[] {
  const out: StoryBeat[] = [];
  for (const f of focuses) {
    // Achieved only: a retired focus is a coach moving on, not a moment of hers.
    if (f.status !== "passed") continue;
    const day = instantDay(focusEndDate(f), tz);
    if (!day) continue;
    const intent = tidy(f.intent);
    const days = focusStartDate(f) ? focusDaysActive(f) : null;
    const reward = tidy(f.rewardNote);
    const what = f.category ? `Focus reached, ${f.category}` : "Focus reached";
    out.push({
      key: `focus:${f.id}`,
      day,
      kind: "coaching",
      source: "focus",
      text: `${intent ? `${what}: ${withStop(intent)}` : `${what}.`}${reward ? ` Reward: ${withStop(reward)}` : ""}`,
      sourceLine: joinDots([
        "Focus",
        tidy(f.trainerName) || tidy(f.trainerInitials) || null,
        days !== null && days >= 1 ? `after ${formatSpan(days)}` : null,
      ]),
      door: REACHED,
    });
  }
  return out;
}

function pedigreeBeats(client: StoryClient, tz?: string): StoryBeat[] {
  const steps = Array.isArray(client.pedigreeHistory) ? client.pedigreeHistory : [];
  const out: StoryBeat[] = [];
  steps.forEach((step, i) => {
    const level = tidy(step?.level);
    // A step with no date — the level a client had before the history
    // existed — is where the story of it starts, not a moment of its own.
    const day = level ? instantDay(step.at, tz) : null;
    if (!day) return;
    const prev = i > 0 ? tidy(steps[i - 1]?.level) : "";
    out.push({
      key: `pedigree:${i}`,
      day,
      kind: "milestone",
      source: "pedigree",
      text: prev && prev !== level ? `Protocol mastery: ${level}. It was ${prev}.` : `Protocol mastery recorded: ${level}.`,
      sourceLine: joinDots(["Training story", tidy(step.byName) || null]),
      door: TRAINING_STORY,
    });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* InBody and the Pulse                                                */
/* ------------------------------------------------------------------ */

/**
 * Each scan as the printout says it. No "up", "down" or "gained": whether a
 * difference between two scans is a change is Body & Pulse's to say, against
 * the scanner's normal variation (AJ's decision 8), and the Story never
 * second-guesses it.
 */
function inbodyBeats(scans: readonly InBodyScan[]): StoryBeat[] {
  const out: StoryBeat[] = [];
  scans.forEach((s, i) => {
    const day = asDay(s.testedAt);
    if (!day) return;
    const w = lb(s.weightLb);
    const m = lb(s.skeletalMuscleMassLb);
    const parts = [w ? `${w} lb` : null, m ? `skeletal muscle ${m} lb` : null].filter((x): x is string => !!x);
    out.push({
      key: `inbody:${s.id ?? `${s.testedAt}:${i}`}`,
      day,
      kind: "body",
      source: "inbody",
      text: parts.length ? `InBody scan: ${parts.join(", ")}.` : "InBody scan.",
      sourceLine: joinDots(["InBody", firstWord(s.enteredByName)]),
      door: INBODY,
    });
  });
  return out;
}

/** A 0–10 answer as the Pulse's own frequency word. */
const frequencyWord = (v: number): string => dialWord(FREQUENCY_SCALE, tenToAbsolute(v, FREQUENCY_SCALE));

/** The studio day a saved round was for: its date, else when it was saved. */
function roundDay(r: AssessmentHistoryReport, tz?: string): string | null {
  const own = instantDay(r.date, tz);
  if (own) return own;
  return r.savedAtMs !== null ? instantDay(new Date(r.savedAtMs), tz) : null;
}

/**
 * Each saved round, oldest to newest, against what she had answered before
 * it (the living rule: a round that did not ask a statement did not clear
 * it). A statement whose WORD moved is quoted — the question bank's text,
 * verbatim, and the two words — never a number.
 *
 * What the words may claim depends on how much of her Pulse the read holds:
 *  - the oldest round of a read that reached her FIRST report is her "First
 *    Pulse in Journey", with how many statements it answered (a count of
 *    answers, never a score);
 *  - the oldest round of a read that did NOT reach it has an unknown
 *    baseline: "Pulse saved." and nothing more;
 *  - "no earlier answer changed" only when every statement it answered could
 *    be compared, or the read holds her whole Pulse (a statement answered
 *    for the first time has no earlier answer to change).
 */
function pulseBeats(history: AssessmentHistory, p: Pronouns, tz?: string): StoryBeat[] {
  const at = (r: AssessmentHistoryReport) => dayOrInstantMs(r.date) ?? r.savedAtMs ?? 0;
  const rounds = history.reports.slice().sort((a, b) => at(a) - at(b) || a.id.localeCompare(b.id));
  const out: StoryBeat[] = [];
  let base: LivingBaseline = EMPTY_BASELINE;
  rounds.forEach((r, i) => {
    const answers = new Map<string, number>();
    for (const id of ALL_STATEMENT_IDS) {
      const v = statementAnswer(r.assessment, id);
      if (v !== null) answers.set(id, v);
    }
    const compared = [...answers.keys()].filter((id) => base.answers[id] !== undefined);
    const moves = compared.filter((id) => frequencyWord(base.answers[id]) !== frequencyWord(answers.get(id)!));

    let text: string;
    if (i === 0 && history.complete) {
      text = answers.size
        ? `First Pulse in Journey: ${answers.size} of ${ALL_STATEMENT_IDS.length} statements answered.`
        : "First Pulse in Journey.";
    } else if (i === 0) {
      text = "Pulse saved.";
    } else if (moves.length) {
      text = `Pulse saved: ${plural(moves.length, "statement")} moved.`;
    } else if (compared.length && (history.complete || compared.length === answers.size)) {
      text = "Pulse saved: no earlier answer changed.";
    } else {
      text = "Pulse saved.";
    }

    const quotes: StoryQuote[] = [];
    for (const id of moves) {
      const words = statementTextOf(id);
      if (!words) continue;
      quotes.push({ statementId: id, text: words, from: frequencyWord(base.answers[id]), to: frequencyWord(answers.get(id)!) });
    }

    const day = roundDay(r, tz);
    if (day) {
      out.push({
        key: `pulse:${r.id}`,
        day,
        kind: "body",
        source: "pulse",
        text,
        quotes: quotes.length ? quotes : undefined,
        sourceLine:
          r.enteredBy === "client" ? `Pulse · in ${p.possessive} own words` : joinDots(["Pulse", firstWord(r.trainerName)]),
        door: PULSE,
      });
    }
    base = advanceBaseline(base, r.assessment, r.sectionsReviewed);
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Notes and FORD                                                      */
/* ------------------------------------------------------------------ */

/** The profile fields the journal adapts as notes: edited on their own pages, dated when last saved. */
const PROFILE_FIELD_PREFIX = "legacy:profile:";

/**
 * A critical note, or an injury, opened — and closed, when someone closed
 * it. The words are the root's, verbatim (the page folds a long one). Only
 * the ROOT is read: its loudness and `resolvedAt` are the thread's.
 */
function noteBeats(threads: readonly NoteThread[], today: string, tz?: string): StoryBeat[] {
  const out: StoryBeat[] = [];
  for (const t of threads) {
    const root = t.root;
    if (!root || t.id.startsWith(PROFILE_FIELD_PREFIX) || root.isArchived) continue;
    const critical = root.importance === "critical";
    if (!critical && noteCategoryOf(root) !== "injury") continue;
    const body = tidy(root.body);
    if (!body) continue;
    const label = critical ? "Critical note" : "Injury note";
    const door = noteDoor(t.id);
    const opened = instantDay(root.occurredAt, tz);
    if (opened) {
      out.push({
        key: `note-open:${t.id}`,
        day: opened,
        kind: "body",
        source: "note",
        text: body,
        sourceLine: joinDots([label, whoOf(root), updateCountLabel(t)]),
        door,
      });
    }
    const closed = root.resolvedAt ? instantDay(root.resolvedAt, tz) : null;
    if (closed) {
      out.push({
        key: `note-close:${t.id}`,
        day: closed,
        kind: "body",
        source: "note",
        text: `Closed: ${body}`,
        sourceLine: joinDots([label, opened ? `opened ${shortDay(opened, today)}` : null]),
        door,
      });
    }
  }
  return out;
}

/**
 * A FORD moment (a detail that is not a standing fact) on the day it was
 * caught, and a gesture on the day it was marked done — its outcome in the
 * words someone wrote, else the idea. Standing facts are not moments; an
 * archived detail, an unfiled capture, the In one line document and the
 * `client.events` details (read-only copies) give none.
 */
function fordBeats(entries: readonly FordEntry[], tz?: string): StoryBeat[] {
  const out: StoryBeat[] = [];
  for (const e of entries) {
    if (e.isArchived || e.isLegacy || !e.pillar || e.kind === "one-line") continue;
    const meta = FORD_META[e.pillar];
    if (!meta) continue;
    const body = tidy(e.body);
    if (!e.isPinned && body) {
      const day = instantDay(e.occurredAt, tz);
      if (day) {
        out.push({
          key: `ford:${e.id}`,
          day,
          kind: "life",
          source: "ford",
          text: body,
          sourceLine: joinDots(["FORD", meta.label, firstWord(e.authorName)]),
          door: { page: "ford", anchor: `ford-${e.pillar}` },
        });
      }
    }
    const o = e.opportunity;
    if (o && o.status === "done") {
      const day = instantDay(o.doneAt, tz);
      if (!day) continue;
      const idea = tidy(o.idea);
      out.push({
        key: `ford-done:${e.id}`,
        day,
        kind: "life",
        source: "ford",
        text: tidy(o.outcome) || (idea ? `${withStop(idea)} Done.` : "A gesture, done."),
        sourceLine: joinDots(["FORD", "above and beyond", firstWord(o.ownerName)]),
        door: { page: "ford", anchor: "ford-beyond" },
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Since when                                                          */
/* ------------------------------------------------------------------ */

/**
 * How long she has been with Max Strength, as a day and how sure it is:
 *
 *   client    a day the record can stand behind as her start: the prior
 *             record's first day (a person stated it), Mindbody's own first
 *             visit, or — only when Journey holds her whole story — her
 *             first session in Journey; the earliest of them. Else the day
 *             Mindbody's record of her was made.
 *   at-least  a day she was certainly with us by, but maybe not the first:
 *             the earliest booking a schedule pull saw, the earliest
 *             contract Journey holds, or the prior record's last day.
 *   journey   only Journey's own dates: her first session here, else when
 *             Journey's record of her was made. "In Journey since".
 *
 * Deliberately not `resolveClientSince`'s order, which puts Journey's first
 * session FIRST: for a long-standing client with no prior record that reads
 * "Client since Sep 2026" (the header's words — flagged for AJ, not changed
 * here). A confident wrong date is worse than a cautious one.
 */
export type StorySinceKind = "client" | "at-least" | "journey";

export interface StorySince {
  kind: StorySinceKind;
  day: string;
}

/**
 * `today`, when given, is the studio's day: nothing after it is a "since" (a
 * prior record's last day typed ahead of the cutover would otherwise read
 * "since at least" a month that hasn't come).
 */
export function storySince(
  client: StoryClient,
  coverage: HistoryCoverage,
  tz?: string,
  today?: string,
): StorySince | null {
  const earliest = (days: readonly (string | null)[]): string | null =>
    days.filter((d): d is string => !!d && (!today || d <= today)).sort()[0] ?? null;
  const prior = storyPrior(client);
  const visit = firstVisitOf(client, tz);
  const firstSession = instantDay(client.firstSessionDate, tz);

  const sure = earliest([
    asDay(prior?.from ?? null),
    visit?.authoritative ? visit.day : null,
    coverage === "complete" && !prior ? firstSession : null,
  ]);
  if (sure) return { kind: "client", day: sure };

  const created = mindbodyDay(client.mindbodyCreatedAt);
  if (created) return { kind: "client", day: created };

  const commercial = resolveClientSince({
    mindbodyContracts: client.mindbodyContracts,
    mindbodyMemberships: client.mindbodyMemberships,
  });
  const atLeast = earliest([
    visit && !visit.authoritative ? visit.day : null,
    commercial?.source === "commercial" ? mindbodyDay(commercial.date) : null,
    prior ? asDay(prior.through) : null,
  ]);
  if (atLeast) return { kind: "at-least", day: atLeast };

  if (firstSession) return { kind: "journey", day: firstSession };
  const made = instantDay(client.createdAt, tz);
  return made ? { kind: "journey", day: made } : null;
}

/**
 * The line at the top of the Story (and the Overview's Story slot): since
 * when, then the header's own session numbers, so the two cannot disagree —
 *
 *   "With Max Strength since Mar 2019. 412 sessions in FileMaker before
 *    Journey, and 49 in Journey."
 *   "In Journey since Sep 2026. 12 sessions in Journey. Sessions before this
 *    studio moved onto Journey may not be recorded."
 *
 * Null when there is nothing to say.
 */
export function sinceLine(
  input: Pick<StoryInput, "client" | "coverage" | "totals" | "pronouns" | "tz"> & { today?: string },
): string | null {
  const { client, coverage, totals, tz } = input;
  const p = input.pronouns ?? THEY;
  const prior = storyPrior(client);
  const since = storySince(client, coverage, tz, input.today);
  const parts: string[] = [];

  if (since) {
    const when = monthYear(since.day);
    parts.push(
      since.kind === "client"
        ? `With Max Strength since ${when}.`
        : since.kind === "at-least"
          ? `With Max Strength since at least ${when}.`
          : `In Journey since ${when}.`,
    );
  }

  const journey = totals?.journey ?? null;
  const before = totals?.before ?? 0;
  if (prior && before > 0) {
    const where = PRIOR_SINCE_WHERE[prior.source] ?? PRIOR_SINCE_WHERE.other;
    parts.push(
      journey !== null
        ? `${plural(before, "session")} ${where}, and ${journey} in Journey.`
        : `${plural(before, "session")} ${where}.`,
    );
  } else if (journey !== null) {
    if (coverage === "complete" && !prior) {
      parts.push(journey === 0 ? "No sessions yet." : journey === 1 ? "1 session, in Journey." : `${journey} sessions, all in Journey.`);
    } else {
      parts.push(`${plural(journey, "session")} in Journey.`);
    }
  }

  if (!prior && coverage === "partial") {
    parts.push(`${cap(p.possessive)} sessions before Journey aren't recorded here yet.`);
  } else if (!prior && coverage === "unknown") {
    parts.push(COVERAGE_CAVEAT.unknown ?? "");
  }

  const line = parts.filter((s) => s.trim().length > 0).join(" ");
  return line || null;
}

/**
 * The Story segment's line on the sub-toggle: "since 2019", "since 2025 or
 * earlier", "in Journey since 2026" — the year of `storySince`, so the
 * segment and the page say one thing. Null when nothing is known. Short on
 * purpose: the bar wraps at portrait widths.
 */
export function storyTabHint(
  input: { client: StoryClient; coverage: HistoryCoverage; tz?: string; today?: string },
): string | null {
  const since = storySince(input.client, input.coverage, input.tz, input.today);
  if (!since) return null;
  const year = since.day.slice(0, 4);
  if (since.kind === "client") return `since ${year}`;
  if (since.kind === "at-least") return `since ${year} or earlier`;
  return `in Journey since ${year}`;
}

/* ------------------------------------------------------------------ */
/* The story                                                           */
/* ------------------------------------------------------------------ */

/** The same day: milestones, then goals and focuses, then body, then life. */
const KIND_ORDER: Record<StoryKind, number> = { milestone: 0, coaching: 1, body: 2, life: 3 };

function compareBeats(a: StoryBeat, b: StoryBeat): number {
  if (a.day !== b.day) {
    if (a.day === null) return 1;
    if (b.day === null) return -1;
    return b.day.localeCompare(a.day);
  }
  // The panel for the years before Journey closes its day: newest first, and
  // everything else that day happened in Journey, after it.
  if (!!a.isEra !== !!b.isEra) return a.isEra ? 1 : -1;
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.key.localeCompare(b.key);
}

/** Beats (already in order) grouped by year; the undated panel is its own last group. */
function groupYears(beats: readonly StoryBeat[]): StoryYear[] {
  const years: StoryYear[] = [];
  for (const beat of beats) {
    const year = beat.day ? Number(beat.day.slice(0, 4)) : null;
    const last = years[years.length - 1];
    if (last && last.year === year) last.beats.push(beat);
    else years.push({ year, beats: [beat] });
  }
  return years;
}

/** Build the story from what the tab already holds. No reads. */
export function buildStory(input: StoryInput): Story {
  const { today, tz, client, coverage } = input;
  const p = input.pronouns ?? THEY;
  const prior = storyPrior(client);
  const pending: StoryRead[] = [];
  const failed: StoryRead[] = [];
  const off: StoryRead[] = [];

  /** The data of a ready source; otherwise it is named, and gives no beats. */
  function ready<T>(read: StoryRead, src: Src<T>): T | null {
    if (src.status === "ready") return src.data;
    if (src.status === "loading") pending.push(read);
    else if (src.status === "failed") failed.push(read);
    else off.push(read);
    return null;
  }

  const beats: StoryBeat[] = [
    ...contractBeats(client, today),
    ...mindbodyBeats(client, tz),
    ...goalBeats(client, tz),
    ...pedigreeBeats(client, tz),
  ];
  const era = eraBeat(prior, coverage, p, today);
  if (era) beats.push(era);
  const first = journeyBeat(client, coverage, prior, tz);
  if (first) beats.push(first);

  const notes = ready("notes", input.notes);
  if (notes) beats.push(...noteBeats(notes, today, tz));
  const focuses = ready("focuses", input.focuses);
  if (focuses) beats.push(...focusBeats(focuses, tz));
  const ford = ready("ford", input.ford);
  if (ford) beats.push(...fordBeats(ford, tz));
  const scans = ready("inbody", input.inbody);
  if (scans) beats.push(...inbodyBeats(scans));
  const pulse = ready("pulse", input.pulse);
  if (pulse) beats.push(...pulseBeats(pulse, p, tz));

  // Nothing dated after today is a moment yet (a package that starts next
  // week, a typo'd scan date). The years-before-Journey panel never falls
  // here: eraBeat already sits it at today at the latest.
  const shown = beats.filter((b) => b.day === null || b.day <= today).sort(compareBeats);

  return {
    beats: shown,
    years: groupYears(shown),
    pending,
    failed,
    off,
    sinceLine: sinceLine({ client, coverage, totals: input.totals ?? null, pronouns: p, tz, today }),
    capped: !!input.capped,
  };
}

/* ------------------------------------------------------------------ */
/* The page's filters and folds                                        */
/* ------------------------------------------------------------------ */

export type StoryFilter = "all" | StoryKind;

/** The filter picks, in the mockup's order. */
export const STORY_FILTERS: readonly { id: StoryFilter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "milestone", label: "Milestones" },
  { id: "body", label: "Body & Pulse" },
  { id: "life", label: "Life" },
  { id: "coaching", label: "Goals & focus" },
];

/**
 * The story under one filter. The panel for the years before Journey is a
 * milestone, so it stays under Everything and Milestones and nowhere else;
 * a year left with no beat is dropped.
 */
export function filterStory(story: Story, filter: StoryFilter): Story {
  if (filter === "all") return story;
  const beats = story.beats.filter((b) => b.kind === filter);
  return { ...story, beats, years: groupYears(beats) };
}

/**
 * The kind of moment each read gives (noteBeats, focusBeats, fordBeats,
 * inbodyBeats, pulseBeats). The Milestones filter is fed by the client
 * document alone, so no read.
 */
export const STORY_READ_KIND: Record<StoryRead, StoryKind> = {
  notes: "body",
  focuses: "coaching",
  ford: "life",
  inbody: "body",
  pulse: "body",
};

/**
 * The reads feeding this filter whose moments may be missing: still
 * loading, failed, not this reader's (FORD at a cross-train studio), or —
 * when the journal hit its guard rail — notes and focuses. While any is
 * listed, an empty filter is UNKNOWN, never "nothing yet": a cross-train
 * reader's Life filter is empty because FORD is the home studio's, not
 * because nothing happened.
 */
export function unreadUnder(story: Story, filter: StoryFilter): StoryRead[] {
  const missing = new Set<StoryRead>([...story.pending, ...story.failed, ...story.off]);
  if (story.capped) {
    missing.add("notes");
    missing.add("focuses");
  }
  return (Object.keys(STORY_READ_KIND) as StoryRead[]).filter(
    (read) => missing.has(read) && (filter === "all" || STORY_READ_KIND[read] === filter),
  );
}

/** A fold longer than this reads as a sentence, not a clip. */
const FOLD_MIN_SENTENCES = 120;

/**
 * A long text, folded for a list: whole sentences up to `max` characters
 * when the first of them are long enough to read on their own (the kit's
 * rule — never half a sentence), else cut at the last space before `max`
 * with "…". `folded` says the page must offer "Read all"; `short` is always
 * a prefix of the text (plus the "…").
 */
export function foldText(text: string, max = 280): { short: string; folded: boolean } {
  const t = tidy(text);
  if (t.length <= max) return { short: t, folded: false };
  // The longest run of whole sentences that fits (firstSentences returns
  // prefixes of the text, a sentence at a time).
  let fit = "";
  let probe = 0;
  for (;;) {
    const next = firstSentences(t, probe);
    if (next.length > max || next.length <= fit.length) break;
    fit = next;
    probe = next.length + 1;
  }
  if (fit.length >= Math.min(FOLD_MIN_SENTENCES, max / 2)) return { short: fit, folded: true };
  const cut = t.slice(0, max);
  const space = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"));
  const short = (space > max / 2 ? cut.slice(0, space) : cut).trimEnd();
  return { short: `${short}…`, folded: true };
}

