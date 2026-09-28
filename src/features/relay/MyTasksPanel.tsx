import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRightLeft,
  Bell,
  BellPlus,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCheck,
  Crosshair,
  ExternalLink,
  Gift,
  Hand,
  Layers,
  Plus,
  Repeat,
  Sprout,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { auth } from "../../firebase";
import type { Client, Trainer } from "../../types";
import { useStudioTasks } from "../studio-tasks/useStudioTasks";
import { useTaskActions } from "../studio-tasks/useTaskActions";
import { TaskManager } from "../studio-tasks/TaskManager";
import { TaskNoteDialog } from "../studio-tasks/TaskNoteDialog";
import { taskScopeOf, type ClientTaskAction, type TaskRow, type TaskTemplate } from "../studio-tasks/types";
import { taskMeta } from "./my-tasks";
import { clockLabel, reminderPreset } from "../studio-tasks/task-wizard";
import { dayWords } from "./jobs/jobs";
import { formatStudioDate, studioDateKey } from "../../lib/studio-time";
import { leadsHere } from "./leads";
import { useRelayMaybe } from "./board/RelayContext";
import { followUps as followUpsOf } from "./board/mine";
import { useStudioRequests } from "../studio-tasks/useStudioRequests";
import { setRequestFor, type TaskRequest } from "../studio-tasks/requests";
import { answerAskWithTrail, claimAskWithTrail, hasTrail, journalAuthorOf } from "../studio-tasks/question-trail";
import { AskDetail, AskFoot, clientFirstName } from "./board/card-actions";
import { notify } from "../notifications";
import { useToast } from "../../contexts/ToastContext";
import { studioRoster } from "../studio-tasks/initiatives";
import { useTeamJobs } from "./jobs/useTeamJobs";
import { joinJob, leaveJob } from "./jobs/mutations";
import { JobSheet } from "./jobs/JobSheet";
import { buildTracker, TRACKER_LISTS, type HandedItem, type TakenItem, type TrackerList } from "./tracker";
import { minutesToClock, shiftHoursOf, studioMinutesNow } from "./board/now-context";
import { trackedChipWords, untrack, useTracked } from "./board/tracked";
import { UndoBar } from "./board/Board";
import { forgetOnSignOut } from "../sign-out/memory";
import "./tracker.css";

/**
 * THE TRACKER — Relay's second tab (it was Mine, and My tasks before that).
 *
 * Relay room, Sep 28 2026 (the redesign's phase 5, AJ's "mission tracker";
 * the tab reads "Tracker" since phase 4, its id is still "mine"). A
 * trainer's own list, sorted by WHEN rather than by where it came from — the
 * rules are ./tracker.ts:
 *
 *   Today       Handed to you · Now · Follow-ups · Closing
 *   Coming up · Anytime · Someday · Growth · Done
 *
 * On the left (above, upright): what you are tracking (the header's chip,
 * with its door), your lists with their counts, and + To-do, + Reminder and
 * All my tasks.
 *
 * Nothing new is stored. Personal tasks have lived at trainers/{uid}/task*
 * since the Settings-tiers round, private by path; asks, chores and team
 * jobs are the studio's documents the Board reads too. A leader's assignment
 * is simply yours (AJ, q5), so it offers Done and "I can't", never "Take
 * it · Not me · Later"; "I can't" sends an ask back to the board, steps you
 * off a team job, or asks the team to take a chore only a leader may
 * un-name. Every one of those can be undone for eight seconds.
 *
 * Creating and editing a to-do still goes through Capture (+ To-do,
 * + Reminder) and TaskManager (All my tasks, a timed to-do's edit).
 */

let rememberedList: TrackerList = "today";
// The next person on a shared iPad starts on Today.
forgetOnSignOut(() => {
  rememberedList = "today";
});

