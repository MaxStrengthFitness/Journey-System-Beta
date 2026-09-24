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
 * Every field writes through the shell's ONE form (`updateField`); Done only
 * closes the editor, and the Save bar saves ("Body & Pulse · Watch-outs").
 */
import { useMemo } from "react";
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
  onOpenMachine,
  className,
}: WatchOutsCardProps) {
  const { open, toggle, setOpen } = useReadEdit({ canEdit, revision });
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
        actions={canEdit ? <EditButton open={open} onToggle={toggle} label="Watch-outs" /> : null}
      />

      {open ? (
        <div className="bp-edit">
          <ClinicalFlagPicker value={[...(flagIds ?? [])]} onChange={(next) => updateField("clinicalFlags", next)} />
          <TextArea
            label="Medical history"
            value={medicalHistory}
            onChange={(v) => updateField("medicalHistory", v)}
            rows={7}
            placeholder="Surgeries, chronic conditions, anything a new coach must read before loading them."
          />
          <TextArea
            label="Contraindications & constraints"
            value={clinicalNotes}
            onChange={(v) => updateField("clinicalNotes", v)}
            rows={5}
            placeholder="What the load has to work around. Specific movements, ranges or machines to avoid."
          />
          <Meta>Nothing is saved until you tap Save changes on the bar at the bottom.</Meta>
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
