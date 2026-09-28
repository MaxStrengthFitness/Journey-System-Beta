import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { DEFAULT_TIME_ZONE, isValidTimeZone, studioTodayKey } from "../../../lib/studio-time";
import type { Studio, Trainer } from "../../../types";
import { forgetOnSignOut } from "../../sign-out/memory";
import { staffIdsAt } from "../../standing-week/check";
import { isCacheOnly, serverRead, type ServerRead } from "../../standing-week/server-read";
import { bookingsKnown, teamWeeks, type TeamWeekRow } from "../../standing-week/team";
import { useServerWait } from "../../standing-week/useServerWait";
import { useStandingWeeks, type StandingWeeksState } from "../../standing-week/useStandingWeeks";
import { MARKS_COLLECTION, marksByTime, type OpeningsMark } from "../marks";
import { nameBook, peopleOf, type Viewer } from "../present";
import type { TimeKey } from "../rows";
import { OPENINGS_WATCH_ID, readSummary, type OpeningsSummary } from "../summary-doc";
import { usualWeek, type UsualWeek } from "../usual";
import { trainerRefs, type TrainerRef } from "../whose";

/**
 * WHAT OPENINGS READS FIRST (Openings round, Sep 27 2026, phase 4): the
 * weekly summary, the studio's standing weeks and the marks. My Studio →
 * Openings mounts it; the Wrap-up's "Times with room" sheet reuses it
 * (ui/README.md says how).
 *
 *   the summary        `studios/{s}/watch/openings`, ONE document read BY ID,
 *                      once per studio while the app is open and again when
 *                      the copy held is a day old, even with the screen left
 *                      open (`loadSummary`, `useOpeningsSummary`); an answer
 *                      that wasn't the server's is asked again when the iPad
 *                      comes back online. Three different answers, never
 *                      mixed up:
 *                        loading     nothing back yet
 *                        none        the server says it was never built
 *                        unreadable  the read failed, the document isn't one
 *                                    this app can read, or this iPad is
 *                                    offline with no copy of it
 *                      A copy from this iPad's cache is shown with its own
 *                      date ("Built Sunday, Oct 4"), so the usual week still
 *                      works offline; a cache saying "there is none" is not
 *                      an answer (unreadable, never "never built").
 *   the standing weeks `useStandingWeeks`, the one small collection Team
 *                      reads (only the server's answer is one).
 *   the marks          `studios/{s}/openingsMarks`, read whole and live (at
 *                      most 6 x 30 small documents). Read only here: setting
 *                      one is the marks phase's. Until the server answers,
 *                      or when the read is refused, no mark is known, and the
 *                      screens say so rather than showing none.
 *
 * It asks Mindbody nothing and reads no bookings: the next 7 days' read is
 * `useNextSevenDays`, made only by a part that shows them. A studio whose
 * Mindbody isn't linked reads neither the summary nor the marks: there is no
 * usual week to draw, and every part says so first.
 *
 * WHO WORKS HERE is the standing weeks' own list (`teamWeeks`: everyone who
 * works at the studio by lib/who-works-here.ts, plus, at the Demo studio,
 * anyone with a practice week there), so Openings and Team check the same
 * people's weeks.
 */

export type SummaryState =
  | { state: "loading" }
  | { state: "ok"; summary: OpeningsSummary; fromCache: boolean }
  | { state: "none" }
  | { state: "unreadable" };

const LOADING: SummaryState = { state: "loading" };

/** A summary held longer than this is read again. */
export const SUMMARY_HOLD_MS = 24 * 60 * 60 * 1000;

const held = new Map<string, { at: number; value: SummaryState }>();
const inFlight = new Map<string, Promise<SummaryState>>();

// Another person on this iPad may not work at the studio this one read.
forgetOnSignOut(() => {
  held.clear();
  inFlight.clear();
});

export const summaryRef = (studioId: string) => doc(db, "studios", studioId, "watch", OPENINGS_WATCH_ID);

async function fetchSummary(studioId: string): Promise<SummaryState> {
  try {
    const snap = await getDoc(summaryRef(studioId));
    const fromCache = isCacheOnly(snap);
    // A cache that has no copy is no answer: it can't say the job never ran.
    if (!snap.exists()) return fromCache ? { state: "unreadable" } : { state: "none" };
    const read = readSummary(snap.data());
    if (read.state === "ok") return { state: "ok", summary: read.summary, fromCache };
    return read.state === "none" ? { state: "none" } : { state: "unreadable" };
  } catch (err) {
    console.warn("[openings] the summary couldn't be read:", err);
    return { state: "unreadable" };
  }
}

