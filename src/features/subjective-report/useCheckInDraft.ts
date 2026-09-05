/**
 * Owns the open check-in draft: loads it, autosaves it, reports where it
 * got to, and closes it.
 *
 * Autosave is debounced rather than manual because the workflow this
 * exists for is "tick one thing and walk away" — a Save button that a
 * trainer has to remember on the way to the next machine is a Save button
 * that loses answers. A pending write is flushed on unmount so leaving the
 * tab mid-edit keeps the last answer.
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
import { loadPreviousCheckIn } from "./checkin-write";
import {
  discardCheckInDraft,
  finalizeCheckIn,
  loadOpenCheckIn,
  saveCheckInDraft,
} from "./checkin-draft";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";

export type CheckInSectionId = string;

export interface CheckInSectionState {
  id: CheckInSectionId;
  title: string;
  /** "The lifestyle topics", "Fuel", "Body", "Life" — the panel groups by this. */
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

const SAVE_DEBOUNCE_MS = 1200;

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
  const [assessment, setAssessment] = useState<SubjectiveAssessment>(() =>
    emptyAssessment({ bodyWeightLbs: null }),
  );
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [previous, setPrevious] = useState<PreviousAssessmentRef | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [finalizing, setFinalizing] = useState(false);

  const timer = useRef<number | null>(null);
  const pending = useRef<{ assessment: SubjectiveAssessment; reviewed: string[] } | null>(null);
  /** Nothing is written until the coach actually touches something. */
  const dirty = useRef(false);

  /* ---- load ---------------------------------------------------------- */
  useEffect(() => {
    if (!enabled || !clientId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    dirty.current = false;

    Promise.all([loadOpenCheckIn(clientId), loadPreviousCheckIn(clientId)])
      .then(([open, prev]) => {
        if (cancelled) return;
        setPrevious(prev);
        if (open) {
          setDraftId(open.id);
          setAssessment(open.assessment);
          setReviewed(open.sectionsReviewed);
          setStartedAt(open.startedAt);
          setSavedAt(open.updatedAt);
        } else {
          setDraftId(null);
          setAssessment({
            ...emptyAssessment({ bodyWeightLbs }),
            completedAt: new Date().toISOString().split("T")[0],
          });
          setReviewed([]);
          setStartedAt(null);
          setSavedAt(null);
        }
      })
      .catch((err) => handleFirestoreError(err, OperationType.GET, "progressReports"))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [clientId, enabled, bodyWeightLbs]);

  /* ---- save ---------------------------------------------------------- */
  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next || !client || !trainer) return;
    pending.current = null;
    setSaveState("saving");
    try {
      const id = await saveCheckInDraft({
        draftId,
        client,
        trainer,
        assessment: next.assessment,
        sectionsReviewed: next.reviewed,
      });
      setDraftId(id);
      setSavedAt(Date.now());
      setStartedAt((s) => s ?? Date.now());
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      handleFirestoreError(err, draftId ? OperationType.UPDATE : OperationType.CREATE, "progressReports");
    }
  }, [client, trainer, draftId]);

  const queue = useCallback(
    (nextAssessment: SubjectiveAssessment, nextReviewed: string[]) => {
      pending.current = { assessment: nextAssessment, reviewed: nextReviewed };
      dirty.current = true;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Never lose the last answer to a tab change.
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (pending.current) void flush();
    },
    [flush],
  );

  const update = useCallback(
    (next: SubjectiveAssessment) => {
      setAssessment(next);
      queue(next, reviewed);
    },
    [queue, reviewed],
  );

  const toggleReviewed = useCallback(
    (sectionId: string) => {
      setReviewed((prev) => {
        const next = prev.includes(sectionId)
          ? prev.filter((s) => s !== sectionId)
          : [...prev, sectionId];
        queue(assessment, next);
        return next;
      });
    },
    [assessment, queue],
  );

  const saveNow = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    await flush();
  }, [flush]);

  /* ---- where it got to ------------------------------------------------ */
  const sections = useMemo<CheckInSectionState[]>(() => {
    const mark = (
      id: string,
      title: string,
      band: string,
      isComplete: boolean,
      isPartial: boolean,
    ): CheckInSectionState => {
      const isReviewed = reviewed.includes(id);
      return {
        id,
        title,
        band,
        isComplete,
        isReviewed,
        isPartial: isPartial && !isComplete,
        isDone: isComplete || isReviewed,
      };
    };

    const cats = SUBJECTIVE_CATEGORIES.map((def) => {
      const score = scoreCategory(def.key, assessment.answers, assessment.scaleVersion);
      return mark(def.key, def.title, "Lifestyle", score.isComplete, score.answeredCount > 0);
    });

    const p = assessment.protein;
    const h = assessment.hydration;
    return [
      ...cats,
      mark(
        "protein",
        "Protein compliance",
        "Fuel",
        p.daysPerWeekOnTarget !== null,
        p.typicalGramsPerDay !== null || p.primarySources.length > 0,
      ),
      mark(
        "hydration",
        "Hydration",
        "Fuel",
        h.daysPerWeekOnTarget !== null,
        h.typicalPerDay !== null || h.primarySources.length > 0,
      ),
      // Pain and stress can be legitimately empty, so only an explicit
      // review closes them. "Nothing to report" is an answer; a blank list
      // on its own is not.
      mark("pain", "Pain map", "Body", false, assessment.painMap.length > 0),
      mark("stress", "Stress anchors", "Life", false, assessment.stressAnchors.length > 0),
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
      await finalizeCheckIn({ draftId, client, assessment, previous });
      setDraftId(null);
      setAssessment({
        ...emptyAssessment({ bodyWeightLbs }),
        completedAt: new Date().toISOString().split("T")[0],
      });
      setReviewed([]);
      setStartedAt(null);
      setSavedAt(null);
      setSaveState("idle");
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "progressReports");
      return false;
    } finally {
      setFinalizing(false);
    }
  }, [draftId, client, assessment, previous, flush, bodyWeightLbs]);

  const discard = useCallback(async () => {
    if (!draftId) return;
    try {
      if (timer.current) window.clearTimeout(timer.current);
      pending.current = null;
      await discardCheckInDraft(draftId);
      setDraftId(null);
      setAssessment({
        ...emptyAssessment({ bodyWeightLbs }),
        completedAt: new Date().toISOString().split("T")[0],
      });
      setReviewed([]);
      setStartedAt(null);
      setSavedAt(null);
      setSaveState("idle");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "progressReports");
    }
  }, [draftId, bodyWeightLbs]);

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
  };
}
