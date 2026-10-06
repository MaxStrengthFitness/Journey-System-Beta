import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  collection,
  query,
  where,
  limit,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { queryStudioIds } from "../lib/tenancy";
import { Client, Machine, Trainer, View, WorkoutSession } from "../types";
import { isFuzzyNameMatch } from "../lib/sync-utils";
import { bookingDay, isStaffBlock, loggedSessions } from "../lib/booking-state";
import { sessionsByClientDay } from "../lib/hub-card-state";
import { useHubCriticalNotes } from "../hooks/useHubCriticalNotes";
// Import the hook file directly, not the studio-tasks barrel (index.ts).
// ClientsView is in the initial bundle; pulling the barrel in here would drag
// the whole Studio Hub UI in with it and defeat AppContent's lazy import.
import { useStudioTasks } from "../features/studio-tasks/useStudioTasks";
import { dayTitle, pickDay, shownDay, stripFrom } from "../features/hub-schedule/hub-day";
import { UNASSIGNED_ID, orderColumnsBySessions, planColumns, staffLabel } from "../features/hub-schedule/columns";
import { staffIdsAt } from "../features/standing-week/check";
import type { DayReadState } from "../lib/schedule-window";
import {
  zonedHM,
  studioDayBoundsForKey,
  studioDateKey,
  studioTodayKey,
} from "../lib/studio-time";
import { safeToDate, getMillis } from "../lib/utils";

import { openProfileAt } from "../features/client-profile/profile-nav";
import { useLeaveGuard } from "../features/unsaved-changes";
import { LoadBoundary } from "../features/new-version/LoadBoundary";
import { LoadingArea } from "./LoadingMark";
import type { HubLayer } from "../features/hub-opportunities/LayerSwitch";
import { useDayMoments } from "../features/hub-opportunities/use-day-moments";
import { useHubFord } from "../features/hub-opportunities/use-hub-ford";
import { useHubMarks } from "../features/hub-opportunities/use-hub-marks";
import { markNoShow, takeBackNoShow, useBookingMarks } from "../features/admin/attention/booking-marks";
import { canManageRenewals } from "../features/renewals/permissions";
import { mayTakeBackLateCancel } from "../lib/late-cancels";
import { HubCard, cardTime } from "../features/hub-schedule/HubCard";
import { usePhone } from "../features/phone/device";
import { PhoneDayList } from "../features/phone/PhoneDayList";
import { HubGrid, HubNotice, NOBODY_BOOKED, type GridBlock, type GridColumn } from "../features/hub-schedule/HubGrid";
import { trainerDayFrame, weeksByTrainer } from "../features/hub-schedule/off-hours";
import type { Span } from "../features/hub-schedule/grid-model";
import { useStandingWeeks } from "../features/standing-week/useStandingWeeks";
import { mayReadWeeks } from "../features/standing-week/present";
import { weekdayOf } from "../features/client-history/model";
import { DayHeader, DaySummary, KeySheet } from "../features/hub-schedule/DayHeader";
import { Peek } from "../features/hub-schedule/Peek";
import { countsByDay, spotWords, stripDays, summaryChips } from "../features/hub-schedule/day-summary";
import { hasFamily, type FilterId, type MomentFamily } from "../features/hub-opportunities/moments-today";
import { rememberMyStudioSection } from "../features/my-studio/section-memory";
import { bookingSessionNumber, cardMarks, cardRestWords, isNewToJourney, usualServiceOf } from "../features/hub-schedule/card-marks";
import { yourDay } from "../features/hub-schedule/your-day";
import { nextHalfHour, stripOpen } from "../features/hub-schedule/next-half-hour";
import { NextStrip, type NextStripItem } from "../features/hub-schedule/NextStrip";
import { focusColumnId, readFocus, writeFocus, type HubFocus } from "../features/hub-schedule/focus";
import { hubCardState } from "../lib/hub-card-state";
import { peekState } from "../features/hub-schedule/peek-model";
import { trainerLookup } from "../features/client-history/trainers";
import type { HistorySession } from "../features/client-history/model";
import { clientDisplayName } from "../lib/client-name";
import { myTrainerIds } from "../lib/live-session";
import { useDirectoryContext } from "../features/client-directory/use-directory-context";
import { buildDirectoryRows } from "../features/client-directory/row";
import { buildNameIndex, searchNames, type MatchTier } from "../features/client-directory/search";
import { SearchResults } from "../features/client-directory/SearchResults";
import { hubWindow, inHubWindow } from "../features/hub-schedule/hub-window";
import { useCompletedSessions } from "../lib/completed-sessions";

/*
 * THE OPPORTUNITIES LAYER (Sep 27 2026): fetched the first time it is
 * opened, so the Hub's own bundle stays as it was. Inside a LoadBoundary
 * (lazy-screens.test.ts): a deploy that removed its file replaces only the
 * layer, and recovers on the Hub, where a reload is allowed.
 */
const RunSheet = React.lazy(() => import("../features/hub-opportunities/RunSheet"));

/*
 * EDIT SESSION (hub fixes, Oct 1 2026; AJ: "switching 'start session' to
 * 'edit session'"): the Activity Archive's OWN session pop-up, fetched the
 * first time it is opened — never a second editor. Inside a LoadBoundary
 * (lazy-screens.test.ts).
 */
const SessionDetailDialog = React.lazy(() =>
  import("../features/client-history/SessionDetailDialog").then((m) => ({ default: m.SessionDetailDialog })),
);

/** One empty list, so a missing schedule doesn't look new on every render. */
const NO_SCHEDULES: any[] = [];
const NO_MACHINES: Machine[] = [];
const NO_STUDIOS: ReadonlyArray<{ id?: string; journeyCutoverDate?: string | null }> = [];
/** The Directory's own order for a name match: exact, then by first name, last name, a nickname, close. */
const MATCH_ORDER: MatchTier[] = ["exact", "first-prefix", "last-prefix", "alias", "close"];

