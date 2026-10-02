/**
 * OPERATIONS → TODAY — the brief, for one studio.
 *
 * The redesign's Operations room, phase 2 (Sep 28 2026; the pick "Brief +
 * Journey", research-operations §6.3). The Overview was five tiles and eight
 * equal panels, so a leader did the adding up every morning before knowing
 * what mattered. Now:
 *
 *   the freshness line   when the schedule was read, when the nightly record
 *                        last changed, and how many clients can't be judged
 *                        (a button that says who and why)
 *   the bottom line      one sentence written by rules (brief.ts), the rules
 *                        a tap away, the day's facts under it, and today's
 *                        "didn't come" marks with Take back
 *   Needs you            only what a leader can clear right here: acknowledge
 *                        pain, an incident or a Critical note; take a gesture
 *                        nobody owns; review a note that has mattered 60 days
 *                        (AJ's question 3, default); and, since wave 2 (AJ,
 *                        Sep 28 2026: "all yes"), a session nobody logged,
 *                        cleared by "Didn't come" once a leader has asked, or
 *                        by itself when its trainer logs the workout. For
 *                        someone who can't mark here (a leader visiting
 *                        another studio) it stays a door, never a count
 *   Catch today          clients in today with a reason to see them in
 *                        person, from the Hub's ONE engine (hub-
 *                        opportunities/moments-today), and who trained today
 *                        with nothing booked
 *   Slipping away        the Journey's drifting and at-risk clients (one
 *                        rule, journey/states.ts), catchable first, Snooze
 *                        and Dismiss, and a door to Clients → Journey
 *   Since yesterday      the cancellations and moves noticed since yesterday
 *                        began, each held against its own day
 *   Coming up            the next three days with bookings, Openings' line,
 *                        who has nothing booked ahead, the renewal talks due
 *   Going right          who came back, the week's milestones and dates
 *   Worth a look         Sunday's strength list, machine fit, Trends, Hours
 *
 * READS PER OPEN, one studio — the Overview's own, no new query: the week's
 * schedule (changes/useStudioWeek, held to the server), today's Journey
 * sessions (useTodaySessions), the renewal settings and cycles
 * (useCyclesRead: a failed read of the conversations is unknown), the last
 * 14 days of sessions, the studio's incidents, critical and dated notes and
 * the Sunday watch (useOverviewReads), the watchlist and acknowledgements,
 * the Delight queue (a failed read is unknown), the machine-fit index, and
 * what Openings starts from for someone who may read the standing weeks.
 * Catch today works the Hub's engine out over the roster and those reads:
 * nothing per client.
 *
 * AN UNREAD WEEK IS NEVER A ZERO, as before: while the week is being read or
 * could not be, nothing counted from its bookings is said.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarRange, ChevronRight, Clock3, Ruler, TrendingDown, TrendingUp, UsersRound } from "lucide-react";
import { auth } from "../../../firebase";
import type { Client, Machine, Studio, Trainer } from "../../../types";
import { clientDisplayName } from "../../../lib/client-name";
import { isStaffBlock } from "../../../lib/booking-state";
import { canManageRenewals } from "../../renewals/permissions";
import { markNoShow, takeBackNoShow, useBookingMarks } from "../attention/booking-marks";
import { myTrainerIds } from "../../../lib/live-session";
import { formatStudioDate, formatStudioTime, toDate } from "../../../lib/studio-time";
import { useDelightQueue } from "../../ford/useClientFord";
import { setGestureStatus } from "../../ford/ford-write";
import { useCyclesRead } from "../../renewals/usePipeline";
import { useRenewalSettings } from "../../renewals/useRenewalSettings";
import { buildPackageNameIndex } from "../../renewals/settings";
import type { RenewalSnapshot } from "../../renewals/types";
import { buildDirectoryRows, prepareDirectory } from "../../client-directory/row";
import { momentsToday } from "../../hub-opportunities/moments-today";
import { addDays } from "../../client-history/model";
import { observations, returnRate, studioSummary, trainerMetrics } from "../insights/metrics";
import { formatHours, sessionMinutesOf, trainerNames } from "../hours/hours";
import { useWorthALook } from "../machine-fit/useFitFloor";
import { rememberMyStudioSection } from "../../my-studio/section-memory";
import { nextDays as openingsNextDays } from "../../openings/next-days";
import { overviewLines, overviewMoreLine } from "../../openings/present";
import { showOpenings, useOpeningsData } from "../../openings/ui";
import { mayReadWeeks } from "../../standing-week/present";
import { AdminButton, AdminNotice } from "../primitives";
import { useSessionsInRange } from "../sessions-range";
import { changeCounts, describeChange } from "../changes/changes";
import { WEEK_DAYS } from "../changes/useWeekSchedule";
import { useStudioWeek } from "../changes/useStudioWeek";
import { backAgain, dismissal, keysToAcknowledge, pendingAcks, snooze } from "../attention/attention";
import { acknowledge, clearWatch, useAcknowledgements, useWatchlist, writeWatch } from "../attention/useAttention";
import { listFor, studioJourneys, thisWeek, type JourneyEntry } from "../journey/journey-list";
import { linesOf, multipleWords } from "../journey/states";
import { useStudioCases } from "../journey/case-store";
import { useStoredJourney } from "../journey/useStoredJourney";
import { useStudioSettings } from "../../studio-settings/useStudioSettings";
import { entriesForDay } from "./floor";
import { hoursThisWeek, notesToReview, painQuestion, renewalsQuestion } from "./questions";
import { dropSentence } from "./performance";
import { chaseList, todayNumbers } from "./today";
import { moments } from "./moments";
import { nextDays, notBookedAhead } from "./next-days";
import { ActionRows, Line, SnoozeChooser } from "./pieces";
import { ReviewNotesDialog } from "./ReviewNotesDialog";
import { useOverviewReads } from "./useOverviewReads";
import { useTodaySessions } from "./useTodaySessions";
import { BottomLineBox, BriefEmpty, BriefSection, FreshnessLine } from "./brief-pieces";
import { bottomLine, catchToday, dayStartMs, heldAgainst, leftWithNothingBooked, nightlyRead, partOfDay, renewalUnknownCount, sinceYesterday } from "./brief";
import type { OverviewLink } from "./OverviewPage";
import { BriefHuddle } from "../team/HuddleSheet";
import type { BriefHuddleInput } from "../team/huddle-agenda";
import "./overview.css";
import "../shell/ops.css";

const DAYS_READ = 14;
const DAY_MS = 86_400_000;
/** How many of Openings' lines Coming up shows before "and N more on Openings". */
const OPENINGS_SHOWN = 3;
/** Slipping away shows this many; the Journey is a door. */
const SLIPPING_SHOWN = 4;
const NOT_READ = "Could not be read just now.";

