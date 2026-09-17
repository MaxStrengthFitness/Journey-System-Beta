/**
 * Operations → Machine fit: where the two scopes get their data.
 *
 *   THIS STUDIO   live. One query for the studio's machineFit index (shared
 *                 with the Setup screen's ten-minute cache, so opening this
 *                 after setting a client up costs nothing), joined to the
 *                 client list the app already holds, and the report is built
 *                 here, in the browser, by the same function the weekly job
 *                 runs (machine-fit/kaizen.ts). It names clients — a leader
 *                 may see their own — and nothing it builds is written back.
 *
 *   ALL MSF       the weekly job's reports. One read for the list
 *                 (kaizenReports/_summary), one per machine opened, each
 *                 kept for the app session: the documents change once a
 *                 week. Administrators only, by rule; this hook is simply
 *                 not called for anyone else.
 *
 * A FAILED READ IS "could not load", NEVER "nobody is set up".
 */

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import type { KaizenSummary } from "../../machine-fit/company";
import { samplesFromFitDoc, subjectsFromFitDoc, type FitClientRecord } from "../../machine-fit/fit-index";
import { fetchStudioFit } from "../../machine-fit/fit-store";
import { buildKaizen, type KaizenReport, type KaizenSample, type SubjectFinding } from "../../machine-fit/kaizen";

export type LoadState = "idle" | "loading" | "ready" | "failed";

export interface MachineFieldInfo {
  fieldKeys: string[];
  fieldSteps: Record<string, number | undefined>;
}

export interface StudioFitReports {
  status: LoadState;
  /** machineId → the report, and the clients worth a look (ids — never leaves this screen). */
  byMachine: Record<string, { report: KaizenReport; findings: SubjectFinding[] }>;
  /** Set-ups whose client is not on this studio's list (moved studio, or the list has not loaded). */
  rowsOffList: number;
}

const IDLE: StudioFitReports = { status: "idle", byMachine: {}, rowsOffList: 0 };

export function useStudioFitReports(
  studioId: string | null | undefined,
  clients: readonly (FitClientRecord & { id?: string | null })[],
  fieldsOf: (machineId: string) => MachineFieldInfo | null,
  enabled: boolean,
): StudioFitReports {
  const [fit, setFit] = useState<Awaited<ReturnType<typeof fetchStudioFit>> | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !studioId) {
      setFit(undefined);
      return;
    }
    let live = true;
    setFit(undefined);
    fetchStudioFit(studioId).then((result) => {
      if (live) setFit(result);
    });
    return () => {
      live = false;
    };
  }, [enabled, studioId]);

  return useMemo<StudioFitReports>(() => {
    if (!enabled || !studioId) return IDLE;
    if (fit === undefined) return { ...IDLE, status: "loading" };
    if (fit === null) return { ...IDLE, status: "failed" };

    const byId = new Map<string, FitClientRecord>();
    for (const c of clients) if (c?.id) byId.set(c.id, c);
    const now = new Date();
    const byMachine: StudioFitReports["byMachine"] = {};
    let rowsOffList = 0;
    for (const [machineId, fitDoc] of Object.entries(fit)) {
      const withStudio = { ...fitDoc, studioId };
      const subjects = subjectsFromFitDoc(withStudio, byId, now);
      rowsOffList += Object.values(fitDoc.rows ?? {}).filter((r) => r && r.s).length - subjects.length;
      const samples: KaizenSample[] = samplesFromFitDoc(withStudio, byId, now).map((s) => ({ ...s, studioId }));
      const info = fieldsOf(machineId);
      byMachine[machineId] = buildKaizen({
        machineId,
        samples,
        subjects,
        fieldKeys: info?.fieldKeys,
        fieldSteps: info?.fieldSteps,
      });
    }
    return { status: "ready", byMachine, rowsOffList: Math.max(0, rowsOffList) };
  }, [enabled, studioId, fit, clients, fieldsOf]);
}

/* ------------------------------------------------------------------ *
 * All MSF — the weekly documents
 * ------------------------------------------------------------------ */

type StoredReport = KaizenReport & { builtAt?: string };

let summaryCache: Promise<KaizenSummary | null> | null = null;
const reportCache = new Map<string, Promise<StoredReport | null>>();

/** Test seam. */
export function __resetCompanyFitCache() {
  summaryCache = null;
  reportCache.clear();
}

async function readOnce<T>(path: [string, string]): Promise<T | null> {
  const snap = await getDoc(doc(db, path[0], path[1]));
  return snap.exists() ? (snap.data() as T) : null;
}

export interface CompanyFitSummary {
  status: LoadState;
  /** null once loaded means the weekly job has not written one yet. */
  summary: KaizenSummary | null;
}

export function useCompanyFitSummary(enabled: boolean): CompanyFitSummary {
  const [state, setState] = useState<CompanyFitSummary>({ status: "idle", summary: null });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState((s) => (s.status === "ready" ? s : { status: "loading", summary: null }));
    if (!summaryCache) {
      summaryCache = readOnce<KaizenSummary>(["kaizenReports", "_summary"]);
      // A failure is not cached: the next visit tries again.
      summaryCache.catch(() => {
        summaryCache = null;
      });
    }
    summaryCache.then(
      (summary) => live && setState({ status: "ready", summary }),
      (err) => {
        console.warn("[machine fit] company summary read failed", err);
        if (live) setState({ status: "failed", summary: null });
      },
    );
    return () => {
      live = false;
    };
  }, [enabled]);
  return state;
}

export interface CompanyFitReport {
  status: LoadState;
  report: StoredReport | null;
}

export function useCompanyFitReport(machineId: string | null, enabled: boolean): CompanyFitReport {
  const [state, setState] = useState<CompanyFitReport>({ status: "idle", report: null });
  useEffect(() => {
    if (!enabled || !machineId) {
      setState({ status: "idle", report: null });
      return;
    }
    let live = true;
    setState({ status: "loading", report: null });
    let pending = reportCache.get(machineId);
    if (!pending) {
      pending = readOnce<StoredReport>(["kaizenReports", machineId]);
      reportCache.set(machineId, pending);
      pending.catch(() => reportCache.delete(machineId));
    }
    pending.then(
      (report) => live && setState({ status: "ready", report }),
      (err) => {
        console.warn("[machine fit] company report read failed", machineId, err);
        if (live) setState({ status: "failed", report: null });
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, machineId]);
  return state;
}