const LIST_ICON: Record<TrackerList, LucideIcon> = {
  today: Sun,
  coming: CalendarDays,
  anytime: Layers,
  someday: Sprout,
  done: CheckCheck,
};

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
  const relay = useRelayMaybe();
  const { success: toastSuccess, error: toastError } = useToast();

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

  const author = authTrainer?.id ? { id: authTrainer.id, name: authTrainer.fullName ?? "A trainer" } : null;
  const trainerId = authTrainer?.id ?? null;
  // For anything a rule pins to the signed-in person (a notification's actor).
  const actor = ownerId ? { id: ownerId, name: authTrainer?.fullName ?? "A trainer" } : null;

  const [noteRow, setNoteRow] = useState<TaskRow | null>(null);
  const actions = useTaskActions({ author, onNeedsNote: setNoteRow });

  // The same listeners the Board uses; only one of the two tabs is mounted at a time.
  const teamJobs = useTeamJobs(activeStudioId ?? null);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const openJob = teamJobs.jobs.find((j) => j.id === openJobId) ?? null;
  const roster = useMemo(() => studioRoster(trainers ?? [], activeStudioId ?? null), [trainers, activeStudioId]);
  const requests = useStudioRequests(relay ? (activeStudioId ?? null) : null);

  const todayKey = studioDateKey(new Date()) ?? "";
  const hours = shiftHoursOf(activeStudio?.shiftHours ?? null);
  const followUps = useMemo(
    () => (relay ? followUpsOf(clients ?? [], trainerId, todayKey) : []),
    [relay, clients, trainerId, todayKey],
  );

  const tracker = useMemo(
    () =>
      buildTracker({
        rows,
        templates,
        requests: requests.open,
        resolved: requests.recentlyResolved,
        jobs: teamJobs.jobs,
        followUps,
        uid: ownerId,
        trainerId,
        todayKey,
        closingMin: hours.closing,
      }),
    [rows, templates, requests.open, requests.recentlyResolved, teamJobs.jobs, followUps, ownerId, trainerId, todayKey, hours.closing],
  );
  const repeating = useMemo(() => templates.filter((t) => taskScopeOf(t) === "personal" && t.active !== false), [templates]);

  const [list, setListState] = useState<TrackerList>(rememberedList);
  const setList = (next: TrackerList) => {
    rememberedList = next;
    setListState(next);
  };

  const [managing, setManaging] = useState(false);
  const [intent, setIntent] = useState<
    { mode: "new"; scope: "personal"; preset?: Partial<TaskTemplate> } | { mode: "edit"; template: TaskTemplate } | null
  >(null);

  const [undo, setUndo] = useState<{ key: number; label: string; run: () => Promise<unknown> | void } | null>(null);
  const offerUndo = (label: string, run: () => Promise<unknown> | void) => setUndo({ key: Date.now(), label, run });
  const clearUndo = useCallback(() => setUndo(null), []);

  const tracked = useTracked(activeStudioId ?? null, todayKey);

  /* ---------------- writes ---------------- */

  // Who writes a line on a client's record for a question (the Auth uid).
  const writer = journalAuthorOf(ownerId, authTrainer?.fullName, authTrainer?.initials);

  /** Close an ask; with an answer, a question's answer (and her record's thread closes). */
  const closeAsk = async (r: TaskRequest, answer = "") => {
    if (!activeStudioId || !author) return;
    try {
      const trail = await answerAskWithTrail({ studioId: activeStudioId, request: r, author, answer, who: writer });
      if (actor)
        await notify({
          to: r.createdBy.id,
          actor,
          kind: "request-resolved",
          title: `${actor.name} ${answer.trim() ? "answered" : "closed"} "${r.title}"`,
          body: answer.trim() || undefined,
          studioId: activeStudioId,
          link: { view: "studio-tasks" },
        });
      const her = clientFirstName(clients ?? [], r);
      if (trail === "failed") toastError(`Done on the Board, but ${her}'s record didn't take it, so it still shows there as open.`);
      else toastSuccess(hasTrail(r) ? `Answered. It's on ${her}'s record, and the question there is closed.` : "Done — they'll see it on their card.");
      relay?.closePanel();
    } catch (err) {
      console.warn("[relay] close failed:", err);
      toastError("Could not close that. Check your connection.");
    }
  };

  /** A question is answered, not ticked: its answer box opens beside the list. */
  const openAnswer = (r: TaskRequest) => {
    if (!relay) {
      void closeAsk(r);
      return;
    }
    relay.openPanel({
      kicker: "A question for the team",
      title: r.title,
      body: <AskDetail request={r} />,
      foot: <AskFoot request={r} onClose={(req, note) => closeAsk(req, note)} />,
    });
  };

  const cantDo = async (h: HandedItem) => {
    try {
      if (h.kind === "ask" && activeStudioId && h.request.forId) {
        const was = { id: h.request.forId, name: h.request.forName ?? author?.name ?? "You" };
        await setRequestFor({ studioId: activeStudioId, requestId: h.request.id, person: null });
        offerUndo("Back on the board, for anyone to take.", () =>
          setRequestFor({ studioId: activeStudioId, requestId: h.request.id, person: was }),
        );
      } else if (h.kind === "job" && author) {
        await leaveJob(h.job, author);
        offerUndo(`You stepped off "${h.job.title}".`, () => joinJob(h.job, author));
      } else if (h.kind === "row") {
        // Only a leader may take their name off a chore (the rules), so the
        // way to say you can't is to ask the team, for you to post.
        relay?.openCapture({
          destination: "floor",
          askKind: "help",
          text: `Can anyone take this? ${h.row.title}${h.row.machineName ? ` (${h.row.machineName})` : ""}\nMy name is on it, and I can't get to it.`,
        });
      }
    } catch (err) {
      console.warn("[relay] can't-do failed:", err);
      toastError("Could not change that. Check your connection.");
    }
  };

  const handBack = async (r: TaskRequest) => {
    if (!activeStudioId || !author) return;
    try {
      await claimAskWithTrail({ studioId: activeStudioId, request: r, author, claimed: false, who: writer });
      offerUndo(`Handed back "${r.title}".`, () =>
        claimAskWithTrail({ studioId: activeStudioId, request: r, author, claimed: true, who: writer }),
      );
    } catch (err) {
      console.warn("[relay] hand back failed:", err);
      toastError("Could not hand that back. Check your connection.");
    }
  };

  /* ---------------- rows ---------------- */

  const leaderNamed = (id: string | undefined | null) => {
    const t = (trainers ?? []).find((x) => x.id === id);
    return Boolean(t && leadsHere(t, activeStudioId));
  };

  const personalRow = (r: TaskRow) => {
    const done = r.status === "done";
    const busy = actions.busyIds.has(r.id);
    const meta = taskMeta(r);
    const target = r.template.target;
    const clientId = target.kind === "client" ? target.clientId : undefined;
    const text = r.template.detail ? `${r.title}\n${r.template.detail}` : r.title;
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
        <div className="rtk-acts">
          {clientId && onOpenClientTask && !done && (
            <button type="button" className="pl__btn" onClick={() => onOpenClientTask(clientId, target.kind === "client" ? target.action : undefined)}>
              <ExternalLink size={14} aria-hidden />
              Open
            </button>
          )}
          {relay && !done && taskScopeOf(r.template) === "personal" && (
            <button
              type="button"
              className="pl__btn"
              aria-label={`Offer “${r.title}” on the Board: anyone at the studio can take it`}
              onClick={() =>
                relay.openCapture({
                  destination: "floor",
                  text,
                  client: clientId ? { id: clientId, name: clientNames[clientId] ?? "Client" } : null,
                  estMinutes: r.template.estMinutes ?? null,
                })
              }
            >
              <ArrowRightLeft size={14} aria-hidden />
              Offer it
            </button>
          )}
          {relay?.canLead && !done && taskScopeOf(r.template) === "personal" && (
            <button
              type="button"
              className="pl__btn"
              aria-label={`Hand “${r.title}” to someone at the studio`}
              onClick={() => relay.openCapture({ destination: "someone", text, estMinutes: r.template.estMinutes ?? null })}
            >
              <Hand size={14} aria-hidden />
              Hand to…
            </button>
          )}
        </div>
      </li>
    );
  };

  const handedRow = (h: HandedItem) => {
    if (h.kind === "ask") {
      const r = h.request;
      const byLeader = leaderNamed(r.createdBy.id);
      return (
        <li className="pl__task" key={h.key}>
          <div className="pl__task-main">
            <span className="pl__task-title">{r.title}</span>
            <span className="rtk-meta">
              {byLeader ? `${h.from.split(" ")[0]} put your name on it` : `From ${h.from.split(" ")[0]}`}
              {r.clientId ? ` · about ${clientFirstName(clients ?? [], r)}` : ""}
              {r.dueOn ? ` · by ${dayWords(r.dueOn, todayKey)}` : ""}
              {typeof r.estMinutes === "number" ? ` · ~${r.estMinutes} min` : ""}
            </span>
            {r.detail && <span className="pl__task-detail">{r.detail}</span>}
          </div>
          <div className="rtk-acts">
            {r.kind === "question" ? (
              <button type="button" className="pl__btn pl__btn--primary" onClick={() => openAnswer(r)}>
                <Check size={14} aria-hidden /> Answer
              </button>
            ) : (
              <button type="button" className="pl__btn pl__btn--primary" onClick={() => void closeAsk(r)}>
                <Check size={14} aria-hidden /> Done
              </button>
            )}
            {r.clientId && onOpenClientTask && (
              <button type="button" className="pl__btn" onClick={() => onOpenClientTask(r.clientId!)}>
                <ExternalLink size={14} aria-hidden />
                Open
              </button>
            )}
            <button type="button" className="pl__btn" onClick={() => void cantDo(h)}>
              I can't
            </button>
          </div>
        </li>
      );
    }
    if (h.kind === "row") {
      const r = h.row;
      const busy = actions.busyIds.has(r.id);
      return (
        <li className="pl__task" key={h.key}>
          <button type="button" className="pl__check" aria-pressed={false} aria-label={`Mark “${r.title}” done`} disabled={busy} onClick={() => actions.complete(r)} />
          <div className="pl__task-main">
            <span className="pl__task-title">{r.machineName ? `${r.title}: ${r.machineName}` : r.title}</span>
            <span className="rtk-meta">
              {h.from ? `${h.from.split(" ")[0]} put your name on it` : "Your name is on it"} · anyone may still tick it
            </span>
          </div>
          <div className="rtk-acts">
            <button type="button" className="pl__btn" onClick={() => void cantDo(h)}>
              I can't
            </button>
          </div>
        </li>
      );
    }
    return (
      <li className="pl__task" key={h.key}>
        <div className="pl__task-main">
          <span className="pl__task-title">{h.job.title}</span>
          <span className="rtk-meta">
            {`${h.from.split(" ")[0]} put your name on it`}
            {h.job.dueOn ? ` · by ${dayWords(h.job.dueOn, todayKey)}` : ""}
          </span>
        </div>
        <div className="rtk-acts">
          <button type="button" className="pl__btn pl__btn--primary" onClick={() => setOpenJobId(h.job.id)}>
            Open
          </button>
          <button type="button" className="pl__btn" onClick={() => void cantDo(h)}>
            I can't
          </button>
        </div>
      </li>
    );
  };

  const takenRow = (t: TakenItem) => (
    <li className="pl__task" key={t.key}>
      <div className="pl__task-main">
        <span className="pl__task-title">{t.kind === "ask" ? t.request.title : t.job.title}</span>
        <span className="rtk-meta">
          {t.kind === "ask" ? "You took it on the Board" : "A team job you're on"}
          {t.due ? ` · ${t.due < todayKey ? "was due" : "due"} ${dayWords(t.due, todayKey)}` : ""}
        </span>
      </div>
      <div className="rtk-acts">
        {t.kind === "ask" ? (
          <>
            {t.request.kind === "question" ? (
              <button type="button" className="pl__btn pl__btn--primary" onClick={() => openAnswer(t.request)}>
                <Check size={14} aria-hidden /> Answer
              </button>
            ) : (
              <button type="button" className="pl__btn pl__btn--primary" onClick={() => void closeAsk(t.request)}>
                <Check size={14} aria-hidden /> Done
              </button>
            )}
            <button type="button" className="pl__btn" onClick={() => void handBack(t.request)}>
              Hand back
            </button>
          </>
        ) : (
          <button type="button" className="pl__btn pl__btn--primary" onClick={() => setOpenJobId(t.job.id)}>
            Open
          </button>
        )}
      </div>
    </li>
  );

  const section = (id: string, title: string, icon: LucideIcon | null, count: number, children: ReactNode, note?: string) => {
    const Icon = icon;
    return (
      <section className="pl__list" aria-labelledby={id} key={id}>
        <h3 className="pl__list-head" id={id}>
          {Icon && <Icon size={14} aria-hidden />}
          {title} <span className="pl__count">{count}</span>
        </h3>
        {note && <p className="pl__list-note">{note}</p>}
        <ul>{children}</ul>
      </section>
    );
  };

  // An empty list is said only once every read has answered: a read still
  // on its way is "loading", and a failed one is unknown, never "nothing".
  const readsFailed = Boolean(error) || requests.failed || Boolean(teamJobs.error);
  const settling = loading || requests.loading || teamJobs.loading;
  const empty = (title: string, body: string) =>
    readsFailed ? null : settling ? (
      <p className="sh__loading">Loading…</p>
    ) : (
      <div className="pl__empty">
        <p className="pl__empty-title">{title}</p>
        <p className="pl__empty-body">{body}</p>
      </div>
    );

  /* ---------------- the lists ---------------- */

  const todayList = () => {
    const t = tracker;
    if (t.counts.today === 0) {
      return empty(
        "Nothing on your list today",
        "Add what only you need to remember — “call Hugo's physio”, “bring the InBody printouts”, “check Odo's seat height Thursday”. A to-do can repeat, point at a client, and ring your bell at a set time.",
      );
    }
    return (
      <>
        {t.handed.length > 0 &&
          section(
            "rtk-handed",
            "Handed to you",
            ArrowRightLeft,
            t.handed.length,
            t.handed.map(handedRow),
            "Yours now. A name is a heads-up, not a lock: anyone may still do it, and “I can't” gives it back.",
          )}
        {t.now.length + t.nowTaken.length > 0 &&
          section("rtk-now", "Now", Sun, t.now.length + t.nowTaken.length, [...t.now.map(personalRow), ...t.nowTaken.map(takenRow)])}
        {t.followUps.length > 0 &&
          section(
            "rtk-followups",
            "Follow-ups",
            Gift,
            t.followUps.length,
            t.followUps.map((f) => (
              <li className="pl__task pl__task--ahead" key={f.key}>
                <span className="pl__when">
                  <span className="pl__when-day">{dayWords(f.date, todayKey)}</span>
                </span>
                <div className="pl__task-main">
                  <span className="pl__task-title">{f.clientName}</span>
                  <span className="pl__task-meta">{f.label}</span>
                </div>
                <div className="rtk-acts">
                  <button
                    type="button"
                    className="pl__btn"
                    onClick={() =>
                      relay?.openCapture({
                        destination: "me",
                        text: f.kind === "birthday" ? `Birthday card for ${f.clientName.split(" ")[0]}` : `${f.clientName.split(" ")[0]}: ${f.label.split(" · ")[0]}`,
                        client: { id: f.clientId, name: f.clientName },
                        date: f.date === todayKey ? null : f.date,
                      })
                    }
                  >
                    <Plus size={14} aria-hidden />
                    To-do
                  </button>
                  {onOpenClientTask && (
                    <button type="button" className="pl__btn" onClick={() => onOpenClientTask(f.clientId)}>
                      <ExternalLink size={14} aria-hidden />
                      Open
                    </button>
                  )}
                </div>
              </li>
            )),
            "Your clients' birthdays and dates they mentioned, in the next two weeks.",
          )}
        {t.closing.length > 0 &&
          section(
            "rtk-closing",
            `Closing · from ${minutesToClock(hours.closing)}`,
            CalendarClock,
            t.closing.length,
            t.closing.map(personalRow),
          )}
      </>
    );
  };

  const comingList = () => {
    const t = tracker;
    if (t.counts.coming === 0) return empty("Nothing coming up", "Nothing timed in the next six days, and nothing you took is due later.");
    return (
      <>
        {t.coming.length > 0 &&
          section(
            "rtk-coming",
            "Your timed to-dos",
            CalendarClock,
            t.coming.length,
            t.coming.slice(0, 20).map((u) => (
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
            )),
          )}
        {t.comingTaken.length > 0 && section("rtk-coming-taken", "Taken, due later", Crosshair, t.comingTaken.length, t.comingTaken.map(takenRow))}
      </>
    );
  };

  const anytimeList = () =>
    tracker.anytime.length === 0
      ? empty(
          "Nothing without a day",
          "Work you take on the Board with no day on it lands here. A to-do you add always has a day in Journey (today, unless you pick one).",
        )
      : section("rtk-anytime", "Anytime", Layers, tracker.anytime.length, tracker.anytime.map(takenRow), "No day on it, no rush.");

  const somedayList = () =>
    tracker.someday.length === 0
      ? empty("Nothing filed under Growth", "Your own development — a module, a reading, a skill to practise. Add a to-do and file it under Growth (under More) to keep it out of Today.")
      : section(
          "rtk-someday",
          "Someday · Growth",
          Sprout,
          tracker.someday.length,
          tracker.someday.map(personalRow),
          "Your own growth as a trainer. It never competes with Today.",
        );

  const doneList = () =>
    tracker.done.length === 0
      ? empty("Nothing finished yet today", "What you tick off today, on your list, on the floor and on the board, gathers here.")
      : section(
          "rtk-done",
          "Done today",
          CheckCheck,
          tracker.done.length,
          tracker.done.map((d) => (
            <li className="pl__task pl__task--done" key={d.key}>
              {d.row ? (
                <button
                  type="button"
                  className="pl__check"
                  aria-pressed
                  aria-label={`Reopen “${d.what}”`}
                  disabled={actions.busyIds.has(d.row.id)}
                  onClick={() => d.row && actions.reopen(d.row)}
                >
                  <Check size={16} aria-hidden />
                </button>
              ) : (
                <span className="pl__when">
                  <span className="pl__when-time">{d.at ? minutesToClock(studioMinutesNow(new Date(d.at))) : "Today"}</span>
                </span>
              )}
              <div className="pl__task-main">
                <span className="pl__task-title">{d.what}</span>
                <span className="rtk-meta">
                  {d.row && d.at ? `${minutesToClock(studioMinutesNow(new Date(d.at)))} · ` : ""}
                  {d.where}
                </span>
              </div>
            </li>
          )),
          "Only you see this list. A tick on your own list can be taken back here.",
        );

  const lists: Record<TrackerList, () => ReactNode> = {
    today: todayList,
    coming: comingList,
    anytime: anytimeList,
    someday: somedayList,
    done: doneList,
  };
  const heading = TRACKER_LISTS.find((l) => l.id === list)?.label ?? "Today";
  const todayWords = formatStudioDate(todayKey ? `${todayKey}T12:00:00` : new Date(), { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="st">
      <div className="st__scroll touch-pane">
        <div className="rtk">
          <div className="rtk-in">
          <aside className="rtk-rail" aria-label="Your lists">
            <div className={`rtk-box${tracked ? " rtk-box--on" : ""}`}>
              <h2 className="pl__h2 rtk-box__h">
                <Crosshair size={14} aria-hidden /> Tracking
              </h2>
              {tracked ? (
                <>
                  <p className="rtk-box__t">{trackedChipWords(tracked).replace(/^Tracking: /, "")}</p>
                  <div className="rtk-acts">
                    {relay?.openRelayTab && (
                      <button type="button" className="pl__btn" onClick={() => relay.openRelayTab?.("floor")}>
                        Show it on the Board
                      </button>
                    )}
                    <button type="button" className="pl__btn" onClick={() => untrack(activeStudioId ?? null, todayKey)}>
                      Stop tracking
                    </button>
                  </div>
                </>
              ) : (
                <p className="rtk-box__none">Nothing yet. Take a job on the Board and it rides along here and in the header until it's done.</p>
              )}
            </div>

            <nav className="rtk-lists" aria-label="My lists">
              {TRACKER_LISTS.map((l) => {
                const Icon = LIST_ICON[l.id];
                return (
                  <button key={l.id} type="button" className="rtk-list" aria-pressed={list === l.id} onClick={() => setList(l.id)}>
                    <Icon size={17} aria-hidden />
                    <span className="rtk-list__t">{l.label}</span>
                    <span className="rtk-list__n">{tracker.counts[l.id]}</span>
                  </button>
                );
              })}
            </nav>

            <div className="rtk-acts rtk-rail__acts">
              <button
                type="button"
                className="pl__btn"
                disabled={!ownerId || !activeStudioId}
                onClick={() => {
                  if (relay) {
                    relay.openCapture({ destination: "me" });
                    return;
                  }
                  setIntent({ mode: "new", scope: "personal" });
                  setManaging(true);
                }}
              >
                <Plus size={14} aria-hidden />
                To-do
              </button>
              <button
                type="button"
                className="pl__btn"
                disabled={!ownerId || !activeStudioId}
                onClick={() => {
                  const preset = reminderPreset(todayKey, new Date());
                  if (relay) {
                    relay.openCapture({ destination: "me", time: preset.timeOfDay ?? null, remindMinutesBefore: 0 });
                    return;
                  }
                  setIntent({ mode: "new", scope: "personal", preset });
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
          </aside>

          <section className="rtk-main" aria-label={heading}>
            <div className="pl__panel-head">
              <div className="pl__panel-titles">
                <h2 className="pl__h2">{heading}</h2>
                <p className="pl__sub">
                  {list === "today" ? `${todayWords} · sorted by when. ` : ""}Your own to-dos are yours alone. Each belongs to the studio you added it at: this is {studioName}'s.
                </p>
              </div>
            </div>
            {readsFailed && <p className="sh__loading">Some of your list couldn't be loaded, so it may be missing things. Check your connection.</p>}
            {loading && rows.length === 0 ? <p className="sh__loading">Loading today…</p> : lists[list]()}
          </section>
          </div>
        </div>
      </div>

      {undo && <UndoBar key={undo.key} label={undo.label} onUndo={() => void undo.run()} onGone={clearUndo} />}

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
        canLead={leadsHere(authTrainer, activeStudioId)}
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
