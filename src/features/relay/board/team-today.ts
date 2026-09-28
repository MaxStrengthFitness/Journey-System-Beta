/**
 * TEAM TODAY, BY CHORE — the studio's own work today, one line a chore
 * (the second wave of the Relay room, Sep 28 2026: "Since you were in …
 * and Team today grouped by chore").
 *
 * The blueprint's lines: "Opening chores · all 12 done by 6:48", "Wipe-downs
 * · 12 of 19", "Deep clean · due today, nobody on it yet", "Asks answered ·
 * 2 today, 1 kept in the Playbook". Always the studio's work, never a
 * person's count: a name appears only as who is ON an open chore (a claim,
 * advisory), and nobody is ever totted up. A trainer's own to-dos are not
 * the studio's chores and are left out, as the rings leave them out.
 *
 * Pure: no React, no Firestore, no clock of its own.
 */
import { shiftGroups } from "../../studio-tasks/board";
import { taskScopeOf, type TaskRow } from "../../studio-tasks/types";
import type { TaskRequest } from "../../studio-tasks/requests";
import { studioDateKey, zonedHM } from "../../../lib/studio-time";
import { minutesToClock } from "./now-context";
import { RING_LABEL, ringOfShift } from "./rings";
import { millisOf } from "./since";

export interface ChoreLine {
  key: string;
  label: string;
  /** "all 12 done by 6:48 AM", "12 of 19", "Beregond is on it · 0 of 3", "nobody on it yet". */
  state: string;
  done: boolean;
}

/** How many chores a board shows before "and N more". */
export const CHORE_LINES_MAX = 6;

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

function clockOf(ms: number, tz?: string): string | null {
  const hm = zonedHM(new Date(ms), tz);
  return hm ? minutesToClock(hm.hour * 60 + hm.minute) : null;
}

/**
 * One line a chore (a template and its shift), open ones first in the
 * shift's order, then the finished ones. `asks` are the asks answered
 * lately and `keptToday` how many answers went into the Playbook today.
 */
export function teamTodayLines(input: {
  rows: readonly TaskRow[];
  answered: readonly TaskRequest[];
  keptToday: number;
  todayKey: string;
  tz?: string;
}): { lines: ChoreLine[]; more: number } {
  const studioRows = input.rows.filter((r) => r.kind !== "client" && taskScopeOf(r.template) !== "personal");
  const groups = shiftGroups([...studioRows]);
  const shiftsOf = new Map<string, Set<string>>();
  for (const g of groups) {
    const set = shiftsOf.get(g.templateId) ?? new Set<string>();
    set.add(g.shift);
    shiftsOf.set(g.templateId, set);
  }

  const lines: ChoreLine[] = [];
  for (const g of groups) {
    // The same chore on two shifts says which one it is.
    const label = (shiftsOf.get(g.templateId)?.size ?? 0) > 1 ? `${g.title} (${RING_LABEL[ringOfShift(g.shift)]})` : g.title;
    if (g.complete && g.total > 0) {
      const last = g.rows.reduce<number | null>((m, r) => {
        const at = millisOf(r.instance?.completedAt);
        return at !== null && (m === null || at > m) ? at : m;
      }, null);
      const by = last !== null ? clockOf(last, input.tz) : null;
      const count = g.total === 1 ? "done" : `all ${g.total} done`;
      lines.push({ key: `${g.templateId}|${g.shift}`, label, state: by ? `${count} by ${by}` : count, done: true });
      continue;
    }
    const progress = g.total > 1 ? `${g.done} of ${g.total}` : null;
    const on = g.assignedTo ?? g.claimedBy;
    const state = on
      ? `${firstName(on.name)} ${g.assignedTo ? "has it" : "is on it"}${progress ? ` · ${progress}` : ""}`
      : g.done === 0 && g.claimedCount === 0
        ? g.total > 1
          ? `nobody on it yet · 0 of ${g.total}`
          : "nobody on it yet"
        : progress ?? "under way";
    lines.push({ key: `${g.templateId}|${g.shift}`, label, state, done: false });
  }

  const open = lines.filter((l) => !l.done);
  const finished = lines.filter((l) => l.done);
  const ordered = [...open, ...finished];
  const shown = ordered.slice(0, CHORE_LINES_MAX);

  const answeredToday = input.answered.filter((r) => {
    const at = millisOf(r.resolvedAt);
    return at !== null && studioDateKey(new Date(at), input.tz) === input.todayKey && r.kind !== "initiative";
  }).length;
  if (answeredToday > 0 || input.keptToday > 0) {
    const kept = input.keptToday > 0 ? `, ${input.keptToday} kept in the Playbook` : "";
    shown.push({
      key: "asks",
      label: "Asks answered",
      state: `${answeredToday} today${kept}`,
      done: false,
    });
  }
  return { lines: shown, more: Math.max(0, ordered.length - CHORE_LINES_MAX) };
}
