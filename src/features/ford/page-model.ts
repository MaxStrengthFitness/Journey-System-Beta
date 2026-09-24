/**
 * THE FORD PAGE, WORKED OUT — the pure selectors behind Notes & Profile →
 * FORD, its line on the sub-toggle, and the FORD slot the Overview will draw.
 *
 * Client codex, Sep 2026. The page reads what the tab already loaded — the
 * ONE FORD stream, the ONE journal load's settled life notes, the Pulse
 * history the profile already streams — and this module turns them into
 * what each part of the page says. Nothing here reads, writes or keeps a
 * clock of its own: every "today" is a studio day key handed in.
 *
 * The rules these keep:
 *  - A failed read is unknown, never empty. Nothing here says "nothing on
 *    file" unless FORD answered (`status === "ready"`), and a count it cannot
 *    know is null.
 *  - Sentences, not scores: a count is "6 details", a date "in 17 days".
 *  - Older life notes (the journal's `life` notes from before FORD) are shown
 *    in their pillar beside FORD's own moments, never dropped: a client's
 *    history did not begin when FORD did. They come from Notes' ONE selector
 *    (`olderLifeNotesByPillar`), so the note that leaves Notes is the note
 *    that lands here.
 *  - FORD text reaches the Overview only when FORD answered for a reader the
 *    rule accepts; while it loads, the Overview gets counts, never lines.
 *
 * Pure: page-model.test.ts, run under TZ=America/New_York.
 */
import type { Client } from "../../types";
import type { NoteThread } from "../client-notes/threads";
import { workSentence } from "../client-life/life";
import type { FordPillarBucket } from "./ford-rollup";
import { comingUp, studioNoon, type ComingUpRow } from "./coming-up";
import { inTime } from "../client-codex/kit/text";
import {
  FORD_PILLARS,
  daysUntil,
  nextOccurrence,
  toDate,
  urgencyOf,
  type FordEntry,
  type FordOrigin,
  type FordPillar,
  type FordUrgency,
} from "./types";
import type { FordReadStatus } from "./read-status";

/** FORD's read state as a page sees it: `off` is a reader the rule refuses (never read at all). */
export type FordPageStatus = FordReadStatus | "off";

/* ------------------------------------------------------------------ */
/* A pillar's list                                                     */
/* ------------------------------------------------------------------ */

export type PillarItem =
  | { kind: "detail"; key: string; entry: FordEntry }
  | { kind: "older-note"; key: string; thread: NoteThread };

export interface PillarList {
  /** Standing facts, oldest first — a paragraph that grew. */
  pinned: FordEntry[];
  /** FORD's moments and the older life notes together, newest first. */
  items: PillarItem[];
  /** Everything the pillar holds: facts, moments and older notes. */
  total: number;
}

const timeOf = (v: unknown): number => toDate(v)?.getTime() ?? 0;

/**
 * One pillar: its standing facts, then its moments merged with the older life
 * notes filed under it, newest first. `bucket` is null when FORD was not read
 * (the older notes still show — they are journal notes, not FORD's).
 */
export function pillarItems(bucket: FordPillarBucket | null, older: readonly NoteThread[]): PillarList {
  const pinned = bucket?.pinned ?? [];
  const moments: PillarItem[] = (bucket?.moments ?? []).map((entry) => ({ kind: "detail", key: entry.id, entry }));
  const notes: PillarItem[] = older.map((thread) => ({ kind: "older-note", key: `note:${thread.id}`, thread }));
  const at = (i: PillarItem) => (i.kind === "detail" ? timeOf(i.entry.occurredAt) : timeOf(i.thread.root.occurredAt));
  const items = [...moments, ...notes].sort((a, b) => at(b) - at(a));
  return { pinned, items, total: pinned.length + items.length };
}

/* ------------------------------------------------------------------ */
/* Words for one line                                                  */
/* ------------------------------------------------------------------ */

