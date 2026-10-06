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
