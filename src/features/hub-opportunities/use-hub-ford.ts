/**
 * THE HUB'S FORD, READ ONCE PER STUDIO VISIT (wave 2 hub, Sep 28 2026).
 *
 * Get to know (get-to-know.ts) needs the studio's FORD details, and AJ OK'd
 * one read of them for the Hub ("all yes"). This holds that read:
 *
 *   - ONE query (ford/hub-read.ts), made the first time the Hub opens on a
 *     studio, for every day on its strip at once (`askReadWindow`), so
 *     flipping days never reads again;
 *   - held in memory for the rest of the visit: coming back to the Hub
 *     between sessions reuses it. A new visit reads again — another studio,
 *     a new studio day (the windows move), or the next person on the iPad
 *     (`forgetOnSignOut`: another person may not work at this studio, and
 *     FORD is a client's home life). A detail noted today is asked about
 *     from the next visit, which for "noted in the last two weeks" costs a
 *     day at most;
 *   - only the server's answer is held. A failure, or an answer this iPad's
 *     cache gave alone (offline), is asked again at the next visit, or when
 *     the iPad comes back online.
 *
 * Opened only for someone the rules let read the studio's FORD
 * (`mayReadWeeks`, the Hub's one mirror of writesForStudio: the people who
 * work there, franchise owners, administrators), so nobody opens a read the
 * rules refuse. No listener, no write, no per-client query.
 *
 * UNKNOWN IS NOT EMPTY. `fordFor(id)` is `[]` for a client read and holding
 * nothing, and null when her details are unknown (the read failed, or came
 * back at the guard rail without any of hers): the engine then marks her
 * `askUnknown`, and the list and the peek say FORD couldn't be checked
 * rather than "nothing special". While there is no answer yet, or no read
 * at all, `fordFor` is absent and Get to know is simply not in play.
 */
import { useEffect, useMemo, useState } from "react";
import { studioDayBoundsForKey } from "../../lib/studio-time";
import type { FordEntry } from "../ford/types";
import { fetchHubFord, type HubFordRead, type HubFordWindow } from "../ford/hub-read";
import { forgetOnSignOut } from "../sign-out/memory";
import { askReadWindow, fordByClient } from "./get-to-know";

export type HubFordStatus =
  /** No read: no studio, or a viewer the rules wouldn't let read its FORD. */
  | "off"
  | "loading"
  /** The server answered in full (or this iPad's cache did, offline). */
  | "ready"
  /** It answered at the guard rail: what was read is real, silence is not. */
  | "partial"
  | "failed";

export interface HubFord {
  status: HubFordStatus;
  /** The engine's `fordFor` (moments-today). Absent while Get to know isn't in play. */
  fordFor?: (clientId: string) => readonly FordEntry[] | null;
}

const NONE: readonly FordEntry[] = Object.freeze([]) as readonly FordEntry[];

/* ------------------------------------------------------------------ */
/* The visit's one read, held                                          */
/* ------------------------------------------------------------------ */

/** The one visit held: `${studioId}|${studio day}`, and the server's answer. */
let held: { key: string; read: HubFordRead } | null = null;
const inFlight = new Map<string, Promise<HubFordRead>>();
/** Bumped at sign-out, so a read still on its way is never held for the next person. */
let generation = 0;

forgetOnSignOut(() => {
  held = null;
  inFlight.clear();
  generation += 1;
});

const visitKey = (studioId: string, today: string) => `${studioId}|${today}`;

/** The instants of the strip's window: the studio's midnights. */
export function hubFordWindow(today: string): HubFordWindow {
  const w = askReadWindow(today);
  const midnight = (day: string) => studioDayBoundsForKey(day).start;
  return { datedFrom: midnight(w.datedFrom), datedUntil: midnight(w.datedUntil), notedFrom: midnight(w.notedFrom) };
}

/** The answer held for this visit, or null. */
export function heldHubFord(studioId: string, today: string): HubFordRead | null {
  return held && held.key === visitKey(studioId, today) ? held.read : null;
}

/**
 * The studio's FORD for the visit: the one held, or one read (a read already
 * on its way is shared). Holding a new visit lets the last one go.
 */
export function loadHubFord(studioId: string, today: string): Promise<HubFordRead> {
  const key = visitKey(studioId, today);
  const h = heldHubFord(studioId, today);
  if (h) return Promise.resolve(h);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const gen = generation;
  const read = fetchHubFord(studioId, hubFordWindow(today)).then((answer) => {
    if (gen === generation) {
      inFlight.delete(key);
      if ((answer.status === "ready" || answer.status === "partial") && !answer.fromCache) held = { key, read: answer };
    }
    return answer;
  });
  inFlight.set(key, read);
  return read;
}

/* ------------------------------------------------------------------ */
/* What the engine is handed                                           */
/* ------------------------------------------------------------------ */

/** The read as the engine takes it. Pure: use-hub-ford.test.ts. */
export function hubFordOf(read: HubFordRead | null, reading: boolean): HubFord {
  if (!reading) return { status: "off" };
  if (!read) return { status: "loading" };
  // Refused: the FORD is another studio's to read. Nothing to say, and nothing unknown to confess.
  if (read.status === "denied") return { status: "off" };
  if (read.status === "failed") return { status: "failed", fordFor: () => null };
  const byClient = fordByClient(read.details);
  const partial = read.status === "partial";
  return { status: read.status, fordFor: (clientId) => byClient.get(clientId) ?? (partial ? null : NONE) };
}

/**
 * The Hub's FORD for Get to know. `studioId` is null for anyone who may not
 * read it (the caller asks `mayReadWeeks`); `today` is the studio's day.
 */
export function useHubFord(studioId: string | null | undefined, today: string): HubFord {
  const key = studioId ? visitKey(studioId, today) : null;
  const [answer, setAnswer] = useState<{ key: string | null; read: HubFordRead | null }>(() => ({
    key,
    read: studioId ? heldHubFord(studioId, today) : null,
  }));
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!studioId) return;
    let live = true;
    void loadHubFord(studioId, today).then((read) => {
      if (live) setAnswer((prev) => (prev.key === key && prev.read === read ? prev : { key, read }));
    });
    return () => {
      live = false;
    };
  }, [studioId, today, key, retry]);

  // An answer about another visit is this one still loading.
  const current = answer.key === key ? answer.read : studioId ? heldHubFord(studioId, today) : null;

  // A failure, or the cache's answer alone, is asked again when the iPad comes back online.
  const settled = current !== null && current.status !== "failed" && !current.fromCache;
  useEffect(() => {
    if (!key || current === null || settled) return;
    const again = () => setRetry((n) => n + 1);
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [key, current, settled]);

  return useMemo(() => hubFordOf(key ? current : null, key !== null), [current, key]);
}
