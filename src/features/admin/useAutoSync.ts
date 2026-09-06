/**
 * Applies syncPolicy to the live app.
 *
 * All the decisions live in syncPolicy.ts and are tested there. This file
 * owns the two things that cannot be pure: the browser events that make the
 * policy re-evaluate, and the Firestore transaction that stops six iPads on
 * one floor from all running the same sync.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { doc, runTransaction } from "firebase/firestore";
import { db } from "../../firebase";
import type { Client, Studio, Trainer } from "../../types";
import {
  claimIsStillDue,
  decideSync,
  intervalWithBackoff,
  type SyncVerdict,
} from "./syncPolicy";

/** How often the policy is re-checked when it says "not due yet". */
const TICK_MS = 60_000;

export interface AutoSyncState {
  /** The last verdict, for the Integrations screen to explain itself with. */
  verdict: SyncVerdict | null;
  running: boolean;
  lastError: string | null;
}

/**
 * A studio can only sync when it could sync manually: it needs a site id, and
 * a location id too if it shares that site with another studio. Same check the
 * Refresh button makes, kept in one place so the two cannot disagree about
 * whether a studio is ready.
 */
export function isSyncConfigured(
  studio: Studio | null | undefined,
  studios: Studio[],
): boolean {
  if (!studio?.mindbodySiteId) return false;
  const site = String(studio.mindbodySiteId).trim();
  const sharesSite = studios.some(
    (s) =>
      s.id !== studio.id &&
      s.mindbodySiteId &&
      String(s.mindbodySiteId).trim() === site,
  );
  return !sharesSite || !!studio.mindbodyLocationId;
}

export function useAutoSync({
  studios,
  activeStudioId,
  trainers,
  clients,
  enabled = true,
}: {
  studios: Studio[];
  activeStudioId: string | null;
  trainers: Trainer[];
  clients: Client[];
  /** Off until the app has an authenticated trainer and its data. */
  enabled?: boolean;
}): AutoSyncState {
  const [verdict, setVerdict] = useState<SyncVerdict | null>(null);
  const [running, setRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Read through refs inside the timer so a new schedule snapshot — which
  // arrives constantly — does not tear down and rebuild the timer, which is
  // how a "every 15 minutes" timer becomes "every render".
  const latest = useRef({ studios, activeStudioId, trainers, clients });
  latest.current = { studios, activeStudioId, trainers, clients };
  const runningRef = useRef(false);

  const attempt = useCallback(async () => {
    const { studios, activeStudioId, trainers, clients } = latest.current;
    const studio = studios.find((s) => s.id === activeStudioId) ?? null;
    if (!studio?.id) return;

    const now = Date.now();
    const ctx = {
      now,
      enabled: studio.autoSyncEnabled ?? true,
      intervalMinutes: studio.syncIntervalMinutes,
      lastSyncAt: studio.lastScheduleSyncAt ?? null,
      failures: studio.scheduleSyncFailures ?? 0,
      inFlight: runningRef.current,
      visible:
        typeof document === "undefined" || document.visibilityState !== "hidden",
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      configured: isSyncConfigured(studio, studios),
    };

    const decision = decideSync(ctx);
    setVerdict(decision);
    if (!decision.run) return;

    // Claim the shared lease. The local studio snapshot can be a few seconds
    // stale, and on a floor with several iPads several of them will reach
    // this line at once; the transaction is what makes exactly one win.
    const studioRef = doc(db, "studios", studio.id);
    let claimed = false;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(studioRef);
        const fresh = snap.data() as Studio | undefined;
        if (
          !claimIsStillDue(fresh?.lastScheduleSyncAt ?? null, {
            now,
            intervalMinutes: fresh?.syncIntervalMinutes ?? studio.syncIntervalMinutes,
            failures: fresh?.scheduleSyncFailures ?? 0,
          })
        ) {
          return;
        }
        // Written BEFORE the sync, not after. A sync that crashes half way
        // must still hold the lease for one interval, or every device retries
        // the failure together — which is the storm this exists to prevent.
        tx.update(studioRef, { lastScheduleSyncAt: now });
        claimed = true;
      });
    } catch {
      // Losing the claim is the normal outcome for five devices out of six.
      return;
    }
    if (!claimed) return;

    runningRef.current = true;
    setRunning(true);
    try {
      const { syncMindbodySchedules } = await import("../../lib/mindbody-api-sync");
      const res = await syncMindbodySchedules(
        String(studio.mindbodySiteId),
        trainers,
        clients,
        studios,
        null,
        undefined,
        undefined,
        studio.id,
        studio.mindbodyLocationId,
      );
      const failed = (res.errors?.length ?? 0) > 0;
      setLastError(failed ? res.errors[0] : null);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(studioRef);
        const prev = (snap.data() as Studio | undefined)?.scheduleSyncFailures ?? 0;
        tx.update(studioRef, {
          scheduleSyncFailures: failed ? prev + 1 : 0,
          lastScheduleSyncAt: Date.now(),
        });
      });
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Sync failed");
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(studioRef);
          const prev =
            (snap.data() as Studio | undefined)?.scheduleSyncFailures ?? 0;
          tx.update(studioRef, { scheduleSyncFailures: prev + 1 });
        });
      } catch {
        /* the failure counter is best-effort; never mask the sync error */
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !activeStudioId) return;

    let cancelled = false;
    const tick = () => {
      if (!cancelled) void attempt();
    };

    // Not on mount: a studio that synced two minutes ago does not need a pull
    // because someone reloaded the page, and reload-storms are exactly how a
    // busy morning turns into a quota error.
    const timer = setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", tick);

    // One evaluation now so the Integrations screen can say what it is doing,
    // which also covers a studio that has genuinely never synced.
    tick();

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", tick);
    };
  }, [enabled, activeStudioId, attempt]);

  return { verdict, running, lastError };
}

/** For the Integrations screen: when the next automatic pull is due. */
export function nextSyncLabel(studio: Studio | null | undefined): string {
  if (!studio) return "—";
  if (studio.autoSyncEnabled === false) return "Off";
  if (!studio.lastScheduleSyncAt) return "On the next visit";
  const due =
    studio.lastScheduleSyncAt +
    intervalWithBackoff(studio.syncIntervalMinutes, studio.scheduleSyncFailures);
  const mins = Math.round((due - Date.now()) / 60_000);
  if (mins <= 0) return "Due now";
  if (mins < 60) return `In ${mins} min`;
  return `In ${Math.round(mins / 60)} h`;
}
