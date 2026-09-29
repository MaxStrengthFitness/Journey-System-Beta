/**
 * A STUDIO'S ACTIVITY, LIVE — the newest fifty entries of one studio's
 * record, kept in step while the panel is on screen.
 *
 * The Admins room's third wave (Sep 29 2026): My Studio → Studio shows a
 * studio's leaders what was changed at their studio from the Admins
 * dashboard (the second wave's rules already let them read their own
 * studio's entries, and refuse everyone else's). The query is the one the
 * studio's Activity tab makes (useActivity.ts: activity where studioId ==
 * s, newest first, the last 50; index studioId + at desc), as ONE bounded
 * listener rather than a read-once, so a leader with the panel open sees an
 * administrator's change land without a Reload — and because My Studio is
 * a screen a person leaves open, a listener costs no more than a reload
 * would: the same fifty reads at open, then one read per new entry.
 *
 * A read that failed says so ("failed"), which the panel says as "couldn't
 * read", never as nothing recorded.
 */
import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { newestFirst, toActivityEntry, type ActivityEntry } from "./activity";
import { STUDIO_PAGE, type ActivityRead } from "./useActivity";

/** One studio's record, newest first, live while mounted; `refreshKey` starts the listener again after a failure. */
export function useStudioActivityLive(studioId: string | null, refreshKey: unknown = 0): ActivityRead {
  const [read, setRead] = useState<ActivityRead>({ state: "loading" });

  useEffect(() => {
    if (!studioId) return;
    setRead({ state: "loading" });
    const q = query(collection(db, "activity"), where("studioId", "==", studioId), orderBy("at", "desc"), limit(STUDIO_PAGE));
    return onSnapshot(
      q,
      (snap) => {
        const entries = snap.docs.map((d) => toActivityEntry(d.id, d.data())).filter((e): e is ActivityEntry => e !== null);
        setRead({ state: "ok", entries: newestFirst(entries), full: snap.docs.length >= STUDIO_PAGE });
      },
      (err) => setRead({ state: "failed", message: err instanceof Error ? err.message : String(err) }),
    );
  }, [studioId, refreshKey]);

  return read;
}
