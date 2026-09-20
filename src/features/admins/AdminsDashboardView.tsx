/**
 * THE ADMINS DASHBOARD — where the app is managed.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): Operations is split in two.
 * Operations is the studio-management area, always one studio; this is
 * everything corporate-only — the standard template, the master catalog,
 * cross-location views, system tooling — "and this will not be accessed by
 * anyone other than admins access accounts and the owner of MSF."
 *
 * Who admins are: corporate staff of Max Strength — people assisting
 * studios with start-up or supporting existing studios. They may not be
 * trainers, and they are not studio owners (franchisees); admins sit above
 * them. Full access, not scoped, not time-limited; admins can promote
 * other admins; a new studio — the Mindbody id and the machines — is set
 * up here before it is handed to its leader. Admins work one studio at a
 * time for now too.
 *
 * Seven tabs: All locations · Catalog · Standard template · Limbo ·
 * System tools · Bug reports · Data. Each is the screen it was on
 * Operations (features/admin/…), moved, not rewritten; the standard
 * template is the standard set beside the company routines, the two things
 * a new studio adopts in one step. The third position on the app-mode
 * switch (Trainer · Operations · Admin), administrators and the founder.
 */
import { useState, type ReactNode } from "react";
import { Bug, Building2, ClipboardList, Database, Download, Dumbbell, Inbox, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client, FranchiseNetwork, Machine, Studio, Trainer } from "../../types";
import { AdminStudiosTab } from "../admin/studios/AdminStudiosTab";
import { AdminMachinesTab } from "../admin/machines/AdminMachinesTab";
import { AdminLimboQueue } from "../admin/limbo/AdminLimboQueue";
import { AdminSystemToolsTab } from "../admin/system/AdminSystemToolsTab";
import { AdminBugReportsTab } from "../admin/bugs/AdminBugReportsTab";
import { AdminDataReportsTab } from "../admin/data";
import { AdminField, AdminNotice, AdminSelect } from "../admin/primitives";
import { StandardTemplateTab } from "./StandardTemplateTab";
import "../admin/admin.css";

export interface AdminsDashboardViewProps {
  authTrainer: Trainer;
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  clients: Client[];
  machines: Machine[];
  isAdmin: boolean;
  activeStudioId: string | null;
  onRefresh?: (collectionName: "studios" | "networks" | "trainers") => Promise<void>;
  onRestoreMachines?: () => void;
  onReorderTrainers?: () => void;
  onAppCleanse?: () => void;
}

export type AdminsTab = "locations" | "catalog" | "template" | "limbo" | "system" | "bugs" | "data";

const TABS: Array<{ id: AdminsTab; label: string; icon: ReactNode; group: "standard" | "tools" }> = [
  { id: "locations", label: "All locations", icon: <Building2 className="w-4 h-4" />, group: "standard" },
  { id: "catalog", label: "Catalog", icon: <Dumbbell className="w-4 h-4" />, group: "standard" },
  { id: "template", label: "Standard template", icon: <ClipboardList className="w-4 h-4" />, group: "standard" },
  { id: "limbo", label: "Limbo", icon: <Inbox className="w-4 h-4" />, group: "tools" },
  { id: "system", label: "System tools", icon: <Database className="w-4 h-4" />, group: "tools" },
  { id: "bugs", label: "Bug reports", icon: <Bug className="w-4 h-4" />, group: "tools" },
  { id: "data", label: "Data", icon: <Download className="w-4 h-4" />, group: "tools" },
];

const GROUP_LABEL = { standard: "The MSF standard", tools: "The machinery" } as const;

export function AdminsDashboardView({ authTrainer, studios, networks, trainers, clients, machines, isAdmin, activeStudioId, onRefresh, onRestoreMachines, onReorderTrainers, onAppCleanse }: AdminsDashboardViewProps) {
  void machines;
  const [tab, setTab] = useState<AdminsTab>("locations");
  const [dataStudioId, setDataStudioId] = useState<string | null>(activeStudioId);

  if (!isAdmin) {
    return (
      <div className="adm adm-shell">
        <div className="adm-shell__main">
          <AdminNotice tone="warn">The Admins dashboard is for administrators and the founder. Operations is where a studio is run.</AdminNotice>
        </div>
      </div>
    );
  }

  const button = (t: (typeof TABS)[number], orientation: "sidebar" | "strip") => (
    <button
      key={t.id}
      type="button"
      onClick={() => setTab(t.id)}
      aria-current={tab === t.id ? "page" : undefined}
      className={cn(
        "adm adm-nav__btn flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer select-none whitespace-nowrap",
        tab === t.id && "adm-nav__btn--active",
        orientation === "sidebar" ? "w-full h-10 px-3 border-l-2 text-left" : "h-11 px-3 border-b-2 shrink-0",
      )}
    >
      <span className="adm-nav__icon">{t.icon}</span>
      {t.label}
    </button>
  );
  const groups = (["standard", "tools"] as const).map((g) => ({ id: g, label: GROUP_LABEL[g], tabs: TABS.filter((t) => t.group === g) }));

  return (
    <div className="adm adm-shell" data-testid="admins-dashboard">
      <aside className="adm-shell__side">
        <div className="adm-shell__group">
          <div className="adm-nav__group flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Admin
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.id} className="adm-shell__group adm-shell__group--spaced">
            <div className="adm-nav__group">{g.label}</div>
            <div className="flex flex-col">{g.tabs.map((t) => button(t, "sidebar"))}</div>
          </div>
        ))}
      </aside>

      <div className="adm-shell__strip">
        <div className="adm-shell__striprow">
          {groups.map((g, i) => (
            <div key={g.id} className={cn("adm-shell__stripgroup", i > 0 && "adm-shell__stripgroup--divided")}>
              <span className="adm-nav__group adm-shell__striplabel">{g.label}</span>
              <div className="flex">{g.tabs.map((t) => button(t, "strip"))}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="adm-shell__main">
        {tab === "locations" && <AdminStudiosTab authTrainer={authTrainer} studios={studios} networks={networks} trainers={trainers} clients={clients} isAdmin={isAdmin} onRefresh={onRefresh} />}
        {tab === "catalog" && <AdminMachinesTab isAdmin={isAdmin} />}
        {tab === "template" && <StandardTemplateTab authTrainer={authTrainer} studios={studios} activeStudioId={activeStudioId} isAdmin={isAdmin} />}
        {tab === "limbo" && <AdminLimboQueue studios={studios} clients={clients} />}
        {tab === "system" && <AdminSystemToolsTab onRestoreMachines={onRestoreMachines} onReorderTrainers={onReorderTrainers} onAppCleanse={onAppCleanse} />}
        {tab === "bugs" && <AdminBugReportsTab studios={studios} />}
        {tab === "data" && (
          <div className="flex flex-col gap-4">
            {/* Data is scoped by who is viewing (AJ): a studio exports its own
                on Operations; an administrator picks any studio here. The
                detail is still to be workshopped. */}
            <AdminField label="Studio" hint="An administrator exports any studio's data; a studio exports its own from Operations → Data.">
              <AdminSelect value={dataStudioId ?? ""} onChange={(e) => setDataStudioId(e.target.value || null)} aria-label="Studio">
                <option value="">Choose a studio…</option>
                {studios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            {dataStudioId ? (
              <AdminDataReportsTab key={dataStudioId} trainers={trainers} clients={clients} studios={studios} activeStudioId={dataStudioId} />
            ) : (
              <AdminNotice tone="info">Choose a studio to export its data.</AdminNotice>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
