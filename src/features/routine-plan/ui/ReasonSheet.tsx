/**
 * WHY? — the reason for a plan change, asked and never required.
 *
 * AJ, Oct 7 2026: "it's nice to be able to communicate like, hey, I'm
 * changing this plan because of this reason". And: "Any trainer who trains
 * the client can definitely change the plan ... You should be able to change
 * that and make the call as a trainer because you're training them that
 * day." So the sheet offers a few reasons and the trainer's own words, and
 * "Save change" works with nothing picked or typed. The change itself is
 * written by the caller, never awaited.
 *
 * Words typed and not saved are registered with the leave warning: closing
 * the sheet over them asks first.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useUnsavedChanges } from "../../unsaved-changes";
import { PLAN_CHANGE_REASONS } from "../lineup";
import { Chip, PlanSheet } from "./parts";

export interface ReasonSheetProps {
  open: boolean;
  /** What is about to change, as the sheet's title: "Move Lumbar up". */
  what: string;
  onClose: () => void;
  /** The reason, or null when none was given. */
  onSave: (reason: string | null) => void;
}

export function ReasonSheet({ open, what, onClose, onSave }: ReasonSheetProps) {
  const [pick, setPick] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const unsaved = useUnsavedChanges(open && typed.trim() !== "", "the reason for this change", {
    onDiscard: () => setTyped(""),
  });
  const close = () =>
    unsaved.guard(() => {
      setPick(null);
      setTyped("");
      onClose();
    });
  const save = () => {
    const words = [pick, typed.trim()].filter(Boolean).join(" · ");
    unsaved.release();
    setPick(null);
    setTyped("");
    onSave(words || null);
  };
  return (
    <PlanSheet
      open={open}
      title={what}
      meta="Why? It helps the next trainer. Optional."
      onClose={close}
      footer={
        <Button className="hover:bg-primary" onClick={save}>
          Save change
        </Button>
      }
    >
      <div className="rpl-chips" role="group" aria-label="Reasons">
        {PLAN_CHANGE_REASONS.map((r) => (
          <Chip key={r} on={pick === r} onClick={() => setPick(pick === r ? null : r)}>
            {r}
          </Chip>
        ))}
      </div>
      <label className="rpl-sheet__section">
        <span className="rpl-sheet__label">In your own words</span>
        <input
          className="rpl-field"
          value={typed}
          maxLength={400}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Optional"
        />
      </label>
    </PlanSheet>
  );
}
