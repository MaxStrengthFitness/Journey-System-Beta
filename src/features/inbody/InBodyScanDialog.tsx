/**
 * Add or correct one InBody scan — typed from the printout, in the
 * printout's order. About two minutes per scan.
 *
 * The four headline numbers are required; everything else is optional and
 * tucked behind "More from the printout" and "Segmental lean". Numbers the
 * sheet ties together (percent body fat = fat mass ÷ weight) are checked, so
 * a typo shows up here rather than on next quarter's trend line.
 */

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Scale, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "../../contexts/ToastContext";
import { studioTodayKey } from "../../lib/studio-time";
import type { Client, Trainer } from "../../types";
import {
  MEASURE_FIELDS,
  SEGMENT_LABELS,
  checkDraft,
  draftFromScan,
  emptyDraft,
  parseNumber,
  scanDateLabel,
  type InBodyDraft,
  type MeasureField,
} from "./scans";
import { deleteInBodyScan, saveInBodyScan } from "./useInBodyScans";
import { INBODY_SEGMENTS, type InBodyScan } from "./types";

const LABEL = "text-[11px] font-bold uppercase tracking-widest text-muted-foreground";
const INPUT =
  "h-11 w-full rounded-xl border bg-white px-3 text-sm font-semibold tabular-nums text-slate-900 outline-none " +
  "focus:border-sky-500 dark:bg-slate-900 dark:text-slate-100";
const INPUT_OK = "border-border";
const INPUT_BAD = "border-rose-400 dark:border-rose-500";
const PROBLEM = "text-[11px] font-semibold text-rose-600 dark:text-rose-400";

export interface InBodyScanDialogProps {
  open: boolean;
  onClose: () => void;
  client: Client;
  /** The scan being corrected, or null to add one. */
  scan: InBodyScan | null;
  /** Every scan on file, for the summary and "is this the newest?". */
  scans: InBodyScan[];
  authTrainer: Pick<Trainer, "fullName"> | null;
  canRemove: boolean;
}

