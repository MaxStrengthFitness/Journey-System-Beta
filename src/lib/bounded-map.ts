/**
 * A Map kept to its last N keys (the iPad round, Oct 2026, audit W11).
 *
 * Some module memories only cleared at sign-out, and a studio iPad is rarely
 * signed out: a memory that gains an entry per client, per session or per
 * range looked at grows for days, and iPadOS kills a Home Screen app that
 * holds too much (a cold start and a full re-read for the trainer). These
 * keep the most recently used keys and let the oldest go; a key let go is
 * read again the next time it is wanted, as on a fresh start.
 *
 * A Map iterates in insertion order, so "used" means deleted and set again.
 */

/** Keep `value` under `key` as the newest entry, and let the oldest go past `max`. */
export function setBounded<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

/** The value under `key`, marked as just used. */
export function getBounded<K, V>(map: Map<K, V>, key: K): V | undefined {
  if (!map.has(key)) return undefined;
  const value = map.get(key) as V;
  map.delete(key);
  map.set(key, value);
  return value;
}
