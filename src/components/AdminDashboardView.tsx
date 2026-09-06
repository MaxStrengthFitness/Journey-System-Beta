import React, { useState } from "react";
import { Trainer, Studio, FranchiseNetwork, Client, WorkoutSession, Machine, ScheduleEntry } from "../types";
import { AdminStudioManager } from "./AdminStudioManager";
import { AdminUserDirectory } from "./AdminUserDirectory";
import { AdminBugReports } from "./AdminBugReports";
import { AdminHubAnnouncements } from "./AdminHubAnnouncements";
import { InsightsDashboardView } from "./InsightsDashboardView";
// Deprecated (Sep 2026 UI overhaul): the Retention route is unmounted. The
// component file stays on disk in case it is revived; nothing imports it here.
// import { RetentionDashboardView } from "./RetentionDashboardView";
import { MindbodyDashboard } from "./mindbody/MindbodyDashboard";
import { AdminLimboQueue } from "./AdminLimboQueue";
import { Bug, Megaphone, Activity, Users, Building2, TrendingUp, Zap, Inbox, Dumbbell, ClipboardList, Download, Webhook, Database } from "lucide-react";
import { AdminRoutineTemplatesTab } from "./routines/AdminRoutineTemplatesTab";
import { cn } from "@/lib/utils";
import "../features/admin/admin.css";

import { AdminSystemClients } from "./AdminSystemClients";
import { AdminMachinesTab } from "./machines/AdminMachinesTab";
import { AdminDataReportsTab } from "../features/admin-data";
import { IntegrationsHubView } from "./IntegrationsHubView";
import { AdminSystemToolsTab } from "./AdminSystemToolsTab";
import { AdminOverviewTab } from "../features/admin/AdminOverviewTab";

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
  /** Opens the full studio to-do screen from the Overview's task panel. */
  onOpenStudioTasks?: () => void;
}