/** The summary held for a studio, when it is the server's and less than a day old. */
export function heldSummary(studioId: string, now = Date.now()): SummaryState | null {
  const h = held.get(studioId);
  return h && now - h.at < SUMMARY_HOLD_MS ? h.value : null;
}

/**
 * The studio's summary: the one held, or one read by id (a read already on
 * its way is shared, so Openings and the Wrap-up never read it twice). Only
 * a summary the server returned is held; a failure, a cache's copy and
 * "never built" are asked again at the next open. "Never built" is only true
 * until the first Sunday, and holding it for a day kept saying "the first
 * one comes this Sunday" after the job had written it.
 */
export function loadSummary(studioId: string): Promise<SummaryState> {
  const h = heldSummary(studioId);
  if (h) return Promise.resolve(h);
  const pending = inFlight.get(studioId);
  if (pending) return pending;
  const read = fetchSummary(studioId).then((value) => {
    inFlight.delete(studioId);
    if (value.state === "ok" && !value.fromCache) held.set(studioId, { at: Date.now(), value });
    return value;
  });
  inFlight.set(studioId, read);
  return read;
}

/**
 * The summary for a studio, read by id (`loadSummary`), and read again while
 * the screen stays open when:
 *   - the copy held turns a day old (`now`, the screen's minute clock): an
 *     iPad left on Openings over the weekend gets Sunday's build;
 *   - the answer wasn't the server's (a failure, or this iPad's cache) and
 *     the iPad comes back online.
 * Still one getDoc by id each time; the answer on screen stays until the new
 * one arrives.
 */
export function useOpeningsSummary(studioId: string | null | undefined, now?: Date): SummaryState {
  const key = studioId ?? null;
  const [state, setState] = useState<{ key: string | null; value: SummaryState }>(() => ({
    key,
    value: (key && heldSummary(key)) || LOADING,
  }));
  const [retry, setRetry] = useState(0);
  // Flips when the held copy turns a day old, which asks again.
  const fresh = key ? heldSummary(key, now?.getTime() ?? Date.now()) !== null : false;

  useEffect(() => {
    if (!key) return;
    let live = true;
    void loadSummary(key).then((value) => {
      if (live) setState((s) => (s.key === key && s.value === value ? s : { key, value }));
    });
    return () => {
      live = false;
    };
  }, [key, fresh, retry]);

  const current = state.key === key ? state.value : null;
  const answered = current !== null && ((current.state === "ok" && !current.fromCache) || current.state === "none");
  useEffect(() => {
    if (!key || answered) return;
    const again = () => setRetry((n) => n + 1);
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [key, answered]);

  // An answer about another studio is this one still loading.
  return current ?? ((key && heldSummary(key)) || LOADING);
}

/* ------------------------------------------------------------------ */

export interface MarksState {
  /** The marks by time, once the server has answered; empty before. */
  byTime: ReadonlyMap<TimeKey, OpeningsMark>;
  /** Only "ready" is an answer: the others mean no mark is known. */
  read: ServerRead;
}

const NO_MARKS: ReadonlyMap<TimeKey, OpeningsMark> = new Map();

interface HeldMarks {
  key: string | null;
  byTime: ReadonlyMap<TimeKey, OpeningsMark>;
  loading: boolean;
  failed: boolean;
  fromCache: boolean;
}

/** The studio's marks, live (read only: setting one is the marks phase's). */
export function useOpeningsMarks(studioId: string | null | undefined): MarksState {
  const key = studioId ?? null;
  const [held, setHeld] = useState<HeldMarks>(() => ({ key, byTime: NO_MARKS, loading: Boolean(key), failed: false, fromCache: false }));

  useEffect(() => {
    setHeld({ key, byTime: NO_MARKS, loading: Boolean(key), failed: false, fromCache: false });
    if (!key) return;
    let answered = false;
    return onSnapshot(
      collection(db, "studios", key, MARKS_COLLECTION),
      { includeMetadataChanges: true },
      (snap) => {
        if (!isCacheOnly(snap)) answered = true;
        const docs = snap.docs.map((d) => ({ id: d.id, data: d.data({ serverTimestamps: "estimate" }) as unknown }));
        setHeld({ key, byTime: marksByTime(docs), loading: false, failed: false, fromCache: !answered });
      },
      (err) => {
        console.warn("[openings] the marks couldn't be read:", err);
        setHeld({ key, byTime: NO_MARKS, loading: false, failed: true, fromCache: false });
      },
    );
  }, [key]);

  const stale = held.key !== key;
  const loading = stale ? Boolean(key) : held.loading;
  const failed = !stale && held.failed;
  const fromCache = !stale && held.fromCache;
  const wait = useServerWait(Boolean(key) && (loading || fromCache));
  const read = key ? serverRead({ loading, failed, fromCache, ...wait }) : "failed";
  return { byTime: read === "ready" ? held.byTime : NO_MARKS, read };
}

/* ------------------------------------------------------------------ */

/** A clock for "still ahead": a minute is fine enough for half-hours. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export interface OpeningsInput {
  /** The studio the iPad is in (the active studio: the Demo Mode realm rule). */
  studio: Studio | null | undefined;
  /** The trainers the app holds; the people named, and bookings placed, among them. */
  trainers: readonly Trainer[];
  /** The person looking: "you" in every sentence. */
  authTrainer: Trainer | null | undefined;
}

