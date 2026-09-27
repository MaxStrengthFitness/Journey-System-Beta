/**
 * RELOAD ONCE, AND COME BACK TO THE SAME PLACE (new-version round, Sep 26
 * 2026).
 *
 * Two small records in session storage, which a reload keeps (it is the same
 * app in the same window) and a relaunch does not:
 *
 *   - THE LOOP GUARD. What this app last reloaded for, and when. A reload that
 *     did not bring the new version (Render was mid-swap, or the screen still
 *     would not open) must not become a reload every few seconds. Automatic
 *     reloads for the same target are spaced ten minutes apart; a person's tap
 *     is not held to it. It belongs to the iPad, not the person.
 *
 *   - WHERE YOU WERE. The screen and the client, noted just before a reload
 *     and taken back once when the app is up again, within two minutes and for
 *     the same person. A trainer who tapped a profile whose file was gone
 *     lands on that profile in the new version rather than on the Hub, and a
 *     Start whose Active Session screen was gone comes back into the session.
 *     It is a one-shot handoff, so sign-out forgets it
 *     (sign-out/sign-out.ts, SESSION_HANDOFF_PREFIXES).
 *
 * PURE apart from the storage it is handed. A storage that throws (a private
 * window) makes every answer "nothing recorded": the guard then allows one
 * reload, and a failed reload lands on the Hub, as a reload always has.
 */

export const RELOAD_KEY = "journey:new-version:reload";
export const PLACE_KEY = "journey:new-version:place";

/** Automatic reloads for the same target are at least this far apart. */
export const RELOAD_AGAIN_AFTER_MS = 10 * 60_000;
/** A remembered place older than this is not where anybody was. */
export const PLACE_FRESH_MS = 2 * 60_000;

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function readJson(storage: SessionStorageLike | null | undefined, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: SessionStorageLike | null | undefined, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* best effort: without it the guard allows one more reload, no more */
  }
}

/* ------------------------------------------------------------------ *
 * The loop guard.
 * ------------------------------------------------------------------ */

/** True when this app reloaded for `target` less than ten minutes ago. */
export function triedAlready(
  storage: SessionStorageLike | null | undefined,
  target: string,
  now: number,
): boolean {
  const rec = readJson(storage, RELOAD_KEY) as { target?: unknown; at?: unknown } | null;
  if (!rec || rec.target !== target || typeof rec.at !== "number") return false;
  return now - rec.at >= 0 && now - rec.at < RELOAD_AGAIN_AFTER_MS;
}

export function noteReload(storage: SessionStorageLike | null | undefined, target: string, now: number): void {
  writeJson(storage, RELOAD_KEY, { target, at: now });
}

/* ------------------------------------------------------------------ *
 * Where you were.
 * ------------------------------------------------------------------ */

export interface ReturnPlace {
  view: string;
  clientId: string | null;
}

export function rememberPlace(
  storage: SessionStorageLike | null | undefined,
  place: ReturnPlace,
  uid: string,
  now: number,
): void {
  writeJson(storage, PLACE_KEY, { view: place.view, clientId: place.clientId, uid, at: now });
}

/**
 * The place remembered before the reload, ONCE: it is removed as it is read,
 * whatever the answer. Nothing for another person, nothing stale, and nothing
 * this build does not know how to show: the reload went from one version to
 * another, and a screen the new one renamed would otherwise open blank.
 */
export function takePlace(
  storage: SessionStorageLike | null | undefined,
  uid: string,
  now: number,
  isKnownView: (view: string) => boolean,
): ReturnPlace | null {
  const rec = readJson(storage, PLACE_KEY) as
    | { view?: unknown; clientId?: unknown; uid?: unknown; at?: unknown }
    | null;
  if (storage) {
    try {
      storage.removeItem(PLACE_KEY);
    } catch {
      /* nothing to clear */
    }
  }
  if (!rec || rec.uid !== uid || typeof rec.at !== "number") return null;
  if (now - rec.at < 0 || now - rec.at > PLACE_FRESH_MS) return null;
  if (typeof rec.view !== "string" || !isKnownView(rec.view)) return null;
  const clientId = typeof rec.clientId === "string" && rec.clientId.trim() !== "" ? rec.clientId : null;
  return { view: rec.view, clientId };
}
