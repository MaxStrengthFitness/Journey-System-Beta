import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, UserRound } from "lucide-react";
import type { ShiftGroup, TaskActor } from "./board";
import { SHIFT_LABEL } from "./types";

/**
 * PUT A NAME ON A GROUP — head trainers and studio leaders only.
 *
 * Round: Task assignment, Sep 2026.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not a lock, and the dialog says so out loud rather than leaving people
 * to discover it. The model's original argument holds: a trainer assigned the
 * bins at 9am who gets pulled into a consultation must not leave the bin full
 * because the app told everyone else it was handled. Assigning states intent;
 * anyone can still close the task.
 *
 * WHY THE DURATION CHOICE IS HERE
 * -------------------------------
 * Assigning only today means re-assigning every morning, which is the
 * assignment nobody maintains — the exact failure that made a permanent
 * `assigneeTrainerId` on the template the wrong answer. So a head trainer can
 * cover a stretch in one action. It is a fixed number of days rather than an
 * open-ended rule precisely so it EXPIRES: nothing here can quietly still be
 * true in March.
 *
 * Days count calendar days, not occurrences, so "this week" on a
 * Tuesdays-and-Fridays template assigns the Tuesday and the Friday.
 */

export const ASSIGN_DURATIONS: { days: number; label: string }[] = [
  { days: 1, label: "Today" },
  { days: 7, label: "This week" },
  { days: 14, label: "Two weeks" },
];

export interface AssignDialogProps {
  group: ShiftGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * This studio's own team — see studioRoster for why it is home studio only.
   * `{ id, name }`, the shape studioRoster returns. It was typed as `Trainer[]`
   * and read `fullName`, which that shape does not have, so every row read
   * "A trainer" and that is the name an assignment saved (fixed Sep 10 2026).
   */
  roster: TaskActor[];
  /** Signed-in trainer, so "you" reads as "you". */
  currentUserId?: string | null;
  onSubmit: (assignee: TaskActor | null, days: number) => void | Promise<void>;
}

export function AssignDialog({
  group,
  open,
  onOpenChange,
  roster,
  currentUserId,
  onSubmit,
}: AssignDialogProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [days, setDays] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      // Opens on whoever already has it, so "change Marcus to Priya" does not
      // start by looking like nobody is assigned.
      setChosen(group?.assignedTo?.id ?? null);
      setDays(1);
      setBusy(false);
    }
  }, [open, group]);

  if (!group) return null;

  const submit = async (assignee: TaskActor | null, forDays: number) => {
    setBusy(true);
    try {
      await onSubmit(assignee, forDays);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const chosenTrainer = roster.find((t) => t.id === chosen) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="st max-w-lg sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            Who is on “{group.title}”?
            <span className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {SHIFT_LABEL[group.shift]}
              {group.total > 1 ? ` · ${group.total} items` : ""}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 p-1">
          {roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody is on this studio’s team yet. A trainer appears here once
              their primary studio is set to this location.
            </p>
          ) : (
            <div
              className="flex max-h-64 flex-col gap-1 overflow-y-auto"
              role="radiogroup"
              aria-label="Assign to"
            >
              {roster.map((t) => {
                const isChosen = chosen === t.id;
                const name = t.name || "A trainer";
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={isChosen}
                    className={`flex min-h-11 items-center gap-2.5 rounded-lg border px-3 text-left text-sm ${
                      isChosen
                        ? "border-primary bg-primary/10 font-semibold"
                        : "border-border"
                    }`}
                    onClick={() => setChosen(isChosen ? null : t.id)}
                  >
                    <UserRound size={15} aria-hidden />
                    <span className="flex-1">
                      {name}
                      {t.id === currentUserId && (
                        <span className="text-muted-foreground"> · you</span>
                      )}
                    </span>
                    {isChosen && <Check size={15} aria-hidden />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              For how long
            </span>
            <div className="flex flex-wrap gap-1.5">
              {ASSIGN_DURATIONS.map((d) => (
                <button
                  key={d.days}
                  type="button"
                  aria-pressed={days === d.days}
                  className={`min-h-9 rounded-full border px-3 text-[11px] font-bold uppercase tracking-wider ${
                    days === d.days
                      ? "border-primary bg-primary/10"
                      : "border-border text-muted-foreground"
                  }`}
                  onClick={() => setDays(d.days)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Said out loud rather than left to be discovered. The single most
              likely misreading of a name on a task is that it locks it. */}
          <p className="rounded-lg border border-border p-3 text-[12px] leading-relaxed text-muted-foreground">
            A name is a heads-up, not a lock.{" "}
            <strong className="text-foreground">
              Anyone can still tick this off
            </strong>{" "}
            — if {chosenTrainer?.name || "they"} get pulled into a session,
            the floor still closes it.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            {group.assignedTo && (
              <button
                type="button"
                className="st__btn st__btn--ghost"
                disabled={busy}
                onClick={() => submit(null, 1)}
              >
                Clear
              </button>
            )}
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
              disabled={busy || !chosenTrainer}
              onClick={() =>
                chosenTrainer &&
                submit(
                  {
                    id: chosenTrainer.id,
                    name: chosenTrainer.name || "A trainer",
                  },
                  days,
                )
              }
            >
              {busy ? "Saving…" : "Assign"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
