/**
 * One detail, open for editing.
 *
 * Everything past the sentence itself is optional and stays folded away until
 * asked for. That ordering is the whole design: the body is the only thing
 * that matters, a pillar is a nicety, and a date or a gesture is a bonus. A
 * form that demanded all four would be filled in once and then avoided.
 *
 * Reached from the Life section (add, or tap a detail) and from the teardown
 * sweep (when a capture needs more than a one-tap filing). Never from the
 * tracker mid-set — that is what FordQuickCapture is for.
 */

import { useEffect, useMemo, useState } from "react";
import { Calendar, Gift, Pin, Trash2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  FORD_META,
  FORD_PILLARS,
  GESTURE_STATUS_LABEL,
  toDate,
  type FordEntry,
  type FordGestureStatus,
  type FordOpportunity,
  type FordPillar,
  type FordRecurrence,
} from "./types";
import type { FordAuthor } from "./ford-write";

export interface FordDetailDialogProps {
  open: boolean;
  /** null = a new detail. */
  entry: FordEntry | null;
  /** Pre-selected pillar when adding from inside a pillar card. */
  defaultPillar?: FordPillar | null;
  clientFirstName: string;
  author: FordAuthor;
  onClose: () => void;
  onSave: (values: FordDetailValues) => Promise<void> | void;
  onArchive?: (entry: FordEntry) => Promise<void> | void;
}

export interface FordDetailValues {
  pillar: FordPillar | null;
  body: string;
  subject: string | null;
  isPinned: boolean;
  eventDate: Date | null;
  recurrence: FordRecurrence;
  opportunity: FordOpportunity | null;
}

