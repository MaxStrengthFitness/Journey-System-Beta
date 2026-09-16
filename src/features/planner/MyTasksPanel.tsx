import { useMemo, useState } from "react";
import { Bell, BellPlus, CalendarClock, Check, ExternalLink, Plus, Repeat, UserCheck } from "lucide-react";
import { useActiveStudio } from "../../ActiveStudioContext";
import { auth } from "../../firebase";
import type { Client, Trainer } from "../../types";
import { useStudioTasks } from "../studio-tasks/useStudioTasks";
import { useTaskActions } from "../studio-tasks/useTaskActions";
import { TaskManager } from "../studio-tasks/TaskManager";
import { TaskNoteDialog } from "../studio-tasks/TaskNoteDialog";
import {
  taskScopeOf,
  type ClientTaskAction,
  type TaskRow,
  type TaskTemplate,
} from "../studio-tasks/types";
import { myTaskBuckets, taskMeta } from "./my-tasks";
import { upcomingTimed } from "./reminders/reminders";
import { clockLabel, reminderPreset } from "../studio-tasks/task-wizard";
import { dayWords } from "./jobs/jobs";
import { addDays } from "../studio-tasks/recurrence";
import { studioDateKey } from "../../lib/studio-time";
import { isStudioLeader } from "../../lib/permissions";
import { studioRoster } from "../studio-tasks/initiatives";
import { useTeamJobs } from "./jobs/useTeamJobs";
import { TeamJobsLane } from "./jobs/TeamJobsLane";
import { JobSheet } from "./jobs/JobSheet";

/**
 * MY TASKS — the Planner's second tab: a trainer's own list.
 *
 * Round: Learning + Planner, Sep 2026. The sorting is in ./my-tasks.ts.
 *
 * Nothing new is stored here. Personal tasks have lived at trainers/{uid}/task*
 * since the Settings-tiers round, private by path; this is the screen they
 * never had. Creating and editing still goes through TaskManager — the same
 * dialog the studio's list uses — opened in its personal-only mode.
 */

export interface MyTasksPanelProps {
  authTrainer?: Trainer | null;
  clients?: Client[];
  /** Everyone on the app — the studio's team, for a job's people. */
  trainers?: Trainer[];
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
}

