/**
 * The cases this trainer owns at this studio — the Firestore half of
 * my-cases.ts (Relay's third wave, Sep 29 2026).
 *
 * ONE query, on the cases index (owner.id, outcome, dueOn):
 *   studios/{s}/cases  where owner.id == <Auth uid>  where outcome == 'open'  by dueOn
 *
 * The uid is the SIGN-IN uid: the rules let an owner read a case whose
 * `owner.id` is their uid and nothing else, so the query names it too (a
 * list query that could return someone else's case is refused whole).
 *
 * A failed read is "unknown", never "no cases": `failed` is set and the
 * Tracker's Follow-ups says nothing rather than "nothing to follow up".
 */
import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { CASES, parseCase, type StoredCase } from "../admin/journey/case-store";

export interface MyCasesRead {
  cases: StoredCase[];
  loading: boolean;
  failed: boolean;
}

const NONE: StoredCase[] = [];

export function useMyCases(studioId: string | null | undefined, uid: string | null | undefined): MyCasesRead {
  const [state, setState] = useState<MyCasesRead>({ cases: NONE, loading: Boolean(studioId && uid), failed: false });

  useEffect(() => {
    if (!studioId || !uid) {
      setState({ cases: NONE, loading: false, failed: false });
      return;
    }
    setState({ cases: NONE, loading: true, failed: false });
    return onSnapshot(
      query(collection(db, "studios", studioId, CASES), where("owner.id", "==", uid), where("outcome", "==", "open"), orderBy("dueOn")),
      (snap) => {
        const cases: StoredCase[] = [];
        snap.docs.forEach((d) => {
          const c = parseCase(d.id, d.data() as Record<string, unknown>);
          if (c) cases.push(c);
        });
        setState({ cases, loading: false, failed: false });
      },
      (err) => {
        console.warn("[relay] my cases read failed:", err);
        setState({ cases: NONE, loading: false, failed: true });
      },
    );
  }, [studioId, uid]);

  return state;
}
