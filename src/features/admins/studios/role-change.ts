/**
 * CHANGING A PERSON'S ROLE FROM THE ADMINS DASHBOARD — what may be chosen,
 * what it means, and the line it leaves in the Activity record.
 * PURE: no React, no Firestore.
 *
 * AJ, Sep 19 2026: "admins can promote other admins", and the roles page has
 * said since then that admin grants are to be tracked — who granted, who
 * received, when (docs/business/roles-and-permissions.md). The Activity
 * record (Sep 28 2026, AJ "all yes") is where that lives: every role changed
 * here writes one entry, and one that makes or unmakes an administrator is an
 * `admin-grant`, recorded for the company (only administrators read it). Any
 * other role is an `assisted-change` at the studio whose page it was changed on.
 *
 * What an administrator may hand out is what Operations → People & access
 * offers one (ADMIN_TIER_ROLES in admin/staff/StaffEditor.tsx): the studio
 * tier, the owner tier and System Administrator. A role outside the list
 * (Founder, or a legacy code) is shown as it is and kept unless changed.
 * Nobody changes their own role here: an administrator taking their own
 * access away by a slip would have no way back from this screen.
 */
import { ROLE_LABELS, type UserRole } from "../../../types";
import type { ActivityKind } from "../activity/activity";

/** What an administrator may choose, in the order the picker lists them. */
export const ROLE_CHOICES: readonly UserRole[] = ["LifeTransformer", "HeadTrainer", "StudioLeader", "StudioOwner", "Owner", "Admin"];

/** The roles with the whole Admins dashboard (the rules' roleIsSuper). */
export function isAdministratorRole(role: string | null | undefined): boolean {
  return role === "Admin" || role === "Founder" || role === "Overseer";
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "No role yet";
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}

/** The picker's options: the person's own role first when it isn't one of the choices. */
export function roleChoicesFor(current: string | null | undefined): string[] {
  const list: string[] = [...ROLE_CHOICES];
  return current && !list.includes(current) ? [current, ...list] : list;
}

export interface RoleChangeRecord {
  kind: Extract<ActivityKind, "admin-grant" | "assisted-change">;
  what: string;
  /** The studio page it was changed on; null for an admin grant, which is the company's. */
  studioId: string | null;
  before: { Role: string };
  after: { Role: string };
}

/** The Activity entry for one role change. */
export function roleChangeRecord(input: {
  personName: string;
  from: string | null | undefined;
  to: string;
  studioId: string | null;
  studioName?: string | null;
}): RoleChangeRecord {
  const who = input.personName.trim() || "someone";
  const fromLabel = roleLabel(input.from);
  const toLabel = roleLabel(input.to);
  const grant = isAdministratorRole(input.from) || isAdministratorRole(input.to);
  const at = input.studioName ? ` at ${input.studioName}` : "";
  let what: string;
  if (isAdministratorRole(input.to) && !isAdministratorRole(input.from)) {
    what = `Made ${who} a ${toLabel} (was ${fromLabel}).`;
  } else if (isAdministratorRole(input.from) && !isAdministratorRole(input.to)) {
    what = `Changed ${who} from ${fromLabel} to ${toLabel}: no longer an administrator.`;
  } else {
    what = `Changed ${who}'s role${grant ? "" : at} from ${fromLabel} to ${toLabel}.`;
  }
  return {
    kind: grant ? "admin-grant" : "assisted-change",
    what,
    studioId: grant ? null : input.studioId,
    before: { Role: fromLabel },
    after: { Role: toLabel },
  };
}

/** What will happen, in sentences, before the change is saved (the confirmation rules: say what happens). */
export function roleConsequences(input: { personName: string; from: string | null | undefined; to: string }): string[] {
  const who = input.personName.trim() || "They";
  const out: string[] = [];
  if (isAdministratorRole(input.to) && !isAdministratorRole(input.from)) {
    out.push(`${who} gets the whole Admins dashboard: every studio, the standard, and making other administrators.`);
  } else if (isAdministratorRole(input.from) && !isAdministratorRole(input.to)) {
    out.push(`${who} loses the Admins dashboard.`);
  } else {
    out.push(`${who} becomes a ${roleLabel(input.to)}: what they can open follows the role.`);
  }
  out.push("It reaches their iPad the next time they sign in, or within the hour.");
  out.push(
    isAdministratorRole(input.to) || isAdministratorRole(input.from)
      ? "It's recorded on Machinery → Activity as an admin grant, with your name."
      : "It's recorded in the studio's Activity, with your name.",
  );
  return out;
}
