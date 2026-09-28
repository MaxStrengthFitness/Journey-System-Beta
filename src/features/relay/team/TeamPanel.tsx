import { useMemo, useState } from "react";
import { ClipboardList, Heart, Plus, ShieldCheck, Users } from "lucide-react";
import { useActiveStudio } from "../../../contexts/ActiveStudioContext";
import { auth } from "../../../firebase";
import { studioDateKey } from "../../../lib/studio-time";
import type { Client, Trainer } from "../../../types";
import { ROLE_LABELS } from "../../../types";
import { ManagePanel } from "../../studio-tasks/ManagePanel";
import { TaskManager } from "../../studio-tasks/TaskManager";
import { studioRoster } from "../../studio-tasks/initiatives";
import { useStudioRequests } from "../../studio-tasks/useStudioRequests";
import { useStudioTaskCategories } from "../../studio-tasks/useStudioTaskCategories";
import { useStudioTasks } from "../../studio-tasks/useStudioTasks";
import { useTaskCompliance } from "../../studio-tasks/useTaskCompliance";
import type { TaskTemplate } from "../../studio-tasks/types";
import { JobComposer } from "../jobs/JobComposer";
import { JobSheet } from "../jobs/JobSheet";
import { useTeamJobs } from "../jobs/useTeamJobs";
import type { JobDraft } from "../jobs/types";
import { Avatar } from "../kit";
import { useRelayMaybe } from "../board/RelayContext";
import { OpenLoops } from "../board/OpenLoops";
import { VaultPanel } from "../board/VaultPanel";
import { kudosReceived } from "../board/kudos";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { firstDayOf, teamRecord, type PersonRecord } from "./accountability";
import { useInitiativeProgress } from "./useInitiativeProgress";
import "../kit.css";
import "./team.css";

/**
 * TEAM — My Studio's Team section: PEOPLE AND STANDARDS.
 *
 * Round: Planner rework, Sep 2026. AJ: leaders "need to be able to see what
 * the team is assigned, what they've completed and what they are failing to
 * do and who might be failing to do so."
 *
 * Voice-review round, Sep 27 2026: Team's purpose had become unclear — it
 * also answered the Hub's question (who's in today) and Operations' (which
 * clients are due a renewal, not seen lately, having a birthday), each by a
 * rule of its own. AJ: "Execute the people and standards pivot. Stripping
 * out the hub and operations duplicate gives the team tab a distinct
 * standalone purpose." So Team is now:
 *
 *   people                    one card per person, BY NAME — each card the
 *                             sentences of their week, their kudos, a job
 *                             for them; no ranking, no "Behind" verdict
 *                             (recognition, never ranking; question 4)
 *   the studio's standards    the standing task list and how each duty went
 *                             these seven days, initiatives, the loops left
 *                             open (unanswered asks, flagged machines,
 *                             overdue jobs, aged-out asks)
 *   the vault                 and, beside this panel, the studio's staff
 *
 * Gone, with where each question is answered: who's in today (the Hub, any
 * of seven days); the month's client groups (Operations: Renewals, the
 * attendance watch on the studio's own break days, the week's moments and
 * the Delight queue); the week in four tiles (each person's sentences, and
 * the Floor for today's jobs).
 *
 * The arithmetic, and what is deliberately never counted, is in
 * ./accountability.ts. Reads: the week's task instances once (shared with the
 * seven-day table below — no second read), today's shift list, the team
 * jobs, the studio's requests (one listener, shared with the standards
 * panel), and one submissions listener per open initiative (shared with its
 * roll-up card) — voice review follow-up, Sep 27 2026: the standards panel
 * and each roll-up used to open second copies of the last two.
 */

export interface TeamPanelProps {
  authTrainer?: Trainer | null;
  clients?: Client[];
  trainers?: Trainer[];
  onOpenClient?: (clientId: string) => void;
}

const DAYS = 7;

