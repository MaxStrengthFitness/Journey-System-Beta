/**
 * Insights.
 *
 * Round: Section 6, Sep 2026. Deferred out of Round 1 and Round 2 on purpose;
 * built last, once the data it reads had been cleaned up.
 *
 * WHAT THIS REPLACES
 * ------------------
 * InsightsDashboardView read five hundred clients, a thousand sessions and a
 * thousand exercise logs — every studio in the platform, no scoping — and
 * rendered totals. Two problems with that, one of which is now fatal.
 *
 * The fatal one: `sessions` and `clients` are scoped by security rule as of
 * this round, and Firestore rejects an unconstrained query outright. The old
 * screen would show an error, not a smaller number.
 *
 * The other one is why this screen is shaped differently. A total is the easy
 * half and the useless half. "412 sessions" tells a studio leader nothing they
 * cannot feel by standing on the floor, and nothing to do. So the top of this
 * screen is a list of SENTENCES — what is true about this window and what a
 * manager would do about it — and the numbers sit underneath as support.
 *
 * ONE QUERY, DELIBERATELY
 * -----------------------
 * Sessions only, scoped to one studio and one date range, with a hard cap.
 * `sessionMachineIds` on the session document means machine variety no longer
 * needs the exerciseLogs collection, which halves the read cost of the screen
 * and removes the biggest unscoped query left in the app.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import {
  CircleCheck,
  CircleAlert,
  Info,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { db } from "../../../firebase";
import type { Studio, Trainer, WorkoutSession } from "../../../types";
import {
  OperationType,
  handleFirestoreError,
} from "../../../lib/firestore-errors";
import {
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminGrid,
  AdminHeader,
  AdminNotice,
  AdminPanel,
  AdminScreen,
  AdminSelect,
  AdminStatTile,
  AdminTiles,
} from "../primitives";
import {
  MIN_SESSIONS_FOR_STUDIO_CLAIM,
  observations,
  returnRate,
  studioSummary,
  trainerMetrics,
  type Observation,
  type TrainerMetrics,
} from "./metrics";

/**
 * A month of one studio's sessions is a few hundred documents. The cap exists
 * so a busy studio and a long window cannot quietly turn this screen into a
 * five-thousand-read page; when it bites, the screen says so rather than
 * showing a number computed from a truncated set.
 */
const MAX_SESSIONS = 1500;

const WINDOWS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
] as const;

const TONE_ICON: Record<Observation["tone"], React.ReactNode> = {
  problem: <TriangleAlert className="w-4 h-4 shrink-0" />,
  watch: <CircleAlert className="w-4 h-4 shrink-0" />,
  neutral: <Info className="w-4 h-4 shrink-0" />,
  good: <CircleCheck className="w-4 h-4 shrink-0" />,
};

const TONE_NOTICE: Record<Observation["tone"], "alert" | "warn" | "info" | "ok"> = {
  problem: "alert",
  watch: "warn",
  neutral: "info",
  good: "ok",
};

interface Props {
  studios: Studio[];
  trainers: Trainer[];
  activeStudioId: string | null;
}

