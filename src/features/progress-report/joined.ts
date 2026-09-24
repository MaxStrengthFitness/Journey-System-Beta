/**
 * The report header's "Joined" date, by the SAME rule the profile uses
 * (src/lib/client-since.ts): the earliest of the first session in Journey,
 * Mindbody's first visit and Mindbody's created date, then the earliest
 * contract. The report used to check the first appointment before the first
 * session, so the two screens could disagree about when a client started;
 * since Sep 24 2026 neither lets Journey's first day stand in for a
 * migrating client's first day.
 *
 * Never the Journey document's own createdAt — that is when the app met the
 * client, not when the business did, and a confident wrong date is worse
 * than a dash.
 */
import type { Client } from "../../types";
import { resolveClientSince } from "../../lib/client-since";

/** A date-only string is pinned to local noon so the day never slips in Eastern time. */
const pin = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v;

export function reportJoinedDate(
  client: Pick<
    Client,
    | "firstSessionDate"
    | "firstAppointmentDate"
    | "mindbodyCreatedAt"
    | "mindbodyContracts"
    | "mindbodyMemberships"
  >,
  reportFirstSessionDate?: string | null,
): Date | null {
  const since = resolveClientSince({
    firstSessionDate: pin(client.firstSessionDate || reportFirstSessionDate || null),
    firstAppointmentDate: pin(client.firstAppointmentDate),
    mindbodyCreatedAt: pin(client.mindbodyCreatedAt),
    mindbodyContracts: client.mindbodyContracts as any,
    mindbodyMemberships: client.mindbodyMemberships as any,
  });
  return since && since.fromMindbody ? since.date : null;
}
