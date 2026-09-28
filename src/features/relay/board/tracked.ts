/**
 * TRACKING — the one job this trainer took, riding in My Studio's header.
 *
 * Relay room, Sep 28 2026 (the redesign's Mission Board + Journal, phase 1).
 * World of Warcraft's objective tracker, in AJ's words "a mission tracker":
 * whatever you take on the Board stays in the header on every tab until it
 * is done, so the trainer who took the deep clean at 2:18 still sees
 * "Tracking: Deep clean · 1 of 3" from the Tracker at 2:30.
 *
 * NOTHING IS STORED. Taking a job writes the claim it always wrote (a task
 * instance's `claimedBy`, a request's `claimedBy`); which one of your claims
 * the header shows is this iPad's memory, per studio and studio day, and a
 * sign-out forgets it (the next trainer on a shared iPad has taken nothing).
 * A new day starts with nothing tracked: yesterday's claim is yesterday's.
 *
 * The header lives in the shell and the work lives in the Board's listeners,
 * so the Board PUBLISHES the tracked job's live progress here and the header
 * reads it, the same shape as the Just now store (pulse.ts) and the rings
 * (rings.ts). On another tab the chip shows what the Board last heard.
 */
import { useSyncExternalStore } from "react";
import { forgetOnSignOut } from "../../sign-out/memory";

export interface TrackedItem {
  /** The Board's item id (next-up.ts: "group:…", "ask:…", "job:…", "row:…"). */
  id: string;
  /** Short enough for a chip, and never cut: it wraps. */
  title: string;
  /** Parts done, when the job has parts (a shift group's machines). */
  done: number | null;
  total: number | null;
}

const tracked = new Map<string, TrackedItem>();
const listeners = new Set<() => void>();

// Taking a job is a person talking. The next one to sign in on this iPad has
// taken nothing (sign-out round's rule for module memory, Sep 24 2026).
forgetOnSignOut(() => {
  tracked.clear();
  emit();
});

function emit(): void {
  for (const l of listeners) l();
}

const keyOf = (studioId: string, todayKey: string) => `${studioId}|${todayKey}`;

/** "Take it": this job rides in the header from now on. */
export function trackItem(studioId: string | null, todayKey: string, item: TrackedItem): void {
  if (!studioId || !todayKey || !item.id) return;
  tracked.set(keyOf(studioId, todayKey), { ...item });
  emit();
}

/**
 * Stop tracking. With an id, only when that is the job being tracked, so a
 * job finished on another card never clears a different one.
 */
export function untrack(studioId: string | null, todayKey: string, id?: string): void {
  if (!studioId) return;
  const key = keyOf(studioId, todayKey);
  const cur = tracked.get(key);
  if (!cur) return;
  if (id && cur.id !== id) return;
  tracked.delete(key);
  emit();
}

export function readTracked(studioId: string | null, todayKey: string): TrackedItem | null {
  if (!studioId || !todayKey) return null;
  return tracked.get(keyOf(studioId, todayKey)) ?? null;
}

/**
 * The Board's live word on the tracked job. `null` means it is no longer
 * open work (done, closed, or gone from the day): the chip lets go of it.
 * Anything else refreshes the title and the count; publishing what is
 * already there changes nothing and wakes nobody.
 */
export function publishTrackedProgress(
  studioId: string | null,
  todayKey: string,
  id: string,
  live: Omit<TrackedItem, "id"> | null,
): void {
  const cur = readTracked(studioId, todayKey);
  if (!cur || cur.id !== id) return;
  if (live === null) {
    untrack(studioId, todayKey, id);
    return;
  }
  if (cur.title === live.title && cur.done === live.done && cur.total === live.total) return;
  tracked.set(keyOf(studioId!, todayKey), { id, ...live });
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useTracked(studioId: string | null, todayKey: string): TrackedItem | null {
  return useSyncExternalStore(
    subscribe,
    () => readTracked(studioId, todayKey),
    () => null,
  );
}

/** The chip's words: "Tracking: Deep clean · 1 of 3", or "Tracking: nothing yet". */
export function trackedChipWords(item: TrackedItem | null): string {
  if (!item) return "Tracking: nothing yet";
  const count = item.total && item.total > 1 && item.done !== null ? ` · ${item.done} of ${item.total}` : "";
  return `Tracking: ${item.title}${count}`;
}

/** Test seam. */
export function resetTracked(): void {
  tracked.clear();
  emit();
}
