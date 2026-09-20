/**
 * MOMENTS — the good things coming up this week. Pure.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): a leader should know about
 * "any clients that have an anniversary coming up", and be "looking for
 * ways they can improve the community in their studio". The Delight queue
 * already holds the gestures the team promised itself; this folds three
 * kinds of moment into one week-shaped list:
 *
 *   GESTURE     a Delight-queue opportunity due within the horizon, and
 *               whether anyone owns it.
 *   DATE        a note pinned to a day (features/client-notes/mattering,
 *               the DAY shape — a birthday, an anniversary, a date that
 *               needs remembering), on its next occurrence.
 *   MILESTONE   a session that would be a client's 50th, 100th, … — only
 *               when Journey may quote their total (prior history counted
 *               or the studio's cutover known; never off a low Journey
 *               count during migration) — and a whole year with the studio,
 *               from the first date Mindbody or Journey can prove.
 *
 * Every row names the day it falls on, so the Next 3 days strip can count
 * them, and the panel lists them soonest first.
 */
import type { Client, ScheduleEntry } from "../../../types";
import type { JournalEntry } from "../../../types/journal";
import { clientDisplayName } from "../../../lib/client-name";
import { resolveClientSince } from "../../../lib/client-since";
import { historyCoverage } from "../../../lib/prior-history";
import { formatStudioTime, studioDateKey, toDate } from "../../../lib/studio-time";
import { addDays } from "../../client-history/model";
import { describeWindow, nextOccurrence } from "../../client-notes/mattering";
import type { DelightRow } from "../../ford/useClientFord";

export type MomentKind = "gesture" | "date" | "milestone";

export interface MomentRow {
  key: string;
  kind: MomentKind;
  clientId: string;
  name: string;
  /** `YYYY-MM-DD` the moment falls on. */
  day: string;
  sentence: string;
  proof: string;
  needsOwner: boolean;
}

export interface MomentsSummary {
  rows: MomentRow[];
  gestures: number;
  gesturesUnowned: number;
  dates: number;
  milestones: number;
}

/** The session counts worth marking. */
export const SESSION_MILESTONES = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];

export const MOMENTS_HORIZON_DAYS = 7;

/** Which client field each "client since" source reads, so a date-only string can be read as text. */
const SINCE_FIELD: Record<string, string> = { firstSession: "firstSessionDate", firstAppointment: "firstAppointmentDate", mindbodyCreated: "mindbodyCreatedAt" };

const nameOf = (c: Client) => clientDisplayName(c, "A client");

const prettyDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export interface MomentsInput {
  delight: DelightRow[];
  /** Notes the studio holds with a window that has not ended, and its yearly notes. */
  datedNotes: JournalEntry[];
  clients: Client[];
  /** The week's live bookings, for milestones. */
  weekEntries: ScheduleEntry[];
  today: string;
  /** The studio's Journey cutover day, if set — the migration rule reads it. */
  cutover?: string | null;
  horizonDays?: number;
  tz?: string;
}

