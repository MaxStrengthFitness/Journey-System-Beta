/**
 * THE STUDIO HUB — one screen, four lanes.
 *
 * Replaces the flat "Studio to-do" list. The reasoning lives in board.ts; the
 * short version is that the old screen made everything a peer of everything
 * else, so 19 cleaning rows buried the one post where a colleague was asking
 * for help with a client's shoulder.
 *
 *   MY SHIFT   expires tonight    -> a strip. Volume, no reading.
 *   CLIENTS    a person is waiting -> names, and a way through to the work.
 *   THE BOARD  until answered     -> the human content.
 *   PLAYBOOK   never expires      -> what we learned.
 *
 * Lanes are LIFESPAN, chips are TOPIC. A trainer between two 20-minute
 * sessions is asking "what dies today if I don't act", not "show me the
 * Cleaning bucket" — so lifespan is the skeleton and topic narrows the board.
 *
 * MINE is a filter, not a fifth lane. Almost all of it is derived from what
 * you already claimed or authored, so it costs no extra data.
 *
 * INSIDE RELAY IT IS THE BOARD (Relay room, Sep 28 2026; the redesign's
 * Mission Board, AJ's pick): one "Right now" sentence, five doors, one job
 * dealt to you (relay/board/Board.tsx), and every lane below sorted behind
 * the door where its work happens: the shift, the rings and the floor map
 * behind Floor work; client tasks and renewals behind Desk work; the asks
 * and the playbook behind Help a teammate; the network's focus and the
 * initiatives behind From leadership; your team jobs behind Mine. The lanes
 * themselves are unchanged. Mounted anywhere else, the lanes stack as below.
 *
 * SELF-CONTAINED, DELIBERATELY
 * This took the same three props as the original StudioTasksView and fetches
 * everything else itself, so routing it was a one-line swap in AppContent.
 * The old screen and its ?classic-todo escape hatch were deleted in the cost
 * round (Sep 2026) once the hub had had its week on the floor; the Planner
 * now embeds this as its Studio lane.
 */
import { useEffect, useMemo, useState } from "react";
import { UserRound, Users } from "lucide-react";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { useToast } from "../../contexts/ToastContext";
import { auth } from "../../firebase";
import { studioDateKey, formatStudioDate } from "../../lib/studio-time";
import { cn } from "../../lib/utils";
import type { Client, Trainer } from "../../types";
import type { ClientTaskAction, TaskRow } from "./types";
import {
  BOARD_TOPIC_LABEL,
  mineRows,
  topicCounts,
  type BoardTopic,
  type ShiftGroup,
  type TaskActor,
} from "./board";
import { studioRoster } from "./initiatives";
import { repeatPlanForward } from "./recurrence";
import { AssignDialog } from "./AssignDialog";
import { ShiftStrip } from "./ShiftStrip";
import { ClientTasksLane } from "./ClientTasksLane";
import { PlaybookLane } from "./PlaybookLane";
import { RequestsLane } from "./RequestsLane";
import { TaskNoteDialog } from "./TaskNoteDialog";
import { usePlaybook } from "./usePlaybook";
import { useStudioRequests } from "./useStudioRequests";
import { useStudioTasks } from "./useStudioTasks";
import { useStudioTaskCategories } from "./useStudioTaskCategories";
import { useTaskActions } from "./useTaskActions";
import { confirmPlaybookEntry, retirePlaybookEntry } from "./playbook-mutations";
import type { PlaybookEntry } from "./playbook";
import { RenewalsLane } from "../renewals/RenewalsLane";
import { useTeamJobs } from "../relay/jobs/useTeamJobs";
import { TeamJobsLane } from "../relay/jobs/TeamJobsLane";
import { JobComposer } from "../relay/jobs/JobComposer";
import { JobSheet } from "../relay/jobs/JobSheet";
import { isOnJob, isUpForGrabs, jobTopic } from "../relay/jobs/jobs";
import { GlanceBand, type GlanceCounts } from "../relay/GlanceBand";
import { Board } from "../relay/board/Board";
import { SinceYouWereIn } from "../relay/board/SinceYouWereIn";
import { useStudioSettings } from "../studio-settings";
import { jobsBehind, type DoorId } from "../relay/board/doors";
import { ShiftRings } from "../relay/board/ShiftRings";
import { FloorMap } from "../relay/board/FloorMap";
import { FocusBanner } from "../relay/board/FocusBanner";
import { publishPulse, pulseEvents } from "../relay/board/pulse";
import { publishTrackedProgress, useTracked } from "../relay/board/tracked";
import { trackedLive } from "../relay/board/track-live";
import { leadsHere } from "../relay/leads";
import { useRelayMaybe } from "../relay/board/RelayContext";
import type { TeamJob } from "../relay/jobs/types";
import "./studio-tasks.css";
import "./studio-hub.css";

