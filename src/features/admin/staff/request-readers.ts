/**
 * WHO MAY READ OTHER PEOPLE'S ACCESS REQUESTS (Oct 10 2026).
 *
 * An access request holds a stranger's name, email and phone, and anyone
 * with a Google account can sign in. The rules (firestore.rules,
 * `access_requests`) let the sender read their own and let these people read
 * every one: anyone who runs a studio (a studio-leader role, or the grant
 * anywhere: the rules' leadsAnyStudio), owners and administrators.
 *
 * This is the app's copy of that answer, so the staff roster opens its
 * listener only for someone the rules will answer. A trainer opening
 * My Studio -> Team (or Staff & Roles inside Demo Mode, which anyone may
 * open) would otherwise have the listener refused and see an error toast.
 * Keep it equal to the rule: `request-readers.test.ts` lists the roles.
 */
import { FRANCHISE_ROLES, STUDIO_LEADER_ROLES, SUPER_ROLES } from "../../../lib/staff-access";

export interface RequestReader {
  role?: string | null;
  managedStudioIds?: readonly string[] | null;
}

export function mayReadAccessRequests(reader: RequestReader | null | undefined): boolean {
  if (!reader) return false;
  // The rules' getRole(): a trainer document with no role is a LifeTransformer.
  const role = typeof reader.role === "string" && reader.role.trim() ? reader.role.trim() : "LifeTransformer";
  if (SUPER_ROLES.has(role) || FRANCHISE_ROLES.has(role) || STUDIO_LEADER_ROLES.has(role)) return true;
  return Array.isArray(reader.managedStudioIds) && reader.managedStudioIds.length > 0;
}