export function AdminInsightsTab({ studios, trainers, activeStudioId }: Props) {
  const [studioId, setStudioId] = useState<string | null>(
    activeStudioId ?? studios[0]?.id ?? null,
  );
  const [days, setDays] = useState<number>(30);
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const window = useMemo(() => {
    const end = Date.now();
    return { start: end - days * 86_400_000, end };
  }, [days]);

  useEffect(() => {
    if (!studioId) {
      setSessions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "sessions"),
            where("hostedAtStudioId", "==", studioId),
            where("createdAt", ">=", Timestamp.fromMillis(window.start)),
            orderBy("createdAt", "desc"),
            fsLimit(MAX_SESSIONS),
          ),
        );
        if (cancelled) return;
        setSessions(
          snap.docs.map((d) => ({ ...(d.data() as WorkoutSession), id: d.id })),
        );
        setTruncated(snap.size >= MAX_SESSIONS);
      } catch (err) {
        if (!cancelled) {
          handleFirestoreError(err, OperationType.GET, "sessions");
          setSessions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studioId, window.start]);

  /** Trainer ids to display names, so the observations read as people. */
  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const t of trainers) {
      if (t.id) out[t.id] = t.fullName;
      if (t.initials) out[`initials:${t.initials}`] = t.fullName;
    }
    return out;
  }, [trainers]);

  const summary = useMemo(() => studioSummary(sessions ?? []), [sessions]);
  const perTrainer = useMemo(
    () => trainerMetrics(sessions ?? [], names),
    [sessions, names],
  );
  const retention = useMemo(
    () => returnRate(sessions ?? [], window.start, window.end),
    [sessions, window],
  );
  const findings = useMemo(
    () => observations(summary, perTrainer, retention),
    [summary, perTrainer, retention],
  );

  const studioName = studios.find((s) => s.id === studioId)?.name;
  const mins = (n: number | null) => (n === null ? "—" : `${Math.round(n)} min`);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <AdminScreen>
      <AdminHeader
        icon={<TrendingUp className="w-5 h-5" />}
        title="Insights"
        subtitle="What this window says about the floor, and what to do about it."
        actions={
          <div className="adm-ins-controls">
            <AdminField label="Studio" htmlFor="ins-studio">
              <AdminSelect
                id="ins-studio"
                value={studioId ?? ""}
                onChange={(e) => setStudioId(e.target.value || null)}
              >
                {studios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Window" htmlFor="ins-window">
              <AdminSelect
                id="ins-window"
                value={String(days)}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {WINDOWS.map((w) => (
                  <option key={w.days} value={w.days}>
                    {w.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          </div>
        }
      />

      {truncated && (
        <AdminNotice tone="warn">
          More than {MAX_SESSIONS} sessions fall in this window, so these
          numbers cover the most recent {MAX_SESSIONS} only. Narrow the window
          to get a figure for the whole period.
        </AdminNotice>
      )}

      {/* The findings come first. Everything below is here to support them. */}
      <AdminPanel
        title="What stands out"
        subtitle={
          studioName ? `${studioName}, last ${days} days.` : `Last ${days} days.`
        }
      >
        {loading ? (
          <AdminEmpty title="Reading the floor…" />
        ) : !summary.enoughToJudge ? (
          <AdminEmpty title="Not enough to say anything yet">
            {summary.sessions === 0
              ? "No sessions were recorded at this studio in this window."
              : `${summary.sessions} session${summary.sessions === 1 ? "" : "s"} in this window. Below ${MIN_SESSIONS_FOR_STUDIO_CLAIM} the rates swing too much to mean anything, so nothing is claimed from them. Try a longer window.`}
          </AdminEmpty>
        ) : findings.length === 0 ? (
          <AdminNotice tone="ok">
            <CircleCheck className="w-4 h-4 shrink-0" />
            Nothing needs attention in this window. Sessions are being closed
            out, the load is spread, and notes are being written.
          </AdminNotice>
        ) : (
          <div className="adm-ins-findings">
            {findings.map((f) => (
              <AdminNotice key={f.id} tone={TONE_NOTICE[f.tone]}>
                {TONE_ICON[f.tone]}
                <div>
                  <div className="adm-ins-finding">{f.text}</div>
                  {f.action && <div className="adm-ins-action">{f.action}</div>}
                </div>
              </AdminNotice>
            ))}
          </div>
        )}
      </AdminPanel>

      <AdminTiles>
        <AdminStatTile label="Sessions" value={summary.sessions} loading={loading} />
        <AdminStatTile
          label="Never closed out"
          value={summary.unclosed}
          tone={summary.unclosed > 0 ? "attention" : undefined}
          foot="No end time recorded"
          loading={loading}
        />
        <AdminStatTile
          label="Clients seen"
          value={summary.clients}
          foot={`${summary.newClients} on their first session`}
          loading={loading}
        />
        <AdminStatTile
          label="Typical session"
          value={mins(summary.medianMinutes)}
          foot={
            summary.medianMachinesPerSession
              ? `${summary.medianMachinesPerSession} machines`
              : undefined
          }
          loading={loading}
        />
        <AdminStatTile
          label="Sessions with a note"
          value={pct(summary.noteRate)}
          loading={loading}
        />
        <AdminStatTile
          label="Client return rate"
          value={retention ? pct(retention.rate) : "—"}
          foot={
            retention
              ? `${retention.returned} of ${retention.eligible} came back`
              : "Needs a longer window"
          }
          loading={loading}
        />
      </AdminTiles>

      <AdminPanel
        title="By trainer"
        subtitle="Volume is a rota fact, not a ranking. The rates are the part worth reading."
        flush
      >
        {perTrainer.length === 0 ? (
          <AdminEmpty title="No sessions to break down" />
        ) : (
          <div className="adm-ins-table-wrap">
            <table className="adm-ins-table">
              <thead>
                <tr>
                  <th scope="col">Trainer</th>
                  <th scope="col">Sessions</th>
                  <th scope="col">Share</th>
                  <th scope="col">Closed out</th>
                  <th scope="col">Clients</th>
                  <th scope="col">Machines used</th>
                  <th scope="col">Typical</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {perTrainer.map((t) => (
                  <TrainerRow key={t.trainerKey} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>
    </AdminScreen>
  );
}

function TrainerRow({ t }: { t: TrainerMetrics }) {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <tr>
      <th scope="row">
        {t.label}
        {!t.enoughToJudge && (
          <span className="adm-ins-thin" title="Too few sessions to read rates from">
            small sample
          </span>
        )}
      </th>
      <td>{t.sessions}</td>
      <td>{pct(t.loadShare)}</td>
      <td className={t.enoughToJudge && t.completionRate < 0.85 ? "adm-ins-bad" : undefined}>
        {pct(t.completionRate)}
      </td>
      <td>{t.clients}</td>
      <td>{t.machineVariety}</td>
      <td>{t.medianMinutes === null ? "—" : `${Math.round(t.medianMinutes)}m`}</td>
      <td className={t.enoughToJudge && t.noteRate === 0 ? "adm-ins-bad" : undefined}>
        {pct(t.noteRate)}
      </td>
    </tr>
  );
}