export function TeamPanel({ authTrainer, clients, trainers, onOpenClient }: TeamPanelProps) {
  const { activeStudioId, activeStudio } = useActiveStudio();
  const studioId = activeStudioId ?? null;
  const studioName = activeStudio?.name ?? "this studio";
  const todayKey = studioDateKey(new Date()) ?? "";
  const ownerId = auth.currentUser?.uid ?? null;

  const author = authTrainer?.id ? { id: authTrainer.id, name: authTrainer.fullName ?? "A leader" } : null;

  const { rows, templates } = useStudioTasks(studioId, { ownerId });
  const { categories } = useStudioTaskCategories(studioId);
  const compliance = useTaskCompliance(studioId, templates, DAYS);
  const teamJobs = useTeamJobs(studioId);
  const { open: openRequests, expired, recentlyResolved } = useStudioRequests(studioId);

  const roster = useMemo(() => studioRoster(trainers ?? [], studioId), [trainers, studioId]);
  const initiatives = useInitiativeProgress(studioId, openRequests, roster);
  // Handed to the standards panel, so Team opens one requests listener and
  // one submissions listener per initiative, not two of each.
  const requestLists = useMemo(() => ({ open: openRequests, expired }), [openRequests, expired]);
  const progressById = useMemo(() => new Map(initiatives.map((i) => [i.id, i.progress] as const)), [initiatives]);
  const roleOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of trainers ?? []) if (t.id && t.role) m.set(t.id, ROLE_LABELS[t.role] ?? t.role);
    return m;
  }, [trainers]);

  const records = useMemo(
    () =>
      teamRecord({
        roster,
        todayKey,
        instances: compliance.instances,
        templates,
        jobs: teamJobs.jobs,
        requests: openRequests,
        initiatives,
        days: DAYS,
      }),
    [roster, todayKey, compliance.instances, templates, teamJobs.jobs, openRequests, initiatives],
  );
  // Kudos received in the last seven days, per person, from what Team already
  // reads: the task rows, the jobs, and the ANSWERED asks — an ask's kudos go
  // to whoever answered it, and the open ones have nobody to credit yet.
  const kudosByPerson = useMemo(
    () =>
      kudosReceived({
        instances: compliance.instances,
        jobs: teamJobs.jobs,
        requests: recentlyResolved,
        since: todayKey ? firstDayOf(todayKey, DAYS) : undefined,
      }),
    [compliance.instances, teamJobs.jobs, recentlyResolved, todayKey],
  );

  const relay = useRelayMaybe();
  const [composing, setComposing] = useState<Partial<JobDraft> | null>(null);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const openJob = teamJobs.jobs.find((j) => j.id === openJobId) ?? null;
  const [managing, setManaging] = useState(false);
  const [managerIntent, setManagerIntent] = useState<
    { mode: "new"; scope: "studio" | "personal" } | { mode: "edit"; template: TaskTemplate } | null
  >(null);

  // The shift list's reports for Open loops: the seven days' task rows, with
  // today's live rows last so a report made (or cleared) while Team is open
  // shows as it is now (team/accountability.ts, shiftListReports).
  const taskRows = useMemo(() => [...compliance.instances, ...rows.map((r) => r.instance)], [compliance.instances, rows]);
  const taskTitle = useMemo(() => {
    const m = new Map(templates.map((t) => [t.id, t.title] as const));
    return (id: string) => m.get(id) ?? "";
  }, [templates]);
  // Open loops names machines from the studio's roster in every state and
  // the catalog, so a report on a machine switched off or taken off the floor
  // this week still names it (the duty lists read only the active floor).
  const { machines: floorMachines } = useStudioMachines(relay ? studioId : null, {
    includeInactive: true,
    includeUnrostered: true,
  });
  const machineNames = useMemo(() => {
    const m = new Map(floorMachines.map((x) => [x.machineId, x.name] as const));
    return (id: string) => m.get(id) ?? "";
  }, [floorMachines]);
  const loading = compliance.loading || teamJobs.loading;
  const readError = compliance.error ?? teamJobs.error;

  return (
    <div className="st">
      <div className="st__scroll touch-pane">
        <div className="pl__panel-head">
          <div className="pl__panel-titles">
            <h2 className="pl__h2">Your team</h2>
            <p className="pl__sub">
              The people who work at {studioName} and what the studio holds them to: each person's last {DAYS} days, the
              standing duties, and the loops left open.
            </p>
          </div>
          <div className="pl__panel-actions">
            <button
              type="button"
              className="pl__btn pl__btn--primary"
              onClick={() => (relay ? relay.openCapture({ destination: "someone", someoneForm: "job" }) : setComposing({}))}
              disabled={!studioId}
            >
              <ClipboardList size={14} aria-hidden />
              Post a job
            </button>
            <button
              type="button"
              className="pl__btn"
              disabled={!studioId}
              onClick={() => {
                setManagerIntent({ mode: "new", scope: "studio" });
                setManaging(true);
              }}
            >
              <Plus size={14} aria-hidden />
              Standing task
            </button>
          </div>
        </div>

        {readError && (
          <p className="rk-empty" role="alert">
            {readError}
          </p>
        )}

        <section aria-labelledby="tm-people" className="tm-people">
          <h3 className="pl__list-head" id="tm-people">
            <Users size={14} aria-hidden />
            People <span className="pl__count">{records.length}</span>
          </h3>
          <p className="tm-fair">
            <ShieldCheck size={14} aria-hidden />
            By name, never ranked. Only work with someone's name on it counts here — tasks you assigned, tasks they
            took, jobs they're on, requests they claimed. A task someone else finished is done and isn't held against
            anyone. Notes are never counted.
          </p>
          {roster.length === 0 ? (
            <p className="rk-empty">
              Nobody works at {studioName} yet, so there is no team to show. Trainers appear here once their profile
              names this studio — as their home, a studio they also work at, or a guest studio.
            </p>
          ) : loading && !readError ? (
            <p className="rk-empty">Loading the week…</p>
          ) : (
            <ul className="tm-cards">
              {records.map((r) => (
                <li key={r.person.id}>
                  <PersonCard
                    record={r}
                    role={roleOf.get(r.person.id)}
                    kudos={kudosByPerson.get(r.person.id) ?? 0}
                    isMe={r.person.id === author?.id}
                    onOpenJob={setOpenJobId}
                    onPostFor={() =>
                      relay
                        ? relay.openCapture({ destination: "someone", someoneForm: "job", people: [r.person], openToAll: false })
                        : setComposing({ assignees: [r.person], openToAll: false })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The studio's day (shift hours, the deep-clean interval) moved to
            My Studio → Studio in the My Studio round (Sep 2026), beside the
            rest of the studio's own record. */}

        <section className="tm-manage" aria-labelledby="tm-manage">
          <h3 className="pl__list-head" id="tm-manage">
            The studio's standards
          </h3>
          <p className="pl__list-note">
            The standing duties {studioName} is held to, how each one went this week, initiatives, and the loops left
            open. Trainers see the standing duties on Relay's Board, behind Floor work, on the days they fall due.
          </p>
          {relay && (
            <OpenLoops
              requests={openRequests}
              jobs={teamJobs.jobs}
              machineNames={machineNames}
              taskRows={taskRows}
              taskTitle={taskTitle}
            />
          )}
          <ManagePanel
            studioId={studioId}
            templates={templates}
            categories={categories}
            author={author}
            trainers={trainers}
            compliance={compliance}
            requests={requestLists}
            initiativeProgress={progressById}
            onNewTask={() => {
              setManagerIntent({ mode: "new", scope: "studio" });
              setManaging(true);
            }}
            onEditTask={(template) => {
              setManagerIntent({ mode: "edit", template });
              setManaging(true);
            }}
          />
        </section>

        {relay && <VaultPanel />}
      </div>

      <TaskManager
        open={managing}
        onOpenChange={(o) => {
          setManaging(o);
          if (!o) setManagerIntent(null);
        }}
        studioId={studioId}
        canManageStudio
        ownerId={ownerId}
        templates={templates}
        author={author}
        clients={clients}
        openWith={managerIntent}
      />
      <JobComposer
        open={composing !== null}
        onOpenChange={(o) => !o && setComposing(null)}
        preset={composing}
        studioId={studioId}
        author={author}
        authTrainer={authTrainer ?? null}
        people={roster}
        clients={clients ?? []}
        categories={categories}
        onPosted={(id) => setOpenJobId(id)}
      />
      <JobSheet
        job={openJob}
        open={openJobId !== null && openJob !== null}
        onOpenChange={(o) => !o && setOpenJobId(null)}
        me={author}
        canLead
        people={roster}
        onOpenClient={onOpenClient}
      />
    </div>
  );
}

function PersonCard({
  record,
  role,
  kudos = 0,
  isMe,
  onOpenJob,
  onPostFor,
}: {
  record: PersonRecord;
  role?: string;
  /** Kudos received in the last seven days. Shown, never ranked. */
  kudos?: number;
  isMe: boolean;
  onOpenJob: (jobId: string) => void;
  onPostFor: () => void;
}) {
  const first = record.person.name.split(" ")[0] || record.person.name;
  return (
    <article className="tm-card">
      <header className="tm-card__head">
        <Avatar name={record.person.name} />
        <span className="tm-card__who">
          <span className="tm-card__name">
            {record.person.name}
            {isMe ? " (you)" : ""}
          </span>
          {role && <span className="tm-card__role">{role}</span>}
        </span>
        {kudos > 0 && (
          <span className="rk-tag tm-card__kudos" aria-label={`${kudos} kudos in the last seven days`}>
            <Heart size={12} aria-hidden /> {kudos}
          </span>
        )}
      </header>
      <ul className="tm-card__lines">
        {record.lines.map((line, i) => (
          <li key={i} className={`tm-line tm-line--${line.tone}`}>
            {line.text}
          </li>
        ))}
      </ul>
      {(record.jobs.overdue.length > 0 || !isMe) && (
        <footer className="tm-card__foot">
          {record.jobs.overdue.slice(0, 2).map((j) => (
            <button key={j.jobId} type="button" className="tj-open" onClick={() => onOpenJob(j.jobId)}>
              Open “{j.title}”
            </button>
          ))}
          {!isMe && (
            <button type="button" className="tj-open" onClick={onPostFor}>
              <Plus size={13} aria-hidden /> Job for {first}
            </button>
          )}
        </footer>
      )}
    </article>
  );
}
