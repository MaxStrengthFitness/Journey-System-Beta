import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { handleFirestoreError, OperationType } from "../lib/firestore-errors";
import { AppHeader } from "./AppHeader";
import { WrapUpConfetti } from "./WrapUpConfetti";
import "./wrap-up.css";
import type { DialValue, Studio } from "../types";
import {
  Client,
  WorkoutSession,
  ExerciseLog,
  Trainer,
  ScheduleEntry,
  Machine,
} from "../types";
import type { JournalEntry, JournalImportance } from "../types/journal";
import type { JournalStream } from "../hooks/useClientJournal";
import { sessionJournalOf } from "../features/session-record/session-journal";
import { safeToDate } from "../lib/utils";
import { PulseQuickLogDialog } from "../features/subjective-report";
import { FordSweep } from "../features/ford/FordSweep";
import { useClientFord } from "../features/ford/useClientFord";
import { NoteSweep, discardUnfiledEntry, fileUnfiledEntry, isUnfiled } from "../features/client-notes";
import { isNextTrainerNote, type NextTrainerNoteMark } from "../features/client-notes/note-catalog";
import { Dial, EFFORT_SCALE, Loudness } from "../features/rating";
import type { SessionNoteDraft } from "../features/client-notes/session-draft";
import { carriedFloorWords, floorCarryOf } from "../features/machine-menu/note-target";
import { ArrowLeft, CalendarCheck2, CalendarClock, CalendarSearch, CalendarX2, Check, HeartPulse, MessageSquareText, Star } from "lucide-react";
import {
  LogConversationDialog,
  promptText,
  renewalOf,
  renewalPromptDue,
} from "../features/renewals";
import { getBroadMuscleGroup } from "../lib/clinical-review-utils";
import { SEND_SETS_NOW_EVENT } from "../features/session-record/sign-out-check";
import { performedOnly, SKIP_REASON_SHORT } from "../lib/set-outcome";
import { studioTodayKey } from "../lib/studio-time";
import {
  congratulation,
  journeySentence,
  nextBookingAnswer,
  nextBookingFor,
  nextBookingSentence,
  timesDoor,
  todayHeadline,
  type JourneyRead,
  type NextBookingAnswer,
  type TodayLine,
} from "../lib/post-session";
import { useMonthRead, useOpeningsData } from "../features/openings/ui";
import { TIMES_WITH_ROOM } from "../features/openings/present";
import { TimesWithRoomSheet, hasTimesToOffer } from "../features/openings/ui/TimesWithRoomSheet";
import { isCacheOnly, serverRead, type ServerRead } from "../features/standing-week/server-read";
import { useServerWait } from "../features/standing-week/useServerWait";

import { canQuoteLifetime, type HistoryCoverage } from "../lib/prior-history";
import { canQuoteSessionNumber } from "../lib/client-coverage";
import { firstTimeTag, sessionNumberTag } from "../lib/history-claims";
import { clientFirstName } from "../lib/client-name";
import { packageStanding } from "../features/packages/package-standing";
import { usePackagesDoor } from "../features/packages/usePackagesDoor";
import { bookedWeekdays } from "../features/packages/booked-days";
import { DOOR_BUTTON, sheetTitle } from "../features/packages/package-copy";
import { PackagesSheet } from "../features/packages/PackagesSheet";
import { NextWeightCard, type SaveNextWeight } from "../features/next-weight/NextWeightCard";
import { nextTimeOffer, sameTicks, tickedInOrder, type NextTimeSnapshot } from "../features/routine-plan/next-time";
import { NextTimeCard } from "../features/routine-plan/ui/NextTimeCard";
/**
 * THE WRAP-UP — the post-session screen (rebuilt in the tracker round, Sep 2026).
 *
 * Named in the voice-review round (Sep 27 2026, AJ): "briefing is strictly
 * pre-session while wrap up is post-session". The screen had no name of its
 * own before (its only heading read "Session complete"), and "the post
 * session briefing" in conversation collided with the pre-session Briefing.
 * Stored values keep their old words: notes filed here still carry
 * `origin: "post_session"`, and the tracker still calls this face
 * "post-session" in code.
 *
 * Thirty seconds, walking the client out. AJ's order of business:
 *   1. TODAY — "here's how they did": one line per machine, today against
 *      last time, the max-strength stars, and where the work went.
 *   2. THE JOURNEY — one sentence a trainer can say out loud: "your loads
 *      are up 21% since July across four machines — strongest on lower
 *      body". Says "not enough history yet" below the bar, never a number
 *      it cannot stand behind.
 *   3. NEXT — are they booked? (Openings round, Sep 27 2026: the card listens
 *      for her own bookings from the server, at any studio on the same
 *      Mindbody, and never says a plain "Nothing booked yet"; see NEXT
 *      below.) Then the door to Times with room, and how hard she worked —
 *      the effort Dial (the Atlas answers, Oct 2 2026; it replaced the dose
 *      Dial): Left some in the tank · Held back a bit · As expected · Pushed
 *      hard · Gave everything, one rating for the whole workout, saved the
 *      moment it is tapped as `sessions.effort`. AJ's call: untouched SAVES
 *      "As expected", stored as 0 with `effortDefaulted: true` when the
 *      trainer leaves, so a reader can tell it from a tap — the Profile note (the closing note until Sep 27) with its
 *      Loudness (Note · Heads up · Critical, default Note: at Note it stays
 *      on the profile and never reaches the next briefing; Heads up and
 *      Critical may carry a "matters until" day so the note leaves the
 *      briefing on its own), filed to the journal when the trainer leaves;
 *      then Update Pulse and the renewal conversation when one is due. The
 *      note FOR the next trainer is the End Session box, one step earlier.
 *   3b. WHAT THEY TOLD YOU — two trays, both silent when empty, which is
 *      most sessions. Notes first: anything saved during the session with no
 *      category yet ("capture now, tag at teardown") comes back as a card
 *      with the categories underneath — one tap files it. The Note for the
 *      next trainer comes back here too (Finish writes it as an unfiled
 *      Heads up): AJ, Sep 27 2026, "made for the next sessions pre session
 *      briefing but also can be filed to the profile". So its card says
 *      "Note for the next trainer" and has no Discard, which would take it
 *      off the next briefing; filing it keeps it there. Then FORD:
 *      anything caught with "Remember this" that has no letter on it yet.
 *      They sit here, after Next and before Lifetime, because filing three
 *      sentences is seconds and Pulse is minutes — short thing first is
 *      what gets both done. Like everything else on this screen they block
 *      nothing: walking away costs the trainer nothing, the notes wait in
 *      the record's Notes area and the captures in its Life section.
 *   4. LIFETIME — small, at the bottom. Not the thing to go over every
 *      time, but nice to have.
 *
 * There is NO save button. The session was submitted when End Session was
 * confirmed (commitEndSession in the tracker). "Back to Hub" only leaves.
 *
 * NEXT TIME (the first-session design round, Oct 8 2026, §4.7), after the
 * next session's weights: the machines performed today that the routine
 * lacks, each a tick, and the Road for next time under them. Ticked by
 * default only while a routine with machines is being built; with the
 * routine empty when the session finished (the consult: AJ, "sometimes the
 * consult machines will not be the same as their a routine") or none at
 * all, every row starts unticked under "Tick the ones that start Routine A".
 * The ticks are handed to the host ONCE, on every way out, like the
 * effort's default (`onNextTime`), never per tick; nothing ticked writes
 * nothing. A way out that leaves the screen standing (the iPad locked,
 * another app opened to book the next visit) never locks them: changed
 * after it, they are handed over again on the next way out. The card is
 * routine-plan/ui/NextTimeCard.tsx; what it reads is frozen at Finish.
 * Next time is the ONLY way the Wrap-up writes a routine: nothing here puts
 * today's machines into Routine A, or the consult's day one, by itself.
 * Round 2 (Oct 9 2026, the round document's §4b and §4d): after a session on
 * a Routine B with its plan of swaps, a ticked machine that is one of B's
 * swaps makes that swap in the A machine's place; at a studio that starts
 * new clients on A and B together, the ticks that START Routine A start the
 * planned Routine B too, and the card says so as the ticks change ("Routine
 * B starts too: ..."). The client's B switch is then its own write, after
 * the ticks' batch lands, never inside it (the whole-branch review:
 * `setRoutineBActive`, so a client the rules refuse an update to never takes
 * the ticks down with it).
 *
 * The screen follows the app theme, all of it. Its surfaces are the
 * `bg-dark` / `ink-d` tokens, which go light in the light theme, and every
 * colour on it is a token that reads in both: brand blue (`--eq-live*`) for
 * a gain, a save and the focus ring, green (`--eq-ok`) for booked and saved,
 * plum (`--eq-warn`) for a caution (nothing booked, a note left unsaved), the
 * journey grid's gold star for a max-strength set, and sky, amber and neutral
 * for where the work went (GROUP_TONE says why not the brand's two). Until
 * Sep 27 2026 the Dial, Loudness and the two trays were pinned dark (a
 * `.dark` + `data-theme="dark"` wrapper left over from when the whole screen
 * was), which on the light theme drew dark slabs and white words on a white
 * card; they now resolve against the document like everywhere else they are
 * drawn. `src/neutral-ramp.test.ts` counts this file's colours with every
 * other theme-aware screen's.
 *
 * The type is the app's (voice-review follow-up, Sep 27 2026): the masthead
 * title in the codex page-title voice (display, 800, italic capitals, 30px),
 * the card heads in small upright capitals like My Profile's, buttons bold
 * sentence case at 14px, and every size on the 11 / 12 / 14 / 17 / 30 scale.
 *
 * NEXT, AND TIMES WITH ROOM (Openings round, Sep 27 2026, phase 8). Until
 * then the Next card judged "nothing booked" from the schedule the Hub held,
 * about eight days of this studio, so a client booked ten days out, or at
 * Strongsville, read as unbooked, and it said "Nothing booked yet" exactly
 * when Journey had read least. Now:
 *   - a booking in the schedule already on screen is shown at once;
 *   - otherwise the card LISTENS to her own bookings from now on (the
 *     profile header's query: clientId and startTime on the existing index,
 *     up to 50 rows, cancelled ones dropped), and only the server's answer
 *     is one (server-read.ts). A listener, not a read: if the desk books her
 *     while she is still standing there, the webhook writes the booking
 *     within seconds, the card turns green and the door steps back;
 *   - it says where a booking elsewhere is ("at Strongsville");
 *   - nothing on file says how far ahead Journey holds bookings (30 days
 *     once the month was read in full today, 7 otherwise), and offline or
 *     failed says it can't check. lib/post-session.ts has every sentence.
 * The line keeps its space in every state, so nothing moves while the
 * client reads it. The door to Times with room sits INSIDE that line, after
 * the sentence, so its arriving (the Openings reads answer a second or more
 * after the screen opens) moves nothing the trainer is reaching for below:
 * the unsaved note's Save note / Drop it, the effort Dial. It is quiet (a text
 * button) on every Wrap-up with something to offer, prominent (the plum line
 * and a bordered button) only when the server confirmed nothing is booked,
 * both 44px tall, and absent before the studio has anything to offer
 * (`hasTimesToOffer`). Openings' reads therefore run on every Wrap-up, not
 * only once the sheet opens: the door needs them to know whether to show
 * itself; the sheet's own booking reads start only when it opens. It opens a
 * sheet ON TOP of this screen (features/openings/ui/TimesWithRoomSheet.tsx),
 * times only, naming nobody; the Profile note and any unfinished note are
 * never lost. Openings' reads (`useOpeningsData`: the weekly summary by id,
 * the standing weeks, the marks) and her bookings run in the background;
 * nothing on this screen waits for them (floor-loop rank 2). It books
 * nothing: every offer ends "Check it in Mindbody before you promise it.
 * Journey doesn't book."
 */

