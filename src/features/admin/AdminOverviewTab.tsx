/**
 * Admin Overview — the operational welcome screen.
 *
 * Replaces AdminMetricsDashboard, which showed a month's session total, a
 * cross-train total, and one card per studio headed "Strict Demographic
 * Adherence". Two of those numbers were wrong for any studio keyed by a
 * Mindbody Location ID rather than a Site ID (phase 4 fixes the cause), and
 * none of them answered the question someone opening this screen has, which
 * is "is my studio running".
 *
 * So: who is coaching right now, how heavy today is, what fell over, and what
 * still has to get done. The arithmetic lives in overview.ts and is tested
 * separately; this file is layout and wiring.
 */

import React, { useMemo, useState } from "react";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Settings,
  TriangleAlert,
  UserRoundX,
} from "lucide-react";
import type {
  Client,
  ScheduleEntry,
  Studio,
  Trainer,
  WorkoutSession,
} from "../../types";
import {
  formatStudioTime,
  studioDateKey,
  formatStudioDate,
} from "../../lib/studio-time";
import {
  useStudioTasks,
  setTaskStatus,
  studioLocation,
  categoryLabel,
  type TaskRow,
} from "../studio-tasks";
import {
  attentionItems,
  entriesForDay,
  loadByDay,
  summariseFloor,
  trainerLanes,
  type AttentionKind,
} from "./overview";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminHeader,
  AdminPanel,
  AdminRows,
  AdminScreen,
  AdminStatTile,
  AdminTiles,
} from "./primitives";

export interface AdminOverviewTabProps {
  authTrainer: Trainer;
  studios: Studio[];
  activeStudioId: string | null;
  /** Everything the live schedule hook has loaded — today plus a week ahead. */
  schedules: ScheduleEntry[];
  sessions: WorkoutSession[];
  clients: Client[];
  onManageStudios?: () => void;
  onOpenStudioTasks?: () => void;
  onNavigateProfile?: (clientId: string) => void;
}

