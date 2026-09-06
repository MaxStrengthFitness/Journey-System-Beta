/**
 * Minting and recognising temporary profiles.
 *
 * Pure. The writes live in the screens; the rules about what a temporary
 * profile IS live here, so they are the same for clients and trainers and can
 * be tested without Firestore.
 */

import type { Client, Trainer } from "../../../types";
import type { ProvisionalFields } from "./types";

export interface ProvisionalAuthor {
  /** Trainer document id. */
  id: string;
  name: string;
}

export interface MintInput {
  firstName: string;
  lastName: string;
  studioId: string;
  reason: string;
  author: ProvisionalAuthor;
  /** Injected so tests do not depend on the wall clock. */
  now?: Date;
  email?: string;
  phone?: string;
}

export type MintProblem =
  | { code: "no-name"; message: string }
  | { code: "no-studio"; message: string }
  | { code: "duplicate"; message: string; existingId?: string };

const clean = (s: string | undefined) => (s ?? "").trim();

/**
 * Case- and punctuation-insensitive, for spotting the same person twice.
 *
 * The two kinds of punctuation are handled differently on purpose:
 * apostrophes and periods are DROPPED, so O'Brien matches OBrien; hyphens and
 * underscores become spaces, so Mary-Jane matches Mary Jane. Treating both
 * the same way misses one of those two, and both are ordinary here.
 */
export function nameKey(first: string, last: string): string {
  return `${clean(first)} ${clean(last)}`
    .toLowerCase()
    .replace(/['\u2019.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Can this temporary profile be created?
 *
 * The duplicate check is the one worth having. A manager minting "Laura
 * Adelman" at a studio that already has a Laura Adelman is almost always
 * looking at a Mindbody outage and not realising the record is already there
 * — and two records for one person is precisely the mess the reconciliation
 * workflow then has to unpick. Blocking costs one conversation; allowing it
 * costs a merged training history.
 */
export function validateMint(
  input: Pick<MintInput, "firstName" | "lastName" | "studioId">,
  existing: { id?: string; firstName?: string; lastName?: string; homeStudioId?: string }[],
): MintProblem | null {
  if (!clean(input.firstName) || !clean(input.lastName)) {
    return { code: "no-name", message: "A first and last name are both needed." };
  }
  if (!clean(input.studioId)) {
    return {
      code: "no-studio",
      message: "Pick the studio this person belongs to.",
    };
  }

  const key = nameKey(input.firstName, input.lastName);
  const clash = existing.find(
    (p) =>
      p.homeStudioId === input.studioId &&
      nameKey(p.firstName ?? "", p.lastName ?? "") === key,
  );
  if (clash) {
    return {
      code: "duplicate",
      message:
        "Someone with this name is already at this studio. Open their profile rather than creating a second one — two records for one person is hard to unpick later.",
      existingId: clash.id,
    };
  }
  return null;
}

function stamp(input: MintInput): ProvisionalFields {
  return {
    provisional: true,
    provisionalSince: (input.now ?? new Date()).toISOString(),
    provisionalBy: input.author.id,
    provisionalReason: clean(input.reason) || "Not given",
  };
}

/**
 * A temporary client document.
 *
 * Deliberately minimal: name, studio, and the marker. Everything else a
 * client record carries — contract, sessions remaining, medical history —
 * belongs to Mindbody or to the coach, and inventing placeholder values for
 * them is how a temporary record starts looking real.
 */
export function mintProvisionalClient(
  input: MintInput,
): Partial<Client> & ProvisionalFields {
  return {
    firstName: clean(input.firstName),
    lastName: clean(input.lastName),
    homeStudioId: input.studioId,
    isActive: true,
    height: "",
    remainingSessions: 0,
    ...(clean(input.email) ? { email: clean(input.email) } : {}),
    ...(clean(input.phone) ? { phone: clean(input.phone) } : {}),
    ...stamp(input),
  };
}

/**
 * A temporary trainer document.
 *
 * pendingClaim rides along on purpose. The trainer-identity round made
 * admin-created profiles claim their Firebase Auth uid at first sign-in; a
 * temporary trainer is exactly that case, so it inherits the same mechanism
 * rather than growing a second one. Without it the person would sign in and
 * get a document they cannot write — the Kaizen Roster bug, again.
 */
export function mintProvisionalTrainer(
  input: MintInput & { initials?: string; role?: Trainer["role"] },
): Partial<Trainer> & ProvisionalFields {
  const fullName = `${clean(input.firstName)} ${clean(input.lastName)}`.trim();
  const initials =
    clean(input.initials) ||
    `${clean(input.firstName)[0] ?? ""}${clean(input.lastName)[0] ?? ""}`.toUpperCase();
  return {
    fullName,
    initials,
    role: input.role ?? "LifeTransformer",
    primaryHomeStudioId: input.studioId,
    accessibleStudioIds: [input.studioId],
    activeGuestStudioIds: [],
    mindbodyLinked: false,
    pendingClaim: true,
    ...(clean(input.email) ? { email: clean(input.email) } : {}),
    ...stamp(input),
  };
}

/* ==================================================================== *
 * Recognising them
 * ==================================================================== */

export function isProvisional(
  record: (ProvisionalFields & { supersededByUid?: string | null }) | undefined | null,
): boolean {
  return !!record?.provisional && !isSuperseded(record);
}

/**
 * Has this record been merged away?
 *
 * Two keys, on purpose. Trainers were already tombstoned as `supersededByUid`
 * by the trainer-identity round — a claimed placeholder and a merged temporary
 * profile are the same event — and clients, which have no Firebase uid, use
 * `supersededById`. Reading both here is what stops the two halves of the
 * merge from needing separate code paths.
 */
export function isSuperseded(
  record: (ProvisionalFields & { supersededByUid?: string | null }) | undefined | null,
): boolean {
  return !!(record?.supersededById || record?.supersededByUid);
}

/**
 * Drops merged-away records from a list.
 *
 * Filtered in CODE, not by a Firestore query, for the same reason the trainer
 * round filtered tombstones in code: `where("supersededById", "==", null)`
 * excludes every document that has never carried the field, which today is
 * all of them.
 */
export function withoutSuperseded<
  T extends ProvisionalFields & { supersededByUid?: string | null },
>(list: T[]): T[] {
  return list.filter((r) => !isSuperseded(r));
}

export function provisionalCount(list: ProvisionalFields[]): number {
  return list.filter(isProvisional).length;
}

/**
 * How long a temporary profile has been waiting, in whole days.
 *
 * Surfaced because the failure mode here is not a crash, it is drift: a
 * studio opens, mints forty temporary clients, gets its Mindbody account a
 * week later, and nobody remembers to reconcile. A count that quietly ages is
 * the only thing that makes that visible.
 */
export function provisionalAgeDays(
  record: ProvisionalFields,
  now: Date = new Date(),
): number | null {
  if (!record.provisionalSince) return null;
  const since = Date.parse(record.provisionalSince);
  if (Number.isNaN(since)) return null;
  return Math.max(0, Math.floor((now.getTime() - since) / 86_400_000));
}
