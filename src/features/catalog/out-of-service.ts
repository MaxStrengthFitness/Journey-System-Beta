/**
 * OUT OF SERVICE, AND WHY — the reason a leader gives, read and written.
 *
 * Wave 2 of the Machine Catalog room (AJ, Sep 28 2026: "all yes" to the
 * room's Needs OK list — "a reason on Out of service: a short note and who
 * set it, on the studio's machine entry, so the row can say why").
 *
 * THE RECORD
 * ----------
 * `studios/{s}/roster/{machineId}.outOfService`:
 *
 *     { reason: "A new cable is on order",
 *       by: { uid, name },        // the Auth uid; the name as it was then
 *       at: <server time> }
 *
 * written with `status: "maintenance"` when a leader takes a machine out of
 * service on the floor editor, and deleted when it goes back in (or leaves
 * the floor). The rules require it signed by the person writing it, at the
 * write's own time, with a reason of 1 to 140 characters (firestore.rules,
 * `rosterOutOfServiceOk`, "WAVE 2 CATALOG").
 *
 * An entry out of service from before the reason existed has none: it reads
 * exactly as it did, "Out of service", and nothing is guessed in its place.
 * A reason is only ever shown on a machine that IS out of service, so a
 * stale one on a machine back on the floor says nothing.
 *
 * PURE MODULE — no React, no Firestore.
 */

import { formatStudioDate, formatStudioTime } from "../../lib/studio-time";

/** The longest reason, in characters. firestore.rules holds the same number. */
export const OUT_OF_SERVICE_REASON_MAX = 140;

export interface OutOfService {
  reason: string;
  by: { uid: string; name: string };
  /** ms since epoch; 0 when not known yet (a write still on its way). */
  at: number;
}

function millisOf(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number; seconds?: number } | null;
  if (v && typeof v.toMillis === "function") {
    const ms = v.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (v && typeof v.seconds === "number") return v.seconds * 1000;
  return 0;
}

/**
 * The record on a roster entry, or null when there is none or it isn't one.
 * Firestore documents are untyped at runtime: a reason that is not a string,
 * or is empty, is no reason.
 */
export function outOfServiceOf(raw: unknown): OutOfService | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { reason?: unknown; by?: unknown; at?: unknown };
  const reason = typeof r.reason === "string" ? r.reason.trim() : "";
  if (!reason) return null;
  const by = (r.by && typeof r.by === "object" ? r.by : {}) as { uid?: unknown; name?: unknown };
  return {
    reason,
    by: {
      uid: typeof by.uid === "string" ? by.uid : "",
      name: typeof by.name === "string" ? by.name.trim() : "",
    },
    at: millisOf(r.at),
  };
}

/** The record on a roster entry, read off the entry itself. */
export function outOfServiceOfEntry(entry: unknown): OutOfService | null {
  if (!entry || typeof entry !== "object") return null;
  return outOfServiceOf((entry as { outOfService?: unknown }).outOfService);
}

/** What a leader typed, as the reason to store, or why it can't be. */
export function reasonToStore(text: string): { ok: true; reason: string } | { ok: false; why: string } {
  const reason = text.replace(/\s+/g, " ").trim();
  if (!reason) return { ok: false, why: "Say why, in a few words: trainers read it on the floor and in the Catalog." };
  if (reason.length > OUT_OF_SERVICE_REASON_MAX) {
    return { ok: false, why: `Keep it to ${OUT_OF_SERVICE_REASON_MAX} characters.` };
  }
  return { ok: true, reason };
}

export interface OutOfServiceLine {
  reason: string;
  /** "Glorfindel", or "a leader" when the name is missing. */
  who: string;
  /** "Sep 27, 8:52 AM" in the studio's zone, or null while unknown. */
  when: string | null;
}

/** The record as a screen says it. */
export function outOfServiceLineOf(o: OutOfService, tz?: string): OutOfServiceLine {
  const first = o.by.name.split(/\s+/)[0];
  const when =
    o.at > 0 ? `${formatStudioDate(o.at, { month: "short", day: "numeric" }, tz)}, ${formatStudioTime(o.at, tz)}` : null;
  return { reason: o.reason, who: first || "a leader", when };
}

/** One short line for a row: "A new cable is on order · Glorfindel". */
export function outOfServiceShort(o: OutOfService): string {
  const line = outOfServiceLineOf(o);
  return `${line.reason} · ${line.who}`;
}
