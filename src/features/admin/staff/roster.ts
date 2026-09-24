/**
 * Who works here — Mindbody and the app, reconciled into one list.
 *
 * THE MODEL
 *
 * Mindbody is the roster. A trainer appears on the schedule because Mindbody
 * says they are staff, and ScheduleEntry carries their name whether or not
 * this app has ever heard of them — so a new hire is on the board the morning
 * they are added to Mindbody, with nobody creating anything here.
 *
 * A Firestore trainer document is a different thing: an ACCOUNT. It exists
 * because a person signed in and someone approved them, and it is what carries
 * their role, their studio access and their Kaizen Roster. Conflating the two
 * is what produced the old "New User" button — an admin minting trainer
 * documents with random ids for people who had never signed in, which is the
 * whole trainer-identity mess.
 *
 * So this file's job is to show both, say which is which, and make the gap
 * between them actionable: this person is on the schedule but cannot sign in;
 * that one is waiting for approval; this account has no Mindbody match.
 *
 * Pure, and tested, because the matching is the part that goes wrong.
 */

import type { Trainer, UserRole } from "../../../types";
import { nameKey } from "../provisional/provisional";
import { isMergedAway } from "../provisional/reconcile";

export interface MindbodyStaff {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  email?: string;
  displayName?: string;
  imageUrl?: string | null;
}

/**
 * access_requests holds two kinds of request, told apart by `type`:
 *
 *   a sign-up (no type)  AccessRequestView, from someone with no account yet.
 *                        The rules require fullName and email; the studio is
 *                        requestedStudioId, and userId is their Auth uid.
 *   "studio_access"      the studio picker's Request Access, from someone who
 *                        HAS an account and wants another studio. trainerId is
 *                        their Auth uid (the rules pin it); the studio is
 *                        studioId. Before Sep 24 2026 it carried no fullName or
 *                        email, only trainerName — which is why every name
 *                        and email here is optional.
 */
export interface AccessRequest {
  id: string;
  type?: string;
  fullName?: string;
  email?: string;
  status?: string;
  userId?: string;
  roleRequested?: string;
  /** The studio they asked to join (My Studio round, Sep 2026) — older requests have none. */
  requestedStudioId?: string | null;
  /** studio_access: the Auth uid of the person asking. */
  trainerId?: string;
  /** studio_access, before Sep 24 2026: the only place a name went. */
  trainerName?: string;
  /** studio_access: the studio asked for. */
  studioId?: string | null;
  studioName?: string;
  createdAt?: string;
}

export const STUDIO_ACCESS = "studio_access";

/** What a row says in place of a name nobody gave, rather than crashing on it. */
export const NAME_NOT_GIVEN = "Name not given";

export const isStudioAccessRequest = (req: AccessRequest) => req.type === STUDIO_ACCESS;

/** The studio a request was made for, whichever kind it is; null when it names none. */
export function requestStudioId(req: AccessRequest): string | null {
  return (isStudioAccessRequest(req) ? req.studioId : req.requestedStudioId) || null;
}

export type StaffState =
  /** Has an account and a confirmed Mindbody staff id. The happy state. */
  | "linked"
  /** Has an account; nothing in Mindbody matches. Cannot be scheduled. */
  | "app-only"
  /** In Mindbody, no account here. On the schedule; cannot sign in. */
  | "mindbody-only"
  /** Signed in and waiting for someone to approve them. */
  | "awaiting-approval"
  /** A temporary profile minted while Mindbody was unavailable. */
  | "temporary"
  /** An admin-created document nobody has claimed by signing in. */
  | "placeholder";

/** How an account was matched to a Mindbody staff member. */
export type MatchedBy = "staffId" | "email" | "name" | null;

export interface StaffRow {
  key: string;
  /** Never empty: NAME_NOT_GIVEN when no source had one. */
  name: string;
  email?: string;
  initials?: string;
  role?: UserRole;
  homeStudioId?: string;
  imageUrl?: string | null;
  state: StaffState;
  matchedBy: MatchedBy;
  trainer?: Trainer;
  mindbody?: MindbodyStaff;
  request?: AccessRequest;
  /**
   * More than one account matched this Mindbody person. Almost always the
   * random-trainer-id duplicate: one document created by the old admin path
   * and one created at sign-in. Surfaced rather than hidden — picking one
   * silently is how the wrong document keeps winning.
   */
  duplicateTrainerIds?: string[];
}

