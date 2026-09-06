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

import React, { useMemo, useState } from "react";
import { Building2, Link2, Trash2, Users } from "lucide-react";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";
import {
  AdminBadge,
  AdminButton,
  AdminField,
  AdminGrid,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminSelect,
  ConfirmDialog,
  SaveBar,
} from "../primitives";
import { useDirtyForm } from "../useDirtyForm";
import { useMindbodyLocations } from "./useMindbodyLocations";
import {
  mindbodyLinkState,
  validateStudioIdentity,
  type MindbodyLinkState,
} from "./registry";

/** Timezones the studios actually operate in, plus room to grow. */
const TIME_ZONES = [
  { id: "America/New_York", label: "Eastern" },
  { id: "America/Chicago", label: "Central" },
  { id: "America/Denver", label: "Mountain" },
  { id: "America/Phoenix", label: "Arizona (no DST)" },
  { id: "America/Los_Angeles", label: "Pacific" },
];

export const LINK_BADGE: Record<
  MindbodyLinkState,
  { label: string; tone: "ok" | "warn" | "alert" | "neutral" }
> = {
  linked: { label: "Mindbody linked", tone: "ok" },
  "linked-shared": { label: "Linked · shared site", tone: "ok" },
  "needs-location": { label: "Needs a location", tone: "alert" },
  unlinked: { label: "Not linked", tone: "warn" },
};

/**
 * The document, flattened into form shape.
 *
 * Every field defaults to a string so the baseline and the draft are built the
 * same way — otherwise a studio with no phone number reports itself dirty the
 * moment it loads, and people learn to ignore the unsaved-changes warning.
 */
export interface StudioForm {
  name: string;
  contactEmail: string;
  phone: string;
  address: string;
  timezone: string;
  mindbodySiteId: string;
  mindbodyLocationId: string;
  locationType: string;
  brandColor: string;
}

export function studioToForm(studio: Studio): StudioForm {
  return {
    name: studio.name ?? "",
    contactEmail: studio.contactEmail ?? "",
    phone: studio.phone ?? "",
    address: studio.address ?? "",
    timezone: studio.timezone || "America/New_York",
    mindbodySiteId: studio.mindbodySiteId ? String(studio.mindbodySiteId) : "",
    mindbodyLocationId:
      studio.mindbodyLocationId !== undefined && studio.mindbodyLocationId !== null
        ? String(studio.mindbodyLocationId)
        : "",
    locationType: studio.locationType ?? "franchise",
    brandColor: studio.brandColor ?? "#F37427",
  };
}

export interface StudioDetailPanelProps {
  studio: Studio;
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  clientCount: number | null;
  canDelete: boolean;
  onSave: (patch: Partial<StudioForm>) => Promise<void>;
  onDelete: () => Promise<void>;
  onChangeNetwork: (networkId: string | null) => Promise<void>;
  onSeedStandardSet?: () => Promise<void>;
  seedSummary?: string | null;
}

