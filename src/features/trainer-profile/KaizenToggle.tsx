/**
 * ADD / REMOVE ONE KNOWN CLIENT FROM YOUR KAIZEN ROSTER.
 *
 * WHY THIS EXISTS
 * ---------------
 * The roster engine (roster.ts, useKaizenRoster) was complete and correct, but
 * the ONLY surface that could reach it was the Trainer Profile screen — you
 * had to leave the client you were thinking about, go to your own profile,
 * open a dialog, and search for them by name. That is why the feature read as
 * "the app can't track Kaizen clients": the plumbing was there and no tap led
 * to it.
 *
 * This is the same two operations attached to a client you are already
 * looking at, so the gesture is "flag this person" rather than "go and
 * administer a list".
 *
 * DIFFERENT FROM AddToRosterDialog ON PURPOSE
 * -------------------------------------------
 * That dialog's first step is a search box, which is the right shape when you
 * are starting from your own profile with nobody in mind. Here the client is
 * already known, so searching for them again is a step that can only go
 * wrong. This one opens straight on the reason.
 *
 * The reason stays REQUIRED. It is the field that turns a list of names into a
 * plan, and it is one tap.
 */
import { useState } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  KAIZEN_REASONS,
  KAIZEN_REASON_HINTS,
  type Client,
  type KaizenReason,
  type Trainer,
} from "../../types";
import { cn } from "../../lib/utils";
import { KaizenMark } from "./KaizenMark";
import { NOTE_MAX, isOnRoster, rosterEntryFor } from "./roster";
import { useKaizenRoster } from "./useKaizenRoster";
// The mark and the chips are painted with --tp-* tokens. Imported here rather
// than assumed, because this component is now rendered on screens that never
// pull in the trainer-profile stylesheet.
import "./trainer-profile.tokens.css";

export type KaizenToggleVariant =
  /** Icon + word, for a profile header. */
  | "button"
  /** Bare icon in a fixed square, for a dense list row. */
  | "icon";

export function KaizenToggle({
  trainer,
  client,
  variant = "button",
  className,
}: {
  /**
   * The SIGNED-IN trainer, not the profile being viewed. A Kaizen Roster
   * belongs to one person; firestore.rules only lets that person write it, so
   * rendering this against anyone else would offer a tap that always fails.
   */
  trainer: Trainer | null | undefined;
  client: Pick<Client, "id" | "firstName" | "lastName">;
  variant?: KaizenToggleVariant;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<KaizenReason | null>(null);
  const [note, setNote] = useState("");
  const [reviewBy, setReviewBy] = useState("");
  const { add, remove, saving } = useKaizenRoster(trainer);

  if (!trainer?.id || !client?.id) return null;

  const on = isOnRoster(trainer, client.id);
  const entry = rosterEntryFor(trainer, client.id);
  const name = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "this client";

  const handleClick = () => {
    if (saving) return;
    // Removing is not confirmed. It is a bookmark, not a record, and it goes
    // back in one tap — a confirm dialog here would cost more than the mistake.
    if (on) {
      void remove(client.id!);
      return;
    }
    setReason(null);
    setNote("");
    setReviewBy("");
    setOpen(true);
  };

  const submit = async () => {
    if (!reason) return;
    const ok = await add(client, reason, {
      note: note.trim() || undefined,
      // A date input gives "YYYY-MM-DD", which `new Date()` reads as UTC
      // midnight — in Ohio that is the evening BEFORE. Splitting the parts
      // builds it in local time so "check back on the 20th" means the 20th.
      reviewBy: reviewBy
        ? new Date(
            Number(reviewBy.slice(0, 4)),
            Number(reviewBy.slice(5, 7)) - 1,
            Number(reviewBy.slice(8, 10)),
          )
        : null,
    });
    if (ok) setOpen(false);
  };

  const label = on ? "On your Kaizen Roster" : "Add to your Kaizen Roster";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={saving}
        aria-pressed={on}
        title={
          on && entry?.reason
            ? `${label} — ${entry.reason}. Tap to remove.`
            : label
        }
        aria-label={label}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-full border transition-colors shrink-0",
          "disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
          // 44px is the Apple HIG minimum for a touch target and these live on
          // iPads. The icon variant is a square so it can sit in a list row
          // without changing the row's height.
          variant === "icon" ? "h-11 w-11" : "h-9 px-3",
          on
            ? "border-[var(--tp-kaizen)] bg-[var(--tp-kaizen-fill)] text-[var(--tp-kaizen-text)]"
            : "border-div-d text-ink-d3 hover:text-ink-d1 hover:border-ink-d3",
          className,
        )}
      >
        <KaizenMark size={variant === "icon" ? 18 : 15} quiet={!on} />
        {variant === "button" && (
          <span className="text-[11px] font-black uppercase tracking-widest">
            {on ? "Tracking" : "Track"}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KaizenMark size={18} />
              Track {name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-ink-d3 mb-2">
                Why are you watching them?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {KAIZEN_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    aria-pressed={reason === r}
                    className={cn(
                      "text-left rounded-xl border px-3 py-2 transition-colors cursor-pointer",
                      reason === r
                        ? "border-[var(--tp-kaizen)] bg-[var(--tp-kaizen-fill)]"
                        : "border-div-d hover:border-ink-d3",
                    )}
                  >
                    <span
                      className={cn(
                        "block text-xs font-black uppercase tracking-widest",
                        reason === r ? "text-[var(--tp-kaizen-text)]" : "text-ink-d1",
                      )}
                    >
                      {r}
                    </span>
                    <span className="block text-[11px] text-ink-d3 leading-tight mt-0.5">
                      {KAIZEN_REASON_HINTS[r]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="kaizen-note"
                className="text-[11px] font-black uppercase tracking-widest text-ink-d3 block mb-1.5"
              >
                Note <span className="font-bold normal-case tracking-normal">(optional)</span>
              </label>
              <textarea
                id="kaizen-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                rows={2}
                placeholder="What specifically are you working on with them?"
                className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-ink-d1 placeholder:text-ink-d3 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-[10px] text-ink-d3 mt-1 text-right tabular">
                {note.length}/{NOTE_MAX}
              </p>
            </div>

            <div>
              <label
                htmlFor="kaizen-review"
                className="text-[11px] font-black uppercase tracking-widest text-ink-d3 block mb-1.5"
              >
                Check back on{" "}
                <span className="font-bold normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="kaizen-review"
                type="date"
                value={reviewBy}
                onChange={(e) => setReviewBy(e.target.value)}
                className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-ink-d1 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 px-4 rounded-xl border border-div-d text-ink-d2 text-[11px] font-black uppercase tracking-widest cursor-pointer hover:border-ink-d3"
            >
              <X className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!reason || saving}
              className="h-10 px-5 rounded-xl bg-cta-strong text-white text-[11px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Track"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
