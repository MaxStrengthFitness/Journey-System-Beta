import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BellPlus, CalendarRange, ClipboardList, Dumbbell, ListChecks, Settings2, StickyNote, Users, UsersRound, Zap } from "lucide-react";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { auth } from "../../firebase";
import { formatStudioDate, studioDateKey } from "../../lib/studio-time";
import type { Client, Machine, ScheduleEntry, Trainer, WorkoutSession } from "../../types";
import type { ClientTaskAction } from "../studio-tasks/types";
import { reminderPreset } from "../studio-tasks/task-wizard";
import { PLANNER_TABS, PlannerView, initialPlannerTab, rememberPlannerTab, type PlannerTab } from "../relay/PlannerView";
import { TeamSection } from "./TeamSection";
import { StudioSection } from "./StudioSection";
import { MachinesSection } from "./MachinesSection";
import { OpeningsSection } from "../openings/ui/OpeningsSection";
import { mayReadWeeks } from "../standing-week/present";
import { peekPlannerIntent } from "../relay/intent";
import { RelayProvider, useRelay, type PanelContent, type RelayContextValue } from "../relay/board/RelayContext";
import { leadsHere } from "../relay/leads";
import { DayStrip, useNowContext } from "../relay/board/NowBar";
import { ContextPanel } from "../relay/board/ContextPanel";
import { CaptureSheet } from "../relay/board/CaptureSheet";
import type { CapturePreset } from "../relay/board/capture";
import { untrack, useTracked } from "../relay/board/tracked";
import { StudioHeader, type HeaderMenuItem, type HeaderSection } from "./StudioHeader";
import "../studio-tasks/studio-tasks.css";
import "../studio-tasks/studio-hub.css";
import "../relay/kit.css";
import "../relay/planner.css";
import "../relay/board/relay.css";
import "./my-studio.css";
import { UnsavedChangesScope, useLeaveScope } from "../unsaved-changes";
import { onMyStudioSectionRequest, rememberMyStudioSection, rememberedMyStudioSection, type MyStudioSection } from "./section-memory";

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
 *   Relay      the board for the trainer between clients: Board · Tracker ·
 *              Journal, and Capture (features/relay/PlannerView).
 *              Its Network tab moved to Operations → Overview → All my
 *              studios on Sep 27 2026, and its ranking of studios was dropped
 *   Openings   when the studio is usually busy, what opened up, and what to
 *              offer a client (features/openings/ui, the Openings round,
 *              Sep 27 2026): read only, it books nothing and pings nobody
 *   Machines   the floor and what the studio has done to it — everyone reads
 *              it and leaves machine notes; leaders edit it (phase 3)
 *   Team       people and standards (AJ, Sep 27 2026): who is waiting to be
 *              let in, the standing weeks, each person's week by name, the
 *              standing duties, initiatives, the loops left open, the vault,
 *              and this studio's staff: roles up to studio leader, the grant,
 *              the Mindbody link, temporary profiles
 *   Studio     the studio's own record: details, the cutover date, hours,
 *              renewal settings, announcements (phase 2)
 *
 * THE ONE HEADER (Relay room, Sep 28 2026, the redesign's phase 1). My
 * Studio's masthead, Relay's tabs and the Now Bar were three bars; they are
 * one (StudioHeader): the section, whose menu holds the five; on Relay its
 * tabs, the time (tap for the day strip) and Tracking; then Ask and +. The
 * floating Capture button went with it: Ask asks the team, + is something
 * just for you (or, for a leader, a studio task or a team job).
 *
 * Who sees what: everyone at the studio gets Relay and Machines; Openings is
 * everyone who may read the studio's standing weeks (`mayReadWeeks`: the
 * people who work there, franchise owners and administrators), because it
 * reads them; Team is the studio tier — head trainer, studio leader, studio
 * owner AT THIS STUDIO, or a trainer its leadership granted
 * `managedStudioIds` (relay/leads.ts → leadsHere, the same answer the rules
 * give, asked directly below). Studio is read by everyone who works there
 * and changed by the studio tier only (AJ's voice review, Sep 2026:
 * "Leaders edit it; trainers can view it read-only"). Hiding a section is a
 * convenience; the rules are the boundary.
 *
 * The Relay context (RelayContext) is owned HERE rather than by
 * PlannerView, so a card on any section — a machine flag on Team, a note
 * from Studio — can open Capture or the Context Panel through the same two
 * doors the board uses. "My Studio is where you run the studio; Operations
 * is where you look at it" (AJ, Sep 18).
 *
 * The view id stays "studio-tasks" and the bottom-bar button is the same one:
 * notifications already stored in trainers' bells link to it.
 */

