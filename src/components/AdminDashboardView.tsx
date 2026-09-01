import React, { useState } from "react";
import { Trainer, Studio, FranchiseNetwork, Client, WorkoutSession, Machine } from "../types";
import { AdminMetricsDashboard } from "./AdminMetricsDashboard";
import { AdminStudioManager } from "./AdminStudioManager";
import { AdminUserDirectory } from "./AdminUserDirectory";
import { AdminBugReports } from "./AdminBugReports";
import { AdminHubAnnouncements } from "./AdminHubAnnouncements";
import { InsightsDashboardView } from "./InsightsDashboardView";
import { RetentionDashboardView } from "./RetentionDashboardView";
import { MindbodyDashboard } from "./mindbody/MindbodyDashboard";
import { AdminLimboQueue } from "./AdminLimboQueue";
import { Bug, Megaphone, Activity, Users, Building2, TrendingUp, ShieldAlert, Zap, CreditCard, Inbox } from "lucide-react";

import { AdminSystemClients } from "./AdminSystemClients";

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
  newClientsCount?: number;
  onShowNewClients?: () => void;
  onUpdateStudio?: (id: string, updates: Partial<Studio>) => Promise<void>;
  onUpdateClient?: (id: string, updates: Partial<Client>) => Promise<void>;
  onNavigateProfile?: (clientId: string) => void;
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
  newClientsCount = 0,
  onShowNewClients,
  onUpdateStudio,
  onUpdateClient,
  onNavigateProfile,
}: Props) {
  const [activeTab, setActiveTab] = useState<
    "metrics" | "users" | "studios" | "clients" | "announcements" | "bugs" | "insights" | "retention" | "mindbody" | "limbo"
  >("metrics");

  const isFranchiseOwnerOrAdmin = isAdmin || authTrainer?.role === "FranchiseOwner" || authTrainer?.role === "Owner";

  const allTabs = [
    {
      id: "metrics",
      label: "Overview",
      icon: <Activity className="w-4 h-4" />,
    },
    {
      id: "users",
      label: "Staff & Roles",
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: "clients",
      label: "System Clients",
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: "studios",
      label: "Studios",
      icon: <Building2 className="w-4 h-4" />,
    },
    {
      id: "insights",
      label: "Insights",
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      id: "retention",
      label: "Retention",
      icon: <ShieldAlert className="w-4 h-4" />,
    },
    {
      id: "mindbody",
      label: "Mindbody",
      icon: <Zap className="w-4 h-4" />,
    },
    {
      id: "limbo",
      label: "Limbo",
      icon: <Inbox className="w-4 h-4" />,
    },
    {
      id: "announcements",
      label: "Announcements",
      icon: <Megaphone className="w-4 h-4" />,
    },
    { id: "bugs", label: "Bug Reports", icon: <Bug className="w-4 h-4" /> },
  ];

  const tabs = allTabs.filter(tab => {
    if (tab.id === "users") return isFranchiseOwnerOrAdmin;
    if (tab.id === "mindbody") return isAdmin;
    // Releasing a booking assigns it to a studio, so this is admin-only for the
    // same reason studio management is.
    if (tab.id === "limbo") return isAdmin;
    if (tab.id === "bugs") return isAdmin;
    if (tab.id === "announcements") return isFranchiseOwnerOrAdmin;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-6 animate-fade-in text-slate-900 dark:text-slate-100">
      <div className="flex overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible bg-slate-100 dark:bg-slate-900 rounded-2xl p-1.5 mb-6 gap-1 shadow-sm border border-slate-200/60 dark:border-slate-800">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 md:shrink cursor-pointer select-none ${
                isActive
                  ? "bg-white dark:bg-slate-800 text-[#F06C22] dark:text-[#F06C22] shadow-sm border border-slate-200/80 dark:border-slate-700 font-black"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 font-bold"
              }`}
            >
              <span className={isActive ? "text-[#F06C22]" : "text-slate-400 dark:text-slate-500"}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {activeTab === "metrics" && (
          <AdminMetricsDashboard
            onManageStudios={() => setActiveTab("studios")}
            clients={clients}
            networks={networks}
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
        {activeTab === "insights" && (
          <div className="bg-slate-50 dark:bg-slate-950 p-0 -mx-4 md:-mx-6 -mt-6">
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
        {activeTab === "retention" && (
          <div className="bg-slate-50 dark:bg-slate-950 p-0 -mx-4 md:-mx-6 -mt-6">
            <RetentionDashboardView
              clients={clients}
              sessions={sessions}
              trainers={trainers}
              studio={studios.find(s => s.id === authTrainer?.primaryHomeStudioId)}
              authTrainer={authTrainer}
              onClose={() => setActiveTab("metrics")}
              onUpdateStudio={onUpdateStudio as any}
              onUpdateClient={onUpdateClient as any}
              onNavigateProfile={onNavigateProfile as any}
            />
          </div>
        )}
        {activeTab === "mindbody" && (
          <div className="bg-slate-50 dark:bg-slate-950 p-0 -mx-4 md:-mx-6 -mt-6">
            <MindbodyDashboard />
          </div>
        )}
        {activeTab === "announcements" && (
          <AdminHubAnnouncements studios={studios} authTrainer={authTrainer} />
        )}
        {activeTab === "limbo" && (
          <AdminLimboQueue studios={studios} clients={clients} />
        )}
        {activeTab === "bugs" && <AdminBugReports />}
      </div>
    </div>
  );
}