export function ClientsView({
  clients,
  sortedTrainers,
  activeStudioId,
  onSelectClient,
  setView,
  schedules,
  sessions,
  sessionsKnown = false,
  authTrainer,
  searchTerm,
  rosterLoading = false,
  rosterFailed = false,
  scheduleDayState,
  onRetrySchedule,
  cutoverStudios,
  machines = NO_MACHINES,
  schedulesFetchedAt = null,
}: {
  /** When the held bookings were last read (useLiveSchedule's lastFetchedAt): the search rows' "Next" says so, as the Directory's does. */
  schedulesFetchedAt?: number | null;
  /** The studio's machines, for Edit session's pop-up (the Activity Archive's own). */
  machines?: Machine[];
  clients: Client[];
  trainers: Trainer[];
  sortedTrainers: Trainer[];
  isAdmin: boolean;
  activeStudioId: string;
  authTrainer: Trainer | null;
  onSelectClient: (id: string) => void;
  setView: (v: View) => void;
  schedules: any[];
  sessions: WorkoutSession[];
  /**
   * The session stream has answered for this studio. Until it has (or after
   * it failed) a finished card says nothing, rather than "Not logged".
   */
  sessionsKnown?: boolean;
  onSelectTrainer?: (id: string) => void;
  /** Search term owned by the app shell (the input lives in the header). */
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  /**
   * The studio's clients are still loading (a studio switch, an app open).
   * Blocks whose client isn't in hand yet say "loading" instead of
   * "Not synced" for that beat.
   */
  rosterLoading?: boolean;
  /**
   * The studio's client list couldn't be read (useStudioRoster's "error";
   * hub fixes, Oct 1 2026). A booking whose client isn't in hand is then
   * unknown: no card says "Not synced yet" about a list nobody read.
   */
  rosterFailed?: boolean;
  /**
   * What is known about a studio day's bookings (useLiveSchedule's dayState):
   * the Hub says a day is quiet only when it was read, and says so in place
   * when the read failed (hub fixes, Oct 1 2026). Absent: read.
   */
  scheduleDayState?: (dayKey: string) => DayReadState;
  /** "Try again" on a failed read (useLiveSchedule's retry). */
  onRetrySchedule?: () => void;
  /**
   * Every studio's cutover day. Each card reads its CLIENT'S home studio's
   * (homeCutoverOf) - a client cross-training here is judged by when her own
   * studio moved onto Journey, not this one.
   */
  cutoverStudios?: ReadonlyArray<{ id?: string; journeyCutoverDate?: string | null; mindbodySiteId?: string | number | null }>;
}) {
  // The card's Past sessions button hands off to the profile only once the
  // move is agreed (see there).
  const guardLeave = useLeaveGuard();
  const [dbSearchResults, setDbSearchResults] = useState<Client[]>([]);
  const [isSearchingDb, setIsSearchingDb] = useState(false);

  /**
   * THE DAY ON SCREEN (hub fixes, Oct 1 2026): null follows today, so the
   * Hub rolls over at the studio's midnight; a studio day key is a day the
   * trainer picked on purpose and keeps (features/hub-schedule/hub-day.ts).
   */
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  /** Schedule (the grid, unchanged) or Opportunities (the run-sheet). Always opens on Schedule. */
  const [layer, setLayer] = useState<HubLayer>("schedule");
  /** The Key sheet (both layers). */
  const [keyOpen, setKeyOpen] = useState(false);
  /** The family lit on the grid, for the day it was lit on. */
  const [spot, setSpot] = useState<{ day: string; family: MomentFamily; next: number } | null>(null);
  /** "See them as a list": the family the Opportunities list opens on. */
  const [listRequest, setListRequest] = useState<{ filter: FilterId; nonce: number } | null>(null);
  /** The card whose peek is open (a tap on a card: Hub question 1's default). */
  const [peek, setPeek] = useState<{ clientId: string; blockKey: string; day: string; anchor: HTMLElement | null } | null>(null);
  /** On a phone only: Me (your own bookings) or Everyone; remembered on this device. The iPad has no switch since Oct 3 2026. */
  const [focus, setFocus] = useState<HubFocus>(() => readFocus());
  /* A phone draws the day as a list (Journey Lite, features/phone). */
  const isPhone = usePhone();
  /** A trainer's column head was tapped: Opportunities shows their bookings, for the day it was tapped on. */
  const [trainerList, setTrainerList] = useState<{ columnId: string; day: string } | null>(null);
  /** Edit session from the peek: the day's logged session, in the Activity Archive's own pop-up. */
  const [editing, setEditing] = useState<{ key: number; clientId: string; homeStudioId?: string; session: HistorySession } | null>(null);
  /* Late cancel · session taken from the peek (Oct 2 2026): the booking being
     written, and a refusal said in words, keyed by the booking. */
  const [lateBusy, setLateBusy] = useState<string | null>(null);
  const [lateError, setLateError] = useState<{ bookingId: string; text: string } | null>(null);
  const trainerFor = React.useMemo(() => trainerLookup(sortedTrainers), [sortedTrainers]);

  /*
   * The Hub's minute clock. It also ticks the moment Journey comes back on
   * screen: an iPad asleep overnight runs no timers, and its first minute
   * awake would otherwise still say yesterday (hub fixes, Oct 1 2026).
   */
  useEffect(() => {
    const tick = () => setCurrentTime(new Date());
    const timer = setInterval(tick, 60000);
    const onVisible = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, []);

  /** Today is the studio's Eastern day, from the minute clock; the day on screen follows it unless one was picked. */
  const studioToday = studioTodayKey(currentTime);
  const selectedKey = shownDay(pickedDay, studioToday);

  /*
   * THE HUB'S OWN BOOKINGS (speed round, Oct 5 2026, R6;
   * features/hub-schedule/hub-window.ts): yesterday to a week from today,
   * and the day on screen. The app's schedule holds every range the Calendar
   * has shown too, and the Hub used to work its day out over all of it.
   * Kept until the studio's day or the schedule changes.
   */
  const hubDays = hubWindow(studioToday, selectedKey);
  const hubSchedules = React.useMemo(
    () => inHubWindow(schedules || NO_SCHEDULES, { from: hubDays.from, to: hubDays.to }),
    [schedules, hubDays.from, hubDays.to],
  );
  /** Only the FINISHED sessions, steady while a running session's heartbeat lands (lib/completed-sessions). */
  const completedSessions = useCompletedSessions(sessions);

  // Sync / search database in real-time when trainer searches on main screen
  useEffect(() => {
    if (!searchTerm.trim()) {
      setDbSearchResults([]);
      return;
    }
    const fetchClients = async () => {
      setIsSearchingDb(true);
      try {
        const term = searchTerm.trim().toLowerCase();
        const alphaOnly = term.replace(/[^a-z]/g, "");
        const prefixLen = alphaOnly.length > 3 ? 3 : alphaOnly.length;
        const prefix = alphaOnly.slice(0, prefixLen);
        const prefixCapitalized =
          prefix.charAt(0).toUpperCase() + prefix.slice(1);

        if (!prefixCapitalized) {
          setDbSearchResults([]);
          return;
        }

        /*
         * SCOPED BY STUDIO (tenancy pass, Sep 2026).
         *
         * `clients` used to be `allow read: if isAuthenticated()`, and this
         * query used to run with no studio constraint at all — which is how a
         * trainer at one location could search every client in the platform.
         * The rule is now per-document, and Firestore rejects a whole query
         * that could return a document failing it, so the studios have to be
         * named here. See src/lib/tenancy.ts.
         */
        const studioIds = queryStudioIds(authTrainer, activeStudioId);
        if (studioIds.length === 0) {
          setDbSearchResults([]);
          return;
        }

        const clientsRef = collection(db, "clients");
        const q1 = query(
          clientsRef,
          where("homeStudioId", "in", studioIds),
          where("firstName", ">=", prefixCapitalized),
          where("firstName", "<=", prefixCapitalized + "\uf8ff"),
          limit(30),
        );
        const q2 = query(
          clientsRef,
          where("homeStudioId", "in", studioIds),
          where("lastName", ">=", prefixCapitalized),
          where("lastName", "<=", prefixCapitalized + "\uf8ff"),
          limit(30),
        );

        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const uniqueDocs = new Map<string, any>();
        [...snap1.docs, ...snap2.docs].forEach((d) => {
          uniqueDocs.set(d.id, { id: d.id, ...d.data() });
        });

        const candidates = Array.from(uniqueDocs.values());
        const fetched = candidates.filter((c) => {
          const first = (c.firstName || "").toLowerCase();
          const last = (c.lastName || "").toLowerCase();
          const full = `${first} ${last}`;
          const mb = (c.mindbody_name || "").toLowerCase();

          return (
            first.includes(term) ||
            last.includes(term) ||
            full.includes(term) ||
            mb.includes(term) ||
            term.includes(first) ||
            term.includes(last) ||
            isFuzzyNameMatch(
              term,
              c.firstName || "",
              c.lastName || "",
              c.mindbody_name,
            )
          );
        });

        setDbSearchResults(fetched);
      } catch (err) {
        console.error("Error searching matching clients in main search:", err);
      } finally {
        setIsSearchingDb(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchClients();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
    // The studio is a dependency too: a search left typed while switching
    // into or out of Demo Mode must ask again, in the new realm.
  }, [searchTerm, activeStudioId, authTrainer?.id]);

  /*
   * THE SEARCH'S ROWS (hub fixes, Oct 1 2026): the Client Directory's own row
   * model and name matcher over the studio list and the names Firestore
   * found, from the Directory's own context — so Last in · Next · Left say
   * here exactly what they say on the Directory and the profile. The old
   * cards read only the last day's sessions ("Previous session: No history"
   * for a client with 54).
   */
  const searchMyIds = React.useMemo(() => myTrainerIds(authTrainer, auth.currentUser?.uid ?? null), [authTrainer]);
  const searching = searchTerm.trim().length > 0;
  /*
   * Worked out only while something is typed (speed round, Oct 5 2026, R6):
   * it groups every held booking by client, and it used to do that every
   * minute and on every session write with nobody searching. The Directory's
   * own bookings (all of them, as the Directory reads them) and only the
   * finished sessions, which are all its rows read.
   */
  const { ctx: directoryCtx } = useDirectoryContext({
    now: currentTime,
    today: studioToday,
    studios: cutoverStudios ?? NO_STUDIOS,
    activeStudioId: activeStudioId || null,
    schedules: searching ? schedules ?? null : null,
    schedulesFetchedAt,
    sessions: searching ? completedSessions : null,
    sessionsKnown,
    myIds: searchMyIds,
    myName: authTrainer?.fullName ?? null,
    trainers: sortedTrainers,
  });
  const searchPool = React.useMemo(
    () => (searching ? Array.from(new Map([...clients, ...dbSearchResults].filter((c) => c.id).map((c) => [c.id as string, c])).values()) : []),
    [searching, clients, dbSearchResults],
  );
  const searchAllRows = React.useMemo(() => (searching ? buildDirectoryRows(searchPool, directoryCtx) : []), [searching, searchPool, directoryCtx]);
  const searchResult = React.useMemo(
    () =>
      searchNames(
        buildNameIndex(searchAllRows.map((r) => ({ id: r.id, first: r.name.first, nickname: r.name.nickname, last: r.name.last }))),
        searchTerm,
      ),
    [searchAllRows, searchTerm],
  );
  const searchMatches = searchResult.matches;
  const searchRows = React.useMemo(
    () =>
      searchAllRows
        .filter((r) => searchMatches.has(r.id))
        .sort(
          (a, b) =>
            MATCH_ORDER.indexOf(searchMatches.get(a.id)!.tier) - MATCH_ORDER.indexOf(searchMatches.get(b.id)!.tier) ||
            a.name.display.localeCompare(b.name.display),
        ),
    [searchAllRows, searchMatches],
  );

  /**
   * Your own column: by your trainer id only (hub fixes, Oct 1 2026). It
   * used to fall back to the full name, so a colleague with your name could
   * take "You".
   */
  const isSelfTrainer = (t: { id?: string }): boolean =>
    !!authTrainer?.id && !!t.id && String(t.id) === String(authTrainer.id);

  /** Minutes since the studio's midnight: where a booking sits on the grid. */
  const studioMinutes = (date: Date): number => {
    const hm = zonedHM(date);
    return hm ? hm.hour * 60 + hm.minute : 0;
  };

  // Sessions for the selected day, bounded by the STUDIO's midnight. Using the
  // viewer's midnight here while reading hours in studio time selected a window
  // offset from the studio's day, which scattered a normal 7am-8pm schedule
  // across every hour from 12 AM to 11:30 PM.
  const { start: dateStart, end: dateEnd } = studioDayBoundsForKey(selectedKey);

  const todaysSchedules = hubSchedules
    .filter((s) => {
      const date = safeToDate(s.startTime || s.StartDateTime || s.date);
      if (!date) return false;
      return date >= dateStart && date <= dateEnd && s.status !== "Cancelled";
    })
    .sort(
      (a, b) =>
        getMillis(a.startTime || a.StartDateTime || a.date) -
        getMillis(b.startTime || b.StartDateTime || b.date),
    );

  /*
   * WHAT IS KNOWN ABOUT THE DAY (hub fixes, Oct 1 2026): a failed read is
   * unknown, never a quiet day. The grid says "Nobody is booked" only when
   * the day was read; while it loads it says so; when the read failed, a
   * line above the grid says so in place, with Try again.
   */
  const bookingsRead: DayReadState = scheduleDayState ? scheduleDayState(selectedKey) : "ready";

  const preBookedCount = todaysSchedules.filter(
    (s) => !s.clientName?.toLowerCase().includes("unavailab"),
  ).length;

  /**
   * Day carousel: today plus the next six days. Fifteen days needed a
   * horizontal scroll of its own and pushed the schedule down the screen;
   * seven fit without scrolling, which is what frees the row beside them for
   * the day's numbers. Anything further out is the Calendar tab's job.
   * Built from the studio's today on every render (hub fixes, Oct 1 2026):
   * it used to be built once, from the iPad's midnight, at mount.
   */
  const stripKeys = stripFrom(studioToday);

  /**
   * STRICT resolution: a schedule block resolves to `clients/{mindbodyClientId}`
   * or to nothing.
   *
   * This used to fuzzy-match on the client's NAME — first the trainer's home
   * studio, then globally, then by copying a link from any past schedule row
   * with the same name. All three are gone. Under strict mode the schedule's
   * clientId IS the canonical document id, so a name match can only ever
   * disagree with it, and disagreeing means opening the wrong person's medical
   * record from the grid.
   *
   * A block that does not resolve stays greyed out as "Not synced" until the
   * next sync creates the client document. There is deliberately no manual
   * fallback: creating a profile by hand here is what produced duplicate
   * documents outside the canonical path.
   */
  const findClientForSession = (session: any): Client | null => {
    if (!session?.clientId) return null;
    const target = String(session.clientId).trim();
    if (!target) return null;
    return clients.find((c) => c.id && String(c.id).trim() === target) || null;
  };

  /*
   * What each card checks its booking against, built once per stream update
   * rather than per card: the app's live 24-hour session stream, indexed by
   * client and STUDIO day. The card used to match "today" with the iPad's
   * `toDateString()`, which is the wrong day on an iPad set to another zone,
   * and matched TODAY rather than the booking's day, so a session this
   * morning marked tomorrow's card. `logged` is null until the stream has
   * answered: unknown, never "nothing logged" (lib/booking-state).
   */
  const workoutSessionOn = React.useMemo(() => sessionsByClientDay(sessions), [sessions]);
  // Only finished sessions count as logged: a heartbeat leaves this as it was (R6).
  const logged = React.useMemo(
    () => loggedSessions(sessionsKnown ? completedSessions : null),
    [completedSessions, sessionsKnown],
  );

  /*
   * The day's Critical notes (question 12, AJ Sep 24 2026): ONE live read for
   * every client booked on the day on screen, thirty clients to a query —
   * never a read per card, and never a count kept on the client. Each card
   * decides which of its client's notes matter on its own day
   * (lib/hub-critical-notes). `notesFor` is null for a client whose notes are
   * unknown, and that card then claims nothing either way.
   *
   * By the BOOKINGS' own client ids (speed round, Oct 5 2026, R8): under
   * strict resolution a booking's clientId IS the client's document id (see
   * findClientForSession above; lib/mindbody-api-sync writes it), so the read
   * starts with the bookings instead of waiting for the client list, and the
   * triangles arrive with the cards. It used to ask only for the clients the
   * roster already held, so it opened late and opened again as each visiting
   * client landed. A booking whose client has no profile yet costs one id in
   * the read and draws no card mark.
   */
  const criticalNotes = useHubCriticalNotes(
    todaysSchedules.filter((s) => !isStaffBlock(s)).map((s) => (s.clientId ? String(s.clientId).trim() : null)),
  );

  /*
   * Who may read the studio's own records here: the people who work at it,
   * franchise owners and administrators — the app's one mirror of the rules'
   * writesForStudio (standing-week/present.ts). The standing weeks, the
   * FORD details and the nightly marks below are each read only for them,
   * so no read the rules refuse is ever opened.
   */
  const readsStudio = mayReadWeeks(authTrainer, activeStudioId);

  /*
   * GET TO KNOW (wave 2 hub, Sep 28 2026; AJ: "all yes"): the studio's FORD,
   * ONE collection group read once per studio visit (use-hub-ford.ts), for
   * every day on the strip. The engine asks each booked client's details
   * about her booking's day; FORD's words stay off the grid.
   */
  const hubFord = useHubFord(readsStudio ? activeStudioId : null, studioToday);

  /*
   * ALL STARS (wave 2 hub; AJ's Hub question 6): the nightly renewals job's
   * word, one document read once per studio visit (use-hub-marks.ts). The
   * iPad never counts 26 weeks; missing, stale (three days) or unreadable
   * marks say nothing.
   */
  const hubMarks = useHubMarks(readsStudio ? activeStudioId : null, studioToday, currentTime);

  /*
   * "DIDN'T COME" (Operations room, wave 3, Sep 29 2026): a leader's mark on
   * a booking nobody logged (studios/{s}/bookingMarks, read by
   * lib/booking-state as a no-show). ONE listener — never per card, never
   * per client. Unread or refused, the marks are null and a finished slot
   * reads as it did before the mark.
   *
   * For the Hub's whole window, yesterday to a week on and the day on
   * screen (speed round, Oct 5 2026, R8; hub-window.ts): a mark is found by
   * its booking's id, so one read serves every day on the strip, and a day
   * tap no longer closes the listener, forgets the marks and opens another
   * (a marked card blinked back to "Not logged" on the way back to today).
   * It moves only at the studio's midnight. The read stays on the (day,
   * clientId) index, and the rules let anyone who works at the studio read
   * the marks.
   */
  const bookingMarks = useBookingMarks(readsStudio ? activeStudioId : null, hubDays.from, hubDays.to);

  /*
   * THE DAY'S MOMENTS (calm Hub round, Sep 28 2026): every client booked on
   * the day on screen, worked out ONCE by the same engine the Opportunities
   * list reads (features/hub-opportunities). The cards, their marks and the
   * list can never disagree. No read per card.
   */
  const dayMoments = useDayMoments({
    day: selectedKey,
    now: currentTime,
    schedules: hubSchedules,
    clients,
    sessions,
    sessionsKnown,
    marks: bookingMarks.marks,
    studios: cutoverStudios,
    activeStudioId,
    authTrainer,
    uid: auth.currentUser?.uid ?? null,
    trainers: sortedTrainers,
    criticalFor: criticalNotes.notesFor,
    fordFor: hubFord.fordFor,
    allStarOf: hubMarks.allStarOf,
  });

  /** The day's usual service: a card names its own only when it isn't this one. */
  const usualService = React.useMemo(() => usualServiceOf(todaysSchedules), [todaysSchedules]);

  /*
   * THE COLUMNS (hub fixes, Oct 1 2026; features/hub-schedule/columns.ts).
   * A booking finds its column by the trainer id, or by the Mindbody staff
   * id at this studio's site — never by a name, so two Chrises never swap.
   * A booking with no trainer the Hub knows (a blank or placeholder staff
   * name, the studio rotation, a staff member Journey couldn't link) goes in
   * Unassigned, the last column: nothing counted is ever drawn nowhere.
   */
  const siteId = (cutoverStudios ?? []).find((s) => s.id === activeStudioId)?.mindbodySiteId ?? null;
  const staffIds = React.useMemo(() => staffIdsAt(sortedTrainers as any, siteId), [sortedTrainers, siteId]);
  const columnPlan = React.useMemo(
    () =>
      planColumns({
        trainers: sortedTrainers,
        bookings: todaysSchedules,
        studioId: activeStudioId || null,
        staffIds,
        selfId: authTrainer?.id ?? null,
      }),
    [sortedTrainers, todaysSchedules, activeStudioId, staffIds, authTrainer?.id],
  );
  const visibleTrainersList = columnPlan.trainers;

  /*
   * THE GRID (calm Hub round, Sep 28 2026): features/hub-schedule/HubGrid.
   * Each booking goes in ONE column (above), at its own start and end in
   * studio minutes: real lengths, so a 45-minute consult is drawn as 45
   * minutes.
   */
  const gridDayKey = selectedKey;
  const gridBlocks: GridBlock[] = [];
  todaysSchedules.forEach((s, i) => {
    const columnId = columnPlan.columnOf[i];
    if (columnId === null) return;
    const start = safeToDate(s.startTime || s.StartDateTime || s.date);
    if (!start) return;
    const end = safeToDate(s.endTime || s.EndDateTime);
    const from = studioMinutes(start);
    let to = end ? studioMinutes(end) : from + 30;
    if (to <= from) to = from + 30;
    gridBlocks.push({
      key: String(s.id || s.mindbodyAppointmentId || `${columnId}-${from}-${i}`),
      columnId,
      span: { from, to },
      booking: s,
    });
  });
  const gridNowMin = gridDayKey === studioDateKey(currentTime) ? studioMinutes(currentTime) : null;
  /*
   * YOUR OWN COLUMN, IN WORDS (hub cherry round, Sep 28 2026; Hub direction
   * B's focus column): your column takes more of the spare room, its head
   * says your day in words, and its cards say every mark they may say out
   * loud. Only when you have a column on the day on screen.
   *
   * The iPad's Focus switch (My day | Everyone) went on Oct 3 2026 (AJ:
   * "this is useless now with our auto filter, remove it"): the columns run
   * yours first, then everyone with sessions, so your column is always the
   * focus. On a phone the switch stays, because there it decides whether the
   * list is your bookings or everyone's (features/hub-schedule/focus.ts).
   */
  const myColumn = visibleTrainersList.find((t) => isSelfTrainer(t));
  const myColumnId = myColumn ? String(myColumn.id) : null;
  const focusId = isPhone ? focusColumnId(focus, myColumnId) : myColumnId;
  // The name they go by, whole (research-hub §6.0), never cut; the full name
  // when two columns would otherwise read alike (two Chrises, Oct 1 2026).
  const shortName = (t: Trainer) => ((t as any).nickname || "").trim() || (t.fullName || "").trim().split(" ")[0] || "Trainer";
  const shortNames = visibleTrainersList.map(shortName);
  const plannedColumns: GridColumn[] = visibleTrainersList.map((t, i) => {
    const id = String(t.id);
    const own = gridBlocks.filter((b) => b.columnId === id && !isStaffBlock(b.booking as any));
    const alike = shortNames.filter((n) => n.toLowerCase() === shortNames[i].toLowerCase()).length > 1;
    return {
      id,
      name: alike ? (t.fullName || "").trim() || shortNames[i] : shortNames[i],
      initials: ((t as any).initials || t.fullName || "??").substring(0, 2).toUpperCase(),
      isMe: isSelfTrainer(t),
      count: own.length,
      detail: id === focusId ? yourDay({ spans: own.map((b) => b.span), nowMin: gridNowMin }) : null,
    };
  });
  if (columnPlan.unassigned > 0) {
    plannedColumns.push({
      id: UNASSIGNED_ID,
      name: "Unassigned",
      initials: "?",
      isMe: false,
      count: gridBlocks.filter((b) => b.columnId === UNASSIGNED_ID && !isStaffBlock(b.booking as any)).length,
      detail: null,
    });
  }
  // The day's sessions first: yours when you have some, then every column
  // with sessions, Unassigned included, then the empty ones (Oct 3 2026).
  const gridColumns = orderColumnsBySessions(plannedColumns);

  /*
   * Who's on (AJ's Mindbody screenshots, Keep: "who's working, at a
   * glance"): the AGREED standing weeks, one read of the studio's, hatch the
   * hours a trainer isn't on and a day away. No agreed week, or no answer,
   * hatches nothing (off-hours.ts). Read only by someone Openings would let
   * read them (mayReadWeeks, the one rule), so no refused listener is opened.
   */
  const standingWeeks = useStandingWeeks(readsStudio ? activeStudioId : null);
  const weeks = React.useMemo(() => weeksByTrainer(standingWeeks.docs), [standingWeeks.docs]);
  const gridWeekday = weekdayOf(gridDayKey);
  const frameOf = React.useCallback(
    (columnId: string, range: Span) => trainerDayFrame(weeks.get(columnId), gridDayKey, gridWeekday, range),
    [weeks, gridDayKey, gridWeekday],
  );

  /** Her newest Journey session on the booking's studio day, if one exists. */
  const workoutSessionFor = (session: any, clientObj: Client | null) =>
    clientObj
      ? workoutSessionOn(
          clientObj.id,
          bookingDay({ startTime: session.startTime || session.StartDateTime || session.date, status: session.status }),
        )
      : null;

  const renderCard = (block: GridBlock) => {
    const session: any = block.booking;
    const clientObj = isStaffBlock(session) ? null : findClientForSession(session);
    const workoutSession = workoutSessionFor(session, clientObj);
    const entry = clientObj?.id ? dayMoments.byClientId.get(clientObj.id) ?? null : null;
    return (
      <HubCard
        booking={session}
        client={clientObj}
        entry={entry}
        sessionNumber={bookingSessionNumber(entry, clientObj, session, dayMoments.input)}
        newToJourney={isNewToJourney(entry, clientObj)}
        usualService={usualService}
        dimmed={activeSpot !== null && !(entry && hasFamily(entry, activeSpot))}
        wordy={focusId !== null && block.columnId === focusId}
        rosterLoading={rosterLoading}
        rosterFailed={rosterFailed}
        staffName={block.columnId === UNASSIGNED_ID ? staffLabel(session.trainerName) : null}
        workoutSession={workoutSession}
        logged={logged}
        noShows={bookingMarks.marks}
        now={currentTime}
        open={activePeek?.blockKey === block.key}
        onOpen={(clientId, anchor) => setPeek({ clientId, blockKey: block.key, day: gridDayKey, anchor })}
      />
    );
  };

  /* ------------------------------------------------------------------ *
   * The day at a glance.
   *
   * Four numbers, read left to right as a sentence: how much is booked,
   * how much is done, what else is owed, and what room is left. They sit
   * in the strip beside the day carousel rather than in a band of their
   * own — condensing the carousel to seven days freed the width, and the
   * schedule keeps every vertical pixel it had.
   * ------------------------------------------------------------------ */

  /** Open task rows for the SELECTED day, studio list + this trainer's own. */
  const { counts: taskCounts, loading: tasksLoading } = useStudioTasks(activeStudioId || null, {
    ownerId: auth.currentUser?.uid ?? null,
    dateKey: selectedKey,
  });
  const openTaskCount = tasksLoading ? null : Math.max(0, taskCounts.total - taskCounts.done);

  /*
   * THE TOP (calm Hub round, Sep 28 2026; AJ: the top bar "is very jumbled").
   * The week with each day's count and a dot for a day to celebrate, then on
   * Schedule the day in words and the list's own chips (six since Get to
   * know, wave 2 hub; a zero is never drawn). features/hub-schedule.
   */
  const stripKeysKey = stripKeys.join("|");
  const todayKey = studioToday;
  const bookingCounts = React.useMemo(() => countsByDay(hubSchedules), [hubSchedules]);
  // The engine's own answer, asked cheaply (celebratesOn), not seven days of entries a minute (R6).
  const celebrateDays = React.useMemo(() => {
    const out = new Set<string>();
    for (const key of stripKeysKey.split("|")) if (dayMoments.celebratesOn(key)) out.add(key);
    return out;
  }, [dayMoments.celebratesOn, stripKeysKey]);
  const strip = stripDays(stripKeys, todayKey, bookingCounts, (key) => celebrateDays.has(key));
  const chips = summaryChips(dayMoments.entries);
  const activeSpot = layer === "schedule" && spot && spot.day === gridDayKey ? spot.family : null;
  /* The peek belongs to the day and the layer it was opened on. */
  const activePeek = layer === "schedule" && peek && peek.day === gridDayKey ? peek : null;
  const spotKeys = activeSpot
    ? gridBlocks
        .filter((b) => {
          const c = isStaffBlock(b.booking as any) ? null : findClientForSession(b.booking);
          const e = c?.id ? dayMoments.byClientId.get(c.id) : undefined;
          return !!e && hasFamily(e, activeSpot);
        })
        .sort((x, y) => x.span.from - y.span.from)
        .map((b) => b.key)
    : [];
  const showNextSpot = () => {
    if (!spot || spotKeys.length === 0) return;
    const key = spotKeys[spot.next % spotKeys.length];
    setSpot({ ...spot, next: spot.next + 1 });
    const el = Array.from(document.querySelectorAll<HTMLElement>(".hs-slot, .ph-day__row")).find((s) => s.dataset.blockKey === key);
    el?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  };

  /*
   * THE NEXT 30 MINUTES (hub cherry round, Sep 28 2026; Hub direction B):
   * who is due across the floor, one quiet row under the top, on today only
   * and only while the studio's day runs (next-half-hour.ts). Each booking's
   * state is the card's own, so a session that is over is never on it.
   */
  const clientBlocks = gridBlocks.filter((b) => !isStaffBlock(b.booking as any));
  const nextOpen = layer === "schedule" && gridNowMin !== null && stripOpen(clientBlocks.map((b) => b.span), gridNowMin);
  const nextItems: NextStripItem[] = nextOpen
    ? nextHalfHour(
        clientBlocks.map((b) => {
          const session: any = b.booking;
          const clientObj = findClientForSession(session);
          const workoutSession = workoutSessionFor(session, clientObj);
          const state = hubCardState(
            { id: session.id ?? null, clientId: clientObj?.id ?? session.clientId ?? null, startTime: session.startTime || session.StartDateTime || session.date, endTime: session.endTime || session.EndDateTime, status: session.status },
            logged,
            currentTime,
            { session: workoutSession, marks: bookingMarks.marks },
          );
          return { item: { block: b, clientObj }, span: b.span, state, mine: b.columnId === myColumnId, order: gridColumns.findIndex((c) => c.id === b.columnId) };
        }),
        gridNowMin as number,
      ).map(({ item, when }) => {
        const { block, clientObj } = item;
        const session: any = block.booking;
        const entry = clientObj?.id ? dayMoments.byClientId.get(clientObj.id) ?? null : null;
        const mine = block.columnId === myColumnId;
        const marks = cardMarks(clientObj ? entry?.moments : null, undefined, { yours: mine });
        const column = gridColumns.find((c) => c.id === block.columnId);
        return {
          key: block.key,
          when,
          time: cardTime(safeToDate(session.startTime || session.StartDateTime || session.date), null),
          name: clientObj ? clientDisplayName(clientObj, session.clientName || "Client") : String(session.clientName || "Reservation").trim(),
          withText: mine ? "with you" : block.columnId === UNASSIGNED_ID ? (staffLabel(session.trainerName) ? `with ${staffLabel(session.trainerName)}` : null) : column ? `with ${column.name}` : null,
          critical: marks.critical,
          glyphs: marks.glyphs,
          more: marks.more,
          moreLabel: marks.moreLabel,
          clientId: clientObj?.id ?? null,
          pending: !clientObj && (rosterLoading || rosterFailed) && Boolean(session.clientId),
        };
      })
    : [];

  /*
   * ONE TRAINER'S BOOKINGS AS A LIST (hub fixes, Oct 1 2026, AJ approved): a
   * tap on a column head opens Opportunities narrowed to that column's
   * bookings on the day on screen — the same entries, never a second engine.
   * Another day, or the layer switch, shows everyone again.
   */
  const listColumn = trainerList && trainerList.day === gridDayKey ? gridColumns.find((c) => c.id === trainerList.columnId) ?? null : null;
  const trainerFilter = listColumn
    ? (() => {
        const own = gridBlocks.filter((b) => b.columnId === listColumn.id && !isStaffBlock(b.booking as any));
        const keys = new Set(own.map((b) => String((b.booking as any).id ?? b.key)));
        const clientIds = new Set(own.map((b) => (b.booking as any).clientId).filter(Boolean) as string[]);
        return {
          name: listColumn.isMe ? `${listColumn.name} (you)` : listColumn.name,
          includes: (e: { key: string; clientId: string | null }) => keys.has(e.key) || (!!e.clientId && clientIds.has(e.clientId)),
        };
      })()
    : null;

  return (
    <motion.div
      key="clients"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col h-full bg-background text-foreground w-full overflow-hidden"
    >
      {/* Client search moved to the global header (AppContent → AppHeader.searchSlot).
          Manual client creation stays removed: profiles arrive via the Mindbody sync.
          The old "Edit Client Profile" form that sat here went on Oct 1 2026
          (hub fixes): nothing ever opened it, and its save wrote a whole
          client object back. A client's details are edited on Notes & Profile. */}

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
        {!searchTerm ? (
          <div className="flex-1 flex flex-col min-h-0 bg-background">
            {/* The top (calm Hub round): the layers, the week and two doors;
                on Schedule, the day in words and the chips. */}
            <div className="hd-top">
            <DayHeader
              layer={layer}
              onLayer={(next) => {
                setSpot(null);
                // Going back to Schedule, or opening the list itself, shows everyone.
                setTrainerList(null);
                setLayer(next);
              }}
              days={strip}
              selected={gridDayKey}
              onSelectDay={(key) => setPickedDay(pickDay(key, studioToday))}
              openTasks={openTaskCount}
              onOpenTasks={() => {
                rememberMyStudioSection("relay");
                setView("studio-tasks");
              }}
              onOpenKey={() => setKeyOpen(true)}
              chips={layer === "schedule" && !activeSpot ? chips : undefined}
              onSpot={(family) => setSpot({ day: gridDayKey, family, next: 0 })}
            />
            {layer === "schedule" && (
              <DaySummary
                title={dayTitle(selectedKey)}
                bookings={bookingsRead}
                spot={activeSpot}
                spotText={activeSpot ? spotWords(dayMoments.entries, activeSpot) : ""}
                onSpot={(family) => setSpot(family ? { day: gridDayKey, family, next: 0 } : null)}
                onNext={showNextSpot}
                onAsList={() => {
                  if (!activeSpot) return;
                  setListRequest({ filter: activeSpot, nonce: Date.now() });
                  setSpot(null);
                  setTrainerList(null);
                  setLayer("opportunities");
                }}
                focus={
                  isPhone && myColumnId
                    ? {
                        value: focus,
                        onChange: (next) => {
                          setFocus(next);
                          writeFocus(next);
                        },
                      }
                    : null
                }
              />
            )}
            </div>
            <KeySheet open={keyOpen} onClose={() => setKeyOpen(false)} />
            {activePeek &&
              (() => {
                const entry = dayMoments.byClientId.get(activePeek.clientId);
                const block = gridBlocks.find((b) => b.key === activePeek.blockKey);
                if (!entry || !block) return null;
                const booking: any = block.booking;
                const start = safeToDate(booking.startTime || booking.StartDateTime || booking.date);
                const end = safeToDate(booking.endTime || booking.EndDateTime);
                const peekNumber = bookingSessionNumber(entry, entry.client, booking, dayMoments.input);
                /* What happened, by the card's own rule, and the button that
                   follows it (hub fixes, Oct 1 2026; peek-model's peekState). */
                const daySession = workoutSessionFor(booking, entry.client);
                const peekCardState = hubCardState(
                  { id: booking.id ?? null, clientId: entry.client?.id ?? booking.clientId ?? null, startTime: booking.startTime || booking.StartDateTime || booking.date, endTime: booking.endTime || booking.EndDateTime, status: booking.status },
                  logged,
                  currentTime,
                  { session: daySession, marks: bookingMarks.marks },
                );
                const loggedSession = peekCardState === "done" && daySession?.status === "Completed" && daySession.id ? daySession : null;
                const peekView = peekState(peekCardState, {
                  machines: Array.isArray(loggedSession?.sessionMachineIds) ? loggedSession!.sessionMachineIds!.length : null,
                  loggedSessionHeld: !!loggedSession,
                });
                /* LATE CANCEL · SESSION TAKEN (Atlas answers, Oct 2 2026):
                   anyone at the studio marks a booking nobody logged; a
                   leader, or whoever marked it, takes it back. The rules
                   decide in the end; a refusal is said, never swallowed. */
                const bookingId: string | null = typeof booking.id === "string" && booking.id ? booking.id : null;
                const lateClientId: string | null = entry.client?.id ?? booking.clientId ?? null;
                const uid = auth.currentUser?.uid ?? null;
                const markRow = bookingId ? bookingMarks.rows.find((r) => r.id === bookingId) ?? null : null;
                const mayUndo = mayTakeBackLateCancel(markRow, uid, canManageRenewals(authTrainer, activeStudioId));
                const runLate = async () => {
                  if (!bookingId || !lateClientId || !activeStudioId) return;
                  setLateBusy(bookingId);
                  setLateError(null);
                  try {
                    if (peekView.lateCancel === "undo") await takeBackNoShow(activeStudioId, bookingId);
                    else {
                      const day = studioDateKey(booking.startTime || booking.StartDateTime || booking.date) ?? selectedKey;
                      await markNoShow(activeStudioId, { id: bookingId, clientId: lateClientId, day }, { name: authTrainer?.fullName ?? "" });
                    }
                  } catch (err) {
                    setLateError({ bookingId, text: err instanceof Error && /sign in/i.test(err.message) ? err.message : "That didn't save. Check the connection, or ask a leader to mark it." });
                  } finally {
                    setLateBusy(null);
                  }
                };
                const lateOffer =
                  bookingId && lateClientId && activeStudioId && bookingMarks.marks &&
                  (peekView.lateCancel === "mark" || (peekView.lateCancel === "undo" && mayUndo))
                    ? { onRun: () => void runLate(), busy: lateBusy === bookingId, error: lateError?.bookingId === bookingId ? lateError.text : null }
                    : null;
                return (
                  <Peek
                    entry={entry}
                    sessionNumber={peekNumber}
                    state={peekView}
                    lateCancel={lateOffer}
                    onEditSession={
                      loggedSession
                        ? (id) => {
                            setPeek(null);
                            setEditing({ key: Date.now(), clientId: id, homeStudioId: entry.client?.homeStudioId, session: loggedSession as unknown as HistorySession });
                          }
                        : undefined
                    }
                    onLogPast={(id) => {
                      // Her Activity Archive, where Log past session is: the
                      // Hub search card's own door (Past sessions), asked
                      // through the leave gate first.
                      setPeek(null);
                      guardLeave(() => {
                        onSelectClient(id);
                        openProfileAt(id, { tab: "clinical", view: "calendar" });
                        setView("profile");
                      });
                    }}
                    timeText={cardTime(start, end, { span: true })}
                    // What the card may leave out on a narrow column, in full (hub fixes, Oct 1 2026).
                    extras={cardRestWords({
                      booking,
                      moments: entry.moments,
                      numberShown: peekNumber !== null && peekNumber > 0,
                      newToJourney: isNewToJourney(entry, entry.client),
                      usualService,
                    })}
                    anchor={activePeek.anchor}
                    onClose={() => setPeek(null)}
                    onOpenProfile={(id) => {
                      setPeek(null);
                      onSelectClient(id);
                      setView("profile");
                    }}
                    onStartSession={(id) => {
                      // The Hub search card's own path to a session.
                      setPeek(null);
                      onSelectClient(id);
                      setView("workouts");
                    }}
                  />
                );
              })()}

            {/* Edit session (hub fixes, Oct 1 2026): the Activity Archive's own
                pop-up for that day's session — its edit stamp, its rules. */}
            {editing && (
              <LoadBoundary kind="screen" resetKey={`hub-edit-${editing.key}`}>
                <React.Suspense fallback={null}>
                  <SessionDetailDialog
                    key={editing.key}
                    initialSessions={[editing.session]}
                    onClose={() => setEditing(null)}
                    clientId={editing.clientId}
                    machines={machines}
                    trainerFor={trainerFor}
                    trainers={sortedTrainers}
                    activeStudioId={activeStudioId}
                    clientHomeStudioId={editing.homeStudioId}
                  />
                </React.Suspense>
              </LoadBoundary>
            )}

            {/* A failed read is unknown, never empty: with some clients'
                Critical notes unread, a card without the triangle proves
                nothing, so the Hub says so once rather than on every card. */}
            {criticalNotes.status === "incomplete" && (
              <p
                role="status"
                className="shrink-0 px-3 md:px-4 py-1.5 text-[12px] leading-snug text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800"
              >
                {"Couldn't check every client's critical notes, so a card without the red triangle may still have one. Each client's briefing still shows them."}
              </p>
            )}

            {/* A read that failed, said in place (hub fixes, Oct 1 2026):
                never a quiet-looking day, never "Not synced" on every card. */}
            {layer === "schedule" && bookingsRead === "failed" && (
              <HubNotice
                words={
                  gridBlocks.length > 0
                    ? `Couldn't refresh ${gridDayKey === studioToday ? "today's" : `${dayTitle(gridDayKey)}'s`} bookings, so they may be out of date. Trying again.`
                    : `Couldn't load ${gridDayKey === studioToday ? "today's" : `${dayTitle(gridDayKey)}'s`} bookings. Trying again.`
                }
                onRetry={onRetrySchedule}
              />
            )}
            {layer === "schedule" && rosterFailed && (
              <HubNotice words="Couldn't load the studio's client list, so some cards can't open a profile yet. Trying again." />
            )}

            {/* Who is due in the next half hour, across the floor (hub cherry
                round): a row of the schedule's own, under the top. */}
            {nextOpen && (
              <NextStrip
                items={nextItems}
                openKey={activePeek?.blockKey ?? null}
                onOpen={(item, anchor) => {
                  if (item.clientId) setPeek({ clientId: item.clientId, blockKey: item.key, day: gridDayKey, anchor });
                }}
              />
            )}

            {/* The day's schedule (calm Hub round): Mindbody's layout, calmer.
                The grid stays mounted under Opportunities, only hidden. */}
            {/* On a phone (Journey Lite, Oct 1 2026): the same blocks and the
                same cards, one booking under the next (features/phone). */}
            {isPhone ? (
              <PhoneDayList
                blocks={gridBlocks.map((b) => ({ ...b, staff: isStaffBlock(b.booking as any) }))}
                columnOrder={gridColumns.map((c) => c.id)}
                mineOnly={focusId}
                nowMin={gridNowMin}
                renderCard={(b) => renderCard(b)}
                withWords={(b) => {
                  if (focusId !== null || b.columnId === UNASSIGNED_ID) return null;
                  const column = gridColumns.find((c) => c.id === b.columnId);
                  return column ? (column.isMe ? "with you" : `with ${column.name}`) : null;
                }}
                emptyWords={bookingsRead === "ready" ? NOBODY_BOOKED : bookingsRead === "loading" ? "Reading the day’s bookings…" : null}
                hidden={layer !== "schedule"}
              />
            ) : (
            <HubGrid
              dayKey={gridDayKey}
              columns={gridColumns}
              blocks={gridBlocks}
              nowMin={gridNowMin}
              renderCard={renderCard}
              frameOf={frameOf}
              hidden={layer !== "schedule"}
              focusId={focusId}
              emptyWords={bookingsRead === "ready" ? NOBODY_BOOKED : bookingsRead === "loading" ? "Reading the day\u2019s bookings\u2026" : null}
              onOpenColumn={(columnId) => {
                // That trainer's bookings as a list (hub fixes, Oct 1 2026, AJ approved).
                setSpot(null);
                setPeek(null);
                setTrainerList({ columnId, day: gridDayKey });
                setLayer("opportunities");
              }}
            />
            )}

            {/* Opportunities: every client booked on the day on screen, sorted
                by what matters today (features/hub-opportunities). It reads
                the Hub's bookings, roster, sessions and Critical notes — the
                same read the cards use — and nothing per client. */}
            {layer === "opportunities" && (
              <LoadBoundary kind="screen" resetKey="hub-opportunities">
                <React.Suspense fallback={<LoadingArea label={"Opening Opportunities\u2026"} />}>
                  <RunSheet
                    day={selectedKey}
                    entries={dayMoments.entries}
                    request={listRequest}
                    trainer={trainerFilter}
                    onClearTrainer={() => setTrainerList(null)}
                    onOpenProfile={(id) => onSelectClient(id)}
                    onStartSession={(id) => {
                      // The Hub search card's own path to a session.
                      onSelectClient(id);
                      setView("workouts");
                    }}
                  />
                </React.Suspense>
              </LoadBoundary>
            )}
          </div>
        ) : (
          /* The header's search, as the Client Directory's own rows (hub
             fixes, Oct 1 2026): Last in · Next · Left in its words, from its
             context. A tap opens the profile; each row keeps a Start. */
          <SearchResults
            term={searchTerm}
            rows={searchRows}
            matches={searchMatches}
            searching={isSearchingDb}
            onOpen={(id) => onSelectClient(id)}
            onStart={(id) => {
              // The Hub's own path to a session.
              onSelectClient(id);
              setView("workouts");
            }}
          />
        )}
      </div>

    </motion.div>
  );
}
