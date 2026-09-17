/**
 * COHORTS — the client groups a leader routes work to.
 *
 * Round: Relay, Sep 2026. AJ's document: "route tasks to specific cohorts,
 * such as ... upcoming renewals, MIA lists, birthdays, clients with upcoming
 * FORD events, clients missing a B routine". Each cohort is a live count
 * from fields the roster already carries — the nightly renewal snapshot,
 * lastSessionDate, dateOfBirth, the FORD summary cache, isRoutineBActive —
 * so the Team tab costs no read for them.
 *
 * Every cohort is per studio (homeStudioId) and active clients only.
 */
import type { Client } from "../../../types";
import { daysUntilBirthday } from "../../../lib/hub-markers";
import { clientDisplayName } from "../../../lib/client-name";
import { fordSummaryOf } from "../../ford/ford-rollup";
import { renewalPromptDue } from "../../renewals/conversation";

export type CohortKey = "renewals" | "mia" | "birthdays" | "ford" | "routineB";

export const COHORT_LABEL: Record<CohortKey, string> = {
  renewals: "Renewals due",
  mia: "Not seen in 14+ days",
  birthdays: "Birthdays this month",
  ford: "Dates they mentioned",
  routineB: "Routine B off",
};

export const COHORT_HINT: Record<CohortKey, string> = {
  renewals: "A renewal conversation is due, by the nightly snapshot.",
  mia: "Active, not paused from the MIA list, and no session logged for two weeks.",
  birthdays: "Birthdays in the next 30 days.",
  ford: "A FORD date in the next 30 days — a wedding, a trip, a race.",
  routineB: "Active clients whose Routine B is switched off.",
};

/** What a leader usually asks for, per cohort. */
export const COHORT_DEFAULT_ASK: Record<CohortKey, { title: string; action: "progress-report" | "assessment" | "inbody" | "custom" }> = {
  renewals: { title: "Client Progress Report before the renewal", action: "progress-report" },
  mia: { title: "Reach out — we miss them", action: "custom" },
  birthdays: { title: "Birthday card and a call", action: "custom" },
  ford: { title: "Ask about it before the day", action: "custom" },
  routineB: { title: "Build a Routine B", action: "custom" },
};

export const MIA_DAYS = 14;
export const COHORT_WINDOW_DAYS = 30;

export interface CohortMember {
  id: string;
  name: string;
  /** One line of why they are in the cohort. */
  why: string;
  /** For sorting: soonest first. */
  sortKey: number;
}

function daysSince(dateKey: string | undefined, todayKey: string): number | null {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}/.test(dateKey)) return null;
  return Math.round((Date.parse(`${todayKey}T12:00:00`) - Date.parse(`${dateKey.slice(0, 10)}T12:00:00`)) / 86_400_000);
}

function daysUntil(dateKey: string | undefined, todayKey: string): number | null {
  const d = daysSince(dateKey, todayKey);
  return d === null ? null : -d;
}

function excludedFromMia(c: Client, todayKey: string): boolean {
  const meta = c.retentionMeta;
  if (!meta?.excludedFromMIA) return false;
  const until = meta.autoIncludeAfter;
  const untilKey = typeof until === "string" ? until.slice(0, 10) : null;
  if (untilKey && /^\d{4}-\d{2}-\d{2}$/.test(untilKey) && untilKey < todayKey) return false;
  return true;
}

function active(c: Client, studioId: string): boolean {
  return Boolean(c.id) && c.isActive !== false && c.homeStudioId === studioId && !c.supersededById;
}

export function cohortsOf(clients: Client[], studioId: string | null, todayKey: string): Record<CohortKey, CohortMember[]> {
  const out: Record<CohortKey, CohortMember[]> = { renewals: [], mia: [], birthdays: [], ford: [], routineB: [] };
  if (!studioId) return out;
  const today = new Date(`${todayKey}T12:00:00`);
  for (const c of clients) {
    if (!active(c, studioId)) continue;
    const name = clientDisplayName(c);
    const snapshot = (c as { renewal?: Parameters<typeof renewalPromptDue>[0] }).renewal;
    if (renewalPromptDue(snapshot)) {
      const focus = (snapshot as { focusDate?: string | null } | undefined)?.focusDate ?? null;
      const days = focus ? daysUntil(focus, todayKey) : null;
      out.renewals.push({
        id: c.id!,
        name,
        why: days === null ? "Renewal conversation due" : days < 0 ? `Package ended ${-days} days ago` : days === 0 ? "Package ends today" : `Package ends in ${days} days`,
        sortKey: days ?? 999,
      });
    }
    const since = daysSince(c.lastSessionDate, todayKey);
    if (since !== null && since >= MIA_DAYS && !excludedFromMia(c, todayKey)) {
      out.mia.push({ id: c.id!, name, why: `Last session ${since} days ago`, sortKey: -since });
    }
    const bday = daysUntilBirthday(c.dateOfBirth, today);
    if (bday !== null && bday <= COHORT_WINDOW_DAYS) {
      out.birthdays.push({ id: c.id!, name, why: bday === 0 ? "Birthday today" : bday === 1 ? "Birthday tomorrow" : `Birthday in ${bday} days`, sortKey: bday });
    }
    const next = fordSummaryOf(c).nextDate;
    if (next?.date) {
      const days = daysUntil(next.date, todayKey);
      if (days !== null && days >= 0 && days <= COHORT_WINDOW_DAYS) {
        out.ford.push({ id: c.id!, name, why: `${next.label} · ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`, sortKey: days });
      }
    }
    if (!c.isRoutineBActive) {
      out.routineB.push({ id: c.id!, name, why: "Routine B off", sortKey: 0 });
    }
  }
  for (const key of Object.keys(out) as CohortKey[]) out[key].sort((a, b) => a.sortKey - b.sortKey || a.name.localeCompare(b.name));
  return out;
}

export const COHORT_ORDER: CohortKey[] = ["renewals", "mia", "birthdays", "ford", "routineB"];
