/**
 * THE MONDAY PAGE — the pure half of three of the four questions.
 *
 * Round: Operations (Round B), Sep 2026. ARCHITECTURE §1.5, the leader's
 * Monday-morning questions, in AJ's order (Sep 18): renewals and
 * conversation status · attendance anomalies · performance discrepancies ·
 * pain and incidents. Each is a sentence with its proof, or "not enough
 * data yet" — never a score. The fourth question's maths (performance) is
 * performance.ts, run by the weekly job; this file is the other three,
 * worked out on the page from what Operations already holds:
 *
 *   renewals     the roster's nightly snapshots (client.renewal), the
 *                studio's renewal cycles and settings — the same lanes and
 *                next steps as Operations → Renewals (renewals/pipeline.ts),
 *                counted rather than listed
 *   attendance   the same snapshots: the nightly job already measured each
 *                client's pace (visits a week over eight weeks, from Mindbody
 *                bookings AND Journey sessions) and last visit, and flagged
 *                a break, missed bookings and nothing booked ahead
 *   pain         the last week's sessions (the Dial's body regions), open
 *                incidents, and critical notes still in their window
 *
 * WHAT IT REFUSES TO SAY. Attendance is Mindbody's record as well as
 * Journey's, so the migration caveat (docs/business/migration-and-prior-
 * history.md) does not bite here — but a client with no measured pace gets
 * no "longer than usual" claim, only the engine's plain break flag, and a
 * client who is away, lapsed or unknown to the engine is not an anomaly.
 */
import type { Client, ClinicalIncident, WorkoutSession } from "../../../types";
import type { JournalEntry } from "../../../types/journal";
import { clientDisplayName } from "../../../lib/client-name";
import { studioDateKey } from "../../../lib/studio-time";
import { addDays, daysBetween } from "../../client-history/model";
import { regionDial } from "../../rating/session-reads";
import { leaningLabel } from "../../renewals/conversation";
import { laneOf, nextStep, type PipelineLane } from "../../renewals/pipeline";
import type { RenewalCycle, RenewalSettings, RenewalSnapshot } from "../../renewals/types";
import { sessionDay } from "../insights/metrics";

export type MondayTone = "alert" | "warn" | "info";

export interface MondayRow {
  clientId: string;
  name: string;
  /** The claim, in one sentence. */
  sentence: string;
  /** What backs it up. */
  proof: string;
  tone: MondayTone;
}

const nameOf = (c: Pick<Client, "firstName" | "lastName" | "nickname">) => clientDisplayName(c, "A client");

/* ------------------------------------------------------------------ *
 * 1. Renewals and conversation status
 * ------------------------------------------------------------------ */

export interface RenewalsQuestion {
  counts: Record<PipelineLane, number>;
  /** In a live lane with nobody having logged a conversation. */
  notTalked: number;
  /** The clients to talk to first: Talk now, then Before the charge, soonest first. */
  rows: MondayRow[];
  /** How many rows there were before the cap. */
  total: number;
}

export const RENEWALS_ROWS_SHOWN = 6;

export function renewalsQuestion(
  clients: Client[],
  cycles: Record<string, RenewalCycle>,
  settings: RenewalSettings,
  today: string,
): RenewalsQuestion {
  const counts: Record<PipelineLane, number> = { "before-charge": 0, "talk-now": 0, "coming-up": 0, lapsed: 0, away: 0 };
  let notTalked = 0;
  const candidates: Array<MondayRow & { lane: PipelineLane; focus: string }> = [];
  for (const c of clients) {
    const s = c.renewal as RenewalSnapshot | undefined;
    if (!c.id || !s || c.isActive === false) continue;
    const cycle = s.cycleKey ? (cycles[s.cycleKey] ?? null) : null;
    const lane = laneOf(s, cycle, settings, today);
    if (!lane) continue;
    counts[lane] += 1;
    if ((lane === "talk-now" || lane === "before-charge") && !cycle?.lastTouchAt) notTalked += 1;
    if (lane === "talk-now" || lane === "before-charge") {
      candidates.push({
        clientId: c.id,
        name: nameOf(c),
        sentence: nextStep(s, cycle, settings, today),
        proof: cycle?.lastTouchAt
          ? `Last talked to by ${cycle.lastTouchByName ?? "someone"}${cycle.latestLeaning ? ` — ${leaningLabel(cycle.latestLeaning).toLowerCase()}` : ""}.`
          : "Nobody has talked to them yet.",
        tone: lane === "talk-now" ? "alert" : "warn",
        lane,
        focus: s.focusDate ?? "9999-99-99",
      });
    }
  }
  const order: Record<PipelineLane, number> = { "talk-now": 0, "before-charge": 1, "coming-up": 2, lapsed: 3, away: 4 };
  candidates.sort((a, b) => order[a.lane] - order[b.lane] || a.focus.localeCompare(b.focus) || a.name.localeCompare(b.name));
  return {
    counts,
    notTalked,
    rows: candidates.slice(0, RENEWALS_ROWS_SHOWN).map(({ lane: _l, focus: _f, ...row }) => row),
    total: candidates.length,
  };
}

