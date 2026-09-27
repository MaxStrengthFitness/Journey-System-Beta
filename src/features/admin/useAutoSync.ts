/**
 * Applies syncPolicy to the live app.
 *
 * All the decisions live in syncPolicy.ts and are tested there. This file
 * owns the two things that cannot be pure: the browser events that make the
 * policy re-evaluate, and the Firestore transaction that stops six iPads on
 * one floor from all running the same sync.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { runTransaction, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import type { Client, Studio, Trainer } from "../../types";
import {
  claimIsStillDue,
  decideSync,
  isFirstDeepOfWeek,
  wantsDeepPull,
  withinPullHours,
  type SyncVerdict,
} from "./syncPolicy";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "../../lib/studio-time";
import { leaseOf, leaseRef, useSyncLease, type SyncLease } from "./sync-lease";
import { recordCoverage } from "../openings/coverage-record";

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

  // The shared lease, on its own document since the cost plan (Sep 26 2026,
  // D3b): only this studio's iPads watch it (features/admin/sync-lease.ts).
  const lease = useSyncLease(enabled ? activeStudioId : null);

  // Read through refs inside the timer so a new schedule snapshot — which
  // arrives constantly — does not tear down and rebuild the timer, which is
  // how a "every 15 minutes" timer becomes "every render".
  const latest = useRef<{
    studios: Studio[];
    activeStudioId: string | null;
    trainers: Trainer[];
    clients: Client[];
    lease: SyncLease | null | undefined;
  }>({ studios, activeStudioId, trainers, clients, lease });
  latest.current = { studios, activeStudioId, trainers, clients, lease };
  const runningRef = useRef(false);

  const attempt = useCallback(async () => {
    const { studios, activeStudioId, trainers, clients, lease } = latest.current;
    const studio = studios.find((s) => s.id === activeStudioId) ?? null;
    if (!studio?.id) return;
    // Wait for the lease's first answer: deciding on nothing would have every
    // iPad that just opened try to claim at once.
    if (lease === undefined) return;
    const shared = leaseOf(lease, studio);

    const now = Date.now();
    const timeZone = isValidTimeZone(studio.timezone)
      ? (studio.timezone as string)
      : DEFAULT_TIME_ZONE;
    const ctx = {
      now,
      enabled: studio.autoSyncEnabled ?? true,
      intervalMinutes: studio.syncIntervalMinutes,
      lastSyncAt: shared.lastScheduleSyncAt,
      failures: shared.scheduleSyncFailures ?? 0,
      inFlight: runningRef.current,
      visible:
        typeof document === "undefined" || document.visibilityState !== "hidden",
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      configured: isSyncConfigured(studio, studios),
      withinPullHours: withinPullHours(now, timeZone, studio.shiftHours),
    };

    const decision = decideSync(ctx);
    setVerdict(decision);
    if (!decision.run) return;

    // Claim the shared lease. The local studio snapshot can be a few seconds
    // stale, and on a floor with several iPads several of them will reach
    // this line at once; the transaction is what makes exactly one win.
    const ref = leaseRef(studio.id);
    let claimed = false;
    // Decided inside the claim, from the studio as the winner found it: see
    // wantsDeepPull. Every device reads the same field, so the studio gets one
    // whole-month pull per block of its day, whoever happens to win it.
    let deep = true;
    let lookUpEveryone = true;
    try {
      await runTransaction(db, async (tx) => {
        // Firestore runs this again when another device's write wins the race.
        // Start every run from nothing, or a device that lost still pulls.
        claimed = false;
        deep = true;
        lookUpEveryone = true;
        const snap = await tx.get(ref);
        const fresh = leaseOf(snap.exists() ? (snap.data() as SyncLease) : null, studio);
        if (
          !claimIsStillDue(fresh.lastScheduleSyncAt, {
            now,
            intervalMinutes: studio.syncIntervalMinutes,
            failures: fresh.scheduleSyncFailures ?? 0,
          })
        ) {
          return;
        }
        const lastDeepAt = fresh.lastDeepScheduleSyncAt;
        deep = wantsDeepPull(lastDeepAt, now, timeZone);
        lookUpEveryone = deep && isFirstDeepOfWeek(lastDeepAt, now, timeZone);
        // Written BEFORE the sync, not after. A sync that crashes half way
        // must still hold the lease for one interval, or every device retries
        // the failure together — which is the storm this exists to prevent.
        tx.set(ref, { lastScheduleSyncAt: now }, { merge: true });
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
      const { syncMindbodySchedules, syncWindow, NEAR_WINDOW_DAYS, DEEP_WINDOW_DAYS } =
        await import("../../lib/mindbody-api-sync");
      // Today and tomorrow, or the whole month. Only the week's first month
      // pull looks every client up with Mindbody (names, blank contact fields);
      // the rest look up only clients Journey has never seen: one page and a
      // lookup or two instead of ~12 calls.
      //
      // settleSweepWith: when today or tomorrow LOSES a booking, the near pull
      // cannot tell a cancellation from a move to next week, so it asks for
      // the month straight away and the booking is filed as whichever it was
      // (the review of phase 1, Sep 25 2026).
      const month = syncWindow(timeZone, DEEP_WINDOW_DAYS, new Date(now));
      const pullWindow = deep ? month : syncWindow(timeZone, NEAR_WINDOW_DAYS, new Date(now));
      const res = await syncMindbodySchedules(
        String(studio.mindbodySiteId),
        trainers,
        clients,
        studios,
        null,
        pullWindow.start,
        pullWindow.end,
        studio.id,
        studio.mindbodyLocationId,
        {
          skipKnownClientLookups: !lookUpEveryone,
          settleSweepWith: deep ? undefined : month,
        },
      );
      // A whole answer: write down the days it read in full, today and
      // tomorrow (features/openings/coverage-record.ts). It asks Mindbody
      // nothing, waits for nothing, and says nothing if it fails; this iPad
      // writes each day once.
      void recordCoverage({ studioId: studio.id, window: pullWindow, answer: res, startedAt: now, timeZone });
      // A failure is a pull that did not get the whole answer into Journey.
      // A warning (an unmapped location, a client profile it could not check)
      // is not: counting those backed the pull off to every four hours, and
      // a studio with a lasting warning then saw a same-day cancellation hours
      // late (the review, Sep 25 2026).
      const failed = res.windowComplete !== true;
      setLastError(res.errors?.[0] ?? null);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const prev = leaseOf(snap.exists() ? (snap.data() as SyncLease) : null, studio).scheduleSyncFailures ?? 0;
        tx.set(
          ref,
          { scheduleSyncFailures: failed ? prev + 1 : 0, lastScheduleSyncAt: Date.now() },
          { merge: true },
        );
      });
      // The month was read whole: record it, so the next whole-month pull waits
      // for the next block of the day. A warning (an unmapped location, say)
      // does not stop this; only a short or failed answer does. Best-effort and
      // on its own: if the permission for this field is not deployed yet, the
      // next pull simply reaches the month again, and nothing counts as failed.
      const monthReadWhole = deep ? res.windowComplete === true : res.settledWithMonth === true;
      if (monthReadWhole) {
        try {
          await setDoc(ref, { lastDeepScheduleSyncAt: now }, { merge: true });
        } catch (stampErr) {
          console.warn("[auto-sync] could not record the whole-month pull", stampErr);
        }
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Sync failed");
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const prev =
            leaseOf(snap.exists() ? (snap.data() as SyncLease) : null, studio).scheduleSyncFailures ?? 0;
          tx.set(ref, { scheduleSyncFailures: prev + 1 }, { merge: true });
        });
      } catch {
        /* the failure counter is best-effort; never mask the sync error */
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, []);

  // The first look waits for the lease's first answer (attempt returns until
  // then), so take it the moment the lease arrives rather than a minute later.
  const leaseArrived = lease !== undefined;
  useEffect(() => {
    if (enabled && activeStudioId && leaseArrived) void attempt();
  }, [enabled, activeStudioId, leaseArrived, attempt]);

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
