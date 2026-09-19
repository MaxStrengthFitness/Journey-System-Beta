/**
 * OPERATIONS → HOURS — training hours by trainer, by week and month.
 *
 * Round: Operations (Round B), Sep 2026. AJ, Sep 19: "No payroll on the app
 * for now, but do track training hours per week and month per trainer and
 * the total for operations." The maths is hours.ts (read its header: an hour
 * is booked slots, not the stopwatch); this is the screen.
 *
 *   The month        ‹ September 2026 ›, opening on the current month.
 *   The scope        the Operations scope (features/admin/scope-context):
 *                    the studio the app is in, or "All my studios", which
 *                    reads one month per studio and adds a company line on
 *                    top.
 *   The table        trainers down, the month's weeks across (Mon–Sun,
 *                    clipped to the month), the month at the right, a total
 *                    row at the foot. Hours, with the session count under.
 *   What it says     "N sessions had no trainer on them" / "N still open" /
 *                    the read was cut / the read failed — never a total that
 *                    is quietly short.
 *
 * One read per studio per month (sessions-range.ts), nothing written.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import type { Studio, Trainer } from "../../../types";
import {
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminHeader,
  AdminNotice,
  AdminPanel,
  AdminScreen,
  AdminStatTile,
  AdminTiles,
} from "../primitives";
import { useOperationsScope } from "../scope-context";
import { MAX_SESSIONS_IN_RANGE, useSessionsInRange } from "../sessions-range";
import {
  LATE_LOG_GRACE_DAYS,
  averageMinutes,
  formatHours,
  hoursTally,
  monthKeyOfToday,
  monthLabel,
  queryWindowForMonth,
  sessionMinutesOf,
  shiftMonth,
  trainerNames,
  type HoursTally,
  type MonthKey,
} from "./hours";

interface Props {
  trainers: Trainer[];
}

export function AdminHoursTab({ trainers }: Props) {
  const { studios: inScope } = useOperationsScope();
  const [month, setMonth] = useState<MonthKey>(() => monthKeyOfToday());
  const thisMonth = monthKeyOfToday();
  const names = useMemo(() => trainerNames(trainers), [trainers]);

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Clock3 className="w-5 h-5" />}
        title="Hours"
        subtitle="Training hours by trainer. A completed session counts for the studio's booked session length, whatever the stopwatch said."
        actions={
          <div className="adm-ins-controls">
            <AdminField label="Month" htmlFor="hrs-month">
              <div className="adm-hrs-month" id="hrs-month">
                <AdminButton size="sm" variant="quiet" iconOnly onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
                  <ChevronLeft className="w-4 h-4" />
                </AdminButton>
                <span className="adm-hrs-month__label">{monthLabel(month)}</span>
                <AdminButton
                  size="sm"
                  variant="quiet"
                  iconOnly
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                  disabled={month >= thisMonth}
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </AdminButton>
              </div>
            </AdminField>
          </div>
        }
      />

      {inScope.length === 0 ? (
        <AdminEmpty title="No studio to read">Hours are read per studio, and the app is not in one.</AdminEmpty>
      ) : inScope.length > 1 ? (
        <CompanyHours studios={inScope} month={month} names={names} />
      ) : inScope[0] ? (
        <StudioHours studio={inScope[0]} month={month} names={names} showName={false} />
      ) : null}

      <p className="adm-hrs-foot">
        Weeks run Monday to Sunday. A session logged more than {LATE_LOG_GRACE_DAYS} days after the day it happened is not
        counted here. Nothing on this screen is a rate or a ranking.
      </p>
    </AdminScreen>
  );
}

/* ------------------------------------------------------------------ *
 * One studio
 * ------------------------------------------------------------------ */

function useStudioTally(studio: Studio, month: MonthKey, names: Record<string, string>) {
  const window = useMemo(() => queryWindowForMonth(month, studio.timezone || undefined), [month, studio.timezone]);
  const read = useSessionsInRange({ studioId: studio.id, startMs: window.startMs, endMs: window.endMs });
  const tally = useMemo(
    () => hoursTally(read.sessions, { month, sessionMinutes: sessionMinutesOf(studio), names }),
    [read.sessions, month, studio, names],
  );
  return { read, tally };
}

