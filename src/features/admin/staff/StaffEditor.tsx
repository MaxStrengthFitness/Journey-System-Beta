/**
 * ONE PERSON'S ACCESS — the editor behind Staff & Roles and My Studio → Team.
 *
 * Lifted out of AdminStaffTab in the My Studio round (Sep 2026) so the
 * studio's own leaders approve and manage their team with the same code the
 * Operations tab uses, and the two can never disagree about what a save
 * writes. What differs between the doors is passed in:
 *
 *   assignableRoles   what THIS caller may hand out. A studio leader gets
 *                     trainer, head trainer, studio leader (AJ, Sep 18:
 *                     "never owner and admin"); Operations gives owners and
 *                     administrators more.
 *   lockHomeStudio    My Studio approves people INTO this studio — the
 *                     home-studio select is not offered.
 *   grantStudioId     when set, the "Can manage My Studio" switch for that
 *                     studio (Trainer.managedStudioIds).
 *
 * Every write is to trainers/{uid}: setDoc at the AUTH UID on approval,
 * never addDoc (a random id is a profile its owner cannot write), and
 * updateDoc with only the fields on this form otherwise.
 */

import React, { useEffect, useState } from "react";
import { arrayRemove, arrayUnion, doc, setDoc, updateDoc } from "firebase/firestore";
import { CircleUserRound, Link2, ShieldAlert, UserCheck } from "lucide-react";
import { db } from "../../../firebase";
import type { Studio, UserRole } from "../../../types";
import { ROLE_LABELS } from "../../../types";
import { useToast } from "../../../contexts/ToastContext";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import {
  AdminBadge,
  AdminButton,
  AdminField,
  AdminGrid,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminSelect,
  ConfirmDialog,
} from "../primitives";
import type { StaffRow, StaffState } from "./roster";

export const STATE_BADGE: Record<
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

/** What a studio's own leaders may hand out (AJ, Sep 18): never owner or admin. */
export const STUDIO_TIER_ROLES: UserRole[] = ["LifeTransformer", "HeadTrainer", "StudioLeader"];
/** What a franchise owner may hand out from Operations: the studio tier and the owner tier, never an administrator. */
export const OWNER_TIER_ROLES: UserRole[] = [...STUDIO_TIER_ROLES, "StudioOwner", "Owner"];
/** Administrators: everything, including another administrator. */
export const ADMIN_TIER_ROLES: UserRole[] = [...OWNER_TIER_ROLES, "Admin"];

export interface StaffEditorProps {
  row: StaffRow;
  studios: Studio[];
  activeStudioId: string | null;
  assignableRoles: UserRole[];
  /** May change an EXISTING person's role (approval always sets one). */
  canChangeRole: boolean;
  lockHomeStudio?: boolean;
  grantStudioId?: string | null;
  onDone: () => Promise<void> | void;
}

