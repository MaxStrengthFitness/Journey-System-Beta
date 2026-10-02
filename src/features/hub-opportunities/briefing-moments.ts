/**
 * THE BRIEFING'S MILESTONE AND BREAK, FROM THE HUB'S ONE ENGINE (the Atlas
 * answers, Oct 2 2026: "move it onto the Hub's one engine").
 *
 * Until now the briefing drew its own markers from `lib/hub-markers.ts`:
 * "Session 25" on every 25th session, and "Back after N wk" after 21
 * calendar days. The Hub card retired those rules in the calm Hub round
 * (Sep 28 2026) for the engine's (`moments-today.ts`): a milestone only from
 * Operations' one list (`SESSION_MILESTONES`: 50th, 100th, …) and only when
 * her total may be quoted, and a break measured in MISSED SESSIONS at her
 * own pace, claimed only inside the part of her timeline Journey owns. So
 * the card said nothing while the briefing said "Session 25", or "Back after
 * 3 wk" for a once-a-week client the card knew was on pace.
 *
 * Now the briefing asks the engine itself: her session today is handed to
 * `buildEntry` as a one-booking day, with her directory row built the way
 * the Hub builds it, and the briefing takes the engine's own milestone and
 * break moments, in the engine's own words. Pure.
 */
import type { Client, ScheduleEntry } from "../../types";
import { buildDirectoryRow, prepareDirectory } from "../client-directory/row";
import { buildEntry, type Moment } from "./moments-today";

/** The kinds the briefing takes from the engine. */
export const BRIEFING_MOMENT_KINDS = ["milestone", "back"] as const;

export function briefingMoments(input: {
  client: Client;
  /** The studio's day (studioTodayKey). */
  today: string;
  now: Date;
  tz?: string;
  /** Every studio the app streams: her home studio's cutover. */
  studios?: ReadonlyArray<{ id?: string; journeyCutoverDate?: string | null; name?: string }> | null;
}): Moment[] {
  const { client, today, now, tz } = input;
  if (!client?.id) return [];
  const booking: ScheduleEntry = {
    id: `briefing-${client.id}`,
    clientId: client.id,
    clientName: client.firstName ?? "",
    trainerName: "",
    studioId: "",
    startTime: now,
    endTime: new Date(now.getTime() + 30 * 60_000),
    status: "Scheduled",
    serviceName: "",
    source: "Manual",
    createdAt: now,
  };
  const ctx = prepareDirectory({
    today,
    now,
    tz,
    studios: input.studios ?? null,
    schedules: null,
    bookingsFresh: false,
    packageIndex: null,
  });
  const row = buildDirectoryRow(client, ctx);
  const entry = buildEntry(
    [booking],
    {
      day: today,
      today,
      now,
      tz,
      schedules: [booking],
      clientsById: new Map([[client.id, client]]),
      rowsById: new Map([[client.id, row]]),
      studios: input.studios ?? null,
      logged: null,
      criticalFor: () => [],
      myIds: [],
    },
    new Set(),
  );
  return entry.moments.filter((m) => (BRIEFING_MOMENT_KINDS as readonly string[]).includes(m.kind));
}
