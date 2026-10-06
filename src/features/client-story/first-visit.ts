/**
 * MINDBODY'S FIRST VISIT, AND "Mar 2019" — the two small answers the rest of
 * the app borrows from the codex Story (the speed round, Oct 5 2026, R13).
 *
 * They live in this leaf module, apart from story.ts, because the Hub's
 * Client Directory row (client-directory/row.ts → client-admin/account.ts)
 * needs them on the first screen, and importing them from story.ts dragged
 * the Story's whole graph (goals, Pulse scoring, FORD, the note catalog's
 * readers...) into the bundle every iPad parses before it can draw the Hub.
 * story.ts re-exports both, so nothing that already imports them from there
 * changes. Keep this file's imports small: a feature import here goes onto
 * the first screen.
 *
 * Pure: no React, no Firestore. Tested in story.test.ts (TZ=America/New_York).
 */
import type { Client } from "../../types";
import { mindbodyDayKey } from "../renewals/engine";
import { studioDayKeyOf, type DateLike } from "../../lib/studio-time";
import { dayKeyDate } from "../client-codex/kit/text";

/** Text as typed, with Windows line ends made plain and the ends trimmed. */
const tidy = (text: string | null | undefined): string => (text ?? "").replace(/\r\n?/g, "\n").trim();

/** A real calendar day key, or null. */
const asDay = (key: string | null | undefined): string | null => (key && dayKeyDate(key) ? key : null);

/** The studio day of a stored instant (a Timestamp, a Date, an ISO string); a day key passes through. */
const instantDay = (value: unknown, tz?: string): string | null => {
  if (value === null || value === undefined || value === "") return null;
  return asDay(studioDayKeyOf(value as DateLike, tz));
};

/** The day of a Mindbody date: a UTC day (lib/mindbody-dates.ts). */
const mindbodyDay = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  return asDay(mindbodyDayKey(value));
};

/** "Mar 2019" for a day key. */
export function monthYear(day: string): string {
  const d = dayKeyDate(day);
  return d ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "";
}

/**
 * What `firstAppointmentDate` was taken from, by its `firstAppointmentDateSource`:
 *
 *   mindbody  absent, or "mindbody": Mindbody said so (the webhook, Master
 *             Sync). THE first visit, a Mindbody date read as its UTC day.
 *   booking   "pull-sync:…", "rehome:…": the earliest booking a schedule pull
 *             happened to see — a real appointment's instant (the studio's
 *             day), and a ceiling: the first may be earlier.
 *   session   "backfill:firstSessionDate", "backfill:earliest-session":
 *             Journey's own earliest session (scripts/backfill-client-since.ts),
 *             not a Mindbody visit at all. The studio's day.
 *   contract  "backfill:earliest-contract": the earliest package start on
 *             file, a Mindbody date (its UTC day).
 *   other     any other marker: an inference of unknown kind.
 *
 * Only `mindbody` is authoritative; the rest are "the earliest Journey has".
 */
export type FirstVisitBasis = "mindbody" | "booking" | "session" | "contract" | "other";

export function firstVisitOf(
  client: Pick<Client, "firstAppointmentDate" | "firstAppointmentDateSource">,
  tz?: string,
): { day: string; authoritative: boolean; basis: FirstVisitBasis } | null {
  const source = tidy(client.firstAppointmentDateSource);
  const basis: FirstVisitBasis =
    !source || source === "mindbody"
      ? "mindbody"
      : source.startsWith("pull-sync:") || source.startsWith("rehome:")
        ? "booking"
        : source === "backfill:firstSessionDate" || source === "backfill:earliest-session"
          ? "session"
          : source === "backfill:earliest-contract"
            ? "contract"
            : "other";
  const mindbodyDate = basis === "mindbody" || basis === "contract";
  const day = mindbodyDate ? mindbodyDay(client.firstAppointmentDate) : instantDay(client.firstAppointmentDate, tz);
  return day ? { day, authoritative: basis === "mindbody", basis } : null;
}
