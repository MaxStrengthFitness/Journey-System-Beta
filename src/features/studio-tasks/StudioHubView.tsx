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
 * SELF-CONTAINED, DELIBERATELY
 * This takes the same three props as StudioTasksView and fetches everything
 * else itself, so routing it is a one-line swap in AppContent and swapping
 * back is the same line. The old StudioTasksView is left untouched and still
 * routable — both can render while this is reviewed on the iPad, and nothing
 * that works today has to be deleted to try it.
 */
import { useMemo, useState } from "react";
import { Settings2, UserRound, Users } from "lucide-react";
import { useActiveStudio } from "../../ActiveStudioContext";
import { useToast } from "../../contexts/ToastContext";
import { auth } from "../../firebase";
import { studioDateKey, formatStudioDate } from "../../lib/studio-time";
import { cn } from "../../lib/utils";
import { isStudioLeader } from "../../lib/permissions";
import type { Client, Trainer } from "../../types";
import type { ClientTaskAction, TaskRow, TaskTemplate } from "./types";
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
import { TaskManager } from "./TaskManager";
import { ManagePanel } from "./ManagePanel";
import { usePlaybook } from "./usePlaybook";
import { useStudioRequests } from "./useStudioRequests";
import { useStudioTasks } from "./useStudioTasks";
import { useStudioTaskCategories } from "./useStudioTaskCategories";
import { useTaskActions } from "./useTaskActions";
import { confirmPlaybookEntry, retirePlaybookEntry } from "./playbook-mutations";
import type { PlaybookEntry } from "./playbook";
import { RenewalsLane } from "../renewals/RenewalsLane";
import "./studio-tasks.css";
import "./studio-hub.css";

const TOPICS: BoardTopic[] = ["all", "clients", "equipment", "initiatives", "help"];

