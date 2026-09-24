/**
 * Owns the open check-in draft: loads it, autosaves it, reports where it
 * got to, and closes it.
 *
 * Autosave is debounced rather than manual because the workflow this
 * exists for is "tick one thing and walk away" — a Save button that a
 * trainer has to remember on the way to the next machine is a Save button
 * that loses answers. A pending write is flushed on unmount so leaving the
 * tab mid-edit keeps the last answer.
 *
 * THE HISTORY (Assessment round, Sep 2026). The hook also loads the client's
 * saved assessments (one bounded read, the same shape `loadPreviousCheckIn`
 * used — it replaces that read rather than adding one) and keeps the draft's
 * change log: every edit that moves an area's number appends to
 * `assessment.changeLog`, which autosave writes with the rest of the block.
 * See assessment-history.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Client, Machine, Trainer } from "../../types";
import type { SubjectiveAssessment } from "./types";
import { SUBJECTIVE_CATEGORIES } from "./questions";
import {
  answeredCount,
  emptyAssessment,
  parseWeightLbs,
  scoreCategory,
  type PreviousAssessmentRef,
} from "./scoring";
import { loadAssessmentHistory } from "./checkin-write";
import {
  discardCheckInDraft,
  finalizeCheckIn,
  loadOpenCheckIn,
  saveCheckInDraft,
} from "./checkin-draft";
import {
  EMPTY_BASELINE,
  baselineFromHistory,
  previousFromHistory,
  recordChanges,
  withChangeNote,
  type AssessmentHistory,
  type LivingBaseline,
} from "./assessment-history";
import { pillarOf, sectionTitle } from "./pillars";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import { studioTodayKey } from "../../lib/studio-time";

export type CheckInSectionId = string;

export interface CheckInSectionState {
  id: CheckInSectionId;
  title: string;
  /** The pillar the area belongs to ("Recovery & Fuel", …) — the panel groups by pillar. */
  band: string;
  /** Data says this section is answered. */
  isComplete: boolean;
  /** The coach explicitly settled it (covers "no pain anywhere"). */
  isReviewed: boolean;
  /** Something is in it, but not all of it. */
  isPartial: boolean;
  /** Complete or reviewed — what the progress count runs on. */
  isDone: boolean;
}

export type SaveState = "idle" | "saving" | "saved" | "error";
export type HistoryStatus = "loading" | "ready" | "error";

const SAVE_DEBOUNCE_MS = 1200;

const freshAssessment = (bodyWeightLbs: number | null): SubjectiveAssessment => ({
  ...emptyAssessment({ bodyWeightLbs }),
  completedAt: studioTodayKey(),
});

