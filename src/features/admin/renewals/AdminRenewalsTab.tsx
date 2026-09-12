/**
 * Operations → Renewals.
 *
 * Round: Renewals (Sep 2026). See OPERATIONS-RENEWALS-PROPOSAL.md §4.2 and
 * docs/business/renewals.md. Three views of one studio: the Pipeline (who is
 * coming up, and what to do next — tap anyone for their Renewal Brief),
 * Outcomes (what happened to the packages that closed, by package, trainer
 * and studio) and the studio's Settings (when to talk, the package table,
 * name matching).
 *
 * One studio at a time — the studio the dashboard is working in, or, for
 * someone who runs several, the one picked here. Every leader sees their own
 * studio's numbers; franchise owners and administrators can pick any.
 */

import React, { useMemo, useState } from "react";
import { BarChart3, CalendarClock, ListChecks, SlidersHorizontal } from "lucide-react";
import type { Client, Machine, Studio, Trainer } from "../../../types";
import { AdminHeader, AdminNotice, AdminScreen, AdminSelect } from "../primitives";
import { RenewalSettingsPanel } from "./RenewalSettingsPanel";
import { RenewalsPipeline } from "./RenewalsPipeline";
import { RenewalBrief } from "./RenewalBrief";
import { RenewalOutcomesPanel } from "./RenewalOutcomesPanel";
import { canManageRenewals, leadsStudio, worksAt } from "../../renewals/permissions";
import { useRenewalNamesSeen, useRenewalSettings } from "../../renewals/useRenewalSettings";
import { buildPackageNameIndex } from "../../renewals/settings";
import { unmatchedNames } from "../../renewals/job-plan";

export interface AdminRenewalsTabProps {
  authTrainer: Trainer;
  studios: Studio[];
  activeStudioId: string | null;
  /** Everyone on staff: who can lead a conversation, and names in the Brief. */
  trainers: Trainer[];
  /** Machine names for the Brief's strength lines. */
  machines: Machine[];
}

type RenewalsView = "pipeline" | "outcomes" | "settings";

export function AdminRenewalsTab({ authTrainer, studios, activeStudioId, trainers, machines }: AdminRenewalsTabProps) {
  const manageable = useMemo(
    () => studios.filter((s) => s.id && canManageRenewals(authTrainer, s.id)),
    [studios, authTrainer],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const studioId =
    picked ??
    (activeStudioId && manageable.some((s) => s.id === activeStudioId)
      ? activeStudioId
      : manageable[0]?.id ?? null);
  const studio = studios.find((s) => s.id === studioId) ?? null;

  const { settings, saved, loading, error } = useRenewalSettings(studioId);
  const namesSeen = useRenewalNamesSeen(studioId);
  const [view, setView] = useState<RenewalsView>("pipeline");
  // Mindbody names the package table doesn't recognize yet: those clients
  // can't be placed, so the Settings switch says how many are waiting.
  const toMatch = useMemo(
    () => (namesSeen ? unmatchedNames(namesSeen.names ?? {}, buildPackageNameIndex(settings)).length : 0),
    [namesSeen, settings],
  );
  // The Brief keeps the client as it was when opened; its own numbers are
  // worked out live (useLiveRenewal), so nothing on it goes stale.
  const [briefClient, setBriefClient] = useState<Client | null>(null);

  // Who can be put in charge of a conversation here: anyone who works at or
  // leads this studio, minus profiles that were merged into another one.
  const studioTrainers = useMemo(
    () =>
      trainers
        .filter((t) => t.id && !t.supersededByUid && (worksAt(t, studioId) || leadsStudio(t, studioId)))
        .sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? "")),
    [trainers, studioId],
  );

  const pickStudio = (id: string | null) => {
    setPicked(id);
    setBriefClient(null);
  };

  return (
    <AdminScreen>
      <AdminHeader
        icon={<CalendarClock className="w-5 h-5" />}
        title="Renewals"
        subtitle="Get ahead of renewals: who is coming up, and when your studio starts the conversation."
        actions={
          manageable.length > 1 ? (
            <AdminSelect
              aria-label="Studio"
              value={studioId ?? ""}
              onChange={(e) => pickStudio(e.target.value || null)}
            >
              {manageable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </AdminSelect>
          ) : undefined
        }
      />

      {!studio || !studioId ? (
        <AdminNotice tone="info">
          Renewals are run by each studio's leaders. Your account doesn't lead a studio yet.
        </AdminNotice>
      ) : (
        <>
          <div className="adm-segmented" role="tablist" aria-label="Renewals view">
            <button
              type="button"
              role="tab"
              className="adm-seg"
              aria-selected={view === "pipeline"}
              onClick={() => setView("pipeline")}
            >
              <ListChecks className="w-3.5 h-3.5" />
              Pipeline
            </button>
            <button
              type="button"
              role="tab"
              className="adm-seg"
              aria-selected={view === "outcomes"}
              onClick={() => setView("outcomes")}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Outcomes
            </button>
            <button
              type="button"
              role="tab"
              className="adm-seg"
              aria-selected={view === "settings"}
              onClick={() => setView("settings")}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Settings
              {toMatch > 0 ? ` · ${toMatch} to match` : ""}
            </button>
          </div>

          {error && <AdminNotice tone="warn">{error}</AdminNotice>}
          {/* Both views stay mounted, so unsaved settings survive a look at
              the pipeline and the pipeline keeps its filter. */}
          {!loading && (
            <div hidden={view !== "pipeline"}>
              <RenewalsPipeline
                key={studioId}
                studioId={studioId}
                studioName={studio.name}
                settings={settings}
                onOpenBrief={setBriefClient}
              />
            </div>
          )}
          {!loading && view === "outcomes" && (
            <RenewalOutcomesPanel
              key={studioId}
              studioId={studioId}
              settings={settings}
              studios={manageable}
              trainers={trainers}
            />
          )}
          {!loading && (
            <div hidden={view !== "settings"}>
              <RenewalSettingsPanel
                key={studioId}
                studioId={studioId}
                studioName={studio.name}
                settings={settings}
                saved={saved}
                namesSeen={namesSeen}
                canEdit={canManageRenewals(authTrainer, studioId)}
              />
            </div>
          )}

          {briefClient && (
            <RenewalBrief
              key={briefClient.id}
              client={briefClient}
              studioTrainers={studioTrainers}
              trainers={trainers}
              machines={machines}
              authTrainer={authTrainer}
              canManage={canManageRenewals(authTrainer, studioId)}
              onClose={() => setBriefClient(null)}
            />
          )}
        </>
      )}
    </AdminScreen>
  );
}