/** Her bookings from now on, as the profile header reads them: the soonest 50. */
const HER_BOOKINGS_LIMIT = 50;

/**
 * Her own bookings from now on, live (the profile header's query, as a
 * listener), and whether the server has answered: a snapshot this iPad's
 * cache answered alone is not an answer until the server confirms it. Once
 * the server has answered, later snapshots are shown as they come (a booking
 * arriving). Not listened to at all while `enabled` is false (a booking is
 * already on screen).
 */
function useHerBookings(clientId: string, enabled: boolean): { rows: ScheduleEntry[]; read: ServerRead } {
  const key = enabled && clientId ? clientId : "";
  const [from] = useState(() => Timestamp.now());
  const [held, setHeld] = useState<{ key: string; rows: ScheduleEntry[]; loading: boolean; failed: boolean; fromCache: boolean }>({
    key: "",
    rows: [],
    loading: true,
    failed: false,
    fromCache: false,
  });

  useEffect(() => {
    if (!key) return;
    // A listener started again (her on-screen booking came and went) starts
    // from nothing: the last one's rows are not this one's answer.
    setHeld({ key, rows: [], loading: true, failed: false, fromCache: false });
    let answered = false;
    return onSnapshot(
      query(collection(db, "schedules"), where("clientId", "==", key), where("startTime", ">=", from), orderBy("startTime", "asc"), limit(HER_BOOKINGS_LIMIT)),
      { includeMetadataChanges: true },
      (snap) => {
        if (!isCacheOnly(snap)) answered = true;
        setHeld({
          key,
          rows: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ScheduleEntry),
          loading: false,
          failed: false,
          fromCache: !answered,
        });
      },
      (err) => {
        console.warn("[wrap-up] her next booking couldn't be read:", err);
        setHeld({ key, rows: [], loading: false, failed: true, fromCache: false });
      },
    );
  }, [key, from]);

  // An answer about another client (or none yet) is this one still loading.
  const current = held.key === key ? held : { rows: [] as ScheduleEntry[], loading: true, failed: false, fromCache: false };
  const wait = useServerWait(Boolean(key) && (current.loading || current.fromCache));
  const read = serverRead({ loading: current.loading, failed: current.failed, fromCache: current.fromCache, ...wait });
  return { rows: current.rows, read };
}

