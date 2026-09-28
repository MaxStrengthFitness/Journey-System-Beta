/**
 * WHAT HOME READS — Limbo, the bug reports and the machines studios offered
 * the catalog, each read once when the dashboard opens and again on "Check
 * again". Round: the Admins room (Sep 28 2026).
 *
 * Every read here is one the dashboard's own pages already make, with the
 * same shape, so Home adds no query anybody has not already paid for:
 *
 *   Limbo          fetchOpenLimboEntries (lib/mindbody-limbo.ts)
 *   bug reports    fetchRecentReports (admin/bugs/fetch-reports.ts)
 *   offers         catalogSubmissions where status == "pending", the
 *                  query Machines → Submitted by studios listens to
 *
 * Each says whether it was read: a read that failed is "failed", which Home
 * says as "couldn't check", never as nothing waiting. No listener, no timer.
 */
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import type { LimboEntry } from "../../../types";
import { fetchOpenLimboEntries } from "../../../lib/mindbody-limbo";
import { fetchRecentReports } from "../../admin/bugs/fetch-reports";
import type { ReportView } from "../../admin/bugs/reportView";

export type ReadState = "loading" | "ok" | "failed";

export interface PendingOffer {
  id: string;
  machineName: string;
  studioName: string;
  /** When it was offered (ms), when known. */
  submittedAt: number | null;
}

export interface HomeSignals {
  limbo: { state: ReadState; entries: LimboEntry[] };
  bugs: { state: ReadState; reports: ReportView[] };
  offers: { state: ReadState; pending: PendingOffer[] };
}

const LOADING: HomeSignals = {
  limbo: { state: "loading", entries: [] },
  bugs: { state: "loading", reports: [] },
  offers: { state: "loading", pending: [] },
};

function millis(v: unknown): number | null {
  const d = (v as { toDate?: () => Date })?.toDate?.() ?? (v instanceof Date ? v : null);
  return d ? d.getTime() : null;
}

async function fetchPendingOffers(): Promise<PendingOffer[]> {
  const snap = await getDocs(query(collection(db, "catalogSubmissions"), where("status", "==", "pending")));
  return snap.docs
    .map((d) => {
      const data = d.data() as { definition?: { name?: string }; studioName?: string; submittedAt?: unknown };
      return {
        id: d.id,
        machineName: data.definition?.name || "A machine",
        studioName: data.studioName || "a studio",
        submittedAt: millis(data.submittedAt),
      };
    })
    .sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
}

export function useHomeSignals(refreshKey: unknown): HomeSignals {
  const [signals, setSignals] = useState<HomeSignals>(LOADING);

  useEffect(() => {
    let cancelled = false;
    setSignals(LOADING);
    fetchOpenLimboEntries().then(
      (entries) => !cancelled && setSignals((s) => ({ ...s, limbo: { state: "ok", entries } })),
      () => !cancelled && setSignals((s) => ({ ...s, limbo: { state: "failed", entries: [] } })),
    );
    fetchRecentReports().then(
      (reports) => !cancelled && setSignals((s) => ({ ...s, bugs: { state: "ok", reports } })),
      () => !cancelled && setSignals((s) => ({ ...s, bugs: { state: "failed", reports: [] } })),
    );
    fetchPendingOffers().then(
      (pending) => !cancelled && setSignals((s) => ({ ...s, offers: { state: "ok", pending } })),
      () => !cancelled && setSignals((s) => ({ ...s, offers: { state: "failed", pending: [] } })),
    );
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return signals;
}
