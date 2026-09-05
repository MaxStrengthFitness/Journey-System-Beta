/**
 * CLIENT ROLLUPS — the numbers the profile header and Equipment tab read
 * without loading history.
 *
 * Two rollups live on the client document:
 *
 *   trainerTally   { [trainerKey]: completedSessions }   → Top Trainer
 *   machineStats   { [machineId]: ClientMachineStat }    → first / times / progression
 *
 * Both are maintained at the moment a completed session is written — finishing
 * a live session (lib/sync-utils.ts) and the legacy CSV import
 * (components/LegacyChartImporter.tsx) — and unwound when a session is deleted
 * from the History tab. Everything in this file is PURE: it takes plain data
 * and returns the Firestore update object. The callers add `increment()` /
 * `serverTimestamp()` through the small `FieldOps` seam so the maths here can
 * be unit-tested without Firestore.
 *
 * Why a tally and not a stored winner only: with two trainers at 22 and 23
 * sessions, the winner flips on a single session. Storing the counts and
 * deriving the winner means the header is right the moment the write lands,
 * and a deleted session takes its vote back with it.
 */

import type { Client, ClientMachineStat, Trainer } from "../types";

/* ------------------------------------------------------------------ *
 * Keys
 * ------------------------------------------------------------------ */

/**
 * Sessions carry a trainerId most of the time. Imported and very old
 * sessions sometimes only carry initials (or the placeholder
 * "legacy-trainer"). Those still count — they are coached sessions — but
 * they are tallied under an `initials:` key so a later resolve can map them
 * to a trainer document by initials.
 */
export function trainerKeyFor(session: {
  trainerId?: string | null;
  trainerInitials?: string | null;
  trainerName?: string | null;
}): string | null {
  const id = (session.trainerId || "").trim();
  if (id && id !== "legacy-trainer" && id !== "unknown") return id;
  const initials = (session.trainerInitials || "").trim().toUpperCase();
  if (initials && initials !== "LEGACY" && initials !== "CHART" && initials !== "--" && initials !== "—") {
    return `initials:${initials}`;
  }
  return null;
}

/** Firestore field paths cannot contain "." — trainer ids are opaque, so sanitise. */
export function tallyFieldKey(trainerKey: string): string {
  return trainerKey.replace(/[.~*/[\]]/g, "_");
}

/* ------------------------------------------------------------------ *
 * Top trainer
 * ------------------------------------------------------------------ */

export interface TopTrainer {
  key: string;
  /** Resolved trainer document, when the key maps to one. */
  trainer: Trainer | null;
  /** Display name: the trainer's full name, or the bare initials. */
  name: string;
  sessions: number;
  /** Total tallied sessions across every trainer — for "23 of 46". */
  total: number;
  /** Share of all tallied sessions, 0–1. */
  share: number;
}

function resolveTrainer(key: string, trainers: Trainer[]): Trainer | null {
  if (key.startsWith("initials:")) {
    const initials = key.slice("initials:".length);
    return trainers.find((t) => (t.initials || "").toUpperCase() === initials) ?? null;
  }
  return trainers.find((t) => t.id === key) ?? null;
}

/**
 * Derive the top trainer from a tally. Ties break toward `preferKey` (the
 * previously stored winner) so the header does not flip-flop on an even
 * split; failing that, the first key in insertion order.
 */
export function resolveTopTrainer(
  tally: Record<string, number> | undefined | null,
  trainers: Trainer[],
  preferKey?: string | null,
): TopTrainer | null {
  if (!tally) return null;
  let bestKey: string | null = null;
  let best = 0;
  let total = 0;
  for (const [key, raw] of Object.entries(tally)) {
    const n = Number(raw) || 0;
    if (n <= 0) continue;
    total += n;
    if (n > best || (n === best && key === preferKey)) {
      best = n;
      bestKey = key;
    }
  }
  if (!bestKey) return null;
  const trainer = resolveTrainer(bestKey, trainers);
  return {
    key: bestKey,
    trainer,
    name: trainer?.fullName || (bestKey.startsWith("initials:") ? bestKey.slice(9) : "Unknown trainer"),
    sessions: best,
    total,
    share: total > 0 ? best / total : 0,
  };
}

