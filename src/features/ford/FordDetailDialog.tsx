/**
 * One detail, open for editing.
 *
 * Everything past the sentence itself is optional and stays folded away until
 * asked for. That ordering is the whole design: the body is the only thing
 * that matters, a pillar is a nicety, and a date or a gesture is a bonus. A
 * form that demanded all four would be filled in once and then avoided.
 *
 * Reached from the FORD page of Notes & Profile (Remember something, a
 * pillar's Add, a detail, the birthday in Coming up, Add an idea) — the only
 * place it opens. Never from the tracker mid-set — that is what
 * FordQuickCapture is for — and the teardown sweep files with one tap.
 *
 * IT IMPORTS ITS OWN STYLESHEET (client codex, phase 19). It draws with the
 * floor capture sheet's classes in ford.css (`.ford-capture`, `.ford-letter`,
 * `.ford-btn`, `.ford-icon-btn`). A stylesheet arrives with the chunk that
 * imports it, and once the FORD hub that used to import it was gone only the
 * session and Operations chunks did: on an iPad that had not started a
 * session yet, this dialog opened on the profile unstyled. ford-css.test.ts
 * holds every component that draws with ford.css to importing it.
 *
 * A SAVE THAT FAILS KEEPS THE SENTENCE (client codex, Sep 2026). `onSave`
 * may answer `false`; the dialog then stays open with every field as typed
 * and says so. It used to close whatever happened, and the page ignored a
 * failed create, so a refused save lost the sentence without a word.
 *
 * FOLLOW UP NEXT TIME (client codex, AJ's decision 3b): an optional question
 * saved with the detail, which the pillar's Ask next line shows the next
 * trainer until someone asks it. The dialog hands back what is in the box;
 * the page decides whether it CHANGED (`followUpPatch`), so an edit of the
 * sentence never re-dates the question. This dialog is the only place a
 * follow-up is written; the Ask next line's "Asked it" is the only place one
 * is cleared.
 */

import { useEffect, useId, useMemo, useState } from "react";
import { Calendar, Gift, MessageCircleQuestion, Pin, Trash2, X } from "lucide-react";
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
import { FOLLOW_UP_MAX } from "./ask-next";
import "./ford.css";

export interface FordDetailDialogProps {
  open: boolean;
  /** null = a new detail. */
  entry: FordEntry | null;
  /** Pre-selected pillar when adding from inside a pillar card. */
  defaultPillar?: FordPillar | null;
  clientFirstName: string;
  author: FordAuthor;
  onClose: () => void;
  /**
   * Save the detail. Answer `false` when it did not save: the dialog stays
   * open, keeps every field, and says "Not saved — still here, try again".
   */
  onSave: (values: FordDetailValues) => Promise<boolean | void> | boolean | void;
  onArchive?: (entry: FordEntry) => Promise<void> | void;
  /** Seeds a NEW detail — the birthday in Coming up opens one already filled in. */
  initial?: Partial<FordDetailValues>;
  /** A new detail opens with "Do something about it" already showing (Add an idea). */
  openGesture?: boolean;
  /** The example in the empty box. */
  bodyPlaceholder?: string;
}

