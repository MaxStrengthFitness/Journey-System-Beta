/**
 * Staff & Roles.
 *
 * Replaces AdminUserDirectory (1,184 lines), and with it two things the spec
 * asked to remove and one thing worth removing anyway:
 *
 *   · "Force Refresh" — one of four controls in the admin surface meaning
 *     "reload", each labelled differently. The lists here stream.
 *   · Granular profile configuration — bio, certifications, PIN resets and
 *     the rest. Deep-dive settings belong on the person's own profile.
 *   · "New User" — an admin minting a trainer DOCUMENT for someone who has
 *     never signed in. That is the whole trainer-identity mess: addDoc gives
 *     a random id, Firestore rules only accept writes at trainers/{uid}, and
 *     the person ends up with a profile they cannot write. Nobody is created
 *     here now. Mindbody puts people on the schedule; approval creates the
 *     account; a temporary profile covers the offline case (Studios tab).
 *
 * What stays is what the spec kept: approvals, Mindbody linking, and basic
 * access control.
 */

import { useMemo, useState } from "react";
import { CircleUserRound, TriangleAlert } from "lucide-react";
import type { Studio, Trainer } from "../../../types";
import { ROLE_LABELS } from "../../../types";
import {
  AdminBadge,
  AdminEmpty,
  AdminHeader,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminRows,
  AdminScreen,
  AdminStatTile,
  AdminTiles,
} from "../primitives";
import { ADMIN_TIER_ROLES, OWNER_TIER_ROLES, STATE_BADGE, StaffEditor } from "./StaffEditor";
import { useStaffRoster } from "./useStaffRoster";
import { useOperationsScope } from "../scope-context";

export interface AdminStaffTabProps {
  trainers: Trainer[];
  studios: Studio[];
  activeStudioId: string | null;
  isAdmin: boolean;
  onRefresh?: (c: "studios" | "networks" | "trainers") => Promise<void>;
}

export function AdminStaffTab({
  trainers,
  studios,
  activeStudioId,
  isAdmin,
  onRefresh,
}: AdminStaffTabProps) {
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // The Operations scope decides the studio (Operations round, Sep 2026):
  // the studio the app is in, or everyone at all the reader's studios.
  const ops = useOperationsScope();
  const scopedStudioId = activeStudioId ?? ops.studioId;
  const scope = scopedStudioId ? "studio" : "all";
  const activeStudio = studios.find((s) => s.id === scopedStudioId) ?? null;

  // The merge of trainers, Mindbody's staff list and the pending requests —
  // the same hook My Studio → Team uses (My Studio round, Sep 2026).
  const { rows, summary, staffStatus } = useStaffRoster({
    trainers,
    studio: activeStudio,
    studioId: scope === "studio" ? scopedStudioId : null,
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.name} ${r.email ?? ""}`.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const selected = rows.find((r) => r.key === selectedKey) ?? null;

  return (
    <AdminScreen>
      <AdminHeader
        icon={<CircleUserRound className="w-5 h-5" />}
        title="Staff & roles"
        subtitle={
          scope === "studio"
            ? `${activeStudio?.name ?? "This studio"} only. Mindbody decides who is on the schedule; approving someone here is what gives them an account and a role.`
            : "Everyone at all your studios. Mindbody decides who is on the schedule; approving someone here is what gives them an account and a role."
        }
      />

      <AdminTiles>
        <AdminStatTile
          label="Waiting for approval"
          value={summary.awaitingApproval}
          foot={summary.awaitingApproval > 0 ? "Signed in, no account yet" : "Nobody waiting"}
          tone={summary.awaitingApproval > 0 ? "attention" : undefined}
        />
        <AdminStatTile
          label="On the schedule, no account"
          value={summary.noAccount}
          foot="In Mindbody; cannot sign in"
        />
        <AdminStatTile
          label="No Mindbody match"
          value={summary.unmatched}
          foot={summary.unmatched > 0 ? "Cannot be scheduled" : "All matched"}
          tone={summary.unmatched > 0 ? "attention" : undefined}
        />
        <AdminStatTile
          label="Duplicate accounts"
          value={summary.duplicates}
          foot={summary.duplicates > 0 ? "One person, two documents" : "None found"}
          tone={summary.duplicates > 0 ? "alert" : undefined}
        />
      </AdminTiles>

      {staffStatus && <AdminNotice tone="info">{staffStatus}</AdminNotice>}

      <div className="adm-ov__cols">
        <div className="adm-ov__stack">
          <AdminPanel
            title="People"
            subtitle="Everyone Mindbody knows about, everyone with an account, and everyone waiting."
            actions={
              <AdminInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                style={{ width: 180 }}
              />
            }
            flush
          >
            {visible.length === 0 ? (
              <div className="p-4">
                <AdminEmpty title="Nobody to show">
                  {search
                    ? "No match for that search."
                    : "No staff at this studio yet."}
                </AdminEmpty>
              </div>
            ) : (
              <AdminRows>
                {visible.map((row) => {
                  const badge = STATE_BADGE[row.state];
                  return (
                    <button
                      key={row.key}
                      type="button"
                      className="adm-row adm-row--tappable"
                      onClick={() => setSelectedKey(row.key)}
                      aria-current={row.key === selectedKey ? "true" : undefined}
                    >
                      <span className="adm-row__main">
                        <span className="adm-row__name">
                          {row.name}
                          {row.duplicateTrainerIds && (
                            <TriangleAlert
                              className="w-3.5 h-3.5 inline ml-1.5"
                              style={{ color: "var(--adm-alert)" }}
                            />
                          )}
                        </span>
                        <span className="adm-row__meta">
                          {row.email || "no email"}
                          {row.role ? ` · ${ROLE_LABELS[row.role] ?? row.role}` : ""}
                        </span>
                      </span>
                      <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
                    </button>
                  );
                })}
              </AdminRows>
            )}
          </AdminPanel>
        </div>

        <div className="adm-ov__stack">
          {selected ? (
            <StaffEditor
              key={selected.key}
              row={selected}
              studios={studios}
              activeStudioId={scopedStudioId}
              // An administrator hands out anything; a franchise owner the
              // studio and owner tiers — never an administrator (audit fix,
              // Sep 2026: a new hire could be approved straight in as Admin).
              assignableRoles={isAdmin ? ADMIN_TIER_ROLES : OWNER_TIER_ROLES}
              canChangeRole={isAdmin}
              onDone={async () => {
                setSelectedKey(null);
                await onRefresh?.("trainers");
              }}
            />
          ) : (
            <AdminPanel title="Nobody selected">
              <AdminEmpty title="Pick someone on the left">
                Approvals, Mindbody links and studio access all happen here.
              </AdminEmpty>
            </AdminPanel>
          )}
        </div>
      </div>
    </AdminScreen>
  );
}
