/**
 * Operations → Renewals.
 *
 * Round: Renewals (Sep 2026). See OPERATIONS-RENEWALS-PROPOSAL.md §4.2 and
 * docs/business/renewals.md. Two views of one studio: the Pipeline (who is
 * coming up, and what to do next — tap anyone for their Renewal Brief) and
 * Outcomes (what happened to the packages that closed, by package, trainer
 * and studio). The studio's Settings (when to talk, the package table, name
 * matching) were a third view here until the Operations round (Sep 2026):
 * "My Studio is where you run the studio; Operations is where you look at
 * it" (AJ, Sep 18), so they are on My Studio → Studio only, and this screen
 * points there — with the count of Mindbody package names still waiting to
 * be matched, because that is the one settings fact a pipeline reader needs
 * to know about.
 *
 * One studio at a time — the studio the dashboard is working in, or, for
 * someone who runs several, the one picked here. Every leader sees their own
 * studio's numbers; franchise owners and administrators can pick any.
 */

import { useMemo, useState } from "react";
import { BarChart3, CalendarClock, ListChecks, SlidersHorizontal } from "lucide-react";
import type { Client, Machine, Studio, Trainer } from "../../../types";
import { AdminButton, AdminHeader, AdminNotice, AdminScreen } from "../primitives";
import { PickOneStudio, useOperationsScope } from "../scope-context";
import { RenewalsPipeline } from "./RenewalsPipeline";
import { RenewalBrief } from "./RenewalBrief";
import { RenewalOutcomesPanel } from "./RenewalOutcomesPanel";
import { canManageRenewals, leadsStudio, worksAt } from "../../renewals/permissions";
import { useRenewalNamesSeen, useRenewalSettings } from "../../renewals/useRenewalSettings";
import { buildPackageNameIndex } from "../../renewals/settings";
import { unmatchedNames } from "../../renewals/job-plan";
import type { RosterStatus } from "../../../hooks/useStudioRoster";

export interface AdminRenewalsTabProps {
  authTrainer: Trainer;
  studios: Studio[];
  activeStudioId: string | null;
  /** Everyone on staff: who can lead a conversation, and names in the Brief. */
  trainers: Trainer[];
  /** Machine names for the Brief's strength lines. */
  machines: Machine[];
  /** Opens My Studio → Studio, where the settings live. */
  onOpenMyStudio?: () => void;
  /** The studio's roster the app already holds, and its read: the pipeline's Running low counts from it. */
  roster?: Client[];
  rosterStatus?: RosterStatus;
}

type RenewalsView = "pipeline" | "outcomes";

export function AdminRenewalsTab({ authTrainer, studios, activeStudioId, trainers, machines, onOpenMyStudio, roster, rosterStatus }: AdminRenewalsTabProps) {
  const manageable = useMemo(
    () => studios.filter((s) => s.id && canManageRenewals(authTrainer, s.id)),
    [studios, authTrainer],
  );
  // The Operations scope decides the studio (Operations round, Sep 2026):
  // the studio the app is in, when the reader runs it. "All my studios" is
  // a prompt — a pipeline is one studio's.
  const ops = useOperationsScope();
  const studioId = activeStudioId && manageable.some((s) => s.id === activeStudioId) ? activeStudioId : null;
  const studio = studios.find((s) => s.id === studioId) ?? null;

  const { settings, loading, error, forStudioId } = useRenewalSettings(studioId);
  const namesSeen = useRenewalNamesSeen(studioId);
  const [view, setView] = useState<RenewalsView>("pipeline");
  // Mindbody names the package table doesn't recognize yet: those clients
  // can't be placed, so the pointer to the settings says how many are waiting.
  const toMatch = useMemo(
    () => (namesSeen ? unmatchedNames(namesSeen.names ?? {}, buildPackageNameIndex(settings)).length : 0),
    [namesSeen, settings],
  );
  // A studio that hasn't answered whether its packages renew reads as ON (AJ,
  // Sep 25 2026: on by default, off at the corporate studios). Said here, as
  // a door to My Studio → Studio → Renewals — the one editor of the answer.
  // Never while the read is loading or failed: unknown is not "unanswered".
  const autoRenewUnanswered =
    !loading && !error && forStudioId === studioId && settings.packagesRenewAutomatically === undefined;
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

  return (
    <AdminScreen>
      <AdminHeader
        icon={<CalendarClock className="w-5 h-5" />}
        title="Renewals"
        actions={
          onOpenMyStudio && ops.scope.kind !== "all" && studio && studioId ? (
            <AdminButton size="sm" variant="quiet" onClick={onOpenMyStudio}>
              <SlidersHorizontal className="w-4 h-4" aria-hidden /> Settings on My Studio
            </AdminButton>
          ) : undefined
        }
      />

      {ops.scope.kind === "all" ? (
        <PickOneStudio what="Renewals" />
      ) : !studio || !studioId ? (
        <AdminNotice tone="info">
          {manageable.length === 0
            ? "Renewals are run by each studio's leaders. Your account doesn't lead a studio yet."
            : "Renewals are run by each studio's leaders. Switch to a studio you run to see its pipeline."}
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
          </div>

          {/* The calm round (Oct 3 2026): only when a setting is waiting; where the settings live is the header's door. */}
          {(toMatch > 0 || autoRenewUnanswered) && (
            <AdminNotice tone="warn">
              <SlidersHorizontal className="w-4 h-4 shrink-0" />
              <div className="flex-1">
                {autoRenewUnanswered ? `${studio.name} hasn't said whether its packages renew automatically, so they read as renewing. ` : ""}
                {toMatch > 0
                  ? `${toMatch} Mindbody package name${toMatch === 1 ? "" : "s"} ${toMatch === 1 ? "is" : "are"} waiting to be matched, so those clients can't be placed. `
                  : ""}
                Set on <b>My Studio → Studio</b>.
              </div>
            </AdminNotice>
          )}

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
                roster={roster}
                rosterStatus={rosterStatus}
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
              studios={studios}
            />
          )}
        </>
      )}
    </AdminScreen>
  );
}