export function StudioDetailPanel({
  studio,
  studios,
  networks,
  trainers,
  clientCount,
  canDelete,
  onSave,
  onDelete,
  onChangeNetwork,
  onSeedStandardSet,
  seedSummary,
}: StudioDetailPanelProps) {
  const external = useMemo(() => studioToForm(studio), [studio]);
  const form = useDirtyForm(external, (patch) => onSave(patch));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const locations = useMindbodyLocations(form.value.mindbodySiteId);

  const problem = validateStudioIdentity({
    siteId: form.value.mindbodySiteId,
    locationId: form.value.mindbodyLocationId,
    studios,
    excludeStudioId: studio.id,
  });

  const linkState = mindbodyLinkState(studio, studios);
  const badge = LINK_BADGE[linkState];

  const team = trainers.filter(
    (t) =>
      t.primaryHomeStudioId === studio.id ||
      t.accessibleStudioIds?.includes(studio.id ?? "") ||
      t.ownedStudioIds?.includes(studio.id ?? ""),
  );

  const network = networks.find((n) => n.id === studio.networkId) ?? null;

  return (
    <div className="adm-ov__stack">
      <AdminPanel
        title="Studio details"
        icon={<Building2 className="w-3.5 h-3.5" />}
        subtitle="Everything Mindbody needs to file this location's bookings correctly."
        actions={<AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>}
        footer={
          <SaveBar
            status={problem && form.dirty ? "error" : form.status}
            error={problem?.message ?? form.error}
            onSave={() => {
              if (problem) return;
              void form.save();
            }}
            onDiscard={form.discard}
          />
        }
      >
        <AdminGrid>
          <AdminField label="Studio name" required htmlFor="studio-name">
            <AdminInput
              id="studio-name"
              value={form.value.name}
              onChange={(e) => form.setField("name", e.target.value)}
            />
          </AdminField>

          <AdminField label="Time zone" hint="Drives every date the studio sees.">
            <AdminSelect
              value={form.value.timezone}
              onChange={(e) => form.setField("timezone", e.target.value)}
            >
              {TIME_ZONES.map((tz) => (
                <option key={tz.id} value={tz.id}>
                  {tz.label} — {tz.id}
                </option>
              ))}
            </AdminSelect>
          </AdminField>

          <AdminField
            label="Mindbody Site ID"
            required
            error={problem?.code === "no-site" ? problem.message : null}
            hint="Locations load automatically once this is entered."
          >
            <AdminInput
              inputMode="numeric"
              value={form.value.mindbodySiteId}
              invalid={problem?.code === "no-site"}
              onChange={(e) => form.setField("mindbodySiteId", e.target.value)}
              placeholder="e.g. 29068"
            />
          </AdminField>

          <AdminField
            label="Mindbody location"
            error={
              problem && problem.code !== "no-site" ? problem.message : null
            }
            hint={locations.status || "Only needed when a site holds more than one studio."}
          >
            {locations.locations.length > 0 ? (
              <AdminSelect
                value={form.value.mindbodyLocationId}
                invalid={!!problem && problem.code !== "no-site"}
                onChange={(e) =>
                  form.setField("mindbodyLocationId", e.target.value)
                }
              >
                <option value="">No location — this site has one studio</option>
                {locations.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.id})
                  </option>
                ))}
              </AdminSelect>
            ) : (
              <AdminInput
                inputMode="numeric"
                value={form.value.mindbodyLocationId}
                invalid={!!problem && problem.code !== "no-site"}
                onChange={(e) =>
                  form.setField("mindbodyLocationId", e.target.value)
                }
                placeholder={locations.loading ? "Loading…" : "Location ID"}
              />
            )}
          </AdminField>

          <AdminField label="Business email">
            <AdminInput
              type="email"
              value={form.value.contactEmail}
              onChange={(e) => form.setField("contactEmail", e.target.value)}
            />
          </AdminField>

          <AdminField label="Phone">
            <AdminInput
              type="tel"
              value={form.value.phone}
              onChange={(e) => form.setField("phone", e.target.value)}
            />
          </AdminField>

          <AdminField label="Address" wide>
            <AdminInput
              value={form.value.address}
              onChange={(e) => form.setField("address", e.target.value)}
            />
          </AdminField>

          <AdminField label="Location type">
            <AdminSelect
              value={form.value.locationType}
              onChange={(e) => form.setField("locationType", e.target.value)}
            >
              <option value="corporate">Corporate</option>
              <option value="franchise">Franchise</option>
            </AdminSelect>
          </AdminField>

          <AdminField label="Accent colour" hint="Used on this studio's schedule blocks.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Accent colour"
                value={form.value.brandColor}
                onChange={(e) => form.setField("brandColor", e.target.value)}
                className="w-10 h-10 rounded-lg border-0 bg-transparent p-0 cursor-pointer"
              />
              <AdminInput
                value={form.value.brandColor}
                onChange={(e) => form.setField("brandColor", e.target.value)}
              />
            </div>
          </AdminField>
        </AdminGrid>
      </AdminPanel>

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

      {onSeedStandardSet && (
        <AdminPanel
          title="Equipment"
          subtitle="Most locations run the same twenty machines. Adding them again is safe — anything already on the floor is skipped."
        >
          <div className="flex flex-wrap items-center gap-3">
            <AdminButton
              variant="primary"
              busy={seeding}
              onClick={async () => {
                setSeeding(true);
                try {
                  await onSeedStandardSet();
                } finally {
                  setSeeding(false);
                }
              }}
            >
              Add the standard set
            </AdminButton>
            {seedSummary && (
              <span className="adm-hint" style={{ margin: 0 }}>
                {seedSummary}
              </span>
            )}
          </div>
        </AdminPanel>
      )}

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
