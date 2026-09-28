/**
 * THE NIGHTLY MARKS, READ ONCE PER STUDIO VISIT (wave 2 hub, Sep 28 2026).
 *
 * All stars (all-stars.ts) is twenty-six weeks of visits, which the iPad
 * never works out: the nightly renewals job does, and writes the studio's all
 * stars to ONE document, `studios/{studioId}/watch/hubMarks` (`allStars`,
 * `computedAt`). This reads it:
 *
 *   - ONE `getDoc` by id, the first time the Hub opens on a studio that day,
 *     held in memory for the rest of the visit — coming back to the Hub
 *     between sessions reuses it; another studio, a new studio day, or the
 *     next person on the iPad (`forgetOnSignOut`) reads it again;
 *   - only the server's answer is held ("there is none" included, until the
 *     next studio day: the job writes at night). A failure, or an answer
 *     this iPad's cache gave alone, is asked again at the next visit or when
 *     the iPad comes back online;
 *   - `readHubMarks` decides what may be said, against the Hub's own clock,
 *     so marks that turn three days old while the Hub is open fall silent.
 *
 * Opened only for someone who works at the studio (`mayReadWeeks`, the same
 * answer the rules give: `studios/{s}/watch/{doc}` is read by the studio's
 * people, franchise owners and administrators, and written only by the job).
 * No listener, no write, no per-client read, and nothing is said about a
 * client the marks don't name — nor anything at all when the document is
 * missing, stale or unreadable.
 */
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { forgetOnSignOut } from "../sign-out/memory";
import { HUB_MARKS_WATCH_ID, readHubMarks, type AllStarMark } from "./all-stars";

/** What one read brought back: the document's data, "none", or a failure. */
export type HubMarksFetch =
  | { status: "found"; data: unknown; fromCache: boolean }
  | { status: "none"; fromCache: boolean }
  | { status: "failed" };

export type HubMarksStatus =
  /** No read: no studio, or a viewer the rules wouldn't let read it. */
  | "off"
  | "loading"
  | "ready"
  /** The job hasn't written one yet. */
  | "none"
  /** Older than three days. */
  | "stale"
  /** Not readable: the read failed, or the document isn't one this app can read. */
  | "unreadable";

export interface HubMarks {
  status: HubMarksStatus;
  /** The engine's `allStarOf` (moments-today): present only while the marks may be spoken. */
  allStarOf?: (clientId: string) => AllStarMark | null;
}

/** Read the document once. Never throws. */
export async function fetchHubMarks(studioId: string): Promise<HubMarksFetch> {
  try {
    const snap = await getDoc(doc(db, "studios", studioId, "watch", HUB_MARKS_WATCH_ID));
    const fromCache = snap.metadata?.fromCache === true;
    return snap.exists() ? { status: "found", data: snap.data(), fromCache } : { status: "none", fromCache };
  } catch (err) {
    console.warn("[hub] the nightly marks couldn't be read:", (err as { code?: string })?.code ?? err);
    return { status: "failed" };
  }
}

/* ------------------------------------------------------------------ */
/* The visit's one read, held                                          */
/* ------------------------------------------------------------------ */

let held: { key: string; read: HubMarksFetch } | null = null;
const inFlight = new Map<string, Promise<HubMarksFetch>>();
/** Bumped at sign-out, so a read still on its way is never held for the next person. */
let generation = 0;

forgetOnSignOut(() => {
  held = null;
  inFlight.clear();
  generation += 1;
});

const visitKey = (studioId: string, today: string) => `${studioId}|${today}`;

/** The server's answer held for this visit, or null. */
export function heldHubMarks(studioId: string, today: string): HubMarksFetch | null {
  return held && held.key === visitKey(studioId, today) ? held.read : null;
}

/** A server's answer, which is held; a failure or the cache's answer alone is not. */
const isServerAnswer = (read: HubMarksFetch) => read.status !== "failed" && !read.fromCache;

export function loadHubMarks(studioId: string, today: string): Promise<HubMarksFetch> {
  const key = visitKey(studioId, today);
  const h = heldHubMarks(studioId, today);
  if (h) return Promise.resolve(h);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const gen = generation;
  const read = fetchHubMarks(studioId).then((answer) => {
    if (gen === generation) {
      inFlight.delete(key);
      if (isServerAnswer(answer)) held = { key, read: answer };
    }
    return answer;
  });
  inFlight.set(key, read);
  return read;
}

/* ------------------------------------------------------------------ */
/* What the engine is handed                                           */
/* ------------------------------------------------------------------ */

/** The read as the engine takes it, on the Hub's clock. Pure: use-hub-marks.test.ts. */
export function hubMarksOf(read: HubMarksFetch | null, reading: boolean, now: Date): HubMarks {
  if (!reading) return { status: "off" };
  if (!read) return { status: "loading" };
  if (read.status === "failed") return { status: "unreadable" };
  if (read.status === "none") return { status: "none" };
  const marks = readHubMarks(read.data, now);
  if (marks.state !== "ok") return { status: marks.state };
  const { allStars } = marks;
  return { status: "ready", allStarOf: (clientId) => allStars.get(clientId) ?? null };
}

/** The date `now` is read against, to the hour: marks go stale on the hour, not on every minute's render. */
const hourOf = (now: Date) => Math.floor(now.getTime() / 3_600_000);

/**
 * The Hub's nightly marks. `studioId` is null for anyone who may not read
 * them (the caller asks `mayReadWeeks`); `today` is the studio's day; `now`
 * the Hub's minute clock.
 */
export function useHubMarks(studioId: string | null | undefined, today: string, now: Date): HubMarks {
  const key = studioId ? visitKey(studioId, today) : null;
  const [answer, setAnswer] = useState<{ key: string | null; read: HubMarksFetch | null }>(() => ({
    key,
    read: studioId ? heldHubMarks(studioId, today) : null,
  }));
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!studioId) return;
    let live = true;
    void loadHubMarks(studioId, today).then((read) => {
      if (live) setAnswer((prev) => (prev.key === key && prev.read === read ? prev : { key, read }));
    });
    return () => {
      live = false;
    };
  }, [studioId, today, key, retry]);

  const current = answer.key === key ? answer.read : studioId ? heldHubMarks(studioId, today) : null;

  // A failure, or the cache's answer alone, is asked again when the iPad comes back online.
  const settled = current !== null && isServerAnswer(current);
  useEffect(() => {
    if (!key || current === null || settled) return;
    const again = () => setRetry((n) => n + 1);
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [key, current, settled]);

  const hour = hourOf(now);
  return useMemo(() => hubMarksOf(key ? current : null, key !== null, new Date(hour * 3_600_000)), [current, key, hour]);
}
