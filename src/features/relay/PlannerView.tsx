import { useCallback, useEffect, useState } from "react";
import { Globe, LayoutGrid, NotebookPen, Plus, StickyNote, UserRound, Users } from "lucide-react";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import type { Client, Trainer } from "../../types";
import { StudioHubView } from "../studio-tasks/StudioHubView";
import type { ClientTaskAction } from "../studio-tasks/types";
import { MyTasksPanel } from "./MyTasksPanel";
import { NotesPanel } from "./notes/NotesPanel";
import { clearPlannerIntent, peekPlannerIntent, type PlannerIntent } from "./intent";
import { useRelay } from "./board/RelayContext";
import { NowBar } from "./board/NowBar";
import { ContextPanel } from "./board/ContextPanel";
import { NetworkView } from "./board/NetworkView";
import { useClosedRings } from "./board/rings";
import { forgetOnSignOut } from "../sign-out/memory";
import "../studio-tasks/studio-tasks.css";
import "../studio-tasks/studio-hub.css";
import "./kit.css";
import "./planner.css";
import "./board/relay.css";

/**
 * RELAY — the studio's asynchronous board and each trainer's second brain.
 *
 * Round: Relay, Sep 2026; a section of My Studio since the My Studio round
 * (features/my-studio/MyStudioView, which owns the masthead, the Relay
 * context and the Capture sheet — this file draws the board under it). The
 * Sep 16 Planner had the right THINGS (studio tasks, team jobs, asks, the
 * playbook, private notes, reminders) and was built like a form-filling app:
 * five composers, three-step wizards, and a screen that never knew what time
 * it was. Relay keeps the documents and the rules of who may do what, and
 * changes how the work is SEEN and CAPTURED:
 *
 *   the Now Bar      pinned on every tab — the shift phase, the trainer's next
 *                    session and minutes free, and the Pulse (relay/NowBar)
 *   Floor            the studio's shared board: Next up, the shift rings, the
 *                    floor map, asks, the playbook (studio-tasks/StudioHubView)
 *   Mine             the trainer's own list: today, handed to you, follow-ups,
 *                    growth (MyTasksPanel)
 *   Notes            working notes beside the note, publish with an audience
 *   Network          franchise owners and administrators: focus, initiatives
 *                    across studios, the studio leaderboard (relay/NetworkView)
 *   Capture          one composer for all of it, under the right thumb
 *   Context Panel    detail beside the board, never a modal over it
 *
 * Team — who's in, cohorts, open loops, the vault — was Relay's fourth tab
 * and is My Studio's Team section now, beside this studio's staff (My Studio
 * round, Sep 2026).
 *
 * Why "Relay": a team handing work from one leg to the next, and the part
 * that passes a signal on without the sender staying on the line — which is
 * the no-pings rule in one word. Nothing pings you. Open Relay when you
 * clock in.
 *
 * The view id stays "studio-tasks": notifications already stored in
 * trainers' bells link to it. The FOLDER was features/planner until the
 * beta-prep trim (Sep 17 2026) renamed it features/relay - a cleanup round
 * is the one time a rename is cheap, and only 23 import paths had to follow.
 * File and class names inside still say Planner (PlannerView, planner.css);
 * the Floor tab and the task data layer stay in features/studio-tasks, which
 * matches the view id and is imported by the Catalog and Operations too.
 */

export type PlannerTab = "floor" | "mine" | "notes" | "network";

let rememberedTab: PlannerTab = "floor";

// The next person on this iPad starts on the Floor, not on the last one's
// Notes or Network. Sign-out round, Sep 24 2026.
forgetOnSignOut(() => {
  rememberedTab = "floor";
});

export interface PlannerViewProps {
  authTrainer?: Trainer | null;
  clients?: Client[];
  trainers?: Trainer[];
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
}

const TABS: { id: PlannerTab; label: string; icon: typeof Users; tier?: "network" }[] = [
  { id: "floor", label: "Floor", icon: LayoutGrid },
  { id: "mine", label: "Mine", icon: UserRound },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "network", label: "Network", icon: Globe, tier: "network" },
];

/** Which tab an arrival request opens. */
function tabFor(intent: PlannerIntent): PlannerTab {
  if (intent.kind === "open-job") return "floor";
  if (intent.kind === "open-tab") return intent.tab;
  return "notes";
}

export function PlannerView({ authTrainer, clients, trainers, onOpenClientTask }: PlannerViewProps) {
  const { activeStudioId } = useActiveStudio();
  const { now, canNetwork, panel, openCapture, closePanel } = useRelay();
  const tabs = TABS.filter((t) => !t.tier || canNetwork);

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
  // A shared iPad: the last person was a franchise owner on Network; this one is not.
  const shown: PlannerTab = tab === "network" && !canNetwork ? "floor" : tab;

  const clearIntent = useCallback(() => setIntent(null), []);
  const choose = (next: PlannerTab) => {
    rememberedTab = next;
    setTab(next);
    setIntent(null);
    closePanel();
  };

  const openClient = onOpenClientTask ? (clientId: string) => onOpenClientTask(clientId) : undefined;
  const closedRings = useClosedRings(activeStudioId ?? null);

  return (
    <>
      <div className="pl__subbar">
        <div className="pl__tabs" role="tablist" aria-label="Relay">
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
      </div>

      <NowBar now={now} studioId={activeStudioId ?? null} closedRings={closedRings} />

      <div className="pl__frame">
        <div className="pl__body" role="tabpanel" id="pl-panel" aria-labelledby={`pl-tab-${shown}`}>
          {shown === "floor" && (
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
          {shown === "network" && <NetworkView />}
        </div>
        <ContextPanel content={panel} onClose={closePanel} />
      </div>

      {shown !== "notes" && (
        <button type="button" className="cf" onClick={() => openCapture()} aria-label="Capture">
          <Plus size={22} aria-hidden />
          <span className="cf__label">Capture</span>
        </button>
      )}
    </>
  );
}

// The notebook icon is still the bottom bar's; the masthead's bolt is Relay's own.
export { NotebookPen as PlannerNavIcon };
