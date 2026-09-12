/**
 * WHO AN ANNOUNCEMENT IS FOR.
 *
 * Round: Admin Overhaul, Round 2 Phase 1 (Section 8).
 *
 * THE BUG THIS FILE EXISTS TO CLOSE
 * ---------------------------------
 * There were two announcement composers writing into one collection, and they
 * did not agree on what the fields mean.
 *
 *   Admin (AdminHubAnnouncements)  wrote studioId: "all" for universal, and
 *                                  studioId: <id> for one studio. Sensible.
 *   Franchise (FranchiseDashboard) wrote targetScope: "network",
 *                                  targetId: "all_owned",
 *                                  studioId: "all".
 *
 * The reader treats `studioId === "all"` as "everybody". So a franchise owner
 * addressing THEIR NETWORK published to every trainer in the platform -
 * every other franchise, every studio, whether or not they had ever heard of
 * that owner. Nothing in the UI said so; the composer's own list filtered on
 * `authorId === me`, so the author saw a tidy list of their own notices and no
 * hint of where they had actually landed.
 *
 * That is not a targeting bug to be patched in the reader. It is two writers
 * with private conventions, so this module makes the convention explicit and
 * both composers call it.
 *
 * THE AUDIENCE IS RESOLVED AT WRITE TIME, NOT READ TIME
 * ----------------------------------------------------
 * A network is a list of studio ids on a `FranchiseNetwork` document. A
 * trainer document knows its studios but not its networks. So a reader asking
 * "is this network announcement for me?" would have to load the network
 * collection - on every device, for every announcement, forever.
 *
 * Instead the composer resolves the network to `targetStudioIds` once, at
 * publish. The reader then does set membership against studios it already
 * holds. One extra array on the document buys every reader zero extra reads.
 *
 * The cost of that choice, stated plainly: an announcement's audience is
 * frozen at publish. A studio that joins the network tomorrow does not
 * retroactively receive yesterday's notice. For a message with a 24-hour to
 * 1-month lifespan that is the behaviour you want anyway - a new studio being
 * shown a fortnight of backlog on its first morning is worse.
 *
 * OLD DOCUMENTS NARROW, THEY DO NOT LEAK
 * --------------------------------------
 * Network announcements already in Firestore carry `studioId: "all"` and no
 * `targetStudioIds`. `isTargeted` reads `targetScope` FIRST, so those stop
 * being universal the moment this ships; with no studio list to match on they
 * fall back to the owner-role check the old reader used. That is a narrowing
 * - from "everyone" to "owners" - which is the safe direction to be wrong in,
 * and it needs no migration.
 */

import type { HubAnnouncement, Studio, Trainer } from "../../../types";
import type { StoredLearningRef } from "../../learning/ref";

/** How long a notice stays live. The three the composers have always offered. */
export type Lifespan = "24h" | "1w" | "1m";

export type AnnouncementScope = "universal" | "network" | "studio";

/** What a composer collects before it knows anything about Firestore. */
export interface AnnouncementDraft {
  title: string;
  shortContent: string;
  longContent: string;
  type: NonNullable<HubAnnouncement["type"]>;
  priority: HubAnnouncement["priority"];
  scope: AnnouncementScope;
  /** Set when scope is "studio". */
  studioId?: string;
  /** Set when scope is "network". */
  networkId?: string;
  /** A Learning page it points at (Learning + Planner round). */
  learningLink?: StoredLearningRef | null;
}

/** The networks a composer can address, and the studios in each. */
export interface NetworkOption {
  id: string;
  name: string;
  studioIds: string[];
}

/** The fields that describe an audience, ready to spread into a write. */
export interface AudienceFields {
  targetScope: AnnouncementScope;
  targetId: string;
  /**
   * The legacy field, still required by the security rules and still read by
   * `isTargeted` for documents written before targetScope existed.
   *
   *   universal -> "all"
   *   studio    -> the studio id
   *   network   -> "" (empty: the audience is in targetStudioIds, and "all"
   *                here is exactly the bug at the top of this file)
   */
  studioId: string;
  /** Every studio in the audience. Empty for universal - it needs no list. */
  targetStudioIds: string[];
}

export const EMPTY_DRAFT: AnnouncementDraft = {
  title: "",
  shortContent: "",
  longContent: "",
  type: "news",
  priority: "low",
  scope: "universal",
};

/** Characters a ticker line gets before it is cut off in a marquee. */
export const SHORT_CONTENT_MAX = 120;

