/**
 * THE STUDIO HUB — what feeds Relay's Board.
 *
 * It began as one screen of four lanes (my shift, clients waiting, the
 * board, the playbook), then sat behind the Board's five doors (Relay room,
 * Sep 28 2026). Since the Relay Board rebuild (Oct 3 2026) the Board draws
 * all of it as one board of cards (relay/board/Board.tsx, the rules in
 * relay/board/cards.ts), and this file is the host: it holds the listeners
 * the Board reads (the day's tasks, the asks, the team jobs, the playbook for
 * Since you were in) and the dialogs a card opens (a team job's sheet, a
 * leader's Assign, a closing note).
 *
 * SELF-CONTAINED, DELIBERATELY: the same props as the original screen, and
 * everything else fetched here, so PlannerView mounts it in one line.
 */
import { useEffect, useMemo, useState } from "react";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { auth } from "../../firebase";
import { studioDateKey } from "../../lib/studio-time";
import type { Client, Trainer } from "../../types";
import type { ClientTaskAction, TaskRow } from "./types";
import type { ShiftGroup, TaskActor } from "./board";
import { studioRoster } from "./initiatives";
import { repeatPlanForward } from "./recurrence";
import { AssignDialog } from "./AssignDialog";
import { TaskNoteDialog } from "./TaskNoteDialog";
import { usePlaybook } from "./usePlaybook";
import { useStudioRequests } from "./useStudioRequests";
import { useStudioTasks } from "./useStudioTasks";
import { useStudioTaskCategories } from "./useStudioTaskCategories";
import { useTaskActions } from "./useTaskActions";
import { useTeamJobs } from "../relay/jobs/useTeamJobs";
import { JobSheet } from "../relay/jobs/JobSheet";
import { Board } from "../relay/board/Board";
import { SinceYouWereIn } from "../relay/board/SinceYouWereIn";
import { publishPulse, pulseEvents } from "../relay/board/pulse";
import { leadsHere } from "../relay/leads";
import { useRelayMaybe } from "../relay/board/RelayContext";
import type { TeamJob } from "../relay/jobs/types";
import "./studio-tasks.css";
import "./studio-hub.css";

export interface StudioHubViewProps {
  authTrainer?: Trainer | null;
  /** For naming client tasks and opening them. */
  clients?: Client[];
  /**
   * Everyone on the app, filtered here to this studio's own team: everyone who
   * works here (studioRoster, lib/who-works-here.ts). Feeds the initiative
   * roll-up's denominator and the pickers.
   */
  trainers?: Trainer[];
  /**
   * Open the real flow a client task refers to.
   *
   * A client task is not a checkbox that claims an InBody scan happened — it
   * is a pointer at the screen where the work is actually done.
   */
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
  /** Open this team job's sheet on arrival (a notification's link). */
  openJobId?: string | null;
  onOpenedJob?: () => void;
}

