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
 *   shares         what studios offered every MSF studio (Oct 2 2026):
 *                  fetchShareOffers, the Waiting for review page's read
 *
 * And one query of its own (the Atlas answers, Oct 2 2026): the sessions
 * left open across every studio, `status == "In-Progress"` started in the
 * last 14 days, newest first, at most 200 (fetchOpenSessions). It needs the
 * (status, createdAt desc) index on `sessions`, added to
 * firestore.indexes.json; until it is deployed the Enterprise database
 * answers by scanning. Which of them are LEFT open is the Hub's own rule
 * (admin/overview/left-open.ts, over isSessionValid).
 *
 * Each says whether it was read: a read that failed is "failed", which Home
 * says as "couldn't check", never as nothing waiting. No listener, no timer.
 */
import { useEffect, useState } from "react";
import { Timestamp, collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import type { LimboEntry, WorkoutSession } from "../../../types";
import { fetchOpenLimboEntries } from "../../../lib/mindbody-limbo";
import { fetchRecentReports } from "../../admin/bugs/fetch-reports";
import type { ReportView } from "../../admin/bugs/reportView";
import { fetchShareOffers } from "../../machine-db/fetch-share-offers";
import type { ShareOffer } from "../../machine-db/offers";

export type ReadState = "loading" | "ok" | "failed";

export interface PendingOffer {
  id: string;
  machineName: string;
  studioName: string;
  /** When it was offered (ms), when known. */
  submittedAt: number | null;
}

/** One thing a studio offered every MSF studio, waiting for review (Oct 2 2026). */
export interface PendingShare {
  key: string;
  kind: ShareOffer["kind"];
  title: string;
  studioId: string;
  studioName: string | null;
  offeredAt: number | null;
}

export interface HomeSignals {
  limbo: { state: ReadState; entries: LimboEntry[] };
  bugs: { state: ReadState; reports: ReportView[] };
  offers: { state: ReadState; pending: PendingOffer[] };
  /** In-Progress sessions started in the last 14 days, every studio (Oct 2 2026). */
  openSessions: { state: ReadState; sessions: WorkoutSession[] };
  /** Waiting for review: notes, tips and machines offered to every studio. */
  shares: { state: ReadState; pending: PendingShare[] };
}

const LOADING: HomeSignals = {
  limbo: { state: "loading", entries: [] },
  bugs: { state: "loading", reports: [] },
  offers: { state: "loading", pending: [] },
  openSessions: { state: "loading", sessions: [] },
  shares: { state: "loading", pending: [] },
};

function pendingShareOf(o: ShareOffer): PendingShare {
  return {
    key: `${o.kind}:${o.studioId}:${o.docId}`,
    kind: o.kind,
    title: o.title,
    studioId: o.studioId,
    studioName: o.studioName,
    offeredAt: millis(o.offeredAt),
  };
}

/** How far back, and how many, the sessions-left-open read looks. */
export const OPEN_SESSIONS_DAYS = 14;
export const OPEN_SESSIONS_CAP = 200;

async function fetchOpenSessions(): Promise<WorkoutSession[]> {
  const from = Timestamp.fromMillis(Date.now() - OPEN_SESSIONS_DAYS * 86_400_000);
  const snap = await getDocs(
    query(
      collection(db, "sessions"),
      where("status", "==", "In-Progress"),
      where("createdAt", ">=", from),
      orderBy("createdAt", "desc"),
      limit(OPEN_SESSIONS_CAP),
    ),
  );
  return snap.docs.map((d) => ({ ...(d.data() as WorkoutSession), id: d.id }));
}

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
    fetchOpenSessions().then(
      (sessions) => !cancelled && setSignals((s) => ({ ...s, openSessions: { state: "ok", sessions } })),
      () => !cancelled && setSignals((s) => ({ ...s, openSessions: { state: "failed", sessions: [] } })),
    );
    // The Waiting for review page's own read (machine-db/fetch-share-offers).
    fetchShareOffers().then(
      (offers) =>
        !cancelled && setSignals((s) => ({ ...s, shares: { state: "ok", pending: offers.map(pendingShareOf) } })),
      () => !cancelled && setSignals((s) => ({ ...s, shares: { state: "failed", pending: [] } })),
    );
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return signals;
}
