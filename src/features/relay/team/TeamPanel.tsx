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
import { OpenLoops } from "../board/TeamCockpit";
import { VaultPanel } from "../board/VaultPanel";
import { kudosReceived } from "../board/kudos";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { teamRecord, type PersonRecord } from "./accountability";
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
 * seven-day table below — no second read), the team jobs listener, the open
 * requests the board already reads, and one listener per open initiative.
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
  const { open: openRequests } = useStudioRequests(studioId);

  const roster = useMemo(() => studioRoster(trainers ?? [], studioId), [trainers, studioId]);
  const initiatives = useInitiativeProgress(studioId, openRequests, roster);
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
      }),
    [roster, todayKey, compliance.instances, templates, teamJobs.jobs, openRequests, initiatives],
  );
  // Relay: kudos received this week, per person, from what this tab already reads.
  const kudosByPerson = useMemo(
    () => kudosReceived({ instances: compliance.instances, jobs: teamJobs.jobs, requests: openRequests }),
    [compliance.instances, teamJobs.jobs, openRequests],
  );

  const relay = useRelayMaybe();
  const [composing, setComposing] = useState<Partial<JobDraft> | null>(null);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const openJob = teamJobs.jobs.find((j) => j.id === openJobId) ?? null;
  const [managing, setManaging] = useState(false);
  const [managerIntent, setManagerIntent] = useState<
    { mode: "new"; scope: "studio" | "personal" } | { mode: "edit"; template: TaskTemplate } | null
  >(null);

  const flaggedRows = useMemo(() => rows.filter((r) => r.instance?.flagged), [rows]);
  // Relay's cockpit names machines on the open-loops list.
  const { machines: floorMachines } = useStudioMachines(relay ? studioId : null, { bridgeWhenRosterEmpty: true });
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
              Nobody has {studioName} as their home studio yet, so there is no team to show. Trainers appear here once
              their profile names this studio.
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
            open. Trainers see the standing duties on Relay's Floor on the days they fall due.
          </p>
          {relay && <OpenLoops requests={openRequests} jobs={teamJobs.jobs} machineNames={machineNames} reported={flaggedRows} />}
          <ManagePanel
            studioId={studioId}
            templates={templates}
            categories={categories}
            author={author}
            trainers={trainers}
            compliance={compliance}
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
  /** Relay: kudos received this week. Shown, never ranked. */
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
          <span className="rk-tag tm-card__kudos" aria-label={`${kudos} kudos this week`}>
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
