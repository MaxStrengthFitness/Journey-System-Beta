import React, { useState, useEffect } from "react";
import {
  Search,
  Users,
  History,
  Play,
  Loader2,
} from "lucide-react";
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
import { Client, Trainer, View, WorkoutSession } from "../types";
import { isFuzzyNameMatch } from "../lib/sync-utils";
import { bookingDay, isStaffBlock, loggedSessions } from "../lib/booking-state";
import { sessionsByClientDay } from "../lib/hub-card-state";
import { useHubCriticalNotes } from "../hooks/useHubCriticalNotes";
// Import the hook file directly, not the studio-tasks barrel (index.ts).
// ClientsView is in the initial bundle; pulling the barrel in here would drag
// the whole Studio Hub UI in with it and defeat AppContent's lazy import.
import { useStudioTasks } from "../features/studio-tasks/useStudioTasks";
import { dayTitle, pickDay, shownDay, stripFrom } from "../features/hub-schedule/hub-day";
import { UNASSIGNED_ID, planColumns, staffLabel } from "../features/hub-schedule/columns";
import { staffIdsAt } from "../features/standing-week/check";
import type { DayReadState } from "../lib/schedule-window";
import {
  zonedHM,
  studioDayBoundsForKey,
  studioDateKey,
  studioTodayKey,
} from "../lib/studio-time";
import {
  safeToDate,
  getMillis,
  parseSessionDate,
} from "../lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { openProfileAt } from "../features/client-profile/profile-nav";
import { useLeaveGuard } from "../features/unsaved-changes";
import { LoadBoundary } from "../features/new-version/LoadBoundary";
import { LoadingArea } from "./LoadingMark";
import type { HubLayer } from "../features/hub-opportunities/LayerSwitch";
import { useDayMoments } from "../features/hub-opportunities/use-day-moments";
import { useHubFord } from "../features/hub-opportunities/use-hub-ford";
import { useHubMarks } from "../features/hub-opportunities/use-hub-marks";
import { useBookingMarks } from "../features/admin/attention/booking-marks";
import { HubCard, cardTime } from "../features/hub-schedule/HubCard";
import { HubGrid, HubNotice, NOBODY_BOOKED, type GridBlock, type GridColumn } from "../features/hub-schedule/HubGrid";
import { trainerDayFrame, weeksByTrainer } from "../features/hub-schedule/off-hours";
import type { Span } from "../features/hub-schedule/grid-model";
import { useStandingWeeks } from "../features/standing-week/useStandingWeeks";
import { mayReadWeeks } from "../features/standing-week/present";
import { weekdayOf } from "../features/client-history/model";
import { DayHeader, DaySummary, KeySheet } from "../features/hub-schedule/DayHeader";
import { Peek } from "../features/hub-schedule/Peek";
import { countsByDay, spotWords, stripDays, summaryChips } from "../features/hub-schedule/day-summary";
import { hasFamily, momentsToday, type FilterId, type MomentFamily } from "../features/hub-opportunities/moments-today";
import { rememberMyStudioSection } from "../features/my-studio/section-memory";
import { bookingSessionNumber, cardMarks, isNewToJourney, usualServiceOf } from "../features/hub-schedule/card-marks";
import { yourDay } from "../features/hub-schedule/your-day";
import { nextHalfHour, stripOpen } from "../features/hub-schedule/next-half-hour";
import { NextStrip, type NextStripItem } from "../features/hub-schedule/NextStrip";
import { focusColumnId, readFocus, writeFocus, type HubFocus } from "../features/hub-schedule/focus";
import { hubCardState } from "../lib/hub-card-state";
import { clientDisplayName } from "../lib/client-name";

/*
 * THE OPPORTUNITIES LAYER (Sep 27 2026): fetched the first time it is
 * opened, so the Hub's own bundle stays as it was. Inside a LoadBoundary
 * (lazy-screens.test.ts): a deploy that removed its file replaces only the
 * layer, and recovers on the Hub, where a reload is allowed.
 */
