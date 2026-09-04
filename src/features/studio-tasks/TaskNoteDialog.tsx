import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TaskRow } from "./types";

/**
 * Close a task with a note, and optionally flag a problem.
 *
 * WHY FLAGGING DOES NOT WRITE THE ROSTER
 * A flagged maintenance task is exactly the signal that should put a machine
 * into `rosterStatus: 'maintenance'` — but the roster is manager-write only
 * (it carries `overrides`, which can rewrite clinical warnings), and the person
 * who finds a broken pad is a trainer on the floor. Widening that rule to let
 * them flag it would also hand them edit rights over safety content.
 *
 * So the flag lives on the INSTANCE, which trainers own, and the Catalog derives
 * the badge from it. A manager can then make it official on the roster. The
 * floor can always report a problem; only management can change the record.
 */
export interface TaskNoteDialogProps {
  row: TaskRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (note: string, flagged: boolean) => void | Promise<void>;
}

export function TaskNoteDialog({
  row,
  open,
  onOpenChange,
  onSubmit,
}: TaskNoteDialogProps) {
  const [note, setNote] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setNote(row?.instance?.note ?? "");
      setFlagged(Boolean(row?.instance?.flagged));
      setBusy(false);
    }
  }, [open, row]);

  if (!row) return null;

  const requiresNote = Boolean(row.template?.requiresNote);
  const canSubmit = !busy && (!requiresNote || note.trim().length > 0);
  const isMaintenance = row.category === "maintenance";

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(note.trim(), flagged);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="st max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {row.title}
            {row.machineName ? ` — ${row.machineName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 p-1">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Note {requiresNote && <span aria-hidden>· required</span>}
            </span>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you find? Anything the next trainer should know."
              className="min-h-24 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm"
            />
          </label>

          {isMaintenance && (
            <label className="flex items-start gap-2.5 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                checked={flagged}
                onChange={(e) => setFlagged(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-[12px] leading-relaxed">
                <strong>There is a problem with this machine.</strong>
                <span className="block text-muted-foreground">
                  Flags it in the Catalog for every trainer until a manager
                  clears it. Say what is wrong in the note.
                </span>
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="st__btn st__btn--ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="st__btn st__btn--done"
              onClick={submit}
              disabled={!canSubmit}
            >
              {busy ? "Saving…" : flagged ? "Save & flag" : "Mark done"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
