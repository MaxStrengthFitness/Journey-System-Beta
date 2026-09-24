/**
 * Reading one client's FORD, and reading the whole studio's.
 *
 * Two hooks, one file, because they are the same data at two zoom levels and
 * keeping the query shapes side by side is the only way the indexes stay
 * honest.
 */

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  collectionGroup,
  query,
  where,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { Client } from "../../types";
import {
  adaptClientEvents,
  fordStudioIdOf,
  groupByPillar,
  upcomingFord,
  type FordPillarBucket,
} from "./ford-rollup";
import { toDate, type FordEntry } from "./types";
import { fordReadStatusOfError, type FordReadStatus } from "./read-status";
import { splitOneLine } from "./one-line";

export type { FordReadStatus } from "./read-status";

/**
 * A client's whole personal history fits in one read. Twelve years of a
 * chatty trainer is a few hundred lines; the cap is here to stop a runaway,
 * not because anyone is expected to reach it.
 */
const STREAM_LIMIT = 500;

export interface UseClientFordResult {
  entries: FordEntry[];
  buckets: FordPillarBucket[];
  /** Caught on the floor, not yet filed. The teardown sweep's input. */
  untagged: FordEntry[];
  /** Dated details from today forward, soonest first. */
  upcoming: ReturnType<typeof upcomingFord>;
  /**
   * Whether the details could be read (client codex, phase 1). Empty lists
   * mean "nothing on file" ONLY when this is `ready`; `failed` and `denied`
   * are unknown, and a screen says so instead of drawing its empty state.
   * `entries` still carries the legacy `client.events` details either way —
   * they come off the client document, which this reader already holds.
   */
  status: FordReadStatus;
  /** `status === "loading"`. Kept for the screens that only ask this. */
  isLoading: boolean;
  /**
   * The client's In one line (client codex, AJ's decision 3a): the FORD
   * document with the fixed id `one-line` (`one-line.ts`), which arrives in
   * the same snapshot and is taken out of it here — it is never in
   * `entries`, `buckets`, `untagged` or `upcoming`. Null when there is none,
   * when it was cleared, and whenever `status` is not `ready` (then it is
   * unknown, not absent: say so rather than "no line yet").
   */
  oneLine: FordEntry | null;
}

interface NativeRead {
  /** Which client and studio this answer is for: `${clientId}|${studioId}`. */
  key: string;
  status: FordReadStatus;
  rows: FordEntry[];
}

/** One empty array, so a not-yet-answered read does not re-memo every render. */
const NO_ROWS: FordEntry[] = [];

const byNewestFirst = (a: FordEntry, b: FordEntry) =>
  (toDate(b.occurredAt)?.getTime() ?? 0) - (toDate(a.occurredAt)?.getTime() ?? 0);

/**
 * One client's FORD, live.
 *
 * `client` is required to READ, not only for the legacy adapter: the query
 * names the client's studio (`fordStudioIdOf`), because the read rule tests
 * `resource.data.studioId` and Firestore refuses any list it cannot prove is
 * inside a studio the caller trains at. Until the client codex round this
 * query named no studio, so it was refused for every role below franchise
 * owner and every trainer saw an empty FORD. Until the client is known the
 * hook waits (`loading`) rather than guess.
 */
export function useClientFord(args: {
  clientId: string | null;
  client: Client | null;
  enabled?: boolean;
}): UseClientFordResult {
  const { clientId, client, enabled = true } = args;
  const studioId = fordStudioIdOf(client);
  const clientKnown = Boolean(client);
  const key = `${clientId ?? ""}|${studioId}`;
  const [read, setRead] = useState<NativeRead>({ key: "", status: "loading", rows: [] });

  useEffect(() => {
    if (!clientId || !enabled || !clientKnown) return;
    if (!studioId) {
      // A client who names no studio has no FORD scope the rules would
      // accept. That is not "nothing on file" — it is "can't tell".
      setRead({ key, status: "failed", rows: [] });
      return;
    }

    // Equality on studioId and nothing else: the automatic single-field index
    // serves it, so this works the moment the code ships. Do NOT add
    // orderBy("occurredAt") without first deploying the composite index
    // ford(studioId asc, occurredAt desc) — until it builds, the query fails
    // everywhere. Sorting happens here instead.
    const q = query(
      collection(db, "clients", clientId, "ford"),
      where("studioId", "==", studioId),
      limit(STREAM_LIMIT),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as object) }) as FordEntry)
          .sort(byNewestFirst);
        setRead({ key, status: "ready", rows });
      },
      (err) => {
        // Unknown, never empty. No toast: a cross-train visitor is refused
        // by design, and there is nothing a trainer could do about either
        // case mid-session. The screen says which it was.
        const status = fordReadStatusOfError(err);
        if (status === "failed") {
          console.warn("FORD could not be read", (err as { code?: string })?.code ?? err);
        }
        setRead({ key, status, rows: [] });
      },
    );
    return unsub;
  }, [clientId, studioId, enabled, clientKnown, key]);

  // An answer for a different client (or before any answer) is no answer.
  const current = read.key === key && enabled && clientKnown;
  const status: FordReadStatus = current ? read.status : "loading";
  const native = current ? read.rows : NO_ROWS;

  return useMemo(() => {
    // The In one line document rides in the same snapshot (it is stamped with
    // the same studio). Take it out FIRST, before anything reads the list as
    // details — including the legacy merge below, which would otherwise let
    // the line's words hide a legacy event that happened to say the same.
    const { oneLine, details } = splitOneLine(native);
    const legacy = adaptClientEvents(client);
    // A legacy event that has since been re-typed as a real detail would show
    // twice. Match on the body text, which is what a trainer would recognise
    // as the duplicate, and let the native one win.
    const nativeBodies = new Set(details.map((e) => e.body.trim().toLowerCase()));
    const entries = [
      ...details,
      ...legacy.filter((e) => !nativeBodies.has(e.body.trim().toLowerCase())),
    ];

    const { buckets, untagged } = groupByPillar(entries);
    return {
      entries,
      buckets,
      untagged,
      upcoming: upcomingFord(entries),
      status,
      isLoading: status === "loading",
      oneLine,
    };
  }, [native, client, status]);
}