export function moments(input: MomentsInput): MomentsSummary {
  const { today, tz } = input;
  const horizon = addDays(today, input.horizonDays ?? MOMENTS_HORIZON_DAYS);
  const byId = new Map(input.clients.filter((c) => c.id).map((c) => [c.id as string, c]));
  const rows: MomentRow[] = [];
  let gestures = 0;
  let gesturesUnowned = 0;
  let dates = 0;
  let milestones = 0;

  /* ---- gestures ---- */
  for (const r of input.delight) {
    if (r.daysAway === null || !r.when) continue;
    const day = studioDateKey(r.when, tz);
    if (!day || day < today || day > horizon) continue;
    const op = r.entry.opportunity;
    if (op && (op.status === "done" || op.status === "declined")) continue;
    const client = byId.get(r.entry.clientId);
    const needsOwner = !op?.ownerName;
    gestures += 1;
    if (needsOwner) gesturesUnowned += 1;
    rows.push({
      key: `gesture:${r.entry.id}`,
      kind: "gesture",
      clientId: r.entry.clientId,
      name: client ? nameOf(client) : "A client",
      day,
      sentence: op?.idea?.trim() || r.entry.body.trim(),
      proof: needsOwner ? "Needs an owner." : `${op?.ownerName} has it${op?.status === "planned" ? " — planned" : ""}.`,
      needsOwner,
    });
  }

  /* ---- dates ---- */
  for (const e of input.datedNotes) {
    const next = nextOccurrence(e, today, tz);
    if (!next || next > horizon) continue;
    const client = byId.get(e.clientId);
    dates += 1;
    const body = (e.body ?? "").trim();
    rows.push({
      key: `date:${e.id}`,
      kind: "date",
      clientId: e.clientId,
      name: client ? nameOf(client) : "A client",
      day: next,
      sentence: body.length > 120 ? `${body.slice(0, 117)}…` : body,
      proof: `${describeWindow(e, tz)}${e.authorName ? ` — noted by ${e.authorName}` : ""}.`,
      needsOwner: false,
    });
  }

  /* ---- milestones ---- */
  const bookingsByClient = new Map<string, ScheduleEntry[]>();
  for (const e of input.weekEntries) {
    if (e.status !== "Scheduled" || !e.clientId) continue;
    const day = studioDateKey(e.startTime, tz);
    if (!day || day < today || day > horizon) continue;
    const list = bookingsByClient.get(e.clientId) ?? [];
    list.push(e);
    bookingsByClient.set(e.clientId, list);
  }
  for (const [clientId, bookings] of bookingsByClient) {
    const client = byId.get(clientId);
    if (!client) continue;
    bookings.sort((a, b) => (toDate(a.startTime)?.getTime() ?? 0) - (toDate(b.startTime)?.getTime() ?? 0));

    // Session milestones: only when the total may be quoted.
    const coverage = historyCoverage(client, input.cutover ?? null);
    const count = typeof client.sessionCount === "number" && Number.isFinite(client.sessionCount) ? client.sessionCount : null;
    if (coverage !== "unknown" && count !== null) {
      bookings.forEach((b, i) => {
        const nth = count + i + 1;
        if (!SESSION_MILESTONES.includes(nth)) return;
        const day = studioDateKey(b.startTime, tz) as string;
        milestones += 1;
        rows.push({
          key: `milestone:${clientId}:${nth}`,
          kind: "milestone",
          clientId,
          name: nameOf(client),
          day,
          sentence: `Their ${ordinal(nth)} session.`,
          proof: `Booked ${prettyDay(day)} ${formatStudioTime(b.startTime, tz)}${b.trainerName ? ` with ${b.trainerName}` : ""}. ${count} so far${coverage === "partial" ? ", earlier sessions counted from the record" : ""}.`,
          needsOwner: false,
        });
      });
    }

  }

  /* ---- a whole year with the studio: every active client, booked this week or not ---- */
  for (const client of input.clients) {
    if (!client.id || client.isActive === false) continue;
    const since = resolveClientSince(client);
    if (!since || !since.fromMindbody) continue;
    // A date-only string is a calendar day (the date trap: read as UTC it is
    // the previous evening in Ohio), so the day is taken from the text when
    // the record holds one; an instant is read in the studio's zone.
    const raw = (client as unknown as Record<string, unknown>)[SINCE_FIELD[since.source] ?? ""];
    const startDay = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : studioDateKey(since.date, tz);
    if (!startDay || startDay >= today) continue;
    const md = startDay.slice(5);
    const thisYear = `${today.slice(0, 4)}-${md}`;
    const anniversary = thisYear >= today ? thisYear : `${Number(today.slice(0, 4)) + 1}-${md}`;
    if (anniversary > horizon) continue;
    const years = Number(anniversary.slice(0, 4)) - Number(startDay.slice(0, 4));
    if (years < 1) continue;
    const booked = bookingsByClient.get(client.id);
    milestones += 1;
    rows.push({
      key: `years:${client.id}:${years}`,
      kind: "milestone",
      clientId: client.id,
      name: nameOf(client),
      day: anniversary,
      sentence: `${years} year${years === 1 ? "" : "s"} with the studio.`,
      proof: `First seen ${prettyDay(startDay)} (${since.source === "firstSession" ? "their first session" : since.source === "firstAppointment" ? "their first appointment" : "when Mindbody first knew them"}).${booked && booked.length > 0 ? "" : " Not booked this week."}`,
      needsOwner: false,
    });
  }

  rows.sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
  return { rows, gestures, gesturesUnowned, dates, milestones };
}

/** How many moments fall on each day, for the Next 3 days strip. */
export function momentsByDay(rows: MomentRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.day] = (out[r.day] ?? 0) + 1;
  return out;
}
