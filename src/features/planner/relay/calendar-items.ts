/**
 * THE RELAY LAYER ON THE CALENDAR — the pure half.
 *
 * Round: Relay, Sep 2026. Relay items with a time or a due day appear on the
 * Calendar as one layer, derived from the collections Relay already writes:
 * no new collection, no duplicate write, so an item edited in Relay moves
 * on the Calendar at once. What appears, and for whom:
 *
 *   a personal task with a time or a day        the author       mine
 *   a studio task with a set time, on its days  everyone         floor
 *   a team job with a due day                   everyone         floor
 *   an initiative or a hand-off with a due day  everyone / me    floor / mine
 *
 * Sessions are the Calendar's own and are not touched.
 */
import { addDays, isTemplateDueOn } from "../../studio-tasks/recurrence";
import type { TaskRequest } from "../../studio-tasks/requests";
import { normaliseTime } from "../../studio-tasks/task-wizard";
import { taskScopeOf, type TaskTemplate } from "../../studio-tasks/types";
import { isUpForGrabs } from "../jobs/jobs";
import type { TeamJob } from "../jobs/types";

export type CalendarItemKind = "reminder" | "task" | "studio-task" | "job" | "initiative" | "handoff" | "ask";

export interface RelayCalendarItem {
  key: string;
  dateKey: string;
  /** "HH:MM", or null for an all-day chip. */
  time: string | null;
  title: string;
  sub: string | null;
  origin: "floor" | "mine";
  kind: CalendarItemKind;
  /** Where a tap lands. */
  open: { kind: "open-tab"; tab: "mine" } | { kind: "open-job"; jobId: string } | { kind: "open-floor" };
  reminds?: boolean;
}

export interface CalendarItemsInput {
  templates: TaskTemplate[];
  jobs: TeamJob[];
  requests: TaskRequest[];
  fromKey: string;
  toKey: string;
  uid: string | null;
  trainerId: string | null;
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function relayCalendarItems(input: CalendarItemsInput): RelayCalendarItem[] {
  const out: RelayCalendarItem[] = [];
  const ids = new Set([input.uid, input.trainerId].filter(Boolean) as string[]);
  const days: string[] = [];
  for (let key = input.fromKey, i = 0; key <= input.toKey && i < 62; key = addDays(key, 1), i += 1) days.push(key);

  for (const t of input.templates) {
    if (t.active === false) continue;
    const personal = taskScopeOf(t) === "personal";
    const time = normaliseTime(t.timeOfDay);
    // A studio task shows only with a set time (the shift strip is its home);
    // a personal task shows with a time on any day, or without one when it
    // is a one-off with a day.
    if (!personal && !time) continue;
    if (personal && !time && t.recurrence.type !== "once") continue;
    for (const dateKey of days) {
      if (!isTemplateDueOn(t, dateKey)) continue;
      out.push({
        key: `t:${t.id}:${dateKey}`,
        dateKey,
        time: time ?? null,
        title: t.title,
        sub: personal ? null : "the shift",
        origin: personal ? "mine" : "floor",
        kind: personal ? (typeof t.remindMinutesBefore === "number" && time ? "reminder" : "task") : "studio-task",
        open: personal ? { kind: "open-tab", tab: "mine" } : { kind: "open-floor" },
        reminds: personal && typeof t.remindMinutesBefore === "number" && Boolean(time),
      });
    }
  }

  for (const j of input.jobs) {
    if (j.status !== "open" || !j.dueOn || j.dueOn < input.fromKey || j.dueOn > input.toKey) continue;
    const who = j.assignees.length ? j.assignees.map((a) => initialsOf(a.name)).join(" ") : isUpForGrabs(j) ? "up for grabs" : null;
    const mine = j.assigneeIds.some((id) => ids.has(id));
    out.push({
      key: `j:${j.id}`,
      dateKey: j.dueOn,
      time: null,
      title: j.title,
      sub: who,
      origin: mine ? "mine" : "floor",
      kind: "job",
      open: { kind: "open-job", jobId: j.id },
    });
  }

  for (const r of input.requests) {
    if (r.status !== "open") continue;
    const due = r.kind === "initiative" ? r.target?.dueOn : r.dueOn;
    if (!due || due < input.fromKey || due > input.toKey) continue;
    const mine = Boolean(r.forId && ids.has(r.forId));
    out.push({
      key: `r:${r.id}`,
      dateKey: due,
      time: null,
      title: r.title,
      sub: r.kind === "initiative" ? "initiative" : r.kind === "handoff" ? `from ${r.createdBy.name.split(" ")[0]}` : "on the Floor",
      origin: mine ? "mine" : "floor",
      kind: r.kind === "initiative" ? "initiative" : r.kind === "handoff" ? "handoff" : "ask",
      open: mine ? { kind: "open-tab", tab: "mine" } : { kind: "open-floor" },
    });
  }

  return out.sort(
    (a, b) =>
      a.dateKey.localeCompare(b.dateKey) ||
      (a.time === null ? 1 : 0) - (b.time === null ? 1 : 0) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      a.title.localeCompare(b.title),
  );
}

/** Items grouped by day, in order. */
export function byDay(items: RelayCalendarItem[]): { dateKey: string; items: RelayCalendarItem[] }[] {
  const map = new Map<string, RelayCalendarItem[]>();
  for (const it of items) {
    const list = map.get(it.dateKey) ?? [];
    list.push(it);
    map.set(it.dateKey, list);
  }
  return [...map.entries()].map(([dateKey, list]) => ({ dateKey, items: list }));
}
