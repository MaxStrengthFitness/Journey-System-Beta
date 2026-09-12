/**
 * "Log a renewal conversation" — the 15-second sheet.
 *
 * Opened from the post-session screen ("Renewal: 9 left. Talk about it
 * today?") and from the Renewal card. How they're leaning (one tap), what
 * they're on the fence about (any), what they might want next (optional), a
 * note (optional), and "needs a leader". That's all: the trainer is between
 * clients, and the leader who reads it later needs exactly these.
 *
 * Nothing here contacts the client. It is a note for the studio.
 */

import React, { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
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
import {
  CONCERNS,
  EMPTY_DRAFT,
  INTERESTS,
  LEANINGS,
  NOTE_MAX,
  draftProblem,
  type ConversationDraft,
} from "./conversation";
import { isUsableCycleKey, logRenewalConversation } from "./useRenewalCycle";
import { situationSentence } from "./sentences";
import { studioTodayKey } from "../../lib/studio-time";
import type { Client, Trainer } from "../../types";
import type { RenewalConcern, RenewalSnapshot } from "./types";

export interface LogConversationDialogProps {
  open: boolean;
  onClose: () => void;
  client: Client;
  /** The renewal it is about. Without a cycle there is nothing to file it under. */
  snapshot: RenewalSnapshot | null;
  trainer: Pick<Trainer, "fullName"> | null;
  onSaved?: () => void;
}

function Chip({
  on,
  children,
  onClick,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-xl border px-3.5 text-[13px] font-bold transition-colors",
        on
          ? "border-sky-600 bg-sky-600 text-white dark:border-sky-400 dark:bg-sky-500"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

const LABEL = "text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400";

export function LogConversationDialog({
  open,
  onClose,
  client,
  snapshot,
  trainer,
  onSaved,
}: LogConversationDialogProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [draft, setDraft] = useState<ConversationDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(EMPTY_DRAFT);
  }, [open]);

  const cycleKey = snapshot?.cycleKey ?? null;
  const canFile = Boolean(client.id && client.homeStudioId && isUsableCycleKey(cycleKey));
  const problem = draftProblem(draft);
  const firstName = client.firstName || "the client";

  const toggleConcern = (key: RenewalConcern) =>
    setDraft((d) => ({
      ...d,
      concerns: d.concerns.includes(key) ? d.concerns.filter((c) => c !== key) : [...d.concerns, key],
    }));

  const save = async () => {
    if (!canFile || problem || saving) return;
    setSaving(true);
    try {
      await logRenewalConversation({
        studioId: client.homeStudioId,
        cycleKey: cycleKey!,
        clientId: client.id!,
        clientName: `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim(),
        snapshot,
        draft,
        authorName: trainer?.fullName?.trim() || "A trainer",
      });
      toastSuccess("Conversation saved. Leaders will see it on the Renewals tab.");
      onSaved?.();
      onClose();
    } catch (err: any) {
      console.warn("[renewals] save conversation failed:", err);
      toastError(
        err?.code === "permission-denied"
          ? "You can log conversations only for clients at your studio."
          : err?.message || "Couldn't save the conversation. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <MessageSquareText className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            Renewal conversation with {firstName}
          </DialogTitle>
          <DialogDescription>
            {snapshot ? situationSentence(snapshot, studioTodayKey()) : "No renewal on file yet."}
          </DialogDescription>
        </DialogHeader>

        {!canFile ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            There's no package on file for {firstName} yet, so there's nothing to file this under.
            A leader can press Sync on the Mindbody card first.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className={LABEL}>How are they leaning?</p>
              <div className="flex flex-wrap gap-2">
                {LEANINGS.map((l) => (
                  <Chip
                    key={l.key}
                    on={draft.leaning === l.key}
                    onClick={() => setDraft((d) => ({ ...d, leaning: l.key }))}
                  >
                    {l.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className={LABEL}>On the fence about</p>
              <div className="flex flex-wrap gap-2">
                {CONCERNS.map((c) => (
                  <Chip key={c.key} on={draft.concerns.includes(c.key)} onClick={() => toggleConcern(c.key)}>
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className={LABEL}>Interested in (optional)</p>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((i) => (
                  <Chip
                    key={i.key}
                    on={draft.interestedIn === i.key}
                    onClick={() =>
                      setDraft((d) => ({ ...d, interestedIn: d.interestedIn === i.key ? null : i.key }))
                    }
                  >
                    {i.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className={LABEL} htmlFor="renewal-note">
                Note (optional)
              </label>
              <textarea
                id="renewal-note"
                rows={3}
                maxLength={NOTE_MAX}
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                placeholder="What did they say? e.g. wants to see the InBody first"
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <button
              type="button"
              aria-pressed={draft.needsLeader}
              onClick={() => setDraft((d) => ({ ...d, needsLeader: !d.needsLeader }))}
              className={cn(
                "flex min-h-12 w-full items-center justify-between rounded-xl border px-4 text-left text-sm font-bold transition-colors",
                draft.needsLeader
                  ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
                  : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
              )}
            >
              <span>A leader should follow up</span>
              <span className="text-[11px] uppercase tracking-widest">{draft.needsLeader ? "Yes" : "No"}</span>
            </button>
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-slate-300 px-5 text-[12px] font-black uppercase tracking-widest text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            Cancel
          </button>
          {canFile && (
            <button
              type="button"
              onClick={save}
              disabled={Boolean(problem) || saving}
              title={problem ?? undefined}
              className="min-h-11 rounded-xl bg-cta-strong px-6 text-[12px] font-black uppercase tracking-widest text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : problem ? "Pick a leaning" : "Save conversation"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
