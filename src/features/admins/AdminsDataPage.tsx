/**
 * ADMINS → DATA — any studio's exports, for an administrator.
 *
 * Moved out of the dashboard's shell in the Admins room (Sep 28 2026),
 * unchanged: Data is scoped by who is viewing (AJ, Sep 19). A studio exports
 * its own on Operations → Data; an administrator picks any studio here. The
 * detail is still to be workshopped with AJ.
 */
import { useState } from "react";
import type { Client, Studio, Trainer } from "../../types";
import { AdminDataReportsTab } from "../admin/data";
import { AdminField, AdminNotice, AdminSelect } from "../admin/primitives";

export interface AdminsDataPageProps {
  studios: Studio[];
  trainers: Trainer[];
  clients: Client[];
  activeStudioId: string | null;
}

export function AdminsDataPage({ studios, trainers, clients, activeStudioId }: AdminsDataPageProps) {
  const [studioId, setStudioId] = useState<string | null>(activeStudioId);
  return (
    <div className="flex flex-col gap-4">
      <AdminField label="Studio" hint="An administrator exports any studio's data; a studio exports its own from Operations → Data.">
        <AdminSelect value={studioId ?? ""} onChange={(e) => setStudioId(e.target.value || null)} aria-label="Studio">
          <option value="">Choose a studio…</option>
          {studios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </AdminSelect>
      </AdminField>
      {studioId ? (
        <AdminDataReportsTab key={studioId} trainers={trainers} clients={clients} studios={studios} activeStudioId={studioId} />
      ) : (
        <AdminNotice tone="info">Choose a studio to export its data.</AdminNotice>
      )}
    </div>
  );
}