const ATTENTION_COPY: Record<AttentionKind, { label: string; tone: "alert" | "warn" | "neutral" }> = {
  "no-show": { label: "No-show", tone: "alert" },
  unresolved: { label: "Not marked", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** How many rows each list shows before deferring to its own screen. */
const PREVIEW_ROWS = 6;

export function AdminOverviewTab({
  authTrainer,
  studios,
  activeStudioId,
  schedules,
  sessions,
  clients,
  onManageStudios,
  onOpenStudioTasks,
  onNavigateProfile,
}: AdminOverviewTabProps) {
  // One clock for the whole render. Calling new Date() per selector would let
  // a slot be "in progress" in the tiles and "unresolved" in the list.
  const [now, setNow] = useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const studio = studios.find((s) => s.id === activeStudioId) ?? null;
  const todayKey = studioDateKey(now) ?? "";

  const today = useMemo(
    () => entriesForDay(schedules, todayKey),
    [schedules, todayKey],
  );
  const floor = useMemo(() => summariseFloor(today, now), [today, now]);
  const lanes = useMemo(
    () => trainerLanes(today, now, sessions),
    [today, now, sessions],
  );
  const attention = useMemo(() => attentionItems(today, now), [today, now]);
  const week = useMemo(() => loadByDay(schedules), [schedules]);

  const clientNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients) {
      if (c.id) map[c.id] = `${c.firstName} ${c.lastName}`.trim();
    }
    return map;
  }, [clients]);

  const tasks = useStudioTasks(activeStudioId, {
    ownerId: authTrainer?.authUid ?? authTrainer?.id ?? null,
    clientNames,
  });
  const openTasks = tasks.rows.filter((r) => r.status === "open");

  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const markTaskDone = async (row: TaskRow) => {
    if (!activeStudioId) return;
    setBusyTaskId(row.id);
    try {
      await setTaskStatus({
        location: studioLocation(activeStudioId),
        planned: row,
        status: "done",
        author: authTrainer
          ? { id: authTrainer.id, name: authTrainer.fullName }
          : null,
      });
    } catch {
      // The list is a live stream: a failed write simply leaves the row open,
      // which is the honest outcome. Nothing to roll back.
    } finally {
      setBusyTaskId(null);
    }
  };

  const liveLane = lanes.find((l) => l.live || l.nowWith);
  const maxDayLoad = Math.max(1, ...week.map((d) => d.booked));

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Activity className="w-5 h-5" />}
        title={studio?.name ? `${studio.name} — today` : "Today"}
        subtitle={`${formatStudioDate(now, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })} · ${floor.booked} on the books, ${floor.clients} ${
          floor.clients === 1 ? "client" : "clients"
        }`}
        actions={
          onManageStudios && (
            <AdminButton variant="quiet" onClick={onManageStudios}>
              <Settings className="w-3.5 h-3.5" />
              Manage studios
            </AdminButton>
          )
        }
      />

      <AdminTiles>
        <AdminStatTile
          label="On the floor now"
          value={floor.inProgress}
          foot={
            liveLane?.nowWith
              ? `${liveLane.trainerName} with ${liveLane.nowWith}`
              : floor.upcoming > 0
                ? `${floor.upcoming} still to come`
                : "Nothing running"
          }
          tone={floor.inProgress > 0 ? "attention" : undefined}
        />
        <AdminStatTile
          label="Completed"
          value={floor.completed}
          foot={
            floor.showRate === null
              ? "Nothing resolved yet"
              : `${Math.round(floor.showRate * 100)}% show rate`
          }
        />
        <AdminStatTile
          label="Missed"
          value={floor.missed}
          foot={`${floor.noShow} no-show, ${floor.cancelled} cancelled`}
          tone={floor.missed > 0 ? "alert" : undefined}
        />
        <AdminStatTile
          label="Not marked"
          value={floor.unresolved}
          foot={
            floor.unresolved > 0
              ? "Finished slots with no outcome"
              : "Everything accounted for"
          }
          tone={floor.unresolved > 0 ? "attention" : undefined}
        />
        <AdminStatTile
          label="Studio to-do"
          value={`${tasks.counts.done}/${tasks.counts.total}`}
          foot={
            tasks.counts.flagged > 0
              ? `${tasks.counts.flagged} flagged`
              : openTasks.length > 0
                ? `${openTasks.length} still open`
                : "All clear"
          }
          onClick={onOpenStudioTasks}
          loading={tasks.loading}
        />
      </AdminTiles>

      <div className="adm-ov__cols">
        <div className="adm-ov__stack">
          <AdminPanel
            title="On the floor"
            subtitle="Everyone with something booked today, in the order their day starts."
            icon={<CalendarClock className="w-3.5 h-3.5" />}
            flush
          >
            {lanes.length === 0 ? (
              <div className="p-4">
                <AdminEmpty title="Nothing booked today">
                  When Mindbody syncs today's appointments they appear here,
                  one lane per trainer.
                </AdminEmpty>
              </div>
            ) : (
              <AdminRows>
                {lanes.map((lane) => {
                  const done = lane.total > 0 ? lane.completed / lane.total : 0;
                  return (
                    <div
                      key={lane.trainerId ?? lane.trainerName}
                      className="adm-lane"
                    >
                      <div className="adm-lane__who">
                        <div className="adm-lane__name">
                          {lane.trainerName}
                          {lane.live && (
                            <span className="adm-lane__live">
                              <span className="adm-lane__dot" />
                              Live
                            </span>
                          )}
                        </div>
                        <div className="adm-lane__sub">
                          {lane.nowWith
                            ? `With ${lane.nowWith}`
                            : lane.nextAt
                              ? `Next at ${formatStudioTime(lane.nextAt)}`
                              : lane.total === 0
                                ? `${lane.cancelled} cancelled`
                                : "Day complete"}
                          {lane.noShow > 0 && ` · ${lane.noShow} no-show`}
                        </div>
                      </div>
                      <span className="adm-lane__count">
                        {lane.completed}/{lane.total}
                      </span>
                      <span
                        className="adm-lane__track"
                        role="img"
                        aria-label={`${lane.completed} of ${lane.total} complete`}
                      >
                        <span
                          className="adm-lane__fill"
                          style={{ width: `${Math.round(done * 100)}%` }}
                        />
                      </span>
                    </div>
                  );
                })}
              </AdminRows>
            )}
          </AdminPanel>

          <AdminPanel
            title="Needs attention"
            subtitle="No-shows first, then slots nobody marked, then cancellations."
            icon={<TriangleAlert className="w-3.5 h-3.5" />}
            actions={
              attention.length > PREVIEW_ROWS && (
                <AdminBadge tone="neutral">{attention.length} total</AdminBadge>
              )
            }
            flush
          >
            {attention.length === 0 ? (
              <div className="p-4">
                <AdminEmpty title="Nothing to chase">
                  Every appointment today is either done, running, or still to
                  come.
                </AdminEmpty>
              </div>
            ) : (
              <AdminRows>
                {attention.slice(0, PREVIEW_ROWS).map((item) => {
                  const copy = ATTENTION_COPY[item.kind];
                  return (
                    <div
                      key={item.id}
                      className="adm-row"
                      role={item.clientId && onNavigateProfile ? undefined : "group"}
                    >
                      <AdminBadge tone={copy.tone}>
                        {item.kind === "no-show" ? (
                          <UserRoundX className="w-3 h-3" />
                        ) : null}
                        {copy.label}
                      </AdminBadge>
                      <div className="adm-row__main">
                        <div className="adm-row__name">{item.clientName}</div>
                        <div className="adm-row__meta">
                          {item.at ? formatStudioTime(item.at) : "—"} ·{" "}
                          {item.trainerName}
                        </div>
                      </div>
                      {item.clientId && onNavigateProfile && (
                        <AdminButton
                          variant="ghost"
                          size="sm"
                          onClick={() => onNavigateProfile(item.clientId!)}
                        >
                          Open
                        </AdminButton>
                      )}
                    </div>
                  );
                })}
              </AdminRows>
            )}
          </AdminPanel>
        </div>

        <div className="adm-ov__stack">
          <AdminPanel
            title="Studio to-do"
            subtitle="Today's shared list. Creating and scheduling tasks lives on the to-do screen."
            icon={<ClipboardList className="w-3.5 h-3.5" />}
            actions={
              onOpenStudioTasks && (
                <AdminButton variant="quiet" size="sm" onClick={onOpenStudioTasks}>
                  Open
                </AdminButton>
              )
            }
            flush
          >
            {tasks.loading ? (
              <div className="p-4 flex flex-col gap-2">
                <span className="adm-skeleton" style={{ height: 18 }} />
                <span className="adm-skeleton" style={{ height: 18, width: "70%" }} />
              </div>
            ) : openTasks.length === 0 ? (
              <div className="p-4">
                <AdminEmpty title={tasks.counts.total === 0 ? "No tasks today" : "All done"}>
                  {tasks.counts.total === 0
                    ? "Recurring cleaning and maintenance tasks show up here once they are set on the to-do screen."
                    : `All ${tasks.counts.total} of today's tasks are marked complete.`}
                </AdminEmpty>
              </div>
            ) : (
              <AdminRows>
                {openTasks.slice(0, PREVIEW_ROWS).map((row) => (
                  <div key={row.id} className="adm-row">
                    <div className="adm-row__main">
                      <div className="adm-row__name">{row.title}</div>
                      <div className="adm-row__meta">
                        {categoryLabel(row.category)}
                        {row.machineName ? ` · ${row.machineName}` : ""}
                        {row.clientName ? ` · ${row.clientName}` : ""}
                      </div>
                    </div>
                    <AdminButton
                      variant="quiet"
                      size="sm"
                      busy={busyTaskId === row.id}
                      onClick={() => void markTaskDone(row)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Done
                    </AdminButton>
                  </div>
                ))}
              </AdminRows>
            )}
          </AdminPanel>

          <AdminPanel
            title="The week"
            subtitle="Booked appointments per day, with completed shaded."
          >
            {week.length === 0 ? (
              <AdminEmpty title="No schedule loaded" />
            ) : (
              <div className="adm-week">
                {week.map((day) => (
                  <div
                    key={day.dayKey}
                    className={`adm-week__day${day.dayKey === todayKey ? " adm-week__day--today" : ""}`}
                    title={`${day.booked} booked, ${day.completed} completed, ${day.missed} missed`}
                  >
                    <span className="adm-week__n">{day.booked}</span>
                    <span
                      className="adm-week__bar"
                      style={{
                        height: `${Math.max(4, Math.round((day.booked / maxDayLoad) * 76))}px`,
                      }}
                    >
                      <span
                        className="adm-week__bar-done"
                        style={{
                          height: `${day.booked ? Math.round((day.completed / day.booked) * 100) : 0}%`,
                        }}
                      />
                    </span>
                    <span className="adm-week__label">
                      {new Date(`${day.dayKey}T12:00:00`).toLocaleDateString(
                        "en-US",
                        { weekday: "short" },
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </AdminPanel>
        </div>
      </div>
    </AdminScreen>
  );
}