const norm = (s?: string) => (s ?? "").trim().toLowerCase();

/** The first real name among the candidates. Firestore data is not typed, so a "string" may not be one. */
function nameOf(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return NAME_NOT_GIVEN;
}

/** Can this account already get into the studio? The picker's own test, plus ownership. */
function worksAt(t: Trainer, studioId: string): boolean {
  return (
    t.primaryHomeStudioId === studioId ||
    Boolean(t.accessibleStudioIds?.includes(studioId)) ||
    Boolean(t.activeGuestStudioIds?.includes(studioId)) ||
    Boolean(t.ownedStudioIds?.includes(studioId))
  );
}

/** Action first, then the people who need one, then everyone else. */
const STATE_ORDER: Record<StaffState, number> = {
  "awaiting-approval": 0,
  placeholder: 1,
  temporary: 2,
  "mindbody-only": 3,
  linked: 4,
  "app-only": 5,
};

export interface RosterInput {
  trainers: Trainer[];
  mindbodyStaff: MindbodyStaff[];
  requests: AccessRequest[];
  /** Restricts the list to one studio when set. */
  studioId?: string | null;
}

export function buildStaffRoster(input: RosterInput): StaffRow[] {
  const { mindbodyStaff, requests } = input;

  // Tombstoned documents are filtered in CODE, not by a Firestore query:
  // where("supersededByUid","==",null) excludes every document that has never
  // carried the field, which today is nearly all of them.
  const trainers = input.trainers.filter((t) => !isMergedAway(t));

  const scoped = input.studioId
    ? trainers.filter(
        (t) =>
          t.primaryHomeStudioId === input.studioId ||
          t.accessibleStudioIds?.includes(input.studioId!) ||
          t.ownedStudioIds?.includes(input.studioId!),
      )
    : trainers;

  const byStaffId = new Map<string, Trainer[]>();
  const byEmail = new Map<string, Trainer[]>();
  const byName = new Map<string, Trainer[]>();
  const push = (map: Map<string, Trainer[]>, key: string, t: Trainer) => {
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  };
  for (const t of scoped) {
    push(byStaffId, norm(t.mindbodyStaffId), t);
    push(byEmail, norm(t.email), t);
    push(byName, nameKey(...splitName(t.fullName)), t);
  }

  const claimed = new Set<string>();
  const rows: StaffRow[] = [];

  /* ---- Mindbody first: it is the roster ---------------------------- */
  for (const staff of mindbodyStaff) {
    const matches =
      byStaffId.get(norm(staff.id)) ??
      byEmail.get(norm(staff.email)) ??
      byName.get(nameKey(staff.firstName ?? "", staff.lastName ?? "")) ??
      [];
    const matchedBy: MatchedBy = byStaffId.has(norm(staff.id))
      ? "staffId"
      : staff.email && byEmail.has(norm(staff.email))
        ? "email"
        : matches.length > 0
          ? "name"
          : null;

    const trainer = matches[0];
    if (trainer) {
      for (const t of matches) claimed.add(t.id);
      rows.push({
        key: `mb:${staff.id}`,
        name: nameOf(trainer.fullName, staff.fullName),
        email: trainer.email || staff.email,
        initials: trainer.initials,
        role: trainer.role,
        homeStudioId: trainer.primaryHomeStudioId,
        imageUrl: staff.imageUrl ?? null,
        state: stateOfTrainer(trainer, matchedBy === "staffId" ? "linked" : "linked"),
        matchedBy,
        trainer,
        mindbody: staff,
        ...(matches.length > 1
          ? { duplicateTrainerIds: matches.map((t) => t.id) }
          : {}),
      });
    } else {
      rows.push({
        key: `mb:${staff.id}`,
        name: nameOf(staff.displayName, staff.fullName),
        email: staff.email,
        imageUrl: staff.imageUrl ?? null,
        state: "mindbody-only",
        matchedBy: null,
        mindbody: staff,
      });
    }
  }

  /* ---- Accounts Mindbody does not know about ----------------------- */
  for (const t of scoped) {
    if (claimed.has(t.id)) continue;
    rows.push({
      key: `t:${t.id}`,
      name: nameOf(t.fullName),
      email: t.email,
      initials: t.initials,
      role: t.role,
      homeStudioId: t.primaryHomeStudioId,
      state: stateOfTrainer(t, "app-only"),
      matchedBy: null,
      trainer: t,
    });
  }

  /* ---- People waiting to be let in --------------------------------- */
  for (const req of requests) {
    if (norm(req.status) && norm(req.status) !== "pending") continue;

    // A request that names a studio is that studio's to answer
    // (roles-and-permissions.md, "Letting people in"). One that names none —
    // an older sign-up — is anyone's, so it shows everywhere. Filtered HERE
    // rather than on each screen so the "waiting" counts agree with the rows:
    // the studio_access request, which names its studio as `studioId`, was
    // missed by the screens' own filter and showed at every studio.
    const forStudio = requestStudioId(req);
    if (input.studioId && forStudio && forStudio !== input.studioId) continue;

    if (isStudioAccessRequest(req)) {
      // Someone with an account asking for another studio. Their account
      // existing is the premise, not a sign the request is stale — it is
      // stale once they can get into the studio they asked for.
      const requester = req.trainerId
        ? trainers.find((t) => t.id === req.trainerId || t.authUid === req.trainerId)
        : undefined;
      if (requester && forStudio && worksAt(requester, forStudio)) continue;

      rows.push({
        key: `req:${req.id}`,
        // Before Sep 24 2026 the picker wrote only trainerName, so the
        // account is the next best source for both.
        name: nameOf(req.fullName, req.trainerName, requester?.fullName),
        email: req.email || requester?.email,
        homeStudioId: requester?.primaryHomeStudioId,
        state: "awaiting-approval",
        matchedBy: null,
        request: req,
      });
      continue;
    }

    // Someone whose account already exists has been approved already; the
    // request is stale and showing it would invite a second approval — and
    // the approval path writes trainers/{uid}, so a second one overwrites the
    // first.
    //
    // The userId comparison is guarded because a request created before the
    // sign-in flow attached one has userId === undefined, and an unguarded
    // `t.authUid === req.userId` then matches every trainer document that has
    // no authUid — which is most of them. That silently hid every pending
    // request, which is the opposite of this screen's job.
    const already =
      byEmail.get(norm(req.email))?.[0] ??
      (req.userId
        ? trainers.find((t) => t.id === req.userId || t.authUid === req.userId)
        : undefined);
    if (already) continue;

    rows.push({
      key: `req:${req.id}`,
      name: nameOf(req.fullName),
      email: req.email,
      state: "awaiting-approval",
      matchedBy: null,
      request: req,
    });
  }

  // State first, then named people A–Z with the nameless after them, then
  // the key so the order never depends on what Firestore returned first.
  return rows.sort((a, b) => {
    const d = STATE_ORDER[a.state] - STATE_ORDER[b.state];
    if (d !== 0) return d;
    const unnamed = Number(a.name === NAME_NOT_GIVEN) - Number(b.name === NAME_NOT_GIVEN);
    if (unnamed !== 0) return unnamed;
    return a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
  });
}

