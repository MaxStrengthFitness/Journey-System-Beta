import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Hand, Plus, ShieldCheck, Users } from "lucide-react";
import { useActiveStudio } from "../../../ActiveStudioContext";
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
import { useRelayMaybe } from "../relay/RelayContext";
import { CohortPanel, OpenLoops, StandardsHours, WhosInToday } from "../relay/TeamCockpit";
import { VaultPanel } from "../relay/VaultPanel";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { teamRecord, teamSummary, type PersonRecord } from "./accountability";
import { useInitiativeProgress } from "./useInitiativeProgress";
import "../kit.css";
import "./team.css";

/**
 * TEAM — the Planner's fourth tab, for head trainers and studio leaders.
 *
 * Round: Planner rework, Sep 2026. AJ: leaders "need to be able to see what
 * the team is assigned, what they've completed and what they are failing to
 * do and who might be failing to do so."
 *
 *   the week in four numbers  assigned work done, people behind, jobs, grabs
 *   one card per person       behind first; sentences, never a score
 *   the studio's standards    what used to be Manage on the Studio tab: the
 *                             standing task list, the last seven days per
 *                             task, initiatives, unanswered requests, flags
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
  const summary = useMemo(() => teamSummary(records, teamJobs.jobs, todayKey), [records, teamJobs.jobs, todayKey]);

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
              How {studioName}'s last {DAYS} days went — the work with people's names on it, who finished it, and who
              is behind.
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

        <div className="tm-summary" role="list" aria-label="This week">
          <SummaryTile
            icon={<CheckCircle2 size={16} aria-hidden />}
            label="Assigned tasks"
            value={
              loading
                ? "…"
                : summary.assignedPast === 0
                  ? "None assigned"
                  : `${summary.assignedPastDone} of ${summary.assignedPast} done`
            }
            note={summary.assignedPast === 0 ? "Assign from the Studio tab's shift list." : "Before today"}
          />
          <SummaryTile
            icon={<AlertTriangle size={16} aria-hidden />}
            label="Behind"
            tone={summary.behind > 0 ? "flag" : "calm"}
            value={loading ? "…" : summary.behind === 0 ? "Nobody" : `${summary.behind} of ${records.length} people`}
            note={summary.behind > 0 ? "Cards below, worst first" : "Everything named is on track"}
          />
          <SummaryTile
            icon={<ClipboardList size={16} aria-hidden />}
            label="Team jobs"
            tone={summary.jobsOverdue > 0 ? "flag" : "calm"}
            value={teamJobs.loading ? "…" : `${summary.jobsOpen} open`}
            note={summary.jobsOverdue > 0 ? `${summary.jobsOverdue} overdue` : "None overdue"}
          />
          <SummaryTile
            icon={<Hand size={16} aria-hidden />}
            label="Up for grabs"
            tone={summary.upForGrabs > 0 ? "hero" : "calm"}
            value={teamJobs.loading ? "…" : summary.upForGrabs === 0 ? "None" : `${summary.upForGrabs} waiting`}
            note={summary.upForGrabs > 0 ? "Nobody has taken them yet" : "Every job has someone"}
          />
        </div>

        <p className="tm-fair">
          <ShieldCheck size={14} aria-hidden />
          Only work with someone's name on it counts here — tasks you assigned, tasks they took, jobs they're on,
          requests they claimed. A task someone else finished is done and isn't held against anyone. Notes are never
          counted.
        </p>

        {readError && (
          <p className="pk-empty" role="alert">
            {readError}
          </p>
        )}

        {relay && (
          <>
            <WhosInToday roster={roster} jobs={teamJobs.jobs} />
            <OpenLoops requests={openRequests} jobs={teamJobs.jobs} machineNames={machineNames} />
            <CohortPanel roster={roster} />
          </>
        )}

        <section aria-labelledby="tm-people" className="tm-people">
          <h3 className="pl__list-head" id="tm-people">
            <Users size={14} aria-hidden />
            People <span className="pl__count">{records.length}</span>
          </h3>
          {roster.length === 0 ? (
            <p className="pk-empty">
              Nobody has {studioName} as their home studio yet, so there is no team to show. Trainers appear here once
              their profile names this studio.
            </p>
          ) : loading && !readError ? (
            <p className="pk-empty">Loading the week…</p>
          ) : (
            <ul className="tm-cards">
              {records.map((r) => (
                <li key={r.person.id}>
                  <PersonCard
                    record={r}
                    role={roleOf.get(r.person.id)}
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

        {relay && <StandardsHours />}

        <section className="tm-manage" aria-labelledby="tm-manage">
          <h3 className="pl__list-head" id="tm-manage">
            The studio's standards
          </h3>
          <p className="pl__list-note">
            The standing duties {studioName} is held to, how each one went this week, initiatives, and what's been
            flagged. Trainers see the standing duties on the Studio tab on the days they fall due.
          </p>
          <ManagePanel
            studioId={studioId}
            templates={templates}
            categories={categories}
            flaggedRows={flaggedRows}
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

function SummaryTile({
  icon,
  label,
  value,
  note,
  tone = "calm",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone?: "calm" | "flag" | "hero";
}) {
  return (
    <div className={`tm-tile tm-tile--${tone}`} role="listitem">
      <span className="tm-tile__label">
        {icon}
        {label}
      </span>
      <span className="tm-tile__value">{value}</span>
      <span className="tm-tile__note">{note}</span>
    </div>
  );
}

const STANDING_LABEL: Record<PersonRecord["standing"], string> = {
  behind: "Behind",
  "on-track": "On track",
  quiet: "Nothing assigned",
};

function PersonCard({
  record,
  role,
  isMe,
  onOpenJob,
  onPostFor,
}: {
  record: PersonRecord;
  role?: string;
  isMe: boolean;
  onOpenJob: (jobId: string) => void;
  onPostFor: () => void;
}) {
  const first = record.person.name.split(" ")[0] || record.person.name;
  return (
    <article className={`tm-card tm-card--${record.standing}`}>
      <header className="tm-card__head">
        <Avatar name={record.person.name} />
        <span className="tm-card__who">
          <span className="tm-card__name">
            {record.person.name}
            {isMe ? " (you)" : ""}
          </span>
          {role && <span className="tm-card__role">{role}</span>}
        </span>
        <span
          className={`pk-tag${
            record.standing === "behind" ? " pk-tag--flag" : record.standing === "on-track" ? " pk-tag--done" : ""
          }`}
        >
          {STANDING_LABEL[record.standing]}
        </span>
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
