import React, { useMemo, useState } from "react";
import { Building2, Dumbbell, Info } from "lucide-react";
import { Studio, Trainer } from "../../types";
import { AdminMachineCreator } from "./AdminMachineCreator";
import { StudioInventoryManager } from "./StudioInventoryManager";

/**
 * MACHINES — the admin hub's equipment section.
 *
 * Round: Machine Creator & Studio Roster, Sep 2026.
 *
 * Two sub-tabs, matching the two layers of the model:
 *
 *   Catalog          the global default set every studio picks from.
 *                    Admin-write only (isSuperAdmin in firestore.rules).
 *
 *   Studio Equipment what ONE location actually has. Writes go to
 *                    studios/{studioId}/roster/{machineId}, which the rules
 *                    scope to that studio's owners and leaders, plus admins.
 *
 * The studio picker here is deliberately explicit rather than following the
 * active-studio switcher: an admin editing equipment needs to see which
 * location they are changing, and a mis-click at 100 studios is expensive.
 */

type SubTab = "catalog" | "inventory";

export function AdminMachinesTab({
  studios,
  authTrainer,
  isAdmin,
}: {
  studios: Studio[];
  authTrainer?: Trainer | null;
  isAdmin: boolean;
}) {
  const [subTab, setSubTab] = useState<SubTab>("catalog");

  const sortedStudios = useMemo(
    () => [...studios].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [studios],
  );

  // Derived rather than synced through an effect: the studio list arrives
  // asynchronously, and a state-sync effect would either fire on every render
  // (the sorted array is a new reference each time) or strand the picker empty
  // on the render where studios first land.
  const [pickedStudioId, setPickedStudioId] = useState<string | null>(null);
  const home = authTrainer?.primaryHomeStudioId;
  const fallbackStudioId =
    (home && sortedStudios.some((s) => s.id === home) ? home : null) ??
    sortedStudios[0]?.id ??
    null;
  const studioId = pickedStudioId ?? fallbackStudioId;
  const setStudioId = setPickedStudioId;

  const selectedStudio = sortedStudios.find((s) => s.id === studioId);

  const subTabs: Array<{ id: SubTab; label: string; icon: React.ReactNode }> = [
    { id: "catalog", label: "Catalog", icon: <Dumbbell className="h-4 w-4" /> },
    { id: "inventory", label: "Studio Equipment", icon: <Building2 className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-xl border border-slate-200/60 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          {subTabs.map((t) => {
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all sm:text-[11px] ${
                  active
                    ? "border border-slate-200/80 bg-white text-[#F06C22] shadow-sm dark:border-slate-700 dark:bg-slate-800"
                    : "font-bold text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
                }`}
              >
                <span className={active ? "text-[#F06C22]" : "text-slate-400 dark:text-slate-500"}>
                  {t.icon}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>

        {subTab === "inventory" && sortedStudios.length > 0 && (
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            value={studioId ?? ""}
            onChange={(e) => setStudioId(e.target.value || null)}
            aria-label="Studio"
          >
            {sortedStudios.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {subTab === "catalog" && (
        <div className="flex flex-col gap-4">
          {!isAdmin && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                The catalog is the shared default set for every location, so writes are
                limited to admins. You can review it here; to change what your own studio
                runs, use <strong>Studio Equipment</strong>.
              </p>
            </div>
          )}
          <AdminMachineCreator />
        </div>
      )}

      {subTab === "inventory" && (
        <StudioInventoryManager
          studioId={studioId}
          studioName={selectedStudio?.name}
        />
      )}
    </div>
  );
}
