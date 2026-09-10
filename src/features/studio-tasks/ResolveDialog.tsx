/**
 * RESOLVING A REQUEST — and keeping the answer.
 *
 * ============================================================================
 * THIS IS THE FEATURE THAT MAKES THE PLAYBOOK EXIST
 * ============================================================================
 * Nobody running back-to-back 20-minute sessions is going to sit down and
 * write documentation. Ask them to, and you get an empty wiki and a vague
 * sense of failure.
 *
 * But they already answer each other. Somebody asks how to work around a
 * client's shoulder on the compound row, somebody else tells them, and that
 * answer is currently thrown away the moment the request is resolved.
 *
 * So the playbook is not a thing you go and write. It is the by-product of
 * work that was happening anyway: resolve a request, and the answer you just
 * typed is offered as an entry with the title and machine already filled in.
 * The marginal cost of contributing is one checkbox on a thing you finished.
 *
 * TWO RULES THIS DIALOG ENFORCES
 *
 * 1. The offer only appears once the resolution is worth keeping.
 *    `draftFromRequest` returns null under 12 characters. Prompting somebody
 *    to archive "yep, thanks" teaches them that this prompt is noise, and a
 *    prompt people have learned to dismiss is worse than no prompt.
 *
 * 2. The entry carries NO client reference, even though the request it came
 *    from might. That is deliberate — see the header of playbook.ts. The
 *    Firestore rule refuses a clientId outright, so this is belt and braces,
 *    but the UI should never put a trainer in a position where the write
 *    silently fails either.
 */
import { useMemo, useState } from "react";
import { BookOpen, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "../../lib/utils";
import { draftFromRequest, PLAYBOOK_TITLE_MAX } from "./playbook";
import type { PlaybookDraft } from "./playbook";
import type { TaskRequest } from "./requests";

/** resolveRequest truncates at 500, so the field should not pretend otherwise. */
const RESOLUTION_MAX = 500;

export interface ResolveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: TaskRequest;
  /** Machine display names, so the entry can say what it is anchored to. */
  machineName?: string;
  saving?: boolean;
  /**
   * Resolve, and optionally keep the answer.
   *
   * One callback rather than two so the caller can order the writes: the
   * resolve is the thing the trainer asked for and must not be lost if the
   * playbook write fails.
   */
  onResolve: (args: {
    resolution: string;
    playbook: PlaybookDraft | null;
  }) => Promise<void> | void;
}

export function ResolveDialog({
  open,
  onOpenChange,
  request,
  machineName,
  saving,
  onResolve,
}: ResolveDialogProps) {
  const [resolution, setResolution] = useState("");
  const [keep, setKeep] = useState(false);
  const [title, setTitle] = useState(request.title);
  const [tagText, setTagText] = useState("");

  /*
   * The draft is derived, not stored, so it can never disagree with what is
   * on screen. Null until the resolution is substantial enough to be worth
   * keeping — which is also what gates the whole "keep this" block below.
   */
  const draft = useMemo(
    () =>
      draftFromRequest({
        id: request.id,
        title: request.title,
        detail: request.detail,
        resolution,
        machineId: request.machineId,
      }),
    [request.id, request.title, request.detail, request.machineId, resolution],
  );

  const canKeep = draft !== null;
  const canSubmit = resolution.trim().length > 0 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    const entry =
      keep && draft
        ? {
            ...draft,
            title: title.trim().slice(0, PLAYBOOK_TITLE_MAX) || draft.title,
            tags: tagText
              .split(",")
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean),
          }
        : null;
    await onResolve({ resolution: resolution.trim(), playbook: entry });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve “{request.title}”</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="resolve-body"
              className="block text-[11px] font-black uppercase tracking-widest text-ink-d3 mb-1.5"
            >
              What was the answer?
            </label>
            <textarea
              id="resolve-body"
              autoFocus
              rows={4}
              value={resolution}
              onChange={(e) =>
                setResolution(e.target.value.slice(0, RESOLUTION_MAX))
              }
              placeholder="What you actually did, so the next person does not have to work it out again."
              className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-ink-d1 placeholder:text-ink-d3 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-right text-[10px] text-ink-d3 tabular">
              {resolution.length}/{RESOLUTION_MAX}
            </p>
          </div>

          {/*
            The offer, and only when there is something worth offering. Shown
            as a quiet panel rather than a bare checkbox, because it is asking
            for a second decision and deserves the room to explain itself.
          */}
          {canKeep && (
            <div className="rounded-xl border border-div-d bg-bg-dark-3 p-3">
              <button
                type="button"
                onClick={() => setKeep((v) => !v)}
                aria-pressed={keep}
                className="flex w-full items-start gap-3 text-left"
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                    keep
                      ? "border-[var(--tp-kaizen,#0a548b)] bg-[var(--tp-kaizen-fill,#eaf0f4)] text-[var(--tp-kaizen,#0a548b)]"
                      : "border-input bg-card text-transparent",
                  )}
                >
                  <Check size={12} strokeWidth={3} aria-hidden />
                </span>
                <span>
                  <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-ink-d1">
                    <BookOpen size={13} aria-hidden />
                    Keep this in the playbook
                  </span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-ink-d3">
                    So the next trainer who hits this can find it. Saved as a
                    pattern — the machine and the situation, never the client's
                    name.
                  </span>
                </span>
              </button>

              {keep && (
                <div className="mt-3 space-y-3 border-t border-div-d pt-3">
                  <div>
                    <label
                      htmlFor="pb-title"
                      className="block text-[10px] font-black uppercase tracking-widest text-ink-d3 mb-1"
                    >
                      Title — what someone would search for
                    </label>
                    <Input
                      id="pb-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={PLAYBOOK_TITLE_MAX}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="pb-tags"
                      className="block text-[10px] font-black uppercase tracking-widest text-ink-d3 mb-1"
                    >
                      Tags — comma separated
                    </label>
                    <Input
                      id="pb-tags"
                      value={tagText}
                      onChange={(e) => setTagText(e.target.value)}
                      placeholder="shoulder, grip, deload"
                    />
                  </div>

                  {machineName && (
                    <p className="text-[11px] text-ink-d3">
                      Anchored to <strong>{machineName}</strong>, so it also
                      shows up on that machine in the catalog.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/*
            Said plainly rather than by hiding the panel with no explanation.
            A trainer who typed three words and saw no offer should know why.
          */}
          {!canKeep && resolution.trim().length > 0 && (
            <p className="text-[12px] leading-relaxed text-ink-d3">
              Write a little more and you will be offered the chance to keep
              this in the studio's playbook.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-xl border border-div-d px-4 text-[11px] font-black uppercase tracking-widest text-ink-d2 hover:border-ink-d3"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="h-10 rounded-xl bg-cta-strong px-5 text-[11px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : keep && canKeep
                ? "Resolve & keep"
                : "Resolve"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