export interface WrapUpScreenProps {
  /** The studio the session is at, for the header (the active studio's name). */
  studioName?: string;
  /**
   * The studio the iPad is in (the active studio: the Demo Mode realm rule).
   * Openings' reads for Times with room, and where "at Strongsville" is
   * measured from. Without it there is no door.
   */
  studio?: Studio | null;
  /** Every studio Journey knows, to name the studio of a booking elsewhere. */
  studios?: Studio[];
  /** The trainers the app holds: who works here, for Times with room. */
  trainers?: Trainer[];
  /**
   * How much of this client's story Journey holds (lib/client-coverage.ts).
   *
   * This screen is the one the CLIENT is standing next to. Showing a woman
   * of twelve years "Sessions 4" is the worst instance of the whole problem,
   * because she reads it before the trainer can explain. AJ, Sep 22: hide
   * the three lifetime tiles until we know her whole story, and keep what
   * actually happened today. Defaults to the cautious answer.
   */
  coverage?: HistoryCoverage;
  client: Client;
  session: WorkoutSession;
  /** Today's logs as they were committed (outcomes stamped). */
  logs: ExerciseLog[];
  allLogs?: ExerciseLog[];
  lines: TodayLine[];
  journey: JourneyRead;
  schedules?: ScheduleEntry[];
  authTrainer: Trainer | null;
  /**
   * Writes `sessions.effort` the moment it is tapped (`defaulted` false), and
   * once on the way out when nobody tapped: 0 with `defaulted` true ("As
   * expected", AJ's call). Clearing a tap writes the default back. Resolving
   * to `false` means the write failed: the Dial then never says "Saved".
   */
  onEffort: (effort: DialValue, defaulted: boolean) => void | boolean | Promise<void | boolean>;
  /**
   * Sets the weight the next session loads on one machine (features/next-weight).
   * Resolving to `false` means the write failed. Without it there is no card.
   */
  onNextWeight?: SaveNextWeight;
  /**
   * NEXT TIME (the first-session design round, Oct 8 2026, §4.7): the
   * routine the session ran, its machines and its plan, and today's
   * performed machines, frozen at Finish (routine-plan/next-time.ts). Null
   * for a Free session, and whenever Journey can't tell: no card.
   */
  nextTime?: NextTimeSnapshot | null;
  /**
   * The ticked machines, handed over ONCE on the way out (Back to Hub, the
   * iPad locked, a sign-out, the screen going), never per tick, beside the
   * effort's default; nothing ticked hands over nothing. A way out that
   * leaves the screen standing keeps the ticks open, and a later way out
   * hands them over again only when they changed (the host writes the
   * difference). The host writes them through routine-plan/store.ts and
   * never waits on it. Without it there is no card.
   */
  onNextTime?: (ticked: string[]) => void;
  /** Leaves the screen; the Profile note (if any) is filed on the way out with its Loudness and "until" day. */
  onLeave: (profileNote: { noteContent: string; importance: JournalImportance; effectiveUntil?: Date | null }) => void | Promise<void>;
  /**
   * Files the Profile note (and, through the host, a waiting mid-session
   * draft) WITHOUT leaving: when the screen goes by any way but Back to Hub,
   * when the iPad is locked or the page hidden, and on a sign-out. Each typed
   * note is handed over once (the Atlas answers, Oct 2 2026).
   */
  onFile?: (profileNote: { noteContent: string; importance: JournalImportance; effectiveUntil?: Date | null }) => void | Promise<void>;
  /**
   * A note the trainer started mid-session and never saved (fluidity round,
   * Sep 2026). The screen says so and offers to finish it or drop it; a
   * draft still here on leave is filed by the host, never lost.
   */
  unsavedDraft?: SessionNoteDraft | null;
  onSaveDraft?: (text: string) => void | Promise<void>;
  onDropDraft?: () => void;
  /**
   * The Note for the next trainer Finish just wrote, if any: its words as the
   * journal holds them, and the journal entry's id once the write has
   * answered (voice-review follow-up, Sep 27 2026). It comes back in the
   * To-file tray, labelled, with no Discard (`isNextTrainerNote`).
   */
  nextTrainerNote?: { id: string | null; body: string } | null;
  /**
   * The client's journal stream the Active Session already holds (speed
   * round R11): the To-file tray takes this session's notes from it rather
   * than opening a query of its own. Without it, or if it failed, the tray
   * reads them itself as before (session-record/session-journal.ts).
   */
  journalStream?: JournalStream | null;
  /**
   * The session is saved on this iPad and the database has not answered yet:
   * offline, or a slow connection (session record, Sep 26 2026). "Saved" alone
   * would be a claim about the studio's records that is not true yet.
   */
  savedOnThisIpad?: boolean;
  machines?: Machine[];
  rightControls?: React.ReactNode;
  trainerDropdown?: React.ReactNode;
  onStudioClick?: () => void;
}

/* Where the work went: one colour per body region, each reading in both
   themes. Two of the chart palette's five (`--chart-*`, index.css) are brand
   colours, so neither is used: chart-2 is the hero orange, kept for the one
   loud action of a screen, and chart-1 is the brand blue of action and
   selection in the light theme. Nor the meaning colours: green is "done" and
   plum a caution, and a muscle group is neither. So sky (chart-4), amber
   (chart-5) and the strong neutral ink, with the chart palette's own grey
   (chart-3) for "Other". The region's name and share are written beside
   every bar, so the colour is never the only way to tell. */
const GROUP_TONE: Record<string, string> = {
  "Lower Body": "bg-chart-4",
  "Upper Body": "bg-chart-5",
  "Core & Spine": "bg-ink-d2",
  Other: "bg-chart-3",
};
const OTHER_TONE = GROUP_TONE.Other;

/** A card's head: the label voice, 14/700 in ink-2, in its own
 *  capitalisation (type and depth review, Oct 5 2026; it was 12px capitals,
 *  the pattern the round took out everywhere else). The page's one eyebrow,
 *  over the h1, keeps the capitals. */
function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="text-[14px] font-bold text-ink-d2 break-words">{children}</div>;
}

function Card({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <section
      // Rises in by CSS (wrap-up.css, the iPad round): the compositor draws it.
      style={{ "--wu-delay": `${delay}s` } as React.CSSProperties}
      // A panel (type and depth, phase 10, Oct 4 2026): the edge seen from
      // outside (--edge, the fill clipped to the padding box) and the
      // panel's lift with its dark top light (--panel-lift, as the profile
      // header card). It was the divider hairline with no shadow.
      className={`wu-rise mx-5 p-4 bg-bg-dark-2 border border-(--edge) bg-clip-padding rounded-[14px] shadow-(--panel-lift) flex flex-col gap-3 ${className}`}
    >
      {children}
    </section>
  );
}

