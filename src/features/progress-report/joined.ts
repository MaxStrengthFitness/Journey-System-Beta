/**
 * The report header's "Joined" date, in the SAME order the profile uses
 * (src/lib/client-since.ts): the first session we can prove, then Mindbody's
 * first visit, then Mindbody's created date, then the earliest contract.
 * The report used to check the first appointment before the first session,
 * so the two screens could disagree about when a client started.
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
