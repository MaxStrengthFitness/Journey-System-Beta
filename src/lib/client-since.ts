/**
 * "CLIENT SINCE" — when this person started at the business.
 *
 * THE BUG
 * -------
 * The profile card was showing the day the Journey document was created,
 * which for a studio that opened in 2014 and adopted this app in 2026 is off
 * by a decade. The display code was not actually wrong — it already preferred
 * `firstAppointmentDate` and `mindbodyCreatedAt` — but it ended its chain on
 * `createdAt`, and on most client documents the Mindbody fields are empty, so
 * the fallback fired every time and looked authoritative.
 *
 * Two things fill those fields, and neither had reached the existing roster:
 *   - the client.created / client.updated WEBHOOK writes both, but Mindbody
 *     only fires it when a record CHANGES. A client who has not been edited
 *     since the integration went live has never produced one.
 *   - the pull-sync creates clients from appointment payloads
 *     (buildCanonicalClientPayload) and wrote neither field at all.
 *
 * WHAT THIS FILE CHANGES
 * ----------------------
 * 1. `mindbodyMemberships` / `mindbodyContracts` are consulted before giving
 *    up. Those maps are ALREADY on the client document — the commercial sync
 *    writes them — and a contract's `startDate` is a real Mindbody date. It
 *    is the day they bought, not the day they joined, so it ranks below the
 *    two true fields, but it beats a Journey timestamp by years.
 * 2. Every answer carries its SOURCE, so a caller can label a Journey
 *    fallback honestly instead of printing it as though Mindbody said it.
 *    A wrong date that looks confident is worse than a missing one.
 *
 * Pure and dependency-free on purpose so it can be unit-tested without
 * Firestore, and so the same rule can be reused by the backfill script.
 */
import { toDate } from "./studio-time";

export type ClientSinceSource =
  /** First workout recorded in Journey. The most meaningful answer we have. */
  | "firstSession"
  /** Mindbody's first visit to the site. */
  | "firstAppointment"
  /** The day Mindbody's record of this person was created. */
  | "mindbodyCreated"
  /** Earliest contract or membership start date on the document. */
  | "commercial"
  /** The Journey document's own createdAt. NOT a business start date. */
  | "journey";

export interface ClientSince {
  date: Date;
  source: ClientSinceSource;
  /** False for "journey" — the caller must not label that one "Client since". */
  fromMindbody: boolean;
}

/** Narrow structural type so this stays testable without the full Client. */
interface ClientSinceInput {
  firstSessionDate?: any;
  firstAppointmentDate?: any;
  mindbodyCreatedAt?: any;
  createdAt?: any;
  mindbodyMemberships?: Record<string, { activeDate?: any; assignedAt?: any }>;
  mindbodyContracts?: Record<string, { startDate?: any; agreementDate?: any }>;
}

/**
 * Earliest real date across the commercial maps.
 *
 * Earliest, not first: the maps are keyed by Mindbody id, so iteration order
 * is arbitrary, and a client who renewed has several records. Only the oldest
 * one is evidence of when they started.
 */
function earliestCommercialDate(client: ClientSinceInput): Date | null {
  let best: Date | null = null;

  const consider = (value: any) => {
    const d = toDate(value);
    if (!d || Number.isNaN(d.getTime())) return;
    // Guard against a placeholder epoch date being treated as 1970 tenure.
    if (d.getFullYear() < 1990) return;
    if (!best || d.getTime() < best.getTime()) best = d;
  };

  for (const c of Object.values(client.mindbodyContracts ?? {})) {
    consider(c?.startDate);
    consider(c?.agreementDate);
  }
  for (const m of Object.values(client.mindbodyMemberships ?? {})) {
    consider(m?.activeDate);
    consider(m?.assignedAt);
  }
  return best;
}

/**
 * Best available start date, with provenance.
 *
 * Order is deliberate: the first workout we can prove, then Mindbody's own
 * two dates, then commercial evidence, then — only so a caller can render
 * something — the Journey timestamp, flagged as not being a business date.
 */
export function resolveClientSince(
  client: ClientSinceInput | null | undefined,
): ClientSince | null {
  if (!client) return null;

  const candidates: Array<[ClientSinceSource, any]> = [
    ["firstSession", client.firstSessionDate],
    ["firstAppointment", client.firstAppointmentDate],
    ["mindbodyCreated", client.mindbodyCreatedAt],
  ];

  for (const [source, value] of candidates) {
    const d = toDate(value);
    if (d && !Number.isNaN(d.getTime()) && d.getFullYear() >= 1990) {
      return { date: d, source, fromMindbody: true };
    }
  }

  const commercial = earliestCommercialDate(client);
  if (commercial) {
    return { date: commercial, source: "commercial", fromMindbody: true };
  }

  const created = toDate(client.createdAt);
  if (created && !Number.isNaN(created.getTime())) {
    return { date: created, source: "journey", fromMindbody: false };
  }

  return null;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * What the profile card should print, as { label, value }.
 *
 * A Journey-only date is labelled "In Journey since" rather than "Client
 * since". Same pixels, and it stops the card from asserting something the
 * data does not support — which is the actual complaint here.
 */
export function clientSinceLabel(
  client: ClientSinceInput | null | undefined,
): { label: string; value: string; source: ClientSinceSource } | null {
  const since = resolveClientSince(client);
  if (!since) return null;
  return {
    label: since.fromMindbody ? "Client since" : "In Journey since",
    value: `${MONTHS[since.date.getMonth()]} ${since.date.getFullYear()}`,
    source: since.source,
  };
}
