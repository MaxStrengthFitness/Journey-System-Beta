/**
 * WATCH-OUTS — her clinical flags, and every instruction they carry, QUOTED
 * in full; then the medical history and the constraints as the team wrote
 * them. Edit flags opens the picker and the two text fields.
 *
 * Client codex, Sep 2026 (phase 12). It replaces the long scroll's banner
 * (BodyWatchOuts, deleted), which listed machine names and said "open the
 * machine for the detail". Now the detail is here: one group per instruction
 * (watchout-groups.ts), general ones ("Every set") first, then each machine
 * instruction with a button for every machine on this floor it names — the
 * button opens that machine's window. The words are the studio's clinical
 * list, in curly quotes, never reworded; a flag's bracketed detail ("Grade 2
 * or higher") is printed in its group's heading, never in a hover tooltip.
 *
 * Tone chips: Stop (crimson — an absolute contraindication, the only crimson
 * here), High (plum) and modify (blue — it changes the set-up), most serious
 * first.
 *
 * SAVED AT ONCE (Oct 2 2026, AJ: clinical flags and medical history "save at
 * once", like notes; each change is one small write). With `saveNow` (the
 * shell's `saveFieldNow`) a flag picked or taken off is written the moment it
 * changes, and each text field when the trainer leaves it (or taps Done);
 * the line under the editor says what was saved, with an Undo that writes
 * the value before it back. Text being typed is registered with the
 * unsaved-changes guard until it is written. The contraindications field
 * saves the same way, so the one editor never mixes two kinds of save.
 * Without `saveNow` (an older caller) every field goes through the shell's
 * ONE form (`updateField`) and the Save bar, as before.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useUnsavedChanges } from "../../unsaved-changes";
import { ChevronRight, ShieldAlert } from "lucide-react";
import type { Client, Machine } from "../../../types";
import { ClinicalFlagPicker } from "../../clinical-flags/ClinicalFlagPicker";
import { selectedFlags } from "../../clinical-flags/flag-search";
import {
  CardHead,
  Chip,
  ChipButton,
  Chips,
  EditButton,
  EmptyLine,
  Eyebrow,
  Meta,
  Quote,
  TextArea,
  anchorProps,
  cls,
  useReadEdit,
} from "../kit";
import { flagChip, groupEyebrow, watchOutGroups } from "./watchout-groups";

export interface WatchOutsCardProps {
  flagIds: readonly string[] | null | undefined;
  medicalHistory: string;
  clinicalNotes: string;
  /** The studio's floor: the machines a chip can open. */
  floorMachines: readonly Machine[];
  canEdit: boolean;
  /** An unsaved change on this card. */
  dirty: boolean;
  /** The record form's revision; a save or a discard closes the editor. */
  revision: number;
  updateField: (key: keyof Client, value: unknown) => void;
  /** Write one field now (the record form's `saveFieldNow`). Left out: the Save bar saves. */
  saveNow?: (key: "clinicalFlags" | "medicalHistory" | "clinicalNotes", value: unknown) => Promise<boolean>;
  onOpenMachine?: (machineId: string) => void;
  className?: string;
}