/* ------------------------------------------------------------------ *
 * 2. Attendance anomalies
 * ------------------------------------------------------------------ */

/** A gap this many times the client's usual gap is a long break. */
export const LONG_BREAK_MULTIPLE = 2;
/** But never less than this many days, whatever the rhythm. */
export const MIN_BREAK_DAYS = 7;
export const ATTENDANCE_ROWS_SHOWN = 8;

export interface AttendanceQuestion {
  longBreaks: number;
  missedBookings: number;
  /** Live clients with a measured pace: the sample the claims are drawn from. */
  measured: number;
  rows: MondayRow[];
  total: number;
}

const LIVE = new Set<RenewalSnapshot["situation"]>(["on-track", "will-bank", "will-run-out", "ended"]);

export function attendanceQuestion(clients: Client[], today: string): AttendanceQuestion {
  let longBreaks = 0;
  let missedBookings = 0;
  let measured = 0;
  const candidates: Array<MondayRow & { gap: number }> = [];
  for (const c of clients) {
    const s = c.renewal as RenewalSnapshot | undefined;
    if (!c.id || !s || c.isActive === false || !LIVE.has(s.situation)) continue;
    const flags = new Map(s.flags.map((f) => [f.code, f.text]));
    const usualGap = s.pacePerWeek && s.pacePerWeek > 0 ? 7 / s.pacePerWeek : null;
    if (usualGap !== null) measured += 1;
    const gap = s.lastVisitDate ? daysBetween(s.lastVisitDate, today) : null;
    const breakByRhythm =
      usualGap !== null && gap !== null && gap >= Math.max(MIN_BREAK_DAYS, Math.ceil(usualGap * LONG_BREAK_MULTIPLE));
    const breakFlag = flags.get("on-break");
    const missed = flags.get("missed-sessions");
    const noBooking = flags.get("no-future-booking");
    if (!breakByRhythm && !breakFlag && !missed) continue;

    let sentence: string;
    let proof: string;
    let tone: MondayTone;
    if (breakByRhythm && gap !== null && usualGap !== null) {
      longBreaks += 1;
      sentence = `No visit in ${gap} days — they usually come every ${usualGap < 1.5 ? "day or so" : `${Math.round(usualGap)} days`}.`;
      proof = `Last visit ${s.lastVisitDate}; about ${s.pacePerWeek} a week over the last eight weeks.${noBooking ? " Nothing booked ahead." : ""}`;
      tone = "alert";
    } else if (breakFlag) {
      longBreaks += 1;
      sentence = breakFlag;
      proof = usualGap === null ? "No pace measured yet, so this is the studio's break rule, not their rhythm." : `About ${s.pacePerWeek} a week over the last eight weeks.`;
      tone = "warn";
    } else {
      sentence = missed as string;
      proof = noBooking ? "Nothing booked ahead either." : "Still booked ahead.";
      tone = "warn";
    }
    if (missed && (breakByRhythm || breakFlag)) {
      proof += ` ${missed}`;
    }
    if (missed) missedBookings += 1;
    candidates.push({ clientId: c.id, name: nameOf(c), sentence, proof, tone, gap: gap ?? 0 });
  }
  candidates.sort((a, b) => b.gap - a.gap || a.name.localeCompare(b.name));
  return {
    longBreaks,
    missedBookings,
    measured,
    rows: candidates.slice(0, ATTENDANCE_ROWS_SHOWN).map(({ gap: _g, ...row }) => row),
    total: candidates.length,
  };
}

/* ------------------------------------------------------------------ *
 * 4. Pain and incidents
 * ------------------------------------------------------------------ */

/** Pain on the Dial counts for this many days. */
export const PAIN_WINDOW_DAYS = 7;
/** A critical note with no window of its own counts for this long. */
export const CRITICAL_NOTE_DAYS = 21;
export const PAIN_ROWS_SHOWN = 8;

export interface PainQuestionInput {
  sessions: WorkoutSession[];
  incidents: ClinicalIncident[];
  entries: JournalEntry[];
  clients: Client[];
  today: string;
  tz?: string;
}

export interface PainQuestion {
  openIncidents: number;
  criticalNotes: number;
  painReports: number;
  rows: MondayRow[];
  total: number;
}

