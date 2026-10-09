/**
 * NOT FOR {FIRST} — a machine the client can't do (the design round, §4.4;
 * AJ, Oct 8 2026: "some clients just wont be able to do certain machines ...
 * we could have a client who is getting surgery").
 *
 * Which machine (when the row didn't say), why (every reason optional), and
 * for how long: until cleared, until a date (the last day it holds), or
 * always. With Surgery or Injury or pain, one tick also writes a Health note
 * through the notes' one writer, so the studio's leaders see it (AJ's "2a"):
 * asked, never automatic, and unticked until the trainer ticks it.
 *
 * Marking it reshapes the plan (the caller's `markCantDo`): the Academy's
 * substitute or a machine of the same family stands in, and the screen says
 * which.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CANT_DO_REASONS, healthNoteOffer, untilDayFrom } from "../cant-do";
import type { FloorMachine } from "../starting-plan";
import type { CantDo } from "../types";
import { Chip, PlanSheet, TickRow } from "./parts";
import { MachineChips } from "./pickers";

const UNTIL = [
  { id: "cleared", label: "Until cleared" },
  { id: "date", label: "Until a date" },
  { id: "always", label: "Always" },
] as const;
type UntilChoice = (typeof UNTIL)[number]["id"];

export interface CantDoSave {
  machineId: string;
  reason: string | null;
  until: CantDo["until"];
  /** The trainer ticked "Also add a Health note" (a surgery or an injury only). */
  healthNote: boolean;
}

export interface CantDoSheetProps {
  open: boolean;
  firstName: string;
  /** The machine, when the row said which; null asks. */
  machineId: string | null;
  floor: readonly FloorMachine[];
  /** The lineup's machines, offered first. */
  plan: readonly string[];
  /** Already on the bench: not offered again. */
  bench: readonly string[];
  nameOf: (id: string) => string;
  /** The studio's day: a date before it can't be picked. */
  todayYmd: string;
  onClose: () => void;
  onSave: (save: CantDoSave) => void;
}

export function CantDoSheet({ open, firstName, machineId, floor, plan, bench, nameOf, todayYmd, onClose, onSave }: CantDoSheetProps) {
  const [pick, setPick] = useState<string | null>(machineId);
  const [reason, setReason] = useState<string | null>(null);
  const [until, setUntil] = useState<UntilChoice>("cleared");
  const [date, setDate] = useState("");
  const [note, setNote] = useState(false);

  // A fresh question each time it opens.
  useEffect(() => {
    if (!open) return;
    setPick(machineId);
    setReason(null);
    setUntil("cleared");
    setDate("");
    setNote(false);
  }, [open, machineId]);

  const offer = healthNoteOffer(reason);
  const untilValue: CantDo["until"] | null = until === "date" ? untilDayFrom(date, todayYmd) : until;
  const ready = pick !== null && untilValue !== null;

  return (
    <PlanSheet
      open={open}
      title={pick ? `${nameOf(pick)} · not for ${firstName}` : `Not for ${firstName}`}
      meta="Why is optional. The plan finds what stands in."
      onClose={onClose}
      footer={
        <Button
          className="hover:bg-primary"
          disabled={!ready}
          onClick={() => {
            if (!pick || !untilValue) return;
            onSave({ machineId: pick, reason, until: untilValue, healthNote: !!offer && note });
          }}
        >
          Save
        </Button>
      }
    >
      {machineId === null && (
        <section className="rpl-sheet__section">
          <p className="rpl-sheet__label">Which machine</p>
          <MachineChips floor={floor} plan={plan} exclude={bench} isOn={(id) => pick === id} onTap={setPick} nameOf={nameOf} fold />
        </section>
      )}
      <section className="rpl-sheet__section">
        <p className="rpl-sheet__label">Why · optional</p>
        <div className="rpl-chips" role="group" aria-label="Why">
          {CANT_DO_REASONS.map((r) => (
            <Chip key={r} on={reason === r} onClick={() => setReason(reason === r ? null : r)}>
              {r}
            </Chip>
          ))}
        </div>
      </section>
      <section className="rpl-sheet__section">
        <p className="rpl-sheet__label">For how long</p>
        <div className="rpl-chips" role="group" aria-label="For how long">
          {UNTIL.map((u) => (
            <Chip key={u.id} on={until === u.id} onClick={() => setUntil(u.id)}>
              {u.label}
            </Chip>
          ))}
        </div>
        {until === "date" && (
          <label className="rpl-sheet__section">
            <span className="rpl-meta">The last day it holds</span>
            <input className="rpl-field" type="date" min={todayYmd} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Until" />
            {date !== "" && untilValue === null && <span className="rpl-meta">Pick today or a later day.</span>}
          </label>
        )}
      </section>
      {offer && (
        <TickRow
          on={note}
          onChange={setNote}
          label="Also add a Health note"
          sub={`Filed under ${offer.label}, so the studio's leaders see it on Operations → Today.`}
        />
      )}
    </PlanSheet>
  );
}