export interface StudioHubViewProps {
  authTrainer?: Trainer | null;
  /** For naming client tasks and opening them. */
  clients?: Client[];
  /**
   * Everyone on the app, filtered here to this studio's own team. Feeds the
   * initiative roll-up's denominator — see studioRoster for why it is primary
   * home studio only.
   */
  trainers?: Trainer[];
  /**
   * Open the real flow a client task refers to.
   *
   * A client task is not a checkbox that claims an InBody scan happened — it
   * is a pointer at the screen where the work is actually done.
   */
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
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
  embedded = false,
}: StudioHubViewProps) {
  const { activeStudioId, activeStudio } = useActiveStudio();
  const { success: toastSuccess, error: toastError } = useToast();

  const [topic, setTopic] = useState<BoardTopic>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [noteRow, setNoteRow] = useState<TaskRow | null>(null);
  /*
   * ASSIGNMENT IS A HEAD TRAINER'S ACT.
   *
   * `isStudioLeader` covers StudioLeader, HeadTrainer and owners — the same
   * set `isStudioOwnerOrHeadTrainer` gates on in firestore.rules, which is
   * where it is actually enforced. Hiding the button is a convenience so the
   * floor is not offered an action that would be refused; it is not the
   * security boundary, and it must never be mistaken for one.
   */
  const canAssign = isStudioLeader(authTrainer ?? null);
  const [assignGroup, setAssignGroup] = useState<ShiftGroup | null>(null);

  /*
   * MANAGE COMES WITH THE HUB, and it has to.
   *
   * The hub is now the To-Do screen, and Manage is where a studio manager who
   * never sets foot on the floor lives -- it is also the ONLY place an
   * initiative can be posted from. Routing the hub without bringing Manage
   * across would have quietly removed both.
   *
   * Same documents and the same authoring dialog as the old screen; only the
   * way in is different.
   */
  const [mode, setMode] = useState<"hub" | "manage">("hub");
  const [managing, setManaging] = useState(false);
  const [managerIntent, setManagerIntent] = useState<
    | { mode: "new"; scope: "studio" | "personal" }
    | { mode: "edit"; template: TaskTemplate }
    | null
  >(null);

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

  const { rows, templates, loading } = useStudioTasks(activeStudioId, {
    ownerId,
    clientNames,
  });
  const { categories } = useStudioTaskCategories(activeStudioId);
  const { open: openRequests } = useStudioRequests(activeStudioId ?? null);
  const { search, stale } = usePlaybook(activeStudioId ?? null);

  const author = authTrainer?.id
    ? { id: authTrainer.id, name: authTrainer.fullName ?? "A trainer" }
    : null;
  const trainerId = authTrainer?.id ?? null;

  const actions = useTaskActions({ author, onNeedsNote: setNoteRow });

  const todayKey = studioDateKey(new Date()) ?? "";

  const roster = useMemo(
    () => studioRoster(trainers ?? [], activeStudioId ?? null),
    [trainers, activeStudioId],
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

  const flaggedRows = useMemo(
    () => rows.filter((r) => r.instance?.flagged),
    [rows],
  );

  return (
    <div className="st">
      <div className="st__scroll touch-pane">
        <header className={cn("st__head", embedded && "st__head--embedded")}>
          {embedded ? (
            <p className="st__sub-title">
              Shared with everyone at {activeStudio?.name ?? "this studio"}
            </p>
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
            SUBJECT, this narrows every lane by PERSON.

            It genuinely narrows every lane as of Sep 2026. Until then this
            comment claimed it did while `mineOnly` was passed to two lanes of
            four -- the shift strip could not honour it, because no row knew
            whose it was. The Playbook is the deliberate exception and always
            will be: it is the studio's accumulated knowledge, and "only show
            me what I wrote" is the opposite of what it is for.
          */}
          <div className="sh__head-actions">
            {mode === "hub" && (
              <button
                type="button"
                className="sh__mine"
                aria-pressed={mineOnly}
                onClick={() => setMineOnly((v) => !v)}
              >
                {mineOnly ? <UserRound size={14} /> : <Users size={14} />}
                {mineOnly ? "Mine" : "Everyone"}
              </button>
            )}

            {/*
              Same temporary ungating as StudioTasksView, and the same caveat:
              this is a UI gate only and always was -- firestore.rules decides
              who may actually write a template or post an initiative. Restore
              a permission check here when RBAC lands.
            */}
            <button
              type="button"
              className="sh__mine"
              aria-pressed={mode === "manage"}
              onClick={() => setMode(mode === "manage" ? "hub" : "manage")}
            >
              <Settings2 size={14} />
              {mode === "manage" ? "Back to hub" : "Manage"}
            </button>
          </div>
        </header>

        {mode === "manage" ? (
          <ManagePanel
            studioId={activeStudioId}
            templates={templates}
            categories={categories}
            flaggedRows={flaggedRows}
            author={author}
            trainers={trainers}
            onNewTask={() => {
              setManagerIntent({ mode: "new", scope: "studio" });
              setManaging(true);
            }}
            onEditTask={(template) => {
              setManagerIntent({ mode: "edit", template });
              setManaging(true);
            }}
          />
        ) : (
          <>
        {/*
          Loading is said once, at the top, rather than as a spinner per lane.
          Four spinners on a tablet reads as four things going wrong.
        */}
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

        <nav className="sh__chips" aria-label="Filter the board">
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

        {showClients && (
          <ClientTasksLane
            rows={clientRows}
            busyIds={actions.busyIds}
            mineOnly={mineOnly}
            currentUserId={trainerId}
            onComplete={actions.complete}
            onReopen={actions.reopen}
            onOpenClientTask={onOpenClientTask}
          />
        )}

        {/* Renewals round (Sep 2026): this week's clients with a renewal
            conversation due, from their nightly snapshots. */}
        {showClients && (
          <RenewalsLane
            studioId={activeStudioId ?? null}
            clients={clients}
            onOpenClient={onOpenClientTask ? (id) => onOpenClientTask(id) : undefined}
          />
        )}

        <RequestsLane
          studioId={activeStudioId ?? null}
          author={author}
          currentUserId={trainerId}
          topic={topic}
          mineOnly={mineOnly}
          roster={roster}
          clients={clients}
        />

        <PlaybookLane
          search={search}
          stale={stale}
          trainerId={trainerId}
          todayKey={todayKey}
          onConfirm={onConfirm}
          onRetire={onRetire}
        />
          </>
        )}
      </div>

      <TaskManager
        open={managing}
        onOpenChange={(o) => {
          setManaging(o);
          // Consumed on close, so re-opening lands on the list rather than on
          // whatever Manage last asked for.
          if (!o) setManagerIntent(null);
        }}
        studioId={activeStudioId}
        canManageStudio
        ownerId={ownerId}
        templates={templates}
        author={author}
        clients={clients}
        openWith={managerIntent}
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
