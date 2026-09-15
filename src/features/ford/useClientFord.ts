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
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { Client } from "../../types";
import {
  adaptClientEvents,
  groupByPillar,
  upcomingFord,
  type FordPillarBucket,
} from "./ford-rollup";
import type { FordEntry } from "./types";

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
  isLoading: boolean;
}

export function useClientFord(args: {
  clientId: string | null;
  client: Client | null;
  enabled?: boolean;
}): UseClientFordResult {
  const { clientId, client, enabled = true } = args;
  const [native, setNative] = useState<FordEntry[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(clientId && enabled));

  useEffect(() => {
    if (!clientId || !enabled) {
      setNative([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    // Single-collection, single-field ordering — no composite index needed,
    // which is why this hook works the moment the code ships rather than after
    // an index deploy.
    const q = query(
      collection(db, "clients", clientId, "ford"),
      orderBy("occurredAt", "desc"),
      limit(STREAM_LIMIT),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setNative(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as FordEntry),
        );
        setIsLoading(false);
      },
      () => {
        // A client with no details yet, or rules saying no. Either way the
        // section renders its empty state rather than an error — there is
        // nothing a trainer could do about it mid-session.
        setNative([]);
        setIsLoading(false);
      },
    );
    return unsub;
  }, [clientId, enabled]);

  return useMemo(() => {
    const legacy = adaptClientEvents(client);
    // A legacy event that has since been re-typed as a real detail would show
    // twice. Match on the body text, which is what a trainer would recognise
    // as the duplicate, and let the native one win.
    const nativeBodies = new Set(native.map((e) => e.body.trim().toLowerCase()));
    const entries = [
      ...native,
      ...legacy.filter((e) => !nativeBodies.has(e.body.trim().toLowerCase())),
    ];

    const { buckets, untagged } = groupByPillar(entries);
    return {
      entries,
      buckets,
      untagged,
      upcoming: upcomingFord(entries),
      isLoading,
    };
  }, [native, client, isLoading]);
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

    return {
      rows: [
        ...dated.map((d) => ({ entry: d.entry, when: d.when, daysAway: d.daysAway })),
        // Undated ideas still belong in the queue — "wishes they had help with
        // the garden" has no date and is one of the best gestures on the list.
        ...live
          .filter((e) => !datedIds.has(e.id))
          .map((entry) => ({ entry, when: null, daysAway: null })),
      ],
      isLoading,
      needsIndex,
    };
  }, [rows, isLoading, needsIndex]);
}
