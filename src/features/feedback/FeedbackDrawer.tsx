/**
 * The beta feedback drawer.
 *
 * Round: Settings tiers & Task Board, Sep 2026.
 *
 * Opens from the bottom because the app is used two-handed on a 10-13" iPad
 * held in portrait: a bottom sheet puts the kind buttons and the send button
 * inside thumb reach, where a centred dialog puts them under the far hand.
 */

import { useEffect, useState } from "react";
import { Bug, Check, Lightbulb, Palette, Send } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "../../contexts/ToastContext";
import { describeContext } from "./capture";
import { submitFeedback } from "./mutations";
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_KIND_PLACEHOLDER,
  FEEDBACK_KIND_SHORT,
  type FeedbackContext,
  type FeedbackKind,
} from "./types";
import type { FeedbackAuthor } from "./FeedbackProvider";

const KINDS: { kind: FeedbackKind; icon: typeof Bug }[] = [
  { kind: "bug", icon: Bug },
  { kind: "ui", icon: Palette },
  { kind: "idea", icon: Lightbulb },
];

export interface FeedbackDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind: FeedbackKind;
  context: FeedbackContext;
  author: FeedbackAuthor;
}

export function FeedbackDrawer({
  open,
  onOpenChange,
  initialKind,
  context,
  author,
}: FeedbackDrawerProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // Follow the kind the caller asked for, but only on open: changing it
  // mid-typing because a parent re-rendered would be baffling.
  useEffect(() => {
    if (open) {
      setKind(initialKind);
      setSent(false);
    }
  }, [open, initialKind]);

  const summary = describeContext(context);

  const send = async () => {
    if (!description.trim() || busy) return;
    setBusy(true);
    try {
      await submitFeedback({ kind, description, context, author });
      setSent(true);
      setDescription("");
      toastSuccess("Thank you — that went straight to the team.");
      // Held open briefly so the confirmation is actually seen; a drawer that
      // vanishes on tap leaves the trainer unsure whether it sent.
      window.setTimeout(() => onOpenChange(false), 1200);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toastError(`Could not send that: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-[28px] border-t border-border bg-card p-0 max-h-[92dvh] overflow-y-auto"
      >
        <SheetHeader className="px-5 pt-5 pb-3 sm:px-7">
          <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em] text-foreground">
            Help us build this
          </SheetTitle>
          <SheetDescription className="text-[14px] font-medium text-muted-foreground">
            You are in beta. Nothing is too small to mention.
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 pb-6 sm:px-7 space-y-4">
          {/* Kind — three targets, min h-14, chosen for gloved/sweaty taps.
              Raised on the 3:1 edge and pressing in, in the button voice
              (14/700, the words as written: "UI feedback"); the picked one is
              the solid blue with its own lift (type and depth follow-up,
              Oct 5 2026). */}
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map(({ kind: k, icon: Icon }) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 h-16 sm:h-20 rounded-2xl border text-[14px] font-bold transition-[color,background-color,border-color,transform] active:translate-y-px active:shadow-(--press)",
                  kind === k
                    ? "bg-primary border-primary text-primary-foreground shadow-(--solid-lift)"
                    : "bg-(--raised) border-input shadow-(--raised-lift) text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 sm:w-6 sm:h-6",
                    kind === k ? "text-primary-foreground" : "opacity-50",
                  )}
                />
                {FEEDBACK_KIND_SHORT[k]}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-[14px] font-bold text-ink-d2">
              {FEEDBACK_KIND_LABEL[kind]}
            </p>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={FEEDBACK_KIND_PLACEHOLDER[kind]}
              rows={5}
              autoFocus
              className="rounded-2xl text-foreground text-base resize-none min-h-[120px]"
            />
          </div>

          {/* Shown, not hidden: a trainer should know what leaves their iPad. */}
          {summary && (
            <p className="text-[12px] text-muted-foreground font-medium leading-relaxed">
              <span className="font-bold">
                Attached automatically:
              </span>{" "}
              {summary}
            </p>
          )}

          <Button
            onClick={send}
            disabled={!description.trim() || busy || sent}
            className="w-full h-12 sm:h-14 rounded-2xl bg-primary hover:bg-primary text-primary-foreground text-[14px] font-bold gap-2 disabled:opacity-40"
          >
            {sent ? (
              <>
                <Check className="w-4 h-4" /> Sent
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> {busy ? "Sending…" : "Send to the team"}
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