function fmtLb(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function TodayRow({ line, coverage }: { line: TodayLine; coverage: HistoryCoverage }) {
  const performed = line.outcome === "performed";
  const word =
    line.outcome === "practice"
      ? "Practice"
      : line.outcome === "skipped"
        ? `Skipped${line.skipReason && SKIP_REASON_SHORT[line.skipReason as keyof typeof SKIP_REASON_SHORT] ? " · " + SKIP_REASON_SHORT[line.skipReason as keyof typeof SKIP_REASON_SHORT] : ""}`
        : line.outcome === "not_reached"
          ? "Not reached"
          : "";
  const delta: { text: string; tone: string } | null = (() => {
    if (!performed) return null;
    if (line.first) {
      // Her first time only when Journey holds her whole story; otherwise
      // there is simply no earlier set on record, and nothing to compare.
      const tag = firstTimeTag(coverage);
      return tag ? { text: tag, tone: "text-(--eq-live-text)" } : null;
    }
    if (line.loadDelta === null) return null;
    if (line.loadDelta > 0) return { text: `▲ +${fmtLb(line.loadDelta)} lb`, tone: "text-(--eq-live-text)" };
    if (line.loadDelta < 0) return { text: `▼ ${fmtLb(line.loadDelta)} lb`, tone: "text-ink-d2" };
    if ((line.countDelta ?? 0) > 0) return { text: `▲ +${line.countDelta} ${line.isTSC ? "s" : "rep" + (line.countDelta === 1 ? "" : "s")}`, tone: "text-(--eq-live-text)" };
    if ((line.countDelta ?? 0) < 0) return { text: `▼ ${line.countDelta} ${line.isTSC ? "s" : "rep" + (line.countDelta === -1 ? "" : "s")}`, tone: "text-ink-d2" };
    return { text: "Held", tone: "text-ink-d3" };
  })();
  return (
    <li className={`flex items-center gap-3 min-h-11 py-1 border-b border-div-d last:border-b-0 ${performed ? "" : "opacity-60"}`}>
      <span className="flex-1 min-w-0 text-[14px] font-semibold text-ink-d1 break-words">{line.name}</span>
      {performed ? (
        <>
          <span className="font-mono tabular-nums text-[14px] font-bold text-ink-d1 whitespace-nowrap">
            {line.weight !== null ? fmtLb(line.weight) : "–"}
            <span className="text-[11px] font-semibold text-ink-d3 ml-0.5">lb</span>
            <span className="text-ink-d3 mx-1">×</span>
            {line.count ?? "–"}
            {line.isTSC && <span className="text-[11px] font-semibold text-ink-d3 ml-0.5">s</span>}
          </span>
          {/* The journey grid's own gold star for a max-strength set. */}
          {line.quality === 3 && <Star size={14} className="text-(--jg-q-star) fill-current shrink-0" aria-label="Max-strength set" />}
          {delta && <span className={`w-20 text-right text-[11px] font-bold whitespace-nowrap ${delta.tone}`}>{delta.text}</span>}
        </>
      ) : (
        <span className="text-[12px] font-semibold text-ink-d3 whitespace-nowrap">{word}</span>
      )}
    </li>
  );
}

export function WrapUpScreen({
  studioName,
  studio = null,
  studios = [],
  trainers = [],
  client,
  session,
  logs,
  allLogs = [],
  lines,
  journey,
  schedules = [],
  authTrainer,
  onEffort,
  onNextWeight,
  nextTime = null,
  onNextTime,
  onLeave,
  onFile,
  unsavedDraft = null,
  onSaveDraft,
  onDropDraft,
  nextTrainerNote = null,
  journalStream,
  savedOnThisIpad = false,
  machines = [],
  rightControls,
  trainerDropdown,
  onStudioClick,
  coverage = "unknown",
}: WrapUpScreenProps) {
  const [effort, setEffort] = useState<DialValue | null>(null);
  const [effortSaved, setEffortSaved] = useState(false);
  // Whether the effort has been written yet: untouched, the way out writes
  // the default once.
  const effortWrittenRef = useRef(false);
  /* NEXT TIME (the first-session design round, Oct 8 2026, §4.7). The rows
     come from the snapshot frozen at Finish, so nothing arriving reshuffles
     them while the trainer ticks; the ticks start as `nextTimeRows` says
     (ticked only while a routine with machines is being built). They are
     handed over ONCE, on the way out, beside the effort's default; ticked
     defaults left untouched are handed over too. A way out that leaves the
     screen standing (the iPad locked, another app) keeps them open, and the
     next way out hands them over again only if they changed. */
  const offersNextTime = !!onNextTime;
  const nextRows = useMemo(() => (nextTime && offersNextTime ? nextTimeOffer(nextTime) : []), [nextTime, offersNextTime]);
  const [nextTicked, setNextTicked] = useState<string[]>(() => nextRows.filter((r) => r.defaultOn).map((r) => r.machineId));
  /* Rows that arrive after the screen opened (the card worked out once the
     client's routines answered, a Finish straight after Who's this?; the
     whole-branch review, Oct 9 2026) start ticked as the rows say, once:
     after that the ticks are the trainer's. */
  const nextSeededRef = useRef(nextRows.length > 0);
  useEffect(() => {
    if (nextSeededRef.current || nextRows.length === 0) return;
    nextSeededRef.current = true;
    setNextTicked(nextRows.filter((r) => r.defaultOn).map((r) => r.machineId));
  }, [nextRows]);
  const nextTimeRef = useRef({ rows: nextRows, ticked: nextTicked });
  nextTimeRef.current = { rows: nextRows, ticked: nextTicked };
  const onNextTimeRef = useRef(onNextTime);
  onNextTimeRef.current = onNextTime;
  // What was last handed over, in today's order; null until the first.
  const nextHandedRef = useRef<string[] | null>(null);
  const [notes, setNotes] = useState("");
  const [importance, setImportance] = useState<JournalImportance>("standard");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [showPulse, setShowPulse] = useState(false);
  const todayKey = useMemo(() => studioTodayKey(), []);
  // The unfinished mid-session note, editable here so a last word can be added.
  const [draftText, setDraftText] = useState(unsavedDraft?.body ?? "");
  const [draftBusy, setDraftBusy] = useState(false);
  // A draft written for the studio's floor notes on a machine (the machine
  // menu's "The machine itself", Oct 4 2026) offers to go there, never onto
  // the client's record; left here, the host adds it there on the way out.
  const floorCarry = floorCarryOf(unsavedDraft);
  const floorWords = floorCarry
    ? carriedFloorWords(studioName, machines.find((m) => m.id === floorCarry.machineId)?.name ?? null)
    : null;

  // This session's journal entries, for the To-file tray: one equality query
  // (the journalEntries (sessionId, occurredAt) index), the same stream the Active Session
  // sheet used. Only the unfiled ones are kept; a filed note leaves on the
  // next snapshot.
  const fromStream = useMemo(() => sessionJournalOf(journalStream, session.id), [journalStream, session.id]);
  const [ownUnfiled, setOwnUnfiled] = useState<JournalEntry[]>([]);
  const unfiledNotes = useMemo(
    () => (fromStream ? fromStream.entries.filter((e) => !e.isArchived && isUnfiled(e)) : ownUnfiled),
    [fromStream, ownUnfiled],
  );
  const readsOwn = fromStream === null;
  // The Note for the next trainer is one of them, and its card is told apart.
  const nextTrainerMark: NextTrainerNoteMark | null = nextTrainerNote
    ? { sessionId: session.id ?? null, id: nextTrainerNote.id, body: nextTrainerNote.body }
    : null;
  useEffect(() => {
    // Read here only when the session's stream can't answer (R11).
    if (!session.id || !readsOwn) return;
    const q = query(collection(db, "journalEntries"), where("sessionId", "==", session.id));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as JournalEntry);
        setOwnUnfiled(rows.filter((e) => !e.isArchived && isUnfiled(e)));
      },
      (err) => handleFirestoreError(err, OperationType.GET, "journalEntries"),
    );
    return () => unsub();
  }, [session.id, readsOwn]);

  // Anything caught with "Remember this" during the session and not yet filed.
  // The client is passed because the read names the client's studio (client
  // codex, phase 1); the legacy client.events adapter it also feeds adds
  // nothing here, since every legacy detail already has a pillar.
  const { untagged: fordUntagged, status: fordStatus } = useClientFord({
    clientId: client.id,
    client,
  });
  const [showRenewal, setShowRenewal] = useState(false);
  const [renewalLogged, setRenewalLogged] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Her renewal with her auto-renewal mark applied (auto-renew.ts): a
  // client marked "not on auto-renewal" gets no before-the-charge prompt.
  const renewal = useMemo(() => renewalOf(client), [client]);
  const renewalDue = renewalPromptDue(renewal);
  // Whether the packages card is possible at all, before anything is read:
  // a live package, an away pause or a running contract says no here.
  const preliminaryPackages = useMemo(
    () =>
      packageStanding({
        client,
        firstName: clientFirstName(client),
        today: todayKey,
        settings: null,
        coverage,
      }),
    [client, todayKey, coverage],
  );

  /*
   * EVERY WAY OUT FILES (the Atlas answers, Oct 2 2026). Until then only
   * "Back to Hub" filed the Profile note; the bottom bar and the header asked
   * first (the unsaved-changes question, Sep 24 2026), and locking the iPad
   * filed it by navigating away. AJ: every exit saves it. So:
   *   - Back to Hub files through `onLeave` and goes home, as before;
   *   - any other way the screen goes (the bottom bar, the header, a studio
   *     switch, a sign-out) files through `onFile` as it unmounts — nothing
   *     asks, because nothing is lost;
   *   - the iPad locked or the page hidden files through `onFile` and STAYS:
   *     the box empties and says it was saved, so coming back and typing
   *     more is a new note, never the same note twice;
   *   - a sign-out files when it raises SEND_SETS_NOW_EVENT, before the
   *     person is gone (a write after sign-out is made as nobody).
   * A typed note is handed over exactly once: the ref is emptied the moment
   * it is.
   */
  const [noteFiledHere, setNoteFiledHere] = useState(false);

  /* The Profile note is filed when the trainer leaves — by the button, or by
     closing the tab. Keep the latest text in a ref so an unload can read it. */
  const notesRef = useRef({ notes, importance, effectiveUntil });
  notesRef.current = { notes, importance, effectiveUntil };
  const draftWaitingRef = useRef(false);
  draftWaitingRef.current = !!unsavedDraft && draftText.trim() !== "";
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;
  const leftRef = useRef(false);

  /** The Profile note as the host files it, from what is typed right now. */
  const profileNoteNow = () => {
    const { notes: noteContent, importance: loud, effectiveUntil: until } = notesRef.current;
    return {
      noteContent,
      importance: loud,
      // End of the studio day, as the composer writes it — never a raw
      // date-only string, which would be UTC midnight (CLAUDE.md).
      effectiveUntil: loud !== "standard" && until ? new Date(`${until}T23:59:59`) : null,
    };
  };

  /**
   * Files what is here without leaving: the typed Profile note (once — the
   * ref is emptied as it is handed over) and, through the host, a waiting
   * draft. True when something was handed over.
   */
  const fileWithoutLeaving = (): boolean => {
    if (leftRef.current || !onFileRef.current) return false;
    const note = profileNoteNow();
    const typed = note.noteContent.trim() !== "";
    if (!typed && !draftWaitingRef.current) return false;
    notesRef.current = { ...notesRef.current, notes: "" };
    void onFileRef.current(typed ? note : { ...note, noteContent: "" });
    return typed;
  };

  const leave = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    setLeaving(true);
    fileEffortDefault();
    fileNextTime();
    const note = profileNoteNow();
    notesRef.current = { ...notesRef.current, notes: "" };
    void onLeave(note);
  };

  useEffect(() => {
    // Locked or hidden: file and stay. The box empties and says so.
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      fileEffortDefault();
      fileNextTime();
      if (fileWithoutLeaving()) {
        setNotes("");
        setNoteFiledHere(true);
      }
    };
    // A sign-out asks every screen to send now, while the person is signed in.
    const onSignOut = () => {
      fileEffortDefault();
      fileNextTime();
      if (fileWithoutLeaving()) {
        setNotes("");
        setNoteFiledHere(true);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener(SEND_SETS_NOW_EVENT, onSignOut);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener(SEND_SETS_NOW_EVENT, onSignOut);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The effort rating. A tap writes it plainly; tapping the chosen position
     again clears it back to the untouched default, which is written as the
     default (0, defaulted) so nothing a trainer took back is left standing. */
  const onEffortRef = useRef(onEffort);
  onEffortRef.current = onEffort;
  const pickEffort = (v: DialValue | null) => {
    setEffort(v);
    setEffortSaved(false);
    effortWrittenRef.current = true;
    Promise.resolve(v === null ? onEffort(0, true) : onEffort(v, false)).then(
      (ok) => setEffortSaved(v !== null && ok !== false),
      () => setEffortSaved(false),
    );
  };
  /** Untouched on the way out: "As expected", marked as the default. Once. */
  const fileEffortDefault = () => {
    if (effortWrittenRef.current) return;
    effortWrittenRef.current = true;
    Promise.resolve(onEffortRef.current(0, true)).catch(() => undefined);
  };
  /**
   * Next time's ticks, handed over once on the way out (never per tick), in
   * today's order. The first time, nothing ticked hands over nothing, so a
   * tick made after the iPad was locked is still written when the trainer
   * leaves. After that, only ticks changed since the last hand-over are
   * handed over again (unticking everything included): the iPad locked, or
   * another app opened to book the next visit, never locks the ticks, and
   * an unchanged way out writes nothing twice. The host writes only the
   * difference.
   */
  const fileNextTime = (): boolean => {
    const hand = onNextTimeRef.current;
    if (!hand) return false;
    const { rows, ticked } = nextTimeRef.current;
    const picked = tickedInOrder(rows, ticked);
    const handed = nextHandedRef.current;
    if (handed === null ? picked.length === 0 : sameTicks(handed, picked)) return false;
    nextHandedRef.current = picked;
    hand(picked);
    return true;
  };
  // Every way out that unmounts the screen without Back to Hub (the bottom
  // bar, the header, a studio switch) still files the Profile note and the
  // effort's default. The check waits a tick, so React's development double
  // mount (StrictMode runs every effect's cleanup once and mounts again) is
  // not a way out.
  const aliveRef = useRef(false);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      setTimeout(() => {
        if (aliveRef.current) return;
        fileEffortDefault();
        fileNextTime();
        fileWithoutLeaving();
      }, 0);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- today ------------------------------------------------------------ */
  const performed = useMemo(() => performedOnly(logs), [logs]);
  const load = (l: ExerciseLog) => parseFloat(l.loadLb || l.weight || "0") || 0;
  const reps = (l: ExerciseLog) => {
    if (l.isTSC || l.isStaticHold) return ((parseFloat(l.seconds || "0") || 0) / 30) * 2;
    return parseFloat(l.outcomeReps || l.reps || "0") || 0;
  };
  const tonnage = useMemo(() => performed.reduce((s, l) => s + load(l) * reps(l), 0), [performed]);
  const byRegion = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const l of performed) {
      const m = machines.find((x) => x.id === l.machineId);
      const g = getBroadMuscleGroup(m?.anatomicalRegion || "Unknown", m?.name || "");
      acc[g] = (acc[g] ?? 0) + load(l) * reps(l);
    }
    return Object.entries(acc)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [performed, machines]);

  const startD = safeToDate(session.startTime) || safeToDate(session.createdAt);
  const endD = safeToDate(session.endTime) || new Date();
  const minutes = startD ? Math.max(0, Math.round((endD.getTime() - startD.getTime()) / 60000)) : null;
  // "session #12" only through the Hub card's gate: the client reads this
  // screen, and Journey's own count would tell a twelve-year client "#4".
  const sessionTag = sessionNumberTag(session.sessionNumber, canQuoteSessionNumber(client, coverage));

  /* --- next ------------------------------------------------------------- */
  // Openings' reads for the door (the summary by id, the standing weeks, the
  // marks), in the background: nothing below waits for them.
  const openings = useOpeningsData({ studio, trainers, authTrainer });
  const monthRead = useMonthRead(openings);
  // A booking in the schedule already on screen answers at once; only
  // without one does the card listen for her own bookings.
  const onScreen = useMemo(() => nextBookingFor(client.id, schedules), [client.id, schedules]);
  const her = useHerBookings(client.id, !onScreen);
  const nowMs = openings.now.getTime();
  const next: NextBookingAnswer = useMemo(
    () =>
      nextBookingAnswer({
        clientId: client.id,
        loaded: schedules,
        heard: her.rows,
        read: her.read,
        monthRead,
        hereStudioId: studio?.id ?? null,
        studioName: (id) => studios.find((s) => s.id === id)?.name ?? null,
        linked: openings.connected,
        now: nowMs,
      }),
    [client.id, schedules, her.rows, her.read, monthRead, studio?.id, studios, openings.connected, nowMs],
  );
  const door = timesDoor(next, hasTimesToOffer(openings));
  const [timesOpen, setTimesOpen] = useState(false);

  /* --- lifetime (the client's own running counters; allLogs is the fallback) */
  const lifetime = useMemo(() => {
    const sessions = client.sessionCount ?? new Set(allLogs.map((l) => l.sessionId)).size;
    const lifetimeReps = client.lifetimeReps ?? performedOnly(allLogs).reduce((s, l) => s + (parseFloat(l.reps || "0") || 0), 0);
    const volume = client.lifetimeWeight ?? performedOnly(allLogs).reduce((s, l) => s + load(l) * reps(l), 0);
    return { sessions, reps: lifetimeReps, volume };
  }, [client, allLogs]);

  /* Everything under Today waits for the first frame to be drawn: a
     deferred value is false on the first render and true on the next, which
     React renders after the browser has had the chance to paint. */
  const restDrawn = useDeferredValue(true, false);

  const fmtBig = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString());

  return (
    <div className="w-full h-full min-h-screen bg-bg-dark font-sans flex flex-col overflow-hidden relative">
      {/* The confetti burst (WrapUpConfetti.tsx): CSS, gone once it has finished. */}
      <WrapUpConfetti />

      <div className="max-w-205 mx-auto w-full h-full relative flex flex-col border-x border-div-d shadow-2xl">
        <AppHeader
          // The header is the frame, the same navy in both themes (the Navy
          // Frame, Oct 4 2026), so there is no look to pass it.
          studioName={studioName}
          trainerInitials={authTrainer?.initials}
          rightControls={rightControls}
          trainerDropdown={trainerDropdown}
          onStudioClick={onStudioClick}
        />

        <div className="flex-1 overflow-y-auto no-scrollbar relative z-10 flex flex-col gap-3 pb-6">
          {/* title */}
          <div className="wu-drop px-6 pt-4 pb-1">
            <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-d2 break-words">
              {savedOnThisIpad ? "Wrap-up · session saved on this iPad" : "Wrap-up · session saved"}
            </div>
            <h1 className="font-display font-extrabold text-ink-d1 text-[30px] leading-[1.04] mt-2 mb-2 break-words">
              {congratulation(session.id ?? `${client.id}-${todayKey}`, clientFirstName(client))}
            </h1>
            {savedOnThisIpad && (
              <p className="text-ink-d2 text-[14px] mb-1" role="status">
                It sends to the studio's records when the connection is back. Nothing more to do.
              </p>
            )}
            <div className="text-ink-d2 text-[14px]">
              {todayHeadline(lines, coverage)}
              {minutes !== null ? ` · ${minutes} min` : ""}
              {sessionTag ? ` · session ${sessionTag}` : ""}
            </div>
          </div>

          {/* 1 · today */}
          <Card delay={0.05}>
            <div className="flex items-baseline justify-between gap-3">
              <Kicker>Today</Kicker>
              <span className="text-[12px] text-ink-d3 font-medium">vs last time on each machine</span>
            </div>
            <ol className="flex flex-col">
              {lines.map((l) => (
                <TodayRow key={l.machineId} line={l} coverage={coverage} />
              ))}
            </ol>
            {byRegion.length > 0 && (
              <div className="pt-2 border-t border-div-d">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[12px] font-semibold text-ink-d3">Where the work went</span>
                  <span className="font-mono text-[12px] text-ink-d2">{Math.round(tonnage).toLocaleString()} lb moved</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {byRegion.map(([g, v]) => (
                    <div key={g} className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${GROUP_TONE[g] ?? OTHER_TONE}`} />
                      <span className="w-24 text-[12px] text-ink-d2">{g}</span>
                      <span className="flex-1 h-1.5 rounded-full bg-bg-dark-3 overflow-hidden">
                        <span className={`block h-full ${GROUP_TONE[g] ?? OTHER_TONE}`} style={{ width: `${Math.round((100 * v) / tonnage)}%` }} />
                      </span>
                      <span className="w-10 text-right font-mono text-[11px] text-ink-d3">{Math.round((100 * v) / tonnage)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* The rest of the screen a frame later (the iPad round, Oct 6 2026):
                 the first frame is the title and Today, so the Wrap-up is on
                 screen at once, and the cards below arrive with the next
                 render, already rising in as they always did. */}
          {restDrawn && (
          <>
          {/* 1b · the next session's weights (the Atlas answers, Oct 2 2026):
                 the trainer sets what the next session loads, up or down; the
                 app never suggests one. Silent when nothing was performed. */}
          {onNextWeight && lines.some((l) => l.outcome === "performed" && l.weight !== null) && (
            <Card delay={0.08}>
              <Kicker>Next session's weights</Kicker>
              <NextWeightCard lines={lines} onSave={onNextWeight} />
            </Card>
          )}

          {/* 1c · next time (the first-session design round, Oct 8 2026,
                 §4.7): today's performed machines the routine lacks, ticked
                 into it for next time, with the Road for next time under
                 them. Written once on the way out, never per tick. No card
                 for a Free session, or when there is nothing to offer. */}
          {nextTime && nextRows.length > 0 && (
            <Card delay={0.1}>
              <Kicker>Next time</Kicker>
              <NextTimeCard
                snapshot={nextTime}
                rows={nextRows}
                ticked={nextTicked}
                onTicked={setNextTicked}
                firstName={clientFirstName(client)}
                todayYmd={todayKey}
              />
            </Card>
          )}

          {/* 2 · the journey */}
          <Card delay={0.12}>
            <Kicker>The journey</Kicker>
            <p className={`text-[14px] leading-snug ${journey.enough ? "text-ink-d1 font-semibold" : "text-ink-d3"}`}>
              {journeySentence(journey, clientFirstName(client))}
            </p>
            {journey.standout && (
              <p className="text-[12px] text-ink-d2">
                Biggest gain: <b className="text-ink-d1">{journey.standout.name}</b>, {fmtLb(journey.standout.startWeight)} → {fmtLb(journey.standout.nowWeight)} lb (+{journey.standout.pct}%).
              </p>
            )}
            {journey.byGroup.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {journey.byGroup.map((g) => (
                  <span key={g.group} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-bg-dark-3 border border-div-d text-ink-d2">
                    {g.group} <span className={g.pct > 0 ? "text-(--eq-live-text)" : "text-ink-d3"}>{g.pct > 0 ? "+" : ""}{g.pct}%</span>
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* 3 · next */}
          <Card delay={0.18}>
            <Kicker>Next</Kicker>
            {/* Booked is done (green); nothing booked is a caution (plum);
                checking and can't-check are neither. The line keeps room for
                two lines of the sentence, or the 44px door, in every state,
                so neither the answer nor the door arriving moves anything
                while the client reads it or the trainer reaches for the
                controls below.

                The door to Times with room sits INSIDE the line, after the
                sentence: prominent only when the server confirmed nothing is
                booked, quiet on every other Wrap-up with something to offer,
                absent before there is anything. Both are the same height, so
                one turning into the other moves nothing either. */}
            <div
              className={`flex items-center gap-3 min-h-14 py-1.5 px-3 rounded-xl border ${
                next.state === "booked"
                  ? "border-(--eq-ok)/40 bg-(--eq-ok-fill)"
                  : next.state === "none"
                    ? "border-(--eq-warn)/40 bg-(--eq-warn-fill)"
                    : "border-div-d bg-bg-dark-3"
              }`}
              data-testid="next-booking"
              data-state={next.state}
            >
              {next.state === "booked" ? (
                <CalendarCheck2 size={18} className="text-(--eq-ok) shrink-0" aria-hidden="true" />
              ) : next.state === "none" ? (
                <CalendarX2 size={18} className="text-(--eq-warn) shrink-0" aria-hidden="true" />
              ) : (
                <CalendarSearch size={18} className="text-ink-d3 shrink-0" aria-hidden="true" />
              )}
              <span
                className={`min-w-0 flex-1 text-[14px] font-semibold break-words ${next.state === "checking" || next.state === "cant-check" ? "text-ink-d2" : "text-ink-d1"}`}
                data-testid="next-booking-sentence"
                role="status"
                aria-live="polite"
              >
                {nextBookingSentence(next, openings.now)}
              </span>
              {door === "prominent" && (
                <button
                  type="button"
                  onClick={() => setTimesOpen(true)}
                  data-testid="times-door"
                  data-door="prominent"
                  className="shrink-0 min-h-11 rounded-xl border border-input bg-(--raised) shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) px-4 text-[14px] font-bold text-ink-d1 whitespace-nowrap hover:opacity-90 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring)"
                >
                  <CalendarClock size={16} className="text-(--eq-warn) shrink-0" aria-hidden="true" />
                  {TIMES_WITH_ROOM}
                </button>
              )}
              {door === "quiet" && (
                <button
                  type="button"
                  onClick={() => setTimesOpen(true)}
                  data-testid="times-door"
                  data-door="quiet"
                  className="shrink-0 min-h-11 px-2 rounded-md text-[14px] font-bold text-(--eq-live-text) whitespace-nowrap underline underline-offset-4 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring)"
                >
                  {TIMES_WITH_ROOM}
                </button>
              )}
            </div>

            {/* A note started during the session and never saved. Said
                plainly, above everything else on this card, because the
                trainer is about to walk the client out and this is the last
                moment it is still theirs to finish. */}
            {unsavedDraft && (
              <div
                className="flex flex-col gap-2 rounded-xl border border-(--eq-warn)/40 bg-(--eq-warn-fill) p-3"
                role="region"
                aria-label="Unsaved note from this session"
                data-testid="unsaved-draft"
              >
                <div className="flex items-center gap-2">
                  <MessageSquareText size={16} className="text-(--eq-warn) shrink-0" aria-hidden="true" />
                  <span className="text-[14px] font-bold text-ink-d1 break-words min-w-0" data-floor-draft={floorWords ? "" : undefined}>
                    {floorWords ? floorWords.title : "You started a note during the session and didn't save it"}
                  </span>
                </div>
                <textarea
                  className="w-full bg-(--well) border border-input shadow-(--elev-0) rounded-[10px] p-2.5 px-3 min-h-16 text-[14px] text-ink-d1 resize-none outline-none focus:border-(--eq-focus-ring) transition-colors"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  aria-label="Unsaved note"
                />
                <div className="flex gap-2">
                  {/* A save: solid brand blue, its own on-colour. */}
                  <button
                    type="button"
                    className="min-h-10 flex-1 rounded-xl bg-(--eq-live) text-(--eq-live-on) shadow-(--solid-lift) active:translate-y-px active:shadow-(--press) text-[14px] font-bold disabled:opacity-50 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring)"
                    disabled={draftBusy || !draftText.trim()}
                    onClick={async () => {
                      setDraftBusy(true);
                      try {
                        await onSaveDraft?.(draftText);
                      } finally {
                        setDraftBusy(false);
                      }
                    }}
                  >
                    {floorWords ? floorWords.button : "Save note"}
                  </button>
                  <button
                    type="button"
                    className="min-h-10 px-4 rounded-xl border border-input bg-(--raised) shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) text-ink-d2 text-[14px] font-bold disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring)"
                    disabled={draftBusy}
                    onClick={onDropDraft}
                  >
                    Drop it
                  </button>
                </div>
                <span className="text-[11px] text-ink-d3">
                  {floorWords ? floorWords.foot : "Left as it is, it is saved unfiled when you leave — nothing you wrote is lost."}
                </span>
              </div>
            )}

            <div className="text-[11px] text-ink-d3 font-semibold mt-1">Effort · profile note · Pulse</div>

            {/* The effort Dial (Oct 2 2026; it replaced the dose Dial) — one
                rating for the whole workout, the trainer's own judgement,
                saved as it is tapped. Neutral: no position is green or red.
                Untouched, it saves "As expected" on the way out. */}
            <div className="flex flex-col gap-2" data-testid="effort-card">
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-bold text-ink-d1">Effort</span>
                {effortSaved && effort !== null && (
                  <span className="text-[11px] text-(--eq-ok) font-bold flex items-center gap-1">
                    <Check size={12} strokeWidth={3} /> Saved
                  </span>
                )}
              </div>
              <Dial
                scale={EFFORT_SCALE}
                value={effort}
                onChange={pickEffort}
                ask={clientFirstName(client) ? `How hard did ${clientFirstName(client)} work today?` : EFFORT_SCALE.ask}
                sub="The whole workout, judged by you"
                data-testid="effort-dial"
              />
              {effort === null && (
                <span className="text-[11px] text-ink-d3" data-testid="effort-default-hint">
                  Left untouched, it saves As expected.
                </span>
              )}
            </div>

            <textarea
              className="w-full bg-(--well) border border-input shadow-(--elev-0) rounded-[10px] p-2.5 px-3 min-h-16 text-[14px] text-ink-d1 placeholder:text-ink-d3 placeholder:italic resize-none outline-none focus:border-(--eq-focus-ring) transition-colors"
              placeholder={`Profile note — anything for ${clientFirstName(client)}'s record. It files when you leave this screen.`}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNoteFiledHere(false);
              }}
              aria-label="Profile note"
            />
            {noteFiledHere && (
              <span className="text-[11px] text-(--eq-ok) font-bold flex items-center gap-1" role="status" data-testid="profile-note-filed">
                <Check size={12} strokeWidth={3} /> Profile note saved. Anything you type now is a new note.
              </span>
            )}
            {/* The Profile note is the one that goes only to the client's
                profile (voice-review round, Sep 27 2026): at Note it stays on the
                record and the next trainer's briefing never shows it. The
                note FOR the next trainer is the End Session box. Louder,
                Loudness's own hint says where it goes; at Note the generic
                hint ("found by its category") would be wrong for a note
                that is filed unfiled, so it says the plain fact instead. */}
            <div className="flex flex-col gap-2" data-testid="profile-note-loudness">
              <Loudness value={importance} onChange={setImportance} hint={importance !== "standard"} />
              {importance === "standard" && (
                <span className="text-[11px] text-ink-d3" data-testid="profile-note-hint">
                  Stays on {clientFirstName(client)}'s profile. The next trainer's briefing won't show it.
                </span>
              )}
              {importance !== "standard" && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[14px] font-bold text-ink-d2">Matters until (optional)</span>
                  <input
                    type="date"
                    className="w-full min-h-11 bg-(--well) border border-input shadow-(--elev-0) rounded-[10px] px-3 text-[14px] text-ink-d1 outline-none focus:border-(--eq-focus-ring) transition-colors"
                    value={effectiveUntil}
                    min={todayKey}
                    aria-label="Matters until"
                    onChange={(e) => setEffectiveUntil(e.target.value)}
                  />
                  <span className="text-[11px] text-ink-d3">After this it stops showing on the briefing.</span>
                </label>
              )}
            </div>

            {/* The doors are RAISED (type and depth, phase 8, Oct 4 2026; AJ's
                2A): a fill a hair lighter than the card, a contact lift and a
                white top light, on the 3:1 --input edge (they drew the
                decorative divider), and a press. The voice stays 14px bold. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowPulse(true)}
                className="min-h-11 rounded-xl border border-input bg-(--raised) shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) px-4 text-[14px] font-bold text-ink-d1 hover:opacity-90 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring)"
              >
                <HeartPulse className="w-4 h-4 text-(--eq-live)" />
                Update Pulse
              </button>
              {/* Always reachable while a package is on file ("there's not
                  really a good way to open it"); loud only when due. */}
              {renewal?.cycleKey && (
                <button
                  type="button"
                  onClick={() => setShowRenewal(true)}
                  className={`min-h-11 rounded-xl border px-4 py-2 text-[14px] font-bold hover:opacity-90 active:translate-y-px active:shadow-(--press) flex items-center justify-center gap-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring) ${
                    // A tint lifts without the top light; the raised door
                    // takes the lift and the top light.
                    renewalDue && !renewalLogged
                      ? "border-(--eq-hero)/50 bg-(--eq-hero-fill) text-ink-d1 shadow-(--elev-1)"
                      : "border-input bg-(--raised) text-ink-d1 shadow-(--raised-lift)"
                  }`}
                >
                  <MessageSquareText className={`w-4 h-4 shrink-0 ${renewalDue && !renewalLogged ? "text-(--eq-hero-text)" : "text-(--eq-live)"}`} />
                  {renewalLogged
                    ? "Renewal conversation saved ✓"
                    : renewalDue
                      ? promptText(renewal)
                      : "Renewal conversation"}
                </button>
              )}
            </div>
          </Card>

          {/* 3b · what they told you — see the header. Both silent when empty. */}
          {unfiledNotes.length > 0 && (
            <div className="wu-fade mx-5" style={{ "--wu-delay": "0.22s" } as React.CSSProperties}>
              <NoteSweep
                entries={unfiledNotes}
                machines={machines}
                clientFirstName={clientFirstName(client, "them")}
                onFile={fileUnfiledEntry}
                onDiscard={discardUnfiledEntry}
                isNextTrainerNote={(entry) => isNextTrainerNote(entry, nextTrainerMark)}
              />
            </div>
          )}
          {(fordUntagged.length > 0 || fordStatus === "failed") && (
            <div className="wu-fade mx-5" style={{ "--wu-delay": "0.24s" } as React.CSSProperties}>
              <FordSweep
                clientId={client.id}
                clientFirstName={clientFirstName(client, "them")}
                untagged={fordUntagged}
                sessionId={session.id ?? null}
                status={fordStatus}
              />
            </div>
          )}

          {/* 3c · packages — for a client with no package on file (the
                 consultation round, Sep 2026: packages are not decided in the
                 consultation, and this screen has the least to say about a
                 new client). Worked out without the studio's table first, so
                 a client with a package on file never costs a read of it. */}
          {preliminaryPackages.showDoor && (
            <PackagesCard
              client={client}
              hostedAtStudioId={session.hostedAtStudioId}
              coverage={coverage}
              today={todayKey}
              trainerFullName={authTrainer?.fullName ?? null}
              bookedWeekdays={bookedWeekdays(schedules, client.id)}
            />
          )}

          {/* 4 · lifetime — quiet, at the bottom, and only when it is hers.
                 These three run off Journey's own rollups, which start the day
                 Journey first saw her. For a migration client they are a small
                 number in front of somebody who has been coming for years, so
                 they are not drawn at all until her prior total is recorded
                 (canQuoteLifetime, lib/prior-history.ts). Today's numbers
                 above are unaffected: those really did happen today. */}
          {canQuoteLifetime(coverage) && (
          <div className="wu-fade mx-5 grid grid-cols-3 gap-2" style={{ "--wu-delay": "0.3s" } as React.CSSProperties}>
            {[
              { label: "Sessions", value: lifetime.sessions.toLocaleString() },
              { label: "Lifetime volume", value: `${fmtBig(lifetime.volume)} lb` },
              { label: "Lifetime reps", value: fmtBig(lifetime.reps) },
            ].map((t) => (
              <div key={t.label} className="rounded-xl border border-(--edge) bg-clip-padding bg-bg-dark-2 shadow-(--panel-lift) px-3 py-2">
                <div className="text-[12px] font-semibold text-ink-d3">{t.label}</div>
                <div className="font-mono text-[14px] font-bold text-ink-d2">{t.value}</div>
              </div>
            ))}
          </div>
          )}

          </>
          )}

          {/* leave */}
          <div className="mx-5 mt-2 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={leave}
              disabled={leaving}
              className="w-full min-h-[52px] rounded-2xl bg-(--raised) shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) border border-input text-ink-d1 text-[14px] font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring)"
            >
              <ArrowLeft size={16} />
              {leaving ? "Leaving…" : "Back to Hub"}
            </button>
            <span className="text-[11px] text-ink-d3">The session is saved. Anything you add here saves on its own.</span>
          </div>
        </div>
      </div>

      <LogConversationDialog
        open={showRenewal}
        onClose={() => setShowRenewal(false)}
        client={client}
        snapshot={renewal}
        trainer={authTrainer}
        onSaved={() => setRenewalLogged(true)}
      />

      <PulseQuickLogDialog
        open={showPulse}
        onClose={() => setShowPulse(false)}
        client={client}
        trainer={authTrainer}
        machines={machines}
      />

      {/* On top of this screen, never instead of it: the notes stay put. */}
      <TimesWithRoomSheet open={timesOpen} onClose={() => setTimesOpen(false)} data={openings} />
    </div>
  );
}

