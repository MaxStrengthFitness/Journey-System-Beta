/**
 * TEAM THIS WEEK — workload and follow-through, per trainer. Pure.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19) chose the shallow version:
 * "workload and follow-through — sessions, unlogged, clients, hours — the
 * things a leader chases today; outcomes stay on Insights." And the house
 * rule stands: recognition, never ranking, inside a studio. The list is
 * ALPHABETICAL, it carries no rate and no share, and volume is a rota fact.
 *
 * Sources: the last two weeks of sessions the Overview already reads
 * (completed since Monday, as Hours counts them), and today's schedule for
 * the sessions still unlogged.
 */
import type { ScheduleEntry, WorkoutSession } from "../../../types";
import { sessionDay, trainerKeyOf, type TrainerNames } from "../insights/metrics";
import { weekStartOf } from "../changes/changes";
import { attentionItems } from "./floor";

export interface TeamRow {
  key: string;
  name: string;
  /** Completed sessions since Monday. */
  sessions: number;
  /** Distinct clients seen since Monday. */
  clients: number;
  /** Today's bookings past their slot with nothing marked. */
  unloggedToday: number;
  /** Slot minutes × sessions — the Hours rule, this week. */
  minutes: number;
}

export interface TeamThisWeek {
  rows: TeamRow[];
  since: string;
  sessions: number;
  unloggedToday: number;
}

export function teamThisWeek(
  sessions: WorkoutSession[],
  todayEntries: ScheduleEntry[],
  now: Date,
  today: string,
  sessionMinutes: number,
  names: TrainerNames,
  trainerIdsByName: Record<string, string> = {},
): TeamThisWeek {
  const since = weekStartOf(today);
  const rows = new Map<string, TeamRow & { clientIds: Set<string> }>();
  const rowFor = (key: string, label: string) => {
    const existing = rows.get(key);
    if (existing) return existing;
    const row = { key, name: label, sessions: 0, clients: 0, unloggedToday: 0, minutes: 0, clientIds: new Set<string>() };
    rows.set(key, row);
    return row;
  };

  let total = 0;
  for (const s of sessions) {
    const day = sessionDay(s);
    if (s.status !== "Completed" || !day || day < since || day > today) continue;
    const key = trainerKeyOf(s);
    if (!key) continue;
    const row = rowFor(key, names[key] ?? (s.trainerInitials ? s.trainerInitials : "Unnamed"));
    row.sessions += 1;
    row.minutes += sessionMinutes;
    if (s.clientId) row.clientIds.add(s.clientId);
    total += 1;
  }

  let unlogged = 0;
  for (const item of attentionItems(todayEntries, now)) {
    if (item.kind !== "unresolved") continue;
    // The schedule names the trainer; join to a session key by id when the
    // roster knows it, else by the name itself.
    const entry = todayEntries.find((e) => (e.id || `${e.clientName}-${String(e.startTime)}`) === item.id);
    const key = entry?.trainerId || trainerIdsByName[item.trainerName] || `name:${item.trainerName}`;
    const row = rowFor(key, names[key] ?? item.trainerName);
    row.unloggedToday += 1;
    unlogged += 1;
  }

  const out = [...rows.values()]
    .map(({ clientIds, ...row }) => ({ ...row, clients: clientIds.size }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { rows: out, since, sessions: total, unloggedToday: unlogged };
}
