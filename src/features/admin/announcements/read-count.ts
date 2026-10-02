/**
 * "9 OF 12 HAVE READ IT" (the Atlas answers, Oct 2 2026). Pure:
 * read-count.test.ts.
 *
 * AJ: "mark all should mark everything as read", and a leader sees "9 of 12
 * have read it" on a notice that asks. Until now each person's "I've read
 * it" lived only in their own private announcementReads/{uid}, so nobody
 * could count them. A reader's answer now ALSO goes to a small record of its
 * own, `hub_announcements/{id}/acks/{uid}` (`{ at, name }`, written by the
 * reader alone, never edited by anyone else), which the poster, the studio's
 * leaders, franchise owners and administrators may read. Nobody is pinged:
 * the count is on the notice, for whoever opens it.
 *
 * WHO IS COUNTED ("of 12")
 * ------------------------
 * The people the notice reaches, from the trainers the app already holds:
 * for a notice to one studio, everyone who works there
 * (lib/who-works-here.ts); for a wider one, every active trainer it is
 * targeted at (audience.ts `isTargeted`). The poster is never counted: they
 * don't read their own notice. "9" counts only answers from people in that
 * list, so it can never read more than the whole.
 *
 * WHO SEES IT
 * -----------
 * The poster, administrators and franchise owners, and the leaders of the
 * notice's studio (`leadsHere`) — the same people the rules let read the
 * record. Anyone else sees nothing, not a zero.
 */
import type { HubAnnouncement, Trainer } from "../../../types";
import { whoWorksHere } from "../../../lib/who-works-here";
import { isEveryStudioRole } from "../../renewals/permissions";
import { leadsHere } from "../../relay/leads";
import { isTargeted } from "./audience";

type Notice = Pick<HubAnnouncement, "studioId" | "targetScope" | "targetId" | "readBy" | "authorId" | "asksRead"> & {
  targetStudioIds?: string[];
};

/** The one studio a notice is for, or null when it reaches more than one. */
export function noticeStudioId(a: Notice): string | null {
  if (a.targetScope === "studio") {
    if (a.targetStudioIds && a.targetStudioIds.length === 1) return a.targetStudioIds[0];
    if (a.targetStudioIds && a.targetStudioIds.length > 1) return null;
    if (a.targetId) return a.targetId;
  }
  if (!a.targetScope && a.studioId && a.studioId !== "all") return a.studioId;
  return null;
}

/** Every id a person may have answered under: the sign-in uid first, then the profile id. */
function idsOf(t: Pick<Trainer, "id" | "authUid">): string[] {
  return [t.authUid, t.id].filter((v): v is string => typeof v === "string" && v.length > 0);
}

/** The people the notice reaches, the poster left out. */
export function noticeAudience<T extends Trainer>(a: Notice, trainers: readonly T[]): T[] {
  const studio = noticeStudioId(a);
  const reached = studio
    ? whoWorksHere(trainers, studio)
    : trainers.filter((t) => {
        const flags = t as { isActive?: boolean; isDemo?: boolean };
        return Boolean(t.id) && flags.isActive !== false && !t.supersededByUid && flags.isDemo !== true && isTargeted(a, t);
      });
  const seen = new Set<string>();
  return reached.filter((t) => {
    if (!t.id || seen.has(t.id)) return false;
    seen.add(t.id);
    return !idsOf(t).includes(a.authorId);
  });
}

/** May this person see how many have read it? */
export function maySeeReadCount(viewer: Trainer | null | undefined, uid: string | null | undefined, a: Notice): boolean {
  if (!viewer || !a.asksRead) return false;
  if (uid && a.authorId === uid) return true;
  if (viewer.id && a.authorId === viewer.id) return true;
  if (isEveryStudioRole(viewer)) return true;
  const studio = noticeStudioId(a);
  return studio ? leadsHere(viewer, studio) : false;
}

export type ReadCount = { state: "known"; read: number; of: number } | { state: "unknown" };

/** How many of the audience have said "I've read it". */
export function readCountOf(a: Notice, trainers: readonly Trainer[], ackIds: ReadonlySet<string> | null): ReadCount {
  if (!ackIds) return { state: "unknown" };
  const audience = noticeAudience(a, trainers);
  const read = audience.filter((t) => idsOf(t).some((id) => ackIds.has(id))).length;
  return { state: "known", read, of: audience.length };
}

/** "9 of 12 have read it", "All 12 have read it", or why it can't say. */
export function readCountSentence(c: ReadCount): string {
  if (c.state === "unknown") return "Couldn’t check who has read it just now.";
  if (c.of === 0) return "Nobody else on the team to read it yet.";
  if (c.read === c.of) return c.of === 1 ? "They’ve read it." : `All ${c.of} have read it.`;
  return `${c.read} of ${c.of} ${c.read === 1 ? "has" : "have"} read it.`;
}
