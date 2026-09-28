import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, StickyNote, UserRound, type LucideIcon } from "lucide-react";
import type { Client, Trainer } from "../../types";
import { StudioHubView } from "../studio-tasks/StudioHubView";
import type { ClientTaskAction } from "../studio-tasks/types";
import { MyTasksPanel } from "./MyTasksPanel";
import { NotesPanel } from "./notes/NotesPanel";
import { clearPlannerIntent, peekPlannerIntent, type PlannerIntent } from "./intent";
import { useRelay } from "./board/RelayContext";
import { ContextPanel } from "./board/ContextPanel";
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
 * (features/my-studio/MyStudioView, which owns the header, the Relay
 * context and the Capture sheet — this file draws the board under it). The
 * Sep 16 Planner had the right THINGS (studio tasks, team jobs, asks, the
 * playbook, private notes, reminders) and was built like a form-filling app:
 * five composers, three-step wizards, and a screen that never knew what time
 * it was. Relay keeps the documents and the rules of who may do what, and
 * changes how the work is SEEN and CAPTURED:
 *
 *   Floor            the studio's shared board: Next up, the shift rings, the
 *                    floor map, asks, the playbook (studio-tasks/StudioHubView)
 *   Mine             the trainer's own list: today, handed to you, follow-ups,
 *                    growth (MyTasksPanel)
 *   Notes            working notes beside the note, publish with an audience
 *   Capture          one composer for all of it (the header's + and Ask)
 *   Context Panel    detail beside the board, never a modal over it
 *
 * THE ONE HEADER (Relay room, Sep 28 2026): Relay's tabs, the time (the Now
 * Bar's shift, gap and next session) and Tracking are in My Studio's header
 * now (my-studio/StudioHeader), so this view draws no bar of its own. Which
 * tab is showing is the shell's (it owns the header); this view keeps the
 * tab's memory and acts on an arriving request. "Just now", the teammates'
 * ticker that sat on the Now Bar, is a still list on the Floor.
 *
 * Team was Relay's fourth tab and is My Studio → Team now (My Studio round,
 * Sep 2026): people and standards since the voice-review round (Sep 27
 * 2026), for the leaders of this studio. Network — the network's focus,
 * initiatives across studios and a ranking of studios — was the other fourth
 * tab, for franchise owners and the company. It moved to Operations →
 * Overview → All my studios in the voice-review round ("Relay must
 * prioritize the trainers transitioning between clients"), and the ranking
 * was dropped. So Relay is Floor · Mine · Notes, and every tab is
 * everyone's.
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

export type PlannerTab = "floor" | "mine" | "notes";

let rememberedTab: PlannerTab = "floor";

// The next person on this iPad starts on the Floor, not on the last one's
// Notes. Sign-out round, Sep 24 2026.
forgetOnSignOut(() => {
  rememberedTab = "floor";
});

/** Relay's tabs, in order: what the header draws. The ids are stored in links and memory, so they never change. */
export const PLANNER_TABS: { id: PlannerTab; label: string; icon: LucideIcon }[] = [
  { id: "floor", label: "Floor", icon: LayoutGrid },
  { id: "mine", label: "Mine", icon: UserRound },
  { id: "notes", label: "Notes", icon: StickyNote },
];

/** Which tab an arrival request opens. */
function tabFor(intent: PlannerIntent): PlannerTab {
  if (intent.kind === "open-job") return "floor";
  if (intent.kind === "open-tab") return intent.tab;
  return "notes";
}

/**
 * The tab Relay opens on: an arriving request's (a client's profile, a
 * notification), else the one this iPad was last on. The shell asks it once,
 * when it mounts.
 */
export function initialPlannerTab(): PlannerTab {
  const intent = peekPlannerIntent();
  if (intent) rememberedTab = tabFor(intent);
  return rememberedTab;
}

/** Remember the tab for the rest of this session (module memory, forgotten at sign-out). */
export function rememberPlannerTab(tab: PlannerTab): void {
  rememberedTab = tab;
}

export interface PlannerViewProps {
  authTrainer?: Trainer | null;
  clients?: Client[];
  trainers?: Trainer[];
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
  /** The tab showing: the shell's header chooses it. */
  tab: PlannerTab;
}

export function PlannerView({ authTrainer, clients, trainers, onOpenClientTask, tab }: PlannerViewProps) {
  const { panel, closePanel } = useRelay();

  // A request from a client's profile or a notification, read on arrival —
  // see ./intent.ts. Held until the trainer changes tab, so it acts once.
  const [intent, setIntent] = useState(peekPlannerIntent);
  useEffect(() => {
    clearPlannerIntent(intent);
  }, [intent]);

  // A tab change drops the request and the panel of the tab being left.
  const firstTab = useRef(tab);
  useEffect(() => {
    rememberPlannerTab(tab);
    if (tab === firstTab.current) return;
    firstTab.current = tab;
    setIntent(null);
    closePanel();
  }, [tab, closePanel]);

  const clearIntent = useCallback(() => setIntent(null), []);
  const openClient = onOpenClientTask ? (clientId: string) => onOpenClientTask(clientId) : undefined;

  return (
    <div className="pl__frame">
      <div className="pl__body" role="tabpanel" id="pl-panel" aria-labelledby={`pl-tab-${tab}`}>
        {tab === "floor" && (
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
        {tab === "mine" && (
          <MyTasksPanel
            authTrainer={authTrainer}
            clients={clients}
            trainers={trainers}
            onOpenClientTask={onOpenClientTask}
          />
        )}
        {tab === "notes" && (
          <NotesPanel
            authTrainer={authTrainer}
            clients={clients}
            trainers={trainers}
            intent={intent && tabFor(intent) === "notes" ? intent : null}
            onOpenClient={openClient}
          />
        )}
      </div>
      <ContextPanel content={panel} onClose={closePanel} />
    </div>
  );
}