/** <input type="date"> speaks YYYY-MM-DD and nothing else. */
function toInputDate(value: any): string {
  const d = toDate(value);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parsed as LOCAL midnight. `new Date("2026-11-05")` is UTC and lands on the
 *  4th for every studio in Ohio, which is exactly the class of bug that makes
 *  an anniversary reminder fire a day late. */
function fromInputDate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function FordDetailDialog({
  open,
  entry,
  defaultPillar = null,
  clientFirstName,
  author,
  onClose,
  onSave,
  onArchive,
}: FordDetailDialogProps) {
  const [pillar, setPillar] = useState<FordPillar | null>(defaultPillar);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [dateValue, setDateValue] = useState("");
  const [recurrence, setRecurrence] = useState<FordRecurrence>("none");
  const [showGesture, setShowGesture] = useState(false);
  const [idea, setIdea] = useState("");
  const [status, setStatus] = useState<FordGestureStatus>("idea");
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Re-seed every time the dialog opens on a different detail. Keyed on
  // entry?.id rather than `entry` so a live snapshot update while the dialog
  // is open does not wipe what the trainer is halfway through typing.
  useEffect(() => {
    if (!open) return;
    setPillar(entry?.pillar ?? defaultPillar ?? null);
    setBody(entry?.body ?? "");
    setSubject(entry?.subject ?? "");
    setIsPinned(entry?.isPinned ?? false);
    setDateValue(toInputDate(entry?.eventDate));
    setRecurrence(entry?.recurrence ?? "none");
    setIdea(entry?.opportunity?.idea ?? "");
    setStatus(entry?.opportunity?.status ?? "idea");
    setOutcome(entry?.opportunity?.outcome ?? "");
    setShowGesture(Boolean(entry?.opportunity));
    setConfirmArchive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  const isNew = !entry;
  const readOnly = Boolean(entry?.isLegacy);
  const canSave = body.trim().length > 0 && !saving && !readOnly;

  const opportunity = useMemo<FordOpportunity | null>(() => {
    if (!showGesture || !idea.trim()) return null;
    return {
      idea: idea.trim(),
      status,
      ownerTrainerId: entry?.opportunity?.ownerTrainerId ?? author.id,
      ownerName: entry?.opportunity?.ownerName ?? author.fullName,
      plannedFor: entry?.opportunity?.plannedFor ?? null,
      doneAt: status === "done" ? (entry?.opportunity?.doneAt ?? new Date()) : null,
      outcome: outcome.trim() || null,
    };
  }, [showGesture, idea, status, outcome, entry, author]);

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        pillar,
        body: body.trim(),
        subject: subject.trim() || null,
        isPinned,
        eventDate: fromInputDate(dateValue),
        recurrence: dateValue ? recurrence : "none",
        opportunity,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="ford-scope max-w-lg p-0 gap-0 overflow-hidden">
        <div className="ford-capture p-4">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-extrabold text-[var(--ford-ink)]">
                {isNew ? `Something about ${clientFirstName}` : "This detail"}
              </h2>
              <p className="text-xs text-[var(--ford-ink-muted)]">
                {readOnly
                  ? "Came across from the profile's old events list — read only."
                  : "The sentence is the only part that matters. The rest is optional."}
              </p>
            </div>
            <button
              type="button"
              className="ford-icon-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <textarea
            className="ford-capture__field"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`e.g. "Anniversary is 5 Nov — 40th, always at Giovanni's"`}
            disabled={readOnly}
            autoFocus={isNew}
          />

          {/* ---- the four letters ---- */}
          <div>
            <div className="ford-capture__hint mb-1.5">Which one is it?</div>
            <div className="ford-letters">
              {FORD_PILLARS.map((p) => {
                const meta = FORD_META[p];
                const on = pillar === p;
                return (
                  <button
                    key={p}
                    type="button"
                    className={`ford-letter ford-letter--${p}${on ? " ford-letter--on" : ""}`}
                    onClick={() => setPillar(on ? null : p)}
                    disabled={readOnly}
                    aria-pressed={on}
                  >
                    <span className="ford-letter__glyph">{meta.letter}</span>
                    <span className="ford-letter__label">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---- standing fact vs a moment ---- */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`ford-btn${isPinned ? " ford-btn--primary" : ""}`}
              onClick={() => setIsPinned((v) => !v)}
              disabled={readOnly}
              aria-pressed={isPinned}
            >
              <Pin size={14} />
              {isPinned ? "Always true" : "Make it a standing fact"}
            </button>
            <span className="ford-capture__hint flex-1 min-w-[12rem]">
              {isPinned
                ? "Sits at the top of the pillar, like “wife is Karen”."
                : "A moment in time. It will sit in the stream with its date."}
            </span>
          </div>

          {/* ---- the date ---- */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-[var(--ford-ink-2)]">
              <Calendar size={15} className="text-[var(--ford-ink-muted)]" />
              <span className="sr-only">Date this points at</span>
              <input
                type="date"
                className="ford-btn"
                style={{ paddingInline: "0.6rem" }}
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                disabled={readOnly}
              />
            </label>
            {dateValue ? (
              <button
                type="button"
                className={`ford-btn${recurrence === "annual" ? " ford-btn--primary" : ""}`}
                onClick={() =>
                  setRecurrence((r) => (r === "annual" ? "none" : "annual"))
                }
                disabled={readOnly}
                aria-pressed={recurrence === "annual"}
              >
                Comes round every year
              </button>
            ) : null}
          </div>

          {/* ---- the gesture ---- */}
          {!showGesture ? (
            <button
              type="button"
              className="ford-btn ford-btn--ghost self-start"
              onClick={() => setShowGesture(true)}
              disabled={readOnly}
            >
              <Gift size={15} />
              Do something about it
            </button>
          ) : (
            <div className="rounded-[var(--ford-radius-sm)] border border-[var(--ford-border)] p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Gift size={15} className="text-[var(--ford-ink-muted)]" />
                <span className="text-sm font-bold text-[var(--ford-ink)]">
                  The gesture
                </span>
                <button
                  type="button"
                  className="ford-icon-btn ml-auto"
                  onClick={() => {
                    setShowGesture(false);
                    setIdea("");
                  }}
                  aria-label="Remove the gesture"
                >
                  <X size={15} />
                </button>
              </div>
              <input
                className="ford-capture__field"
                style={{ minHeight: 44 }}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder={`e.g. "Cover the dinner at Giovanni's"`}
                disabled={readOnly}
              />
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(GESTURE_STATUS_LABEL) as FordGestureStatus[]).map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      className={`ford-btn${status === s ? " ford-btn--primary" : ""}`}
                      onClick={() => setStatus(s)}
                      disabled={readOnly}
                      aria-pressed={status === s}
                    >
                      {GESTURE_STATUS_LABEL[s]}
                    </button>
                  ),
                )}
              </div>
              {status === "done" ? (
                <>
                  <textarea
                    className="ford-capture__field"
                    style={{ minHeight: 60 }}
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    placeholder="What actually happened?"
                    disabled={readOnly}
                  />
                  <span className="ford-capture__hint">
                    Worth a sentence — this is what the next trainer reads a
                    year from now.
                  </span>
                </>
              ) : null}
            </div>
          )}

          {/* ---- actions ---- */}
          <div className="ford-capture__actions pt-1">
            {!isNew && onArchive && !readOnly ? (
              <button
                type="button"
                className="ford-btn ford-btn--ghost"
                onClick={async () => {
                  if (!confirmArchive) {
                    setConfirmArchive(true);
                    return;
                  }
                  await onArchive(entry!);
                  onClose();
                }}
              >
                <Trash2 size={15} />
                {confirmArchive ? "Tap again to remove" : "Remove"}
              </button>
            ) : null}
            <button type="button" className="ford-btn" onClick={onClose}>
              {readOnly ? "Close" : "Cancel"}
            </button>
            {!readOnly ? (
              <button
                type="button"
                className="ford-btn ford-btn--primary"
                onClick={submit}
                disabled={!canSave}
              >
                {saving ? "Saving…" : isNew ? "Save it" : "Save changes"}
              </button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
