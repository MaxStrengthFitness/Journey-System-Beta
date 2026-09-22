/**
 * HUB MARKERS (tracker round, Sep 2026).
 *
 * "I should be able to see a little marker on someone's card that hey,
 * there's something about this one you should know." One pure function,
 * fed only what the Hub already holds in memory (no reads per card), so a
 * marker costs nothing and never lies about freshness.
 *
 * Each marker is a kind plus a short label. The card shows the label; a
 * leader reading the day sees the same words. Order = importance.
 */

import type { Client, ClientEvent } from "../types";
import { renewalPromptDue } from "../features/renewals/conversation";
import type { HistoryCoverage } from "./prior-history";
import { canQuoteSessionNumber } from "./client-coverage";

export type HubMarkerKind =
  | "consult"
  | "first"
  | "new-to-journey"
  | "milestone"
  | "birthday"
  | "back"
  | "away"
  | "medical"
  | "renewal";

export interface HubMarker {
  kind: HubMarkerKind;
  label: string;
}

/** Days from `today` (local midnight) to a YYYY-MM-DD / ISO day; null if unreadable. */
function daysUntil(day: string | undefined | null, today: Date): number | null {
  if (!day) return null;
  const d = new Date(day.length === 10 ? `${day}T12:00:00` : day);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Days until the next occurrence of a birthday (month/day), 0 = today. */
export function daysUntilBirthday(dateOfBirth: string | undefined | null, today: Date): number | null {
  if (!dateOfBirth) return null;
  const d = new Date(dateOfBirth.length === 10 ? `${dateOfBirth}T12:00:00` : dateOfBirth);
  if (Number.isNaN(d.getTime())) return null;
  const y = today.getFullYear();
  let next = new Date(y, d.getMonth(), d.getDate());
  const t0 = new Date(y, today.getMonth(), today.getDate());
  if (next.getTime() < t0.getTime()) next = new Date(y + 1, d.getMonth(), d.getDate());
  return Math.round((next.getTime() - t0.getTime()) / 86_400_000);
}

const AWAY_TYPES = new Set<ClientEvent["type"]>(["Vacation", "Snowbird"]);

/** Marker thresholds — named so the round doc can quote them. */
export const BIRTHDAY_WINDOW_DAYS = 7;
export const AWAY_WINDOW_DAYS = 14;
export const BACK_AFTER_DAYS = 21;
export const MILESTONE_EVERY = 25;

function shortDay(day: string, today: Date): string {
  const n = daysUntil(day, today);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  const d = new Date(day.length === 10 ? `${day}T12:00:00` : day);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function hubMarkers(params: {
  client: Client | null | undefined;
  /** The number this booking will be (sessionCount + 1 unless already done). */
  sessionNumber: number;
  /** Mindbody's service name for the booking, e.g. "Consultation". */
  serviceName?: string | null;
  /**
   * How much of this client's story Journey holds (lib/client-coverage.ts).
   * Defaults to the cautious answer, so a caller who forgets it gets no
   * number rather than a wrong one.
   */
  coverage?: HistoryCoverage;
  today?: Date;
}): HubMarker[] {
  const { client, sessionNumber, serviceName, coverage = "unknown" } = params;
  const today = params.today ?? new Date();
  if (!client) return [];
  const out: HubMarker[] = [];

  /*
   * Without this gate a woman of twelve years reads as "#1 - First session"
   * on the screen a trainer lands on, and as "Session 25" when her real
   * total is 325. AJ, Sep 2026: say "New to Journey" instead - true, and it
   * does not claim she is new to the STUDIO.
   */
  const numberIsTrustworthy = canQuoteSessionNumber(client, coverage);

  const isConsult =
    /consult/i.test(serviceName || "") || (!!client.requiresConsultation && !client.consultationCompleted);
  if (isConsult) out.push({ kind: "consult", label: "Consultation" });
  else if (!numberIsTrustworthy) {
    if (sessionNumber === 1) out.push({ kind: "new-to-journey", label: "New to Journey" });
  } else if (sessionNumber === 1) out.push({ kind: "first", label: "First session" });
  else if (sessionNumber > 1 && sessionNumber % MILESTONE_EVERY === 0) out.push({ kind: "milestone", label: `Session ${sessionNumber}` });

  const bday = daysUntilBirthday(client.dateOfBirth, today);
  if (bday !== null && bday <= BIRTHDAY_WINDOW_DAYS) {
    out.push({ kind: "birthday", label: bday === 0 ? "Birthday today" : bday === 1 ? "Birthday tomorrow" : `Birthday in ${bday} days` });
  }

  const sinceLast = daysUntil(client.lastSessionDate, today);
  if (sinceLast !== null && -sinceLast >= BACK_AFTER_DAYS && sessionNumber > 1) {
    out.push({ kind: "back", label: `Back after ${Math.round(-sinceLast / 7)} wk` });
  }

  for (const e of client.events || []) {
    const start = daysUntil(e.date, today);
    const end = daysUntil(e.endDate, today);
    if (AWAY_TYPES.has(e.type)) {
      const upcoming = start !== null && start >= 0 && start <= AWAY_WINDOW_DAYS;
      const ongoing = start !== null && start < 0 && end !== null && end >= 0;
      if (upcoming) out.push({ kind: "away", label: `Away from ${shortDay(e.date, today)}` });
      else if (ongoing) out.push({ kind: "away", label: `Away until ${shortDay(e.endDate!, today)}` });
    } else if (e.type === "Medical") {
      if (start !== null && start >= 0 && start <= AWAY_WINDOW_DAYS) {
        out.push({ kind: "medical", label: `${e.title || "Medical"} ${shortDay(e.date, today)}` });
      }
    }
  }

  if (client.renewal && renewalPromptDue(client.renewal)) out.push({ kind: "renewal", label: "Renewal due" });

  // One of each kind, first wins.
  const seen = new Set<HubMarkerKind>();
  return out.filter((m) => (seen.has(m.kind) ? false : (seen.add(m.kind), true)));
}

/** How many marker chips a Hub card shows before folding the rest into "+N". */
export const HUB_CARD_MAX_MARKERS = 2;

/**
 * The chips a card has room for, plus how many it folded. A 30-minute card
 * is one line of chips tall; the markers are ordered by importance, so the
 * first ones are the ones to keep. "+N" tells the trainer there is more on
 * the profile without covering the session time.
 */
export function visibleMarkers<T>(markers: T[], max: number = HUB_CARD_MAX_MARKERS): { shown: T[]; more: number } {
  if (markers.length <= max) return { shown: markers, more: 0 };
  // Folding a single marker into "+1" would hide one chip to show another.
  const keep = Math.max(1, max - 1);
  return { shown: markers.slice(0, keep), more: markers.length - keep };
}

/** True when Mindbody's service name says nothing a trainer needs ("Training Session"). */
export function isDefaultService(serviceName?: string | null): boolean {
  const s = (serviceName || "").trim().toLowerCase();
  return s === "" || /^(training|personal training|1[- ]on[- ]1|private)?\s*(session|training)?$/.test(s) || s === "training session";
}
