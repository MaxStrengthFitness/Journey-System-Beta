/**
 * Renewal outcomes for the leader-only panel: the cycles that closed inside
 * a date range, for one studio or a leader's several, and each studio's own
 * "pay-as-you-go counts as" rule.
 *
 * One small range query per studio on renewals.closedOn — a single-field
 * range, which Firestore indexes without a composite. Nothing here writes.
 */

import { useEffect, useMemo, useState } from "react";
import { collection, getDoc, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { normalizeRenewalSettings } from "./settings";
import { renewalSettingsRef } from "./useRenewalSettings";
import type { OutcomeRow } from "./rates";
import type { PayAsYouGoCountsAs, RenewalCycle } from "./types";

/** More studios than this aren't compared side by side (one listener each). */
export const MAX_STUDIOS_COMPARED = 25;

export interface OutcomesState {
  rows: OutcomeRow[];
  /** Each studio's own rule; "retained" until its settings arrive. */
  paygRule: Record<string, PayAsYouGoCountsAs>;
  loading: boolean;
  error: string | null;
}

export function useOutcomes(studioIds: string[], from: string, to: string): OutcomesState {
  const key = useMemo(
    () => Array.from(new Set(studioIds.filter(Boolean))).sort().slice(0, MAX_STUDIOS_COMPARED).join(","),
    [studioIds],
  );
  const [byStudio, setByStudio] = useState<Record<string, OutcomeRow[]>>({});
  const [paygRule, setPaygRule] = useState<Record<string, PayAsYouGoCountsAs>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setByStudio({});
    setError(null);
    const ids = key ? key.split(",") : [];
    const unsubs = ids.map((id) =>
      onSnapshot(
        query(
          collection(db, "studios", id, "renewals"),
          where("closedOn", ">=", from),
          where("closedOn", "<=", to),
          limit(1000),
        ),
        (snap) =>
          setByStudio((prev) => ({
            ...prev,
            [id]: snap.docs.map((d) => {
              const c = d.data() as Partial<RenewalCycle>;
              return {
                cycleKey: d.id,
                studioId: id,
                outcome: c.outcome ?? null,
                packageKey: c.packageKey ?? null,
                primaryTrainerId: c.primaryTrainerId ?? null,
                closedOn: c.closedOn ?? null,
              };
            }),
          })),
        (err) => {
          console.warn("[renewals] outcomes read failed:", err);
          setError("Couldn't load renewal outcomes.");
          setByStudio((prev) => ({ ...prev, [id]: [] }));
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [key, from, to]);

  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    ids.forEach((id) => {
      getDoc(renewalSettingsRef(id))
        .then((snap) => {
          if (cancelled) return;
          const rule = normalizeRenewalSettings(snap.exists() ? snap.data() : undefined).payAsYouGoCountsAs;
          setPaygRule((prev) => (prev[id] === rule ? prev : { ...prev, [id]: rule }));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const ids = key ? key.split(",") : [];
  const loading = ids.some((id) => byStudio[id] === undefined);
  const rows = useMemo(() => Object.values(byStudio).flat(), [byStudio]);
  return { rows, paygRule, loading, error };
}