function StudioHours({
  studio,
  month,
  names,
  showName,
}: {
  studio: Studio;
  month: MonthKey;
  names: Record<string, string>;
  showName: boolean;
}) {
  const { read, tally } = useStudioTally(studio, month, names);
  return (
    <>
      <StudioTiles tally={tally} loading={read.loading} />
      <HoursTable
        tally={tally}
        title={showName ? studio.name : "By trainer, by week"}
        subtitle={`${monthLabel(month)} · a session is ${tally.sessionMinutes} minutes at ${studio.name}.`}
        loading={read.loading}
        failed={read.failed}
        truncated={read.truncated}
      />
    </>
  );
}

function StudioTiles({ tally, loading }: { tally: HoursTally; loading: boolean }) {
  const measured = tally.rows.reduce(
    (acc, r) => ({ sessions: acc.sessions + r.measured.sessions, minutes: acc.minutes + r.measured.minutes }),
    { sessions: 0, minutes: 0 },
  );
  const avg = averageMinutes(measured);
  return (
    <AdminTiles>
      <AdminStatTile
        label="This month"
        value={formatHours(tally.totals.month.minutes)}
        foot={`${tally.totals.month.sessions} session${tally.totals.month.sessions === 1 ? "" : "s"}`}
        loading={loading}
      />
      <AdminStatTile
        label="Trainers"
        value={tally.rows.length}
        foot={tally.rows.length === 1 ? "with a session this month" : "with sessions this month"}
        loading={loading}
      />
      <AdminStatTile
        label="On the floor"
        value={avg === null ? "—" : `${avg} min`}
        foot={avg === null ? "no timed sessions yet" : `average, over ${measured.sessions} timed session${measured.sessions === 1 ? "" : "s"}`}
        loading={loading}
      />
    </AdminTiles>
  );
}