const dayOf = (v: unknown, tz?: string): string | null => {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = (v as { toDate?: () => Date }).toDate?.() ?? (v instanceof Date ? v : typeof v === "string" || typeof v === "number" ? new Date(v) : null);
  return d && !Number.isNaN(d.getTime()) ? studioDateKey(d, tz) : null;
};

export function painQuestion(input: PainQuestionInput): PainQuestion {
  const { today, tz } = input;
  const names = new Map(input.clients.filter((c) => c.id).map((c) => [c.id as string, nameOf(c)]));
  const since = addDays(today, -PAIN_WINDOW_DAYS);
  const items = new Map<string, { alert: string[]; warn: string[] }>();
  const add = (clientId: string, tone: "alert" | "warn", text: string) => {
    const e = items.get(clientId) ?? { alert: [], warn: [] };
    e[tone].push(text);
    items.set(clientId, e);
  };

  let openIncidents = 0;
  for (const inc of input.incidents) {
    const surfaceUntil = dayOf(inc.surfaceUntil, tz);
    const open = !inc.resolvedAt || (surfaceUntil !== null && surfaceUntil >= today);
    if (!open || !inc.clientId) continue;
    openIncidents += 1;
    const when = dayOf(inc.createdAt, tz);
    const severity = inc.severity === "stop_session" ? "session stopped" : inc.severity;
    add(inc.clientId, inc.severity === "mild" ? "warn" : "alert", `Incident${when ? ` on ${when}` : ""}: ${inc.region}, ${severity}${inc.description ? ` — ${inc.description}` : ""}${inc.resolvedAt ? " (resolved, still surfaced)" : ""}.`);
  }

  let criticalNotes = 0;
  for (const e of input.entries) {
    if (e.importance !== "critical" || e.resolvedAt || e.isArchived) continue;
    const until = dayOf(e.effectiveUntil, tz);
    const occurred = dayOf(e.occurredAt, tz);
    const live = until !== null ? until >= today : occurred !== null && occurred >= addDays(today, -CRITICAL_NOTE_DAYS);
    if (!live) continue;
    criticalNotes += 1;
    const body = (e.body ?? "").trim();
    add(e.clientId, "alert", `Critical note${occurred ? ` (${occurred})` : ""}: ${body.length > 140 ? `${body.slice(0, 137)}…` : body}`);
  }

  let painReports = 0;
  const painByClient = new Map<string, Set<string>>();
  for (const s of input.sessions) {
    const day = sessionDay(s);
    if (!s.clientId || !day || day < since || day > today) continue;
    for (const tag of s.preSessionCheckIn?.bodyStates ?? []) {
      if (regionDial(tag) !== -2) continue;
      const set = painByClient.get(s.clientId) ?? new Set<string>();
      set.add(`${tag.region} (${day})`);
      painByClient.set(s.clientId, set);
    }
  }
  for (const [clientId, regions] of painByClient) {
    painReports += 1;
    add(clientId, "warn", `Pain on the Dial in the last ${PAIN_WINDOW_DAYS} days: ${[...regions].join(", ")}.`);
  }

  const rows: MondayRow[] = [...items.entries()].map(([clientId, e]) => {
    const all = [...e.alert, ...e.warn];
    return {
      clientId,
      name: names.get(clientId) ?? "A client at this studio",
      sentence: all[0],
      proof: all.length > 1 ? all.slice(1).join(" ") : "",
      tone: e.alert.length > 0 ? "alert" : "warn",
    };
  });
  rows.sort((a, b) => (a.tone === b.tone ? a.name.localeCompare(b.name) : a.tone === "alert" ? -1 : 1));
  return { openIncidents, criticalNotes, painReports, rows: rows.slice(0, PAIN_ROWS_SHOWN), total: rows.length };
}

/* ------------------------------------------------------------------ *
 * The lines: Hours this week, from the same sessions read
 * ------------------------------------------------------------------ */

/** Completed sessions since Monday, as slot minutes — the Hours tab's rule, this week. */
export function hoursThisWeek(sessions: WorkoutSession[], today: string, sessionMinutes: number): { minutes: number; sessions: number; trainers: number; since: string } {
  // weekStartOf lives in hours.ts; inlined here to keep this module free of
  // that folder's imports: Monday-start, same maths.
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const since = addDays(today, -((weekday + 6) % 7));
  let count = 0;
  const trainers = new Set<string>();
  for (const s of sessions) {
    const day = sessionDay(s);
    if (s.status !== "Completed" || !day || day < since || day > today) continue;
    count += 1;
    if (s.trainerId) trainers.add(s.trainerId);
    else if (s.trainerInitials) trainers.add(`initials:${s.trainerInitials}`);
  }
  return { minutes: count * sessionMinutes, sessions: count, trainers: trainers.size, since };
}
