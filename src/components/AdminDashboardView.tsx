import React, { useState } from "react";
import { Trainer, Studio, FranchiseNetwork, Client, WorkoutSession, Machine, ScheduleEntry } from "../types";
// Deprecated (Sep 2026 UI overhaul): the Retention route is unmounted. The
// component file stays on disk in case it is revived; nothing imports it here.
// import { RetentionDashboardView } from "./RetentionDashboardView";
import { AdminLimboQueue } from "./AdminLimboQueue";
import { Bug, Megaphone, Activity, Users, Building2, TrendingUp, Zap, Inbox, Dumbbell, ClipboardList, Download, Database, CalendarClock, Gift, Ruler, Clock3 } from "lucide-react";
import { AdminRoutineTemplatesTab } from "./routines/AdminRoutineTemplatesTab";
import { cn } from "@/lib/utils";
import "../features/admin/admin.css";
import { auth } from "../firebase";

import { AdminMachinesTab } from "./machines/AdminMachinesTab";
import { AdminDataReportsTab } from "../features/admin-data";
import { AdminSystemToolsTab } from "./AdminSystemToolsTab";
import { MondayPage } from "../features/admin/monday/MondayPage";
import { AdminStudiosTab } from "../features/admin/studios/AdminStudiosTab";
import { AdminStaffTab } from "../features/admin/staff/AdminStaffTab";
import { AdminClientsTab } from "../features/admin/clients/AdminClientsTab";
import { AdminAnnouncementsTab } from "../features/admin/announcements/AdminAnnouncementsTab";
import { AdminMindbodyTab } from "../features/admin/mindbody/AdminMindbodyTab";
import { AdminBugReportsTab } from "../features/admin/bugs/AdminBugReportsTab";
import { AdminInsightsTab } from "../features/admin/insights/AdminInsightsTab";
import { AdminRenewalsTab } from "../features/admin/renewals/AdminRenewalsTab";
import { AdminMachineFitTab } from "../features/admin/machine-fit/AdminMachineFitTab";
import { AdminHoursTab } from "../features/admin/hours/AdminHoursTab";
import { OperationsScopeProvider, PickOneStudio, ScopeBar, scopeKey, useOperationsScope } from "../features/admin/scope-context";
import { DelightQueue } from "../features/ford/DelightQueue";
import { rememberMyStudioSection } from "../features/my-studio/section-memory";

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
  onSeedDemoClient?: () => void;
  onRestoreMachines?: () => void;
  onReorderTrainers?: () => void;
  onAppCleanse?: () => void;
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
  // `sessions` (the 24-hour stream) was the Overview's; the Monday page reads
  // its own window. Still accepted so AppContent's call site needs no change
  // this round. `onOpenStudioTasks` opens My Studio — Renewals points there.
  sessions: _sessions = [],
  machines = [],
  schedules = [],
  newClientsCount = 0,
  onShowNewClients,
  onUpdateStudio,
  onUpdateClient,
  onNavigateProfile,
  onSeedDemoClient,
  onRestoreMachines,
  onReorderTrainers,
  onAppCleanse,
  onOpenStudioTasks,
}: Props) {
  // "This studio" is the studio the app is in; "All my studios" is null here
  // and the tabs that can span read the list from the scope themselves.
  const ops = useOperationsScope();
  const activeStudioId = ops.studioId;
  const tabKey = scopeKey(ops.scope);
  type AdminTab =
    | "metrics"
    | "renewals"
    | "delight"
    | "users"
    | "studios"
    | "clients"
    | "machines"
    | "routines"
    | "announcements"
    | "data"
    | "bugs"
    | "insights"
    | "machine-fit"
    | "hours"
    | "mindbody"
    | "system"
    | "limbo";
  const [activeTab, setActiveTab] = useState<AdminTab>("metrics");

  const isFranchiseOwnerOrAdmin = isAdmin || authTrainer?.role === "FranchiseOwner" || authTrainer?.role === "Owner";

  const canSee = (id: AdminTab): boolean => {
    if (id === "users") return isFranchiseOwnerOrAdmin;
    // The registry — create a location, franchises, the Mindbody link,
    // delete. A studio's own record is My Studio → Studio (My Studio round),
    // so this is the owner tier's and the company's (Operations round).
    if (id === "studios") return isFranchiseOwnerOrAdmin;
    // Site id, location id, the webhook and the schedule pull: these
    // credentials configure the whole Mindbody link. The separate
    // "Integrations" tab folded in here in Round 2 Phase 2 - it was the same
    // subject at the same permission tier, split across two screens.
    if (id === "mindbody") return isAdmin;
    // Seeds, restores and a full wipe. Admin only, obviously.
    if (id === "system") return isAdmin;
    // Releasing a booking assigns it to a studio, so this is admin-only for the
    // same reason studio management is.
    if (id === "limbo") return isAdmin;
    if (id === "bugs") return isAdmin;
    if (id === "announcements") return isFranchiseOwnerOrAdmin;
    // Relocated out of the trainer hub this round. A sessions-by-trainer CSV
    // covers every trainer at the studio and the legacy importer writes
    // thousands of documents from one file picker, so both sit at the same
    // tier as staff management rather than one tap from a trainer's settings
    // screen. (Hours, the on-screen version, is every leader's — Operations
    // round, Sep 2026.)
    if (id === "data") return isFranchiseOwnerOrAdmin;
    if (id === "machines") return isFranchiseOwnerOrAdmin;
    // Studio leaders author their own location's templates, so this is
    // deliberately NOT gated to franchise-owner-or-admin the way machines
    // is. The tab itself disables authoring for anyone who cannot write,
    // and firestore.rules is the actual enforcement.
    if (id === "routines") return true;
    return true;
  };

  /**
   * Tiered navigation. Studio Management is the everyday tier; Communications
   * sits in the middle; System Backend is the advanced tier and is visually
   * pushed to the bottom of the sidebar so it reads as "under the hood".
   */
  type NavTab = { id: AdminTab; label: string; icon: React.ReactNode };
  type NavGroup = {
    id: string;
    label: string;
    tier: "primary" | "secondary";
    tabs: NavTab[];
  };
  const allGroups: NavGroup[] = [
    {
      id: "studio",
      label: "Studio Management",
      tier: "primary",
      tabs: [
        // Operations round, Sep 2026: the Monday page — the four questions a
        // leader asks first — replaces the Overview as the first screen.
        { id: "metrics", label: "Monday", icon: <Activity className="w-4 h-4" /> },
        // Renewals round, Sep 2026. Every leader runs their own studio's.
        { id: "renewals", label: "Renewals", icon: <CalendarClock className="w-4 h-4" /> },
        // FORD round, Sep 2026. The gestures the studio has promised itself,
        // across every client, in date order. Sits beside Renewals because it
        // answers a leader's Monday question in the same way.
        { id: "delight", label: "Delight queue", icon: <Gift className="w-4 h-4" /> },
        { id: "studios", label: "All locations", icon: <Building2 className="w-4 h-4" /> },
        { id: "users", label: "Staff & Roles", icon: <Users className="w-4 h-4" /> },
        { id: "clients", label: "Clients", icon: <Users className="w-4 h-4" /> },
        { id: "machines", label: "Catalog", icon: <Dumbbell className="w-4 h-4" /> },
        { id: "routines", label: "Routines", icon: <ClipboardList className="w-4 h-4" /> },
        { id: "insights", label: "Insights", icon: <TrendingUp className="w-4 h-4" /> },
        // Machine-fit round, Sep 2026. Where clients of each build are set on
        // every machine. Every leader sees their own studio's, live; the
        // company-wide report inside it is administrators only.
        { id: "machine-fit", label: "Machine fit", icon: <Ruler className="w-4 h-4" /> },
        // Operations round, Sep 2026. Training hours by trainer, by week and
        // month, with the studio's total — AJ: "no payroll on the app for
        // now, but do track training hours". Every leader, their own studios.
        { id: "hours", label: "Hours", icon: <Clock3 className="w-4 h-4" /> },
        { id: "data", label: "Exports", icon: <Download className="w-4 h-4" /> },
      ],
    },
    {
      id: "comms",
      label: "Communications",
      tier: "primary",
      tabs: [
        { id: "announcements", label: "Announcements", icon: <Megaphone className="w-4 h-4" /> },
      ],
    },
    {
      id: "backend",
      label: "System Backend",
      tier: "secondary",
      tabs: [
        { id: "mindbody", label: "Mindbody", icon: <Zap className="w-4 h-4" /> },
        { id: "limbo", label: "Limbo", icon: <Inbox className="w-4 h-4" /> },
        { id: "bugs", label: "Bug Reports", icon: <Bug className="w-4 h-4" /> },
        { id: "system", label: "System Tools", icon: <Database className="w-4 h-4" /> },
      ],
    },
  ];
  const groups: NavGroup[] = allGroups
    .map((g) => ({ ...g, tabs: g.tabs.filter((t) => canSee(t.id)) }))
    .filter((g) => g.tabs.length > 0);

  const renderNavButton = (tab: NavTab, orientation: "sidebar" | "strip") => {
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => setActiveTab(tab.id)}
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

  return (
    /*
     * `adm` on the ROOT, not just on the buttons (Sep 2026).
     *
     * The nav buttons each carried the class individually, so --adm-* resolved
     * on them and nowhere else — which is why the frame around the tabs was
     * still painted in raw Tailwind slate while everything inside it used kit
     * surfaces. Scoping once here is what makes the shell and its contents the
     * same screen rather than two designs stacked.
     */
    <div className="adm adm-shell">
      {/* ───── Sidebar (iPad landscape and up) ───── */}
      <aside className="adm-shell__side">
        {groups
          .filter((g) => g.tier === "primary")
          .map((group, gIdx) => (
            <div key={group.id} className={cn("adm-shell__group", gIdx > 0 && "adm-shell__group--spaced")}>
              <div className="adm-nav__group">{group.label}</div>
              <div className="flex flex-col">
                {group.tabs.map((tab) => renderNavButton(tab, "sidebar"))}
              </div>
            </div>
          ))}
        {/* System Backend: pinned to the bottom, visually separated. */}
        {groups
          .filter((g) => g.tier === "secondary")
          .map((group) => (
            <div
              key={group.id}
              className="adm-nav__rule adm-shell__group adm-shell__group--pinned"
            >
              <div className="adm-nav__group">{group.label}</div>
              <div className="flex flex-col">
                {group.tabs.map((tab) => renderNavButton(tab, "sidebar"))}
              </div>
            </div>
          ))}
      </aside>

      {/* ───── Two-tier horizontal strip (portrait / narrow) ───── */}
      <div className="adm-shell__strip">
        <div className="adm-shell__striprow">
          {groups.map((group, gIdx) => (
            <div
              key={group.id}
              className={cn("adm-shell__stripgroup", gIdx > 0 && "adm-shell__stripgroup--divided")}
            >
              <span className="adm-nav__group adm-shell__striplabel">{group.label}</span>
              <div className="flex">
                {group.tabs.map((tab) => renderNavButton(tab, "strip"))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="adm-shell__main">
        <ScopeBar />
        {activeTab === "metrics" && (
          <MondayPage
            key={tabKey}
            authTrainer={authTrainer}
            studios={studios}
            trainers={trainers}
            machines={machines}
            clients={clients}
            schedules={schedules}
            activeStudioId={activeStudioId}
            onNavigateProfile={onNavigateProfile}
            onOpen={(tab) => setActiveTab(tab)}
          />
        )}
        {activeTab === "delight" && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-display text-xl font-black uppercase italic tracking-tight text-foreground">
                Delight queue
              </h2>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
                What the team has promised itself it would do something about,
                for every client at this studio, soonest first. A detail becomes
                a gesture from a client's Life section — tap the gift on any
                detail and say what you would do about it.
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
        {activeTab === "renewals" && (
          <AdminRenewalsTab
            key={tabKey}
            authTrainer={authTrainer}
            studios={studios}
            activeStudioId={activeStudioId ?? null}
            trainers={trainers}
            machines={machines}
            onOpenMyStudio={
              onOpenStudioTasks
                ? () => {
                    rememberMyStudioSection("studio");
                    onOpenStudioTasks();
                  }
                : undefined
            }
          />
        )}
        {activeTab === "users" && (
          <AdminStaffTab
            key={tabKey}
            trainers={trainers}
            studios={studios}
            activeStudioId={activeStudioId}
            isAdmin={isAdmin}
            onRefresh={onRefresh}
          />
        )}
        {activeTab === "clients" && (
          <AdminClientsTab
            key={tabKey}
            studios={studios}
            activeStudioId={activeStudioId}
            onNavigateProfile={onNavigateProfile}
          />
        )}
        {activeTab === "studios" && (
          <AdminStudiosTab
            authTrainer={authTrainer}
            studios={studios}
            networks={networks}
            trainers={trainers}
            clients={clients}
            isAdmin={isAdmin}
            onRefresh={onRefresh}
          />
        )}
        {activeTab === "machines" && <AdminMachinesTab isAdmin={isAdmin} />}
        {activeTab === "routines" && (
          <AdminRoutineTemplatesTab
            studios={ops.readable}
            activeStudioId={activeStudioId}
            authTrainer={authTrainer}
            isAdmin={isAdmin}
          />
        )}
        {activeTab === "insights" && (
          <AdminInsightsTab
            key={tabKey}
            studios={studios}
            trainers={trainers}
            activeStudioId={activeStudioId ?? null}
          />
        )}
        {activeTab === "machine-fit" && (
          <AdminMachineFitTab
            key={tabKey}
            machines={machines}
            clients={clients}
            studios={studios}
            activeStudioId={activeStudioId ?? null}
            isAdmin={isAdmin}
            onNavigateProfile={onNavigateProfile}
          />
        )}
        {activeTab === "hours" && (
          <AdminHoursTab key={tabKey} trainers={trainers} />
        )}
        {/* "retention" tab removed — see the commented import at the top. */}
        {activeTab === "mindbody" && (
          <AdminMindbodyTab
            studios={studios}
            trainers={trainers}
            clients={clients ?? []}
            activeStudioId={activeStudioId ?? null}
          />
        )}
        {activeTab === "announcements" && (
          <AdminAnnouncementsTab
            authTrainer={authTrainer}
            studios={studios}
            networks={networks}
          />
        )}
        {activeTab === "limbo" && (
          <AdminLimboQueue studios={studios} clients={clients} />
        )}
        {/* "integrations" folded into the Mindbody tab above, Round 2 Phase 2. */}

        {activeTab === "data" && ops.scope.kind === "all" && <PickOneStudio what="Exports" />}
        {activeTab === "data" && ops.scope.kind !== "all" && (
          <AdminDataReportsTab
            key={tabKey}
            trainers={trainers}
            clients={clients}
            studios={studios}
            activeStudioId={activeStudioId}
          />
        )}

        {activeTab === "bugs" && <AdminBugReportsTab studios={studios} />}

        {activeTab === "system" && (
          <AdminSystemToolsTab
            onSeedDemoClient={onSeedDemoClient}
            onRestoreMachines={onRestoreMachines}
            onReorderTrainers={onReorderTrainers}
            onAppCleanse={onAppCleanse}
          />
        )}
      </div>
    </div>
  );
}