export function StaffEditor({
  row,
  studios,
  activeStudioId,
  assignableRoles,
  canChangeRole,
  lockHomeStudio = false,
  grantStudioId = null,
  onDone,
}: StaffEditorProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [role, setRole] = useState<UserRole>(row.role ?? "LifeTransformer");
  const [homeStudioId, setHomeStudioId] = useState(row.homeStudioId ?? activeStudioId ?? "");
  const [initials, setInitials] = useState(row.initials ?? initialsFrom(row.name));
  const [onCalendar, setOnCalendar] = useState(row.trainer?.isVisibleOnCalendar ?? true);
  const [managesHere, setManagesHere] = useState(
    Boolean(grantStudioId && row.trainer?.managedStudioIds?.includes(grantStudioId)),
  );
  const [busy, setBusy] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);

  useEffect(() => {
    setRole(row.role ?? "LifeTransformer");
    setHomeStudioId(lockHomeStudio ? (activeStudioId ?? "") : (row.homeStudioId ?? activeStudioId ?? ""));
    setInitials(row.initials ?? initialsFrom(row.name));
    setOnCalendar(row.trainer?.isVisibleOnCalendar ?? true);
    setManagesHere(Boolean(grantStudioId && row.trainer?.managedStudioIds?.includes(grantStudioId)));
  }, [row, activeStudioId, lockHomeStudio, grantStudioId]);

  // A role this caller may not hand out is shown, not offered: the select
  // keeps the person's current role as its only extra option, so opening the
  // editor never silently demotes an owner to the first thing on the list.
  const roleOptions: UserRole[] =
    row.role && !assignableRoles.includes(row.role) ? [row.role, ...assignableRoles] : assignableRoles;
  const roleLocked = !canChangeRole && row.state !== "awaiting-approval";
  const roleOutOfReach = Boolean(row.role && !assignableRoles.includes(row.role));

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
    if (!assignableRoles.includes(role)) {
      toastError(`You can't hand out ${ROLE_LABELS[role]} from here.`);
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
        ...(grantStudioId && managesHere ? { managedStudioIds: [grantStudioId] } : {}),
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
    if (!roleLocked && role !== t.role && !assignableRoles.includes(role)) {
      toastError(`You can't hand out ${ROLE_LABELS[role]} from here.`);
      return;
    }
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {
        isVisibleOnCalendar: onCalendar,
        initials: initials.trim().toUpperCase(),
      };
      if (!roleLocked && role !== t.role) patch.role = role;
      if (!lockHomeStudio && homeStudioId && homeStudioId !== t.primaryHomeStudioId) {
        patch.primaryHomeStudioId = homeStudioId;
      }
      if (grantStudioId) {
        const had = (t.managedStudioIds ?? []).includes(grantStudioId);
        if (managesHere && !had) patch.managedStudioIds = arrayUnion(grantStudioId);
        if (!managesHere && had) patch.managedStudioIds = arrayRemove(grantStudioId);
      }
      await updateDoc(doc(db, "trainers", t.id), patch);
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

  const grantStudioName = grantStudioId ? (studios.find((s) => s.id === grantStudioId)?.name ?? "this studio") : null;

  return (
    <>
      <AdminPanel
        title={row.name}
        icon={<CircleUserRound className="w-3.5 h-3.5" />}
        subtitle={row.email}
        actions={<AdminBadge tone={STATE_BADGE[row.state].tone}>{STATE_BADGE[row.state].label}</AdminBadge>}
      >
        {row.state === "mindbody-only" && (
          <AdminNotice tone="info">
            {row.name} is in Mindbody, so their bookings already show on the schedule. They get an
            account by signing in with the email Mindbody has for them — then they appear here for
            approval. Nothing needs creating.
          </AdminNotice>
        )}

        {row.state === "placeholder" && (
          <AdminNotice tone="warn">
            This profile was created by an admin before this person ever signed in, so it has a
            random document id rather than their account id. They claim it automatically the first
            time they sign in.
          </AdminNotice>
        )}

        {row.duplicateTrainerIds && (
          <div style={{ marginTop: 10 }}>
            <AdminNotice tone="alert">
              <ShieldAlert className="w-3.5 h-3.5 inline mr-1" />
              Two accounts match this person: {row.duplicateTrainerIds.join(", ")}. Almost certainly
              one document created by the old admin path and one created at sign-in. Run the trainer
              identity report before deleting either — see TRAINER-IDENTITY.md.
            </AdminNotice>
          </div>
        )}

        {row.request?.requestedStudioId && row.request.requestedStudioId !== activeStudioId && (
          <div style={{ marginTop: 10 }}>
            <AdminNotice tone="info">
              They asked for {studios.find((s) => s.id === row.request?.requestedStudioId)?.name ?? "another studio"}.
              Approving here puts them at {studios.find((s) => s.id === homeStudioId)?.name ?? "this studio"} instead.
            </AdminNotice>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <AdminGrid>
            <AdminField
              label="Role"
              hint={
                roleOutOfReach
                  ? "A role above what you can hand out — an owner or administrator changes it."
                  : undefined
              }
            >
              <AdminSelect
                value={role}
                disabled={roleLocked || roleOutOfReach}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            {lockHomeStudio ? (
              <AdminField label="Home studio" hint="Approved here, they belong here.">
                <AdminInput value={studios.find((s) => s.id === homeStudioId)?.name ?? ""} readOnly />
              </AdminField>
            ) : (
              <AdminField label="Home studio">
                <AdminSelect value={homeStudioId} onChange={(e) => setHomeStudioId(e.target.value)}>
                  <option value="">Choose a studio</option>
                  {studios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
            )}
            <AdminField label="Initials" hint="Shown on the schedule and session grid.">
              <AdminInput value={initials} maxLength={4} onChange={(e) => setInitials(e.target.value)} />
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
            {grantStudioId && (
              <AdminField
                label="Can manage My Studio"
                hint={`Opens the Machines, Team and Studio sections at ${grantStudioName} without changing their role — how a studio grows its next leader.`}
              >
                <AdminSelect
                  value={managesHere ? "yes" : "no"}
                  onChange={(e) => setManagesHere(e.target.value === "yes")}
                >
                  <option value="no">No — a trainer here</option>
                  <option value="yes">Yes — helps run {grantStudioName}</option>
                </AdminSelect>
              </AdminField>
            )}
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
            Matched on {row.matchedBy === "email" ? "email address" : "name"} rather than a stored
            staff id. Confirming writes the id, which is what makes the match survive a rename.
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
