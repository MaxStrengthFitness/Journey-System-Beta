/**
 * useClinicalReport — fetch on demand, never on tab open.
 *
 * The old Clinical tab pulled every session and every log the moment it
 * mounted. This hook does nothing until `generate(range)` is called, then
 * loads exactly what the range needs:
 *
 *   sessions   clientId == X AND date >= priorFrom, newest first — the same
 *              composite index the profile already uses. `priorFrom` reaches
 *              one range-length further back so the KPI deltas and the
 *              trailing baselines have something to compare against.
 *   logs       for ≤ 60 sessions: `sessionId in` batches of ten (cheap,
 *              exact); beyond that one `clientId ==` query (one round-trip,
 *              filtered in memory).
 *   incidents  clientId == X, once.
 *
 * Results are cached per range key for the life of the component so
 * flipping between two ranges is instant; "Regenerate" bypasses the cache.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { ClinicalIncident, ExerciseLog, WorkoutSession } from "../../types";
import type { ReportRange } from "./types";
import { priorRange } from "./report";

export interface ReportData {
  range: ReportRange;
  sessions: WorkoutSession[];
  logs: ExerciseLog[];
  incidents: ClinicalIncident[];
  fetchedAt: number;
}

export type ReportStatus = "idle" | "loading" | "ready" | "error";

export interface ClinicalReportState {
  status: ReportStatus;
  /** Human progress line while loading ("Loading 214 sets…"). */
  progress: string;
  data: ReportData | null;
  error: string | null;
  generate: (range: ReportRange, options?: { force?: boolean }) => Promise<void>;
  reset: () => void;
}

const rangeKey = (r: ReportRange) => `${r.from ?? "all"}:${r.to}`;

async function fetchLogsForSessions(sessionIds: string[]): Promise<ExerciseLog[]> {
  const out: ExerciseLog[] = [];
  for (let i = 0; i < sessionIds.length; i += 10) {
    const chunk = sessionIds.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, "exerciseLogs"), where("sessionId", "in", chunk)));
    for (const d of snap.docs) out.push({ id: d.id, ...(d.data() as ExerciseLog) });
  }
  return out;
}

export function useClinicalReport(clientId: string | null, options: { enabled?: boolean } = {}): ClinicalReportState {
  const enabled = options.enabled ?? true;
  const [status, setStatus] = useState<ReportStatus>("idle");
  const [progress, setProgress] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, ReportData>());
  const requestId = useRef(0);

  // A new client means a new report.
  useEffect(() => {
    cache.current.clear();
    setStatus("idle");
    setData(null);
    setError(null);
    setProgress("");
  }, [clientId]);

  const reset = useCallback(() => {
    setStatus("idle");
    setData(null);
    setError(null);
  }, []);

  const generate = useCallback(
    async (range: ReportRange, opts: { force?: boolean } = {}) => {
      if (!clientId || !enabled) return;
      const key = rangeKey(range);
      const cached = cache.current.get(key);
      if (cached && !opts.force) {
        setData(cached);
        setStatus("ready");
        return;
      }
      const myId = ++requestId.current;
      setStatus("loading");
      setError(null);
      setProgress("Loading sessions…");
      try {
        const prior = priorRange(range);
        const from = prior?.from ?? range.from;
        const constraints = [where("clientId", "==", clientId)];
        if (from) constraints.push(where("date", ">=", from));
        const sessionSnap = await getDocs(query(collection(db, "sessions"), ...constraints, orderBy("date", "desc")));
        if (requestId.current !== myId) return;
        const sessions = sessionSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as WorkoutSession) }))
          .filter((s) => s.date <= range.to || !s.date);

        setProgress(`Loading sets for ${sessions.length} sessions…`);
        const ids = sessions.map((s) => s.id!).filter(Boolean);
        let logs: ExerciseLog[];
        if (ids.length <= 60) {
          logs = await fetchLogsForSessions(ids);
        } else {
          const idSet = new Set(ids);
          const snap = await getDocs(query(collection(db, "exerciseLogs"), where("clientId", "==", clientId)));
          logs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ExerciseLog) })).filter((l) => idSet.has(l.sessionId));
        }
        if (requestId.current !== myId) return;

        setProgress("Loading incidents…");
        let incidents: ClinicalIncident[] = [];
        try {
          const incSnap = await getDocs(query(collection(db, "clinicalIncidents"), where("clientId", "==", clientId)));
          incidents = incSnap.docs.map((d) => ({ id: d.id, ...(d.data() as ClinicalIncident) }));
        } catch (e) {
          // Incidents are a garnish; a missing index must not sink the report.
          console.warn("Clinical incidents skipped:", e);
        }
        if (requestId.current !== myId) return;

        setProgress("Compiling…");
        const result: ReportData = { range, sessions, logs, incidents, fetchedAt: Date.now() };
        cache.current.set(key, result);
        setData(result);
        setStatus("ready");
      } catch (e) {
        if (requestId.current !== myId) return;
        console.error("Clinical report failed:", e);
        setError(e instanceof Error ? e.message : "Could not load the client's history.");
        setStatus("error");
      } finally {
        if (requestId.current === myId) setProgress("");
      }
    },
    [clientId, enabled],
  );

  return { status, progress, data, error, generate, reset };
}
