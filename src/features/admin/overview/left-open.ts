/**
 * SESSIONS LEFT OPEN (the Atlas answers, Oct 2 2026). Pure: left-open.test.ts.
 *
 * AJ: "Unfinished sessions for leaders — a Needs-you line on Operations →
 * Today, and head office across every studio." A session is left open by
 * the app's one staleness rule (`isSessionValid`, lib/utils.ts): still
 * In-Progress with no heartbeat for an hour. That is what the Hub's card
 * calls "Left open", so the two never disagree.
 *
 * Each row says whose session it is, who started it and when, and how far it
 * got, so a leader can find it without hunting for the client by name. The
 * row's door opens that client's session, where the Active Session's own
 * flow finishes it (or lets the trainer start again).
 *
 * Read from what the page already holds: Today's last 14 days of the
 * studio's sessions (useSessionsInRange), and on the Admins dashboard one
 * bounded query across the company (useLeftOpenEverywhere).
 */
import { isSessionValid } from "../../../lib/utils";
import { formatStudioTime, studioDateKey } from "../../../lib/studio-time";
import type { WorkoutSession } from "../../../types";

export interface LeftOpenRow {
  id: string;
  clientId: string | null;
  clientName: string;
  studioId: string;
  /** The trainer's name, or their initials, or null. */
  trainer: string | null;
  /** When it last showed a sign of life (the heartbeat, else its start). */
  lastMs: number | null;
  machines: number;
  /** "Started by Sam · last active Tue 9:40 AM · 3 machines logged". */
  detail: string;
}

const millisOf = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "9:40 AM" today, "Yesterday 9:40 AM", "Tue 9:40 AM" this week, "Sep 27 9:40 AM" before. */
export function lastActiveWords(ms: number, now: number, tz?: string): string {
  const day = studioDateKey(new Date(ms), tz) ?? "";
  const today = studioDateKey(new Date(now), tz) ?? "";
  const time = formatStudioTime(new Date(ms), tz);
  if (day === today) return time;
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);
  if (days === 1) return `Yesterday ${time}`;
  if (days > 1 && days < 7) return `${WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()]} ${time}`;
  const [, m, d] = day.split("-").map(Number);
  const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTH[m - 1]} ${d} ${time}`;
}

/** The sessions left open, most recently active first. */
export function leftOpenSessions(
  sessions: readonly WorkoutSession[],
  now: number,
  opts: { trainerNameOf?: (id: string) => string | null | undefined; tz?: string } = {},
): LeftOpenRow[] {
  const rows: LeftOpenRow[] = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    if (!s?.id || seen.has(s.id)) continue;
    if (s.status !== "In-Progress" || isSessionValid(s, now)) continue;
    seen.add(s.id);
    const lastMs = millisOf(s.lastHeartbeatAt) ?? millisOf(s.createdAt);
    const trainerId = s.startedByTrainerId || s.trainerId || null;
    const trainer = (trainerId ? opts.trainerNameOf?.(trainerId) : null) || (s.trainerInitials || "").trim() || null;
    const machines = Array.isArray(s.sessionMachineIds) ? s.sessionMachineIds.length : 0;
    const parts = [
      trainer ? `Started by ${trainer.split(" ")[0]}` : null,
      lastMs !== null ? `last active ${lastActiveWords(lastMs, now, opts.tz)}` : null,
      machines > 0 ? `${machines} machine${machines === 1 ? "" : "s"} logged` : "no machines logged",
    ].filter(Boolean) as string[];
    const detail = parts.join(" · ");
    rows.push({
      id: s.id,
      clientId: s.clientId ?? null,
      clientName: (s.clientName ?? "").trim() || "A client",
      studioId: s.hostedAtStudioId,
      trainer,
      lastMs,
      machines,
      detail: detail.charAt(0).toUpperCase() + detail.slice(1),
    });
  }
  return rows.sort((a, b) => (b.lastMs ?? 0) - (a.lastMs ?? 0) || a.clientName.localeCompare(b.clientName));
}

/** The Needs-you line's heading. */
export function leftOpenHeading(n: number): string {
  return n === 1 ? "A session was left open" : `${n} sessions were left open`;
}

export const LEFT_OPEN_HINT = "Open it to finish it as it was, or start again. Nothing is lost until someone does.";