function stateOfTrainer(t: Trainer, fallback: StaffState): StaffState {
  if (t.provisional) return "temporary";
  if (t.pendingClaim) return "placeholder";
  return fallback;
}

function splitName(fullName?: string): [string, string] {
  const parts = (fullName ?? "").trim().split(/\s+/);
  if (parts.length === 0) return ["", ""];
  const [first, ...rest] = parts;
  return [first ?? "", rest.join(" ")];
}

/* ==================================================================== *
 * Summary, for the screen's header
 * ==================================================================== */

export interface RosterSummary {
  total: number;
  awaitingApproval: number;
  /** On the schedule but unable to sign in. */
  noAccount: number;
  /** Accounts Mindbody has never heard of. */
  unmatched: number;
  temporary: number;
  placeholders: number;
  duplicates: number;
}

export function summariseRoster(rows: StaffRow[]): RosterSummary {
  return {
    total: rows.length,
    awaitingApproval: rows.filter((r) => r.state === "awaiting-approval").length,
    noAccount: rows.filter((r) => r.state === "mindbody-only").length,
    unmatched: rows.filter((r) => r.state === "app-only").length,
    temporary: rows.filter((r) => r.state === "temporary").length,
    placeholders: rows.filter((r) => r.state === "placeholder").length,
    duplicates: rows.filter((r) => (r.duplicateTrainerIds?.length ?? 0) > 1).length,
  };
}