const RunSheet = React.lazy(() => import("../features/hub-opportunities/RunSheet"));

/** One empty list, so a missing schedule doesn't look new on every render. */
const NO_SCHEDULES: any[] = [];

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
}: {
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
  /** Me (your own column, in words) or Everyone (every column alike); remembered on this iPad. */
  const [focus, setFocus] = useState<HubFocus>(() => readFocus());

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

  const filteredClients = clients.filter((c) =>
    `${c.firstName} ${c.lastName}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase()),
  );

  // Merge local filtered clients of today and dynamic DB search results uniquely by client ID
  const mergedSearchClients = Array.from(
    new Map(
      [...filteredClients, ...dbSearchResults].map((c) => [c.id, c]),
    ).values(),
  );

  const now = new Date();

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

  const todaysSchedules = (schedules || [])
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
  const logged = React.useMemo(
    () => loggedSessions(sessionsKnown ? sessions : null),
    [sessions, sessionsKnown],
  );

  /*
   * The day's Critical notes (question 12, AJ Sep 24 2026): ONE live read for
   * every client booked on the day on screen, thirty clients to a query —
   * never a read per card, and never a count kept on the client. Each card
   * decides which of its client's notes matter on its own day
   * (lib/hub-critical-notes). `notesFor` is null for a client whose notes are
   * unknown, and that card then claims nothing either way.
   */
  const criticalNotes = useHubCriticalNotes(
    todaysSchedules
      .filter((s) => !s.clientName?.toLowerCase().includes("unavailab"))
      .map((s) => findClientForSession(s)?.id),
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
   * lib/booking-state as a no-show). ONE listener, for the day on screen —
   * never per card, never per client. Unread or refused, the marks are null
   * and a finished slot reads as it did before the mark.
   */
  const dayKeyOnScreen = selectedKey;
  const bookingMarks = useBookingMarks(readsStudio ? activeStudioId : null, dayKeyOnScreen, dayKeyOnScreen);

  /*
   * THE DAY'S MOMENTS (calm Hub round, Sep 28 2026): every client booked on
   * the day on screen, worked out ONCE by the same engine the Opportunities
   * list reads (features/hub-opportunities). The cards, their marks and the
   * list can never disagree. No read per card.
   */
  const dayMoments = useDayMoments({
    day: selectedKey,
    now: currentTime,
    schedules: schedules || NO_SCHEDULES,
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

  const getClientSessions = (client: Client) => {
    const clientName = `${client.firstName} ${client.lastName}`;
    const next = schedules
      .filter((s) => {
        const d = safeToDate(s.startTime);
        return (
          (s.clientId === client.id ||
            s.clientName.toLowerCase() === clientName.toLowerCase()) &&
          d &&
          d > now &&
          s.status !== "Cancelled"
        );
      })
      .sort((a, b) => getMillis(a.startTime) - getMillis(b.startTime))[0];
    const last = sessions
      .filter((s) => s.clientId === client.id)
      .sort((a, b) => parseSessionDate(b.date) - parseSessionDate(a.date))[0];
    return { next, last };
  };

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
   * loud. Only when you have a column on the day on screen, and Focus is on
   * Me (Everyone makes every column alike: features/hub-schedule/focus.ts).
   */
  const myColumn = visibleTrainersList.find((t) => isSelfTrainer(t));
  const myColumnId = myColumn ? String(myColumn.id) : null;
  const focusId = focusColumnId(focus, myColumnId);
  // The name they go by, whole (research-hub §6.0), never cut; the full name
  // when two columns would otherwise read alike (two Chrises, Oct 1 2026).
  const shortName = (t: Trainer) => ((t as any).nickname || "").trim() || (t.fullName || "").trim().split(" ")[0] || "Trainer";
  const shortNames = visibleTrainersList.map(shortName);
  const gridColumns: GridColumn[] = visibleTrainersList.map((t, i) => {
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
    gridColumns.push({
      id: UNASSIGNED_ID,
      name: "Unassigned",
      initials: "?",
      isMe: false,
      count: gridBlocks.filter((b) => b.columnId === UNASSIGNED_ID && !isStaffBlock(b.booking as any)).length,
      detail: null,
    });
  }

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
  const bookingCounts = React.useMemo(() => countsByDay(schedules || NO_SCHEDULES), [schedules]);
  const celebrateDays = React.useMemo(() => {
    const out = new Set<string>();
    for (const key of stripKeysKey.split("|")) {
      if (momentsToday({ ...dayMoments.input, day: key }).some((e) => hasFamily(e, "celebrate"))) out.add(key);
    }
    return out;
  }, [dayMoments.input, stripKeysKey]);
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
    const el = Array.from(document.querySelectorAll<HTMLElement>(".hs-slot")).find((s) => s.dataset.blockKey === key);
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
            { sessionOpen: workoutSession?.status === "In-Progress", marks: bookingMarks.marks },
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

  return (
    <motion.div
      key="clients"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 text-foreground dark:text-white w-full overflow-hidden"
    >
      {/* Client search moved to the global header (AppContent → AppHeader.searchSlot).
          Manual client creation stays removed: profiles arrive via the Mindbody sync.
          The old "Edit Client Profile" form that sat here went on Oct 1 2026
          (hub fixes): nothing ever opened it, and its save wrote a whole
          client object back. A client's details are edited on Notes & Profile. */}

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
        {!searchTerm ? (
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950">
            {/* The top (calm Hub round): the layers, the week and two doors;
                on Schedule, the day in words and the chips. */}
            <DayHeader
              layer={layer}
              onLayer={(next) => {
                setSpot(null);
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
            />
            {layer === "schedule" && (
              <DaySummary
                title={dayTitle(selectedKey)}
                sessions={preBookedCount}
                bookings={bookingsRead}
                trainers={gridColumns.filter((c) => c.count > 0 && c.id !== UNASSIGNED_ID).length}
                chips={chips}
                spot={activeSpot}
                spotText={activeSpot ? spotWords(dayMoments.entries, activeSpot) : ""}
                onSpot={(family) => setSpot(family ? { day: gridDayKey, family, next: 0 } : null)}
                onNext={showNextSpot}
                onAsList={() => {
                  if (!activeSpot) return;
                  setListRequest({ filter: activeSpot, nonce: Date.now() });
                  setSpot(null);
                  setLayer("opportunities");
                }}
                focus={
                  myColumnId
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
            <KeySheet open={keyOpen} onClose={() => setKeyOpen(false)} />
            {activePeek &&
              (() => {
                const entry = dayMoments.byClientId.get(activePeek.clientId);
                const block = gridBlocks.find((b) => b.key === activePeek.blockKey);
                if (!entry || !block) return null;
                const booking: any = block.booking;
                const start = safeToDate(booking.startTime || booking.StartDateTime || booking.date);
                const end = safeToDate(booking.endTime || booking.EndDateTime);
                return (
                  <Peek
                    entry={entry}
                    sessionNumber={bookingSessionNumber(entry, entry.client, booking, dayMoments.input)}
                    timeText={cardTime(start, end, { span: true })}
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
            />

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
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950 p-6">
            <div className="flex items-center gap-3 mb-8">
              {isSearchingDb ? (
                <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
              ) : (
                <Search className="w-6 h-6 text-sky-500" />
              )}
              <h3 className="text-xl font-black uppercase tracking-widest text-foreground dark:text-white">
                Client Directory{" "}
                <span className="text-muted-foreground ml-2">
                  ({mergedSearchClients.length})
                </span>
              </h3>
            </div>
            <div className="space-y-4 max-w-5xl">
              {mergedSearchClients.map((client) => {
                const { next, last } = getClientSessions(client);
                const clientName = `${client.firstName} ${client.lastName}`;

                return (
                  <motion.div
                    key={client.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <Card className="group hover:border-primary/50 transition-all cursor-pointer overflow-hidden rounded-3xl">
                      <CardContent className="p-0">
                        <div className="flex flex-col lg:flex-row p-6 gap-6">
                          <div
                            className="flex flex-col gap-2 cursor-pointer grow min-w-50"
                            onClick={() => {
                              onSelectClient(client.id!);
                              setView("profile");
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <h3 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                                {clientName}
                              </h3>
                              {client.isActive ? (
                                <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-none font-black text-[11px] uppercase">
                                  Active
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="font-black text-[11px] uppercase"
                                >
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            <div className="flex gap-4 text-[11px] font-bold text-muted-foreground uppercase">
                              <span>{client.height}</span>
                              <span>•</span>
                              <span>{client.weight || "--"} LBS</span>
                              <span>•</span>
                              <span className="text-primary">
                                {client.remainingSessions} SESSIONS
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 grow-2">
                            {/* Last Session Info */}
                            <div className="bg-white dark:bg-bg-dark p-4 rounded-2xl border border-border/50 flex flex-col justify-between">
                              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                                Previous Session
                              </p>
                              {last ? (
                                <div className="space-y-1">
                                  <p className="text-sm font-black">
                                    {new Date(last.date).toLocaleDateString(
                                      [],
                                      {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      },
                                    )}
                                  </p>
                                  <p className="text-[11px] font-bold text-muted-foreground uppercase italic">
                                    TR: {last.trainerInitials}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs font-bold text-muted-foreground/30 uppercase italic">
                                  No history
                                </p>
                              )}
                            </div>

                            {/* Next Session Info */}
                            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex flex-col justify-between">
                              <p className="text-[11px] font-black uppercase tracking-widest text-primary mb-1">
                                Next Scheduled
                              </p>
                              {next ? (
                                <div className="space-y-1">
                                  <p className="text-sm font-black text-primary">
                                    {safeToDate(
                                      next.startTime,
                                    )?.toLocaleDateString([], {
                                      month: "short",
                                      day: "numeric",
                                    })}{" "}
                                    @{" "}
                                    {safeToDate(
                                      next.startTime,
                                    )?.toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                  <p className="text-[11px] font-black text-primary/70 uppercase italic">
                                    TR: {next.trainerName}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs font-bold text-muted-foreground/30 uppercase italic">
                                  Not scheduled
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              className="h-20 w-20 px-1.5 rounded-2xl font-black flex flex-col gap-1 border-2 shadow-sm dark:shadow-none uppercase group-hover:border-primary/20"
                              onClick={() => {
                                // The client's history lives on their profile:
                                // Activity Archive -> Sessions. The label says
                                // what it opens ("History" until the voice
                                // review follow-up); it wraps to two lines
                                // inside the 80px square rather than truncate,
                                // which is what the narrower padding is for.
                                // The handoff is written only if the move goes
                                // ahead, as Relay's tasks and Back to Reports
                                // do: asked about unsaved typing and told to
                                // stay, a handoff left in storage would send
                                // the next visit to this client to Sessions
                                // instead of Journey. The client and the view
                                // inside are guarded too; the gate runs them
                                // straight through while it is leaving.
                                guardLeave(() => {
                                  onSelectClient(client.id!);
                                  openProfileAt(client.id!, { tab: "clinical", view: "sessions" });
                                  setView("profile");
                                });
                              }}
                            >
                              <History className="w-6 h-6" />
                              <span className="text-[11px] leading-tight text-center whitespace-normal">Past sessions</span>
                            </Button>
                            <Button
                              className="h-20 w-20 rounded-2xl font-black flex flex-col gap-1 shadow-lg shadow-primary/20 uppercase"
                              onClick={() => {
                                onSelectClient(client.id!);
                                setView("workouts");
                              }}
                            >
                              <Play className="w-6 h-6 fill-current" />
                              <span className="text-[11px]">Start</span>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
              {mergedSearchClients.length === 0 && !isSearchingDb && (
                <div className="py-20 text-center border-2 border-dashed rounded-3xl bg-muted/10 opacity-50">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-xs font-black uppercase">
                    No client matches "{searchTerm}"
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </motion.div>
  );
}