/**
 * The packages card: package information on the screen the trainer is
 * standing at with a client who has no package on file, and the door to the
 * full packages sheet. Prices sit on the card itself only for a client
 * Journey holds the whole story of (or a temporary profile); everyone else
 * gets the sentence and the door (features/packages/package-standing.ts).
 */
function PackagesCard({
  client,
  hostedAtStudioId,
  coverage,
  today,
  trainerFullName,
  bookedWeekdays: booked,
}: {
  client: Client;
  hostedAtStudioId: string | null | undefined;
  coverage: HistoryCoverage;
  today: string;
  trainerFullName: string | null;
  bookedWeekdays: number[];
}) {
  const door = usePackagesDoor({ client, hostedAtStudioId, coverage, today });
  const [open, setOpen] = useState(false);
  if (!door.standing.showDoor) return null;
  const failed = door.prices.status === "failed";
  return (
    <Card delay={0.26}>
      <div data-testid="packages-card" className="flex flex-col gap-3">
        <Kicker>{sheetTitle(door.studioName)}</Kicker>
        {door.standing.sentence && <p className="text-[14px] text-ink-d2">{door.standing.sentence}</p>}
        {door.rows && (
          <ul className="flex flex-col">
            {door.rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 border-b border-div-d last:border-b-0">
                <span className="text-[14px] font-semibold text-ink-d1 break-words">{r.name}</span>
                <span className="text-[12px] text-ink-d2 break-words">{r.price}</span>
              </li>
            ))}
          </ul>
        )}
        {door.standing.pricesOnScreen && failed && (
          <p className="text-[12px] text-ink-d3">
            {door.studioName ? `Couldn’t load ${door.studioName}’s prices.` : "Couldn’t load this studio’s prices."}
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-xl border border-input bg-(--raised) shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) px-4 text-[14px] font-bold text-ink-d1 hover:opacity-90 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring)"
        >
          {DOOR_BUTTON}
        </button>
      </div>
      <PackagesSheet
        open={open}
        onClose={() => setOpen(false)}
        studioId={door.studioId}
        studioName={door.studioName}
        clientFirstName={clientFirstName(client) || null}
        trainerFullName={trainerFullName}
        bookedWeekdays={booked}
      />
    </Card>
  );
}
