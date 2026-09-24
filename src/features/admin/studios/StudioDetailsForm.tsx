/**
 * The studio's own details — one form, two doors.
 *
 * Extracted from StudioDetailPanel in the My Studio round (Sep 2026) so the
 * same controlled, dirty-tracked form serves both places it is edited from:
 * Operations → Studios (an administrator, for any location) and My Studio →
 * Studio (the studio's own leaders — head trainer, studio leader, studio
 * owner, AJ Sep 18). One implementation, so the two can never disagree about
 * what a field means or which fields are written.
 *
 * Two things this round added to it:
 *
 *   the Journey cutover date   the day THIS studio moved onto Journey. Its
 *                              first editor anywhere; until it is set every
 *                              client at the studio reads as "unknown" and
 *                              gets the cautious wording (lib/prior-history).
 *
 *   the Mindbody guard         a changed Site ID is saved only after Mindbody
 *                              has answered for it. A wrong id parks every
 *                              booking in Limbo and makes the studio's
 *                              trainers blind, so the save bar waits for the
 *                              lookup and shows what the id resolves to.
 *
 * The form is controlled and useDirtyForm sends only the fields that changed
 * — so a field this form does not render cannot be written by it at all.
 */

import React, { useMemo } from "react";
import { Building2 } from "lucide-react";
import type { Studio } from "../../../types";
import { AdminBadge, AdminField, AdminGrid, AdminInput, AdminPanel, AdminSelect, SaveBar } from "../primitives";
import { useDirtyForm } from "../useDirtyForm";
import { useMindbodyLocations } from "./useMindbodyLocations";
import { mindbodyLinkState, validateStudioIdentity, type MindbodyLinkState } from "./registry";

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
  // Deliberately offline reads differently from unconfigured. A demo floor
  // running without Mindbody on purpose should not look broken.
  offline: { label: "Runs offline", tone: "neutral" },
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
  mindbodyMode: "linked" | "offline";
  /** yyyy-mm-dd, or "" while nobody has set it. */
  journeyCutoverDate: string;
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
    mindbodyMode: studio.mindbodyMode ?? "linked",
    journeyCutoverDate: studio.journeyCutoverDate ?? "",
  };
}

export interface StudioDetailsFormProps {
  studio: Studio;
  /** Every studio, for the shared-site and location-conflict checks. */
  studios: Studio[];
  onSave: (patch: Partial<StudioForm>) => Promise<void>;
  /** False shows the form read-only with a line saying who may change it. */
  canEdit?: boolean;
  /** The panel's subtitle — the two doors describe it differently. */
  subtitle?: string;
}

export function StudioDetailsForm({
  studio,
  studios,
  onSave,
  canEdit = true,
  subtitle = "Everything Mindbody needs to file this location's bookings correctly.",
}: StudioDetailsFormProps) {
  const external = useMemo(() => studioToForm(studio), [studio]);
  const form = useDirtyForm(external, (patch) => onSave(patch), {
    label: studio.name ? `${studio.name}'s details` : "the studio's details",
  });

  const locations = useMindbodyLocations(form.value.mindbodySiteId);

  const offline = form.value.mindbodyMode === "offline";
  const problem = validateStudioIdentity({
    siteId: form.value.mindbodySiteId,
    locationId: form.value.mindbodyLocationId,
    studios,
    excludeStudioId: studio.id,
    mode: form.value.mindbodyMode,
  });

  /*
   * The guard: a Site ID that differs from the saved one waits for Mindbody's
   * answer. "ok" with zero locations still counts — the site exists — and an
   * offline studio is not asked. The saved id is never re-checked, so an
   * outage cannot lock a leader out of changing the phone number.
   */
  const siteChanged = form.value.mindbodySiteId.trim() !== external.mindbodySiteId.trim();
  const siteUnverified =
    !offline && siteChanged && form.value.mindbodySiteId.trim() !== "" && locations.outcome !== "ok";
  const guard: { status: "error"; message: string } | null = siteUnverified
    ? {
        status: "error",
        message:
          locations.outcome === "error"
            ? `${locations.status} The Site ID is not saved until Mindbody answers for it.`
            : "Waiting for Mindbody to confirm this Site ID before it is saved…",
      }
    : null;

  const linkState = mindbodyLinkState(studio, studios);
  const badge = LINK_BADGE[linkState];
  const blocked = Boolean(problem) || Boolean(guard);

  return (
    <AdminPanel
      title="Studio details"
      icon={<Building2 className="w-3.5 h-3.5" />}
      subtitle={subtitle}
      actions={<AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>}
      footer={
        canEdit ? (
          <SaveBar
            status={blocked && form.dirty ? "error" : form.status}
            error={problem?.message ?? guard?.message ?? form.error}
            onSave={() => {
              if (blocked) return;
              void form.save();
            }}
            onDiscard={form.discard}
          />
        ) : (
          <div className="px-4 py-3 text-sm" style={{ color: "var(--adm-ink-muted)" }}>
            Only this studio's leaders and administrators can change these details.
          </div>
        )
      }
    >
      <fieldset disabled={!canEdit} className="contents">
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
            label="Journey cutover date"
            hint={
              form.value.journeyCutoverDate
                ? "Clients whose first session here is before this day trained before Journey; their earlier history is in FileMaker, so screens say “nothing recorded” rather than “never attempted”. From this day on, a booking nobody logged in Journey no longer counts as a visit on the attendance watch."
                : "The day this studio moved onto Journey. Until it is set, every client here reads as unknown and gets the cautious wording, and the attendance watch counts every past booking that was not cancelled as a visit."
            }
            htmlFor="studio-cutover"
          >
            <AdminInput
              id="studio-cutover"
              type="date"
              value={form.value.journeyCutoverDate}
              onChange={(e) => form.setField("journeyCutoverDate", e.target.value)}
            />
          </AdminField>

          <AdminField
            label="Mindbody"
            hint="Offline is for a pre-launch floor, a demo area, or an account that is not provisioned yet. Everything still works; nothing syncs."
          >
            <AdminSelect
              value={form.value.mindbodyMode}
              onChange={(e) => form.setField("mindbodyMode", e.target.value as "linked" | "offline")}
            >
              <option value="linked">Linked — bookings arrive from Mindbody</option>
              <option value="offline">Offline — this studio runs on its own</option>
            </AdminSelect>
          </AdminField>

          <AdminField
            label="Mindbody Site ID"
            required={!offline}
            error={problem?.code === "no-site" ? problem.message : null}
            hint={
              offline
                ? "Not needed while this studio runs offline. Fill it in when the account exists."
                : siteChanged && locations.outcome === "ok"
                  ? `Mindbody answered: ${locations.status}`
                  : "Locations load automatically once this is entered, and the id is saved once Mindbody answers for it."
            }
          >
            <AdminInput
              inputMode="numeric"
              value={form.value.mindbodySiteId}
              invalid={problem?.code === "no-site" || locations.outcome === "error"}
              onChange={(e) => form.setField("mindbodySiteId", e.target.value)}
              placeholder="e.g. 29068"
            />
          </AdminField>

          <AdminField
            label="Mindbody location"
            error={problem && problem.code !== "no-site" ? problem.message : null}
            hint={locations.status || "Only needed when a site holds more than one studio."}
          >
            {locations.locations.length > 0 ? (
              <AdminSelect
                value={form.value.mindbodyLocationId}
                invalid={!!problem && problem.code !== "no-site"}
                onChange={(e) => form.setField("mindbodyLocationId", e.target.value)}
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
                onChange={(e) => form.setField("mindbodyLocationId", e.target.value)}
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
      </fieldset>
    </AdminPanel>
  );
}
