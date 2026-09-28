/**
 * THE DAY LOG — Firestore (./day-log.ts is what it means).
 *
 *   studios/{studioId}/dayLogs/{uid}_{yyyy-mm-dd}   the trainer's own
 *
 * Read and written only by that person: the rules pin `uid` to the Auth uid
 * and the id to `uid_day`, and a list must ask for `uid == me` (the index
 * dayLogs: uid, day desc). A save merges only what it was handed, so
 * Opening's lines and Close out's line never erase each other.
 */
import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { cleanCarry, cleanFacts, cleanLine, dayLogFromDoc, dayLogId, type DayLine, type DayLog } from "./day-log";

export function dayLogsRef(studioId: string) {
  return collection(db, "studios", studioId, "dayLogs");
}

export function dayLogRef(studioId: string, uid: string, day: string) {
  return doc(db, "studios", studioId, "dayLogs", dayLogId(uid, day));
}

export type DayLogRead = { state: "loading" } | { state: "ready"; log: DayLog | null } | { state: "failed" };

/** One day's log, live. A failed read is "failed", never "no log". */
export function useDayLog(studioId: string | null, uid: string | null, day: string): DayLogRead {
  const [read, setRead] = useState<DayLogRead>({ state: "loading" });
  useEffect(() => {
    if (!studioId || !uid || !day) {
      setRead({ state: "ready", log: null });
      return;
    }
    setRead({ state: "loading" });
    return onSnapshot(
      dayLogRef(studioId, uid, day),
      (snap) => setRead({ state: "ready", log: snap.exists() ? dayLogFromDoc(snap.id, snap.data() as Record<string, unknown>) : null }),
      (err) => {
        console.warn("[journal] day log couldn't be read:", err);
        setRead({ state: "failed" });
      },
    );
  }, [studioId, uid, day]);
  return read;
}

export type DayLogsRead = { state: "loading" } | { state: "ready"; logs: DayLog[] } | { state: "failed" };

/** How many days back the Journal's Day logs shelf reads. */
export const DAY_LOGS_READ = 60;

/** This person's day logs at a studio, newest first (one query, its index: uid, day desc). */
export function useDayLogs(studioId: string | null, uid: string | null, enabled = true): DayLogsRead {
  const [read, setRead] = useState<DayLogsRead>({ state: "loading" });
  useEffect(() => {
    if (!enabled) return;
    if (!studioId || !uid) {
      setRead({ state: "ready", logs: [] });
      return;
    }
    setRead({ state: "loading" });
    return onSnapshot(
      query(dayLogsRef(studioId), where("uid", "==", uid), orderBy("day", "desc"), limit(DAY_LOGS_READ)),
      (snap) => {
        const logs: DayLog[] = [];
        snap.forEach((d) => {
          const log = dayLogFromDoc(d.id, d.data() as Record<string, unknown>);
          if (log) logs.push(log);
        });
        setRead({ state: "ready", logs });
      },
      (err) => {
        console.warn("[journal] day logs couldn't be read:", err);
        setRead({ state: "failed" });
      },
    );
  }, [studioId, uid, enabled]);
  return read;
}

export interface DayLogPatch {
  carry?: string[];
  line?: Partial<DayLine> | null;
  facts?: string[];
}

/**
 * Saves part of a day's log, merged: only what is handed in is written.
 * `isNew` stamps its first save time (the caller knows there is no log yet).
 */
export async function saveDayLog(params: { studioId: string; uid: string; day: string; patch: DayLogPatch; isNew: boolean }): Promise<void> {
  const { studioId, uid, day, patch, isNew } = params;
  const data: Record<string, unknown> = { uid, studioId, day, updatedAt: serverTimestamp() };
  if (isNew) data.createdAt = serverTimestamp();
  if (patch.carry) data.carry = cleanCarry(patch.carry);
  if (patch.facts) data.facts = cleanFacts(patch.facts);
  if (patch.line !== undefined) data.line = cleanLine(patch.line);
  await setDoc(dayLogRef(studioId, uid, day), data, { merge: true });
}
