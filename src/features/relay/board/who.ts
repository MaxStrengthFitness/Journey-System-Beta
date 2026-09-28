/**
 * WHO? — the faces a studio's leader taps to put a name on a job, in the
 * order that helps them choose. Relay room, Sep 28 2026 (the redesign's
 * phase 3, "Cards and names").
 *
 * AJ, q5: "Trainers can post offers where other trainers can pick it up but
 * leadership can just directly assign." So only a leader of this studio sees
 * the faces (relay/leads.ts, the answer the rules give), and a name they put
 * on a job makes it that person's: it arrives already theirs, with a way to
 * say they can't. A name is still a heads-up and never a lock: anyone may
 * still tick the job.
 *
 * The order, with the reason under each face, from today's bookings at the
 * studio (the Calendar's rows the shell already holds; nothing is read):
 *
 *   free now         on today's list, between sessions ("free until 2:40 PM")
 *   with a client    in a session now ("with a client until 3:00 PM")
 *   later today      their first session is still to come ("on from 4:00 PM")
 *   done for today   their last session has ended
 *   not on the list  nothing booked today
 *
 * People come from who works at the studio (lib/who-works-here.ts, through
 * studioRoster), in name order within each group. It never ranks anyone:
 * the order is only who is free to help right now.
 *
 * Pure: no React, no Firestore, no clock of its own.
 */
import type { ScheduleEntry, Trainer } from "../../../types";
import { isStaffBlock } from "../../../lib/booking-state";
import { studioDateKey, toDate, zonedHM } from "../../../lib/studio-time";
import { entryIsTrainers, minutesToClock } from "./now-context";

export type WhoState = "free" | "busy" | "later" | "done" | "off";

export interface WhoFace {
  id: string;
  name: string;
  state: WhoState;
  /** The reason under the face, in words. */
  reason: string;
}

const RANK: Record<WhoState, number> = { free: 0, busy: 1, later: 2, done: 3, off: 4 };

/** How many faces show before the rest go behind "+". */
export const FACES_SHOWN = 3;

interface Span {
  start: number;
  end: number;
}

function spansOf(schedules: readonly ScheduleEntry[], trainer: Pick<Trainer, "id" | "fullName" | "nickname">, todayKey: string): Span[] {
  const out: Span[] = [];
  for (const entry of schedules) {
    if (!entry || entry.status === "Cancelled" || isStaffBlock(entry)) continue;
    if (!entryIsTrainers(entry, trainer)) continue;
    const start = toDate(entry.startTime);
    if (!start || studioDateKey(start) !== todayKey) continue;
    const hm = zonedHM(start);
    if (!hm) continue;
    const startMin = hm.hour * 60 + hm.minute;
    const end = toDate(entry.endTime);
    const endHm = end ? zonedHM(end) : null;
    const endMin = endHm && studioDateKey(end) === todayKey ? Math.max(startMin + 1, endHm.hour * 60 + endHm.minute) : startMin + 30;
    out.push({ start: startMin, end: endMin });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * The faces for everyone who works here but `excludeIds` (the leader
 * choosing), ordered by who can help now, then by name.
 */
export function whoFaces(input: {
  people: readonly { id: string; name: string }[];
  trainers: readonly Trainer[];
  schedules: readonly ScheduleEntry[];
  todayKey: string;
  nowMin: number;
  excludeIds?: readonly (string | null | undefined)[];
}): WhoFace[] {
  const skip = new Set((input.excludeIds ?? []).filter(Boolean) as string[]);
  const faces: WhoFace[] = [];
  for (const p of input.people) {
    if (skip.has(p.id)) continue;
    const t = input.trainers.find((x) => x.id === p.id) ?? ({ id: p.id, fullName: p.name } as Trainer);
    const spans = spansOf(input.schedules, t, input.todayKey);
    const now = spans.find((s) => s.start <= input.nowMin && input.nowMin < s.end);
    const next = spans.find((s) => s.start > input.nowMin);
    const had = spans.some((s) => s.end <= input.nowMin);
    let state: WhoState;
    let reason: string;
    if (now) {
      state = "busy";
      reason = `with a client until ${minutesToClock(now.end)}`;
    } else if (next && had) {
      state = "free";
      reason = `free until ${minutesToClock(next.start)}`;
    } else if (next) {
      state = "later";
      reason = `on from ${minutesToClock(next.start)}`;
    } else if (had) {
      state = "done";
      reason = "finished their sessions today";
    } else {
      state = "off";
      reason = "nothing on today's list";
    }
    faces.push({ id: p.id, name: p.name, state, reason });
  }
  return faces.sort((a, b) => RANK[a.state] - RANK[b.state] || a.name.localeCompare(b.name));
}

/** How long a leader's name lasts on a shift chore: today, this week, or two weeks. */
export type NameSpan = 1 | 7 | 14;

export const NAME_SPANS: { days: NameSpan; label: string }[] = [
  { days: 1, label: "Today" },
  { days: 7, label: "This week" },
  { days: 14, label: "Two weeks" },
];

/** "Beregond has it today", "… for this week", "… for two weeks". */
export function namedLine(name: string, days: NameSpan): string {
  const first = name.trim().split(/\s+/)[0] || name;
  return days === 1 ? `${first} has it today` : days === 7 ? `${first} has it for this week` : `${first} has it for two weeks`;
}
