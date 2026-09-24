import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Building2, Dumbbell, Plus, Settings2, Users, Zap } from "lucide-react";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { auth } from "../../firebase";
import { formatStudioDate, studioDateKey } from "../../lib/studio-time";
import type { Client, Machine, ScheduleEntry, Trainer, WorkoutSession } from "../../types";
import type { ClientTaskAction } from "../studio-tasks/types";
import { PlannerView } from "../relay/PlannerView";
import { TeamSection } from "./TeamSection";
import { StudioSection } from "./StudioSection";
import { MachinesSection } from "./MachinesSection";
import { peekPlannerIntent } from "../relay/intent";
import { RelayProvider, useRelay, type PanelContent, type RelayContextValue } from "../relay/board/RelayContext";
import { reachesTier } from "../relay/board/RoleGate";
import { useNowContext } from "../relay/board/NowBar";
import { ContextPanel } from "../relay/board/ContextPanel";
import { CaptureSheet } from "../relay/board/CaptureSheet";
import type { CapturePreset } from "../relay/board/capture";
import "../studio-tasks/studio-tasks.css";
import "../studio-tasks/studio-hub.css";
import "../relay/kit.css";
import "../relay/planner.css";
import "../relay/board/relay.css";
import "./my-studio.css";
import { UnsavedChangesScope, useLeaveScope } from "../unsaved-changes";
import { rememberMyStudioSection, rememberedMyStudioSection, type MyStudioSection } from "./section-memory";

/**
 * MY STUDIO — the studio's home on the bottom bar.
 *
 * Round: My Studio, Sep 2026. AJ's audit of the Operations dashboard found a
 * studio's own settings scattered across three screens (Operations → Studios,
 * the Studio setup card under Learning, Relay → Team → Standards) and the
 * Studios tab shaped as a company registry — every studio, listed to every
 * leader. His answer (Sep 18): "each studio should have full insight and
 * control over its own studio", so the Relay tab becomes **My Studio**, with
 * Relay as a section inside it, and the studio's own world beside it:
 *
 *   Relay      the board, exactly as it was: Floor · Mine · Notes · Network,
 *              the Now Bar, Capture (features/planner/PlannerView)
 *   Machines   the floor and what the studio has done to it — everyone reads
 *              it and leaves machine notes; leaders edit it (phase 3)
 *   Team       the Team cockpit (was Relay's Team tab) and this studio's
 *              staff: who is waiting to be let in, roles up to studio
 *              leader, the grant, the Mindbody link, temporary profiles
 *   Studio     the studio's own record: details, the cutover date, hours,
 *              renewal settings, announcements (phase 2)
 *
 * Who sees what: everyone at the studio gets Relay and Machines; Team and
 * Studio are the studio tier — head trainer, studio leader, studio owner AT
 * THIS STUDIO, or a trainer its leadership granted `managedStudioIds`
 * (planner/leads.ts → leadsHere, the same answer the rules give). Hiding a
 * section is a convenience; the rules are the boundary.
 *
 * The Relay context (RelayContext) is owned HERE now rather than by
 * PlannerView, so a card on any section — a machine flag on Team, a note
 * from Studio — can open Capture or the Context Panel through the same two
 * doors the board uses. "My Studio is where you run the studio; Operations
 * is where you look at it" (AJ, Sep 18).
 *
 * The view id stays "studio-tasks" and the bottom-bar button is the same one:
 * notifications already stored in trainers' bells link to it.
 */

export type { MyStudioSection };

const SECTIONS: { id: MyStudioSection; label: string; icon: typeof Users; tier?: "leads" }[] = [
  { id: "relay", label: "Relay", icon: Zap },
  { id: "machines", label: "Machines", icon: Dumbbell },
  { id: "team", label: "Team", icon: Users, tier: "leads" },
  { id: "studio", label: "Studio", icon: Settings2, tier: "leads" },
];


export interface MyStudioViewProps {
  authTrainer?: Trainer | null;
  clients?: Client[];
  trainers?: Trainer[];
  /** The Calendar's rows (AppContent's useLiveSchedule): the Now Bar's clock. */
  schedules?: ScheduleEntry[];
  /** Today's sessions at this studio (AppContent's useSessions): machine wear. */
  sessions?: WorkoutSession[];
  /** The app-wide machine list, the Floor Map's fallback before a roster exists. */
  machines?: Machine[];
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
}

const NONE: never[] = [];

