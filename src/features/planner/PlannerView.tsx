import { useState } from "react";
import { NotebookPen, UserRound, Users } from "lucide-react";
import { useActiveStudio } from "../../ActiveStudioContext";
import { formatStudioDate, studioDateKey } from "../../lib/studio-time";
import type { Client, Trainer } from "../../types";
import { StudioHubView } from "../studio-tasks/StudioHubView";
import type { ClientTaskAction } from "../studio-tasks/types";
import { MyTasksPanel } from "./MyTasksPanel";
import "../studio-tasks/studio-tasks.css";
import "../studio-tasks/studio-hub.css";
import "./planner.css";

/**
 * THE PLANNER — what used to be the To-Do screen.
 *
 * Round: Learning + Planner, Sep 2026. AJ: the to-do screen "needs to be
 * renamed to something better… we should have a to do in the tasks and keep
 * everything the same but we need to just have an area where trainers can
 * store notes in folders and link clients to those notes… just personal
 * notes and personal tasks and the studio tasks". He picked the name Planner.
 *
 *   Studio    the studio hub, exactly as it was (StudioHubView)
 *   My tasks  a trainer's own list, which existed but had no screen
 *   Notes     folders and notes, linked to clients (Phase 3)
 *
 * The view id stays "studio-tasks": notifications already stored in trainers'
 * bells link to it, and a rename there would strand every one of them.
 *
 * The tab is remembered for the session (module state, not storage): a
 * trainer who lives in My tasks comes back to it; a fresh load starts on
 * Studio, where the shift strip is.
 */

export type PlannerTab = "studio" | "mine";

let rememberedTab: PlannerTab = "studio";

export interface PlannerViewProps {
  authTrainer?: Trainer | null;
  clients?: Client[];
  trainers?: Trainer[];
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
}

const TABS: { id: PlannerTab; label: string; icon: any }[] = [
  { id: "studio", label: "Studio", icon: Users },
  { id: "mine", label: "My tasks", icon: UserRound },
];

export function PlannerView({
  authTrainer,
  clients,
  trainers,
  onOpenClientTask,
}: PlannerViewProps) {
  const { activeStudio } = useActiveStudio();
  const [tab, setTab] = useState<PlannerTab>(rememberedTab);
  const choose = (next: PlannerTab) => {
    rememberedTab = next;
    setTab(next);
  };

  const todayKey = studioDateKey(new Date()) ?? "";
  const today = formatStudioDate(todayKey ? `${todayKey}T12:00:00` : new Date(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="pl">
      <header className="pl__mast">
        <div className="pl__brand">
          <NotebookPen size={19} aria-hidden />
          <span className="pl__title">Planner</span>
        </div>

        <div className="pl__tabs" role="tablist" aria-label="Planner">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`pl-tab-${id}`}
              aria-selected={tab === id}
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

      <div className="pl__body" role="tabpanel" id="pl-panel" aria-labelledby={`pl-tab-${tab}`}>
        {tab === "studio" && (
          <StudioHubView
            embedded
            authTrainer={authTrainer}
            clients={clients}
            trainers={trainers}
            onOpenClientTask={onOpenClientTask}
          />
        )}
        {tab === "mine" && (
          <MyTasksPanel
            authTrainer={authTrainer}
            clients={clients}
            onOpenClientTask={onOpenClientTask}
          />
        )}
      </div>
    </div>
  );
}
