/**
 * OPERATIONS → MONDAY — the first screen of Operations.
 *
 * Round: Operations (Round B), Sep 2026. Replaces the Overview (the
 * "is my studio running right now" screen, which the Hub and Relay's Now
 * Bar already answer for everyone). ARCHITECTURE §1.5: the first thing a
 * leader should read is the Monday-morning list, in this order —
 *
 *   1. renewals and conversation status      monday.ts / renewalsQuestion
 *   2. attendance anomalies                  monday.ts / attendanceQuestion
 *   3. performance discrepancies             performance.ts, via the weekly
 *                                            job's studios/{s}/watch/performance
 *   4. pain and incidents                    monday.ts / painQuestion
 *
 * — each a sentence with its proof, or "not enough data yet". Then one line
 * each for the Delight queue, Insights, Machine fit and Hours, which open
 * their tabs. Today's floor is a strip at the top, not a screen.
 *
 * READS PER OPEN, one studio: the renewal settings and cycles (as Renewals
 * reads them), the last 14 days of sessions (sessions-range — pain, the
 * Insights line and this week's hours all come from it), the studio's open
 * incidents, its critical notes (a new index), the watch document, the
 * Delight queue's stream and the machine-fit index. Under "All my studios"
 * the page is the network view (NetworkOverview).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, CalendarClock, ChevronRight, Clock3, Gift, HeartPulse, Ruler, TrendingDown, TrendingUp, UserRoundX } from "lucide-react";
import { collection, doc, getDoc, getDocs, limit as fsLimit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import type { Client, ClinicalIncident, Machine, ScheduleEntry, Studio, Trainer, WorkoutSession } from "../../../types";
import type { JournalEntry } from "../../../types/journal";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
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
import { entriesForDay, summariseFloor } from "../overview";
import { AdminBadge, AdminButton, AdminEmpty, AdminHeader, AdminNotice, AdminPanel, AdminScreen, AdminStatTile, AdminTiles } from "../primitives";
import { useOperationsScope } from "../scope-context";
import { useSessionsInRange } from "../sessions-range";
import { attendanceQuestion, hoursThisWeek, painQuestion, renewalsQuestion, type MondayRow, type MondayTone } from "./monday";
import { dropSentence, type PerformanceWatchDocument } from "./performance";
import "./monday.css";

export type MondayLink = "renewals" | "delight" | "insights" | "machine-fit" | "hours";

export interface MondayPageProps {
  authTrainer: Trainer;
  studios: Studio[];
  trainers: Trainer[];
  machines: Machine[];
  clients: Client[];
  /** The live schedule — today plus a week ahead — for the floor strip. */
  schedules: ScheduleEntry[];
  activeStudioId: string | null;
  onNavigateProfile?: (clientId: string) => void;
  onOpen?: (tab: MondayLink) => void;
}

const DAYS_READ = 14;
const INCIDENT_LIMIT = 100;
const CRITICAL_LIMIT = 100;

const TONE_BADGE: Record<MondayTone, "alert" | "warn" | "neutral"> = { alert: "alert", warn: "warn", info: "neutral" };

export function MondayPage({ authTrainer, studios, trainers, machines, clients, schedules, activeStudioId, onNavigateProfile, onOpen }: MondayPageProps) {
  void authTrainer;
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

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Activity className="w-5 h-5" />}
        title={studio ? `${studio.name} — Monday` : "Monday"}
        subtitle={`${formatStudioDate(now, { weekday: "long", month: "long", day: "numeric" })}. The four questions a leader asks first, each with its proof — or "not enough data yet".`}
      />
      {!activeStudioId || !studio ? (
        <AdminEmpty title="No studio">Switch the app to a studio to read its Monday page.</AdminEmpty>
      ) : (
        <StudioMonday
          key={studio.id}
          studio={studio}
          today={today}
          now={now}
          trainers={trainers}
          machines={machines}
          clients={clients}
          schedules={schedules}
          onNavigateProfile={onNavigateProfile}
          onOpen={onOpen}
        />
      )}
    </AdminScreen>
  );
}

/* ------------------------------------------------------------------ *
 * The reads that are this page's own
 * ------------------------------------------------------------------ */

interface OwnReads {
  incidents: ClinicalIncident[] | null;
  entries: JournalEntry[] | null;
  /** undefined = loading, null = the job has never written one, else the document. */
  watch: PerformanceWatchDocument | null | undefined;
  failed: { incidents: boolean; entries: boolean; watch: boolean };
}

