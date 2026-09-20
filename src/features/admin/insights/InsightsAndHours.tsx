/**
 * OPERATIONS → INSIGHTS — what stands out, and the hours.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): Hours folds into Insights —
 * both are "somewhere you go on purpose", read a few times a month, not a
 * daily glance. One tab, two views on a segmented control; each view is
 * the screen it was (insights/AdminInsightsTab, hours/AdminHoursTab).
 */
import { useState } from "react";
import { Clock3, TrendingUp } from "lucide-react";
import type { Studio, Trainer } from "../../../types";
import { AdminHoursTab } from "../hours/AdminHoursTab";
import { AdminInsightsTab } from "./AdminInsightsTab";

export type InsightsView = "insights" | "hours";

export interface InsightsAndHoursProps {
  studios: Studio[];
  trainers: Trainer[];
  activeStudioId: string | null;
  initialView?: InsightsView;
}

export function InsightsAndHours({ studios, trainers, activeStudioId, initialView = "insights" }: InsightsAndHoursProps) {
  const [view, setView] = useState<InsightsView>(initialView);
  return (
    <div className="flex flex-col gap-4">
      <div className="adm-segmented self-start" role="tablist" aria-label="Insights view">
        <button type="button" role="tab" className="adm-seg" aria-selected={view === "insights"} onClick={() => setView("insights")}>
          <TrendingUp className="w-3.5 h-3.5" />
          What stands out
        </button>
        <button type="button" role="tab" className="adm-seg" aria-selected={view === "hours"} onClick={() => setView("hours")}>
          <Clock3 className="w-3.5 h-3.5" />
          Hours
        </button>
      </div>
      {view === "insights" ? <AdminInsightsTab studios={studios} trainers={trainers} activeStudioId={activeStudioId} /> : <AdminHoursTab trainers={trainers} />}
    </div>
  );
}
