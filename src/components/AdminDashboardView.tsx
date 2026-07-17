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
import { Bug, Megaphone, Activity, Users, Building2, TrendingUp, ShieldAlert, Zap, CreditCard } from "lucide-react";

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
    "metrics" | "users" | "studios" | "clients" | "announcements" | "bugs" | "insights" | "retention" | "mindbody"
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
      id: "announcements",
      label: "Announcements",
      icon: <Megaphone className="w-4 h-4" />,
    },
    { id: "bugs", label: "Bug Reports", icon: <Bug className="w-4 h-4" /> },
  ];

  const tabs = allTabs.filter(tab => {
    if (tab.id === "users") return isFranchiseOwnerOrAdmin;
    if (tab.id === "mindbody") return isAdmin;
    if (tab.id === "bugs") return isAdmin;
    if (tab.id === "announcements") return isFranchiseOwnerOrAdmin;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 animate-fade-in text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap bg-slate-100 dark:bg-slate-900 rounded-2xl p-1 mb-8 w-fit gap-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
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
        {activeTab === "bugs" && <AdminBugReports />}
      </div>
    </div>
  );
}
