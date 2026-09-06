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

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  CircleUserRound,
  Link2,
  ShieldAlert,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { db } from "../../../firebase";
import type { Studio, Trainer, UserRole } from "../../../types";
import { ROLE_LABELS } from "../../../types";
import { useToast } from "../../../contexts/ToastContext";
import {
  OperationType,
  handleFirestoreError,
} from "../../../lib/firestore-errors";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminGrid,
  AdminHeader,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminRows,
  AdminScreen,
  AdminSelect,
  AdminStatTile,
  AdminTiles,
  ConfirmDialog,
} from "../primitives";
import {
  buildStaffRoster,
  summariseRoster,
  type AccessRequest,
  type MindbodyStaff,
  type StaffRow,
  type StaffState,
} from "./roster";

/** Roles an approval can hand out. Deliberately short — the beta wants
 *  flexibility over a rigid RBAC matrix, per the brief. */
const ASSIGNABLE_ROLES: UserRole[] = [
  "LifeTransformer",
  "StudioLeader",
  "Owner",
  "Admin",
];

const STATE_BADGE: Record<
  StaffState,
  { label: string; tone: "ok" | "warn" | "alert" | "neutral" | "live" | "hero" }
> = {
  linked: { label: "Active", tone: "ok" },
  "app-only": { label: "No Mindbody match", tone: "warn" },
  "mindbody-only": { label: "No app account", tone: "neutral" },
  "awaiting-approval": { label: "Waiting for approval", tone: "hero" },
  temporary: { label: "Temporary", tone: "warn" },
  placeholder: { label: "Never signed in", tone: "warn" },
};

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
  const { success: toastSuccess, error: toastError } = useToast();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [mindbodyStaff, setMindbodyStaff] = useState<MindbodyStaff[]>([]);
  const [staffStatus, setStaffStatus] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"studio" | "all">("studio");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const activeStudio = studios.find((s) => s.id === activeStudioId) ?? null;

  /* ---- access requests: a live stream, not a Force Refresh button ---- */
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "access_requests"), where("status", "==", "Pending")),
      (snap) =>
        setRequests(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
        ),
      (err) => handleFirestoreError(err, OperationType.GET, "access_requests"),
    );
    return () => unsub();
  }, []);

  /* ---- Mindbody staff for this studio's site ------------------------ */
  useEffect(() => {
    const siteId = activeStudio?.mindbodySiteId;
    if (!siteId) {
      setMindbodyStaff([]);
      setStaffStatus(
        activeStudio?.mindbodyMode === "offline"
          ? "This studio runs offline — nobody arrives from Mindbody."
          : "No Mindbody Site ID on this studio yet.",
      );
      return;
    }
    let cancelled = false;
    setStaffStatus("Loading staff from Mindbody…");
    void (async () => {
      try {
        const res = await fetch("/api/mindbody/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId: String(siteId) }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setMindbodyStaff([]);
          setStaffStatus(err?.error || "Mindbody did not return a staff list.");
          return;
        }
        const data = await res.json();
        setMindbodyStaff(data.staff || []);
        setStaffStatus("");
      } catch {
        if (!cancelled) {
          setMindbodyStaff([]);
          setStaffStatus("Could not reach Mindbody.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStudio?.mindbodySiteId, activeStudio?.mindbodyMode]);

  const rows = useMemo(
    () =>
      buildStaffRoster({
        trainers,
        mindbodyStaff,
        requests,
        studioId: scope === "studio" ? activeStudioId : null,
      }),
    [trainers, mindbodyStaff, requests, scope, activeStudioId],
  );

  const summary = useMemo(() => summariseRoster(rows), [rows]);

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
        title="Staff &amp; roles"
        subtitle="Mindbody decides who is on the schedule. Approving someone here is what gives them an account and a role."
        actions={
          <AdminSelect
            value={scope}
            onChange={(e) => setScope(e.target.value as "studio" | "all")}
            style={{ width: "auto" }}
          >
            <option value="studio">
              {activeStudio?.name ?? "This studio"} only
            </option>
            <option value="all">Everyone in the network</option>
          </AdminSelect>
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
            <StaffDetail
              row={selected}
              studios={studios}
              activeStudioId={activeStudioId}
              isAdmin={isAdmin}
              onDone={async () => {
                setSelectedKey(null);
                await onRefresh?.("trainers");
              }}
              toastSuccess={toastSuccess}
              toastError={toastError}
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

/* ==================================================================== *
 * One person
 * ==================================================================== */

function StaffDetail({
  row,
  studios,
  activeStudioId,
  isAdmin,
  onDone,
  toastSuccess,
  toastError,
}: {
  row: StaffRow;
  studios: Studio[];
  activeStudioId: string | null;
  isAdmin: boolean;
  onDone: () => Promise<void>;
  toastSuccess: (m: string) => void;
  toastError: (m: string) => void;
}) {
  const [role, setRole] = useState<UserRole>(row.role ?? "LifeTransformer");
  const [homeStudioId, setHomeStudioId] = useState(
    row.homeStudioId ?? activeStudioId ?? "",
  );
  const [initials, setInitials] = useState(
    row.initials ?? initialsFrom(row.name),
  );
  const [onCalendar, setOnCalendar] = useState(
    row.trainer?.isVisibleOnCalendar ?? true,
  );
  const [busy, setBusy] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);

  useEffect(() => {
    setRole(row.role ?? "LifeTransformer");
    setHomeStudioId(row.homeStudioId ?? activeStudioId ?? "");
    setInitials(row.initials ?? initialsFrom(row.name));
    setOnCalendar(row.trainer?.isVisibleOnCalendar ?? true);
  }, [row, activeStudioId]);

  const approve = async () => {
    const req = row.request;
    if (!req) return;
    if (!req.userId) {
      toastError(
        "No signed-in account is attached to this request. Ask them to sign in with Google first — the account is keyed on that.",
      );
      return;
    }
    if (initials.trim().length < 2) {
      toastError("Initials must be at least two characters.");
      return;
    }
    setBusy(true);
    try {
      // setDoc at the AUTH UID, never addDoc. Firestore rules only accept
      // writes to trainers/{uid}; a random id is a profile its owner cannot
      // write, which is exactly what broke the Kaizen Roster.
      await setDoc(doc(db, "trainers", req.userId), {
        fullName: req.fullName,
        initials: initials.trim().toUpperCase(),
        role,
        primaryHomeStudioId: homeStudioId,
        accessibleStudioIds: [homeStudioId],
        activeGuestStudioIds: [],
        isVisibleOnCalendar: onCalendar,
        email: (req.email || "").trim().toLowerCase(),
        authUid: req.userId,
        systemStatus: "active",
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, "access_requests", req.id), {
        status: "Approved",
        approvedTrainerId: req.userId,
        updatedAt: new Date().toISOString(),
      });
      toastSuccess(`${req.fullName} can now sign in as ${ROLE_LABELS[role]}.`);
      await onDone();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "trainers");
    } finally {
      setBusy(false);
      setConfirmApprove(false);
    }
  };

  const saveAccess = async () => {
    const t = row.trainer;
    if (!t) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "trainers", t.id), {
        role,
        primaryHomeStudioId: homeStudioId,
        isVisibleOnCalendar: onCalendar,
        initials: initials.trim().toUpperCase(),
      });
      toastSuccess("Access updated.");
      await onDone();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `trainers/${t.id}`);
    } finally {
      setBusy(false);
    }
  };

  const linkToMindbody = async () => {
    const t = row.trainer;
    const mb = row.mindbody;
    if (!t || !mb) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "trainers", t.id), {
        mindbodyStaffId: mb.id,
        mindbodyLinked: true,
      });
      toastSuccess(`Linked to Mindbody staff ${mb.id}.`);
      await onDone();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `trainers/${t.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminPanel
        title={row.name}
        icon={<CircleUserRound className="w-3.5 h-3.5" />}
        subtitle={row.email}
        actions={
          <AdminBadge tone={STATE_BADGE[row.state].tone}>
            {STATE_BADGE[row.state].label}
          </AdminBadge>
        }
      >
        {row.state === "mindbody-only" && (
          <AdminNotice tone="info">
            {row.name} is in Mindbody, so their bookings already show on the
            schedule. They get an account by signing in with the email Mindbody
            has for them — then they appear here for approval. Nothing needs
            creating.
          </AdminNotice>
        )}

        {row.state === "placeholder" && (
          <AdminNotice tone="warn">
            This profile was created by an admin before this person ever signed
            in, so it has a random document id rather than their account id.
            They claim it automatically the first time they sign in.
          </AdminNotice>
        )}

        {row.duplicateTrainerIds && (
          <div style={{ marginTop: 10 }}>
            <AdminNotice tone="alert">
              <ShieldAlert className="w-3.5 h-3.5 inline mr-1" />
              Two accounts match this person: {row.duplicateTrainerIds.join(", ")}.
              Almost certainly one document created by the old admin path and
              one created at sign-in. Run the trainer identity report before
              deleting either — see TRAINER-IDENTITY.md.
            </AdminNotice>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <AdminGrid>
            <AdminField label="Role">
              <AdminSelect
                value={role}
                disabled={!isAdmin && row.state !== "awaiting-approval"}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Home studio">
              <AdminSelect
                value={homeStudioId}
                onChange={(e) => setHomeStudioId(e.target.value)}
              >
                <option value="">Choose a studio</option>
                {studios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Initials" hint="Shown on the schedule and session grid.">
              <AdminInput
                value={initials}
                maxLength={4}
                onChange={(e) => setInitials(e.target.value)}
              />
            </AdminField>
            <AdminField label="Calendar" hint="Whether they appear on the studio schedule.">
              <AdminSelect
                value={onCalendar ? "yes" : "no"}
                onChange={(e) => setOnCalendar(e.target.value === "yes")}
              >
                <option value="yes">Shown on the schedule</option>
                <option value="no">Hidden from the schedule</option>
              </AdminSelect>
            </AdminField>
          </AdminGrid>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {row.state === "awaiting-approval" && (
            <AdminButton
              variant="hero"
              busy={busy}
              disabled={!homeStudioId}
              onClick={() => setConfirmApprove(true)}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Approve and create the account
            </AdminButton>
          )}

          {row.trainer && (
            <AdminButton variant="primary" busy={busy} onClick={() => void saveAccess()}>
              Save access
            </AdminButton>
          )}

          {row.trainer && row.mindbody && row.matchedBy !== "staffId" && (
            <AdminButton variant="quiet" busy={busy} onClick={() => void linkToMindbody()}>
              <Link2 className="w-3.5 h-3.5" />
              Confirm the Mindbody link
            </AdminButton>
          )}
        </div>

        {row.trainer && row.mindbody && row.matchedBy !== "staffId" && (
          <p className="adm-hint" style={{ marginTop: 8 }}>
            Matched on {row.matchedBy === "email" ? "email address" : "name"}
            {" "}rather than a stored staff id. Confirming writes the id, which is
            what makes the match survive a rename.
          </p>
        )}
      </AdminPanel>

      <ConfirmDialog
        open={confirmApprove}
        title={`Give ${row.name} an account?`}
        body={`They will sign in as ${ROLE_LABELS[role]} at ${studios.find((s) => s.id === homeStudioId)?.name ?? "the selected studio"}. Roles can be changed afterwards.`}
        confirmLabel="Approve"
        busy={busy}
        onCancel={() => setConfirmApprove(false)}
        onConfirm={() => void approve()}
      />
    </>
  );
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}