export function MyTasksPanel({ authTrainer, clients, trainers, onOpenClientTask }: MyTasksPanelProps) {
  const { activeStudioId, activeStudio } = useActiveStudio();
  const studioName = activeStudio?.name ?? "this studio";

  const clientNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients ?? []) {
      if (c.id) map[c.id] = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
    }
    return map;
  }, [clients]);

  // The Firebase Auth uid, not authTrainer.id — personal tasks live at
  // trainers/{uid}/task*. Same reasoning as StudioHubView.
  const ownerId = auth.currentUser?.uid ?? null;
  const { rows, templates, loading, error } = useStudioTasks(activeStudioId, { ownerId, clientNames });

  const author = authTrainer?.id
    ? { id: authTrainer.id, name: authTrainer.fullName ?? "A trainer" }
    : null;
  const trainerId = authTrainer?.id ?? null;

  const [noteRow, setNoteRow] = useState<TaskRow | null>(null);
  const actions = useTaskActions({ author, onNeedsNote: setNoteRow });

  // The team jobs this trainer is on (Planner rework) — the same listener the
  // Studio tab uses; only one of the two is mounted at a time.
  const teamJobs = useTeamJobs(activeStudioId ?? null);
  const myOpenJobs = useMemo(
    () => teamJobs.jobs.filter((j) => j.status === "open" && trainerId && j.assigneeIds.includes(trainerId)),
    [teamJobs.jobs, trainerId],
  );
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const openJob = teamJobs.jobs.find((j) => j.id === openJobId) ?? null;
  const roster = useMemo(() => studioRoster(trainers ?? [], activeStudioId ?? null), [trainers, activeStudioId]);

  const buckets = useMemo(() => myTaskBuckets(rows, trainerId), [rows, trainerId]);
  const repeating = useMemo(
    () => templates.filter((t) => taskScopeOf(t) === "personal" && t.active !== false),
    [templates],
  );

  const [managing, setManaging] = useState(false);
  const [intent, setIntent] = useState<
    | { mode: "new"; scope: "personal"; preset?: Partial<TaskTemplate> }
    | { mode: "edit"; template: TaskTemplate }
    | null
  >(null);

  // Coming up: your timed tasks over the next week, after today (today's
  // are in the list above, in time order).
  const todayKey = studioDateKey(new Date()) ?? "";
  const comingUp = useMemo(
    () =>
      todayKey
        ? upcomingTimed(
            templates.filter((t) => taskScopeOf(t) === "personal"),
            addDays(todayKey, 1),
            6,
          )
        : [],
    [templates, todayKey],
  );

  const nothingToday =
    !loading &&
    !error &&
    buckets.open.length === 0 &&
    buckets.done.length === 0 &&
    buckets.assigned.length === 0 &&
    myOpenJobs.length === 0 &&
    comingUp.length === 0;

  const renderRow = (r: TaskRow) => {
    const done = r.status === "done";
    const busy = actions.busyIds.has(r.id);
    const meta = taskMeta(r);
    const target = r.template.target;
    const clientId = target.kind === "client" ? target.clientId : undefined;
    return (
      <li className={`pl__task${done ? " pl__task--done" : ""}`} key={r.id}>
        <button
          type="button"
          className="pl__check"
          aria-pressed={done}
          aria-label={done ? `Reopen “${r.title}”` : `Mark “${r.title}” done`}
          disabled={busy}
          onClick={() => (done ? actions.reopen(r) : actions.complete(r))}
        >
          {done && <Check size={16} aria-hidden />}
        </button>
        <div className="pl__task-main">
          <span className="pl__task-title">
            {r.title}
            {typeof r.template.remindMinutesBefore === "number" && r.template.timeOfDay && (
              <Bell size={13} className="pl__task-bell" aria-label="Reminder set" />
            )}
          </span>
          {meta && <span className="pl__task-meta">{meta}</span>}
          {r.template.detail && <span className="pl__task-detail">{r.template.detail}</span>}
        </div>
        {clientId && onOpenClientTask && !done && (
          <button
            type="button"
            className="pl__btn"
            onClick={() =>
              onOpenClientTask(
                clientId,
                target.kind === "client" ? target.action : undefined,
              )
            }
          >
            <ExternalLink size={14} aria-hidden />
            Open
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="st">
      <div className="st__scroll touch-pane">
        <div className="pl__panel-head">
          <div className="pl__panel-titles">
            <h2 className="pl__h2">Your list</h2>
            <p className="pl__sub">
              Only you can see these. Each one belongs to the studio you added it
              at — this list is {studioName}'s.
            </p>
          </div>
          <div className="pl__panel-actions">
            <button
              type="button"
              className="pl__btn"
              disabled={!ownerId || !activeStudioId}
              onClick={() => {
                setIntent({ mode: "new", scope: "personal" });
                setManaging(true);
              }}
            >
              <Plus size={14} aria-hidden />
              New task
            </button>
            <button
              type="button"
              className="pl__btn"
              disabled={!ownerId || !activeStudioId}
              onClick={() => {
                setIntent({ mode: "new", scope: "personal", preset: reminderPreset(todayKey, new Date()) });
                setManaging(true);
              }}
            >
              <BellPlus size={14} aria-hidden />
              New reminder
            </button>
            <button
              type="button"
              className="pl__btn"
              disabled={!ownerId || !activeStudioId}
              onClick={() => {
                setIntent(null);
                setManaging(true);
              }}
            >
              <Repeat size={14} aria-hidden />
              All my tasks{repeating.length > 0 ? ` (${repeating.length})` : ""}
            </button>
          </div>
        </div>

        {error && <p className="sh__loading">{error}</p>}
        {loading && rows.length === 0 ? (
          <p className="sh__loading">Loading today…</p>
        ) : nothingToday ? (
          <div className="pl__empty">
            <p className="pl__empty-title">Nothing on your list today</p>
            <p className="pl__empty-body">
              Add what only you need to remember — “call Priya's physio”, “bring the
              InBody printouts”, “check Mark's seat height Thursday”. A task can
              repeat, point at a client, and ring your bell at a set time.
            </p>
          </div>
        ) : (
          <>
            {buckets.open.length > 0 && (
              <section className="pl__list" aria-labelledby="pl-today">
                <h3 className="pl__list-head" id="pl-today">
                  Today <span className="pl__count">{buckets.open.length}</span>
                </h3>
                <ul>{buckets.open.map(renderRow)}</ul>
              </section>
            )}

            <TeamJobsLane
              jobs={teamJobs.jobs}
              loading={teamJobs.loading}
              error={teamJobs.error}
              me={author}
              mineOnly
              hideWhenEmpty
              canPost={false}
              title="Your team jobs"
              onOpen={(job) => setOpenJobId(job.id)}
            />

            {buckets.assigned.length > 0 && (
              <section className="pl__list" aria-labelledby="pl-assigned">
                <h3 className="pl__list-head" id="pl-assigned">
                  <UserCheck size={14} aria-hidden />
                  Assigned to you at {studioName}
                  <span className="pl__count">{buckets.assigned.length}</span>
                </h3>
                <p className="pl__list-note">
                  A head trainer put your name on these studio tasks. Anyone can still
                  close them — they also show under Studio.
                </p>
                <ul>{buckets.assigned.map(renderRow)}</ul>
              </section>
            )}

            {comingUp.length > 0 && (
              <section className="pl__list" aria-labelledby="pl-coming">
                <h3 className="pl__list-head" id="pl-coming">
                  <CalendarClock size={14} aria-hidden />
                  Coming up <span className="pl__count">{comingUp.length}</span>
                </h3>
                <ul>
                  {comingUp.slice(0, 12).map((u) => (
                    <li key={u.key} className="pl__task pl__task--ahead">
                      <span className="pl__when">
                        <span className="pl__when-day">{dayWords(u.dateKey, todayKey)}</span>
                        <span className="pl__when-time">{clockLabel(u.time)}</span>
                      </span>
                      <button
                        type="button"
                        className="pl__task-main pl__task-open"
                        onClick={() => {
                          setIntent({ mode: "edit", template: u.template });
                          setManaging(true);
                        }}
                      >
                        <span className="pl__task-title">
                          {u.template.title}
                          {u.reminds && <Bell size={13} className="pl__task-bell" aria-label="Reminder set" />}
                        </span>
                        {u.template.detail && <span className="pl__task-detail">{u.template.detail}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {buckets.done.length > 0 && (
              <section className="pl__list" aria-labelledby="pl-done">
                <h3 className="pl__list-head" id="pl-done">
                  Done today <span className="pl__count">{buckets.done.length}</span>
                </h3>
                <ul>{buckets.done.map(renderRow)}</ul>
              </section>
            )}
          </>
        )}
      </div>

      {/* Always mounted, `open` controlled — see StudioHubView on why a Base UI
          dialog must never be conditionally rendered. */}
      <TaskManager
        open={managing}
        onOpenChange={(o) => {
          setManaging(o);
          if (!o) setIntent(null);
        }}
        studioId={activeStudioId}
        canManageStudio={false}
        ownerId={ownerId}
        templates={templates}
        author={author}
        clients={clients}
        openWith={intent}
      />

      <JobSheet
        job={openJob}
        open={openJobId !== null && openJob !== null}
        onOpenChange={(o) => !o && setOpenJobId(null)}
        me={author}
        canLead={isStudioLeader(authTrainer ?? null)}
        people={roster}
        onOpenClient={onOpenClientTask ? (id) => onOpenClientTask(id) : undefined}
      />

      <TaskNoteDialog
        row={noteRow}
        open={noteRow !== null}
        onOpenChange={(o) => !o && setNoteRow(null)}
        onSubmit={async (note, flagged) => {
          if (!noteRow) return;
          await actions.closeWithNote(noteRow, note, flagged);
          setNoteRow(null);
        }}
      />
    </div>
  );
}
