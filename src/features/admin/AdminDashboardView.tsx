import React, { useState } from "react";
import { Trainer, Studio, FranchiseNetwork, Client, WorkoutSession, Machine, ScheduleEntry } from "../../types";
// Deprecated (Sep 2026 UI overhaul): the Retention route is unmounted. The
// component file stays on disk in case it is revived; nothing imports it here.
// import { RetentionDashboardView } from "./RetentionDashboardView";
import { Megaphone, Activity, Users, TrendingUp, Zap, Dumbbell, Download, CalendarClock, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import "./admin.css";
import { auth } from "../../firebase";

import { AdminDataReportsTab } from "./data";
import { OverviewPage, type OverviewLink } from "./overview/OverviewPage";
import { AdminStaffTab } from "./staff/AdminStaffTab";
import { AdminAnnouncementsTab } from "./announcements/AdminAnnouncementsTab";
import { AdminMindbodyTab } from "./mindbody/AdminMindbodyTab";
import { InsightsAndHours } from "./insights/InsightsAndHours";
import { AdminRenewalsTab } from "./renewals/AdminRenewalsTab";
import { AdminFloorTab } from "./floor/AdminFloorTab";
import { OperationsScopeProvider, PickOneStudio, ScopeBar, scopeKey, useOperationsScope } from "./scope-context";
import { DelightQueue } from "../ford/DelightQueue";
import { rememberMyStudioSection } from "../my-studio/section-memory";
import { UnsavedChangesScope, useLeaveScope } from "../unsaved-changes";

interface Props {
  authTrainer: Trainer;
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  isAdmin: boolean;
  onRefresh?: (
    collectionName: "studios" | "networks" | "trainers",
  ) => Promise<void>;
  clients?: Client[];
  sessions?: WorkoutSession[];
  machines?: Machine[];
  /**
   * Everything the live schedule hook has loaded for the active studio —
   * today plus roughly a week ahead. The Overview needs it; nothing else on
   * this screen does, which is why it is optional.
   */
  schedules?: ScheduleEntry[];
  newClientsCount?: number;
  onShowNewClients?: () => void;
  onUpdateStudio?: (id: string, updates: Partial<Studio>) => Promise<void>;
  onUpdateClient?: (id: string, updates: Partial<Client>) => Promise<void>;
  onNavigateProfile?: (clientId: string) => void;
  /**
   * The studio the admin is currently working in. Data & Reports and Alerts
   * both act on ONE studio, so they need it explicitly rather than inferring
   * a home studio: a payroll export for the wrong location is a quiet mistake
   * that only shows up on a pay run.
   */
  activeStudioId?: string | null;
  /**
   * System tools that used to hang off the trainer hub. Passed in rather than
   * implemented here because they act on the app as a whole and their
   * confirmation modals already live in AppContent.
   */
  onRestoreMachines?: () => void;
  onReorderTrainers?: () => void;
  /** Opens the Planner (was the studio to-do screen) from the Overview's task panel. */
  onOpenStudioTasks?: () => void;
}

/**
 * The Operations screen. The scope — "this studio" (the studio the app is
 * in) or "all my studios" — is decided once here and read by every tab
 * (Operations round, Sep 2026; features/admin/scope-context.tsx). The
 * provider needs the active-studio context, so the shell is a child of it.
 */
export function AdminDashboardView(props: Props) {
  return (
    <OperationsScopeProvider
      authTrainer={props.authTrainer}
      studios={props.studios}
      networks={props.networks}
      isAdmin={props.isAdmin}
      activeStudioId={props.activeStudioId ?? null}
    >
      <AdminDashboardShell {...props} />
    </OperationsScopeProvider>
  );
}

function AdminDashboardShell({
  authTrainer,
  studios,
  networks,
  trainers,
  isAdmin,
  onRefresh,
  clients = [],
  // `sessions` (the 24-hour stream) was the old Overview's; the page reads
  // its own window. Still accepted so AppContent's call site needs no change.
  sessions: _sessions = [],
  machines = [],
  schedules = [],
  newClientsCount = 0,
  onShowNewClients,
  onUpdateStudio,
  onUpdateClient,
  onNavigateProfile,
  onRestoreMachines,
  onReorderTrainers,
  onOpenStudioTasks,
}: Props) {
  void newClientsCount;
  void onShowNewClients;
  void onUpdateStudio;
  void onUpdateClient;
  // The system tools moved to the Admins dashboard (features/admins); the
  // callbacks stay on the props so AppContent's call site needs no change.
  void onRestoreMachines;
  void onReorderTrainers;
  // "This studio" is the studio the app is in; "All my studios" is null here
  // and the tabs that can span read the list from the scope themselves.
  const ops = useOperationsScope();
  const activeStudioId = ops.studioId;
  const tabKey = scopeKey(ops.scope);

  /**
   * THE NINE (Operations overhaul, Sep 19 2026 — "nine, down from
   * seventeen"): Overview · Renewals · Delight queue · Staff & Roles · Floor
   * · Insights · Announcements · Mindbody · Data. Clients went (the global
   * search and the training dashboard already cover it); Catalog, Machine
   * fit and Routines became Floor; Hours folded into Insights; Exports is
   * Data. All locations, the Catalog master, the Standard template, Limbo,
   * Bug reports, System tools and the company's Data are the Admins
   * dashboard's (features/admins) — the third position on the app-mode
   * switch, administrators and the founder only.
   *
   * AJ, Sep 18: "anyone head trainer and above has pretty much all access to
   * everything; restrict more later." So nothing on this side is gated
   * beyond opening Operations at all.
   */
  type AdminTab = "overview" | "renewals" | "delight" | "users" | "floor" | "insights" | "announcements" | "mindbody" | "data";
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [floorView, setFloorView] = useState<"machines" | "fit" | "routines">("machines");
  // Pressing Overview while on it brings the page home from one of its views.
  const [homeSignal, setHomeSignal] = useState(0);
  /*
   * The tabs unmount when another is opened, and a Save bar's edits (the
   * renewal settings, a studio machine on Floor) went with them. Opening
   * another tab now asks first about the typing inside `tabsScope`
   * (unsaved changes, Sep 24 2026).
   */
  const tabsScope = useLeaveScope();
  const openTab = (tab: AdminTab, then?: () => void) => {
    if (tab === activeTab && !then) return;
    tabsScope.guard(() => {
      then?.();
      setActiveTab(tab);
    });
  };

  const isOwnerTier = isAdmin || authTrainer?.role === "FranchiseOwner" || authTrainer?.role === "Owner";

  type NavTab = { id: AdminTab; label: string; icon: React.ReactNode };
  type NavGroup = { id: string; label: string; tier: "primary" | "secondary"; tabs: NavTab[] };
  const groups: NavGroup[] = [
    {
      id: "daily",
      label: "Every day",
      tier: "primary",
      tabs: [{ id: "overview", label: "Overview", icon: <Activity className="w-4 h-4" /> }],
    },
    {
      id: "clients",
      label: "Clients",
      tier: "primary",
      tabs: [
        { id: "renewals", label: "Renewals", icon: <CalendarClock className="w-4 h-4" /> },
        { id: "delight", label: "Delight queue", icon: <Gift className="w-4 h-4" /> },
      ],
    },
    {
      id: "studio",
      label: "Studio",
      tier: "primary",
      tabs: [
        { id: "floor", label: "Floor", icon: <Dumbbell className="w-4 h-4" /> },
        { id: "users", label: "Staff & Roles", icon: <Users className="w-4 h-4" /> },
        { id: "insights", label: "Insights", icon: <TrendingUp className="w-4 h-4" /> },
        { id: "announcements", label: "Announcements", icon: <Megaphone className="w-4 h-4" /> },
      ],
    },
    {
      id: "behind",
      label: "Behind the scenes",
      tier: "primary",
      tabs: [
        { id: "mindbody", label: "Mindbody", icon: <Zap className="w-4 h-4" /> },
        { id: "data", label: "Data", icon: <Download className="w-4 h-4" /> },
      ],
    },
  ];

  const renderNavButton = (tab: NavTab, orientation: "sidebar" | "strip") => {
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => {
          if (tab.id === "overview" && isActive) setHomeSignal((n) => n + 1);
          openTab(tab.id);
        }}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "adm adm-nav__btn flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer select-none whitespace-nowrap",
          isActive && "adm-nav__btn--active",
          orientation === "sidebar"
            ? // Minimal left border for the active item — no pill container.
              "w-full h-10 px-3 border-l-2 text-left"
            : // Bottom border on the horizontal strip (portrait / narrow).
              "h-11 px-3 border-b-2 shrink-0",
        )}
      >
        <span className="adm-nav__icon">{tab.icon}</span>
        {tab.label}
      </button>
    );
  };

  /** The Overview's doors: a line or a panel opens a tab, sometimes a view inside it. */
  const openFromOverview = (link: OverviewLink) => {
    if (link === "floor") {
      openTab("floor", () => setFloorView("fit"));
      return;
    }
    openTab(link);
  };

  const openMyStudio = onOpenStudioTasks
    ? () => {
        rememberMyStudioSection("studio");
        onOpenStudioTasks();
      }
    : undefined;

  return (
    /*
     * `adm` on the ROOT, not just on the buttons (Sep 2026): the frame around
     * the tabs was painted in raw Tailwind slate while everything inside it
     * used kit surfaces. Scoping once here makes the shell and its contents
     * the same screen rather than two designs stacked.
     */
    <div className="adm adm-shell">
      {/* ───── Sidebar (iPad landscape and up) ───── */}
      <aside className="adm-shell__side">
        {groups
          .filter((g) => g.tier === "primary")
          .map((group, gIdx) => (
            <div key={group.id} className={cn("adm-shell__group", gIdx > 0 && "adm-shell__group--spaced")}>
              <div className="adm-nav__group">{group.label}</div>
              <div className="flex flex-col">{group.tabs.map((tab) => renderNavButton(tab, "sidebar"))}</div>
            </div>
          ))}
      </aside>

      {/* ───── Two-tier horizontal strip (portrait / narrow) ───── */}
      <div className="adm-shell__strip">
        <div className="adm-shell__striprow">
          {groups.map((group, gIdx) => (
            <div key={group.id} className={cn("adm-shell__stripgroup", gIdx > 0 && "adm-shell__stripgroup--divided")}>
              <span className="adm-nav__group adm-shell__striplabel">{group.label}</span>
              <div className="flex">{group.tabs.map((tab) => renderNavButton(tab, "strip"))}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="adm-shell__main">
        <ScopeBar />

        <UnsavedChangesScope scope={tabsScope}>

        {activeTab === "overview" && (
          <OverviewPage
            key={tabKey}
            homeSignal={homeSignal}
            authTrainer={authTrainer}
            studios={studios}
            trainers={trainers}
            machines={machines}
            clients={clients}
            schedules={schedules}
            activeStudioId={activeStudioId}
            onNavigateProfile={onNavigateProfile}
            onOpen={openFromOverview}
          />
        )}

        {activeTab === "renewals" && (
          <AdminRenewalsTab key={tabKey} authTrainer={authTrainer} studios={studios} activeStudioId={activeStudioId ?? null} trainers={trainers} machines={machines} onOpenMyStudio={openMyStudio} />
        )}

        {activeTab === "delight" && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-display text-xl font-black uppercase italic tracking-tight text-foreground">Delight queue</h2>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
                What the team has promised itself it would do something about, for every client at this studio, soonest first. A detail becomes a gesture from a
                client's Life section — tap the gift on any detail and say what you would do about it.
              </p>
            </div>
            {ops.scope.kind === "all" ? (
              <PickOneStudio what="The Delight queue" />
            ) : (
              <DelightQueue
                key={tabKey}
                studioId={activeStudioId ?? null}
                clients={clients}
                trainers={trainers}
                me={{ id: auth.currentUser?.uid ?? authTrainer.authUid ?? authTrainer.id, name: authTrainer.fullName }}
                onOpenClient={onNavigateProfile}
              />
            )}
          </div>
        )}

        {activeTab === "floor" && (
          <AdminFloorTab
            key={`${tabKey}:${floorView}`}
            authTrainer={authTrainer}
            studios={studios}
            trainers={trainers}
            machines={machines}
            clients={clients}
            activeStudioId={activeStudioId ?? null}
            isAdmin={isAdmin}
            onNavigateProfile={onNavigateProfile}
            initialView={floorView}
          />
        )}

        {activeTab === "users" && <AdminStaffTab key={tabKey} trainers={trainers} studios={studios} activeStudioId={activeStudioId} isAdmin={isAdmin} onRefresh={onRefresh} />}

        {activeTab === "insights" && <InsightsAndHours key={tabKey} studios={studios} trainers={trainers} activeStudioId={activeStudioId ?? null} />}

        {activeTab === "announcements" && (
          <AdminAnnouncementsTab
            authTrainer={authTrainer}
            // A studio's leader addresses the studios they run; an owner adds
            // their network; administrators everyone.
            studios={isAdmin ? studios : ops.readable}
            networks={networks}
            scopes={isAdmin ? ["universal", "network", "studio"] : isOwnerTier ? ["network", "studio"] : ["studio"]}
          />
        )}

        {activeTab === "mindbody" &&
          (ops.scope.kind === "all" && !isAdmin ? (
            <PickOneStudio what="Mindbody" />
          ) : (
            <AdminMindbodyTab key={tabKey} studios={studios} trainers={trainers} clients={clients ?? []} activeStudioId={activeStudioId ?? null} company={isAdmin} />
          ))}

        {activeTab === "data" && ops.scope.kind === "all" && <PickOneStudio what="Data" />}
        {activeTab === "data" && ops.scope.kind !== "all" && <AdminDataReportsTab key={tabKey} trainers={trainers} clients={clients} studios={studios} activeStudioId={activeStudioId} />}
        </UnsavedChangesScope>

      </div>
    </div>
  );
}