function HoursTable({
  tally,
  title,
  subtitle,
  loading,
  failed,
  truncated,
}: {
  tally: HoursTally;
  title: string;
  subtitle: string;
  loading: boolean;
  failed: boolean;
  truncated: boolean;
}) {
  return (
    <AdminPanel title={title} subtitle={subtitle} flush>
      {failed && (
        <div className="p-3">
          <AdminNotice tone="alert">The month could not be read. The numbers below are not the month — try again.</AdminNotice>
        </div>
      )}
      {truncated && (
        <div className="p-3">
          <AdminNotice tone="warn">
            More than {MAX_SESSIONS_IN_RANGE} sessions fall in this read, so the month is not all here. Send this to an
            administrator — the cap needs raising for this studio.
          </AdminNotice>
        </div>
      )}
      {(tally.unattributed > 0 || tally.open > 0) && (
        <div className="p-3">
          <AdminNotice tone="info">
            {tally.unattributed > 0 &&
              `${tally.unattributed} completed session${tally.unattributed === 1 ? " has" : "s have"} no trainer on the record and ${tally.unattributed === 1 ? "is" : "are"} not in any row. `}
            {tally.open > 0 && `${tally.open} session${tally.open === 1 ? " is" : "s are"} still open and not counted yet.`}
          </AdminNotice>
        </div>
      )}
      {loading ? (
        <AdminEmpty title="Adding up the month…" />
      ) : tally.rows.length === 0 ? (
        <AdminEmpty title="No completed sessions this month">{failed ? "" : "Nothing at this studio was finished in Journey in this month."}</AdminEmpty>
      ) : (
        <div className="adm-ins-table-wrap">
          <table className="adm-ins-table adm-hrs-table">
            <thead>
              <tr>
                <th scope="col">Trainer</th>
                {tally.weeks.map((w) => (
                  <th scope="col" key={w.key} title={`${w.start} to ${w.end}`}>
                    {w.label}
                  </th>
                ))}
                <th scope="col" className="adm-hrs-month-col">
                  Month
                </th>
              </tr>
            </thead>
            <tbody>
              {tally.rows.map((r) => (
                <tr key={r.trainerKey}>
                  <th scope="row">
                    {r.label}
                    {averageMinutes(r.measured) !== null && (
                      <span className="adm-hrs-measured">~{averageMinutes(r.measured)} min on the floor</span>
                    )}
                  </th>
                  {tally.weeks.map((w) => (
                    <Cell key={w.key} cell={r.weeks[w.key]} />
                  ))}
                  <Cell cell={r.month} strong />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="adm-hrs-total">
                <th scope="row">Total</th>
                {tally.weeks.map((w) => (
                  <Cell key={w.key} cell={tally.totals.weeks[w.key]} strong />
                ))}
                <Cell cell={tally.totals.month} strong />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </AdminPanel>
  );
}

function Cell({ cell, strong }: { cell: { sessions: number; minutes: number } | undefined; strong?: boolean }) {
  if (!cell || cell.sessions === 0) return <td className="adm-hrs-empty">—</td>;
  return (
    <td className={strong ? "adm-hrs-strong" : undefined}>
      <span className="adm-hrs-hours">{formatHours(cell.minutes)}</span>
      <span className="adm-hrs-count">
        {cell.sessions} session{cell.sessions === 1 ? "" : "s"}
      </span>
    </td>
  );
}

/* ------------------------------------------------------------------ *
 * Every studio the reader may look at
 * ------------------------------------------------------------------ */

interface StudioReport {
  tally: HoursTally;
  loading: boolean;
}

/**
 * Each studio block owns its own read (one month, one studio) and reports
 * its tally up; the company line is added from those reports rather than
 * read a second time. A report from another month (the reader just moved
 * the month and that block is still loading) is left out of the sum.
 */
function CompanyHours({ studios, month, names }: { studios: Studio[]; month: MonthKey; names: Record<string, string> }) {
  const [reports, setReports] = useState<Record<string, StudioReport>>({});
  const report = useCallback((studioId: string, r: StudioReport) => {
    setReports((prev) => (prev[studioId]?.tally === r.tally && prev[studioId]?.loading === r.loading ? prev : { ...prev, [studioId]: r }));
  }, []);

  const current = studios.map((s) => reports[s.id]).filter((r): r is StudioReport => Boolean(r) && r.tally.month === month);
  const settled = current.length === studios.length && current.every((r) => !r.loading);
  const total = current.reduce(
    (acc, r) => ({ sessions: acc.sessions + r.tally.totals.month.sessions, minutes: acc.minutes + r.tally.totals.month.minutes }),
    { sessions: 0, minutes: 0 },
  );
  const people = new Set(current.flatMap((r) => r.tally.rows.map((row) => row.trainerKey))).size;

  return (
    <>
      <AdminTiles>
        <AdminStatTile
          label="All my studios"
          value={formatHours(total.minutes)}
          foot={`${total.sessions} session${total.sessions === 1 ? "" : "s"} across ${studios.length} studios`}
          loading={!settled}
        />
        <AdminStatTile label="Trainers" value={people} foot="with a session this month, counted once" loading={!settled} />
      </AdminTiles>
      {studios.map((s) => (
        <StudioBlock key={s.id} studio={s} month={month} names={names} onReport={report} />
      ))}
    </>
  );
}

function StudioBlock({
  studio,
  month,
  names,
  onReport,
}: {
  studio: Studio;
  month: MonthKey;
  names: Record<string, string>;
  onReport: (studioId: string, r: StudioReport) => void;
}) {
  const { read, tally } = useStudioTally(studio, month, names);
  useEffect(() => {
    onReport(studio.id, { tally, loading: read.loading });
  }, [onReport, studio.id, tally, read.loading]);
  return (
    <HoursTable
      tally={tally}
      title={studio.name}
      subtitle={`${formatHours(tally.totals.month.minutes)} this month over ${tally.totals.month.sessions} session${tally.totals.month.sessions === 1 ? "" : "s"} · a session is ${tally.sessionMinutes} minutes here.`}
      loading={read.loading}
      failed={read.failed}
      truncated={read.truncated}
    />
  );
}