/** Build a tally from scratch — the one-time backfill and the tests use this. */
export function tallyFromSessions(
  sessions: Array<{
    status?: string;
    trainerId?: string | null;
    trainerInitials?: string | null;
    trainerName?: string | null;
  }>,
): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const s of sessions) {
    if (s.status && s.status !== "Completed") continue;
    const key = trainerKeyFor(s);
    if (!key) continue;
    const field = tallyFieldKey(key);
    tally[field] = (tally[field] || 0) + 1;
  }
  return tally;
}

/* ------------------------------------------------------------------ *
 * Machine stats
 * ------------------------------------------------------------------ */

export interface RollupLog {
  machineId?: string | null;
  weight?: string | number | null;
  reps?: string | number | null;
  seconds?: string | number | null;
}

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** "2026-09-02", "2026-09-02T10:00", "9/2/2026" → "2026-09-02". Date-only, timezone-proof. */
export function toIsoDay(raw: string | Date | undefined | null): string {
  if (!raw) return "";
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return "";
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}-${String(raw.getDate()).padStart(2, "0")}`;
  }
  const s = String(raw).trim().replace(" ", "T").split("T")[0];
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const t = new Date(String(raw));
  return Number.isNaN(t.getTime()) ? "" : toIsoDay(t);
}

/**
 * The Firestore operations a caller supplies. Kept as a seam so the pure
 * functions can be tested with plain numbers (see client-rollups.test.ts).
 */
export interface FieldOps {
  increment: (n: number) => unknown;
  serverTimestamp: () => unknown;
}

/** Plain-number implementation used by tests and by the backfill preview. */
export const plainFieldOps: FieldOps = {
  increment: (n) => n,
  serverTimestamp: () => new Date().toISOString(),
};

/**
 * Update object (dot-path keys, ready for `updateDoc`/`batch.update`) that
 * records ONE completed session for the client.
 *
 *  - trainerTally.<key>       increment(1)
 *  - topTrainerId / Name / Sessions   re-derived from the tally the caller
 *    already has in memory + this session (best-effort; the header derives
 *    its own from the live tally, so a stale local copy is harmless)
 *  - machineStats.<id>.timesPerformed increment(1), first* fill blanks,
 *    last* overwrite.
 */
export function completedSessionRollup(
  client: Pick<Client, "trainerTally" | "machineStats" | "topTrainerId"> | null | undefined,
  session: {
    date?: string | Date | null;
    trainerId?: string | null;
    trainerInitials?: string | null;
    trainerName?: string | null;
  },
  logs: RollupLog[],
  trainers: Trainer[],
  ops: FieldOps,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const day = toIsoDay(session.date ?? new Date());

  /* ---- trainer tally ---- */
  const key = trainerKeyFor(session);
  if (key) {
    const field = tallyFieldKey(key);
    updates[`trainerTally.${field}`] = ops.increment(1);
    const projected: Record<string, number> = { ...(client?.trainerTally || {}) };
    projected[field] = (projected[field] || 0) + 1;
    const top = resolveTopTrainer(projected, trainers, client?.topTrainerId);
    if (top) {
      updates.topTrainerId = top.key;
      // Only write a name we actually resolved — a caller that passed just
      // the finishing trainer must not stamp "Unknown trainer" over a name
      // an earlier write got right. The header derives its own name anyway.
      if (top.trainer || top.key.startsWith("initials:")) updates.topTrainerName = top.name;
      updates.topTrainerSessions = top.sessions;
    }
    updates.trainerTallyUpdatedAt = ops.serverTimestamp();
  }

  /* ---- machine stats — one vote per machine per session ---- */
  const seen = new Set<string>();
  for (const log of logs) {
    const machineId = (log.machineId || "").trim();
    if (!machineId || seen.has(machineId)) continue;
    const weight = toNumber(log.weight);
    if (weight === null && toNumber(log.reps) === null && toNumber(log.seconds) === null) continue;
    seen.add(machineId);
    const existing = client?.machineStats?.[machineId];
    const base = `machineStats.${machineId}`;
    updates[`${base}.timesPerformed`] = ops.increment(1);
    if (day) {
      if (!existing?.firstPerformedDate || day < existing.firstPerformedDate) {
        updates[`${base}.firstPerformedDate`] = day;
        if (weight !== null) updates[`${base}.firstWeight`] = weight;
      }
      if (!existing?.lastPerformedDate || day >= existing.lastPerformedDate) {
        updates[`${base}.lastPerformedDate`] = day;
        if (weight !== null) updates[`${base}.lastWeight`] = weight;
      }
    } else if (weight !== null) {
      if (existing?.firstWeight === undefined) updates[`${base}.firstWeight`] = weight;
      updates[`${base}.lastWeight`] = weight;
    }
  }

  return updates;
}

/**
 * Reverse of the above for a deleted session. Only the tally and the
 * times-performed counters are unwound; first/last dates stay (recomputing
 * them needs the full history, which the delete path does not have, and a
 * date that is one session too early is a far smaller lie than a count that
 * is one too high).
 */
export function deletedSessionRollup(
  session: { trainerId?: string | null; trainerInitials?: string | null; trainerName?: string | null },
  logs: RollupLog[],
  ops: FieldOps,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const key = trainerKeyFor(session);
  if (key) {
    updates[`trainerTally.${tallyFieldKey(key)}`] = ops.increment(-1);
    updates.trainerTallyUpdatedAt = ops.serverTimestamp();
  }
  const seen = new Set<string>();
  for (const log of logs) {
    const machineId = (log.machineId || "").trim();
    if (!machineId || seen.has(machineId)) continue;
    seen.add(machineId);
    updates[`machineStats.${machineId}.timesPerformed`] = ops.increment(-1);
  }
  return updates;
}

/**
 * Bulk form for the CSV import: N sessions in one update object. Tally
 * increments are summed per trainer; machine stats are folded in date order
 * so first/last land correctly even when the chart's columns arrive out of
 * order.
 */
export function importedSessionsRollup(
  client: Pick<Client, "trainerTally" | "machineStats" | "topTrainerId"> | null | undefined,
  sessions: Array<{
    date?: string | null;
    trainerId?: string | null;
    trainerInitials?: string | null;
    logs: RollupLog[];
  }>,
  trainers: Trainer[],
  ops: FieldOps,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const tallyAdd: Record<string, number> = {};
  for (const s of sessions) {
    const key = trainerKeyFor(s);
    if (!key) continue;
    const field = tallyFieldKey(key);
    tallyAdd[field] = (tallyAdd[field] || 0) + 1;
  }
  const projected: Record<string, number> = { ...(client?.trainerTally || {}) };
  for (const [field, n] of Object.entries(tallyAdd)) {
    updates[`trainerTally.${field}`] = ops.increment(n);
    projected[field] = (projected[field] || 0) + n;
  }
  if (Object.keys(tallyAdd).length) {
    const top = resolveTopTrainer(projected, trainers, client?.topTrainerId);
    if (top) {
      updates.topTrainerId = top.key;
      // Only write a name we actually resolved — a caller that passed just
      // the finishing trainer must not stamp "Unknown trainer" over a name
      // an earlier write got right. The header derives its own name anyway.
      if (top.trainer || top.key.startsWith("initials:")) updates.topTrainerName = top.name;
      updates.topTrainerSessions = top.sessions;
    }
    updates.trainerTallyUpdatedAt = ops.serverTimestamp();
  }

  /* machine stats: walk sessions oldest → newest, tracking first/last locally */
  const ordered = [...sessions].sort((a, b) => toIsoDay(a.date).localeCompare(toIsoDay(b.date)));
  const stat: Record<string, { first?: string; firstW?: number; last?: string; lastW?: number; times: number }> = {};
  for (const s of ordered) {
    const day = toIsoDay(s.date);
    const seen = new Set<string>();
    for (const log of s.logs) {
      const machineId = (log.machineId || "").trim();
      if (!machineId || seen.has(machineId)) continue;
      const weight = toNumber(log.weight);
      if (weight === null && toNumber(log.reps) === null && toNumber(log.seconds) === null) continue;
      seen.add(machineId);
      const cur = (stat[machineId] ||= { times: 0 });
      cur.times += 1;
      if (day) {
        if (!cur.first || day < cur.first) {
          cur.first = day;
          if (weight !== null) cur.firstW = weight;
        }
        if (!cur.last || day >= cur.last) {
          cur.last = day;
          if (weight !== null) cur.lastW = weight;
        }
      }
    }
  }
  for (const [machineId, cur] of Object.entries(stat)) {
    const existing = client?.machineStats?.[machineId];
    const base = `machineStats.${machineId}`;
    updates[`${base}.timesPerformed`] = ops.increment(cur.times);
    if (cur.first && (!existing?.firstPerformedDate || cur.first < existing.firstPerformedDate)) {
      updates[`${base}.firstPerformedDate`] = cur.first;
      if (cur.firstW !== undefined) updates[`${base}.firstWeight`] = cur.firstW;
    }
    if (cur.last && (!existing?.lastPerformedDate || cur.last >= existing.lastPerformedDate)) {
      updates[`${base}.lastPerformedDate`] = cur.last;
      if (cur.lastW !== undefined) updates[`${base}.lastWeight`] = cur.lastW;
    }
  }
  return updates;
}

/* ------------------------------------------------------------------ *
 * Backfill — for clients that predate the field
 * ------------------------------------------------------------------ */

/**
 * Compute the full rollup from a complete history. Used once per client the
 * first time the profile opens without a `trainerTally`, and by the tests.
 * Returns a plain object (no increments — this REPLACES the fields).
 */
export function rollupFromHistory(
  sessions: Array<{
    id?: string;
    status?: string;
    date?: string;
    trainerId?: string | null;
    trainerInitials?: string | null;
    trainerName?: string | null;
  }>,
  logs: Array<RollupLog & { sessionId?: string }>,
  trainers: Trainer[],
): {
  trainerTally: Record<string, number>;
  topTrainerId: string | null;
  topTrainerName: string | null;
  topTrainerSessions: number;
  machineStats: Record<string, ClientMachineStat>;
} {
  const completed = sessions.filter((s) => !s.status || s.status === "Completed");
  const trainerTally = tallyFromSessions(completed);
  const top = resolveTopTrainer(trainerTally, trainers);

  const bySession = new Map<string, RollupLog[]>();
  for (const l of logs) {
    if (!l.sessionId) continue;
    const list = bySession.get(l.sessionId) ?? [];
    list.push(l);
    bySession.set(l.sessionId, list);
  }
  const rolled = importedSessionsRollup(
    null,
    completed.map((s) => ({
      date: s.date,
      trainerId: s.trainerId,
      trainerInitials: s.trainerInitials,
      logs: s.id ? bySession.get(s.id) ?? [] : [],
    })),
    trainers,
    plainFieldOps,
  );
  const machineStats: Record<string, ClientMachineStat> = {};
  for (const [path, value] of Object.entries(rolled)) {
    const m = path.match(/^machineStats\.([^.]+)\.(\w+)$/);
    if (!m) continue;
    const entry = (machineStats[m[1]] ||= {});
    (entry as Record<string, unknown>)[m[2]] = value;
  }

  return {
    trainerTally,
    topTrainerId: top?.key ?? null,
    topTrainerName: top?.name ?? null,
    topTrainerSessions: top?.sessions ?? 0,
    machineStats,
  };
}
