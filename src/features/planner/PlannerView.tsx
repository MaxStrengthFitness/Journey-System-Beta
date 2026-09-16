import { useCallback, useEffect, useState } from "react";
import { Building2, NotebookPen, StickyNote, UserRound, Users } from "lucide-react";
import { useActiveStudio } from "../../ActiveStudioContext";
import { isStudioLeader } from "../../lib/permissions";
import { formatStudioDate, studioDateKey } from "../../lib/studio-time";
import type { Client, Trainer } from "../../types";
import { StudioHubView } from "../studio-tasks/StudioHubView";
import type { ClientTaskAction } from "../studio-tasks/types";
import { MyTasksPanel } from "./MyTasksPanel";
import { NotesPanel } from "./notes/NotesPanel";
import { TeamPanel } from "./team/TeamPanel";
import { clearPlannerIntent, peekPlannerIntent, type PlannerIntent } from "./intent";
import "../studio-tasks/studio-tasks.css";
import "../studio-tasks/studio-hub.css";
import "./kit.css";
import "./planner.css";

/**
 * THE PLANNER — what used to be the To-Do screen.
 *
 * Round: Learning + Planner, Sep 2026, reworked Sep 2026. AJ first asked for
 * "personal notes and personal tasks and the studio tasks" in one place, and
 * picked the name Planner. The rework (a studio hub that bridges "daily busy
 * work, team communication and long-term client strategy") added the fourth
 * tab and a good deal inside the other three:
 *
 *   Studio    the studio hub — today's shift, team jobs, the board, the
 *             playbook (StudioHubView)
 *   My tasks  a trainer's own list: reminders, the jobs they're on, what a
 *             head trainer assigned them (./MyTasksPanel)
 *   Notes     a trainer's own notes, built up over sessions, shared onto a
 *             client's record or with colleagues (./notes)
 *   Team      head trainers and studio leaders only: who is assigned what,
 *             who finished it, who is behind, and the studio's standing
 *             duties (./team)
 *
 * The name stays "Planner". Gemini suggested "Command"; with reminders and
 * plans in it now, Planner describes it better, and a trainer should never
 * have to learn a second name for a screen they already use.
 *
 * The view id stays "studio-tasks": notifications already stored in trainers'
 * bells link to it, and a rename there would strand every one of them.
 *
 * The tab is remembered for the session (module state, not storage): a
 * trainer who lives in My tasks comes back to it; a fresh load starts on
 * Studio, where the shift strip is. Arriving from a client's profile opens
 * Notes; from a notification about a team job, Studio with the job open.
 */

export type PlannerTab = "studio" | "mine" | "notes" | "team";

let rememberedTab: PlannerTab = "studio";

export interface PlannerViewProps {
  authTrainer?: Trainer | null;
  clients?: Client[];
  trainers?: Trainer[];
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
}

const TABS: { id: PlannerTab; label: string; icon: typeof Users; leadersOnly?: boolean }[] = [
  { id: "studio", label: "Studio", icon: Building2 },
  { id: "mine", label: "My tasks", icon: UserRound },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "team", label: "Team", icon: Users, leadersOnly: true },
];

/** Which tab an arrival request opens. */
function tabFor(intent: PlannerIntent): PlannerTab {
  return intent.kind === "open-job" ? "studio" : "notes";
}

export function PlannerView({
  authTrainer,
  clients,
  trainers,
  onOpenClientTask,
}: PlannerViewProps) {
  const { activeStudio } = useActiveStudio();
  // Team is a leader's view. Hiding the tab is a convenience — the rules
  // decide what anyone can read or write — but a trainer is never offered it.
  const canLead = isStudioLeader(authTrainer ?? null);
  const tabs = TABS.filter((t) => !t.leadersOnly || canLead);

  // A request from a client's profile or a notification, read on arrival —
  // see ./intent.ts. Held until the trainer changes tab, so it acts once.
  const [intent, setIntent] = useState(peekPlannerIntent);
  useEffect(() => {
    clearPlannerIntent(intent);
  }, [intent]);
  const [tab, setTab] = useState<PlannerTab>(() => {
    if (intent) rememberedTab = tabFor(intent);
    return rememberedTab;
  });
  // A shared iPad: the last person was a leader on Team; this one is not.
  const shown: PlannerTab = tab === "team" && !canLead ? "studio" : tab;

  const clearIntent = useCallback(() => setIntent(null), []);
  const choose = (next: PlannerTab) => {
    rememberedTab = next;
    setTab(next);
    setIntent(null);
  };

  const todayKey = studioDateKey(new Date()) ?? "";
  const today = formatStudioDate(todayKey ? `${todayKey}T12:00:00` : new Date(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const openClient = onOpenClientTask ? (clientId: string) => onOpenClientTask(clientId) : undefined;

  return (
    <div className="pl">
      <header className="pl__mast">
        <div className="pl__brand">
          <NotebookPen size={19} aria-hidden />
          <span className="pl__title">Planner</span>
        </div>

        <div className="pl__tabs" role="tablist" aria-label="Planner">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`pl-tab-${id}`}
              aria-selected={shown === id}
              aria-controls="pl-panel"
              aria-label={label}
              className="pl__tab"
              onClick={() => choose(id)}
            >
              <Icon size={14} aria-hidden />
              <span className="pl__tab-label">{label}</span>
            </button>
          ))}
        </div>

        <span className="pl__where">
          {activeStudio?.name ?? "Studio"} · {today}
        </span>
      </header>

      <div className="pl__body" role="tabpanel" id="pl-panel" aria-labelledby={`pl-tab-${shown}`}>
        {shown === "studio" && (
          <StudioHubView
            embedded
            authTrainer={authTrainer}
            clients={clients}
            trainers={trainers}
            onOpenClientTask={onOpenClientTask}
            openJobId={intent?.kind === "open-job" ? intent.jobId : null}
            onOpenedJob={clearIntent}
          />
        )}
        {shown === "mine" && (
          <MyTasksPanel
            authTrainer={authTrainer}
            clients={clients}
            trainers={trainers}
            onOpenClientTask={onOpenClientTask}
          />
        )}
        {shown === "notes" && (
          <NotesPanel
            authTrainer={authTrainer}
            clients={clients}
            trainers={trainers}
            intent={intent && tabFor(intent) === "notes" ? intent : null}
            onOpenClient={openClient}
          />
        )}
        {shown === "team" && (
          <TeamPanel authTrainer={authTrainer} clients={clients} trainers={trainers} onOpenClient={openClient} />
        )}
      </div>
    </div>
  );
}
