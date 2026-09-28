/**
 * WHICH DAYS WERE READ IN FULL — the whole-read record for the months a week
 * touches, read once (Operations → Week's trust line).
 *
 * The record (`studios/{s}/scheduleCoverage/{yyyy-mm}`, the coverage-record
 * round, Sep 27 2026) is written by the iPad that pulled and read by the
 * studio's people; Openings' Sunday job reads it too. Here it is one document
 * get per month (a week touches one or two): no query, no index. A month
 * whose get fails is `null` in the record, which `wasReadInFull` reads as
 * "can't tell", never "not read".
 */
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { COVERAGE_COLLECTION, recordedDays, type CoverageRecord } from "../../openings/coverage";

/** The record for these months, or null while it is being read. */
export function useCoverageRecord(studioId: string | null, months: readonly string[]): CoverageRecord | null {
  const key = useMemo(() => [...new Set(months.filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort().join(","), [months]);
  const [state, setState] = useState<{ key: string; record: CoverageRecord } | null>(null);
  useEffect(() => {
    setState(null);
    if (!studioId || !key) return;
    let cancelled = false;
    const list = key.split(",");
    void Promise.all(
      list.map((month) =>
        getDoc(doc(db, "studios", studioId, COVERAGE_COLLECTION, month))
          .then((snap) => [month, recordedDays(month, snap.exists() ? snap.data() : undefined)] as const)
          .catch(() => [month, null] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setState({ key, record: new Map(pairs) });
    });
    return () => {
      cancelled = true;
    };
  }, [studioId, key]);
  return state && state.key === key ? state.record : null;
}
