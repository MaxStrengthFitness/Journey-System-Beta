/**
 * Deriving things from a pile of FORD entries.
 *
 * All pure functions over an array, no Firestore. That is what makes them
 * testable, and `summariseFord` is called from both the write path (to cache
 * the rollup on the client document) and the read path (to render before the
 * cache exists), so it has to behave identically in both.
 */

import type { Client, ClientEvent } from "../../types";
import {
  EMPTY_FORD_SUMMARY,
  FORD_PILLARS,
  nextOccurrence,
  toDate,
  type ClientFordSummary,
  type FordEntry,
  type FordPillar,
} from "./types";

/**
 * The studio a client's FORD details are stamped with, and read by.
 *
 * The client's home studio, falling back to the older `studioId` field —
 * the order `getStudioIdFromData` in firestore.rules uses, except that an
 * EMPTY `homeStudioId` falls through to `studioId` here (the rules would
 * take the ""). The FORD rules test the detail's own stamp, never the client
 * document, so that difference cannot refuse anything.
 *
 * EVERY FORD writer stamps this and EVERY per-client FORD read filters on it
 * (client codex, phase 1): the read rule tests `resource.data.studioId`, so
 * a query without the filter is
 * refused for everyone below franchise owner, and a detail stamped with any
 * other studio is invisible to the filtered read. "" when the client names
 * no studio at all; nothing can be written or read for such a client.
 */
export function fordStudioIdOf(client: Client | null | undefined): string {
  if (!client) return "";
  const c = client as Partial<Client> & { studioId?: string };
  return c.homeStudioId || c.studioId || "";
}

/** How many pinned lines per pillar the rollup carries. Enough to glance at. */
const PINNED_PER_PILLAR = 3;
/** Pinned lines are truncated in the rollup — it is a chip, not the record. */
const PINNED_MAX_CHARS = 90;

/* ------------------------------------------------------------------ */
/* THE SUMMARY                                                         */
/* ------------------------------------------------------------------ */

export function summariseFord(all: FordEntry[]): ClientFordSummary {
  const live = all.filter((e) => !e.isArchived);

  const counts: Record<FordPillar, number> = {
    family: 0,
    occupation: 0,
    recreation: 0,
    dreams: 0,
  };
  const pinned: Partial<Record<FordPillar, string[]>> = {};
  let untagged = 0;
  let openOpportunities = 0;

  for (const e of live) {
    if (!e.pillar) {
      untagged += 1;
    } else {
      counts[e.pillar] += 1;
      if (e.isPinned) {
        const bucket = (pinned[e.pillar] ||= []);
        if (bucket.length < PINNED_PER_PILLAR) {
          bucket.push(
            e.body.length > PINNED_MAX_CHARS
              ? `${e.body.slice(0, PINNED_MAX_CHARS - 1).trimEnd()}…`
              : e.body,
          );
        }
      }
    }
    if (e.opportunity && (e.opportunity.status === "idea" || e.opportunity.status === "planned")) {
      openOpportunities += 1;
    }
  }

  const upcoming = nextUpcoming(live);

  return {
    counts,
    untagged,
    pinned,
    nextDate: upcoming
      ? {
          date: upcoming.when.toISOString().slice(0, 10),
          label: upcoming.entry.subject || upcoming.entry.body,
          pillar: upcoming.entry.pillar,
        }
      : null,
    openOpportunities,
    updatedAt: new Date().toISOString(),
  };
}

/** Read the rollup off a client, tolerating clients that have never had one. */
export function fordSummaryOf(client: Client | null | undefined): ClientFordSummary {
  const raw = (client as any)?.fordSummary;
  if (!raw || typeof raw !== "object") return EMPTY_FORD_SUMMARY;
  return {
    ...EMPTY_FORD_SUMMARY,
    ...raw,
    counts: { ...EMPTY_FORD_SUMMARY.counts, ...(raw.counts || {}) },
    pinned: raw.pinned || {},
  };
}

/* ------------------------------------------------------------------ */
/* DATES                                                               */
/* ------------------------------------------------------------------ */

export interface UpcomingFord {
  entry: FordEntry;
  /** The next time this date comes round — already rolled forward if annual. */
  when: Date;
  daysAway: number;
}

/**
 * Every dated detail, soonest first, from today forward.
 *
 * Past one-off dates are dropped here even though `whenLabel` will happily
 * render them, because this list drives "what is coming up" — a graduation
 * from last spring belongs on the client's timeline, not in the studio's
 * planning queue.
 */
