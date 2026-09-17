/**
 * MINE — the pure parts of a trainer's own tab.
 *
 * Round: Relay, Sep 2026. Four lanes: Today (their own list), Handed to you
 * (work with their name on it — a colleague's hand-off, a leader's
 * assignment, a team job), Follow-ups (the CRM lane: birthdays and FORD
 * dates for THEIR clients in the next fortnight, from fields the roster
 * already carries — no reads), and Growth (professional development, kept
 * out of Today so it never competes with floor work).
 *
 * "Their clients" has no single field. Three signals, any of which counts:
 * the nightly renewal snapshot's coachIds (coached in the last 60 days),
 * the trainerTally (sessions per trainer), and topTrainerId.
 */
import type { Client } from "../../../types";
import { daysUntilBirthday } from "../../../lib/hub-markers";
import { clientDisplayName } from "../../../lib/client-name";
import { fordSummaryOf } from "../../ford/ford-rollup";
import type { TaskRequest } from "../../studio-tasks/requests";
import type { TaskRow } from "../../studio-tasks/types";

export const GROWTH_CATEGORY = "growth";
export const FOLLOW_UP_DAYS = 14;

export function isMyClient(c: Client, trainerId: string | null): boolean {
  if (!trainerId) return false;
  const snapshot = (c as { renewal?: { coachIds?: string[] } }).renewal;
  if (snapshot?.coachIds?.includes(trainerId)) return true;
  if ((c.trainerTally?.[trainerId] ?? 0) > 0) return true;
  return c.topTrainerId === trainerId;
}

export function myClients(clients: Client[], trainerId: string | null): Client[] {
  return clients.filter((c) => c.id && c.isActive !== false && isMyClient(c, trainerId));
}

export interface FollowUp {
  key: string;
  clientId: string;
  clientName: string;
  kind: "birthday" | "ford";
  label: string;
  daysAway: number;
  /** YYYY-MM-DD */
  date: string;
}

function addDaysKey(todayKey: string, days: number): string {
  const d = new Date(`${todayKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetweenKeys(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000);
}

/**
 * Birthdays and FORD dates for the trainer's clients in the next `within`
 * days, soonest first. A client with both shows twice — they are different
 * conversations.
 */
export function followUps(clients: Client[], trainerId: string | null, todayKey: string, within = FOLLOW_UP_DAYS): FollowUp[] {
  const today = new Date(`${todayKey}T12:00:00`);
  const out: FollowUp[] = [];
  for (const c of myClients(clients, trainerId)) {
    const name = clientDisplayName(c);
    const bday = daysUntilBirthday(c.dateOfBirth, today);
    if (bday !== null && bday <= within) {
      out.push({
        key: `bday:${c.id}`,
        clientId: c.id!,
        clientName: name,
        kind: "birthday",
        label: bday === 0 ? "Birthday today" : bday === 1 ? "Birthday tomorrow" : `Birthday in ${bday} days`,
        daysAway: bday,
        date: addDaysKey(todayKey, bday),
      });
    }
    const next = fordSummaryOf(c).nextDate;
    if (next?.date && /^\d{4}-\d{2}-\d{2}$/.test(next.date)) {
      const days = daysBetweenKeys(todayKey, next.date);
      if (days >= 0 && days <= within) {
        out.push({
          key: `ford:${c.id}:${next.date}`,
          clientId: c.id!,
          clientName: name,
          kind: "ford",
          label: `${next.label}${days === 0 ? " · today" : days === 1 ? " · tomorrow" : ` · in ${days} days`}`,
          daysAway: days,
          date: next.date,
        });
      }
    }
  }
  return out.sort((a, b) => a.daysAway - b.daysAway || a.clientName.localeCompare(b.clientName));
}

export function isGrowthRow(r: TaskRow): boolean {
  return r.template.category === GROWTH_CATEGORY;
}

/** Open asks handed to this person by name. */
export function handedAsks(requests: TaskRequest[], ids: (string | null | undefined)[]): TaskRequest[] {
  const set = new Set(ids.filter(Boolean) as string[]);
  return requests.filter((r) => r.status === "open" && r.forId && set.has(r.forId));
}