function useOwnReads(studioId: string): OwnReads {
  const [state, setState] = useState<OwnReads>({ incidents: null, entries: null, watch: undefined, failed: { incidents: false, entries: false, watch: false } });
  useEffect(() => {
    let cancelled = false;
    setState({ incidents: null, entries: null, watch: undefined, failed: { incidents: false, entries: false, watch: false } });
    void (async () => {
      const [inc, ent, watch] = await Promise.all([
        getDocs(query(collection(db, "clinicalIncidents"), where("studioId", "==", studioId), fsLimit(INCIDENT_LIMIT)))
          .then((snap) => snap.docs.map((d) => ({ ...(d.data() as ClinicalIncident), id: d.id })))
          .catch((err) => {
            handleFirestoreError(err, OperationType.GET, "clinicalIncidents");
            return null;
          }),
        getDocs(
          query(
            collection(db, "journalEntries"),
            where("studioId", "==", studioId),
            where("importance", "==", "critical"),
            orderBy("occurredAt", "desc"),
            fsLimit(CRITICAL_LIMIT),
          ),
        )
          .then((snap) => snap.docs.map((d) => ({ ...(d.data() as JournalEntry), id: d.id })))
          .catch((err) => {
            handleFirestoreError(err, OperationType.GET, "journalEntries");
            return null;
          }),
        getDoc(doc(db, "studios", studioId, "watch", "performance"))
          .then((snap) => (snap.exists() ? (snap.data() as PerformanceWatchDocument) : null))
          .catch((err) => {
            handleFirestoreError(err, OperationType.GET, "watch");
            return "failed" as const;
          }),
      ]);
      if (cancelled) return;
      setState({
        incidents: inc,
        entries: ent,
        watch: watch === "failed" ? undefined : watch,
        failed: { incidents: inc === null, entries: ent === null, watch: watch === "failed" },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [studioId]);
  return state;
}

/* ------------------------------------------------------------------ *
 * One studio's Monday
 * ------------------------------------------------------------------ */

function StudioMonday({
  studio,
  today,
  now,
  trainers,
  machines,
  clients,
  schedules,
  onNavigateProfile,
  onOpen,
}: {
  studio: Studio;
  today: string;
  now: Date;
  trainers: Trainer[];
  machines: Machine[];
  clients: Client[];
  schedules: ScheduleEntry[];
  onNavigateProfile?: (clientId: string) => void;
  onOpen?: (tab: MondayLink) => void;
}) {
  const studioId = studio.id;
  const tz = studio.timezone || undefined;

  /* ---- the floor strip: today, from the live schedule ---- */
  const floor = useMemo(() => summariseFloor(entriesForDay(schedules, today), now), [schedules, today, now]);

  /* ---- 1. renewals: the roster's snapshots + the studio's cycles and settings ---- */
  const { settings } = useRenewalSettings(studioId);
  const cycleKeys = useMemo(
    () => clients.map((c) => (c.renewal as RenewalSnapshot | undefined)?.cycleKey).filter((k): k is string => Boolean(k)),
    [clients],
  );
  const cycles = useCyclesFor(studioId, cycleKeys);
  const renewals = useMemo(() => renewalsQuestion(clients, cycles, settings, today), [clients, cycles, settings, today]);

  /* ---- 2. attendance: the same snapshots ---- */
  const attendance = useMemo(() => attendanceQuestion(clients, today), [clients, today]);

  /* ---- the sessions read: pain (7 days), the Insights line and this week's hours (14 days).
     Anchored on the studio day, not the ticking clock, so the read happens once a day, not once a minute. ---- */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startMs = useMemo(() => Date.now() - DAYS_READ * 86_400_000, [today]);
  const recent = useSessionsInRange({ studioId, startMs });

  /* ---- 3. performance: the weekly job's document; 4. pain: incidents + notes + the Dial ---- */
  const own = useOwnReads(studioId);
  const pain = useMemo(
    () => painQuestion({ sessions: recent.sessions, incidents: own.incidents ?? [], entries: own.entries ?? [], clients, today, tz }),
    [recent.sessions, own.incidents, own.entries, clients, today, tz],
  );

  /* ---- the lines ---- */
  const delight = useDelightQueue({ studioId });
  const gesturesDue = delight.rows.filter((r) => r.daysAway !== null && r.daysAway <= 7);
  const gesturesUnowned = gesturesDue.filter((r) => !r.entry.opportunity?.ownerName).length;
  const names = useMemo(() => trainerNames(trainers), [trainers]);
  const insight = useMemo(() => {
    if (recent.loading || recent.failed) return null;
    const summary = studioSummary(recent.sessions);
    const found = observations(summary, trainerMetrics(recent.sessions, names), returnRate(recent.sessions, startMs, now.getTime()));
    return { summary, first: found[0] ?? null };
  }, [recent.loading, recent.failed, recent.sessions, names, startMs, now]);
  const fit = useWorthALook(studioId, machines, clients, studio);
  const week = useMemo(() => hoursThisWeek(recent.sessions, today, sessionMinutesOf(studio)), [recent.sessions, today, studio]);

  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? clientDisplayName(c, "A client") : "A client at this studio";
  };
  const machineName = (id: string) => machines.find((m) => m.id === id)?.name ?? id;

  return (
    <>
      {/* Today's floor — a strip, not a screen. */}
      <AdminTiles>
        <AdminStatTile label="Booked today" value={floor.booked} foot={`${floor.clients} ${floor.clients === 1 ? "client" : "clients"}`} />
        <AdminStatTile label="On the floor now" value={floor.inProgress} foot={floor.upcoming > 0 ? `${floor.upcoming} still to come` : "nothing still to come"} />
        <AdminStatTile label="Completed" value={floor.completed} foot={floor.showRate === null ? "nothing resolved yet" : `${Math.round(floor.showRate * 100)}% show rate`} />
        <AdminStatTile label="Missed" value={floor.missed} tone={floor.missed > 0 ? "alert" : undefined} foot={`${floor.noShow} no-show${floor.noShow === 1 ? "" : "s"}, ${floor.cancelled} cancelled`} />
        <AdminStatTile label="Not marked" value={floor.unresolved} tone={floor.unresolved > 0 ? "attention" : undefined} foot="past their slot, no outcome" />
      </AdminTiles>

      {/* 1. Renewals */}
      <AdminPanel
        title="1 · Renewals and conversations"
        icon={<CalendarClock className="w-4 h-4" />}
        subtitle={
          renewals.counts["talk-now"] + renewals.counts["before-charge"] === 0
            ? `Nobody needs a renewal conversation this week. ${renewals.counts["coming-up"]} coming up in the next ${settings.horizonMonths} months.`
            : `${renewals.counts["talk-now"]} to talk to now, ${renewals.counts["before-charge"]} before a charge, ${renewals.counts["coming-up"]} coming up — ${renewals.notTalked} of those nobody has talked to yet.`
        }
        actions={
          onOpen && (
            <AdminButton size="sm" variant="quiet" onClick={() => onOpen("renewals")}>
              Renewals <ChevronRight className="w-3.5 h-3.5" />
            </AdminButton>
          )
        }
        flush
      >
        <Rows rows={renewals.rows} total={renewals.total} onOpenClient={onNavigateProfile} empty="Nothing to chase this week." />
      </AdminPanel>

      {/* 2. Attendance */}
      <AdminPanel
        title="2 · Attendance anomalies"
        icon={<UserRoundX className="w-4 h-4" />}
        subtitle={
          attendance.total === 0
            ? attendance.measured === 0
              ? "No client has a measured rhythm yet — the nightly job needs eight weeks of visits to say what is usual."
              : `Nobody is off their rhythm. ${attendance.measured} clients have a measured pace.`
            : `${attendance.longBreaks} on a break longer than their rhythm, ${attendance.missedBookings} with missed bookings — out of ${attendance.measured} clients with a measured pace.`
        }
        flush
      >
        <Rows rows={attendance.rows} total={attendance.total} onOpenClient={onNavigateProfile} empty="Nobody is off their rhythm." />
      </AdminPanel>

      {/* 3. Performance */}
      <AdminPanel
        title="3 · Performance discrepancies"
        icon={<TrendingDown className="w-4 h-4" />}
        subtitle={
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
        flush
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
        ) : own.watch === null ? (
          <div className="p-3">
            <AdminNotice tone="info">
              The set logs are only indexed per client, so this question is answered once a week by the same job that builds the machine trends — never by
              reading every set on every open.
            </AdminNotice>
          </div>
        ) : null}
      </AdminPanel>

      {/* 4. Pain and incidents */}
      <AdminPanel
        title="4 · Pain and incidents"
        icon={<HeartPulse className="w-4 h-4" />}
        subtitle={
          own.failed.incidents || own.failed.entries || recent.failed
            ? "Part of this could not be read just now — the list below may be short."
            : pain.total === 0
              ? "No open incidents, no critical notes in their window, and no pain on the Dial in the last 7 days."
              : `${pain.openIncidents} open incident${pain.openIncidents === 1 ? "" : "s"}, ${pain.criticalNotes} critical note${pain.criticalNotes === 1 ? "" : "s"} still live, ${pain.painReports} client${pain.painReports === 1 ? "" : "s"} reporting pain in the last 7 days.`
        }
        flush
      >
        <Rows rows={pain.rows} total={pain.total} onOpenClient={onNavigateProfile} empty="Nothing hurts that we know of." />
      </AdminPanel>

      {/* The lines */}
      <div className="adm-mon__lines">
        <Line
          icon={<Gift className="w-4 h-4" />}
          label="Delight queue"
          text={
            delight.isLoading
              ? "Reading the list…"
              : delight.needsIndex
                ? "The queue needs its index — an administrator deploys it."
                : `${gesturesDue.length} gesture${gesturesDue.length === 1 ? "" : "s"} due this week${gesturesUnowned > 0 ? `, ${gesturesUnowned} without an owner` : ""}.`
          }
          tone={gesturesUnowned > 0 ? "warn" : "neutral"}
          onOpen={onOpen && (() => onOpen("delight"))}
        />
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
          text={
            fit.status === "loading"
              ? "Reading the set-ups…"
              : fit.status === "failed"
                ? "Could not be read just now."
                : fit.clients === 0
                  ? "Nobody is set somewhere unusual for their build."
                  : `${fit.clients} client${fit.clients === 1 ? "" : "s"} worth a look, on ${fit.machines} machine${fit.machines === 1 ? "" : "s"}.`
          }
          tone={fit.clients > 0 ? "warn" : "neutral"}
          onOpen={onOpen && (() => onOpen("machine-fit"))}
        />
        <Line
          icon={<Clock3 className="w-4 h-4" />}
          label="Hours"
          text={
            recent.loading
              ? "Adding up the week…"
              : `${formatHours(week.minutes)} this week so far, over ${week.sessions} session${week.sessions === 1 ? "" : "s"} by ${week.trainers} trainer${week.trainers === 1 ? "" : "s"} (since Monday ${week.since.slice(5)}).`
          }
          tone="neutral"
          onOpen={onOpen && (() => onOpen("hours"))}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function Rows({ rows, total, onOpenClient, empty }: { rows: MondayRow[]; total: number; onOpenClient?: (id: string) => void; empty: string }) {
  if (rows.length === 0) {
    return empty ? (
      <div className="p-4">
        <AdminEmpty title={empty} />
      </div>
    ) : null;
  }
  return (
    <ul className="adm-mon__rows">
      {rows.map((r) => (
        <li key={`${r.clientId}:${r.sentence}`} className="adm-mon__row">
          <button type="button" className="adm-mon__row-btn" onClick={() => onOpenClient?.(r.clientId)} disabled={!onOpenClient}>
            <span className="adm-mon__head">
              <span className="adm-mon__name">{r.name}</span>
              <AdminBadge tone={TONE_BADGE[r.tone]}>{r.tone === "alert" ? "Now" : r.tone === "warn" ? "Soon" : "Note"}</AdminBadge>
            </span>
            <span className="adm-mon__sentence">{r.sentence}</span>
            {r.proof && <span className="adm-mon__proof">{r.proof}</span>}
          </button>
        </li>
      ))}
      {total > rows.length && <li className="adm-mon__more">and {total - rows.length} more on the tab</li>}
    </ul>
  );
}

function Line({ icon, label, text, tone, onOpen }: { icon: ReactNode; label: string; text: string; tone: "alert" | "warn" | "neutral"; onOpen?: () => void }) {
  const inner = (
    <>
      <span className={`adm-mon__line-icon adm-mon__line-icon--${tone}`}>{icon}</span>
      <span className="adm-mon__line-body">
        <span className="adm-mon__line-label">{label}</span>
        <span className="adm-mon__line-text">{text}</span>
      </span>
      {onOpen && <ChevronRight className="w-4 h-4 adm-mon__line-chev" />}
    </>
  );
  return onOpen ? (
    <button type="button" className="adm-mon__line adm-mon__line--tappable" onClick={onOpen}>
      {inner}
    </button>
  ) : (
    <div className="adm-mon__line">{inner}</div>
  );
}
