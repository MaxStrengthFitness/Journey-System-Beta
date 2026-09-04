/**
 * Run the 90-day check-in on its own — from the pre-session briefing or the
 * post-session screen — without building the whole progress report.
 *
 * Full-screen sheet (the form is long; a centred modal would be a scroll
 * inside a scroll on an iPad). Saves as a check-in-only report; see
 * checkin-write.ts for why. Self-contained: loads its own "previous",
 * owns its own state, and tells the parent nothing except "saved".
 */
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { HeartPulse, X } from "lucide-react";
import type { Client, Machine, Trainer } from "../../types";
import type { SubjectiveAssessment } from "./types";
import { SubjectiveStep } from "./SubjectiveStep";
import { SubjectiveDashboard } from "./SubjectiveDashboard";
import { answeredCount, emptyAssessment, parseWeightLbs, type PreviousAssessmentRef } from "./scoring";
import { loadPreviousCheckIn, saveQuickCheckIn, type CheckInOrigin } from "./checkin-write";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import { fmtDate } from "./ui";

export interface QuickCheckInDialogProps {
  open: boolean;
  onClose: () => void;
  client: Client;
  trainer: Trainer | null;
  machines: Machine[];
  origin: CheckInOrigin;
  sessionId?: string | null;
  /** Called with the new report id after a successful save. */
  onSaved?: (reportId: string) => void;
}

export function QuickCheckInDialog({
  open,
  onClose,
  client,
  trainer,
  machines,
  origin,
  sessionId,
  onSaved,
}: QuickCheckInDialogProps) {
  const bodyWeight = useMemo(() => parseWeightLbs(client.weight), [client.weight]);
  const [assessment, setAssessment] = useState<SubjectiveAssessment>(() =>
    emptyAssessment({ bodyWeightLbs: bodyWeight }),
  );
  const [previous, setPrevious] = useState<PreviousAssessmentRef | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCoachView, setShowCoachView] = useState(false);

  // Fresh form + fresh "previous" every time the sheet opens.
  useEffect(() => {
    if (!open || !client.id) return;
    let cancelled = false;
    setAssessment({
      ...emptyAssessment({ bodyWeightLbs: bodyWeight }),
      completedAt: new Date().toISOString().split("T")[0],
    });
    setShowCoachView(false);
    loadPreviousCheckIn(client.id)
      .then((p) => !cancelled && setPrevious(p))
      .catch((err) => handleFirestoreError(err, OperationType.GET, "progressReports"));
    return () => {
      cancelled = true;
    };
  }, [open, client.id, bodyWeight]);

  // Keep the page behind from scrolling while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const answered = answeredCount(assessment);
  const canSave = !!trainer && (answered > 0 || assessment.painMap.length > 0 || assessment.stressAnchors.length > 0);

  const handleSave = async () => {
    if (!trainer || !client.id) return;
    setSaving(true);
    try {
      const id = await saveQuickCheckIn({ client, trainer, assessment, previous, origin, sessionId });
      onSaved?.(id);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "progressReports");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-slate-100 dark:bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-label="90-day check-in"
    >
      {/* header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0A548B]/10 text-[#0A548B] dark:bg-[#6fb1e6]/15 dark:text-[#6fb1e6]">
            <HeartPulse className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-black uppercase italic tracking-tight text-slate-900 dark:text-white">
              90-Day Check-In · {client.firstName} {client.lastName}
            </h2>
            <p className="truncate text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {origin === "pre_session" ? "Before the session" : origin === "post_session" ? "After the session" : "Standalone"}
              {" · "}
              {previous ? `compared with ${fmtDate(previous.date)}` : "first check-in"}
              {" · "}
              {answered}/24 answered
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCoachView((v) => !v)}
            className="hidden h-10 rounded-xl border border-slate-300 px-3 text-[11px] font-black uppercase tracking-wider text-slate-700 sm:inline-flex sm:items-center dark:border-slate-700 dark:text-slate-200"
            aria-expanded={showCoachView}
          >
            {showCoachView ? "Hide coach view" : "Coach view"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close without saving"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="mx-auto max-w-5xl space-y-4">
          {showCoachView && (
            <div className="rounded-2xl bg-white p-4 dark:bg-slate-900">
              <SubjectiveDashboard assessment={assessment} previous={previous} machines={machines} />
            </div>
          )}
          <SubjectiveStep
            value={assessment}
            onChange={setAssessment}
            previous={previous}
            machines={machines}
            clientId={client.id}
            clientFirstName={client.firstName}
            bodyWeightLbs={bodyWeight}
          />
        </div>
      </div>

      {/* footer */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="hidden min-w-0 flex-1 text-[12px] leading-snug text-slate-500 sm:block dark:text-slate-400">
          Saves as a check-in on {client.firstName}'s journal. Open it later and press{" "}
          <b>Build the full report</b> to turn it into the 90-day progress report.
        </p>
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-2xl border border-slate-300 px-5 text-[12px] font-black uppercase tracking-widest text-slate-700 sm:flex-none dark:border-slate-700 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="h-12 flex-1 rounded-2xl bg-[#F06C22] px-6 text-[12px] font-black uppercase tracking-widest text-white shadow-lg shadow-[#F06C22]/20 disabled:opacity-50 sm:flex-none"
          >
            {saving ? "Saving…" : "Save check-in"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
