/**
 * Operations → Renewals.
 *
 * Round: Renewals (Sep 2026). See OPERATIONS-RENEWALS-PROPOSAL.md §4.2 and
 * docs/business/renewals.md. This first version holds the studio's renewal
 * settings; the pipeline arrives in a later phase of the same round.
 *
 * One studio at a time — the studio the dashboard is working in, or, for
 * someone who runs several, the one picked here. Every leader sees their own
 * studio's numbers; franchise owners and administrators can pick any.
 */

import React, { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import type { Studio, Trainer } from "../../../types";
import { AdminHeader, AdminNotice, AdminScreen, AdminSelect } from "../primitives";
import { RenewalSettingsPanel } from "./RenewalSettingsPanel";
import { canManageRenewals } from "../../renewals/permissions";
import { useRenewalNamesSeen, useRenewalSettings } from "../../renewals/useRenewalSettings";

export interface AdminRenewalsTabProps {
  authTrainer: Trainer;
  studios: Studio[];
  activeStudioId: string | null;
}

export function AdminRenewalsTab({ authTrainer, studios, activeStudioId }: AdminRenewalsTabProps) {
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
              onChange={(e) => setPicked(e.target.value || null)}
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
          {error && <AdminNotice tone="warn">{error}</AdminNotice>}
          {!loading && (
            <RenewalSettingsPanel
              key={studioId}
              studioId={studioId}
              studioName={studio.name}
              settings={settings}
              saved={saved}
              namesSeen={namesSeen}
              canEdit={canManageRenewals(authTrainer, studioId)}
            />
          )}
        </>
      )}
    </AdminScreen>
  );
}