export interface OpeningsData {
  studio: Studio | null;
  studioId: string | null;
  studioName: string;
  /** The studio's clock. */
  tz: string;
  now: Date;
  /** The studio's day, "YYYY-MM-DD". */
  today: string;
  /** The studio's bookings come from Mindbody here (or it is the Demo studio): `bookingsKnown`. */
  connected: boolean;
  summary: SummaryState;
  /** The usual week (usual.ts), once the summary is readable. */
  usual: UsualWeek | null;
  weeks: StandingWeeksState;
  marks: MarksState;
  /** Everyone who works here, by name, each with their standing week (never ranked). */
  team: TeamWeekRow[];
  worksHere: (trainerId: string) => boolean;
  /** The trainers bookings are placed among, and their Mindbody staff ids at this studio's site. */
  refs: TrainerRef[];
  staffIds: Record<string, string>;
  /** A trainer's name as the screen says it (present.ts `nameBook`). */
  names: (trainerId: string) => string;
  viewer: Viewer;
}

/**
 * Everything the three parts of Openings, and the Wrap-up's sheet, start
 * from. Reads the summary, the standing weeks and the marks; nothing else.
 */
export function useOpeningsData({ studio, trainers, authTrainer }: OpeningsInput): OpeningsData {
  const studioId = studio?.id ?? null;
  const tz = isValidTimeZone(studio?.timezone) ? (studio!.timezone as string) : DEFAULT_TIME_ZONE;
  const now = useMinuteClock();
  const today = studioTodayKey(now, tz);
  const connected = bookingsKnown(studio ?? null);

  // Not linked: no usual week, so neither read is made (each part says so first).
  const summary = useOpeningsSummary(connected ? studioId : null, now);
  const weeks = useStandingWeeks(studioId);
  const marks = useOpeningsMarks(connected ? studioId : null);

  const usual = useMemo(() => (summary.state === "ok" ? usualWeek(summary.summary) : null), [summary]);

  const team = useMemo(() => teamWeeks(trainers, weeks.docs, studioId).filter((r) => r.onStaff), [trainers, weeks.docs, studioId]);
  const working = useMemo(() => new Set(team.map((r) => r.trainerId)), [team]);
  const worksHere = useMemo(() => (trainerId: string) => working.has(trainerId), [working]);

  const staffIds = useMemo(() => staffIdsAt(trainers, studio?.mindbodySiteId), [trainers, studio?.mindbodySiteId]);
  const refs = useMemo(() => trainerRefs(trainers.map((t) => ({ id: t.id, name: t.fullName })), staffIds), [trainers, staffIds]);

  const names = useMemo(
    () =>
      nameBook(
        peopleOf(
          summary.state === "ok" ? summary.summary : null,
          trainers.map((t) => ({ id: t.id, name: t.fullName ?? "" })),
          weeks.docs,
        ),
      ),
    [summary, trainers, weeks.docs],
  );

  const uid = auth.currentUser?.uid ?? null;
  const viewerTrainerId = authTrainer?.id ?? null;
  const viewer = useMemo<Viewer>(() => ({ trainerId: viewerTrainerId, uid }), [viewerTrainerId, uid]);

  return {
    studio: studio ?? null,
    studioId,
    studioName: studio?.name ?? "This studio",
    tz,
    now,
    today,
    connected,
    summary,
    usual,
    weeks,
    marks,
    team,
    worksHere,
    refs,
    staffIds,
    names,
    viewer,
  };
}
