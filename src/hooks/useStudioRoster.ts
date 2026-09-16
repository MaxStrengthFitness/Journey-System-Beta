import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Client, ScheduleEntry } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import {
  MISSING_RECHECK_MS,
  QUOTA_COOLDOWN_MS,
  STUDIO_ROSTER_LIMIT,
  bookedClientIds,
  chunk,
  isPermissionError,
  isQuotaError,
  mergeRoster,
  visitorIdsToFetch,
} from "../lib/studio-roster";

/**
 * Every client the app needs for the studio the iPad is in.
 *
 * Round: hub sync fixes, Sep 16 2026. Read `src/lib/studio-roster.ts` for why
 * this replaced the booking-window roster that lived in `useLiveSchedule`.
 *
 *   STUDIO    a live listener on this studio's clients (`homeStudioId`). The
 *             rules can prove that query from the trainer document alone, so
 *             it works for every role, and it keeps itself current: a client
 *             the sync creates at 9:05 is on the Hub at 9:05.
 *   VISITORS  booked clients the listener does not hold, read by id.
 *
 * `status` is "loading" from a studio switch until the listener's first
 * answer, so the Hub can say "loading" instead of "Not synced" for that beat.
 * A failed read never empties the roster: "the read failed" must never look
 * like "these clients do not exist" (CLAUDE.md, data rules).
 */

export type RosterStatus = "loading" | "ready" | "error";

/** Listener retry: 15s, 30s, 1m, 2m, then every 5m. */
const retryDelay = (failures: number) => Math.min(5 * 60_000, 15_000 * 2 ** failures);