export function MyStudioView({
  authTrainer,
  clients,
  trainers,
  schedules,
  sessions,
  machines,
  onOpenClientTask,
}: MyStudioViewProps) {
  const { activeStudio, activeStudioId } = useActiveStudio();
  const canLead = reachesTier(authTrainer, activeStudioId, "leads");
  const canNetwork = reachesTier(authTrainer, activeStudioId, "network");
  const sections = SECTIONS.filter((s) => !s.tier || canLead);

  // A request from a client's profile or a notification always lands on the
  // board (PlannerView reads and clears it); a plain open returns to where
  // this iPad last was.
  const [section, setSection] = useState<MyStudioSection>(() =>
    peekPlannerIntent() ? "relay" : rememberedMyStudioSection(),
  );
  // A shared iPad: the last person was a leader on Team; this one is not.
  const shown: MyStudioSection = sections.some((s) => s.id === section) ? section : "relay";

  /*
   * A section unmounts when another is chosen, and Studio's three Save bars
   * and a studio machine being edited under Machines went with it, unsaved
   * and unannounced. Choosing another section now asks first about the
   * typing inside `sectionScope` (unsaved changes, Sep 24 2026).
   */
  const sectionScope = useLeaveScope();
  const choose = (next: MyStudioSection) => {
    const go = () => {
      rememberMyStudioSection(next);
      setSection(next);
      setPanel(null);
    };
    if (next === shown) go();
    else sectionScope.guard(go);
  };

  const todayKey = studioDateKey(new Date()) ?? "";
  const today = formatStudioDate(todayKey ? `${todayKey}T12:00:00` : new Date(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const openClient = onOpenClientTask ? (clientId: string) => onOpenClientTask(clientId) : undefined;

  /* The clock. */
  const now = useNowContext(schedules ?? NONE, authTrainer, activeStudio?.shiftHours ?? null);

  /* The two doors any card can open. */
  const [panel, setPanel] = useState<PanelContent | null>(null);
  const [capture, setCapture] = useState<{ preset: CapturePreset } | null>(null);
  const openCapture = useCallback((preset: CapturePreset = {}) => setCapture({ preset }), []);
  const openPanel = useCallback((content: PanelContent) => setPanel(content), []);
  const closePanel = useCallback(() => setPanel(null), []);

  const relay = useMemo<RelayContextValue>(
    () => ({
      studioId: activeStudioId ?? null,
      studioName: activeStudio?.name ?? "Studio",
      authTrainer: authTrainer ?? null,
      uid: auth.currentUser?.uid ?? null,
      trainers: trainers ?? NONE,
      clients: clients ?? NONE,
      schedules: schedules ?? NONE,
      sessions: sessions ?? NONE,
      machines: machines ?? NONE,
      now,
      canLead,
      canNetwork,
      panel,
      openCapture,
      openPanel,
      closePanel,
      onOpenClientTask,
    }),
    [
      activeStudioId,
      activeStudio?.name,
      authTrainer,
      trainers,
      clients,
      schedules,
      sessions,
      machines,
      now,
      canLead,
      canNetwork,
      panel,
      openCapture,
      openPanel,
      closePanel,
      onOpenClientTask,
    ],
  );

  return (
    <RelayProvider value={relay}>
      <div className="pl ms" data-section={shown}>
        <header className="pl__mast">
          <div className="pl__brand">
            <Building2 size={19} aria-hidden />
            <span className="pl__title">My Studio</span>
          </div>

          <div className="pl__tabs" role="tablist" aria-label="My Studio">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`ms-tab-${id}`}
                aria-selected={shown === id}
                aria-controls="ms-panel"
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

        <UnsavedChangesScope scope={sectionScope}>
        {shown === "relay" && (
          <PlannerView
            authTrainer={authTrainer}
            clients={clients}
            trainers={trainers}
            onOpenClientTask={onOpenClientTask}
          />
        )}

        {/* Machines draws its own frame: the machine's door is its own panel. */}
        {shown === "machines" && <MachinesSection authTrainer={authTrainer} trainers={trainers} />}

        {shown === "team" && (
          <SectionFrame id="ms-panel" labelledBy="ms-tab-team">
            <TeamSection authTrainer={authTrainer} clients={clients} trainers={trainers} onOpenClient={openClient} />
          </SectionFrame>
        )}

        {shown === "studio" && (
          <SectionFrame id="ms-panel" labelledBy="ms-tab-studio">
            <StudioSection authTrainer={authTrainer} trainers={trainers} />
          </SectionFrame>
        )}
        </UnsavedChangesScope>

        {shown !== "relay" && (
          <button type="button" className="cf" onClick={() => openCapture()} aria-label="Capture">
            <Plus size={22} aria-hidden />
            <span className="cf__label">Capture</span>
          </button>
        )}

        <CaptureSheet
          open={capture !== null}
          preset={capture?.preset ?? null}
          onOpenChange={(o) => !o && setCapture(null)}
        />
      </div>
    </RelayProvider>
  );
}

/**
 * A section's frame: the body and, beside it, the Context Panel — a right
 * column in landscape, a bottom sheet in portrait (relay.css, .pl__frame /
 * .cp). Relay's own frame is drawn by PlannerView with its tabs and the Now
 * Bar above; the other sections use this one. The panel's content comes from
 * the shell's context, so a card on any section can open it.
 */
export function SectionFrame({
  id,
  labelledBy,
  children,
}: {
  id: string;
  labelledBy: string;
  children: ReactNode;
}) {
  const { panel, closePanel } = useRelay();
  return (
    <div className="pl__frame">
      <div className="pl__body" role="tabpanel" id={id} aria-labelledby={labelledBy}>
        {children}
      </div>
      <ContextPanel content={panel} onClose={closePanel} />
    </div>
  );
}
