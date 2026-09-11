/**
 * WHO MAY USE THE MINDBODY ROUTES — the pure half of server/auth.ts.
 *
 * Round: Renewals, Phase 0 (Sep 2026).
 *
 * Until this round every /api/mindbody/* route in server.ts answered anyone
 * who could reach the server: the server mints a Mindbody staff token from its
 * own credentials, so a stranger with a site id and a client id could read
 * that client's contact details and contracts. Now each call must carry the
 * caller's Firebase sign-in token, and the caller must be staff at a studio on
 * the Mindbody site they are asking about.
 *
 * The decision mirrors firestore.rules, so the server and the database agree
 * about who someone is:
 *   - the caller is whoever `trainers/{uid}` describes; no document, no access
 *     (the rules' trainerDocExistsByUID);
 *   - their role is the sign-in token's `role` claim when present, else the
 *     document's `role`, else "LifeTransformer" (the rules' getRole);
 *   - Admin / Founder / Overseer and the franchise roles reach every site
 *     (the rules' roleIsSuper / roleIsFranchise);
 *   - everyone else reaches the sites of the studios they work at: home,
 *     accessible, guest and owned (trainerWorksAt + trainerLeads).
 *
 * No Firebase import here: server/auth.ts does the reading, this file only
 * decides, so the rules can be tested with plain objects.
 */

export const SUPER_ROLES: ReadonlySet<string> = new Set(["Admin", "Founder", "Overseer"]);
export const FRANCHISE_ROLES: ReadonlySet<string> = new Set(["FranchiseOwner", "Owner"]);
export const STUDIO_LEADER_ROLES: ReadonlySet<string> = new Set([
  "StudioOwner",
  "HeadTrainer",
  "StudioLeader",
]);

/** The fields of a trainer document this file reads. */
export interface TrainerAccessFields {
  role?: unknown;
  primaryHomeStudioId?: unknown;
  accessibleStudioIds?: unknown;
  activeGuestStudioIds?: unknown;
  ownedStudioIds?: unknown;
}

export interface StaffAccess {
  uid: string;
  role: string;
  /** Reaches every Mindbody site (super and franchise roles). */
  allSites: boolean;
  isSuper: boolean;
  /** Studios the caller works at or runs. */
  studioIds: string[];
  /** Mindbody site ids of those studios. */
  siteIds: string[];
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map((v) => String(v).trim())
    .filter(Boolean);
}

/** The caller's role, resolved the way the rules' getRole() does. */
export function resolveRole(claimRole: unknown, trainer: TrainerAccessFields | null): string {
  if (typeof claimRole === "string" && claimRole.trim()) return claimRole.trim();
  if (!trainer) return "none";
  return typeof trainer.role === "string" && trainer.role.trim()
    ? trainer.role.trim()
    : "LifeTransformer";
}

/**
 * Everything the server needs to decide a Mindbody call, from the caller's
 * trainer document and a map of studio id → Mindbody site id.
 */
export function resolveStaffAccess(params: {
  uid: string;
  claimRole?: unknown;
  trainer: TrainerAccessFields | null;
  siteIdByStudio: Record<string, string | null | undefined>;
}): StaffAccess | null {
  const { uid, claimRole, trainer, siteIdByStudio } = params;
  if (!trainer) return null;
  const role = resolveRole(claimRole, trainer);
  const isSuper = SUPER_ROLES.has(role);
  const allSites = isSuper || FRANCHISE_ROLES.has(role);

  const studioIds = Array.from(
    new Set([
      ...asIdList([trainer.primaryHomeStudioId]),
      ...asIdList(trainer.accessibleStudioIds),
      ...asIdList(trainer.activeGuestStudioIds),
      // Owned studios only count for the leader roles, as in trainerLeads().
      ...(STUDIO_LEADER_ROLES.has(role) ? asIdList(trainer.ownedStudioIds) : []),
    ]),
  );
  const siteIds = Array.from(
    new Set(
      studioIds
        .map((id) => siteIdByStudio[id])
        .filter((s): s is string => typeof s === "string" && s.trim() !== "")
        .map((s) => s.trim()),
    ),
  );
  return { uid, role, allSites, isSuper, studioIds, siteIds };
}

/**
 * One flat shape rather than a union: this project compiles without
 * strictNullChecks, where `if (!d.ok)` does not narrow a union.
 */
export interface AccessDecision {
  ok: boolean;
  /** 200 when allowed. */
  status: 200 | 401 | 403;
  /** Empty when allowed; otherwise the sentence the app shows. */
  error: string;
}

const ALLOWED: AccessDecision = { ok: true, status: 200, error: "" };

/**
 * May this caller make this Mindbody call?
 *
 * `siteId` is the site the request names (most routes send one). Routes that
 * only an administrator should reach pass `requireSuper`.
 */
export function decideMindbodyAccess(
  access: StaffAccess | null,
  request: { siteId?: unknown; requireSuper?: boolean },
): AccessDecision {
  if (!access) {
    return {
      ok: false,
      status: 403,
      error: "This sign-in has no staff profile in Journey, so it can't use Mindbody.",
    };
  }
  if (request.requireSuper && !access.isSuper) {
    return {
      ok: false,
      status: 403,
      error: "Only a system administrator can use this Mindbody tool.",
    };
  }
  const site =
    typeof request.siteId === "string" || typeof request.siteId === "number"
      ? String(request.siteId).trim()
      : "";
  if (!site || access.allSites) return ALLOWED;
  if (access.siteIds.includes(site)) return ALLOWED;
  return {
    ok: false,
    status: 403,
    error: `Your account doesn't work at a studio on Mindbody site ${site}.`,
  };
}

/* ------------------------------------------------------------------ *
 * Firestore REST decoding
 *
 * server/auth.ts reads the caller's own trainer document through the
 * Firestore REST API with the caller's sign-in token, so the web service
 * never needs the database's admin key (render.yaml keeps it off the public
 * service on purpose). REST documents arrive as typed values.
 * ------------------------------------------------------------------ */

export type FirestoreRestValue = Record<string, unknown>;

export function decodeRestValue(value: FirestoreRestValue | undefined): unknown {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("arrayValue" in value) {
    const arr = value.arrayValue as { values?: FirestoreRestValue[] } | undefined;
    return (arr?.values ?? []).map((v) => decodeRestValue(v));
  }
  if ("mapValue" in value) {
    const map = value.mapValue as { fields?: Record<string, FirestoreRestValue> } | undefined;
    return decodeRestFields(map?.fields);
  }
  return null;
}

export function decodeRestFields(
  fields: Record<string, FirestoreRestValue> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    out[key] = decodeRestValue(value);
  }
  return out;
}

/** "projects/p/databases/d/documents/studios/abc" → "abc" */
export function restDocId(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const last = name.split("/").pop();
  return last ? last : null;
}