/* ------------------------------------------------------------------ */
/* THE DELIGHT QUEUE                                                   */
/* ------------------------------------------------------------------ */

export interface DelightRow {
  entry: FordEntry;
  when: Date | null;
  daysAway: number | null;
}

export interface UseDelightQueueResult {
  rows: DelightRow[];
  isLoading: boolean;
  /** True when the collection group index has not been deployed yet. */
  needsIndex: boolean;
}

/**
 * Everything at this studio worth doing something about.
 *
 * A COLLECTION GROUP query across every `clients/{id}/ford` subcollection,
 * scoped by the denormalised `studioId`. This is the reason FORD is a
 * subcollection rather than an array on the client document: the data stays
 * under the client, inheriting the tightest privacy boundary the app has, and
 * is still readable in one sweep across the whole floor.
 *
 * The rules require the studio filter — without it the query is refused rather
 * than silently returning a franchise's worth of other people's families.
 */
export function useDelightQueue(args: {
  studioId: string | null;
  enabled?: boolean;
  /** Include gestures already delivered. Off by default: this is a to-do list. */
  includeDone?: boolean;
}): UseDelightQueueResult {
  const { studioId, enabled = true, includeDone = false } = args;
  const [rows, setRows] = useState<FordEntry[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(studioId && enabled));
  const [needsIndex, setNeedsIndex] = useState(false);

  useEffect(() => {
    if (!studioId || !enabled) {
      setRows([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setNeedsIndex(false);

    const wanted = includeDone
      ? ["idea", "planned", "done"]
      : ["idea", "planned"];

    const q = query(
      collectionGroup(db, "ford"),
      where("studioId", "==", studioId),
      where("opportunity.status", "in", wanted),
      limit(200),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as FordEntry),
        );
        setIsLoading(false);
      },
      (err) => {
        // `failed-precondition` means the collection group index is missing.
        // Say so plainly rather than rendering an empty queue, which would
        // read as "nobody has anything coming up".
        setNeedsIndex((err as { code?: string })?.code === "failed-precondition");
        setRows([]);
        setIsLoading(false);
      },
    );
    return unsub;
  }, [studioId, enabled, includeDone]);

  return useMemo(() => {
    const live = rows.filter((e) => !e.isArchived);
    const dated = upcomingFord(live);
    const datedIds = new Set(dated.map((d) => d.entry.id));

    // A one-off whose date has passed is not "undated" — it is a gesture the
    // team missed, and the queue's "Passed" bucket exists for it (Operations
    // round, Sep 2026: the bucket was in the type and could never show,
    // because upcomingFord drops past dates and the rest fell into undated).
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const passed = (entry: FordEntry): number | null => {
      const when = toDate(entry.eventDate);
      if (!when || when >= startOfToday) return null;
      return Math.round((new Date(when.getFullYear(), when.getMonth(), when.getDate()).getTime() - startOfToday.getTime()) / 86_400_000);
    };
    return {
      rows: [
        ...dated.map((d) => ({ entry: d.entry, when: d.when, daysAway: d.daysAway })),
        // Undated ideas still belong in the queue — "wishes they had help with
        // the garden" has no date and is one of the best gestures on the list.
        ...live
          .filter((e) => !datedIds.has(e.id))
          .map((entry) => {
            const daysAway = passed(entry);
            return { entry, when: daysAway === null ? null : toDate(entry.eventDate), daysAway };
          }),
      ],
      isLoading,
      needsIndex,
    };
  }, [rows, isLoading, needsIndex]);
}