export function upcomingFord(
  entries: FordEntry[],
  opts: { within?: number; now?: Date } = {},
): UpcomingFord[] {
  const now = opts.now ?? new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const rows: UpcomingFord[] = [];
  for (const entry of entries) {
    if (entry.isArchived) continue;
    const when = nextOccurrence(toDate(entry.eventDate), entry.recurrence, now);
    if (!when || when < startOfToday) continue;
    const daysAway = Math.round(
      (new Date(when.getFullYear(), when.getMonth(), when.getDate()).getTime() -
        startOfToday.getTime()) /
        86_400_000,
    );
    if (opts.within !== undefined && daysAway > opts.within) continue;
    rows.push({ entry, when, daysAway });
  }
  return rows.sort((a, b) => a.when.getTime() - b.when.getTime());
}

function nextUpcoming(entries: FordEntry[]): UpcomingFord | null {
  return upcomingFord(entries)[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* GROUPING                                                            */
/* ------------------------------------------------------------------ */

export interface FordPillarBucket {
  pillar: FordPillar;
  /** Standing facts — the glanceable top of the pillar. */
  pinned: FordEntry[];
  /** Dated or one-off details, newest first. */
  moments: FordEntry[];
}

/**
 * Split the pile into the four pillars, plus whatever is still unfiled.
 *
 * Sorting is the quiet part that makes the section readable: pinned facts go
 * oldest-first, because standing facts read like a paragraph that grew, while
 * moments go newest-first, because the last thing said matters most.
 */
export function groupByPillar(entries: FordEntry[]): {
  buckets: FordPillarBucket[];
  untagged: FordEntry[];
} {
  const live = entries.filter((e) => !e.isArchived);
  const untagged = live
    .filter((e) => !e.pillar)
    .sort((a, b) => time(b.occurredAt) - time(a.occurredAt));

  const buckets = FORD_PILLARS.map((pillar) => {
    const mine = live.filter((e) => e.pillar === pillar);
    return {
      pillar,
      pinned: mine
        .filter((e) => e.isPinned)
        .sort((a, b) => time(a.occurredAt) - time(b.occurredAt)),
      moments: mine
        .filter((e) => !e.isPinned)
        .sort((a, b) => time(b.occurredAt) - time(a.occurredAt)),
    };
  });

  return { buckets, untagged };
}

function time(value: any): number {
  return toDate(value)?.getTime() ?? 0;
}

/* ------------------------------------------------------------------ */
/* THE LEGACY ADAPTER — client.events -> FORD                          */
/* ------------------------------------------------------------------ */

/**
 * The dossier's Events section, read as FORD.
 *
 * `client.events[]` has been the place birthdays, anniversaries and vacations
 * were typed since before this feature existed. Rather than migrate it — which
 * would mean a script, a backup and a window where two systems disagree — it
 * is normalised into the same shape at read time and flagged `isLegacy`, the
 * same trick `useClientJournal` plays on the old note collections. The array
 * stays on the client document untouched, the Events section disappears from
 * the UI, and one dated timeline is left standing.
 *
 * Non-personal event types are deliberately dropped. A scheduled InBody scan
 * or a routine change is studio admin; filing it under Family would be noise
 * in the one place that has to stay signal.
 */
const EVENT_TO_PILLAR: Record<ClientEvent["type"], FordPillar | null> = {
  "Birthday/Anniversary": "family",
  Vacation: "recreation",
  Snowbird: "recreation",
  Medical: null,
  "Progress Report": null,
  "InBody Scan": null,
  "Routine Change": null,
  Alert: null,
  Other: null,
};

/** Birthdays and anniversaries repeat; a holiday in March does not. */
const EVENT_RECURS: Partial<Record<ClientEvent["type"], true>> = {
  "Birthday/Anniversary": true,
};

export function adaptClientEvents(client: Client | null | undefined): FordEntry[] {
  if (!client?.events?.length) return [];

  const out: FordEntry[] = [];
  for (const event of client.events) {
    const pillar = EVENT_TO_PILLAR[event.type];
    if (!pillar) continue;

    const when = toDate(event.date);
    const body = [event.title, event.notes].filter(Boolean).join(" — ").trim();
    if (!body) continue;

    out.push({
      id: `legacy:clientEvents:${event.id}`,
      clientId: client.id,
      studioId: fordStudioIdOf(client),
      pillar,
      body,
      subject: event.title || null,
      isPinned: false,
      eventDate: when,
      recurrence: EVENT_RECURS[event.type] ? "annual" : "none",
      opportunity: null,
      occurredAt: toDate(event.createdAt) || when || new Date(0),
      createdAt: event.createdAt ?? null,
      updatedAt: null,
      authorId: "",
      authorName: "",
      authorInitials: "",
      origin: "legacy",
      sessionId: null,
      isArchived: false,
      isLegacy: true,
      legacySource: "Profile events",
    });
  }
  return out;
}
