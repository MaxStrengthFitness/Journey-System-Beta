/**
 * OPERATIONS → OVERVIEW — the first screen of Operations.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): "not the Monday page —
 * studio management opens this every day, it is the Overview. A summary
 * layer, not a destination: each panel gives a fast read, then drills into
 * its own full tab." And from the brief's conversation: what a leader needs
 * to be doing TODAY to prepare, locked down for the NEXT THREE DAYS, with a
 * good read on the rest of the week — schedule changes, cancellations,
 * injured or regressing clients, anniversaries, critical notes, who is not
 * pre-booked, who is slipping away, and how the team is doing.
 *
 * THREE DEPTHS, top to bottom:
 *   1. the ten-second read — today's numbers (never logged is the loud one)
 *      and the Needs-you strip, which counts every action waiting;
 *   2. the panels — a headline sentence, the top rows, an inline action
 *      (Acknowledge, Snooze, Dismiss, Got it) and a door to the deep dive;
 *   3. the deep dives — the tabs, plus two views of this page's own:
 *      Changes (the week's cancellations and moves, day by day) and the
 *      Attendance watch (the whole list, the snoozed, the dismissed, who
 *      is back).
 *
 * Panels fold to their sentence, remembered per device. On a desk the
 * panels sit in two columns — act today on the left, look ahead on the
 * right; on a portrait iPad they stack in reading order.
 *
 * READS PER OPEN, one studio: the week's schedule (live; changes/
 * useWeekSchedule), today's Journey sessions (live; useTodaySessions — a
 * booking is DONE when a session was logged for that client that day, AJ
 * Sep 24 2026, because Mindbody's "Completed" never reaches the booking),
 * the renewal settings and cycles, the last 14 days of
 * sessions (sessions-range — pain, the Insights line, this week's hours and
 * the Team panel all come from it), the studio's incidents, critical notes,
 * dated notes and the Sunday watch document (useOverviewReads), the
 * watchlist and acknowledgements (live), the Delight queue and the
 * machine-fit index. Under "All my studios" the page is the network view.
 */
import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarClock, CalendarDays, CalendarRange, ChevronRight, Clock3, Gift, HeartPulse, NotebookPen, Ruler, TrendingDown, TrendingUp, UserRoundX, Users } from "lucide-react";
import { auth } from "../../../firebase";
import type { Client, Machine, ScheduleEntry, Studio, Trainer } from "../../../types";
import { clientDisplayName } from "../../../lib/client-name";
import { formatStudioDate, studioDateKey } from "../../../lib/studio-time";
import { useDelightQueue } from "../../ford/useClientFord";
import { useCyclesFor } from "../../renewals/usePipeline";
import { useRenewalSettings } from "../../renewals/useRenewalSettings";
import type { RenewalSnapshot } from "../../renewals/types";
import { observations, returnRate, studioSummary, trainerMetrics } from "../insights/metrics";
import { formatHours, sessionMinutesOf, trainerNames } from "../hours/hours";
import { useWorthALook } from "../machine-fit/useFitFloor";
import { NetworkOverview } from "../network/NetworkOverview";
import { AdminButton, AdminEmpty, AdminHeader, AdminNotice, AdminScreen, AdminStatTile, AdminTiles } from "../primitives";
import { useOperationsScope } from "../scope-context";
import { useSessionsInRange } from "../sessions-range";
import { changeCounts, changesForDay, describeChange } from "../changes/changes";
import { useWeekSchedule, WEEK_DAYS } from "../changes/useWeekSchedule";
import { ChangesView } from "../changes/ChangesView";
import { backAgain, dismissal, keysToAcknowledge, pendingAcks, snooze, splitWatched } from "../attention/attention";
import { acknowledge, clearWatch, useAcknowledgements, useWatchlist, writeWatch } from "../attention/useAttention";
import { AttendanceWatchView } from "../attention/AttendanceWatchView";
import { entriesForDay } from "./floor";
import { attendanceQuestion, hoursThisWeek, notesToReview, painQuestion, renewalsQuestion, type OverviewRow } from "./questions";
import { dropSentence } from "./performance";
import { chaseList, pct, todayFoot, todayNumbers } from "./today";
import { moments, momentsByDay } from "./moments";
import { nextDays, notBookedAhead } from "./next-days";
import { teamThisWeek } from "./team";
import { ActionRows, Line, NeedsYou, OverviewPanel, Rows, SnoozeChooser, useFolded, type NeedChip } from "./pieces";
import { ReviewNotesDialog } from "./ReviewNotesDialog";
import { useOverviewReads } from "./useOverviewReads";
import { useTodaySessions } from "./useTodaySessions";
import "./overview.css";