/* ------------------------------------------------------------------ *
 * VALIDATION
 * ------------------------------------------------------------------ */

/**
 * Every reason this draft cannot be published, in the order a person reading
 * the form would meet them. Empty means publishable.
 */
export function validateDraft(draft: AnnouncementDraft): string[] {
  const problems: string[] = [];
  if (!draft.title.trim()) problems.push("A headline is required.");
  if (!draft.shortContent.trim()) {
    problems.push("A short update is required - it is what appears in Alerts.");
  } else if (draft.shortContent.length > SHORT_CONTENT_MAX) {
    problems.push(
      `The short update is ${draft.shortContent.length} characters; the limit is ${SHORT_CONTENT_MAX}.`,
    );
  }
  if (draft.scope === "studio" && !draft.studioId) {
    problems.push("Pick which studio this goes to.");
  }
  if (draft.scope === "network" && !draft.networkId) {
    problems.push("Pick which network this goes to.");
  }
  // A studio's own page opens only at that studio.
  const link = draft.learningLink;
  if (link?.kind === "studio-page" && (draft.scope !== "studio" || draft.studioId !== link.studioId)) {
    problems.push("A studio's own page can only be linked in an announcement to that one studio.");
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * WRITE SIDE
 * ------------------------------------------------------------------ */

/**
 * Turn a draft's scope into the four fields that describe its audience.
 *
 * A network whose id is not in `networks` resolves to an EMPTY studio list
 * rather than throwing or falling back to "all". A notice nobody receives is
 * a visible, reportable failure; a notice everybody receives is the bug this
 * file is named after.
 */
export function resolveAudience(
  draft: AnnouncementDraft,
  networks: NetworkOption[],
): AudienceFields {
  if (draft.scope === "studio") {
    const id = draft.studioId ?? "";
    return {
      targetScope: "studio",
      targetId: id,
      studioId: id,
      targetStudioIds: id ? [id] : [],
    };
  }
  if (draft.scope === "network") {
    const id = draft.networkId ?? "";
    const network = networks.find((n) => n.id === id);
    return {
      targetScope: "network",
      targetId: id,
      studioId: "",
      targetStudioIds: [...new Set(network?.studioIds ?? [])],
    };
  }
  return {
    targetScope: "universal",
    targetId: "",
    studioId: "all",
    targetStudioIds: [],
  };
}

/** When a notice with this lifespan, published now, stops being shown. */
export function expiryFor(lifespan: Lifespan, now: Date): Date {
  const at = new Date(now.getTime());
  if (lifespan === "24h") at.setHours(at.getHours() + 24);
  else if (lifespan === "1w") at.setDate(at.getDate() + 7);
  else at.setMonth(at.getMonth() + 1);
  return at;
}

export interface AnnouncementAuthor {
  id: string;
  fullName: string;
}

/**
 * The complete document body, minus `createdAt` which only Firestore can
 * stamp. Text is trimmed here so the same notice typed with a trailing space
 * does not sort or compare differently from one typed without.
 */
export function announcementBody(
  draft: AnnouncementDraft,
  author: AnnouncementAuthor,
  networks: NetworkOption[],
  lifespan: Lifespan,
  now: Date,
): Omit<HubAnnouncement, "id" | "createdAt"> & {
  targetStudioIds: string[];
  expiresAt: Date;
} {
  return {
    title: draft.title.trim(),
    shortContent: draft.shortContent.trim(),
    longContent: draft.longContent.trim(),
    type: draft.type,
    priority: draft.priority,
    authorId: author.id,
    authorName: author.fullName,
    ...resolveAudience(draft, networks),
    // Only when set: Firestore refuses undefined values.
    ...(draft.learningLink ? { learningLink: draft.learningLink } : {}),
    expiresAt: expiryFor(lifespan, now),
    isActive: true,
    readBy: [],
  };
}

/* ------------------------------------------------------------------ *
 * READ SIDE
 * ------------------------------------------------------------------ */

/** Milliseconds out of whatever shape a timestamp field happens to be in. */
export function millis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const ts = v as { toMillis?: () => number; toDate?: () => Date };
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return 0;
}

/** Every studio this trainer stands in: home, granted, guest, owned. */
export function trainerStudioIds(trainer: Trainer): string[] {
  return [
    trainer.primaryHomeStudioId,
    ...(trainer.accessibleStudioIds ?? []),
    ...(trainer.activeGuestStudioIds ?? []),
    ...(trainer.ownedStudioIds ?? []),
  ].filter((id): id is string => Boolean(id));
}

const OWNER_ROLES = new Set(["Owner", "FranchiseOwner", "StudioOwner"]);

/**
 * Whether this trainer is inside an announcement's audience.
 *
 * `targetScope` is read FIRST and decides on its own. The legacy `studioId`
 * is consulted only for documents written before targetScope existed, because
 * on a network document `studioId: "all"` means "the old composer put a
 * placeholder here", not "send to everyone" - see the header.
 */
export function isTargeted(
  a: Pick<
    HubAnnouncement,
    "studioId" | "targetScope" | "targetId" | "readBy"
  > & { targetStudioIds?: string[] },
  trainer: Trainer,
): boolean {
  const mine = trainerStudioIds(trainer);
  const reaches = (ids: string[] | undefined) =>
    Boolean(ids?.some((id) => mine.includes(id)));

  switch (a.targetScope) {
    case "universal":
      return true;
    case "studio":
      return (
        reaches(a.targetStudioIds) ||
        (Boolean(a.targetId) && mine.includes(a.targetId as string)) ||
        (Boolean(a.studioId) &&
          a.studioId !== "all" &&
          mine.includes(a.studioId))
      );
    case "network":
      // Written by this module: an explicit studio list.
      if (a.targetStudioIds?.length) return reaches(a.targetStudioIds);
      // Written before it: no list to match, so narrow to owners rather than
      // honouring the `studioId: "all"` the old composer left behind.
      return OWNER_ROLES.has(trainer.role as string);
    default:
      // No targetScope at all: a pre-scope document, keyed on studioId only.
      return a.studioId === "all" || mine.includes(a.studioId);
  }
}

/** Active, in scope, unexpired, newest first. */
export function visibleAnnouncements<
  T extends Parameters<typeof isTargeted>[0] & {
    isActive?: boolean;
    expiresAt?: unknown;
    createdAt?: unknown;
  },
>(all: T[], trainer: Trainer | null | undefined, now: number): T[] {
  if (!trainer) return [];
  return all
    .filter((a) => a.isActive !== false)
    .filter((a) => {
      const expires = millis(a.expiresAt);
      return expires === 0 || expires >= now;
    })
    .filter((a) => isTargeted(a, trainer))
    .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
}

/**
 * Of those, the ones this trainer has not opened.
 *
 * Takes one id or several. From Sep 2026 (Learning + Planner round) the bell
 * stamps the sign-in id, the only one the rules accept; older accounts whose
 * profile id differs were stamped under that id before. Either one counts.
 */
export function unreadFor<T extends { readBy?: string[] }>(
  announcements: T[],
  readerIds: string | null | undefined | Array<string | null | undefined>,
): T[] {
  const ids = (Array.isArray(readerIds) ? readerIds : [readerIds]).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (ids.length === 0) return [];
  return announcements.filter((a) => !ids.some((id) => a.readBy?.includes(id)));
}

/* ------------------------------------------------------------------ *
 * NAMING THE AUDIENCE BACK TO THE AUTHOR
 * ------------------------------------------------------------------ */

/**
 * What the author should see under a published notice.
 *
 * The count matters more than the label. "Network - Ohio" tells an owner
 * nothing about whether the send worked; "Ohio - 4 studios" tells them
 * immediately, and "Ohio - no studios" is the failure mode above, visible
 * instead of silent.
 */
export function audienceLabel(
  a: Pick<HubAnnouncement, "studioId" | "targetScope" | "targetId"> & {
    targetStudioIds?: string[];
  },
  studios: Pick<Studio, "id" | "name">[],
  networks: Pick<NetworkOption, "id" | "name">[],
): string {
  const studioName = (id: string | undefined) =>
    studios.find((s) => s.id === id)?.name ?? "a studio no longer listed";

  switch (a.targetScope) {
    case "universal":
      return "Everyone";
    case "studio":
      return studioName(a.targetId || a.studioId);
    case "network": {
      const name =
        networks.find((n) => n.id === a.targetId)?.name ??
        "a network no longer listed";
      if (!a.targetStudioIds) {
        return `${name} - owners only (published before scoping)`;
      }
      const count = a.targetStudioIds.length;
      if (count === 0) return `${name} - no studios`;
      return count === 1 ? `${name} - 1 studio` : `${name} - ${count} studios`;
    }
    default:
      return a.studioId === "all" ? "Everyone" : studioName(a.studioId);
  }
}