export function InBodyScanDialog({ open, onClose, client, scan, scans, authTrainer, canRemove }: InBodyScanDialogProps) {
  const today = studioTodayKey();
  const { success: toastSuccess, error: toastError } = useToast();
  const [draft, setDraft] = useState<InBodyDraft>(() => emptyDraft(today));
  const [attempted, setAttempted] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showSegments, setShowSegments] = useState(false);
  const [updateWeight, setUpdateWeight] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = scan ? draftFromScan(scan) : emptyDraft(today);
    setDraft(next);
    setAttempted(false);
    setShowMore(MEASURE_FIELDS.some((f) => f.group === "more" && next.values[f.key] !== ""));
    setShowSegments(INBODY_SEGMENTS.some((s) => next.segments[s].lb !== ""));
    setUpdateWeight(true);
    setConfirmRemove(false);
    // Keyed on the scan's id, not the object: the scans listener hands out
    // new objects on every change, and that must not wipe a correction in
    // progress. `today` is left out too — a dialog open over midnight keeps
    // the date it opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scan?.id]);

  const check = useMemo(() => checkDraft(draft, today), [draft, today]);
  const firstName = client.firstName || "this client";

  // Offer to update the profile's Weight only for the newest scan, and only
  // when it would change something.
  const newest = scans.filter((s) => s.id !== scan?.id).every((s) => s.testedAt <= draft.testedAt);
  const typedWeight = parseNumber(draft.values.weightLb);
  const roundedWeight = typeof typedWeight === "number" ? String(Math.round(typedWeight)) : null;
  const weightOffer =
    newest && roundedWeight !== null && !check.problems.weightLb && roundedWeight !== String(client.weight ?? "").trim()
      ? roundedWeight
      : null;

  const setValue = (key: MeasureField["key"], v: string) =>
    setDraft((d) => ({ ...d, values: { ...d.values, [key]: v } }));

  const problemFor = (key: string, typed: string) =>
    // An empty required field only nags after a save attempt.
    attempted || typed.trim() !== "" ? check.problems[key] : undefined;

  const save = async () => {
    setAttempted(true);
    if (!check.result || !client.id) return;
    setSaving(true);
    try {
      await saveInBodyScan({
        clientId: client.id,
        scanId: scan?.id ?? null,
        testedAt: check.result.testedAt,
        device: check.result.device,
        measures: check.result.measures,
        studioId: client.homeStudioId ?? "",
        enteredByName: authTrainer?.fullName ?? "",
        existing: scans,
        updateProfileWeight: Boolean(weightOffer && updateWeight),
      });
      toastSuccess(scan ? "Scan corrected." : `InBody scan saved for ${firstName}.`);
      onClose();
    } catch (err: any) {
      console.warn("[inbody] save failed:", err);
      toastError(
        err?.code === "permission-denied"
          ? "Only trainers at this client's studio can record scans."
          : "Couldn't save the scan. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!scan?.id || !client.id) return;
    setSaving(true);
    try {
      await deleteInBodyScan(client.id, scan.id, scans);
      toastSuccess("Scan removed.");
      onClose();
    } catch (err: any) {
      console.warn("[inbody] delete failed:", err);
      toastError(
        err?.code === "permission-denied"
          ? "Only whoever entered this scan, or a studio leader, can remove it."
          : "Couldn't remove the scan. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const numberInput = (f: MeasureField) => {
    const typed = draft.values[f.key];
    const problem = problemFor(f.key, typed);
    const id = `inbody-${f.key}`;
    return (
      <div key={f.key} className="flex min-w-0 flex-col gap-1.5">
        <label className={LABEL} htmlFor={id}>
          {f.label}
          {f.required ? "" : " (optional)"}
        </label>
        <div className="relative">
          <input
            id={id}
            inputMode="decimal"
            enterKeyHint="next"
            autoComplete="off"
            value={typed}
            onChange={(e) => setValue(f.key, e.target.value)}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? `${id}-problem` : undefined}
            className={cn(INPUT, problem ? INPUT_BAD : INPUT_OK, f.unit && "pr-14")}
          />
          {f.unit && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-bold text-muted-foreground">
              {f.unit}
            </span>
          )}
        </div>
        {problem && (
          <p id={`${id}-problem`} className={PROBLEM}>
            {problem}
          </p>
        )}
      </div>
    );
  };

  const toggle = (expanded: boolean, onClick: () => void, label: string, hint: string) => (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border px-3 text-left text-[12px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
    >
      {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      <span>{label}</span>
      <span className="ml-auto text-[10.5px] font-semibold normal-case tracking-normal text-muted-foreground">{hint}</span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Scale className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            {scan ? `Correct the ${scanDateLabel(scan.testedAt, today)} scan` : `InBody scan for ${firstName}`}
          </DialogTitle>
          <DialogDescription>
            Type the numbers from the printout. Weight, skeletal muscle mass, body fat mass and percent body
            fat are required; the rest are optional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className={LABEL} htmlFor="inbody-date">
                Test date
              </label>
              <input
                id="inbody-date"
                type="date"
                max={today}
                value={draft.testedAt}
                onChange={(e) => setDraft((d) => ({ ...d, testedAt: e.target.value }))}
                className={cn(INPUT, check.problems.testedAt ? INPUT_BAD : INPUT_OK)}
              />
              {check.problems.testedAt && <p className={PROBLEM}>{check.problems.testedAt}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={LABEL} htmlFor="inbody-device">
                Device
              </label>
              <input
                id="inbody-device"
                maxLength={40}
                value={draft.device}
                onChange={(e) => setDraft((d) => ({ ...d, device: e.target.value }))}
                className={cn(INPUT, INPUT_OK)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {MEASURE_FIELDS.filter((f) => f.group === "headline").map(numberInput)}
          </div>

          {check.warnings.length > 0 && (
            <div className="space-y-1 rounded-xl bg-amber-50 p-3 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              {check.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}

          {toggle(showMore, () => setShowMore((v) => !v), "More from the printout", "Water, lean mass, BMR, SMI")}
          {showMore && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {MEASURE_FIELDS.filter((f) => f.group === "more").map(numberInput)}
            </div>
          )}

          {toggle(showSegments, () => setShowSegments((v) => !v), "Segmental lean", "Pounds and the % under each bar")}
          {showSegments && (
            <div className="space-y-2">
              {INBODY_SEGMENTS.map((seg) => {
                const s = draft.segments[seg];
                const problem = attempted || s.lb || s.pct ? check.problems[seg] : undefined;
                const setSeg = (patch: Partial<typeof s>) =>
                  setDraft((d) => ({ ...d, segments: { ...d.segments, [seg]: { ...d.segments[seg], ...patch } } }));
                return (
                  <div key={seg} className="grid grid-cols-[6.5rem_1fr_1fr] items-start gap-2">
                    <span className="pt-3 text-[12px] font-bold text-slate-600 dark:text-slate-300">{SEGMENT_LABELS[seg]}</span>
                    <div className="relative">
                      <input
                        inputMode="decimal"
                        aria-label={`${SEGMENT_LABELS[seg]} lean mass, lb`}
                        value={s.lb}
                        onChange={(e) => setSeg({ lb: e.target.value })}
                        className={cn(INPUT, problem ? INPUT_BAD : INPUT_OK, "pr-10")}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-bold text-muted-foreground">
                        lb
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        inputMode="decimal"
                        aria-label={`${SEGMENT_LABELS[seg]}, percent`}
                        value={s.pct}
                        onChange={(e) => setSeg({ pct: e.target.value })}
                        className={cn(INPUT, problem ? INPUT_BAD : INPUT_OK, "pr-10")}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-bold text-muted-foreground">
                        %
                      </span>
                    </div>
                    {problem && <p className={cn(PROBLEM, "col-span-3")}>{problem}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {weightOffer && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={updateWeight}
                onChange={(e) => setUpdateWeight(e.target.checked)}
                className="h-5 w-5 accent-sky-600"
              />
              <span>
                Also set the profile's weight to {weightOffer} lb
                <span className="ml-1 font-normal text-muted-foreground">
                  (now {String(client.weight ?? "").trim() || "blank"})
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {scan && canRemove ? (
            confirmRemove ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-semibold text-rose-700 dark:text-rose-300">
                  Remove this scan for good?
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  disabled={saving}
                  className="min-h-11 rounded-xl border border-slate-300 px-4 text-[12px] font-black uppercase tracking-widest text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={saving}
                  className="min-h-11 rounded-xl bg-rose-600 px-4 text-[12px] font-black uppercase tracking-widest text-white disabled:opacity-50"
                >
                  {saving ? "Removing…" : "Remove"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                disabled={saving}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[12px] font-black uppercase tracking-widest text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Remove scan
              </button>
            )
          ) : (
            <span />
          )}
          {!confirmRemove && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="min-h-11 rounded-xl border border-slate-300 px-5 text-[12px] font-black uppercase tracking-widest text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="min-h-11 rounded-xl bg-cta-strong px-6 text-[12px] font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : scan ? "Save correction" : "Save scan"}
              </button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