export type OverviewLink = "renewals" | "delight" | "insights" | "floor";

export interface OverviewPageProps {
  /** Bumped by the shell when the Overview nav button is pressed while already on it: the page comes home from Changes or the Attendance watch. */
  homeSignal?: number;
  authTrainer: Trainer;
  studios: Studio[];
  trainers: Trainer[];
  machines: Machine[];
  clients: Client[];
  /** The app's live schedule. Kept for the shell's call site; the page reads its own week. */
  schedules?: ScheduleEntry[];
  activeStudioId: string | null;
  onNavigateProfile?: (clientId: string) => void;
  onOpen?: (tab: OverviewLink) => void;
}

const DAYS_READ = 14;

export function OverviewPage({ homeSignal = 0, authTrainer, studios, trainers, machines, clients, activeStudioId, onNavigateProfile, onOpen }: OverviewPageProps) {
  const ops = useOperationsScope();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const studio = studios.find((s) => s.id === activeStudioId) ?? null;
  const tz = studio?.timezone || undefined;
  const today = studioDateKey(now, tz) ?? "";

  if (ops.scope.kind === "all") {
    return (
      <AdminScreen>
        <AdminHeader icon={<Activity className="w-5 h-5" />} title="All my studios" subtitle={`${ops.studios.length} studios. Is anything wrong at any of them this morning?`} />
        <NetworkOverview studios={ops.studios} trainers={trainers} now={now.getTime()} />
      </AdminScreen>
    );
  }

  if (!activeStudioId || !studio) {
    return (
      <AdminScreen>
        <AdminHeader icon={<Activity className="w-5 h-5" />} title="Overview" />
        <AdminEmpty title="No studio">Switch the app to a studio to read its Overview.</AdminEmpty>
      </AdminScreen>
    );
  }

  return (
    <StudioOverview
      key={studio.id}
      homeSignal={homeSignal}
      studio={studio}
      today={today}
      now={now}
      me={{ id: auth.currentUser?.uid ?? authTrainer.authUid ?? authTrainer.id, name: authTrainer.fullName }}
      trainers={trainers}
      machines={machines}
      clients={clients}
      onNavigateProfile={onNavigateProfile}
      onOpen={onOpen}
    />
  );
}

/* ------------------------------------------------------------------ *
 * One studio
 * ------------------------------------------------------------------ */

type View = "home" | "changes" | "attendance";

