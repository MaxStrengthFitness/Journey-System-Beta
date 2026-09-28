/**
 * READING THE ACTIVITY RECORD — once when a page opens, and again on Reload.
 *
 * Two questions, each one query, each with its index (firestore.indexes.json;
 * the Enterprise edition builds none by itself):
 *
 *   one studio      activity where studioId == s, newest first, the last 50
 *                   (index: studioId, at desc) — a studio's Activity tab, and
 *                   the query the rules let that studio's leaders make
 *   the company     activity where kind in [the filter's kinds], newest first,
 *                   the last 100 (index: kind, at desc) — Machinery → Activity
 *
 * No listener: a record is read when someone goes to read it, and a
 * listener on a collection that only grows would cost a read per entry per
 * visit for nothing. A read that failed says so ("failed"), which the page
 * says as "couldn't check", never as nothing recorded.
 */
import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { newestFirst, toActivityEntry, type ActivityEntry, type ActivityKind } from "./activity";

export const STUDIO_PAGE = 50;
export const COMPANY_PAGE = 100;

export type ActivityRead =
  | { state: "loading" }
  | { state: "ok"; entries: ActivityEntry[]; full: boolean }
  | { state: "failed"; message: string };

export type ActivityScope = { studioId: string } | { kinds: readonly ActivityKind[] };

async function readActivity(scope: ActivityScope): Promise<{ entries: ActivityEntry[]; full: boolean }> {
  const page = "studioId" in scope ? STUDIO_PAGE : COMPANY_PAGE;
  const q =
    "studioId" in scope
      ? query(collection(db, "activity"), where("studioId", "==", scope.studioId), orderBy("at", "desc"), limit(page))
      : query(collection(db, "activity"), where("kind", "in", [...scope.kinds]), orderBy("at", "desc"), limit(page));
  const snap = await getDocs(q);
  const entries = snap.docs.map((d) => toActivityEntry(d.id, d.data())).filter((e): e is ActivityEntry => e !== null);
  return { entries: newestFirst(entries), full: snap.docs.length >= page };
}

/** The record for one studio, or for a set of kinds company-wide. */
export function useActivity(scope: ActivityScope | null, refreshKey: unknown): ActivityRead {
  const [read, setRead] = useState<ActivityRead>({ state: "loading" });
  const key = scope ? ("studioId" in scope ? `studio:${scope.studioId}` : `kinds:${[...scope.kinds].sort().join(",")}`) : "";

  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    setRead({ state: "loading" });
    readActivity(scope).then(
      ({ entries, full }) => !cancelled && setRead({ state: "ok", entries, full }),
      (err: unknown) => !cancelled && setRead({ state: "failed", message: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      cancelled = true;
    };
    // The key stands for the scope: a new object with the same studio or kinds reads nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshKey]);

  return read;
}