/** "Sep 20", or "Sep 20, 2025" when it is not `now`'s year. */
export function shortDate(value: unknown, now: Date): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** "Sep 20, 2025" — always with the year: an older note says how old it is. */
export function dateWithYear(value: unknown): string | null {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
}

/** Where a capture was caught, as the tray says it. */
export const ORIGIN_WORDS: Readonly<Record<FordOrigin, string>> = {
  in_session: "Caught mid-session",
  briefing: "Caught in the briefing",
  post_session: "Caught after the session",
  profile: "Added on the profile",
  legacy: "From the old events list",
};

/**
 * When a detail points at, from `now`: the days away (negative is past), the
 * urgency colour, and whether it comes round every year. Null when undated.
 */
export function detailWhen(
  entry: Pick<FordEntry, "eventDate" | "recurrence">,
  now: Date,
): { days: number; urgency: FordUrgency; annual: boolean } | null {
  const next = nextOccurrence(toDate(entry.eventDate), entry.recurrence, now);
  const days = daysUntil(next, now);
  if (days === null || !next) return null;
  return { days, urgency: urgencyOf(next, "none", now), annual: entry.recurrence === "annual" };
}

/** "From an older note · Jess · Sep 20, 2025 · closed Oct 3". */
export function olderNoteMeta(thread: NoteThread): string {
  const root = thread.root;
  const name = (root.authorName ?? "").trim();
  const who =
    (name && !name.toLowerCase().startsWith("unknown") ? name : "") ||
    (root.authorInitials ?? "").trim().replace(/^—$/, "") ||
    (root.legacySource ?? "").trim();
  const parts = ["From an older note"];
  if (who) parts.push(who);
  const written = dateWithYear(root.occurredAt);
  if (written) parts.push(written);
  if (root.resolvedAt) {
    const closed = dateWithYear(root.resolvedAt);
    parts.push(closed ? `closed ${closed}` : "closed");
  }
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Going above and beyond                                              */
/* ------------------------------------------------------------------ */

export interface ClientGestures {
  /** Idea or planned: soonest first by the planned day, else the detail's next date; undated last. */
  open: FordEntry[];
  /** Done or passed on: newest first. */
  finished: FordEntry[];
}

export function gesturesForClient(entries: readonly FordEntry[], now: Date): ClientGestures {
  const live = entries.filter((e) => !e.isArchived && e.opportunity);
  const whenOf = (e: FordEntry): number | null => {
    const planned = toDate(e.opportunity?.plannedFor);
    if (planned) return planned.getTime();
    const next = nextOccurrence(toDate(e.eventDate), e.recurrence, now);
    return next ? next.getTime() : null;
  };
  const open = live
    .filter((e) => e.opportunity!.status === "idea" || e.opportunity!.status === "planned")
    .sort((a, b) => {
      const x = whenOf(a);
      const y = whenOf(b);
      if (x === null && y === null) return timeOf(b.occurredAt) - timeOf(a.occurredAt);
      if (x === null) return 1;
      if (y === null) return -1;
      return x - y;
    });
  const doneAt = (e: FordEntry) => timeOf(e.opportunity?.doneAt) || timeOf(e.updatedAt) || timeOf(e.occurredAt);
  const finished = live
    .filter((e) => e.opportunity!.status === "done" || e.opportunity!.status === "declined")
    .sort((a, b) => doneAt(b) - doneAt(a));
  return { open, finished };
}

/* ------------------------------------------------------------------ */
/* The Overview's FORD slot                                            */
/* ------------------------------------------------------------------ */

export interface FordOverviewPillar {
  pillar: FordPillar;
  /** The one line under the pillar's name; null when there is nothing to say (or it can't be said yet). */
  lead: string | null;
  /** Facts, moments and older notes; null while FORD is not read. */
  detailCount: number | null;
  /** Open gestures on this pillar's details, by status. */
  ideas: number;
  planned: number;
}

export interface FordOverview {
  status: FordPageStatus;
  pillars: FordOverviewPillar[];
  comingUp: ComingUpRow[];
  openGestures: FordEntry[];
}

/**
 * FORD at a glance, for the Overview (its phase draws it). Leads are FORD
 * text, so they are given only when FORD answered for this reader
 * (`status === "ready"`) — except Occupation's work sentence, which comes off
 * the client record every reader of the tab can already see. The birthday is
 * the client record's too, so Coming up has it whatever FORD's state.
 */
export function fordOverview(args: {
  status: FordPageStatus;
  buckets: readonly FordPillarBucket[];
  entries: readonly FordEntry[];
  olderByPillar: Readonly<Record<FordPillar, readonly NoteThread[]>> | null;
  client: Pick<Client, "dateOfBirth">;
  /** The record as the form holds it (draft over saved): occupation, workProfile, isRetired. */
  work: Pick<Client, "occupation" | "isRetired"> & { workProfile?: string | null };
  todayKey: string;
}): FordOverview {
  const ready = args.status === "ready";
  const entries = ready ? args.entries : [];
  const now = studioNoon(args.todayKey);
  const pillars = FORD_PILLARS.map((pillar): FordOverviewPillar => {
    const bucket = ready ? args.buckets.find((b) => b.pillar === pillar) ?? null : null;
    const older = args.olderByPillar?.[pillar] ?? [];
    const list = pillarItems(bucket, older);
    let lead: string | null = null;
    if (pillar === "occupation") {
      const sentence = workSentence(args.work);
      if (sentence !== "Work not recorded yet") lead = sentence;
    }
    if (lead === null && ready) {
      const firstMoment = list.items.find((i): i is Extract<PillarItem, { kind: "detail" }> => i.kind === "detail");
      lead = list.pinned[0]?.body ?? firstMoment?.entry.body ?? null;
    }
    const mine = entries.filter((e) => e.pillar === pillar && !e.isArchived && e.opportunity);
    return {
      pillar,
      lead,
      detailCount: ready && args.olderByPillar ? list.total : null,
      ideas: mine.filter((e) => e.opportunity!.status === "idea").length,
      planned: mine.filter((e) => e.opportunity!.status === "planned").length,
    };
  });
  return {
    status: args.status,
    pillars,
    comingUp: comingUp({ dateOfBirth: args.client.dateOfBirth, entries, todayKey: args.todayKey }),
    openGestures: gesturesForClient(entries, now).open,
  };
}

/* ------------------------------------------------------------------ */
/* The sub-toggle's line                                               */
/* ------------------------------------------------------------------ */

/** How far ahead a date is worth the sub-toggle's line: FORD's "soon". */
export const SUBNAV_SOON_DAYS = 30;

/**
 * What the FORD segment says, once FORD has answered: "birthday in 17 days"
 * (the soonest date within a month — the birthday named, a detail as "a date"),
 * else "2 to file", else "6 details", else "nothing on file yet". Null when it
 * cannot say (the count is not known yet): the shell says "loading" then.
 * Lower case, like every other segment's line. Never coloured by a pillar.
 *
 * Only for `status === "ready"`; the shell handles loading, failed and a
 * reader FORD refuses (page-meta.ts).
 */
export function fordSubnavLine(args: {
  comingUp: readonly ComingUpRow[];
  untagged: number;
  /** Everything FORD shows (fordDoorCount); null while part of it is still loading. */
  count: number | null;
}): string | null {
  const soonest = args.comingUp[0];
  if (soonest && soonest.daysAway >= 0 && soonest.daysAway <= SUBNAV_SOON_DAYS) {
    // inTime: the one way the codex says a date ("in 17 days"), days up to 30.
    return `${soonest.kind === "birthday" ? "birthday" : "a date"} ${inTime(soonest.daysAway)}`;
  }
  if (args.untagged > 0) return `${args.untagged} to file`;
  if (args.count === null) return null;
  if (args.count > 0) return args.count === 1 ? "1 detail" : `${args.count} details`;
  return "nothing on file yet";
}