export interface FordDetailValues {
  pillar: FordPillar | null;
  body: string;
  subject: string | null;
  isPinned: boolean;
  eventDate: Date | null;
  recurrence: FordRecurrence;
  opportunity: FordOpportunity | null;
  /** Follow up next time, as typed (trimmed); null when the box is empty. */
  followUp: string | null;
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
  initial,
  openGesture = false,
  bodyPlaceholder,
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
  const [followUp, setFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [failed, setFailed] = useState(false);
  const followUpId = useId();

  // Re-seed every time the dialog opens on a different detail. Keyed on
  // entry?.id rather than `entry` so a live snapshot update while the dialog
  // is open does not wipe what the trainer is halfway through typing.
  useEffect(() => {
    if (!open) return;
    // An existing detail is seeded from itself; a new one from `initial`.
    const seed = entry ?? initial ?? null;
    setPillar(entry?.pillar ?? initial?.pillar ?? defaultPillar ?? null);
    setBody(seed?.body ?? "");
    setSubject(seed?.subject ?? "");
    setIsPinned(seed?.isPinned ?? false);
    setDateValue(toInputDate(seed?.eventDate));
    setRecurrence(seed?.recurrence ?? "none");
    setIdea(seed?.opportunity?.idea ?? "");
    setStatus(seed?.opportunity?.status ?? "idea");
    setOutcome(seed?.opportunity?.outcome ?? "");
    setFollowUp(seed?.followUp ?? "");
    setShowGesture(Boolean(seed?.opportunity) || (!entry && openGesture));
    setConfirmArchive(false);
    setFailed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  const isNew = !entry;
  const readOnly = Boolean(entry?.isLegacy);
  const canSave = body.trim().length > 0 && !saving && !readOnly;

  const opportunity = useMemo<FordOpportunity | null>(() => {
    if (!showGesture || !idea.trim()) return null;
    // Ownership is a name someone takes, never one handed out (README → The
    // gesture). An idea stays unowned until someone says "I'll do it" — the
    // Delight queue's "Needs an owner" depends on it. A gesture that already
    // has an owner keeps them; one moved to Planned or Done with nobody on it
    // is owned by whoever moved it.
    const existingId = entry?.opportunity?.ownerTrainerId ?? null;
    const takes = status === "planned" || status === "done";
    const owner = existingId
      ? { id: existingId, name: entry?.opportunity?.ownerName ?? null }
      : takes
        ? { id: author.id, name: author.fullName }
        : { id: null, name: null };
    return {
      idea: idea.trim(),
      status,
      ownerTrainerId: owner.id,
      ownerName: owner.name,
      plannedFor: entry?.opportunity?.plannedFor ?? null,
      doneAt: status === "done" ? (entry?.opportunity?.doneAt ?? new Date()) : null,
      outcome: outcome.trim() || null,
    };
  }, [showGesture, idea, status, outcome, entry, author]);

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setFailed(false);
    let saved = false;
    try {
      const result = await onSave({
        pillar,
        body: body.trim(),
        subject: subject.trim() || null,
        isPinned,
        eventDate: fromInputDate(dateValue),
        recurrence: dateValue ? recurrence : "none",
        opportunity,
        followUp: followUp.trim() || null,
      });
      saved = result !== false;
    } catch {
      saved = false;
    } finally {
      setSaving(false);
    }
    if (saved) onClose();
    else setFailed(true);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* 512px on an iPad takes the `sm:` class too (the width note in
          components/ui/dialog.tsx), and a dialog taller than the screen
          scrolls rather than clipping: with the gesture open and the iPad
          keyboard up, Save must stay reachable. */}
      <DialogContent className="ford-scope max-w-lg sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 gap-0">
        <div className="ford-capture p-4">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-[17px] font-extrabold text-[var(--ford-ink)]">
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
            placeholder={bodyPlaceholder ?? `e.g. "Anniversary is 5 Nov — 40th, always at Giovanni's"`}
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

          {/* ---- follow up next time ---- */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={followUpId}
              className="flex items-center gap-1.5 text-sm font-bold text-[var(--ford-ink-2)]"
            >
              <MessageCircleQuestion size={15} className="text-[var(--ford-ink-muted)]" aria-hidden="true" />
              Follow up next time (optional)
            </label>
            <input
              id={followUpId}
              className="ford-capture__field"
              style={{ minHeight: 44 }}
              value={followUp}
              maxLength={FOLLOW_UP_MAX}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder={`e.g. "How did the new boots do on the long walk?"`}
              aria-describedby={`${followUpId}-hint`}
              disabled={readOnly}
            />
            <span id={`${followUpId}-hint`} className="ford-capture__hint">
              The next trainer sees this as the question to ask. It clears once someone asks it.
            </span>
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

          {failed ? (
            <p className="ford-capture__hint" role="alert">
              Not saved — still here, try again.
            </p>
          ) : null}

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
