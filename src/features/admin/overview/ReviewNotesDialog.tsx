/**
 * THE 60-DAY REVIEW — notes that have mattered too long unlooked-at.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): "because nothing expires on
 * its own, the queue would slowly fill with stale notes nobody retires. A
 * note can stay active for 60 days, then it surfaces for review. It does
 * not silently drop." Two answers per note: Still matters (stamps
 * reviewedAt, the clock restarts) or No longer matters (resolves it, as
 * the Notes catalog does). The name opens the client.
 *
 * "No longer" asks for an optional one-line reason first (Oct 2 2026, AJ: "A
 * one-line reason, optional"): written on the note's thread as an update, so
 * the next trainer sees why it closed (client-notes/thread-write.ts,
 * `closeThreadNoLongerMatters`). Leaving it blank closes the note as before.
 */
import { useState } from "react";
import type { JournalAuthor } from "../../../hooks/useClientJournal";
import { closeThreadNoLongerMatters } from "../../client-notes/thread-write";
import { useUnsavedChanges } from "../../unsaved-changes";
import { NotebookPen } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "../../../contexts/ToastContext";
import { reviewJournalEntry } from "../../../hooks/useClientJournal";
import { AdminBadge, AdminButton, AdminEmpty } from "../primitives";
import type { ReviewRow } from "./questions";

export interface ReviewNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ReviewRow[];
  onOpenClient?: (clientId: string) => void;
  /** Who writes the reason (the Auth uid, which the journal rule pins). Null: no reason is asked. */
  author?: JournalAuthor | null;
}

export function ReviewNotesDialog({ open, onOpenChange, rows, onOpenClient, author = null }: ReviewNotesDialogProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  // Answered rows leave the list at once; the next read of the page confirms.
  const [done, setDone] = useState<Set<string>>(new Set());
  const pending = rows.filter((r) => !done.has(r.entryId));
  // The row whose "No longer" is asking why, and the reason typed so far.
  const [asking, setAsking] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  useUnsavedChanges(asking !== null && reason.trim() !== "", "A note's reason");

  const answer = async (row: ReviewRow, stillMatters: boolean) => {
    setBusy(row.entryId);
    try {
      if (stillMatters) await reviewJournalEntry(row.entryId);
      else await closeThreadNoLongerMatters(row.root, author, asking === row.entryId ? reason : null);
      if (asking === row.entryId) {
        setAsking(null);
        setReason("");
      }
      setDone((prev) => new Set(prev).add(row.entryId));
      toastSuccess(stillMatters ? "Kept — it comes up again in 60 days." : "Marked as no longer mattering.");
    } catch {
      toastError("Could not save that. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="adm rounded-2xl max-w-2xl p-6 bg-card border-slate-200 dark:border-slate-800 max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <NotebookPen className="h-5 w-5" aria-hidden />
            Notes to review
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            These have mattered for 60 days or more with no end set. Say whether each still matters; nothing drops on its own.
          </DialogDescription>
        </DialogHeader>
        {pending.length === 0 ? (
          <AdminEmpty title="Nothing left to review." />
        ) : (
          <ul className="adm-ov__rows adm-ov__rows--bordered">
            {pending.map((r) => (
              <li key={r.entryId} className="adm-ov__row adm-ov__row--actions">
                <div className="adm-ov__row-main">
                  <button type="button" className="adm-ov__row-btn" onClick={() => onOpenClient?.(r.clientId)} disabled={!onOpenClient}>
                    <span className="adm-ov__head">
                      <span className="adm-ov__name">{r.name}</span>
                      <AdminBadge tone={r.importance === "critical" ? "alert" : "warn"}>{r.importance === "critical" ? "Critical" : "Heads up"}</AdminBadge>
                      <AdminBadge tone="neutral">{r.days} days</AdminBadge>
                    </span>
                    <span className="adm-ov__sentence">{r.body.length > 200 ? `${r.body.slice(0, 197)}…` : r.body}</span>
                    {r.authorName && <span className="adm-ov__proof">Written by {r.authorName}.</span>}
                  </button>
                  <div className="adm-ov__row-actions">
                    <AdminButton size="sm" variant="primary" busy={busy === r.entryId} onClick={() => void answer(r, true)}>
                      Still matters
                    </AdminButton>
                    <AdminButton
                      size="sm"
                      variant="ghost"
                      busy={busy === r.entryId}
                      onClick={() => {
                        if (!author) return void answer(r, false);
                        setAsking(r.entryId);
                        setReason("");
                      }}
                    >
                      No longer
                    </AdminButton>
                  </div>
                </div>
                {asking === r.entryId ? (
                  <div className="adm-ov__why">
                    <label className="adm-ov__why-label" htmlFor={`why-${r.entryId}`}>
                      Why it no longer matters (optional, one line, written on the note)
                    </label>
                    <input
                      id={`why-${r.entryId}`}
                      className="adm-ov__why-input"
                      type="text"
                      maxLength={200}
                      value={reason}
                      placeholder="Moved to mornings."
                      onChange={(e) => setReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void answer(r, false);
                      }}
                    />
                    <div className="adm-ov__row-actions">
                      <AdminButton size="sm" variant="primary" busy={busy === r.entryId} onClick={() => void answer(r, false)}>
                        Close the note
                      </AdminButton>
                      <AdminButton size="sm" variant="ghost" onClick={() => setAsking(null)}>
                        Cancel
                      </AdminButton>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