export function WatchOutsCard({
  flagIds,
  medicalHistory,
  clinicalNotes,
  floorMachines,
  canEdit,
  dirty,
  revision,
  updateField,
  saveNow,
  onOpenMachine,
  className,
}: WatchOutsCardProps) {
  const { open, toggle, setOpen } = useReadEdit({ canEdit, revision });
  const live = useLiveSave({ open, medicalHistory, clinicalNotes, flagIds, saveNow });
  const toggleEditor = () => {
    // Done writes any text still being typed before the editor closes.
    if (open && saveNow) void live.flush();
    toggle();
  };
  const flags = useMemo(() => selectedFlags(flagIds), [flagIds]);
  const groups = useMemo(() => watchOutGroups(flagIds, floorMachines), [flagIds, floorMachines]);
  const history = medicalHistory.trim();
  const constraints = clinicalNotes.trim();
  const nothing = flags.length === 0 && !history && !constraints;

  return (
    <section
      className={cls("cx-card bp-watch", className)}
      data-editing={open ? "" : undefined}
      {...anchorProps("body-watchouts")}
    >
      <CardHead
        eyebrow="Watch-outs"
        icon={ShieldAlert}
        meta={dirty && !open ? <Chip tone="live">Unsaved</Chip> : null}
        actions={canEdit ? <EditButton open={open} onToggle={toggleEditor} label="Watch-outs" /> : null}
      />

      {open ? (
        <div className="bp-edit">
          <ClinicalFlagPicker
            value={[...(flagIds ?? [])]}
            onChange={(next) => (saveNow ? void live.saveFlags(next) : updateField("clinicalFlags", next))}
          />
          <TextArea
            label="Medical history"
            value={saveNow ? live.history : medicalHistory}
            onChange={(v) => (saveNow ? live.setHistory(v) : updateField("medicalHistory", v))}
            onBlur={saveNow ? () => void live.saveText("medicalHistory") : undefined}
            rows={7}
            placeholder="Surgeries, chronic conditions, anything a new coach must read before loading them."
          />
          <TextArea
            label="Contraindications & constraints"
            value={saveNow ? live.notes : clinicalNotes}
            onChange={(v) => (saveNow ? live.setNotes(v) : updateField("clinicalNotes", v))}
            onBlur={saveNow ? () => void live.saveText("clinicalNotes") : undefined}
            rows={5}
            placeholder="What the load has to work around. Specific movements, ranges or machines to avoid."
          />
          {saveNow ? (
            live.last ? (
              <div className="bp-saved" role="status">
                <Meta>{`Saved: ${live.last.label}.`}</Meta>
                <button type="button" className="cx-btn" onClick={() => void live.undo()}>
                  Undo
                </button>
              </div>
            ) : (
              <Meta>Each change saves as you make it; the text saves when you leave the box.</Meta>
            )
          ) : (
            <Meta>Nothing is saved until you tap Save changes on the bar at the bottom.</Meta>
          )}
        </div>
      ) : nothing ? (
        <EmptyLine action={canEdit ? { label: "Set them", onClick: () => setOpen(true) } : undefined}>
          No watch-outs on file.
        </EmptyLine>
      ) : (
        <>
          {flags.length > 0 ? (
            <Chips>
              {flags.map((f) => {
                const chip = flagChip(f);
                return (
                  <Chip key={f.id} tone={chip.tone}>
                    {chip.text}
                  </Chip>
                );
              })}
            </Chips>
          ) : null}

          {groups.length > 0 ? (
            <div className="bp-watch-list">
              {groups.map((g) => (
                <div key={g.key} className="bp-watch-item">
                  {g.general ? (
                    <Eyebrow as="p">{groupEyebrow(g)}</Eyebrow>
                  ) : (
                    <div className="bp-watch-item__machines">
                      {g.machines.map((m) =>
                        onOpenMachine ? (
                          <ChipButton key={m.id} onClick={() => onOpenMachine(m.id)} aria-label={`Open ${m.name}`}>
                            {m.name}
                            <ChevronRight size={14} aria-hidden="true" />
                          </ChipButton>
                        ) : (
                          <Chip key={m.id}>{m.name}</Chip>
                        ),
                      )}
                      <Meta>
                        {groupEyebrow(g)}
                        {g.namesOffFloor ? " · names no machine on this floor" : ""}
                      </Meta>
                    </div>
                  )}
                  <Quote className="bp-watch-item__quote">{g.instruction}</Quote>
                  {g.setup ? <p className="bp-foot">Set-up: {`“${g.setup}”`}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          <p className="bp-foot">
            {groups.length > 0 ? "Quoted in full from the studio's clinical list. " : ""}
            Medical history, as the team wrote it:{" "}
            <span className="bp-foot__quote">{history ? `“${history}”` : "Not written yet."}</span>
          </p>
          <p className="bp-foot">
            Contraindications &amp; constraints:{" "}
            <span className="bp-foot__quote">{constraints ? `“${constraints}”` : "Not written yet."}</span>
          </p>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Saving at once                                                       */
/* ------------------------------------------------------------------ */

type LiveKey = "clinicalFlags" | "medicalHistory" | "clinicalNotes";

const LIVE_LABEL: Record<LiveKey, string> = {
  clinicalFlags: "clinical flags",
  medicalHistory: "medical history",
  clinicalNotes: "contraindications & constraints",
};

/**
 * The editor's save-at-once state: the two text drafts (seeded from the
 * record each time the editor opens), the last change written, and Undo.
 */
function useLiveSave({
  open,
  medicalHistory,
  clinicalNotes,
  flagIds,
  saveNow,
}: {
  open: boolean;
  medicalHistory: string;
  clinicalNotes: string;
  flagIds: readonly string[] | null | undefined;
  saveNow?: (key: LiveKey, value: unknown) => Promise<boolean>;
}) {
  const [history, setHistory] = useState(medicalHistory);
  const [notes, setNotes] = useState(clinicalNotes);
  const [last, setLast] = useState<{ key: LiveKey; previous: unknown; label: string } | null>(null);
  const saved = useRef({ medicalHistory, clinicalNotes });

  // Opening the editor starts from the record as it is now.
  useEffect(() => {
    if (!open) return;
    setHistory(medicalHistory);
    setNotes(clinicalNotes);
    saved.current = { medicalHistory, clinicalNotes };
    setLast(null);
    // Only on opening: a snapshot while typing must not overwrite the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const typing = !!saveNow && open && (history !== saved.current.medicalHistory || notes !== saved.current.clinicalNotes);
  useUnsavedChanges(typing, "Watch-outs");

  const write = async (key: LiveKey, value: unknown, previous: unknown) => {
    if (!saveNow) return false;
    const ok = await saveNow(key, value);
    if (ok) setLast({ key, previous, label: LIVE_LABEL[key] });
    return ok;
  };

  const saveText = async (key: "medicalHistory" | "clinicalNotes") => {
    const value = key === "medicalHistory" ? history : notes;
    const previous = saved.current[key];
    if (value === previous) return true;
    const ok = await write(key, value, previous);
    if (ok) saved.current = { ...saved.current, [key]: value };
    return ok;
  };

  return {
    history,
    notes,
    setHistory,
    setNotes,
    last,
    saveText,
    saveFlags: (next: string[]) => write("clinicalFlags", next, [...(flagIds ?? [])]),
    flush: async () => {
      await saveText("medicalHistory");
      await saveText("clinicalNotes");
    },
    undo: async () => {
      if (!last || !saveNow) return;
      const ok = await saveNow(last.key, last.previous);
      if (!ok) return;
      if (last.key === "medicalHistory") {
        setHistory(String(last.previous ?? ""));
        saved.current = { ...saved.current, medicalHistory: String(last.previous ?? "") };
      } else if (last.key === "clinicalNotes") {
        setNotes(String(last.previous ?? ""));
        saved.current = { ...saved.current, clinicalNotes: String(last.previous ?? "") };
      }
      setLast(null);
    },
  };
}