const TOPICS: BoardTopic[] = ["all", "clients", "equipment", "initiatives", "help"];

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
  /**
   * Rendered as the Planner's Studio tab (Learning + Planner round, Sep 2026).
   * The Planner's masthead already names the studio and the day, so the
   * hub's own title and date give way to one line saying what this tab is.
   * Everything below the header is unchanged.
   */
  embedded?: boolean;
}

export function StudioHubView({
  authTrainer,
  clients,
  trainers,
  onOpenClientTask,
  openJobId = null,
  onOpenedJob,
  embedded = false,
}: StudioHubViewProps) {
  const { activeStudioId, activeStudio } = useActiveStudio();
  const { success: toastSuccess, error: toastError } = useToast();

  const [topic, setTopic] = useState<BoardTopic>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [noteRow, setNoteRow] = useState<TaskRow | null>(null);
  /*
   * ASSIGNMENT IS A LEADER'S ACT — AT THIS STUDIO.
   *
   * leadsHere (relay/leads.ts) answers it the way the rules do
   * (isStudioOwnerOrHeadTrainer on taskInstances): a leader role at their
   * home or an owned studio, or the grant (managedStudioIds) for this one.
   * It used to ask the role alone, so a trainer with the grant was never
   * offered Assign while a head trainer visiting another studio was offered
   * one the rules refuse (voice review follow-up, Sep 27 2026). Hiding the
   * button is a convenience so the floor is not offered an action that
   * would be refused; it is not the security boundary, and it must never be
   * mistaken for one. (leadsHere also says yes to franchise owners and
   * administrators; the taskInstances rule lets administrators assign but
   * not franchise owners — whether they may is AJ's call.)
   */
  const canAssign = leadsHere(authTrainer, activeStudioId);
  const [assignGroup, setAssignGroup] = useState<ShiftGroup | null>(null);

  /*
   * MANAGE MOVED TO MY STUDIO → TEAM (Planner rework, Sep 2026). It used to
   * be a toggle in this header, open to everyone "until RBAC lands" — while
   * the rules only ever let leaders write what it edits. The standing task
   * list, the seven-day table, initiatives and the loops left open (Open
   * loops) now live on My Studio → Team, which the studio tier sees — the
   * grant included (features/relay/team).
   */

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

  const { rows, loading, error: tasksError } = useStudioTasks(activeStudioId, {
    ownerId,
    clientNames,
  });
  const { categories } = useStudioTaskCategories(activeStudioId);
  const {
    open: openRequests,
    recentlyResolved,
    loading: requestsLoading,
    failed: requestsFailed,
  } = useStudioRequests(activeStudioId ?? null);
  const { search, stale, entries: playbookEntries } = usePlaybook(activeStudioId ?? null);
  /*
   * TEAM JOBS (Planner rework, Sep 2026) — one piece of work several people
   * share. Posting is a leader's act — of THIS studio, as the teamJobs rules
   * check it (relay/leads.ts); taking one that is up for grabs, ticking
   * parts and closing it are the floor's.
   */
  const leadsJobs = leadsHere(authTrainer, activeStudioId);
  const teamJobs = useTeamJobs(activeStudioId ?? null);
  const relay = useRelayMaybe();
  /*
   * THE STUDIO'S OWN NUMBERS (Sep 28 2026, AJ: "all yes, let the admins
   * assign the default within the app"): the quiet floor Right now measures
   * by — the studio's own, else Max Strength's default, else the app's
   * (features/studio-settings). Only inside Relay, where the Board reads it.
   */
  const settings = useStudioSettings(relay ? (activeStudioId ?? null) : null, activeStudio);
  const quietFloor = settings.value("quietFloorSessions");
  const [composingJob, setComposingJob] = useState(false);
  const [openJobKey, setOpenJobKey] = useState<string | null>(null);
  const openJob: TeamJob | null = useMemo(
    () => teamJobs.jobs.find((j) => j.id === openJobKey) ?? null,
    [teamJobs.jobs, openJobKey],
  );
  // Arrived from a notification: open that job once the jobs have loaded.
  useEffect(() => {
    if (!openJobId || teamJobs.loading) return;
    setOpenJobKey(openJobId);
    onOpenedJob?.();
  }, [openJobId, teamJobs.loading, onOpenedJob]);

  const author = authTrainer?.id
    ? { id: authTrainer.id, name: authTrainer.fullName ?? "A trainer" }
    : null;
  const trainerId = authTrainer?.id ?? null;

  const actions = useTaskActions({ author, onNeedsNote: setNoteRow });

  const todayKey = studioDateKey(new Date()) ?? "";

  /** Answers the team kept in the Playbook today: Team today's "Asks answered" line. */
  const keptToday = useMemo(
    () =>
      playbookEntries.filter((e) => {
        if (!e.sourceRequestId || e.retiredAt) return false;
        const at = (e.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.();
        return typeof at === "number" && studioDateKey(new Date(at)) === todayKey;
      }).length,
    [playbookEntries, todayKey],
  );

  const roster = useMemo(
    () => studioRoster(trainers ?? [], activeStudioId ?? null),
    [trainers, activeStudioId],
  );

  const visibleJobs = useMemo(
    () =>
      topic === "all"
        ? teamJobs.jobs
        : topic === "initiatives"
          ? []
          : teamJobs.jobs.filter((j) => jobTopic(j) === topic),
    [teamJobs.jobs, topic],
  );

  /*
   * Client tasks come OUT of the shift strip. A person waiting on a progress
   * report is not the same kind of obligation as wiping down a machine, and
   * grouping them by template puts "Priya" and "Marcus" in one collapsed row
   * called "Progress report", which is precisely the information you need.
   */
  const { shiftRows, clientRows } = useMemo(() => {
    const shift: TaskRow[] = [];
    const client: TaskRow[] = [];
    for (const r of rows) (r.kind === "client" ? client : shift).push(r);
    return { shiftRows: shift, clientRows: client };
  }, [rows]);

  /*
   * MINE finally reaches the strip.
   *
   * It could not before, and the reason was structural rather than an
   * oversight: no shift row knew whose it was, so there was nothing to filter
   * on. Now that a row can be claimed or closed by a named person — and that a
   * personal-tier row is yours by definition — "Mine" has an answer here.
   *
   * Filtered at the ROW level, so a nineteen-machine group where you claimed
   * three shows three of three rather than the whole group with a highlight.
   * The denominator changing is correct; it is a different question.
   */
  const visibleShiftRows = useMemo(
    () => (mineOnly ? mineRows(shiftRows, trainerId) : shiftRows),
    [mineOnly, shiftRows, trainerId],
  );

  /*
   * Chip counts respect MINE but NOT the selected topic — a chip that changed
   * its own number when you pressed it would make the board impossible to
   * navigate back out of.
   */
  const counts = useMemo(
    () => topicCounts(openRequests, { trainerId, mineOnly }),
    [openRequests, trainerId, mineOnly],
  );

  const onConfirm = async (entry: PlaybookEntry) => {
    if (!activeStudioId || !author?.id) return;
    try {
      await confirmPlaybookEntry(activeStudioId, entry, author);
      toastSuccess("Confirmed — thanks, that keeps it trustworthy.");
    } catch (err) {
      console.error("Playbook confirm failed:", err);
      toastError("Could not save that. Check your connection.");
    }
  };

  const onRetire = async (entry: PlaybookEntry) => {
    if (!activeStudioId || !author?.id) return;
    try {
      await retirePlaybookEntry(activeStudioId, entry.id, author.id);
      // Said explicitly: "retire" reads like deletion to most people, and it
      // is not — the entry is recoverable and anything linking to it survives.
      toastSuccess("Retired. It is out of search but not deleted.");
    } catch (err) {
      console.error("Playbook retire failed:", err);
      toastError("Could not retire that entry.");
    }
  };

  const showClients = topic === "all" || topic === "clients";

  // The Studio tab's "at a glance" band (Planner rework): counts only, each
  // from something this screen already holds.
  const glance = useMemo<GlanceCounts>(() => {
    const openJobs = teamJobs.jobs.filter((j) => j.status === "open");
    const asks = openRequests.filter((r) => r.kind !== "initiative");
    return {
      shiftDone: visibleShiftRows.filter((r) => r.status !== "open").length,
      shiftTotal: visibleShiftRows.length,
      jobsOpen: openJobs.length,
      jobsForGrabs: openJobs.filter((j) => isUpForGrabs(j) && !isOnJob(j, trainerId)).length,
      jobsMine: openJobs.filter((j) => isOnJob(j, trainerId)).length,
      requestsOpen: asks.length,
      requestsUrgent: asks.filter((r) => r.priority === "urgent" || r.kind === "cover").length,
    };
  }, [teamJobs.jobs, openRequests, visibleShiftRows, trainerId]);

  /*
   * THE PULSE (Relay, Sep 2026). What teammates did, from the documents this
   * screen already listens to, published for the Now Bar's ticker. Nothing
   * is read for it.
   */
  useEffect(() => {
    if (!activeStudioId || !relay) return;
    publishPulse(
      activeStudioId,
      pulseEvents({ rows, jobs: teamJobs.jobs, requests: [...openRequests, ...recentlyResolved], now: Date.now() }),
    );
  }, [activeStudioId, relay, rows, teamJobs.jobs, openRequests, recentlyResolved]);

  /*
   * TRACKING (Relay room, Sep 28 2026). The header's chip shows the job this
   * trainer took; this screen holds the live documents, so it says how the
   * job stands now ("1 of 3") and lets go once it is done. Only once every
   * read has answered: a list still loading, or one that failed, would read
   * as "the job is gone" and drop work the trainer is still on.
   */
  const trackedNow = useTracked(activeStudioId ?? null, relay?.now.todayKey ?? todayKey);
  const everyReadAnswered =
    !loading && !tasksError && !requestsLoading && !requestsFailed && !teamJobs.loading && !teamJobs.error;
  useEffect(() => {
    if (!relay || !trackedNow || !everyReadAnswered) return;
    publishTrackedProgress(
      activeStudioId ?? null,
      relay.now.todayKey,
      trackedNow.id,
      trackedLive(trackedNow.id, { rows, jobs: teamJobs.jobs, requests: openRequests }),
    );
  }, [relay, trackedNow, everyReadAnswered, activeStudioId, rows, teamJobs.jobs, openRequests]);

  /* ------------------------------------------------------------------ *
   * The Floor's own lanes. Inside Relay they sit behind the Board's doors
   * (Relay room, Sep 28 2026); anywhere else they stack as they always did.
   * Their logic is unchanged: the same props, the same writes.
   * ------------------------------------------------------------------ */

  const mineToggle = (
    <button
      type="button"
      className="sh__mine"
      aria-pressed={mineOnly}
      onClick={() => setMineOnly((v) => !v)}
    >
      {mineOnly ? <UserRound size={14} /> : <Users size={14} />}
      {mineOnly ? "Mine" : "Everyone"}
    </button>
  );

  const shiftLanes = (
    <>
      <div id="planner-shift" />
      {relay && !(loading && rows.length === 0) && (
        <ShiftRings
          rows={visibleShiftRows}
          onOpen={() => document.getElementById("planner-strip")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      )}
      <div id="planner-strip" />
      {loading && rows.length === 0 ? (
        <p className="sh__loading">Loading today…</p>
      ) : (
        <ShiftStrip
          rows={visibleShiftRows}
          studioCategories={categories}
          busyIds={actions.busyIds}
          trainerId={trainerId}
          mineOnly={mineOnly}
          onComplete={actions.complete}
          onCompleteGroup={actions.completeGroup}
          onReopen={actions.reopen}
          onFlag={setNoteRow}
          onToggleClaim={actions.toggleClaimGroup}
          onAssign={canAssign ? setAssignGroup : undefined}
        />
      )}
      {relay && <FloorMap rows={shiftRows} actions={actions} />}
    </>
  );

  const jobsLane = (jobs: TeamJob[], opts: { title?: string; hideWhenEmpty?: boolean; canPost?: boolean } = {}) => (
    <TeamJobsLane
      jobs={jobs}
      loading={teamJobs.loading}
      error={teamJobs.error}
      me={author}
      mineOnly={mineOnly}
      canPost={opts.canPost ?? leadsJobs}
      title={opts.title}
      hideWhenEmpty={opts.hideWhenEmpty}
      onPost={() => (relay ? relay.openCapture({ destination: "someone", someoneForm: "job" }) : setComposingJob(true))}
      onOpen={(job) => setOpenJobKey(job.id)}
      onError={toastError}
    />
  );

  const clientLanes = (
    <>
      <ClientTasksLane
        rows={clientRows}
        busyIds={actions.busyIds}
        mineOnly={mineOnly}
        currentUserId={trainerId}
        onComplete={actions.complete}
        onReopen={actions.reopen}
        onOpenClientTask={onOpenClientTask}
        onAskAbout={relay?.openAsk ? (client) => relay.openAsk?.({ tile: "question", client }) : undefined}
      />
      {/* Renewals round (Sep 2026): this week's clients with a renewal
          conversation due, from their nightly snapshots. */}
      <RenewalsLane
        studioId={activeStudioId ?? null}
        clients={clients}
        onOpenClient={onOpenClientTask ? (id) => onOpenClientTask(id) : undefined}
      />
    </>
  );

  const requestsLane = (kinds?: "asks" | "initiatives", title?: string) => (
    <RequestsLane
      studioId={activeStudioId ?? null}
      author={author}
      currentUserId={trainerId}
      topic={topic}
      mineOnly={mineOnly}
      roster={roster}
      clients={clients}
      kinds={kinds}
      title={title}
    />
  );

  const playbookLane = (
    <PlaybookLane
      search={search}
      stale={stale}
      trainerId={trainerId}
      todayKey={todayKey}
      onConfirm={onConfirm}
      onRetire={onRetire}
    />
  );

  /** What sits behind each of the Board's doors: the Floor's lanes, sorted by where the work happens. */
  const behind = (door: DoorId) => {
    switch (door) {
      case "floor":
        return (
          <>
            <div className="sh__head-actions rbd-tools">{mineToggle}</div>
            {shiftLanes}
            {jobsLane(jobsBehind("floor", teamJobs.jobs), { title: "Team jobs" })}
          </>
        );
      case "desk":
        return (
          <>
            <div className="sh__head-actions rbd-tools">{mineToggle}</div>
            {clientLanes}
            {jobsLane(jobsBehind("desk", teamJobs.jobs), { title: "Team jobs for clients", hideWhenEmpty: true, canPost: false })}
          </>
        );
      case "help":
        return (
          <>
            <div className="sh__head-actions rbd-tools">{mineToggle}</div>
            {requestsLane("asks", "Asks from teammates")}
            {playbookLane}
          </>
        );
      case "lead":
        return (
          <>
            <FocusBanner />
            {requestsLane("initiatives", "Initiatives")}
          </>
        );
      case "mine":
        return jobsLane(teamJobs.jobs, { title: "Your team jobs", hideWhenEmpty: true, canPost: false });
    }
  };

  return (
    <div className="st">
      <div className="st__scroll touch-pane">
        {relay ? (
          <Board
            rows={rows}
            jobs={teamJobs.jobs}
            requests={openRequests}
            actions={actions}
            author={author}
            onOpenJob={(job) => setOpenJobKey(job.id)}
            onOpenClientTask={onOpenClientTask}
            loading={loading && rows.length === 0}
            behind={behind}
            resolved={recentlyResolved}
            unknown={Boolean(tasksError) || requestsFailed || Boolean(teamJobs.error)}
            keptToday={keptToday}
            quietFloorSessions={quietFloor ?? undefined}
            around={<SinceYouWereIn rows={rows} jobs={teamJobs.jobs} resolved={recentlyResolved} playbook={playbookEntries} />}
          />
        ) : (
          <>
            <header className={cn("st__head", embedded && "st__head--embedded")}>
              {embedded ? (
                <GlanceBand counts={glance} loading={loading && rows.length === 0} />
              ) : (
                <div>
                  <h1 className="st__title">Studio hub</h1>
                  <span className="st__date">
                    {activeStudio?.name ?? "Studio"} ·{" "}
                    {formatStudioDate(
                      todayKey ? `${todayKey}T12:00:00` : new Date(),
                      { weekday: "short", month: "short", day: "numeric" },
                    )}
                  </span>
                </div>
              )}

              {/*
                MINE sits in the header rather than among the topic chips because
                it is a different KIND of filter: the chips narrow the board by
                SUBJECT, this narrows every lane by PERSON. The Playbook is the
                deliberate exception and always will be: it is the studio's
                accumulated knowledge, and "only show me what I wrote" is the
                opposite of what it is for.
              */}
              <div className="sh__head-actions">{mineToggle}</div>
            </header>

            {shiftLanes}

            <nav className="sh__chips" aria-label="Filter the board" id="planner-board">
              {TOPICS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={cn("sh__chip", topic === t && "sh__chip--on")}
                  aria-pressed={topic === t}
                  onClick={() => setTopic(t)}
                >
                  {BOARD_TOPIC_LABEL[t]}
                  {counts[t] > 0 && (
                    <span className="sh__chip-count tabular">{counts[t]}</span>
                  )}
                </button>
              ))}
            </nav>

            {topic !== "initiatives" && jobsLane(visibleJobs)}
            {showClients && clientLanes}
            {requestsLane()}
            {playbookLane}
          </>
        )}
      </div>

      <JobComposer
        open={composingJob}
        onOpenChange={setComposingJob}
        studioId={activeStudioId ?? null}
        author={author}
        authTrainer={authTrainer ?? null}
        people={roster}
        clients={clients ?? []}
        categories={categories}
      />
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
          const planned =
            assignee && template && days > 1 && todayKey
              ? repeatPlanForward(open, template, todayKey, days)
              : open;
          return actions.assign(assignGroup, assignee, {
            planned,
            days: assignee ? days : 1,
          });
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
