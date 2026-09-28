/**
 * THE LAST-SEEN MARKER — "since you were in" needs to know when that was
 * (the second wave of the Relay room, Sep 28 2026; AJ approved the one small
 * document).
 *
 *   studios/{studioId}/lastSeen/{uid}   { at, updatedAt }  (both server time)
 *
 * One document per trainer per studio, read and written only by that person
 * (the Auth uid is in the path; firestore.rules "WAVE 2 RELAY: the last-seen
 * marker"). Nobody else can see when someone was in: it is a reading
 * position, not a register.
 *
 * How it moves:
 *   - The first time the Board opens in a session, the marker is read once
 *     (a get, never a listener) and remembered for the session: that is what
 *     "since you were in" is measured from until sign-out. Then the marker
 *     is moved to now, so the next session starts from this visit. Moving it
 *     is skipped when it moved in the last few minutes (a remount).
 *   - "Mark all read" moves both, to now.
 *   - A read that fails is unknown: nothing is marked new (never "all new"),
 *     the Board says it couldn't check, and the marker is not moved.
 *
 * The session memory is per studio and person, and a sign-out forgets it.
 */
import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { forgetOnSignOut } from "../../sign-out/memory";
import { millisOf } from "./since";

/** A marker moved this recently is not moved again (a remount, a tab switch). */
export const MARKER_MIN_GAP_MS = 5 * 60_000;

export function lastSeenRef(studioId: string, uid: string) {
  return doc(db, "studios", studioId, "lastSeen", uid);
}

/** What "since you were in" is measured from, this session: studio|uid → ms, or null (no marker yet). */
const session = new Map<string, number | null>();
/** A read on its way, so two Boards mounting at once (StrictMode, a remount) read and move the marker once. */
const reading = new Map<string, Promise<number | null>>();
forgetOnSignOut(() => {
  session.clear();
  reading.clear();
});

/** Test seam. */
export function resetLastSeen(): void {
  session.clear();
  reading.clear();
}

/** Read the marker once for the session, and move it to now. Rejects when it can't be read. */
function readOnce(key: string, studioId: string, uid: string): Promise<number | null> {
  const known = reading.get(key);
  if (known) return known;
  const p = getDoc(lastSeenRef(studioId, uid)).then((snap) => {
    const at = snap.exists() ? millisOf((snap.data() as { at?: unknown }).at) : null;
    session.set(key, at);
    if (at === null || Date.now() - at > MARKER_MIN_GAP_MS) void moveMarker(studioId, uid);
    return at;
  });
  reading.set(key, p);
  // A failed read may be tried again on the next visit.
  p.catch(() => reading.delete(key));
  return p;
}

/** Move the marker to now. Fire and forget: a failed write leaves it where it was, which is safe. */
export function moveMarker(studioId: string, uid: string): Promise<void> {
  return setDoc(lastSeenRef(studioId, uid), { at: serverTimestamp(), updatedAt: serverTimestamp() }).catch((err) => {
    console.warn("[relay] last-seen marker not moved:", err);
  });
}

export interface LastSeen {
  /** ms of the last visit; null with no marker yet; undefined while it loads or when it couldn't be read. */
  seenAt: number | null | undefined;
  /** The marker couldn't be read: nothing is marked new. */
  failed: boolean;
  markAllRead: () => void;
}

export function useLastSeen(studioId: string | null, uid: string | null): LastSeen {
  const key = studioId && uid ? `${studioId}|${uid}` : null;
  const [seenAt, setSeenAt] = useState<number | null | undefined>(() => (key && session.has(key) ? session.get(key) : undefined));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!key || !studioId || !uid) {
      setSeenAt(undefined);
      return;
    }
    if (session.has(key)) {
      setSeenAt(session.get(key));
      return;
    }
    setSeenAt(undefined);
    let live = true;
    readOnce(key, studioId, uid)
      .then((at) => {
        if (live) setSeenAt(at);
      })
      .catch((err) => {
        console.warn("[relay] last-seen marker couldn't be read:", err);
        if (live) {
          setFailed(true);
          setSeenAt(undefined);
        }
      });
    return () => {
      live = false;
    };
  }, [key, studioId, uid]);

  const markAllRead = useCallback(() => {
    if (!key || !studioId || !uid) return;
    const now = Date.now();
    session.set(key, now);
    setSeenAt(now);
    setFailed(false);
    void moveMarker(studioId, uid);
  }, [key, studioId, uid]);

  return { seenAt, failed, markAllRead };
}

/* ------------------------------------------------------------------ *
 * Notices tapped as seen, on this iPad, for the session
 * ------------------------------------------------------------------ */

const tapped = new Map<string, Set<string>>();
forgetOnSignOut(() => tapped.clear());

export function tappedKeys(studioId: string | null): Set<string> {
  return (studioId && tapped.get(studioId)) || new Set<string>();
}

export function tapNotice(studioId: string | null, key: string): void {
  if (!studioId) return;
  const next = new Set(tapped.get(studioId) ?? []);
  next.add(key);
  tapped.set(studioId, next);
}

/** Test seam. */
export function resetTapped(): void {
  tapped.clear();
}