export function useCheckInDraft(opts: {
  client: Client | null;
  trainer: Trainer | null;
  machines: Machine[];
  enabled?: boolean;
}) {
  const { client, trainer, enabled = true } = opts;
  const clientId = client?.id ?? null;
  const bodyWeightLbs = useMemo(() => parseWeightLbs(client?.weight), [client?.weight]);

  const [loading, setLoading] = useState(true);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [assessment, setAssessmentState] = useState<SubjectiveAssessment>(() =>
    emptyAssessment({ bodyWeightLbs: null }),
  );
  const [reviewed, setReviewedState] = useState<string[]>([]);
  const [previous, setPrevious] = useState<PreviousAssessmentRef | null>(null);
  const [history, setHistory] = useState<AssessmentHistory | null>(null);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("loading");
  const [baseline, setBaseline] = useState<LivingBaseline>(EMPTY_BASELINE);
  const [draftTrainerName, setDraftTrainerName] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [finalizing, setFinalizing] = useState(false);

  const timer = useRef<number | null>(null);
  const pending = useRef<{ assessment: SubjectiveAssessment; reviewed: string[] } | null>(null);

  /**
   * `flush` MUST be identity-stable, and everything it reads therefore lives
   * in a ref rather than a dependency.
   *
   * The version that closed over `draftId` created duplicate drafts: the
   * debounce timer captures whichever `flush` existed when the coach tapped,
   * and until the first addDoc resolves that closure still sees
   * `draftId === null` — so a second tap 100ms later wrote a SECOND draft
   * document. `loadOpenCheckIn` then only ever finds the newest of them and
   * the first is orphaned with a coach's answers in it.
   */
  const draftIdRef = useRef<string | null>(null);
  const clientRef = useRef<Client | null>(client);
  const trainerRef = useRef<Trainer | null>(trainer);
  /** Serialises writes so two flushes can never race the same document. */
  const inFlight = useRef<Promise<void> | null>(null);
  /**
   * The latest values, for the change log. Two quick taps can both run
   * before React re-renders; the log has to compare against the second-to-
   * last edit, not whatever the last render happened to close over.
   */
  const assessmentRef = useRef<SubjectiveAssessment>(assessment);
  const reviewedRef = useRef<string[]>(reviewed);
  const baselineRef = useRef<LivingBaseline>(EMPTY_BASELINE);
  const historyKnownRef = useRef(false);

  clientRef.current = client;
  trainerRef.current = trainer;

  const setAssessment = useCallback((next: SubjectiveAssessment) => {
    assessmentRef.current = next;
    setAssessmentState(next);
  }, []);
  const setReviewed = useCallback((next: string[]) => {
    reviewedRef.current = next;
    setReviewedState(next);
  }, []);
  const applyHistory = useCallback((h: AssessmentHistory | null) => {
    const base = baselineFromHistory(h);
    baselineRef.current = base;
    historyKnownRef.current = h !== null;
    setBaseline(base);
    setHistory(h);
    setPrevious(previousFromHistory(h));
  }, []);

  /* ---- load ---------------------------------------------------------- */
  useEffect(() => {
    if (!enabled || !clientId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setHistoryStatus("loading");
    applyHistory(null);

    // Settled separately: a history that fails to load must not also lose
    // the open draft (answering then would start a second one). The draft
    // still waits for the history, so the first edit already has its
    // baseline to measure "from" against.
    const historyRead = loadAssessmentHistory(clientId).then(
      (hist) => {
        if (cancelled) return;
        applyHistory(hist);
        setHistoryStatus("ready");
      },
      (err) => {
        // A failed read is "unknown", never "no history".
        if (!cancelled) setHistoryStatus("error");
        handleFirestoreError(err, OperationType.GET, "progressReports");
      },
    );

    Promise.all([loadOpenCheckIn(clientId), historyRead])
      .then(([open]) => {
        if (cancelled) return;
        if (open) {
          draftIdRef.current = open.id;
          setDraftId(open.id);
          setAssessment(open.assessment);
          setReviewed(open.sectionsReviewed);
          setStartedAt(open.startedAt);
          setSavedAt(open.updatedAt);
          setDraftTrainerName(open.trainerName ?? null);
        } else {
          draftIdRef.current = null;
          setDraftId(null);
          setAssessment(freshAssessment(bodyWeightLbs));
          setReviewed([]);
          setStartedAt(null);
          setSavedAt(null);
          setDraftTrainerName(null);
        }
      })
      .catch((err) => handleFirestoreError(err, OperationType.GET, "progressReports"))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [clientId, enabled, bodyWeightLbs, applyHistory, setAssessment, setReviewed]);

  /* ---- save ---------------------------------------------------------- */
  const flush = useCallback(async (): Promise<void> => {
    // Never overlap: the first write is what decides the document id.
    if (inFlight.current) await inFlight.current.catch(() => {});
    const next = pending.current;
    const c = clientRef.current;
    const t = trainerRef.current;
    if (!next || !c || !t) return;
    pending.current = null;
    setSaveState("saving");

    const run = (async () => {
      const existing = draftIdRef.current;
      try {
        const id = await saveCheckInDraft({
          draftId: existing,
          client: c,
          trainer: t,
          assessment: next.assessment,
          sectionsReviewed: next.reviewed,
        });
        draftIdRef.current = id;
        setDraftId(id);
        setSavedAt(Date.now());
        setStartedAt((prev) => prev ?? Date.now());
        if (!existing) setDraftTrainerName((prev) => prev ?? t.fullName ?? null);
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
        handleFirestoreError(
          err,
          existing ? OperationType.UPDATE : OperationType.CREATE,
          "progressReports",
        );
      }
    })();

    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, []);

  const queue = useCallback(
    (nextAssessment: SubjectiveAssessment, nextReviewed: string[]) => {
      pending.current = { assessment: nextAssessment, reviewed: nextReviewed };

      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Never lose the last answer to a tab change. Keyed on [flush], which is
  // identity-stable: keyed on client or trainer this cleanup ran on every
  // identity change, cancelling the debounce and firing the write early —
  // which was the other half of the duplicate-draft bug.
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (pending.current) void flush();
    },
    [flush],
  );

  /** The change log after moving from the current state to `next`. */
  const logged = useCallback(
    (next: SubjectiveAssessment, nextReviewed: string[]): SubjectiveAssessment => {
      const prev = assessmentRef.current;
      const t = trainerRef.current;
      const changeLog = recordChanges({
        prev,
        next,
        prevReviewed: reviewedRef.current,
        nextReviewed,
        baseline: baselineRef.current,
        baselineKnown: historyKnownRef.current,
        at: new Date(),
        byId: t?.id ?? null,
        byName: t?.fullName ?? null,
      });
      if (changeLog === next.changeLog) return next;
      if (!changeLog.length && !next.changeLog) return next;
      return { ...next, changeLog };
    },
    [],
  );

  const update = useCallback(
    (next: SubjectiveAssessment) => {
      const withLog = logged(next, reviewedRef.current);
      setAssessment(withLog);
      queue(withLog, reviewedRef.current);
    },
    [logged, queue, setAssessment],
  );

  // Computed outside the updater: a setState updater must be pure, and
  // `queue` schedules a timer and mutates refs. StrictMode double-invokes
  // updaters, which would have armed the save twice.
  const toggleReviewed = useCallback(
    (sectionId: string) => {
      const current = reviewedRef.current;
      const next = current.includes(sectionId)
        ? current.filter((s) => s !== sectionId)
        : [...current, sectionId];
      // "Nothing to report" on pain is an answer (no active pain), so it can
      // move the pain number and belongs in the log.
      const withLog = logged(assessmentRef.current, next);
      if (withLog !== assessmentRef.current) setAssessment(withLog);
      setReviewed(next);
      queue(withLog, next);
    },
    [logged, queue, setAssessment, setReviewed],
  );

  /** Attach (or clear) the one-line "why" on a change still in the draft. */
  const setChangeNote = useCallback(
    (categoryId: string, at: string, note: string) => {
      const a = assessmentRef.current;
      if (!a.changeLog?.some((c) => c.categoryId === categoryId && c.at === at)) return;
      const next = { ...a, changeLog: withChangeNote(a.changeLog, categoryId, at, note) };
      setAssessment(next);
      queue(next, reviewedRef.current);
    },
    [queue, setAssessment],
  );

  const saveNow = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    await flush();
  }, [flush]);

  /* ---- where it got to ------------------------------------------------ */
  const sections = useMemo<CheckInSectionState[]>(() => {
    const mark = (id: string, isComplete: boolean, isPartial: boolean): CheckInSectionState => {
      const isReviewed = reviewed.includes(id);
      return {
        id,
        title: sectionTitle(id),
        band: pillarOf(id)?.title ?? "",
        isComplete,
        isReviewed,
        isPartial: isPartial && !isComplete,
        isDone: isComplete || isReviewed,
      };
    };

    const cats = SUBJECTIVE_CATEGORIES.map((def) => {
      const score = scoreCategory(def.key, assessment.answers, assessment.scaleVersion);
      return mark(def.key, score.isComplete, score.answeredCount > 0);
    });

    const p = assessment.protein;
    const h = assessment.hydration;
    return [
      ...cats,
      mark(
        "protein",
        p.daysPerWeekOnTarget !== null,
        p.typicalGramsPerDay !== null || p.primarySources.length > 0,
      ),
      mark(
        "hydration",
        h.daysPerWeekOnTarget !== null,
        h.typicalPerDay !== null || h.primarySources.length > 0,
      ),
      // Pain and stress can be legitimately empty, so only an explicit
      // review closes them. "Nothing to report" is an answer; a blank list
      // on its own is not.
      mark("pain", false, assessment.painMap.length > 0),
      mark("stress", false, assessment.stressAnchors.length > 0),
    ];
  }, [assessment, reviewed]);

  const doneCount = sections.filter((s) => s.isDone).length;
  const firstOpenSection = sections.find((s) => !s.isDone)?.id ?? null;

  const finalize = useCallback(async () => {
    if (!draftId || !client) return false;
    setFinalizing(true);
    try {
      if (timer.current) window.clearTimeout(timer.current);
      if (pending.current) await flush();
      const current = assessmentRef.current;
      const stored = await finalizeCheckIn({ draftId, client, assessment: current, previous });

      // The saved assessment joins the history here rather than by reading
      // it back, and becomes "last time" for the next draft.
      if (history) {
        applyHistory({
          ...history,
          reports: [
            {
              id: draftId,
              date: stored.completedAt || studioTodayKey(),
              savedAtMs: Date.now(),
              trainerId: trainer?.id ?? null,
              trainerName: draftTrainerName ?? trainer?.fullName ?? null,
              enteredBy: stored.enteredBy ?? null,
              assessment: stored,
              sectionsReviewed: [...reviewedRef.current],
            },
            ...history.reports.filter((r) => r.id !== draftId),
          ],
        });
      }

      draftIdRef.current = null;
      setDraftId(null);
      setAssessment(freshAssessment(bodyWeightLbs));
      setReviewed([]);
      setStartedAt(null);
      setSavedAt(null);
      setDraftTrainerName(null);
      setSaveState("idle");
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "progressReports");
      return false;
    } finally {
      setFinalizing(false);
    }
  }, [
    draftId,
    client,
    trainer,
    previous,
    history,
    draftTrainerName,
    flush,
    bodyWeightLbs,
    applyHistory,
    setAssessment,
    setReviewed,
  ]);

  const discard = useCallback(async () => {
    if (!draftId) return;
    try {
      if (timer.current) window.clearTimeout(timer.current);
      pending.current = null;
      await discardCheckInDraft(draftId);
      draftIdRef.current = null;
      setDraftId(null);
      setAssessment(freshAssessment(bodyWeightLbs));
      setReviewed([]);
      setStartedAt(null);
      setSavedAt(null);
      setDraftTrainerName(null);
      setSaveState("idle");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "progressReports");
    }
  }, [draftId, bodyWeightLbs, setAssessment, setReviewed]);

  return {
    loading,
    draftId,
    hasDraft: !!draftId,
    assessment,
    update,
    previous,
    bodyWeightLbs,
    sections,
    doneCount,
    totalSections: sections.length,
    firstOpenSection,
    answered: answeredCount(assessment),
    reviewed,
    toggleReviewed,
    startedAt,
    savedAt,
    saveState,
    saveNow,
    finalize,
    finalizing,
    discard,
    /* history (Assessment round) */
    history,
    historyStatus,
    /** What the saved assessments already say, per statement and area. */
    baseline,
    /** Who opened the open draft, when known. */
    draftTrainerName,
    setChangeNote,
  };
}

/**
 * Everything the hook hands back. Exported (client codex) so one screen can
 * own the ONE draft for a client and pass it to the Pulse panel through the
 * panel's `draft` prop, instead of the panel loading a second copy — two
 * drafts of one client autosaving side by side is the duplicate-draft bug
 * this hook exists to prevent.
 */
export type CheckInDraftState = ReturnType<typeof useCheckInDraft>;
