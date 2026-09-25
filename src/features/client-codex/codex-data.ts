/**
 * WHAT THE CODEX'S PAGES ARE HANDED — the types, and the pure half of the
 * tab's one load (`useCodexData`).
 *
 * Client codex, Sep 2026. The long scroll mounted every section at once and
 * shared one journal load between them; the codex keeps that promise and
 * extends it. The tab loads each thing ONCE — the journal, FORD, the InBody
 * scans, the trainer's note dismissals — and derives the Pulse history from
 * the progress-reports listener the profile already runs, then hands the lot
 * to every page as `CodexData`. A page never opens a listener for something
 * the tab already holds, and switching pages reads nothing.
 *
 * The rule every field here keeps: a read that has not answered, or failed,
 * is UNKNOWN, never empty. Each stream carries its own state, so a page can
 * say "couldn't load" where it would otherwise say "nothing on file".
 *
 * Pure: codex-data.test.ts.
 */
import type { Client, ClientMachineSetting, Machine, ProgressReport, Routine, Studio, Trainer } from "../../types";
import type { JournalLoad, UseClientJournalResult } from "../../hooks/useClientJournal";
import type { UseClientFordResult } from "../ford/useClientFord";
import type { FordReadStatus } from "../ford/read-status";
import type { FordAuthor } from "../ford/ford-write";
import type { InBodyScansState } from "../inbody/useInBodyScans";
import type { FordEntry } from "../ford/types";
import type { Src, Story, StoryInput } from "../client-story/story";
import type { NoteDismissalsState } from "../client-notes/dismissal-store";
import { fordDoorCount, notesOnRecord, notesSummary, type NotesOnRecord, type NotesSummary } from "../client-notes/record-selectors";
import { historyFromDocs, type AssessmentHistory } from "../subjective-report/assessment-history";
import type { ProgressReportsStatus } from "../client-profile/client-answer";
import type { PriorHistoryDoorState } from "../client-profile/prior-history-door";
import { priorHistoryOf, priorUncounted, totalSessions, type HistoryCoverage } from "../../lib/prior-history";
import type { CodexGo } from "./kit/primitives";
import type { Pronouns } from "./kit/pronouns";
import type { CodexAccess } from "./access";
import type { RecordForm } from "./useRecordForm";

/* ------------------------------------------------------------------ */
/* FORD                                                                */
/* ------------------------------------------------------------------ */

/**
 * FORD as the codex sees it: the hook's own four states, plus `off` for a
 * reader the FORD rule refuses — the tab never opens the listener for them,
 * so the hook would wait ("loading") forever.
 */
export type CodexFordStatus = "off" | FordReadStatus;

export function codexFordStatus(fordReadable: boolean, status: FordReadStatus): CodexFordStatus {
  return fordReadable ? status : "off";
}

/* ------------------------------------------------------------------ */
/* Pulse                                                               */
/* ------------------------------------------------------------------ */

/** The profile's progress-reports listener reads this many, newest first. */
export const PULSE_READ_LIMIT = 50;

export interface CodexPulse {
  status: ProgressReportsStatus;
  /** Null until the reports are read for this client. */
  history: AssessmentHistory | null;
}

/**
 * The client's Pulse history, from the reports the profile already streams —
 * no second read.
 *
 * `historyFromDocs` decides whether the history is COMPLETE from how many
 * documents the read returned (fewer than the limit: it reached the first
 * report). So it must be given the RAW page, every report kind together, at
 * the listener's own limit. Given only the check-ins, 20 check-ins among 50
 * reports would read "complete" while older check-ins exist, and the Story
 * would print a false "First Pulse in Journey" for a migrating client.
 *
 * The profile keeps the last client's list until this client's arrives, so a
 * page that holds any other client's report is not this client's page yet:
 * it is "loading", never a history.
 */