export interface TodayBriefProps {
  /** Drawn at the foot: the network's actions, for a franchise owner with one studio. */
  footer?: ReactNode;
  homeSignal: number;
  studio: Studio;
  /** Every studio the app streams (a visiting client's home cutover). */
  studios: Studio[];
  today: string;
  now: Date;
  me: { id: string; name: string };
  authTrainer: Trainer;
  trainers: Trainer[];
  machines: Machine[];
  clients: Client[];
  onNavigateProfile?: (clientId: string) => void;
  onOpen?: (to: OverviewLink) => void;
  onOpenMyStudio?: () => void;
  /** What Needs you counts, for the menu's badge; null while it is still being read. */
  onNeedsCount?: (count: number | null) => void;
}

export function TodayBrief({ footer, homeSignal, studio, studios, today, now, me, authTrainer, trainers, machines, clients, onNavigateProfile, onOpen, onOpenMyStudio, onNeedsCount }: TodayBriefProps) {
  const studioId = studio.id as string;
  const tz = studio.timezone || undefined;
  // Pressing Today while on it: the page has no views of its own any more (the
  // attendance watch is Clients → Journey), so it closes the chase list.
  const [showChase, setShowChase] = useState(false);
  useEffect(() => {
    setShowChase(false);
  }, [homeSignal]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [huddleOpen, setHuddleOpen] = useState(false);
  const [snoozing, setSnoozing] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  /* ---- the reads ---- */
  const week = useStudioWeek(studioId, today, tz);
  const weekUnread = week.loading || week.failed;
  const logged = useTodaySessions(studioId, today, tz);
  // The leaders' "didn't come" on today's bookings (wave 2).
  const marks = useBookingMarks(studioId, today, today);
  const canMark = canManageRenewals(authTrainer, studioId);
  const own = useOverviewReads(studioId, today, tz);
  const watchlist = useWatchlist(studioId);
  // The stored cases (wave 2): Slipping away names who owns each one.
  const cases = useStudioCases(studioId);
  // Last night's states (wave 2): Slipping away reads them while they are today's.
  const stored = useStoredJourney(studioId);
  const acks = useAcknowledgements(studioId);
  const delight = useDelightQueue({ studioId });
  const renewalSettings = useRenewalSettings(studioId);
  const settings = renewalSettings.settings;
  // The Journey's five lines: the studio's own, else Max Strength's default, else the app's (wave 2).
  const studioSettings = useStudioSettings(studioId, studio);
  const lines = useMemo(() => linesOf(studioSettings.all), [studioSettings.all]);
  const cycleKeys = useMemo(() => clients.map((c) => (c.renewal as RenewalSnapshot | undefined)?.cycleKey).filter((k): k is string => Boolean(k)), [clients]);
  const cyclesRead = useCyclesRead(studioId, cycleKeys);
  // Anchored on the studio day, not the ticking clock, so the read happens once a day.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startMs = useMemo(() => Date.now() - DAYS_READ * DAY_MS, [today]);
  const recent = useSessionsInRange({ studioId, startMs });
  const fit = useWorthALook(studioId, machines, clients, studio);
  const readsWeeks = mayReadWeeks(authTrainer, studioId);
  const openings = useOpeningsData({ studio: readsWeeks ? studio : null, trainers, authTrainer });

  /* ---- today ---- */
  const todayEntries = useMemo(() => entriesForDay(week.entries, today), [week.entries, today]);
  const numbers = useMemo(() => todayNumbers(todayEntries, now, logged.logged, tz, marks.marks), [todayEntries, now, logged.logged, tz, marks.marks]);
  const chase = useMemo(() => chaseList(todayEntries, now, logged.logged, tz, marks.marks), [todayEntries, now, logged.logged, tz, marks.marks]);
  // While today's marks are still out, a marked session would show as unlogged for a beat: nothing is counted until they answer.
  const neverLogged = weekUnread || logged.loading || logged.failed || marks.loading || numbers.unknown > 0 ? null : numbers.neverLogged;
  const marked = useMemo(() => {
    const byId = new Map(todayEntries.filter((e) => e.id).map((e) => [e.id as string, e]));
    return marks.rows
      .filter((m) => m.noShow && m.day === today)
      .map((m) => ({ ...m, booking: byId.get(m.id) ?? null }))
      .sort((a, b) => (toDate(a.booking?.startTime)?.getTime() ?? 0) - (toDate(b.booking?.startTime)?.getTime() ?? 0));
  }, [marks.rows, todayEntries, today]);
  const trainersOn = useMemo(() => {
    const on = new Set<string>();
    for (const b of todayEntries) {
      if (b.status === "Cancelled" || isStaffBlock(b)) continue;
      const who = b.trainerId || (b.trainerName ?? "").trim().toLowerCase();
      if (who && !/ rotation$/.test(who)) on.add(who);
    }
    return on.size;
  }, [todayEntries]);

  /* ---- the nightly record ---- */
  const nightly = useMemo(() => nightlyRead(clients, studioId, now), [clients, studioId, now]);
  const renewalUnknown = renewalUnknownCount(nightly);

  /* ---- Needs you: only what clears here ---- */
  const pain = useMemo(
    () => painQuestion({ sessions: recent.sessions, incidents: own.incidents ?? [], entries: own.critical ?? [], clients, today, tz }),
    [recent.sessions, own.incidents, own.critical, clients, today, tz],
  );
  const painPending = useMemo(() => pendingAcks(pain.rows, acks.value), [pain.rows, acks.value]);
  const review = useMemo(() => notesToReview(own.critical ?? [], clients, today, tz), [own.critical, clients, today, tz]);
  const moment = useMemo(
    () => moments({ delight: delight.rows, datedNotes: own.dated ?? [], clients, weekEntries: week.entries, today, cutover: studio.journeyCutoverDate ?? null, tz }),
    [delight.rows, own.dated, clients, week.entries, today, studio.journeyCutoverDate, tz],
  );
  const delightById = useMemo(() => new Map(delight.rows.map((r) => [`gesture:${r.entry.id}`, r])), [delight.rows]);
  const unowned = useMemo(() => moment.rows.filter((r) => r.kind === "gesture" && r.needsOwner && delightById.get(r.key)?.entry.opportunity), [moment.rows, delightById]);
  // A session nobody logged is a Needs-you row for whoever can mark it here (wave 2), and a door for anyone else.
  const unlogged = canMark && neverLogged !== null ? chase : [];
  // Until the week, today's logging and today's marks have all answered, who nobody logged is unknown: there may be more.
  const unloggedUnknown = canMark && (neverLogged === null || marks.failed);
  const needsLoading = own.loading || recent.loading || acks.loading || delight.isLoading;
  const otherPartial = own.failed.incidents || own.failed.critical || recent.failed || acks.failed || delight.failed;
  const needsPartial = otherPartial || unloggedUnknown;
  // Still reading (not failed): say so in those words.
  const unloggedStillReading = !otherPartial && canMark && neverLogged === null && !marks.failed && (week.loading || logged.loading || marks.loading);
  const needsCount = painPending.pending.length + unowned.length + review.length + unlogged.length;
  useEffect(() => {
    onNeedsCount?.(needsLoading ? null : needsCount);
  }, [onNeedsCount, needsLoading, needsCount]);
  useEffect(() => () => onNeedsCount?.(null), [onNeedsCount]);

  /* ---- Catch today: the Hub's engine, asked about today ---- */
  const packageIndex = useMemo(() => {
    if (renewalSettings.loading || renewalSettings.error || renewalSettings.forStudioId !== studioId) return null;
    return buildPackageNameIndex(renewalSettings.settings);
  }, [renewalSettings.loading, renewalSettings.error, renewalSettings.forStudioId, renewalSettings.settings, studioId]);
  const uid = auth.currentUser?.uid ?? null;
  const dayEntries = useMemo(() => {
    if (weekUnread) return null;
    const names = new Map(trainers.filter((t) => t.id).map((t) => [t.id as string, t.nickname?.trim() || t.fullName]));
    const trainerNameOf = (id: string) => names.get(id) ?? null;
    const myIds = myTrainerIds(authTrainer, uid);
    const bookedIds = new Set(week.entries.filter((b) => b.status !== "Cancelled" && !isStaffBlock(b) && b.clientId).map((b) => b.clientId as string));
    const booked = clients.filter((c) => c.id && bookedIds.has(c.id));
    const ctx = prepareDirectory({
      today,
      now,
      tz,
      studios,
      activeStudioId: studioId,
      schedules: week.entries,
      bookingsFresh: true,
      // The week read is today and six days: a booking last night's record holds past it still counts.
      horizonDays: 6,
      recentSessions: null,
      packageIndex,
      packageStudioId: studioId,
      myIds,
      myName: authTrainer.fullName ?? null,
      trainerNameOf,
    });
    const rows = buildDirectoryRows(booked, ctx);
    const critical = own.critical;
    return momentsToday({
      day: today,
      today,
      now,
      tz,
      schedules: week.entries,
      clientsById: new Map(clients.filter((c) => c.id).map((c) => [c.id as string, c])),
      rowsById: new Map(rows.map((r) => [r.id, r])),
      studios,
      logged: logged.logged,
      criticalFor: (id) => (critical ? critical.filter((e) => e.clientId === id) : null),
      myIds,
      myName: authTrainer.fullName ?? null,
      trainerNameOf,
    });
  }, [weekUnread, trainers, authTrainer, uid, week.entries, clients, today, now, tz, studios, studioId, packageIndex, own.critical, logged.logged]);
  const catchRows = useMemo(() => (dayEntries ? catchToday(dayEntries, now.getTime(), tz) : null), [dayEntries, now, tz]);
  const leftRows = useMemo(
    () => (weekUnread ? null : leftWithNothingBooked({ clients, weekEntries: week.entries, logged: logged.logged, today, now, tz, readAt: week.readAt })),
    [weekUnread, clients, week.entries, logged.logged, today, now, tz, week.readAt],
  );
  const catchCount = catchRows === null ? null : catchRows.length + (leftRows?.length ?? 0);

  /* ---- Slipping away: the Journey's one rule (journey/states.ts) ---- */
  const journeys = useMemo(() => {
    if (renewalSettings.loading || studioSettings.loading || stored.loading) return null;
    return studioJourneys({
      clients,
      studioId,
      today,
      now,
      tz,
      studios,
      weekEntries: week.entries,
      weekReady: week.read === "ready",
      packageIndex,
      trainers,
      myIds: myTrainerIds(authTrainer, uid),
      myName: authTrainer.fullName ?? null,
      settings,
      nightlyStale: nightly.stale,
      lines,
      watchlist: watchlist.value,
      cases: cases.cases,
      stored: stored.failed ? null : { summary: stored.summary, states: stored.states },
    });
  }, [stored, renewalSettings.loading, studioSettings.loading, clients, studioId, today, now, tz, studios, week.entries, week.read, packageIndex, trainers, authTrainer, uid, settings, nightly.stale, lines, watchlist.value, cases.cases]);
  const slipping = useMemo(() => {
    if (!journeys) return null;
    const both = [...listFor(journeys, "at-risk", "all"), ...listFor(journeys, "drifting", "all")];
    // Catchable first across both: not yet answered, their usual trainer in today, then the louder line, then the closest to it.
    const rank = (e: JourneyEntry) => (e.watch === "watching" ? 0 : 1) * 4 + (e.usualInToday ? 0 : 2) + (e.journey.state === "at-risk" ? 0 : 1);
    return both.sort((a, b) => rank(a) - rank(b) || (a.journey.daysSince ?? 0) - (b.journey.daysSince ?? 0));
  }, [journeys]);
  const slippingOpen = useMemo(() => (slipping ?? []).filter((e) => e.watch === "watching"), [slipping]);
  const slippingWeek = useMemo(() => (journeys ? thisWeek(journeys, today) : null), [journeys, today]);
  const back = useMemo(() => backAgain(watchlist.value, clients, today), [watchlist.value, clients, today]);

  /* ---- Since yesterday ---- */
  const changed = useMemo(() => (weekUnread ? [] : sinceYesterday(week.entries, today, tz, dayStartMs(addDays(today, -1), tz))), [weekUnread, week.entries, today, tz]);

  /* ---- Coming up ---- */
  const weekDays = useMemo(() => Array.from({ length: WEEK_DAYS }, (_, i) => addDay(today, i)), [today]);
  const changesByDay = useMemo(() => changeCounts(week.entries, weekDays, tz), [week.entries, weekDays, tz]);
  const hotIds = useMemo(() => new Set(pain.rows.map((r) => r.clientId)), [pain.rows]);
  const days = useMemo(
    () => nextDays({ weekEntries: week.entries, changesByDay, momentsByDay: countByDay(moment.rows), hotClientIds: hotIds, clients, today, tz }),
    [week.entries, changesByDay, moment.rows, hotIds, clients, today, tz],
  );
  const unbooked = useMemo(() => notBookedAhead(clients), [clients]);
  const renewals = useMemo(() => renewalsQuestion(clients, cyclesRead.cycles, settings, today, !cyclesRead.failed), [clients, cyclesRead.cycles, cyclesRead.failed, settings, today]);
  const openingsLines = useMemo(() => {
    if (!readsWeeks) return [];
    const next = openingsNextDays({
      today: openings.today,
      now: openings.now,
      tz: openings.tz,
      read: week.read,
      connected: openings.connected,
      bookings: week.entries,
      docs: openings.weeks.docs,
      trainers: openings.refs,
      staffIds: openings.staffIds,
      worksHere: openings.worksHere,
      usual: openings.usual?.times ?? null,
      marks: openings.marks.byTime,
    });
    // Openings' lines on Coming up's OWN days (from tomorrow, the next three
    // with bookings): today's room is Openings' own to show (the Openings
    // round's review).
    const panelDays = new Set(days.map((d) => d.day));
    return overviewLines(
      next.lines.filter((l) => panelDays.has(l.dateKey)),
      openings.today,
      openings.tz,
      WEEK_DAYS,
    );
  }, [readsWeeks, days, openings.today, openings.now, openings.tz, week.read, openings.connected, week.entries, openings.weeks.docs, openings.refs, openings.staffIds, openings.worksHere, openings.usual, openings.marks.byTime]);
  const openOpenings =
    onOpenMyStudio && readsWeeks
      ? () => {
          showOpenings("next", { kind: "anyone" });
          rememberMyStudioSection("openings");
          onOpenMyStudio();
        }
      : undefined;
  const openLiveFloor = onOpenMyStudio
    ? () => {
        rememberMyStudioSection("relay");
        onOpenMyStudio();
      }
    : undefined;

  /* ---- Going right / Worth a look ---- */
  const goingRight = moment.rows.filter((r) => r.kind !== "gesture" || !r.needsOwner);
  const names = useMemo(() => trainerNames(trainers), [trainers]);
  const hours = useMemo(() => hoursThisWeek(recent.sessions, today, sessionMinutesOf(studio)), [recent.sessions, today, studio]);
  const insight = useMemo(() => {
    if (recent.loading || recent.failed) return null;
    const summary = studioSummary(recent.sessions);
    const found = observations(summary, trainerMetrics(recent.sessions, names), returnRate(recent.sessions, startMs, now.getTime()));
    return { summary, first: found[0] ?? null };
  }, [recent.loading, recent.failed, recent.sessions, names, startMs, now]);
  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? clientDisplayName(c, "A client") : "A client at this studio";
  };
  const machineName = (id: string) => machines.find((m) => m.id === id)?.name ?? id;

  /* ---- the huddle: the brief's own lines, worked out only while it is open (team/huddle-agenda.ts) ---- */
  const huddleInput = useMemo<BriefHuddleInput | null>(() => {
    if (!huddleOpen) return null;
    const pending = painPending.pending[0] ?? null;
    const acknowledged = pending ? null : (pain.rows[0] ?? null);
    const concern = needsLoading
      ? undefined
      : pending
        ? `${pending.name}: ${pending.sentence}`
        : acknowledged
          ? `${acknowledged.name}: ${acknowledged.sentence} It's acknowledged.`
          : null;
    const backRow = back[0] ?? null;
    const journeyBack = slippingWeek?.back[0] ?? null;
    const moment = goingRight[0] ?? null;
    const win = backRow
      ? `${backRow.name}: ${backRow.sentence}`
      : journeyBack
        ? `${journeyBack.row.name.display} is booked again after a gap.`
        : moment
          ? `${moment.name}: ${dayWord(moment.day, today)} — ${moment.sentence}`
          : delight.isLoading || own.loading || !journeys
            ? undefined
            : null;
    const firstName = (name: string) => name.split(" ")[0];
    const catchLines =
      catchRows === null
        ? null
        : [
            ...catchRows.map((r) => ({ tag: formatStudioTime(new Date(r.at), tz), text: `${r.name}: ${r.proof}` })),
            ...(leftRows ?? []).map((r) => ({ tag: "Nothing booked", text: `${r.name}: ${r.sentence}` })),
            ...slippingOpen
              .filter((e) => e.usual && e.usualInToday)
              .slice(0, SLIPPING_SHOWN)
              .map((e) => ({ tag: "Ask", text: `${firstName(e.usual!.name)} may know why ${e.row.name.display} hasn't been in. ${e.journey.why}` })),
          ];
    const floor = [
      ...(neverLogged ? chase.map((c) => `${c.trainerName}: ${c.clientName}'s ${c.at} session has no workout logged yet.`) : []),
      ...(fit.status !== "loading" && fit.status !== "failed" && fit.clients > 0
        ? [`Machine fit: ${fit.clients} client${fit.clients === 1 ? " is" : "s are"} set somewhere unusual for their build, on ${fit.machines} machine${fit.machines === 1 ? "" : "s"}.`]
        : []),
    ];
    const recognition = (slippingWeek?.back ?? []).filter((e) => e.usual).map((e) => `${e.row.name.display} is booked again after a gap, usually with ${firstName(e.usual!.name)}.`);
    return { concern, win, catchLines, floor, recognition };
  }, [huddleOpen, painPending.pending, pain.rows, needsLoading, back, slippingWeek, goingRight, today, delight.isLoading, own.loading, journeys, catchRows, leftRows, slippingOpen, tz, neverLogged, chase, fit]);

  /* ---- the actions ---- */
  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusyKey(key);
    try {
      await work();
    } catch {
      /* the toast has already said so; the row stays */
    } finally {
      setBusyKey(null);
    }
  };
  const ackRows = (rows: typeof pain.rows) =>
    run("ack", () => acknowledge(studioId, keysToAcknowledge(rows, acks.value).map((key) => ({ key, clientId: rows.find((r) => r.ackKeys.includes(key))?.clientId ?? "" })), me));
  const takeGesture = (key: string) => {
    const row = delightById.get(key);
    const opp = row?.entry.opportunity;
    if (!row || !opp) return;
    void run(key, () => setGestureStatus(row.entry.clientId, row.entry.id, opp, opp.status === "idea" ? "planned" : opp.status, { owner: me }));
  };
  const snoozeClient = (clientId: string, untilDay: string) =>
    run(`watch:${clientId}`, async () => {
      await writeWatch(studioId, snooze(clientId, untilDay));
      setSnoozing(null);
    });
  const dismissClient = (clientId: string) => run(`watch:${clientId}`, () => writeWatch(studioId, dismissal(clientId, clients.find((c) => c.id === clientId), me, today)));
  const gotIt = (clientId: string) => run(`watch:${clientId}`, () => clearWatch(studioId, clientId));
  const didntCome = (bookingId: string, clientId: string) => run(`mark:${bookingId}`, () => markNoShow(studioId, { id: bookingId, clientId, day: today }, me));
  const takeBack = (bookingId: string) => run(`mark:${bookingId}`, () => takeBackNoShow(studioId, bookingId));

  const door = (to: OverviewLink, label: string) =>
    onOpen && (
      <AdminButton size="sm" variant="quiet" onClick={() => onOpen(to)}>
        {label} <ChevronRight className="w-3.5 h-3.5" aria-hidden />
      </AdminButton>
    );

  /* ---- the bottom line ---- */
  const reading = needsLoading && week.loading;
  const line = bottomLine({
    part: partOfDay(now, tz),
    needs: needsCount,
    needsPartial: needsPartial || needsLoading,
    catchCount,
    neverLogged,
    unloggedInNeeds: canMark,
    week: week.read,
    renewalUnknown,
    nightly,
    tz,
  });
  const checkedAt = formatStudioTime(now, tz);
  const fresh = [
    week.readAt ? `Schedule read ${formatStudioTime(new Date(week.readAt), tz)}` : week.loading ? "Schedule: reading…" : "Schedule couldn't be read",
    nightly.lastChangedAt
      ? `Nightly record last changed ${formatStudioDate(nightly.lastChangedAt, { weekday: "short", month: "short", day: "numeric" }, tz)}`
      : nightly.homeClients > 0
        ? "No nightly record yet"
        : "No clients at this studio yet",
  ];

  return (
    <div className="adm ops-brief">
      <header className="ops-brief__head">
        <div>
          <span className="ops-brief__eyebrow">Today · {studio.name}</span>
          <h1 className="ops-brief__title">{formatStudioDate(now, { weekday: "long", month: "long", day: "numeric" }, tz)}</h1>
        </div>
        <AdminButton variant="hero" onClick={() => setHuddleOpen(true)}>
          <UsersRound className="w-4 h-4" aria-hidden /> Start huddle
        </AdminButton>
      </header>

      <FreshnessLine
        parts={fresh}
        unknown={renewalUnknown}
        unknownWhy={`${renewalUnknown === 1 ? "One client has" : `${renewalUnknown} clients have`} no renewal record from last night, or not enough Mindbody data for one (${[...nightly.missing, ...nightly.unknownData].slice(0, 6).map(clientName).join(", ")}${renewalUnknown > 6 ? ", and more" : ""}). Their renewal timing and their rhythm are unknown, and they're never counted as on track or steady.`}
        door={door("mindbody", "Mindbody")}
      />

      <BottomLineBox
        sentence={reading ? "Reading the studio's day…" : line.sentence}
        rules={line.rules}
        facts={
          week.failed ? (
            <span>Today's numbers are missing, not zero: the schedule couldn't be read.</span>
          ) : week.loading ? (
            <span>Reading today's bookings…</span>
          ) : (
            <>
              <span className="ops-brief__eyebrow">Today</span>
              <span>
                <b>{numbers.booked}</b> booked
              </span>
              <span>
                <b>{neverLogged === null ? "—" : numbers.done}</b> done
              </span>
              <span>
                <b>{numbers.onTheFloor}</b> on the floor
              </span>
              <span>
                <b>{numbers.stillToCome}</b> to come
              </span>
              <span>
                <b>{trainersOn}</b> {trainersOn === 1 ? "trainer" : "trainers"} on
              </span>
              {openLiveFloor && (
                <AdminButton size="sm" variant="ghost" onClick={openLiveFloor}>
                  Live floor on My Studio <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                </AdminButton>
              )}
            </>
          )
        }
        below={
          canMark ? (
            marked.length > 0 ? (
              <div className="ops-bluf__chase">
                <p className="ops-quiet">
                  Marked didn't come today: {marked.length}. They count as no-shows, never as visits. Marked by mistake? Take it back and the session is
                  unlogged again.
                </p>
                <ActionRows
                  rows={marked.map((m) => ({
                    key: `marked:${m.id}`,
                    clientId: m.clientId,
                    name: m.booking?.clientName || clientName(m.clientId ?? ""),
                    sentence: `${m.booking ? `${formatStudioTime(toDate(m.booking.startTime) ?? now, tz)} with ${m.booking.trainerName || "no trainer named"}` : "Today"} — didn't come.`,
                    proof: m.markedBy?.name ? `Marked by ${m.markedBy.name}.` : "Marked by a leader.",
                    tone: "info",
                    badge: "Didn't come",
                    actions: (
                      <AdminButton size="sm" variant="ghost" busy={busyKey === `mark:${m.id}`} onClick={() => void takeBack(m.id)}>
                        Take back
                      </AdminButton>
                    ),
                  }))}
                  onOpenClient={onNavigateProfile}
                  empty=""
                />
              </div>
            ) : undefined
          ) : neverLogged !== null && neverLogged > 0 ? (
            <div className="ops-bluf__chase">
              <p className="ops-quiet">
                {neverLogged} finished {neverLogged === 1 ? "session has" : "sessions have"} no workout logged. Its trainer logs it on the client's profile; a
                session that didn't happen stays on this list today.
              </p>
              <AdminButton size="sm" onClick={() => setShowChase((v) => !v)} aria-expanded={showChase}>
                {showChase ? "Hide who" : "See who to ask"}
              </AdminButton>
              {showChase && (
                <ActionRows
                  rows={chase.map((c) => ({
                    key: c.id,
                    clientId: c.clientId,
                    name: c.clientName,
                    sentence: `${c.at} with ${c.trainerName} — past its slot, nothing logged.`,
                    proof: "No Journey session for them today. Trained and not logged, a no-show, or never happened? Someone on the floor knows.",
                    tone: "alert",
                    badge: "Not logged",
                  }))}
                  onOpenClient={onNavigateProfile}
                  empty=""
                />
              )}
            </div>
          ) : undefined
        }
      />

      {/* 1 · Needs you */}
      <BriefSection
        id="needs"
        title="Needs you"
        count={needsLoading ? null : needsCount}
        hot
        sub="each one clears right here"
        door={
          painPending.pending.length > 1 ? (
            <AdminButton size="sm" variant="primary" busy={busyKey === "ack"} onClick={() => void ackRows(painPending.pending)}>
              Acknowledge all
            </AdminButton>
          ) : undefined
        }
      >
        {needsLoading ? (
          <BriefEmpty>Reading incidents, notes and the Dial…</BriefEmpty>
        ) : needsCount === 0 ? (
          <BriefEmpty>
            {unloggedStillReading
              ? "Nothing needs you so far. Today's logging is still being read, so a session nobody logged may not be here yet."
              : needsPartial
                ? "Nothing that could be read needs you. Part of this couldn't be read just now, so there may be more."
                : canMark
                  ? `Nothing to acknowledge, take, review or mark. Checked ${checkedAt}.`
                  : `Nothing to acknowledge, take or review. Checked ${checkedAt}.`}
          </BriefEmpty>
        ) : (
          <>
            <ActionRows
              rows={painPending.pending.map((r) => ({
                key: `pain:${r.clientId}`,
                clientId: r.clientId,
                name: r.name,
                sentence: r.sentence,
                proof: r.proof,
                tone: r.tone,
                badge: r.tone === "alert" ? "Acknowledge" : "Pain",
                actions: (
                  <AdminButton size="sm" variant="primary" busy={busyKey === "ack"} onClick={() => void ackRows([r])}>
                    Acknowledge
                  </AdminButton>
                ),
              }))}
              onOpenClient={onNavigateProfile}
              empty=""
            />
            {unlogged.length > 0 && (
              <ActionRows
                rows={unlogged.map((c) => ({
                  key: `unlogged:${c.id}`,
                  clientId: c.clientId,
                  name: c.clientName,
                  sentence: `${c.at} with ${c.trainerName} — past its slot, nothing logged.`,
                  proof:
                    "No Journey session for her today. Ask on the floor: if she trained, her trainer logs it on her profile and this row goes by itself; if she didn't come, mark it.",
                  tone: "alert",
                  badge: "Not logged",
                  actions:
                    c.bookingId && c.clientId ? (
                      <AdminButton size="sm" busy={busyKey === `mark:${c.bookingId}`} onClick={() => void didntCome(c.bookingId as string, c.clientId as string)}>
                        Didn't come
                      </AdminButton>
                    ) : undefined,
                }))}
                onOpenClient={onNavigateProfile}
                empty=""
              />
            )}
            <ActionRows
              rows={unowned.map((r) => ({
                key: r.key,
                clientId: r.clientId,
                name: r.name,
                sentence: `${dayWord(r.day, today)} — ${r.sentence}`,
                proof: "A gesture the team promised itself, and nobody owns it yet.",
                tone: "warn",
                badge: "No owner",
                actions: (
                  <AdminButton size="sm" busy={busyKey === r.key} onClick={() => takeGesture(r.key)}>
                    Take it
                  </AdminButton>
                ),
              }))}
              onOpenClient={onNavigateProfile}
              empty=""
            />
            {review.length > 0 && (
              <div className="ops-sec__foot">
                <span className="ops-quiet">
                  {review.length} {review.length === 1 ? "note has" : "notes have"} mattered 60 days or more. Still matters, or no longer?
                </span>
                <AdminButton size="sm" onClick={() => setReviewOpen(true)}>
                  Review
                </AdminButton>
              </div>
            )}
            {needsPartial && (
              <p className="ops-sec__note">
                {unloggedStillReading ? "Today's logging is still being read, so a session nobody logged may not be here yet." : "Part of this couldn't be read just now, so the list may be short."}
              </p>
            )}
          </>
        )}
      </BriefSection>

      {/* 2 · Catch today */}
      <BriefSection id="catch" title="Catch today" count={catchCount} sub="in person, in the order they're in">
        {catchRows === null ? (
          <BriefEmpty>{week.loading ? "Reading today's bookings…" : "Today's bookings couldn't be read just now, so who to catch is unknown."}</BriefEmpty>
        ) : catchCount === 0 ? (
          <BriefEmpty>Nobody to catch in person today. Checked {checkedAt}.</BriefEmpty>
        ) : (
          <>
            <ActionRows
              rows={catchRows.map((r) => ({ key: r.key, clientId: r.clientId, name: r.name, sentence: r.sentence, proof: r.proof, tone: "info", badge: "Today" }))}
              onOpenClient={onNavigateProfile}
              empty=""
            />
            {leftRows && leftRows.length > 0 && (
              <ActionRows
                rows={leftRows.map((r) => ({ key: r.key, clientId: r.clientId, name: r.name, sentence: r.sentence, proof: r.proof, tone: "warn", badge: "Nothing booked" }))}
                onOpenClient={onNavigateProfile}
                empty=""
              />
            )}
          </>
        )}
        {catchRows !== null && leftRows === null && <p className="ops-sec__note">Today's logging couldn't be read, so who trained today and has nothing booked can't be told yet.</p>}
      </BriefSection>

      {/* 3 · Slipping away */}
      <BriefSection
        id="slipping"
        title="Slipping away"
        count={slipping === null ? null : slippingOpen.length}
        sub={
          slipping === null
            ? "reading the studio's clients…"
            : `${slipping.filter((e) => e.journey.state === "drifting").length} drifting · ${slipping.filter((e) => e.journey.state === "at-risk").length} at risk${
                slippingWeek && slippingWeek.back.length > 0 ? ` · ${slippingWeek.back.length} booked again after a gap` : ""
              }${slipping.length > slippingOpen.length ? ` · ${slipping.length - slippingOpen.length} already answered` : ""}`
        }
        door={door("journey", "Journey")}
      >
        {nightly.stale && (
          <p className="ops-sec__note">
            {nightly.lastChangedAt
              ? `The nightly record hasn't changed since ${formatStudioDate(nightly.lastChangedAt, { weekday: "short", month: "short", day: "numeric" }, tz)}, so nobody's rhythm is judged from it: nobody is called slipping until it runs again.`
              : "There is no nightly record for this studio yet, so nobody's rhythm is known."}
          </p>
        )}
        {slipping === null ? (
          <BriefEmpty>Reading the studio's clients…</BriefEmpty>
        ) : slippingOpen.length === 0 ? (
          <BriefEmpty>
            {slipping.length > 0
              ? "Everyone slipping has already been snoozed or dismissed. They're on the Journey."
              : week.read !== "ready"
                ? "Whether anyone is slipping can't be said until the week's bookings are read."
                : `Nobody is past ${multipleWords(lines.driftMultiple).toLowerCase()} their usual gap or the studio's ${settings.breakDays}-day line with nothing booked.`}
          </BriefEmpty>
        ) : (
          <ActionRows
            rows={slippingOpen.slice(0, SLIPPING_SHOWN).map((e) => ({
              key: e.id,
              clientId: e.id,
              name: e.row.name.display,
              sentence: e.journey.why,
              proof: [e.usual ? (e.usualInToday ? `${e.usual.name.split(" ")[0]} is in today, ${e.usualInToday}` : `usually with ${e.usual.name.split(" ")[0]}`) : null, e.journey.proof].filter(Boolean).join(" · "),
              tone: e.journey.state === "at-risk" ? "warn" : "info",
              badge: e.journey.state === "at-risk" ? "At risk" : "Drifting",
              actions: (
                <>
                  <AdminButton size="sm" busy={busyKey === `watch:${e.id}`} onClick={() => setSnoozing((v) => (v === e.id ? null : e.id))} aria-expanded={snoozing === e.id}>
                    Snooze
                  </AdminButton>
                  <AdminButton size="sm" variant="ghost" busy={busyKey === `watch:${e.id}`} onClick={() => void dismissClient(e.id)}>
                    Dismiss
                  </AdminButton>
                </>
              ),
              below: snoozing === e.id ? <SnoozeChooser today={today} onPick={(day) => void snoozeClient(e.id, day)} onCancel={() => setSnoozing(null)} /> : undefined,
            }))}
            total={slippingOpen.length}
            onOpenClient={onNavigateProfile}
            empty=""
            moreLabel="on the Journey"
          />
        )}
      </BriefSection>

      {/* 4 · Since yesterday */}
      <BriefSection id="since" title="Since yesterday" count={weekUnread ? null : changed.length} sub="cancellations and moves, each held against its own day" door={door("week", "All changes")}>
        {week.loading ? (
          <BriefEmpty>Reading the week…</BriefEmpty>
        ) : week.failed ? (
          <BriefEmpty>{NOT_READ}</BriefEmpty>
        ) : changed.length === 0 ? (
          <BriefEmpty>Nothing cancelled or moved since yesterday.</BriefEmpty>
        ) : (
          <ActionRows
            rows={changed.map((c) => {
              const text = describeChange(c, tz);
              return {
                key: c.id,
                clientId: c.clientId,
                name: c.clientName,
                sentence: `${text.sentence} Held against ${heldAgainst(c.forDay, today)}.`,
                proof: text.proof,
                tone: c.reading === "cancellation" ? "warn" : "info",
                badge: c.reading === "cancellation" ? "Cancelled" : "Moved",
              };
            })}
            onOpenClient={onNavigateProfile}
            empty=""
          />
        )}
      </BriefSection>

      {/* 5 · Coming up */}
      <BriefSection id="coming" title="Coming up" sub="the next three days with bookings">
        {week.loading ? (
          <BriefEmpty>Reading the week…</BriefEmpty>
        ) : week.failed ? (
          <BriefEmpty>{NOT_READ}</BriefEmpty>
        ) : (
          <div className="ops-days">
            {days.map((d) => (
              <div key={d.day} className="ops-day">
                <span className="ops-day__label">
                  {d.label} · {d.dateLabel}
                </span>
                <span className="ops-day__big">{d.booked} booked</span>
                <span className="ops-day__fact">{d.changes === 0 ? "no changes yet" : `${d.changes} change${d.changes === 1 ? "" : "s"} already`}</span>
                <span className="ops-day__fact">{d.hot === 0 ? "nobody with a live note" : `${d.hot} with a live note: ${d.hotNames.join(", ")}`}</span>
                <span className="ops-day__fact">{d.moments === 0 ? "no moments" : `${d.moments} moment${d.moments === 1 ? "" : "s"}`}</span>
              </div>
            ))}
          </div>
        )}
        {openingsLines.length > 0 && (
          <div className="p-3 flex flex-col gap-2" role="group" aria-label="Openings in the next three days">
            {openingsLines.slice(0, OPENINGS_SHOWN).map((text) => (
              <Line key={text} icon={<CalendarRange className="w-4 h-4" aria-hidden />} label="Openings" text={text} tone="neutral" onOpen={openOpenings} />
            ))}
            {openingsLines.length > OPENINGS_SHOWN && <p className="adm-ov__more">{overviewMoreLine(openingsLines.length - OPENINGS_SHOWN)}</p>}
          </div>
        )}
        <p className="ops-sec__note">
          {unbooked.measured === 0
            ? "Who has nothing booked ahead is unknown: no client has a nightly record yet, so nobody is called booked ahead."
            : unbooked.count === 0
              ? `All ${unbooked.measured} active clients with a nightly record have something booked ahead.`
              : `${unbooked.count} of ${unbooked.measured} active clients with a nightly record have nothing booked ahead.`}
        </p>
        {unbooked.count > 0 && (
          <ActionRows
            rows={unbooked.rows.map((r) => ({ key: `unbooked:${r.clientId}`, clientId: r.clientId, name: r.name, sentence: "Nothing on the books after their last visit.", proof: r.proof, tone: "warn", badge: "Not booked" }))}
            total={unbooked.count}
            onOpenClient={onNavigateProfile}
            empty=""
            moreLabel="with nothing booked ahead"
          />
        )}
        <div className="ops-sec__foot">
          <span className="ops-quiet">
            {renewals.counts["talk-now"] + renewals.counts["before-charge"] === 0
              ? `No renewal conversations due this week. ${renewals.counts["coming-up"]} coming up in the next ${settings.horizonMonths} months.`
              : `${renewals.counts["talk-now"]} renewal ${renewals.counts["talk-now"] === 1 ? "talk" : "talks"} due now, ${renewals.counts["before-charge"]} before a charge${
                  renewals.notTalked === null ? ". Whether anyone has talked to them couldn't be read just now." : `, ${renewals.notTalked} with no conversation logged yet.`
                }`}
          </span>
          {door("renewals", "Renewals")}
        </div>
      </BriefSection>

      {/* 6 · Going right */}
      <BriefSection id="right" title="Going right" sub="worth saying out loud">
        {back.length > 0 && (
          <ActionRows
            rows={back.map((r) => ({
              key: `back:${r.clientId}`,
              clientId: r.clientId,
              name: r.name,
              sentence: r.sentence,
              proof: r.proof,
              badge: "Back",
              actions: (
                <AdminButton size="sm" variant="primary" busy={busyKey === `watch:${r.clientId}`} onClick={() => void gotIt(r.clientId)}>
                  Got it
                </AdminButton>
              ),
            }))}
            onOpenClient={onNavigateProfile}
            empty=""
          />
        )}
        {delight.isLoading || own.loading ? (
          <BriefEmpty>Reading the week's moments…</BriefEmpty>
        ) : delight.failed ? (
          <BriefEmpty>The Delight queue couldn't be read just now, so the week's gestures are unknown.</BriefEmpty>
        ) : goingRight.length === 0 && back.length === 0 ? (
          <BriefEmpty>{weekUnread ? "Booked milestones (a 50th or 100th session) couldn't be read just now." : "No milestones, dates or gestures in the next seven days."}</BriefEmpty>
        ) : (
          <ActionRows
            rows={goingRight.slice(0, 8).map((r) => ({
              key: r.key,
              clientId: r.clientId,
              name: r.name,
              sentence: `${dayWord(r.day, today)} — ${r.sentence}`,
              proof: r.proof,
              tone: "info",
              badge: r.kind === "gesture" ? "Gesture" : r.kind === "date" ? "Date" : "Milestone",
            }))}
            total={goingRight.length}
            onOpenClient={onNavigateProfile}
            empty=""
            moreLabel="on Moments"
          />
        )}
        {weekUnread && goingRight.length > 0 && <p className="ops-sec__note">Booked milestones (a 50th or 100th session) couldn't be read just now.</p>}
        <div className="ops-sec__foot">{door("delight", "Moments")}</div>
      </BriefSection>

      {/* 7 · Worth a look */}
      <BriefSection id="look" title="Worth a look" sub="the week's slower signals">
        {own.watch && own.watch.rows.length > 0 && (
          <ActionRows
            rows={own.watch.rows.map((r) => ({
              key: `drop:${r.clientId}:${r.machineId}`,
              clientId: r.clientId,
              name: clientName(r.clientId),
              sentence: dropSentence(r, machineName(r.machineId)),
              proof: `Latest set ${r.day}; Sunday's read (${own.watch!.builtAt.slice(0, 10)}).`,
              tone: r.drop >= 0.5 ? "alert" : "warn",
              badge: "Strength dropped",
            }))}
            onOpenClient={onNavigateProfile}
            empty=""
          />
        )}
        <div className="p-3 flex flex-col gap-2">
          <Line
            icon={<TrendingDown className="w-4 h-4" aria-hidden />}
            label="Strength dropped"
            text={
              own.watch === undefined
                ? own.failed.watch
                  ? "The weekly read could not be loaded just now."
                  : "Reading Sunday's list…"
                : own.watch === null
                  ? "The weekly read has not run yet. It runs on Sunday nights."
                  : own.watch.rows.length === 0
                    ? `Nobody dropped a third or more at the same weight in the two weeks before Sunday's read (${own.watch.builtAt.slice(0, 10)}).`
                    : `${own.watch.clients} client${own.watch.clients === 1 ? "" : "s"} dropped by a third or more at the same weight, as of Sunday's read.`
            }
            tone={own.watch && own.watch.rows.length > 0 ? "warn" : "neutral"}
          />
          <Line
            icon={<Ruler className="w-4 h-4" aria-hidden />}
            label="Machine fit"
            text={fit.status === "loading" ? "Reading the set-ups…" : fit.status === "failed" ? NOT_READ : fit.clients === 0 ? "Nobody is set somewhere unusual for their build." : `${fit.clients} client${fit.clients === 1 ? "" : "s"} worth a look, on ${fit.machines} machine${fit.machines === 1 ? "" : "s"}.`}
            tone={fit.clients > 0 ? "warn" : "neutral"}
            onOpen={onOpen && (() => onOpen("floor"))}
          />
          <Line
            icon={<TrendingUp className="w-4 h-4" aria-hidden />}
            label="Trends"
            text={
              recent.loading
                ? "Reading the floor…"
                : recent.failed
                  ? NOT_READ
                  : !insight?.summary.enoughToJudge
                    ? `Not enough sessions in the last ${DAYS_READ} days to say anything yet.`
                    : (insight.first?.text ?? "Nothing stands out in the last two weeks.")
            }
            tone={insight?.first?.tone === "problem" ? "alert" : insight?.first?.tone === "watch" ? "warn" : "neutral"}
            onOpen={onOpen && (() => onOpen("insights"))}
          />
          <Line
            icon={<Clock3 className="w-4 h-4" aria-hidden />}
            label="Hours"
            text={recent.loading ? "Adding up the week…" : recent.failed ? NOT_READ : `${formatHours(hours.minutes)} this week so far, over ${hours.sessions} session${hours.sessions === 1 ? "" : "s"} by ${hours.trainers} trainer${hours.trainers === 1 ? "" : "s"} (since Monday ${hours.since.slice(5)}).`}
            tone="neutral"
            onOpen={onOpen && (() => onOpen("hours"))}
          />
        </div>
      </BriefSection>

      {(own.failed.dated || acks.failed || watchlist.failed) && (
        <AdminNotice tone="warn">
          Part of the page could not be read just now (
          {[own.failed.dated ? "dated notes" : null, acks.failed ? "acknowledgements" : null, watchlist.failed ? "the watchlist" : null].filter(Boolean).join(", ")}
          ). What is shown is what could be read — not the whole picture.
        </AdminNotice>
      )}

      {footer}

      {reviewOpen && (
        <ReviewNotesDialog
          open
          onOpenChange={setReviewOpen}
          rows={review}
          onOpenClient={onNavigateProfile}
          author={uid ? { id: uid, fullName: authTrainer.fullName || authTrainer.initials || "", initials: authTrainer.initials || "" } : null}
        />
      )}
      {huddleInput && (
        <BriefHuddle
          studioId={studioId}
          studioName={studio.name}
          today={today}
          dateLabel={formatStudioDate(now, { weekday: "long", month: "long", day: "numeric" }, tz)}
          authTrainer={authTrainer}
          input={huddleInput}
          onClose={() => setHuddleOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function addDay(day: string, n: number): string {
  return addDays(day, n);
}

function countByDay(rows: Array<{ day: string }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.day] = (out[r.day] ?? 0) + 1;
  return out;
}

/** "Today", "Tomorrow", else "Tue". */
function dayWord(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}