export type { MyStudioSection };

/**
 * `leads`: the studio tier (leadsHere). `weeks`: whoever may read the
 * studio's standing weeks (mayReadWeeks). Openings reads them, and a section
 * with no gate would open for anyone whose active studio it is, who would
 * then be refused by the rules. `reads`: either of the two — Studio, which
 * everyone who works here may read (the rules let them read the studio, its
 * renewal settings and its notices) and only its leaders change.
 */
const SECTIONS: (HeaderSection & { tier?: "leads" | "weeks" | "reads" })[] = [
  { id: "relay", label: "Relay", icon: Zap },
  { id: "openings", label: "Openings", icon: CalendarRange, tier: "weeks" },
  { id: "machines", label: "Machines", icon: Dumbbell },
  { id: "team", label: "Team", icon: Users, tier: "leads", note: "The studio's leaders" },
  { id: "studio", label: "Studio", icon: Settings2, tier: "reads" },
];

export interface MyStudioViewProps {
  authTrainer?: Trainer | null;
  clients?: Client[];
  trainers?: Trainer[];
  /** The Calendar's rows (AppContent's useLiveSchedule): the header's clock. */
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
  const canLead = leadsHere(authTrainer, activeStudioId);
  const readsWeeks = mayReadWeeks(authTrainer, activeStudioId);
  const sections = SECTIONS.filter(
    (s) => !s.tier || (s.tier === "leads" ? canLead : s.tier === "weeks" ? readsWeeks : canLead || readsWeeks),
  );

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
  const choose = (next: MyStudioSection, arrive?: () => void) => {
    const go = () => {
      rememberMyStudioSection(next);
      // What a door sets inside the section (Openings' part and chip), only
      // now the move is happening, and before the section mounts and reads it.
      arrive?.();
      setSection(next);
      setPanel(null);
    };
    if (next === shown) go();
    else sectionScope.guard(go);
  };

