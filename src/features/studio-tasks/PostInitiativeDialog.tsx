/**
 * POSTING AN INITIATIVE — the manager's half, and the missing half.
 *
 * "Hey, I need you guys to all do at least five of these assessments for the
 * clients." Until this existed, `kind: "initiative"` could only be created by
 * editing Firestore by hand: the board's quick composer deliberately excludes
 * the kind (a trainer should not post a team-wide ask one tap from the floor,
 * and that composer has no room to collect a target), and nothing else did.
 *
 * WHY IT IS A SEPARATE DIALOG AND NOT A SIXTH CHIP ON THE COMPOSER
 * An initiative asks for three things no other request needs — an action, a
 * per-trainer number and a deadline — and it addresses the whole floor rather
 * than whoever picks it up. Squeezing that into the quick composer would make
 * the quick composer worse at the thing it is for.
 *
 * THE NUMBER IS OPTIONAL, AND THAT IS DELIBERATE
 * Not every ask has a count. "Get familiar with the new InBody before Friday"
 * is a real initiative with no number in it, and forcing a target would make
 * managers invent one. With no number, initiativeProgress treats a single
 * entry as done — see its `met` line.
 */
import { useState } from "react";
import { CalendarClock, Target } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "../../lib/utils";
import { CLIENT_ACTION_LABEL, type ClientTaskAction } from "./types";
import type { InitiativeTarget } from "./initiatives";

/** The actions an initiative can be about. Mirrors ClientTaskAction. */
const ACTIONS: ClientTaskAction[] = [
  "assessment",
  "progress-report",
  "inbody",
  "custom",
];

/*
 * Five is the number AJ used when he described this, and it is a sensible
 * default for a week. Offered as chips rather than a stepper because on a
 * tablet a manager wants one tap, and because a free number box invites 37.
 */
const COMMON_TARGETS = [3, 5, 8, 10];

export interface PostInitiativeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving?: boolean;
  /** How many trainers this will be measured against, for the honest preview. */
  rosterSize?: number;
  onPost: (args: {
    title: string;
    detail?: string;
    target: InitiativeTarget;
  }) => Promise<void> | void;
}

export function PostInitiativeDialog({
  open,
  onOpenChange,
  saving,
  rosterSize = 0,
  onPost,
}: PostInitiativeDialogProps) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [action, setAction] = useState<ClientTaskAction>("assessment");
  const [perTrainer, setPerTrainer] = useState<number>(5);
  const [dueOn, setDueOn] = useState("");

  const canPost = title.trim().length > 0 && !saving;

  const submit = async () => {
    if (!canPost) return;
    await onPost({
      title: title.trim().slice(0, 200),
      detail: detail.trim() ? detail.trim().slice(0, 2000) : undefined,
      target: {
        action,
        // 0 means "no number" — see the header. Never written as undefined so
        // the shape stays the same whether or not a count was chosen.
        perTrainer,
        ...(dueOn ? { dueOn } : {}),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target size={16} aria-hidden />
            Ask the team for something
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="ini-title"
              className="block text-[11px] font-black uppercase tracking-widest text-ink-d3 mb-1.5"
            >
              What are you asking for?
            </label>
            <Input
              id="ini-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Five progress reports each, by Friday"
              maxLength={200}
            />
          </div>

          <div>
            <span className="block text-[11px] font-black uppercase tracking-widest text-ink-d3 mb-1.5">
              What kind of work
            </span>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={action === a}
                  onClick={() => setAction(a)}
                  className={cn(
                    "min-h-10 rounded-xl border px-3 text-[12px] font-bold",
                    action === a
                      ? "border-[var(--tp-kaizen,#0a548b)] bg-[var(--tp-kaizen-fill,#eaf0f4)] text-[var(--tp-kaizen,#0a548b)]"
                      : "border-div-d bg-card text-ink-d2",
                  )}
                >
                  {CLIENT_ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-black uppercase tracking-widest text-ink-d3 mb-1.5">
              How many each
            </span>
            <div className="flex flex-wrap gap-2">
              {COMMON_TARGETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={perTrainer === n}
                  onClick={() => setPerTrainer(n)}
                  className={cn(
                    "min-h-10 min-w-10 rounded-xl border px-3 text-[13px] font-black tabular",
                    perTrainer === n
                      ? "border-[var(--tp-kaizen,#0a548b)] bg-[var(--tp-kaizen-fill,#eaf0f4)] text-[var(--tp-kaizen,#0a548b)]"
                      : "border-div-d bg-card text-ink-d2",
                  )}
                >
                  {n}
                </button>
              ))}
              {/*
                The escape hatch. An initiative with no number is a real one
                ("get familiar with the new InBody"), and a manager who has to
                invent a count to post one will invent a bad count.
              */}
              <button
                type="button"
                aria-pressed={perTrainer === 0}
                onClick={() => setPerTrainer(0)}
                className={cn(
                  "min-h-10 rounded-xl border px-3 text-[12px] font-bold",
                  perTrainer === 0
                    ? "border-[var(--tp-kaizen,#0a548b)] bg-[var(--tp-kaizen-fill,#eaf0f4)] text-[var(--tp-kaizen,#0a548b)]"
                    : "border-div-d bg-card text-ink-d2",
                )}
              >
                No number
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="ini-due"
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-ink-d3 mb-1.5"
            >
              <CalendarClock size={12} aria-hidden />
              By when — optional
            </label>
            <Input
              id="ini-due"
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="ini-detail"
              className="block text-[11px] font-black uppercase tracking-widest text-ink-d3 mb-1.5"
            >
              Why — optional, but it is what gets people to do it
            </label>
            <textarea
              id="ini-detail"
              rows={3}
              value={detail}
              onChange={(e) => setDetail(e.target.value.slice(0, 2000))}
              placeholder="We are heading into renewals and the reports are what the conversation hangs on."
              className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-ink-d1 placeholder:text-ink-d3 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/*
            THE HONEST PREVIEW. A manager about to ask nine people for five
            things each should see "45" before they post it, not after the
            floor has read it. This is the one number on the screen that is
            arithmetic rather than a choice.
          */}
          <p className="rounded-xl border border-div-d bg-bg-dark-3 p-3 text-[12px] leading-relaxed text-ink-d3">
            {rosterSize > 0 && perTrainer > 0 ? (
              <>
                That is{" "}
                <strong className="text-ink-d1 tabular">
                  {rosterSize * perTrainer}
                </strong>{" "}
                {CLIENT_ACTION_LABEL[action].toLowerCase()}s across{" "}
                {rosterSize} trainer{rosterSize === 1 ? "" : "s"}.
              </>
            ) : rosterSize > 0 ? (
              <>
                Goes to {rosterSize} trainer{rosterSize === 1 ? "" : "s"}. With
                no number, one logged client counts as done.
              </>
            ) : (
              <>
                Nobody is on this studio's roster yet, so this will post but
                track against no one.
              </>
            )}
          </p>
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
            disabled={!canPost}
            onClick={() => void submit()}
            className="h-10 rounded-xl bg-cta-strong px-5 text-[11px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Posting…" : "Post to the board"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