export function pulseFromReports(
  reports: readonly ProgressReport[],
  clientId: string | null | undefined,
  status: ProgressReportsStatus,
): CodexPulse {
  if (status !== "ready" || !clientId) return { status: status === "ready" ? "loading" : status, history: null };
  if (reports.some((r) => r.clientId !== clientId)) return { status: "loading", history: null };
  return {
    status,
    history: historyFromDocs(reports as unknown as Record<string, unknown>[], PULSE_READ_LIMIT),
  };
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export interface CodexNotes {
  /** Whether journalEntries, the legacy notes and the incidents all answered. */
  state: JournalLoad;
  /** What Notes lists, what waits to be filed, and the settled life notes. */
  record: NotesOnRecord;
  /** The counts, once the notes are read; null while loading or failed. */
  summary: NotesSummary | null;
}

/**
 * The notes as every page counts them, from the one journal load. A journal
 * that does not say what it could read is read as "loading" — unknown, never
 * "none yet".
 *
 * Settled life notes — the journal's FORD / Life notes that are standing or
 * resolved — are FORD's to show since the FORD page (client codex, phase 10),
 * in their pillar, "from an older note". So they leave Notes' zones and its
 * counts (`lifeOnFord`), and `record.lifeSettled` is what the FORD page draws.
 * A LIVE life note (a Heads up, a coming date) stays on Notes.
 */
export function notesOfJournal(
  journal: Pick<UseClientJournalResult, "threads" | "criticalEntries" | "loadState">,
  today: string,
): CodexNotes {
  const state: JournalLoad = journal.loadState?.notes ?? "loading";
  const record = notesOnRecord(journal.threads ?? [], today, { lifeOnFord: true });
  const summary = state === "ready" ? notesSummary(record, journal.criticalEntries, today) : null;
  return { state, record, summary };
}

/**
 * How many older life notes the FORD page shows, for the counts that name
 * everything FORD holds (the Notes door, the sub-toggle). Null while the
 * journal loads — unknown, never 0. When the journal could not be read the
 * FORD page cannot show them either and says so, so they count as none: the
 * number is then FORD's own details, which is what the page draws.
 */
export function olderLifeCountOf(notes: Pick<CodexNotes, "state" | "record">): number | null {
  if (notes.state === "loading") return null;
  return notes.state === "ready" ? notes.record.lifeSettled.length : 0;
}

/**
 * Everything the FORD page shows, as the counts that name it read it (the
 * Notes door, the sub-toggle): `fordDoorCount` with the older life notes.
 * When the journal could not be read the number is FORD's own details —
 * what the page draws — but a 0 then is not "nothing on file": the older
 * notes are unknown, and the page says it couldn't load them. So it is null.
 */
export function fordCountOf(
  args: Omit<Parameters<typeof fordDoorCount>[0], "olderLifeCount">,
  notes: Pick<CodexNotes, "state" | "record">,
): number | null {
  const n = fordDoorCount({ ...args, olderLifeCount: olderLifeCountOf(notes) });
  return notes.state === "failed" && n === 0 ? null : n;
}

/** Focuses the journal holds that are still running. Null until they are read. */
export function runningFocuses(journal: Pick<UseClientJournalResult, "focuses" | "loadState">): number | null {
  if (journal.loadState?.focuses !== "ready") return null;
  return journal.focuses.filter((f) => f.status === "active").length;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

/**
 * The header's own session numbers, so the tab can never disagree with it:
 * "461 · 49 in Journey · 412 before". `journey` is null until the count
 * answers for THIS client (the header's figure starts at 0, and a 0 reads as
 * "new" to anything that counts it), and `total` with it.
 */
export interface SessionTotals {
  total: number | null;
  journey: number | null;
  /** Sessions before Journey that exist only as a number (the prior record). */
  before: number;
}

export function sessionTotalsOf(
  journeyCount: number | null | undefined,
  client: { priorHistory?: unknown } | null | undefined,
): SessionTotals {
  const prior = priorHistoryOf(client);
  const journey = typeof journeyCount === "number" && Number.isFinite(journeyCount) ? journeyCount : null;
  return {
    total: totalSessions(journey, prior),
    journey,
    before: priorUncounted(prior),
  };
}

/* ------------------------------------------------------------------ */
/* Story                                                               */
/* ------------------------------------------------------------------ */

/**
 * The tab's reads as the Story takes them (`buildStory`'s sources): each one
 * `ready` with its data, or named for what it is — still loading, failed, or
 * `off` for a read this reader may not make (FORD at a cross-train studio,
 * which the tab never opens). A source that is not ready makes no moment,
 * so the Story can say what it could not read instead of drawing less.
 */
export function storySourcesOf({
  journal,
  fordStatus,
  fordEntries,
  inbody,
  pulse,
}: {
  journal: Pick<UseClientJournalResult, "threads" | "focuses" | "loadState" | "capped">;
  fordStatus: CodexFordStatus;
  fordEntries: readonly FordEntry[];
  inbody: Pick<InBodyScansState, "scans" | "loading" | "error">;
  pulse: CodexPulse;
}): Pick<StoryInput, "notes" | "focuses" | "ford" | "inbody" | "pulse" | "capped"> {
  const fromJournal = <T,>(state: JournalLoad | undefined, data: T): Src<T> =>
    state === "ready" ? { status: "ready", data } : state === "failed" ? { status: "failed" } : { status: "loading" };
  return {
    notes: fromJournal(journal.loadState?.notes, journal.threads ?? []),
    focuses: fromJournal(journal.loadState?.focuses, journal.focuses),
    ford:
      fordStatus === "ready"
        ? { status: "ready", data: fordEntries }
        : fordStatus === "failed"
          ? { status: "failed" }
          : fordStatus === "loading"
            ? { status: "loading" }
            : { status: "off" },
    inbody: inbody.error
      ? { status: "failed" }
      : inbody.loading
        ? { status: "loading" }
        : { status: "ready", data: inbody.scans },
    pulse:
      pulse.status === "ready" && pulse.history
        ? { status: "ready", data: pulse.history }
        : pulse.status === "failed"
          ? { status: "failed" }
          : { status: "loading" },
    capped: !!journal.capped,
  };
}

/* ------------------------------------------------------------------ */
/* Programming                                                         */
/* ------------------------------------------------------------------ */

/**
 * What the profile already holds about her programming, handed in (no read
 * of the tab's own): her machine settings, her routines, the studio's
 * client roster and the studio the iPad is at. Body & Pulse's "On our floor"
 * reads them — her notes per prescribed machine, and machine fit's "clients
 * built like her" (the same inputs Programming → Setup is given).
 */
export interface CodexProgramming {
  clientSettings: Record<string, ClientMachineSetting>;
  routines: Routine[];
  /** The studio roster the app already holds (what machine fit's rows join to). */
  studioClients: readonly Client[];
  activeStudioId: string | null;
  /**
   * Whether her routines and machine settings were read for this client:
   * "loading" until both answered, "failed" when either could not be. Until
   * "ready", the floor never says she has no machines — unknown, not empty.
   */
  status: "loading" | "ready" | "failed";
}

/** No programme, known to be empty (a host that holds none). */
export const NO_PROGRAMMING: CodexProgramming = Object.freeze({
  clientSettings: {},
  routines: [],
  studioClients: [],
  activeStudioId: null,
  status: "ready",
}) as CodexProgramming;

/* ------------------------------------------------------------------ */
/* What a page is handed                                               */
/* ------------------------------------------------------------------ */

/** Everything the tab loaded, once, for every page. */
export interface CodexData {
  client: Client;
  /** The studio's day, yyyy-mm-dd (studioTodayKey). */
  today: string;
  access: CodexAccess;
  /** she / he / they, from the gender Mindbody holds. */
  pronouns: Pronouns;
  authTrainer: Trainer | null;
  /** Who writes a note or a FORD detail: the Auth uid, which the rules pin. */
  author: FordAuthor;
  machines: Machine[];
  trainers: Trainer[];
  /** The studios this reader may see (the cross-train list names them). */
  availableStudios: Studio[];
  /** The one journal load: notes, focuses, the critical notes, 40 sessions. */
  journal: UseClientJournalResult;
  notes: CodexNotes;
  /** Running focuses; null until the focuses are read. */
  focusesRunning: number | null;
  /** The one FORD stream; never opened for a reader the rule refuses. */
  ford: UseClientFordResult;
  fordStatus: CodexFordStatus;
  /** The one InBody scans stream, shared by the card, Story and the timeline. */
  inbody: InBodyScansState;
  /** The client's progress reports (the profile's listener, filtered to them). */
  progressReports: ProgressReport[];
  pulse: CodexPulse;
  /** This trainer's note dismissals (noteDismissals/{uid}), one doc listener. */
  dismissals: NoteDismissalsState;
  sessionTotals: SessionTotals;
  /** How much of the client's story Journey holds (the home studio's cutover). */
  coverage: HistoryCoverage;
  /** Her settings and routines, the roster and the studio, as the profile holds them. */
  programming: CodexProgramming;
  /**
   * Her story (`buildStory`, client-story/story.ts): built once from all of
   * the above, for the Story page and the Overview's Story slot. No read of
   * its own.
   */
  story: Story;
}

/**
 * What the codex asks of the profile around it: the doors that leave the tab
 * (the Planner, the Activity Archive's reports, a machine, the Set-up, the
 * Migration Hub), which the profile owns because it owns the view and the
 * other tabs. The filed progress reports are the Archive's (Activity Archive
 * → Reports); no page of the codex lists, opens or deletes one, so it asks
 * for no report door of its own (the old journal area's three went with it
 * in the cleanup, phase 19).
 */
export interface CodexHosts {
  onOpenPlanner: () => void;
  onOpenReports: () => void;
  /** The Migration Hub (OCR import). Switches to Journey, where imports land. */
  onOpenMigrationHub: () => void;
  onOpenMachine?: (machineId: string) => void;
  onOpenSetup?: () => void;
  /**
   * The door to Sessions before Journey — the SAME door as the header's
   * Completed sessions tile (its words, its rule, the profile's one editor),
   * drawn again on Account's contract history (landing, Sep 24 2026). Null
   * or left out: no door (nothing recorded, and this reader may not add it).
   */
  priorHistoryDoor?: PriorHistoryDoorState | null;
}

/** What every page gets. */
export interface CodexPageProps {
  data: CodexData;
  form: RecordForm;
  go: CodexGo;
  hosts: CodexHosts;
}