export function AdminDashboardView({
  authTrainer,
  studios,
  networks,
  trainers,
  isAdmin,
  onRefresh,
  clients = [],
  sessions = [],
  machines = [],
  schedules = [],
  newClientsCount = 0,
  onShowNewClients,
  onUpdateStudio,
  onUpdateClient,
  onNavigateProfile,
  activeStudioId = null,
  onSeedDemoClient,
  onRestoreMachines,
  onReorderTrainers,
  onAppCleanse,
  onOpenStudioTasks,
}: Props) {
  type AdminTab =
    | "metrics"
    | "users"
    | "studios"
    | "clients"
    | "machines"
    | "routines"
    | "announcements"
    | "data"
    | "bugs"
    | "insights"
    | "mindbody"
    | "integrations"
    | "system"
    | "limbo";
  const [activeTab, setActiveTab] = useState<AdminTab>("metrics");

  const isFranchiseOwnerOrAdmin = isAdmin || authTrainer?.role === "FranchiseOwner" || authTrainer?.role === "Owner";

  const canSee = (id: AdminTab): boolean => {
    if (id === "users") return isFranchiseOwnerOrAdmin;
    if (id === "mindbody") return isAdmin;
    // Site id, auth key and the staff schedule import. Relocated out of the
    // trainer hub (F): these credentials configure the whole Mindbody link.
    if (id === "integrations") return isAdmin;
    // Seeds, restores and a full wipe. Admin only, obviously.
    if (id === "system") return isAdmin;
    // Releasing a booking assigns it to a studio, so this is admin-only for the
    // same reason studio management is.
    if (id === "limbo") return isAdmin;
    if (id === "bugs") return isAdmin;
    if (id === "announcements") return isFranchiseOwnerOrAdmin;
    // Relocated out of the trainer hub this round. A payroll CSV covers every
    // trainer at the studio and the legacy importer writes thousands of
    // documents from one file picker, so both sit at the same tier as staff
    // management rather than one tap from a trainer's settings screen.
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
        { id: "metrics", label: "Overview", icon: <Activity className="w-4 h-4" /> },
        { id: "studios", label: "Studios", icon: <Building2 className="w-4 h-4" /> },
        { id: "users", label: "Staff & Roles", icon: <Users className="w-4 h-4" /> },
        { id: "clients", label: "Clients", icon: <Users className="w-4 h-4" /> },
        { id: "machines", label: "Machines", icon: <Dumbbell className="w-4 h-4" /> },
        { id: "routines", label: "Routines", icon: <ClipboardList className="w-4 h-4" /> },
        { id: "insights", label: "Insights", icon: <TrendingUp className="w-4 h-4" /> },
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
        { id: "integrations", label: "Integrations", icon: <Webhook className="w-4 h-4" /> },
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
    <div className="max-w-7xl mx-auto p-3 sm:p-6 animate-fade-in text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row gap-4 lg:gap-8 items-start">
      {/* ───── Sidebar (iPad landscape and up) ───── */}
      <aside className="hidden lg:flex w-52 xl:w-56 shrink-0 flex-col sticky top-0 self-start border-r border-slate-200 dark:border-slate-800 pr-2 min-h-[60dvh]">
        {groups
          .filter((g) => g.tier === "primary")
          .map((group, gIdx) => (
            <div key={group.id} className={cn(gIdx > 0 && "mt-5")}>
              <div className="adm-nav__group px-3 pb-1.5">{group.label}</div>
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
              className="adm-nav__rule mt-auto pt-5 border-t border-dashed"
            >
              <div className="adm-nav__group px-3 pb-1.5">{group.label}</div>
              <div className="flex flex-col">
                {group.tabs.map((tab) => renderNavButton(tab, "sidebar"))}
              </div>
            </div>
          ))}
      </aside>

      {/* ───── Two-tier horizontal strip (portrait / narrow) ───── */}
      <div className="lg:hidden w-full border-b border-slate-200 dark:border-slate-800 -mt-1">
        <div className="flex items-end gap-4 overflow-x-auto no-scrollbar">
          {groups.map((group, gIdx) => (
            <div key={group.id} className={cn("flex flex-col shrink-0", gIdx > 0 && "border-l border-slate-200 dark:border-slate-800 pl-4")}>
              <span className="adm-nav__group px-3 text-[9px]">{group.label}</span>
              <div className="flex">
                {group.tabs.map((tab) => renderNavButton(tab, "strip"))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 w-full">
        {activeTab === "metrics" && (
          <AdminOverviewTab
            authTrainer={authTrainer}
            studios={studios}
            activeStudioId={activeStudioId}
            schedules={schedules}
            sessions={sessions}
            clients={clients}
            onManageStudios={() => setActiveTab("studios")}
            onOpenStudioTasks={onOpenStudioTasks}
            onNavigateProfile={onNavigateProfile}
          />
        )}
        {activeTab === "users" && (
          <AdminUserDirectory studios={studios} onRefresh={onRefresh} />
        )}
        {activeTab === "clients" && (
          <AdminSystemClients clients={clients} studios={studios} />
        )}
        {activeTab === "studios" && (
          <AdminStudioManager
            authTrainer={authTrainer}
            studios={studios}
            networks={networks}
            trainers={trainers}
            isAdmin={isAdmin}
            onRefresh={onRefresh}
          />
        )}
        {activeTab === "machines" && (
          <AdminMachinesTab
            studios={studios}
            authTrainer={authTrainer}
            isAdmin={isAdmin}
          />
        )}
        {activeTab === "routines" && (
          <AdminRoutineTemplatesTab
            studios={studios}
            authTrainer={authTrainer}
            isAdmin={isAdmin}
          />
        )}
        {activeTab === "insights" && (
          <div className="bg-slate-50 dark:bg-slate-950 p-0 rounded-2xl overflow-hidden">
            <InsightsDashboardView
              clients={clients}
              trainers={trainers}
              machines={machines}
              sessions={sessions}
              newClientsCount={newClientsCount}
              onShowNewClients={onShowNewClients}
            />
          </div>
        )}
        {/* "retention" tab removed — see the commented import at the top. */}
        {activeTab === "mindbody" && (
          <div className="bg-slate-50 dark:bg-slate-950 p-0 rounded-2xl overflow-hidden">
            <MindbodyDashboard />
          </div>
        )}
        {activeTab === "announcements" && (
          <AdminHubAnnouncements studios={studios} authTrainer={authTrainer} />
        )}
        {activeTab === "limbo" && (
          <AdminLimboQueue studios={studios} clients={clients} />
        )}
        {activeTab === "integrations" && (
          <IntegrationsHubView
            authTrainer={authTrainer}
            activeStudioId={activeStudioId}
            studios={studios}
            trainers={trainers}
            clients={clients}
            onBack={() => setActiveTab("mindbody")}
          />
        )}

        {activeTab === "data" && (
          <AdminDataReportsTab
            trainers={trainers}
            clients={clients}
            studios={studios}
            machines={machines}
            activeStudioId={activeStudioId}
            authTrainer={authTrainer}
          />
        )}

        {activeTab === "bugs" && <AdminBugReports />}

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