export function useStudioRoster(
  activeStudioId: string | null,
  isReady: boolean,
  schedules: readonly ScheduleEntry[],
) {
  const [studioClients, setStudioClients] = useState<Client[]>([]);
  const [status, setStatus] = useState<RosterStatus>("loading");
  /** Bumped to re-open the listener after it failed. */
  const [retryTick, setRetryTick] = useState(0);
  const failuresRef = useRef(0);

  /* Visitors live in refs; `visitorVersion` is the one piece of state that
     tells React the map changed. */
  const visitorsRef = useRef<Map<string, Client>>(new Map());
  const fetchedAtRef = useRef<Map<string, number>>(new Map());
  const missingAtRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const cooldownUntilRef = useRef(0);
  const [visitorVersion, setVisitorVersion] = useState(0);
  /** Bumped on a timer and when the tab comes back, so stale visitors are re-read. */
  const [recheckTick, setRecheckTick] = useState(0);
  /**
   * Which studio the visitor bookkeeping belongs to. A visitor read that
   * lands after a studio switch carries an older generation and is dropped
   * rather than written into the new studio's roster.
   */
  const generationRef = useRef(0);

  /* ---------------- studio switch ---------------- */

  // Declared before the listener so the reset runs first on the same commit.
  useEffect(() => {
    if (!isReady) return;
    generationRef.current += 1;
    visitorsRef.current = new Map();
    fetchedAtRef.current = new Map();
    missingAtRef.current = new Map();
    inFlightRef.current = new Set();
    failuresRef.current = 0;
    // The previous studio's clients must not linger: that is how Solon's
    // clients ended up listed in Strongsville's directory.
    setStudioClients([]);
    setStatus(activeStudioId ? "loading" : "ready");
    setVisitorVersion((v) => v + 1);
  }, [activeStudioId, isReady]);

  /* ---------------- the studio listener ---------------- */

  useEffect(() => {
    if (!isReady || !activeStudioId) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = onSnapshot(
      query(
        collection(db, "clients"),
        where("homeStudioId", "==", activeStudioId),
        limit(STUDIO_ROSTER_LIMIT),
      ),
      (snap) => {
        if (cancelled) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Client);
        failuresRef.current = 0;
        setStudioClients(list);
        setStatus("ready");
        if (list.length >= STUDIO_ROSTER_LIMIT) {
          console.warn(
            `useStudioRoster: ${activeStudioId} has at least ${STUDIO_ROSTER_LIMIT} clients; the roster is truncated. Filter the listener to active clients.`,
          );
        }
      },
      (error) => {
        if (cancelled) return;
        // Keep whatever roster we already have. A listener that errors is
        // closed for good, so open a new one after a pause.
        setStatus("error");
        if (isQuotaError(error)) {
          console.warn("useStudioRoster: Firestore quota exceeded; the roster keeps what it has and retries.");
        } else if (failuresRef.current === 0) {
          // Say so once, not on every retry.
          handleFirestoreError(error, OperationType.LIST, "clients");
        } else {
          console.warn("useStudioRoster: roster listener failed again", error);
        }
        const delay = retryDelay(failuresRef.current);
        failuresRef.current += 1;
        retryTimer = setTimeout(() => {
          if (!cancelled) setRetryTick((t) => t + 1);
        }, delay);
      },
    );

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribe();
    };
  }, [activeStudioId, isReady, retryTick]);

  /* ---------------- visitors ---------------- */

  const booked = useMemo(() => bookedClientIds(schedules), [schedules]);
  const studioIds = useMemo(
    () => new Set(studioClients.map((c) => c.id).filter((id): id is string => Boolean(id))),
    [studioClients],
  );

  useEffect(() => {
    if (!isReady) return;
    // Wait for the listener's first answer; otherwise every booked client
    // would be read by id a moment before the listener delivers them anyway.
    if (activeStudioId && status === "loading") return;

    const now = Date.now();
    if (now < cooldownUntilRef.current) {
      const t = setTimeout(() => setRecheckTick((x) => x + 1), cooldownUntilRef.current - now + 500);
      return () => clearTimeout(t);
    }

    const ids = visitorIdsToFetch(
      booked,
      studioIds,
      {
        fetchedAt: fetchedAtRef.current,
        missingAt: missingAtRef.current,
        inFlight: inFlightRef.current,
      },
      now,
    );
    if (ids.length === 0) return;

    const generation = generationRef.current;
    const inFlight = inFlightRef.current;
    for (const id of ids) inFlight.add(id);

    void (async () => {
      const found = new Map<string, Client>();
      const flags = { quota: false };

      await Promise.all(
        chunk(ids).map(async (part) => {
          try {
            const snap = await getDocs(
              query(collection(db, "clients"), where(documentId(), "in", part)),
            );
            for (const d of snap.docs) found.set(d.id, { id: d.id, ...d.data() } as Client);
          } catch (error) {
            if (isQuotaError(error)) {
              flags.quota = true;
              return;
            }
            if (isPermissionError(error)) {
              // One document this trainer may not read refuses the whole
              // `in` query. Ask one at a time so the readable ones still come.
              await Promise.all(
                part.map(async (id) => {
                  try {
                    const d = await getDoc(doc(db, "clients", id));
                    if (d.exists()) found.set(d.id, { id: d.id, ...d.data() } as Client);
                  } catch (e) {
                    if (isQuotaError(e)) flags.quota = true;
                  }
                }),
              );
              return;
            }
            console.warn("useStudioRoster: visitor read failed", error);
          }
        }),
      );

      // A studio switch replaced the bookkeeping; this answer is for the old one.
      if (generation !== generationRef.current) return;

      const at = Date.now();
      for (const id of ids) {
        inFlight.delete(id);
        const client = found.get(id);
        if (client) {
          visitorsRef.current.set(id, client);
          fetchedAtRef.current.set(id, at);
          missingAtRef.current.delete(id);
        } else if (!flags.quota) {
          // Not returned — not created yet, not readable, or the read failed.
          // Any copy we already hold is kept; ask again in a few minutes.
          missingAtRef.current.set(id, at);
        }
      }
      if (flags.quota) {
        cooldownUntilRef.current = at + QUOTA_COOLDOWN_MS;
        console.warn("useStudioRoster: Firestore quota exceeded; pausing visitor reads.");
      }
      setVisitorVersion((v) => v + 1);
    })();
  }, [activeStudioId, booked, studioIds, status, isReady, recheckTick]);

  /* A slow heartbeat while the screen is visible, and a nudge when an iPad
     wakes: re-checks visitors that went stale and ids that were missing. The
     check itself is free; it reads only what is due. */
  useEffect(() => {
    if (!isReady) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      setRecheckTick((t) => t + 1);
    };
    const interval = setInterval(tick, MISSING_RECHECK_MS + 5_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isReady]);

  /* ---------------- the roster ---------------- */

  const clients = useMemo(
    // visitorVersion is the signal that the visitor map changed.
    () => mergeRoster(studioClients, visitorsRef.current.values()),
    [studioClients, visitorVersion],
  );

  return { clients, status, studioCount: studioClients.length };
}
