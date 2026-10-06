/**
 * The screens' half of the night's month tally (speed round, Oct 5 2026;
 * R27; month-tally.ts says what the documents are). Hours and Insights ask
 * here first; when the night's documents are missing, from an older night,
 * too big or unreadable, the answer is null and the screen makes the raw read
 * it always made. Nothing here writes.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, doc, documentId, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import type { Studio, WorkoutSession } from "../../../types";
import { studioTodayKey } from "../../../lib/studio-time";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { fetchSessionsInRange, readSessionsInRange } from "../sessions-range";
import { hoursTally, queryWindowForMonth, sessionMinutesOf, type HoursTally, type MonthKey } from "../hours/hours";
import type { TrainerNames } from "../insights/metrics";
import {
  hoursDocId,
  hoursFromNightAndLive,
  openIdsOf,
  sessionsDocId,
  usableHoursDoc,
  usableSessionsDoc,
  type HoursMonthDoc,
  type OpenNow,
  type SessionsMonthDoc,
} from "./month-tally";

async function readWatch(studioId: string, id: string): Promise<unknown | null> {
  try {
    const snap = await getDoc(doc(db, "studios", studioId, "watch", id));
    return snap.exists() ? snap.data() : null;
  } catch {
    // Unreadable is not "nothing happened": the raw read answers instead.
    return null;
  }
}

/** The night's Hours counts for a studio and month, or null when the screen should read raw. */
export async function readNightHours(studioId: string, month: MonthKey, today: string): Promise<HoursMonthDoc | null> {
  const data = await readWatch(studioId, hoursDocId(month));
  return usableHoursDoc(data, month, today) ? data : null;
}

/** The night's lines for these months, all of them usable, or null. */
export async function readNightSessions(studioId: string, months: MonthKey[], today: string): Promise<SessionsMonthDoc[] | null> {
  const docs = await Promise.all(months.map((m) => readWatch(studioId, sessionsDocId(m))));
  const usable = docs.every((d, i) => usableSessionsDoc(d, months[i], today));
  return usable ? (docs as SessionsMonthDoc[]) : null;
}

/**
 * The sessions the night counted as still open, read again by id (a
 * handful; ten to a read). Each comes back as it is now, or null when it is
 * gone. A read that fails, or only the cache answered, leaves its ids out of
 * the map: those stay as the night saw them, never guessed closed.
 */
export async function readOpenNow(docs: ReadonlyArray<{ openIds?: string[]; open?: unknown }>): Promise<OpenNow> {
  const ids = openIdsOf(docs);
  const out = new Map<string, WorkoutSession | null>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const snap = await getDocs(query(collection(db, "sessions"), where(documentId(), "in", chunk)));
        if (snap.metadata?.fromCache === true) return;
        const found = new Map(snap.docs.map((d) => [d.id, { ...(d.data() as WorkoutSession), id: d.id }]));
        for (const id of chunk) out.set(id, found.get(id) ?? null);
      } catch {
        // Unknown: these stay open, as the night counted them.
      }
    }),
  );
  return out;
}

/* ------------------------------------------------------------------ *
 * Hours, one studio
 * ------------------------------------------------------------------ */

type Material =
  | { kind: "night"; doc: HoursMonthDoc; live: WorkoutSession[]; openNow: OpenNow; truncated: boolean }
  | { kind: "raw"; sessions: WorkoutSession[]; truncated: boolean };

export interface StudioHoursState {
  tally: HoursTally;
  loading: boolean;
  /** A read failed: unknown, never "no hours". */
  failed: boolean;
  truncated: boolean;
  /** Where the closed days came from: the night's counts, or the raw read. */
  source: "night" | "raw" | null;
}

/**
 * One studio's month: the night's counts and today's live sessions, or the
 * raw month when the night has nothing usable. Names and the slot length are
 * applied on the screen, so a rename or a new slot needs no new read.
 */
export function useStudioHours(studio: Pick<Studio, "id" | "timezone" | "sessionMinutes">, month: MonthKey, names: TrainerNames): StudioHoursState {
  const tz = studio.timezone || undefined;
  const [material, setMaterial] = useState<{ key: string; m: Material } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const key = `${studio.id}|${month}|${tz ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const today = studioTodayKey(new Date(), tz);
      try {
        const night = await readNightHours(studio.id, month, today);
        if (cancelled) return;
        if (night) {
          // Today, and anything logged since the night read: always live. And
          // the sessions it counted as open, as they are now.
          const [live, openNow] = await Promise.all([
            fetchSessionsInRange({ studioId: studio.id, startMs: night.liveFromMs }),
            readOpenNow([night]),
          ]);
          if (!cancelled) setMaterial({ key, m: { kind: "night", doc: night, live: live.sessions, openNow, truncated: live.truncated } });
          return;
        }
        const window = queryWindowForMonth(month, tz);
        const raw = await readSessionsInRange({ studioId: studio.id, startMs: window.startMs, endMs: window.endMs });
        if (!cancelled) setMaterial({ key, m: { kind: "raw", sessions: raw.sessions, truncated: raw.truncated } });
      } catch (err) {
        if (cancelled) return;
        handleFirestoreError(err, OperationType.GET, "sessions");
        setFailedKey(key);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, studio.id, month, tz]);

  const slot = sessionMinutesOf(studio);
  const current = material?.key === key ? material.m : null;
  const failed = failedKey === key;
  const tally = useMemo(() => {
    if (!current) return hoursTally([], { month, sessionMinutes: slot, names });
    if (current.kind === "night") return hoursFromNightAndLive(current.doc, current.live, { sessionMinutes: slot, names, tz, openNow: current.openNow });
    return hoursTally(current.sessions, { month, sessionMinutes: slot, names });
  }, [current, month, slot, names, tz]);

  return {
    tally,
    loading: !current && !failed,
    failed,
    truncated: current?.truncated ?? false,
    source: current?.kind ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Hours, every studio: the night's counts only
 * ------------------------------------------------------------------ */

export interface NightHoursMany {
  /** A studio's counts to last night, or null when the night has none usable for it. */
  byStudio: Record<string, HoursMonthDoc | null>;
  loading: boolean;
}

/** One small document per studio, for the company line. Never the raw sessions. */
export function useNightHoursMany(studios: Pick<Studio, "id" | "timezone">[], month: MonthKey): NightHoursMany {
  const ids = studios.map((s) => `${s.id}:${s.timezone ?? ""}`).join(",");
  const [state, setState] = useState<{ key: string; byStudio: Record<string, HoursMonthDoc | null> } | null>(null);
  const key = `${ids}|${month}`;

  useEffect(() => {
    let cancelled = false;
    const list = ids ? ids.split(",").map((x) => ({ id: x.slice(0, x.indexOf(":")), tz: x.slice(x.indexOf(":") + 1) || undefined })) : [];
    void Promise.all(list.map((s) => readNightHours(s.id, month, studioTodayKey(new Date(), s.tz)))).then((docs) => {
      if (cancelled) return;
      setState({ key, byStudio: Object.fromEntries(list.map((s, i) => [s.id, docs[i]])) });
    });
    return () => {
      cancelled = true;
    };
  }, [key, ids, month]);

  const current = state?.key === key ? state.byStudio : null;
  return { byStudio: current ?? {}, loading: current === null };
}
