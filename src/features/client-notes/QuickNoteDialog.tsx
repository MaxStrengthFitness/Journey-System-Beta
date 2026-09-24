/**
 * QUICK NOTE — the note box, one tap from the client's header.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): adding a note took too many
 * taps — open the profile, go to Notes & Profile, scroll to the notes. This
 * is the same composer (`components/journal/JournalComposer`, category
 * first, Loudness, the mattering window, FORD hand-off) in a dialog over
 * whatever tab the profile is on. The full Notes section stays where it is;
 * this is a shortcut to it, not a second kind of note.
 */
import { useMemo } from "react";
import { NotebookPen } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { auth } from "../../firebase";
import { useToast } from "../../contexts/ToastContext";
import { createJournalEntry } from "../../hooks/useClientJournal";
import type { Client, Machine, Trainer } from "../../types";
import type { JournalDraft } from "../../types/journal";
import { JournalComposer } from "../../components/journal/JournalComposer";
import { clientDisplayName } from "../../lib/client-name";
import { fordStudioIdOf } from "../ford/ford-write";

export interface QuickNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  machines: Machine[];
  authTrainer: Trainer | null;
  /** Jump to the Life section when the coach picks FORD and wants the full capture. */
  onOpenFord?: () => void;
}

export function QuickNoteDialog({ open, onOpenChange, client, machines, authTrainer, onOpenFord }: QuickNoteDialogProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const author = useMemo(
    () => ({
      // The Auth uid: the journalEntries rule pins authorId to it.
      id: auth.currentUser?.uid || authTrainer?.id || "unknown",
      initials: (authTrainer?.initials || "TR").toUpperCase(),
      fullName: authTrainer?.fullName || "Coach",
    }),
    [authTrainer],
  );
  const clientId = client.id ?? null;
  const studioId = client.homeStudioId || "";
  // A FORD capture is stamped with the studio the FORD read filters on, so it
  // comes back in the client's Life section (client codex, phase 1).
  const fordStudioId = fordStudioIdOf(client);
  const ford = useMemo(
    () =>
      clientId && author.id !== "unknown"
        ? { clientId, studioId: fordStudioId, author, sessionId: null, origin: "profile" as const }
        : null,
    [clientId, fordStudioId, author],
  );

  const submit = async (draft: JournalDraft) => {
    if (!clientId) return;
    try {
      await createJournalEntry(clientId, studioId, author, draft);
      toastSuccess("Note saved.");
      onOpenChange(false);
    } catch {
      toastError("Could not save that note. Check your connection and try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-2xl p-6 bg-card border-slate-200 dark:border-slate-800 max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold uppercase tracking-tight text-foreground font-display italic">
            <NotebookPen className="h-5 w-5" aria-hidden />
            A note about {clientDisplayName(client, "this client")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Saved to their Notes. Pick a kind, say how loud it is, and when it matters — or just write and file it later.
          </DialogDescription>
        </DialogHeader>
        <JournalComposer clientFirstName={client.firstName || ""} machines={machines} onSubmit={submit} disabled={!clientId} ford={ford} onOpenFord={onOpenFord} />
      </DialogContent>
    </Dialog>
  );
}
