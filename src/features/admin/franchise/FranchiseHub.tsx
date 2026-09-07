/**
 * The franchise command hub.
 *
 * Round: Admin Overhaul, Round 2 Phase 4 (Section 15).
 *
 * WHAT THE OLD SCREEN SHOWED, AND WHY IT WAS NOT ENOUGH
 * ----------------------------------------------------
 * Two cards. "Your Locations" listed each studio's name beside a count of
 * "Transformers", and "Life Transformers" embedded the team editor. Nothing
 * on it changed from one morning to the next, so nothing on it was worth
 * opening. A franchise owner's actual question is "is anything wrong at any
 * of my studios", and the screen could not answer it.
 *
 * So the locations list keeps the staff count and gains the two facts that do
 * change: whether Mindbody is connected there, and whether the schedule is
 * actually syncing. Both come from the same audit the Mindbody screen uses -
 * features/admin/mindbody/diagnostics.ts - so an owner and an admin looking
 * at the same studio cannot be told different things about it.
 *
 * THE COUNTS AT THE TOP ARE PEOPLE, NOT VOLUME
 * --------------------------------------------
 * Session totals and revenue belong in Insights, which is deferred. What
 * belongs here is the work only this person can clear: somebody signed in
 * this morning and cannot do anything until a role is assigned; a temporary
 * profile is waiting to be reconciled against Mindbody. Those are counts with
 * a verb attached.
 */

import React, { useMemo, useState } from "react";
import {
  Building2,
  Network as NetworkIcon,
  UserCheck,
  Users,
} from "lucide-react";
import type {
  Client,
  FranchiseNetwork,
  HubAnnouncement,
  Studio,
  Trainer,
} from "../../../types";
import {
  AdminBadge,
  AdminEmpty,
  AdminField,
  AdminHeader,
  AdminPanel,
  AdminScreen,
  AdminSelect,
  AdminStatTile,
  AdminTiles,
} from "../primitives";
import { auditStudios, type StudioDiagnosis } from "../mindbody/diagnostics";
import {
  attentionCounts,
  isSuperAdminRole,
  resolveScope,
  staffCountByStudio,
} from "./scope";

export interface FranchiseHubProps {
  viewer: Trainer;
  studios: Studio[];
  trainers: Trainer[];
  networks: FranchiseNetwork[];
  clients?: Client[];
  /** Rendered under the locations. The team editor, unchanged in this round. */
  team: (scope: {
    studios: Studio[];
    staff: Trainer[];
    isSuperAdmin: boolean;
  }) => React.ReactNode;
  /** Rendered last. The shared announcement composer. */
  announcements: (scope: {
    studios: Studio[];
    networks: FranchiseNetwork[];
    published: HubAnnouncement[];
  }) => React.ReactNode;
  published: HubAnnouncement[];
}

const LINK_WORD: Record<StudioDiagnosis["link"], string> = {
  linked: "Mindbody on",
  offline: "Offline by choice",
  misconfigured: "No Site ID",
};

const LINK_TONE = {
  linked: "ok",
  offline: "neutral",
  misconfigured: "alert",
} as const;

const SYNC_TONE = {
  current: "ok",
  lagging: "warn",
  stalled: "alert",
  manual: "neutral",
  "n/a": "neutral",
} as const;

