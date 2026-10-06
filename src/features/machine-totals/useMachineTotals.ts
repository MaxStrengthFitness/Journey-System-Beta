/**
 * One client's machine totals, live (totals.ts says what they are).
 *
 * ONE listener, on one small document, for the client on screen (AppContent's
 * selected client: the profile and the session) or a screen that opens one
 * client on its own (the renewal brief). Never one per row of a list: the
 * whole point of the move is that lists don't carry these.
 *
 * Unknown is said, never guessed (CLAUDE.md, data rules):
 *   - an empty answer from the iPad's cache is not "none" (KNOWN-TRAPS: a
 *     snapshot the cache answered is not a read), so it stays "loading" until
 *     the server says; metadata changes are listened to because the server
 *     confirming a missing document changes no document;
 *   - a document this iPad created itself and the server has not answered
 *     (an offline Finish writes only its own paths, with set/mergeFields) is
 *     not the whole document either: it is "loading", its data passed on as
 *     not complete, until the server answers or the cache holds a copy with
 *     no write of ours pending, or this client's whole document was already
 *     seen since the app opened (then a pending write is on top of it);
 *   - a failed read is "failed", keeps what it had (and whether it was
 *     whole), and is asked again after a pause (15 s, 30 s, 1 min, 2 min,
 *     then every 5 min).
 */
import { useEffect, useRef, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { machineTotalsRef } from "./store";
import type { MachineTotalsDoc, MachineTotalsRead } from "./totals";
import { forgetOnSignOut } from "../sign-out/memory";

/** Clients whose whole totals document has been seen since the app opened. */
const seenWhole = new Set<string>();
forgetOnSignOut(() => seenWhole.clear());

const retryDelay = (failures: number) => Math.min(5 * 60_000, 15_000 * 2 ** failures);

const LOADING: MachineTotalsRead = { state: "loading", data: null };

/** The data as a comparable string; null when it cannot be (then every answer counts). */
function safeKey(data: unknown): string | null {
  try {
    return JSON.stringify(data);
  } catch {
    return null;
  }
}

export function useMachineTotals(clientId: string | null | undefined): MachineTotalsRead {
  const [held, setHeld] = useState<{ clientId: string; read: MachineTotalsRead } | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const failures = useRef<{ clientId: string | null; n: number }>({ clientId: null, n: 0 });

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let lastKey: string | null = null;
    const put = (read: MachineTotalsRead) => {
      if (!cancelled) setHeld({ clientId, read });
    };

    const unsubscribe = onSnapshot(
      machineTotalsRef(db, clientId),
      { includeMetadataChanges: true },
      (snap) => {
        failures.current = { clientId, n: 0 };
        const fromCache = snap.metadata.fromCache;
        if (snap.exists()) {
          const data = snap.data() as MachineTotalsDoc;
          // Whole: the server's answer (with any write of ours on top), a
          // cached copy with nothing of ours pending, or a document already
          // seen whole. Otherwise it may be only what this iPad wrote.
          const whole = !fromCache || !snap.metadata.hasPendingWrites || seenWhole.has(clientId);
          if (whole) seenWhole.add(clientId);
          // A metadata-only answer (a write acknowledged, the cache confirmed)
          // carries the same data: no new object, so nothing redraws for it.
          const json = safeKey(data);
          const key = json === null ? null : `${whole ? "w" : "p"}${json}`;
          if (key !== null && key === lastKey) return;
          lastKey = key;
          put(whole ? { state: "ready", data } : { state: "loading", data, complete: false });
        } else if (!fromCache) {
          lastKey = null;
          seenWhole.add(clientId);
          put({ state: "missing", data: null });
        }
        // An empty answer from the cache alone: still loading.
      },
      (error) => {
        if (cancelled) return;
        console.warn("[machine totals] read failed", clientId, error);
        setHeld((prev) => {
          const before = prev && prev.clientId === clientId ? prev.read : null;
          return {
            clientId,
            read: {
              state: "failed",
              data: before ? before.data : null,
              // Whole only if what it held was: a "ready" answer, or a whole failure before it.
              complete: !!before?.data && (before.state === "ready" || (before.state === "failed" && before.complete !== false)),
            },
          };
        });
        const n = failures.current.clientId === clientId ? failures.current.n : 0;
        const delay = retryDelay(n);
        failures.current = { clientId, n: n + 1 };
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
  }, [clientId, retryTick]);

  if (!clientId || !held || held.clientId !== clientId) return LOADING;
  return held.read;
}