  /*
   * A door on one section to another (Team's line about the free slots
   * opens Openings, the Openings round): section-memory.ts's request, taken
   * through the same choice as a tap on the tab, so typing is asked about
   * first.
   */
  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });
  useEffect(() => onMyStudioSectionRequest((next, arrive) => chooseRef.current(next, arrive)), []);

  /*
   * RELAY'S TABS live in the header now, so the shell holds which one shows.
   * A tab unmounts the one before it (a note half-written on Notes, a task
   * being edited on Mine), so a tab change asks about typing inside
   * `relayScope` first, as a section change does (the Relay room, Sep 28
   * 2026: the tabs were never a leave scope until they moved here).
   */
  const [relayTab, setRelayTab] = useState<PlannerTab>(initialPlannerTab);
  const relayScope = useLeaveScope();
  const chooseTab = useCallback(
    (next: PlannerTab) => {
      relayScope.guard(() => {
        rememberPlannerTab(next);
        setRelayTab(next);
      });
    },
    [relayScope],
  );

  /**
   * Straight to a Relay tab from anywhere in My Studio (the + menu's note,
   * Tracking's "Show it"): from another section the tab is set only once the
   * section move happens, so a "Keep editing" leaves both where they were.
   */
  const goToRelayTab = (tab: PlannerTab) => {
    if (shown === "relay") {
      chooseTab(tab);
      return;
    }
    choose("relay", () => {
      rememberPlannerTab(tab);
      setRelayTab(tab);
    });
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
  const [dayOpen, setDayOpen] = useState(false);

  /* The two doors any card can open. */
  const [panel, setPanel] = useState<PanelContent | null>(null);
  const [capture, setCapture] = useState<{ preset: CapturePreset } | null>(null);
  const openCapture = useCallback((preset: CapturePreset = {}) => setCapture({ preset }), []);
  const openPanel = useCallback((content: PanelContent) => setPanel(content), []);
  const closePanel = useCallback(() => setPanel(null), []);

  /* Tracking: the one job this trainer took (relay/board/tracked.ts). */
  const tracked = useTracked(activeStudioId ?? null, now.todayKey);

  // A card's door to one of Relay's tabs (the Board's Mine door ends with the
  // way to Mine), through the same guarded move as the header's.
  const goToRelayTabRef = useRef(goToRelayTab);
  useEffect(() => {
    goToRelayTabRef.current = goToRelayTab;
  });
  const openRelayTab = useCallback((tab: PlannerTab) => goToRelayTabRef.current(tab), []);

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
      panel,
      openCapture,
      openPanel,
      closePanel,
      onOpenClientTask,
      openRelayTab,
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
      panel,
      openCapture,
      openPanel,
      closePanel,
      onOpenClientTask,
      openRelayTab,
    ],
  );

  /* The header's +: something just for you, and a leader's two forms. */
  const plusItems: HeaderMenuItem[] = [
    { id: "todo", label: "A to-do for me", icon: ListChecks, hint: "Only you see it", onSelect: () => openCapture({ destination: "me" }) },
    {
      id: "reminder",
      label: "A reminder",
      icon: BellPlus,
      hint: "Rings on this iPad at the time",
      onSelect: () => {
        const preset = reminderPreset(todayKey, new Date());
        openCapture({ destination: "me", time: preset.timeOfDay ?? null, remindMinutesBefore: 0 });
      },
    },
    {
      id: "note",
      label: "A note",
      icon: StickyNote,
      hint: "Opens your notes",
      onSelect: () => goToRelayTab("notes"),
    },
    ...(canLead
      ? [
          {
            id: "task",
            label: "A studio task",
            icon: ClipboardList,
            hint: "On the shift for everyone",
            onSelect: () => openCapture({ destination: "floor", floorForm: "task" }),
          },
          {
            id: "job",
            label: "A team job",
            icon: UsersRound,
            hint: "Parts to tick off, people on it",
            onSelect: () => openCapture({ destination: "someone", someoneForm: "job" }),
          },
        ]
      : []),
  ];

  return (
    <RelayProvider value={relay}>
      <div className="pl ms" data-section={shown}>
        <StudioHeader
          sections={sections}
          shown={shown}
          onChooseSection={(id) => choose(id)}
          relayTabs={PLANNER_TABS}
          relayTab={relayTab}
          onRelayTab={chooseTab}
          now={now}
          dayOpen={dayOpen}
          onToggleDay={() => setDayOpen((v) => !v)}
          studioName={activeStudio?.name ?? "Studio"}
          todayLabel={today}
          tracked={tracked}
          onShowTracked={() => goToRelayTab("floor")}
          onStopTracking={() => untrack(activeStudioId ?? null, now.todayKey)}
          onAsk={() => openCapture({ destination: "floor", askKind: "help" })}
          plusItems={plusItems}
        />

        {shown === "relay" && dayOpen && <DayStrip now={now} />}

        <UnsavedChangesScope scope={sectionScope}>
          {shown === "relay" && (
            <UnsavedChangesScope scope={relayScope}>
              <PlannerView
                authTrainer={authTrainer}
                clients={clients}
                trainers={trainers}
                onOpenClientTask={onOpenClientTask}
                tab={relayTab}
              />
            </UnsavedChangesScope>
          )}

          {/* Openings draws its own frame too: its parts, and a time's sheet beside them. */}
          {shown === "openings" && activeStudio && (
            <OpeningsSection studio={activeStudio} authTrainer={authTrainer ?? null} trainers={trainers ?? NONE} />
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
 * .cp). Relay's own frame is drawn by PlannerView; the other sections use
 * this one. The panel's content comes from the shell's context, so a card on
 * any section can open it.
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