export function FranchiseHub({
  viewer,
  studios,
  trainers,
  networks,
  team,
  announcements,
  published,
}: FranchiseHubProps) {
  /**
   * The picker's choice is a PREFERENCE, not the answer. resolveScope falls
   * back whenever it names nothing available, which is what stops a null
   * seeded on the first render - before the networks stream in - from
   * emptying the screen permanently. See scope.ts.
   */
  const [preferredNetworkId, setPreferredNetworkId] = useState<string | null>(
    null,
  );

  const scope = useMemo(
    () =>
      resolveScope({
        viewer,
        studios,
        trainers,
        networks,
        preferredNetworkId,
      }),
    [viewer, studios, trainers, networks, preferredNetworkId],
  );

  const isSuperAdmin = isSuperAdminRole(viewer.role);
  const counts = useMemo(() => attentionCounts(scope.staff), [scope.staff]);
  const perStudio = useMemo(
    () => staffCountByStudio(scope.staff, scope.studioIds),
    [scope.staff, scope.studioIds],
  );
  const audit = useMemo(
    () => auditStudios(scope.studios, scope.staff, Date.now()),
    [scope.studios, scope.staff],
  );
  const troubled = audit.filter((a) => a.problem !== null).length;

  return (
    <AdminScreen>
      <AdminHeader
        icon={<NetworkIcon className="w-5 h-5" />}
        title="Franchise"
        subtitle={
          scope.activeNetwork
            ? `${scope.activeNetwork.name} — ${scope.studios.length} ${scope.studios.length === 1 ? "studio" : "studios"}, ${scope.staff.length} on the roster.`
            : "Your studios and the people in them."
        }
        actions={
          scope.networks.length > 1 ? (
            <AdminField label="Network" htmlFor="fr-network">
              <AdminSelect
                id="fr-network"
                value={scope.activeNetworkId ?? ""}
                onChange={(e) => setPreferredNetworkId(e.target.value || null)}
              >
                {scope.networks.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          ) : undefined
        }
      />

      <AdminTiles>
        <AdminStatTile
          label="Waiting to be let in"
          value={counts.awaitingApproval}
          tone={counts.awaitingApproval > 0 ? "attention" : undefined}
          foot="Signed in, no role assigned"
        />
        <AdminStatTile
          label="Studios needing attention"
          value={troubled}
          tone={troubled > 0 ? "alert" : undefined}
          foot="Mindbody not connected, or not syncing"
        />
        <AdminStatTile
          label="Temporary profiles"
          value={counts.provisional}
          tone={counts.provisional > 0 ? "attention" : undefined}
          foot="Waiting to be matched to Mindbody"
        />
        <AdminStatTile
          label="Unclaimed profiles"
          value={counts.unclaimed}
          foot="Created for someone who has not signed in"
        />
        <AdminStatTile
          label="Staff not linked to Mindbody"
          value={counts.unlinkedStaff}
          foot="Their sessions will not be attributed"
        />
      </AdminTiles>

      <AdminPanel
        title="Your locations"
        subtitle={
          troubled === 0
            ? "All connected and syncing."
            : `${troubled} of ${audit.length} need a look.`
        }
        icon={<Building2 className="w-4 h-4" />}
        flush
      >
        {audit.length === 0 ? (
          <AdminEmpty title="No locations yet">
            {isSuperAdmin
              ? "This network has no studios in it. Add them on the Studios screen."
              : "Nothing is registered to your account. If that is wrong, an admin can add you as an owner."}
          </AdminEmpty>
        ) : (
          <ul className="adm-fr-list">
            {audit.map((row) => (
              <li key={row.studioId} className="adm-fr-row">
                <span className="adm-fr-row__head">
                  <span className="adm-fr-row__name">{row.name}</span>
                  <AdminBadge tone={LINK_TONE[row.link]}>
                    {LINK_WORD[row.link]}
                  </AdminBadge>
                  {row.link === "linked" && row.sync !== "current" && (
                    <AdminBadge tone={SYNC_TONE[row.sync]}>
                      {row.sync === "manual" ? "Manual sync" : "Not syncing"}
                    </AdminBadge>
                  )}
                  <AdminBadge icon={<Users className="w-3 h-3" />}>
                    {perStudio[row.studioId] ?? 0}
                  </AdminBadge>
                </span>
                {row.problem && (
                  <span className="adm-fr-row__why">{row.problem}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <AdminPanel
        title="Your team"
        subtitle="Roles, studio access and Mindbody linking."
        icon={<UserCheck className="w-4 h-4" />}
      >
        {team({ studios: scope.studios, staff: scope.staff, isSuperAdmin })}
      </AdminPanel>

      {announcements({
        studios: scope.studios,
        networks: scope.networks,
        published,
      })}
    </AdminScreen>
  );
}
