/**
 * One studio's settings.
 *
 * The screen this replaces read its values back out of `FormData` at save time
 * and wrote the whole studio object. Two fields — ownerId and headTrainerId —
 * had been removed from the JSX in an earlier round, and `formData.get()`
 * returns null for a field that is not there, so EVERY studio save wrote them
 * as null. It was also the only screen in the admin surface using uncontrolled
 * inputs, which is not a coincidence.
 *
 * This form is controlled, and useDirtyForm sends only the fields that changed
 * — so a field this panel does not render cannot be written by it at all.
 */

import React, { useState } from "react";
import { Link2, Trash2, Users } from "lucide-react";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";
import {
  AdminBadge,
  AdminButton,
  AdminField,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminSelect,
  ConfirmDialog,
} from "../primitives";
import { StudioEquipmentPanel } from "../equipment/StudioEquipmentPanel";
import { StudioDetailsForm, type StudioForm } from "./StudioDetailsForm";

// The details form itself moved to StudioDetailsForm in the My Studio round
// (Sep 2026) so My Studio → Studio edits the same fields the same way; these
// re-exports keep the Operations tab's imports where they were.
export { LINK_BADGE, studioToForm, type StudioForm } from "./StudioDetailsForm";

export interface StudioDetailPanelProps {
  studio: Studio;
  authTrainer?: Trainer | null;
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  clientCount: number | null;
  canDelete: boolean;
  onSave: (patch: Partial<StudioForm>) => Promise<void>;
  onDelete: () => Promise<void>;
  onChangeNetwork: (networkId: string | null) => Promise<void>;
}

export function StudioDetailPanel({
  studio,
  authTrainer,
  studios,
  networks,
  trainers,
  clientCount,
  canDelete,
  onSave,
  onDelete,
  onChangeNetwork,
}: StudioDetailPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const team = trainers.filter(
    (t) =>
      t.primaryHomeStudioId === studio.id ||
      t.accessibleStudioIds?.includes(studio.id ?? "") ||
      t.ownedStudioIds?.includes(studio.id ?? ""),
  );

  const network = networks.find((n) => n.id === studio.networkId) ?? null;

  return (
    <div className="adm-ov__stack">
      <StudioDetailsForm studio={studio} studios={studios} onSave={onSave} />

      <AdminPanel
        title="Franchise"
        icon={<Link2 className="w-3.5 h-3.5" />}
        subtitle="Which network this location belongs to. Changing it rewrites both sides of the link."
      >
        <AdminField label="Network">
          <AdminSelect
            value={studio.networkId ?? ""}
            onChange={(e) => void onChangeNetwork(e.target.value || null)}
          >
            <option value="">Independent — no network</option>
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
                {n.state ? ` · ${n.state}` : ""}
              </option>
            ))}
          </AdminSelect>
        </AdminField>
        {network && !(network.studioIds || []).includes(studio.id ?? "") && (
          <div className="mt-3">
            <AdminNotice tone="warn">
              {network.name} does not list this studio. Run the registry repair
              below to put both sides back in agreement.
            </AdminNotice>
          </div>
        )}
      </AdminPanel>

      <AdminPanel
        title="Team"
        icon={<Users className="w-3.5 h-3.5" />}
        subtitle="Everyone with access here. Roles are set in Staff & Roles, not from this screen."
        actions={
          <AdminBadge tone="neutral">
            {clientCount === null ? "—" : clientCount} active clients
          </AdminBadge>
        }
        flush
      >
        {team.length === 0 ? (
          <div className="p-4 text-sm" style={{ color: "var(--adm-ink-muted)" }}>
            Nobody is assigned to this studio yet.
          </div>
        ) : (
          <AdminRows>
            {team.map((t) => (
              <AdminRow
                key={t.id}
                name={t.fullName}
                meta={
                  t.primaryHomeStudioId === studio.id
                    ? "Home studio"
                    : "Cross-studio access"
                }
                trailing={
                  <AdminBadge tone={t.mindbodyStaffId ? "live" : "neutral"}>
                    {t.mindbodyStaffId ? "Mindbody linked" : "No staff ID"}
                  </AdminBadge>
                }
              />
            ))}
          </AdminRows>
        )}
      </AdminPanel>

      <StudioEquipmentPanel studio={studio} authTrainer={authTrainer} />

      {canDelete && (
        <AdminPanel title="Delete this studio">
          <AdminNotice tone="alert">
            Deleting removes the studio and takes it out of every franchise that
            lists it. Clients, sessions and schedules filed against it are NOT
            deleted and will have no studio to belong to.
          </AdminNotice>
          <div className="mt-3">
            <AdminButton variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="w-3.5 h-3.5" />
              Delete {studio.name}
            </AdminButton>
          </div>
        </AdminPanel>
      )}

      <ConfirmDialog
        open={confirmDelete}
        destructive
        busy={deleting}
        title={`Delete ${studio.name}?`}
        body="This cannot be undone. The studio is removed from every franchise network that lists it, so no orphaned references are left behind."
        confirmLabel="Delete studio"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await onDelete();
            setConfirmDelete(false);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}