function StudioOverview({
  homeSignal,
  studio,
  today,
  now,
  me,
  trainers,
  machines,
  clients,
  onNavigateProfile,
  onOpen,
}: {
  homeSignal: number;
  studio: Studio;
  today: string;
  now: Date;
  me: { id: string; name: string };
  trainers: Trainer[];
  machines: Machine[];
  clients: Client[];
  onNavigateProfile?: (clientId: string) => void;
  onOpen?: (tab: OverviewLink) => void;
}) {
  const studioId = studio.id;
  const tz = studio.timezone || undefined;
  const [view, setView] = useState<View>("home");
  useEffect(() => {
    setView("home");
  }, [homeSignal]);
  const [showChase, setShowChase] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [snoozing, setSnoozing] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const fold = useFolded();

  /* ---- the reads ---- */
  const week = useWeekSchedule(studioId, today, tz);
  const logged = useTodaySessions(studioId, today, tz);
  const own = useOverviewReads(studioId, today, tz);
  const watchlist = useWatchlist(studioId);
  const acks = useAcknowledgements(studioId);
  const delight = useDelightQueue({ studioId });
  const { settings } = useRenewalSettings(studioId);
  const cycleKeys = useMemo(() => clients.map((c) => (c.renewal as RenewalSnapshot | undefined)?.cycleKey).filter((k): k is string => Boolean(k)), [clients]);
  const cycles = useCyclesFor(studioId, cycleKeys);
  // Anchored on the studio day, not the ticking clock, so the read happens once a day.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startMs = useMemo(() => Date.now() - DAYS_READ * 86_400_000, [today]);
  const recent = useSessionsInRange({ studioId, startMs });
  const fit = useWorthALook(studioId, machines, clients, studio);

  /* ---- today ---- */
  const todayEntries = useMemo(() => entriesForDay(week.entries, today), [week.entries, today]);
  const numbers = useMemo(() => todayNumbers(todayEntries, now, logged.logged, tz), [todayEntries, now, logged.logged, tz]);
  const foot = todayFoot(numbers);
  const chase = useMemo(() => chaseList(todayEntries, now, logged.logged, tz), [todayEntries, now, logged.logged, tz]);
  // Done, Not completed and Never logged wait for both reads; a finished slot whose logging could not be read is missing, not zero.
  const dayLoading = week.loading || logged.loading;
  const missing = numbers.unknown > 0;

  /* ---- changes ---- */
  const weekDays = useMemo(() => Array.from({ length: WEEK_DAYS }, (_, i) => addDay(today, i)), [today]);
  const changesToday = useMemo(() => changesForDay(week.entries, today, tz), [week.entries, today, tz]);
  const changesByDay = useMemo(() => changeCounts(week.entries, weekDays, tz), [week.entries, weekDays, tz]);

  /* ---- the questions ---- */
  const renewals = useMemo(() => renewalsQuestion(clients, cycles, settings, today), [clients, cycles, settings, today]);
  const attendanceAll = useMemo(() => attendanceQuestion(clients, today, Number.POSITIVE_INFINITY), [clients, today]);
  const watched = useMemo(() => splitWatched(attendanceAll.rows, watchlist.value, today), [attendanceAll.rows, watchlist.value, today]);
  const back = useMemo(() => backAgain(watchlist.value, clients, today), [watchlist.value, clients, today]);
  const pain = useMemo(
    () => painQuestion({ sessions: recent.sessions, incidents: own.incidents ?? [], entries: own.critical ?? [], clients, today, tz }),
    [recent.sessions, own.incidents, own.critical, clients, today, tz],
  );
  const painPending = useMemo(() => pendingAcks(pain.rows, acks.value), [pain.rows, acks.value]);
  const review = useMemo(() => notesToReview(own.critical ?? [], clients, today, tz), [own.critical, clients, today, tz]);
  const hotIds = useMemo(() => new Set(pain.rows.map((r) => r.clientId)), [pain.rows]);

  /* ---- looking ahead ---- */
  const moment = useMemo(
    () => moments({ delight: delight.rows, datedNotes: own.dated ?? [], clients, weekEntries: week.entries, today, cutover: studio.journeyCutoverDate ?? null, tz }),
    [delight.rows, own.dated, clients, week.entries, today, studio.journeyCutoverDate, tz],
  );
  const days = useMemo(
    () => nextDays({ weekEntries: week.entries, changesByDay, momentsByDay: momentsByDay(moment.rows), hotClientIds: hotIds, clients, today, tz }),
    [week.entries, changesByDay, moment.rows, hotIds, clients, today, tz],
  );
  const unbooked = useMemo(() => notBookedAhead(clients), [clients]);

  /* ---- the team and the week ---- */
  const names = useMemo(() => trainerNames(trainers), [trainers]);
  const idsByName = useMemo(() => Object.fromEntries(trainers.filter((t) => t.id).map((t) => [t.fullName, t.id as string])), [trainers]);
  const team = useMemo(
    () => teamThisWeek(recent.sessions, todayEntries, logged.logged, now, today, sessionMinutesOf(studio), names, idsByName, tz),
    [recent.sessions, todayEntries, logged.logged, now, today, studio, names, idsByName, tz],
  );
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

  /* ---- the actions ---- */
  const run = async (key: string, work: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await work();
    } catch {
      /* the toast has already said so; the row stays */
    } finally {
      setBusyKey(null);
    }
  };
  const ackRows = (rows: typeof pain.rows) => run("ack", () => acknowledge(studioId, keysToAcknowledge(rows, acks.value).map((key) => ({ key, clientId: rows.find((r) => r.ackKeys.includes(key))?.clientId ?? "" })), me));
  const snoozeClient = (clientId: string, untilDay: string) => run(`watch:${clientId}`, async () => {
    await writeWatch(studioId, snooze(clientId, untilDay));
    setSnoozing(null);
  });
  const dismissClient = (clientId: string) => run(`watch:${clientId}`, () => writeWatch(studioId, dismissal(clientId, clients.find((c) => c.id === clientId), me, today)));
  const gotIt = (clientId: string) => run(`watch:${clientId}`, () => clearWatch(studioId, clientId));

  /* ---- the strip ---- */
  const chips: NeedChip[] = [
    { id: "chase", count: numbers.neverLogged, label: numbers.neverLogged === 1 ? "session never logged" : "sessions never logged", tone: "alert" },
    { id: "pain", count: painPending.pending.length, label: painPending.pending.length === 1 ? "pain or critical note to acknowledge" : "pain and critical notes to acknowledge", tone: "alert" },
    { id: "changes", count: changesToday.length, label: changesToday.length === 1 ? "change today" : "changes today", tone: "warn" },
    { id: "attendance", count: watched.shown.length + back.length, label: back.length > 0 ? "on the attendance watch (and someone is back)" : "on the attendance watch", tone: "warn" },
    { id: "renewals", count: renewals.counts["talk-now"] + renewals.counts["before-charge"], label: "renewal conversations", tone: "warn" },
    { id: "moments", count: moment.gesturesUnowned, label: moment.gesturesUnowned === 1 ? "gesture with no owner" : "gestures with no owner", tone: "neutral" },
    { id: "review", count: review.length, label: review.length === 1 ? "note to review" : "notes to review", tone: "neutral" },
  ];
  const jumpTo = (id: string) => {
    if (id === "chase") {
      setShowChase(true);
      document.getElementById("ov-today")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (id === "review") {
      setReviewOpen(true);
      return;
    }
    fold.unfold(id);
    document.getElementById(`ov-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (view === "changes") {
    return <ChangesView studio={studio} entries={week.entries} loading={week.loading} failed={week.failed} today={today} onBack={() => setView("home")} onOpenClient={onNavigateProfile} />;
  }
  if (view === "attendance") {
    return (
      <AttendanceWatchView
        studio={studio}
        today={today}
        rows={attendanceAll}
        watched={watched}
        back={back}
        watchlist={watchlist.value}
        clients={clients}
        breakDays={settings.breakDays}
        busyKey={busyKey}
        onSnooze={snoozeClient}
        onDismiss={dismissClient}
        onClear={gotIt}
        onBack={() => setView("home")}
        onOpenClient={onNavigateProfile}
      />
    );
  }

  const door = (tab: OverviewLink, label: string) =>
    onOpen && (
      <AdminButton size="sm" variant="quiet" onClick={() => onOpen(tab)}>
        {label} <ChevronRight className="w-3.5 h-3.5" />
      </AdminButton>
    );

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Activity className="w-5 h-5" />}
        title={`${studio.name} — Overview`}
        subtitle={`${formatStudioDate(now, { weekday: "long", month: "long", day: "numeric" }, tz)}. What is going on at the studio right now, what needs you, and what is coming.`}
      />

      {/* 1 · Today */}
      <div id="ov-today" className="adm-ov__today">
        <AdminTiles>
          <AdminStatTile label="Booked today" value={numbers.booked} foot={numbers.cancelled > 0 ? `${numbers.clients} clients · ${numbers.cancelled} cancelled` : `${numbers.clients} ${numbers.clients === 1 ? "client" : "clients"}`} loading={week.loading} />
          <AdminStatTile label="Done" value={missing ? "—" : numbers.done} foot={foot.done} loading={dayLoading} />
          <AdminStatTile label="Not completed" value={missing ? "—" : numbers.notCompleted} tone={!missing && numbers.noShow > 0 ? "attention" : undefined} foot={!missing && numbers.notCompleted > 0 ? `${pct(numbers.notCompletedPct)} — ${foot.notCompleted}` : foot.notCompleted} loading={dayLoading} />
          <AdminStatTile
            label="Never logged"
            value={missing ? "—" : numbers.neverLogged}
            tone={!missing && numbers.neverLogged > 0 ? "alert" : undefined}
            foot={!missing && numbers.neverLogged > 0 ? (showChase ? "hide the list" : "tap to see who to chase") : foot.neverLogged}
            onClick={missing ? undefined : () => setShowChase((v) => !v)}
            loading={dayLoading}
          />
          <AdminStatTile label="On the floor now" value={numbers.onTheFloor} foot={foot.floor} loading={dayLoading} />
        </AdminTiles>
        {week.failed && (
          <div className="mt-3">
            <AdminNotice tone="alert">The week's schedule could not be read just now, so today's numbers and the changes list are missing — not zero.</AdminNotice>
          </div>
        )}
        {!week.failed && logged.failed && (
          <div className="mt-3">
            <AdminNotice tone="alert">Today's Journey sessions could not be read just now, so what was done and what was never logged are missing — not zero.</AdminNotice>
          </div>
        )}
        {showChase && !missing && numbers.neverLogged > 0 && (
          <div className="adm-ov__chase">
            <ActionRows
              rows={chase.map((c) => ({
                key: c.id,
                clientId: c.clientId,
                name: c.clientName,
                sentence: `${c.at} with ${c.trainerName} — past its slot, nothing logged.`,
                proof: "No Journey session for them today. Trained and not logged, a no-show, or never happened? Someone on the floor knows.",
                tone: "alert",
                badge: "Chase",
              }))}
              onOpenClient={onNavigateProfile}
              empty=""
            />
          </div>
        )}
      </div>

      {/* 2 · Needs you */}
      <NeedsYou chips={chips} onPick={jumpTo} />

      {/* 3 · The panels: act today on the left, look ahead on the right */}
      <div className="adm-ov__grid">
        {/* Changes today */}
        <OverviewPanel
          id="changes"
          column="left"
          title="Changes today"
          icon={<CalendarClock className="w-4 h-4" />}
          count={changesToday.length}
          tone="warn"
          sentence={
            week.loading
              ? "Reading the week…"
              : changesToday.length === 0
                ? `Nothing cancelled or moved for today. ${weekDays.slice(1).reduce((n, d) => n + (changesByDay[d] ?? 0), 0)} waiting on later days this week.`
                : `${changesToday.filter((c) => c.reading === "cancellation").length} cancelled, ${changesToday.filter((c) => c.reading === "reschedule").length} moved or rebooked — held against the day the session was for.`
          }
          actions={
            <AdminButton size="sm" variant="quiet" onClick={() => setView("changes")}>
              The week <ChevronRight className="w-3.5 h-3.5" />
            </AdminButton>
          }
          folded={fold.folded.has("changes")}
          onToggle={() => fold.toggle("changes")}
        >
          <Rows
            rows={changesToday.slice(0, 6).map((c) => {
              const text = describeChange(c, tz);
              return { clientId: c.clientId ?? "", name: c.clientName, sentence: text.sentence, proof: text.proof, tone: c.reading === "cancellation" ? "warn" : "info", badge: c.reading === "cancellation" ? "Cancelled" : "Moved" } as OverviewRow;
            })}
            total={changesToday.length}
            onOpenClient={onNavigateProfile}
            empty="No changes for today."
            moreLabel="in the week's list"
          />
        </OverviewPanel>

        {/* Next 3 days */}
        <OverviewPanel
          id="next"
          column="right"
          title="The next three days"
          icon={<CalendarRange className="w-4 h-4" />}
          sentence={
            week.loading
              ? "Reading the week…"
              : `${days.reduce((n, d) => n + d.booked, 0)} booked over ${days.map((d) => d.label).join(", ")}. ${unbooked.count === 0 ? "Everyone active is booked ahead." : `${unbooked.count} active client${unbooked.count === 1 ? " has" : "s have"} nothing booked ahead.`}`
          }
          folded={fold.folded.has("next")}
          onToggle={() => fold.toggle("next")}
        >
          <div className="adm-ov__days">
            {days.map((d) => (
              <div key={d.day} className="adm-ov__day">
                <div className="adm-ov__day-head">
                  <span className="adm-ov__day-label">{d.label}</span>
                  <span className="adm-ov__day-date">{d.dateLabel}</span>
                </div>
                <div className="adm-ov__day-big">
                  {d.booked} <span>booked</span>
                </div>
                <ul className="adm-ov__day-facts">
                  <li className={d.changes > 0 ? "adm-ov__fact--warn" : undefined}>{d.changes === 0 ? "no changes yet" : `${d.changes} change${d.changes === 1 ? "" : "s"} already`}</li>
                  <li className={d.hot > 0 ? "adm-ov__fact--alert" : undefined}>{d.hot === 0 ? "nobody with a live note" : `${d.hot} with a live note: ${d.hotNames.join(", ")}`}</li>
                  <li>{d.moments === 0 ? "no moments" : `${d.moments} moment${d.moments === 1 ? "" : "s"}`}</li>
                </ul>
              </div>
            ))}
          </div>
          {unbooked.count > 0 && (
            <div className="adm-ov__unbooked">
              <span className="adm-ov__unbooked-title">Nothing booked ahead ({unbooked.count} of {unbooked.measured} active)</span>
              <Rows rows={unbooked.rows.map((r) => ({ clientId: r.clientId, name: r.name, sentence: "Nothing on the books after their last visit.", proof: r.proof, tone: "warn", badge: "Not booked" }))} total={unbooked.count} onOpenClient={onNavigateProfile} empty="" moreLabel="on Renewals" />
            </div>
          )}
        </OverviewPanel>

        {/* Pain and critical notes */}
        <OverviewPanel
          id="pain"
          column="left"
          title="Pain and critical notes"
          icon={<HeartPulse className="w-4 h-4" />}
          count={painPending.pending.length}
          tone="alert"
          sentence={
            own.loading || recent.loading
              ? "Reading incidents, notes and the Dial…"
              : own.failed.incidents || own.failed.critical || recent.failed
                ? "Part of this could not be read just now — the list may be short."
                : pain.total === 0
                  ? "No open incidents, no critical notes mattering today, no pain on the Dial this week."
                  : `${pain.openIncidents} open incident${pain.openIncidents === 1 ? "" : "s"}, ${pain.criticalNotes} critical note${pain.criticalNotes === 1 ? "" : "s"} mattering today, ${pain.painReports} reporting pain this week${painPending.acknowledged > 0 ? ` — ${painPending.acknowledged} already acknowledged` : ""}.`
          }
          actions={
            painPending.pending.length > 1 ? (
              <AdminButton size="sm" variant="primary" busy={busyKey === "ack"} onClick={() => void ackRows(painPending.pending)}>
                Acknowledge all
              </AdminButton>
            ) : undefined
          }
          folded={fold.folded.has("pain")}
          onToggle={() => fold.toggle("pain")}
        >
          <ActionRows
            rows={painPending.pending.slice(0, 8).map((r) => ({
              key: r.clientId,
              clientId: r.clientId,
              name: r.name,
              sentence: r.sentence,
              proof: r.proof,
              tone: r.tone,
              actions: (
                <AdminButton size="sm" busy={busyKey === "ack"} onClick={() => void ackRows([r])}>
                  Acknowledge
                </AdminButton>
              ),
            }))}
            total={painPending.pending.length}
            onOpenClient={onNavigateProfile}
            empty={pain.total === 0 ? "Nothing hurts that we know of." : "Everything here has been acknowledged."}
            moreLabel="— acknowledge these first"
          />
          {review.length > 0 && (
            <div className="adm-ov__foot-line">
              <AdminButton size="sm" variant="quiet" onClick={() => setReviewOpen(true)}>
                <NotebookPen className="w-3.5 h-3.5" /> {review.length} note{review.length === 1 ? " has" : "s have"} mattered 60+ days — review
              </AdminButton>
            </div>
          )}
        </OverviewPanel>

        {/* Renewals */}
        <OverviewPanel
          id="renewals"
          column="right"
          title="Renewals"
          icon={<CalendarClock className="w-4 h-4" />}
          count={renewals.counts["talk-now"] + renewals.counts["before-charge"]}
          tone="warn"
          sentence={
            renewals.counts["talk-now"] + renewals.counts["before-charge"] === 0
              ? `Nobody needs a renewal conversation this week. ${renewals.counts["coming-up"]} coming up in the next ${settings.horizonMonths} months.`
              : `${renewals.counts["talk-now"]} to talk to now, ${renewals.counts["before-charge"]} before a charge, ${renewals.counts["coming-up"]} coming up — ${renewals.notTalked} of those nobody has talked to yet.`
          }
          actions={door("renewals", "Renewals")}
          folded={fold.folded.has("renewals")}
          onToggle={() => fold.toggle("renewals")}
        >
          <Rows rows={renewals.rows} total={renewals.total} onOpenClient={onNavigateProfile} empty="Nothing to chase this week." />
        </OverviewPanel>

        {/* Attendance watch */}
        <OverviewPanel
          id="attendance"
          column="left"
          title="Attendance watch"
          icon={<UserRoundX className="w-4 h-4" />}
          count={watched.shown.length + back.length}
          tone="warn"
          sentence={
            attendanceAll.total === 0
              ? attendanceAll.measured === 0
                ? "No client has a measured rhythm yet — the nightly job needs eight weeks of visits to say what is usual."
                : `Nobody is off their rhythm or past the studio's ${settings.breakDays}-day quiet line. ${attendanceAll.measured} clients have a measured pace.`
              : `${watched.shown.length} to look at — ${attendanceAll.longBreaks} on a break longer than their rhythm or the studio's ${settings.breakDays}-day line, ${attendanceAll.missedBookings} with missed bookings${watched.snoozed.length + watched.dismissed.length > 0 ? ` — ${watched.snoozed.length} snoozed, ${watched.dismissed.length} dismissed` : ""}.`
          }
          actions={
            <AdminButton size="sm" variant="quiet" onClick={() => setView("attendance")}>
              The whole list <ChevronRight className="w-3.5 h-3.5" />
            </AdminButton>
          }
          folded={fold.folded.has("attendance")}
          onToggle={() => fold.toggle("attendance")}
        >
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
          <ActionRows
            rows={watched.shown.slice(0, 6).map((r) => ({
              key: r.clientId,
              clientId: r.clientId,
              name: r.name,
              sentence: r.sentence,
              proof: r.proof,
              tone: r.tone,
              actions: (
                <>
                  <AdminButton size="sm" busy={busyKey === `watch:${r.clientId}`} onClick={() => setSnoozing((v) => (v === r.clientId ? null : r.clientId))} aria-expanded={snoozing === r.clientId}>
                    Snooze
                  </AdminButton>
                  <AdminButton size="sm" variant="ghost" busy={busyKey === `watch:${r.clientId}`} onClick={() => void dismissClient(r.clientId)}>
                    Dismiss
                  </AdminButton>
                </>
              ),
              below: snoozing === r.clientId ? <SnoozeChooser today={today} onPick={(day) => void snoozeClient(r.clientId, day)} onCancel={() => setSnoozing(null)} /> : undefined,
            }))}
            total={watched.shown.length}
            onOpenClient={onNavigateProfile}
            empty={back.length > 0 ? "" : "Nobody is off their rhythm."}
          />
        </OverviewPanel>

        {/* Moments */}
        <OverviewPanel
          id="moments"
          column="right"
          title="Moments this week"
          icon={<Gift className="w-4 h-4" />}
          count={moment.rows.length}
          tone={moment.gesturesUnowned > 0 ? "warn" : "neutral"}
          sentence={
            delight.isLoading || own.loading
              ? "Reading the list…"
              : delight.needsIndex
                ? "The Delight queue needs its index — an administrator deploys it."
                : moment.rows.length === 0
                  ? "No gestures due, no dates and no milestones in the next seven days."
                  : `${moment.gestures} gesture${moment.gestures === 1 ? "" : "s"} due${moment.gesturesUnowned > 0 ? ` (${moment.gesturesUnowned} without an owner)` : ""}, ${moment.dates} date${moment.dates === 1 ? "" : "s"} to remember, ${moment.milestones} milestone${moment.milestones === 1 ? "" : "s"}.`
          }
          actions={door("delight", "Delight queue")}
          folded={fold.folded.has("moments")}
          onToggle={() => fold.toggle("moments")}
        >
          <Rows
            rows={moment.rows.slice(0, 8).map((r) => ({
              clientId: r.clientId,
              name: r.name,
              sentence: `${dayWord(r.day, today)} — ${r.sentence}`,
              proof: r.proof,
              tone: r.needsOwner ? "warn" : "info",
              badge: r.kind === "gesture" ? (r.needsOwner ? "No owner" : "Gesture") : r.kind === "date" ? "Date" : "Milestone",
            }))}
            total={moment.rows.length}
            onOpenClient={onNavigateProfile}
            empty="Nothing to mark this week."
            moreLabel="on the Delight queue and the clients' notes"
          />
        </OverviewPanel>

        {/* Strength dropped */}
        <OverviewPanel
          id="strength"
          column="left"
          title="Strength dropped"
          icon={<TrendingDown className="w-4 h-4" />}
          count={own.watch?.rows.length ?? 0}
          tone="warn"
          sentence={
            own.watch === undefined
              ? own.failed.watch
                ? "The weekly read could not be loaded just now."
                : "Reading Sunday's list…"
              : own.watch === null
                ? "The weekly read has not run yet. It runs on Sunday nights; a leader's PC can run it sooner (scripts/run-machine-trends.ts)."
                : own.watch.rows.length === 0
                  ? `Nobody dropped a third or more at the same weight in the two weeks before Sunday's read (${own.watch.builtAt.slice(0, 10)}).`
                  : `${own.watch.clients} client${own.watch.clients === 1 ? "" : "s"} dropped by a third or more at the same weight, as of Sunday's read (${own.watch.builtAt.slice(0, 10)}).`
          }
          folded={fold.folded.has("strength")}
          onToggle={() => fold.toggle("strength")}
        >
          {own.watch && own.watch.rows.length > 0 ? (
            <Rows
              rows={own.watch.rows.map((r) => ({
                clientId: r.clientId,
                name: clientName(r.clientId),
                sentence: dropSentence(r, machineName(r.machineId)),
                proof: `Latest set ${r.day}.`,
                tone: r.drop >= 0.5 ? "alert" : "warn",
              }))}
              total={own.watch.rows.length}
              onOpenClient={onNavigateProfile}
              empty=""
            />
          ) : (
            <div className="p-3">
              <AdminNotice tone="info">The set logs are indexed per client, so this is answered once a week by the same job that builds the machine trends — never by reading every set on every open.</AdminNotice>
            </div>
          )}
        </OverviewPanel>

        {/* Team this week */}
        <OverviewPanel
          id="team"
          column="right"
          title="Team this week"
          icon={<Users className="w-4 h-4" />}
          sentence={
            recent.loading || logged.loading
              ? "Adding up the week…"
              : `${team.sessions} session${team.sessions === 1 ? "" : "s"} since Monday ${team.since.slice(5)} by ${team.rows.filter((r) => r.sessions > 0).length} trainer${team.rows.filter((r) => r.sessions > 0).length === 1 ? "" : "s"}${team.unknownToday > 0 ? " — today's logging could not be read" : team.unloggedToday > 0 ? ` — ${team.unloggedToday} of today's sessions still unlogged` : ""}. ${formatHours(hours.minutes)} on the floor.`
          }
          actions={door("insights", "Insights and hours")}
          folded={fold.folded.has("team")}
          onToggle={() => fold.toggle("team")}
        >
          {team.rows.length === 0 ? (
            <div className="p-4">
              <AdminEmpty title="No sessions since Monday." />
            </div>
          ) : (
            <table className="adm-ov__team">
              <thead>
                <tr>
                  <th scope="col">Trainer</th>
                  <th scope="col">Sessions</th>
                  <th scope="col">Clients</th>
                  <th scope="col">Hours</th>
                  {team.unknownToday === 0 && <th scope="col">Unlogged today</th>}
                </tr>
              </thead>
              <tbody>
                {team.rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.name}</th>
                    <td>{r.sessions}</td>
                    <td>{r.clients}</td>
                    <td>{formatHours(r.minutes)}</td>
                    {team.unknownToday === 0 && <td className={r.unloggedToday > 0 ? "adm-ov__team-alert" : undefined}>{r.unloggedToday === 0 ? "—" : r.unloggedToday}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="adm-ov__team-note">A list, not a ranking. Volume is a rota fact; outcomes live on Insights.</p>
        </OverviewPanel>
      </div>

      {/* 4 · The week, one line each */}
      <div className="adm-ov__lines">
        <Line
          icon={<TrendingUp className="w-4 h-4" />}
          label="Insights"
          text={
            recent.loading
              ? "Reading the floor…"
              : recent.failed
                ? "Could not be read just now."
                : !insight?.summary.enoughToJudge
                  ? `Not enough sessions in the last ${DAYS_READ} days to say anything yet.`
                  : (insight.first?.text ?? "Nothing stands out in the last two weeks.")
          }
          tone={insight?.first?.tone === "problem" ? "alert" : insight?.first?.tone === "watch" ? "warn" : "neutral"}
          onOpen={onOpen && (() => onOpen("insights"))}
        />
        <Line
          icon={<Ruler className="w-4 h-4" />}
          label="Machine fit"
          text={fit.status === "loading" ? "Reading the set-ups…" : fit.status === "failed" ? "Could not be read just now." : fit.clients === 0 ? "Nobody is set somewhere unusual for their build." : `${fit.clients} client${fit.clients === 1 ? "" : "s"} worth a look, on ${fit.machines} machine${fit.machines === 1 ? "" : "s"}.`}
          tone={fit.clients > 0 ? "warn" : "neutral"}
          onOpen={onOpen && (() => onOpen("floor"))}
        />
        <Line
          icon={<Clock3 className="w-4 h-4" />}
          label="Hours"
          text={recent.loading ? "Adding up the week…" : `${formatHours(hours.minutes)} this week so far, over ${hours.sessions} session${hours.sessions === 1 ? "" : "s"} by ${hours.trainers} trainer${hours.trainers === 1 ? "" : "s"} (since Monday ${hours.since.slice(5)}).`}
          tone="neutral"
          onOpen={onOpen && (() => onOpen("insights"))}
        />
        <Line
          icon={<CalendarDays className="w-4 h-4" />}
          label="This week's changes"
          text={week.loading ? "Reading the week…" : `${weekDays.reduce((n, d) => n + (changesByDay[d] ?? 0), 0)} cancellations or moves recorded across the week, held against the day each session was for.`}
          tone="neutral"
          onOpen={() => setView("changes")}
        />
      </div>

      {(own.failed.dated || acks.failed || watchlist.failed) && (
        <AdminNotice tone="warn">
          Part of the page could not be read just now (
          {[own.failed.dated ? "dated notes" : null, acks.failed ? "acknowledgements" : null, watchlist.failed ? "the watchlist" : null].filter(Boolean).join(", ")}
          ). What is shown is what could be read — not the whole picture.
        </AdminNotice>
      )}

      {reviewOpen && <ReviewNotesDialog open onOpenChange={setReviewOpen} rows={review} onOpenClient={onNavigateProfile} />}
    </AdminScreen>
  );
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function addDay(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** "Today", "Tomorrow", else "Tue". */
function dayWord(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDay(today, 1)) return "Tomorrow";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}
