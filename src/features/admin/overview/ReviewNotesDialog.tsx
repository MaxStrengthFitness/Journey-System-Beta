/**
 * THE 60-DAY REVIEW — notes that have mattered too long unlooked-at.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): "because nothing expires on
 * its own, the queue would slowly fill with stale notes nobody retires. A
 * note can stay active for 60 days, then it surfaces for review. It does
 * not silently drop." Two answers per note: Still matters (stamps
 * reviewedAt, the clock restarts) or No longer matters (resolves it, as
 * the Notes catalog does). The name opens the client.
 */
import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "../../../contexts/ToastContext";
import { resolveJournalEntry, reviewJournalEntry } from "../../../hooks/useClientJournal";
import { AdminBadge, AdminButton, AdminEmpty } from "../primitives";
import type { ReviewRow } from "./questions";

export interface ReviewNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ReviewRow[];
  onOpenClient?: (clientId: string) => void;
}

export function ReviewNotesDialog({ open, onOpenChange, rows, onOpenClient }: ReviewNotesDialogProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  // Answered rows leave the list at once; the next read of the page confirms.
  const [done, setDone] = useState<Set<string>>(new Set());
  const pending = rows.filter((r) => !done.has(r.entryId));

  const answer = async (row: ReviewRow, stillMatters: boolean) => {
    setBusy(row.entryId);
    try {
      if (stillMatters) await reviewJournalEntry(row.entryId);
      else await resolveJournalEntry(row.entryId, true);
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
          <DialogTitle className="flex items-center gap-2 text-lg font-bold uppercase tracking-tight text-foreground font-display italic">
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
                    <AdminButton size="sm" variant="ghost" busy={busy === r.entryId} onClick={() => void answer(r, false)}>
                      No longer
                    </AdminButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
