/**
 * A REPLY ON A BUG REPORT — written by an administrator on Admins →
 * Machinery → Bug reports, read by the person who filed it on Settings →
 * Your reports. PURE: no React, no Firestore.
 *
 * The Admins room's second wave (Sep 28 2026; AJ "all yes", q11's default:
 * "Yes, in the app only. Nothing is emailed"). One field on the report:
 *
 *   reply: { text, by: { uid, name }, at }
 *
 * signed with the administrator's Auth uid and the server's time (the rules
 * pin both). A second reply replaces the first: the report carries the one
 * answer its reporter should read. Nothing is sent to anyone; the reporter
 * sees it the next time they open Settings.
 */
import { formatStudioDate } from "../../../lib/studio-time";

export interface BugReply {
  text: string;
  byName: string;
  byUid: string;
  /** ms; null while the server's time is on its way. */
  at: number | null;
}

/** The longest reply the rules accept. */
export const REPLY_MAX = 1000;

function millis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  const ts = v as { toMillis?: () => number; toDate?: () => Date };
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return null;
}

/** The reply stored on a report, or null when there is none (or it isn't one). */
export function replyOf(raw: unknown): BugReply | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { text?: unknown; by?: { uid?: unknown; name?: unknown } | null; at?: unknown };
  const text = typeof r.text === "string" ? r.text.trim() : "";
  if (!text) return null;
  return {
    text,
    byName: typeof r.by?.name === "string" && r.by.name.trim() ? r.by.name.trim() : "Max Strength",
    byUid: typeof r.by?.uid === "string" ? r.by.uid : "",
    at: millis(r.at),
  };
}

/** What a save writes, less `at` (the server's time, added at the write). Throws on an empty reply. */
export function replyPayload(text: string, uid: string, name: string): { text: string; by: { uid: string; name: string } } {
  const t = text.trim();
  if (!t) throw new Error("Write the reply first.");
  if (t.length > REPLY_MAX) throw new Error(`A reply is ${REPLY_MAX} characters at most.`);
  if (!uid) throw new Error("Sign in again to reply: the app can't tell who is replying.");
  return { text: t, by: { uid, name: name.trim().slice(0, 120) || "An administrator" } };
}

/** "Ada Admin replied on Mon, Sep 28" — who and when, in the studio's day. */
export function replyLine(reply: BugReply): string {
  const when = reply.at != null ? ` on ${formatStudioDate(reply.at, { weekday: "short", month: "short", day: "numeric" })}` : "";
  return `${reply.byName} replied${when}`;
}
