/**
 * Picking machines off THIS studio's floor (the design round, §4.3): the
 * floor by the Academy's families, as tiles numbered in the order they were
 * picked, and the same floor as chips with the plan's machines first, for
 * the can't-do and Re-plan sheets. A machine the client can't do is shown
 * as such, never offered.
 */
import { useState } from "react";
import { Ban, ChevronDown, ChevronUp } from "lucide-react";
import { floorByFamily } from "../lineup";
import type { FloorMachine } from "../starting-plan";
import { Chip } from "./parts";

export function FloorPicker({
  floor,
  picked,
  held = [],
  firstName,
  nameOf,
  onTap,
}: {
  floor: readonly FloorMachine[];
  /** In the order picked: a picked tile shows its place. */
  picked: readonly string[];
  /** On the bench: shown, never offered. */
  held?: readonly string[];
  firstName: string;
  nameOf: (id: string) => string;
  onTap: (id: string) => void;
}) {
  const families = floorByFamily(floor);
  if (families.length === 0) return <p className="rpl-meta">This studio's floor has no machines listed yet.</p>;
  return (
    <div className="rpl-floor">
      {families.map((f) => (
        <div key={f.key}>
          <p className="rpl-family__label">{f.label}</p>
          <div className="rpl-tiles">
            {f.machineIds.map((id) => {
              if (held.includes(id)) {
                return (
                  <div key={id} className="rpl-tile rpl-tile--held">
                    <Ban size={16} aria-hidden="true" />
                    <span className="rpl-tile__name">
                      {nameOf(id)} · not for {firstName}
                    </span>
                  </div>
                );
              }
              const at = picked.indexOf(id);
              return (
                <button key={id} type="button" className="rpl-tile" aria-pressed={at >= 0} onClick={() => onTap(id)}>
                  {at >= 0 && (
                    <span className="rpl-tile__n" aria-hidden="true">
                      {at + 1}
                    </span>
                  )}
                  <span className="rpl-tile__name">{nameOf(id)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The floor as chips: the plan's machines first, then the rest of this
 * studio's floor by family, folded when `fold` (a client's limit may be on a
 * machine the plan doesn't use yet). The bench's machines aren't offered.
 */
export function MachineChips({
  floor,
  plan,
  exclude,
  isOn,
  onTap,
  nameOf,
  fold = false,
}: {
  floor: readonly FloorMachine[];
  plan: readonly string[];
  exclude: readonly string[];
  isOn: (id: string) => boolean;
  onTap: (id: string) => void;
  nameOf: (id: string) => string;
  fold?: boolean;
}) {
  const [open, setOpen] = useState(!fold);
  const inPlan = plan.filter((id, i) => plan.indexOf(id) === i && !exclude.includes(id));
  const rest = floorByFamily(floor)
    .map((f) => ({ ...f, machineIds: f.machineIds.filter((id) => !plan.includes(id) && !exclude.includes(id)) }))
    .filter((f) => f.machineIds.length > 0);
  const chips = (ids: readonly string[]) => (
    <div className="rpl-chips">
      {ids.map((id) => (
        <Chip key={id} on={isOn(id)} onClick={() => onTap(id)}>
          {nameOf(id)}
        </Chip>
      ))}
    </div>
  );
  return (
    <div className="rpl-sheet__section">
      {inPlan.length > 0 && (
        <div className="rpl-sheet__section">
          <p className="rpl-meta">In the plan</p>
          {chips(inPlan)}
        </div>
      )}
      {fold && rest.length > 0 && (
        <div>
          <button type="button" className="rpl-chip" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
            Rest of the floor
          </button>
        </div>
      )}
      {open &&
        rest.map((f) => (
          <div key={f.key} className="rpl-sheet__section">
            <p className="rpl-meta">{f.label}</p>
            {chips(f.machineIds)}
          </div>
        ))}
    </div>
  );
}