export function StudioHubView({ authTrainer, clients, trainers, onOpenClientTask, openJobId = null, onOpenedJob }: StudioHubViewProps) {
  const { activeStudioId } = useActiveStudio();
  const [noteRow, setNoteRow] = useState<TaskRow | null>(null);
  /*
   * ASSIGNMENT IS A LEADER'S ACT — AT THIS STUDIO. leadsHere (relay/leads.ts)
   * answers it the way the rules do (isStudioOwnerOrHeadTrainer on
   * taskInstances). Hiding the button is a convenience so the floor is not
   * offered an action that would be refused; it is not the security boundary.
   */
  const canAssign = leadsHere(authTrainer, activeStudioId);
  const [assignGroup, setAssignGroup] = useState<ShiftGroup | null>(null);

  const clientNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients ?? []) {
      if (c.id) map[c.id] = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
    }
    return map;
  }, [clients]);

  /*
   * The Firebase Auth uid, NOT authTrainer.id: personal tasks live at
   * trainers/{uid}/task* and the rule is request.auth.uid == trainerId. The
   * two ids coincide for trainers created through Auth but not for every older
   * document, and getting it wrong here is a silent permission denial on
   * somebody else's account.
   */
  const ownerId = auth.currentUser?.uid ?? null;

  const { rows, loading, error: tasksError } = useStudioTasks(activeStudioId, { ownerId, clientNames });
  const { categories } = useStudioTaskCategories(activeStudioId);
  const { open: openRequests, recentlyResolved, failed: requestsFailed } = useStudioRequests(activeStudioId ?? null);
  const { entries: playbookEntries } = usePlaybook(activeStudioId ?? null);
  /*
   * TEAM JOBS (Planner rework, Sep 2026) — one piece of work several people
   * share. Posting is a leader's act — of THIS studio, as the teamJobs rules
   * check it (relay/leads.ts); taking one that is up for grabs, ticking
   * parts and closing it are the floor's.
   */
  const leadsJobs = leadsHere(authTrainer, activeStudioId);
  const teamJobs = useTeamJobs(activeStudioId ?? null);
  const relay = useRelayMaybe();
  const [openJobKey, setOpenJobKey] = useState<string | null>(null);
  const openJob: TeamJob | null = useMemo(() => teamJobs.jobs.find((j) => j.id === openJobKey) ?? null, [teamJobs.jobs, openJobKey]);
  // Arrived from a notification: open that job once the jobs have loaded.
  useEffect(() => {
    if (!openJobId || teamJobs.loading) return;
    setOpenJobKey(openJobId);
    onOpenedJob?.();
  }, [openJobId, teamJobs.loading, onOpenedJob]);

  const author = authTrainer?.id ? { id: authTrainer.id, name: authTrainer.fullName ?? "A trainer" } : null;
  const trainerId = authTrainer?.id ?? null;
  const actions = useTaskActions({ author, onNeedsNote: setNoteRow });
  const todayKey = studioDateKey(new Date()) ?? "";

  const roster = useMemo(() => studioRoster(trainers ?? [], activeStudioId ?? null), [trainers, activeStudioId]);

  /*
   * THE PULSE (Relay, Sep 2026). What teammates did, from the documents this
   * screen already listens to, published for Just now. Nothing is read for it.
   */
  useEffect(() => {
    if (!activeStudioId || !relay) return;
    publishPulse(activeStudioId, pulseEvents({ rows, jobs: teamJobs.jobs, requests: [...openRequests, ...recentlyResolved], now: Date.now() }));
  }, [activeStudioId, relay, rows, teamJobs.jobs, openRequests, recentlyResolved]);

  return (
    <div className="st">
      <div className="st__scroll touch-pane">
        {relay && (
          <Board
            rows={rows}
            jobs={teamJobs.jobs}
            requests={openRequests}
            resolved={recentlyResolved}
            actions={actions}
            author={author}
            onOpenJob={(job) => setOpenJobKey(job.id)}
            onOpenClientTask={onOpenClientTask}
            onAssign={canAssign ? setAssignGroup : undefined}
            categories={categories}
            clients={clients}
            loading={loading && rows.length === 0}
            unknown={Boolean(tasksError) || requestsFailed || Boolean(teamJobs.error)}
            news={<SinceYouWereIn rows={rows} jobs={teamJobs.jobs} resolved={recentlyResolved} playbook={playbookEntries} pill />}
          />
        )}
      </div>

      <JobSheet
        job={openJob}
        open={openJobKey !== null}
        onOpenChange={(o) => !o && setOpenJobKey(null)}
        me={author}
        canLead={leadsJobs}
        people={roster}
        onOpenClient={onOpenClientTask ? (id) => onOpenClientTask(id) : undefined}
      />

      {/*
        Always mounted, `open` controlled — never conditionally rendered. A
        Base UI dialog that unmounts on an early return can leave
        `pointer-events: none` on <body>, which presents as "the mouse works
        but the iPad is frozen". Same shape as TaskNoteDialog below.
      */}
      <AssignDialog
        group={assignGroup}
        open={Boolean(assignGroup)}
        onOpenChange={(o) => !o && setAssignGroup(null)}
        roster={roster}
        currentUserId={trainerId}
        onSubmit={(assignee: TaskActor | null, days: number) => {
          if (!assignGroup) return;
          const open = assignGroup.rows.filter((r) => r.status === "open");
          const template = open[0]?.template;
          /*
           * Repeat the rows already on screen forward, rather than
           * re-expanding the template — see repeatPlanForward. Clearing an
           * assignment only ever touches today: reaching into next week to
           * un-assign days a trainer may never have seen is a surprise, and
           * those rows expire on their own anyway.
           */
          const planned = assignee && template && days > 1 && todayKey ? repeatPlanForward(open, template, todayKey, days) : open;
          return actions.assign(assignGroup, assignee, { planned, days: assignee ? days : 1 });
        }}
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
