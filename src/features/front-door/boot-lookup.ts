/**
 * THE BOOT LOOKUP'S RULES (the speed round, Oct 5 2026, R4). PURE: no React,
 * no Firestore.
 *
 * Opening Journey used to be a chain of server reads, one after another: the
 * trainer record, then (sometimes) a fresh token, then every studio, then
 * every trainer, then every network, and only then the app. On connected but
 * dead gym Wi-Fi each read waited about ten seconds for the SDK to give up on
 * the server. Now the trainer record is read from the iPad's own copy first
 * and the app opens on it; the three lists are read together; and a live
 * watch on the person's own record corrects anything the copy had wrong.
 *
 * What makes that safe is that nothing is ever said off a list that hasn't
 * answered. Each list carries how much is known about it:
 *
 *   unknown  nothing has answered (or the only answer was an empty one from
 *            the iPad's copy, which can't tell "none" from "never read");
 *   cache    the iPad's own copy answered with something;
 *   server   the server answered.
 *
 * The picker says "Checking you in" while it can't tell, never "No studios
 * yet" or "Not on a studio's team yet"; team sizes and the greeting's today
 * wait for the trainers; and dropping anything because it's missing (a pinned
 * studio, the open studio) waits for the server.
 */

export type ReadLevel = "unknown" | "cache" | "server";

const RANK: Record<ReadLevel, number> = { unknown: 0, cache: 1, server: 2 };

/** Knowledge only grows: a later answer from the cache never unconfirms the server's. */
export function raise(prev: ReadLevel, next: ReadLevel): ReadLevel {
  return RANK[next] > RANK[prev] ? next : prev;
}

/**
 * Whether a listener's answer counts. An EMPTY answer the cache gave alone
 * is not one: offline with nothing stored, the SDK answers "no documents",
 * and that is unknown, never empty.
 */
export function answerCounts(count: number, fromCache: boolean): boolean {
  return !(fromCache && count === 0);
}

/**
 * Whether the iPad's own copy of a list may be trusted to be the WHOLE list
 * (the speed round's review, Oct 5 2026). The copy holds only what this iPad
 * has read: on a first sign-in it may hold the person's own trainer record
 * and nothing else, and that would say "1 on the team". So a copy counts only
 * after this iPad has had the server's whole answer for the list at least
 * once (`seen`, kept in local storage under LIST_SEEN_PREFIX), and a copy of
 * the trainers holding one record (the person's own, read at sign-in) never
 * does. Otherwise the list stays unknown until the server answers.
 */
export function cacheAnswerUsable(list: keyof BootKnowledge, count: number, seen: boolean): boolean {
  if (!seen || count === 0) return false;
  if (list === "trainers" && count < 2) return false;
  return true;
}

/** Whether an answer counts: the server's always; the iPad's copy by cacheAnswerUsable. */
export function listAnswerCounts(
  list: keyof BootKnowledge,
  count: number,
  fromCache: boolean,
  seen: boolean,
): boolean {
  return fromCache ? cacheAnswerUsable(list, count, seen) : true;
}

/** Local-storage key prefix: this iPad has had the server's whole answer for the list. */
export const LIST_SEEN_PREFIX = "journey_list_seen_";

/** The part of Web Storage this module uses. */
interface FlagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Has this iPad had the server's whole answer for `list`? Storage that throws: no. */
export function listSeen(storage: FlagStorage | null | undefined, list: keyof BootKnowledge): boolean {
  try {
    return storage?.getItem(LIST_SEEN_PREFIX + list) === "1";
  } catch {
    return false;
  }
}

/** Remember that the server answered for `list` in full. Storage that throws: nothing. */
export function markListSeen(storage: FlagStorage | null | undefined, list: keyof BootKnowledge): void {
  try {
    storage?.setItem(LIST_SEEN_PREFIX + list, "1");
  } catch {
    /* Private window or storage off: the copy just isn't trusted next time. */
  }
}

/** The level an answer that counts raises a list to. */
export function levelOf(fromCache: boolean): ReadLevel {
  return fromCache ? "cache" : "server";
}

export interface BootKnowledge {
  studios: ReadLevel;
  trainers: ReadLevel;
  networks: ReadLevel;
}

export const NOTHING_KNOWN: BootKnowledge = { studios: "unknown", trainers: "unknown", networks: "unknown" };

/**
 * Whether the studio picker must wait ("Checking you in") rather than say
 * what it found. With no studios read, "No studios yet" would be a guess;
 * with none of your own and the networks unread, "Not on a studio's team
 * yet" would be one too (a franchise owner's studios come through their
 * networks).
 */
export function pickerWaits(input: { studiosKnown: boolean; networksKnown: boolean; mine: number }): boolean {
  if (!input.studiosKnown) return true;
  return input.mine === 0 && !input.networksKnown;
}

/** The fields that decide what a person may open. */
const ACCESS_FIELDS = [
  "role",
  "isActive",
  "primaryHomeStudioId",
  "accessibleStudioIds",
  "activeGuestStudioIds",
  "ownedStudioIds",
  "managedStudioIds",
] as const;

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = Array.isArray(a) ? a : [];
    const y = Array.isArray(b) ? b : [];
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return (a ?? null) === (b ?? null);
}

/**
 * Did the person's access change between two copies of their record? The
 * self-watch re-sets the signed-in trainer only then, so a leader demoted
 * while the app was closed is corrected within one round trip of opening it,
 * and an ordinary edit (a photo, a nickname) re-renders nothing.
 */
export function accessChanged(prev: Record<string, unknown> | null | undefined, next: Record<string, unknown>): boolean {
  if (!prev) return true;
  return ACCESS_FIELDS.some((f) => !same(prev[f], next[f]));
}

/** A trainer record as the app holds it: the id, the fields, a role always. */
export function trainerFromDoc<T>(id: string, data: Record<string, unknown>): T {
  return { id, ...data, role: (data.role as string) || "LifeTransformer" } as T;
}

export const TIMED_OUT = Symbol("timed out");

/** The promise's answer, or TIMED_OUT after `ms`. The promise keeps running. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(TIMED_OUT), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(TIMED_OUT);
      },
    );
  });
}
