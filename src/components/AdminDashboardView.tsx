import React, { useState } from "react";
import { Trainer, Studio, FranchiseNetwork } from "../types";
import { AdminMetricsDashboard } from "./AdminMetricsDashboard";
import { AdminStudioManager } from "./AdminStudioManager";
import { AdminUserDirectory } from "./AdminUserDirectory";
import { AdminBugReports } from "./AdminBugReports";
import { AdminHubAnnouncements } from "./AdminHubAnnouncements";
import { Bug, Megaphone, Activity, Users, Building2 } from "lucide-react";

interface Props {
  authTrainer: Trainer;
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  isAdmin: boolean;
  onRefresh?: (
    collectionName: "studios" | "networks" | "trainers",
  ) => Promise<void>;
}

export function AdminDashboardView({
  authTrainer,
  studios,
  networks,
  trainers,
  isAdmin,
  onRefresh,
}: Props) {
  const [activeTab, setActiveTab] = useState<
    "metrics" | "users" | "studios" | "announcements" | "bugs"
  >("metrics");

  const tabs = [
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
      id: "studios",
      label: "Franchises",
      icon: <Building2 className="w-4 h-4" />,
    },
    {
      id: "announcements",
      label: "Announcements",
      icon: <Megaphone className="w-4 h-4" />,
    },
    { id: "bugs", label: "Bug Reports", icon: <Bug className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 animate-fade-in text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap bg-slate-100 dark:bg-slate-900 rounded-2xl p-1 mb-8 w-fit gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id
                ? "bg-white dark:bg-slate-800 text-indigo-500 shadow-sm"
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
          />
        )}
        {activeTab === "users" && (
          <AdminUserDirectory studios={studios} onRefresh={onRefresh} />
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
        {activeTab === "announcements" && (
          <AdminHubAnnouncements studios={studios} authTrainer={authTrainer} />
        )}
        {activeTab === "bugs" && <AdminBugReports />}
      </div>
    </div>
  );
}
