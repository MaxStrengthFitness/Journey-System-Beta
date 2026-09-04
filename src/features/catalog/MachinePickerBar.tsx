import { ChevronUp } from "lucide-react";
import type { CSSProperties } from "react";
import { BodyModel } from "../../components/anatomy";
import { accentVar } from "./accents";
import type { CatalogMachine } from "./types";

/**
 * Stack mode's one control, doing two jobs the old layout did badly.
 *
 * IT NAMES THE SELECTION. A carousel indicates the current machine by
 * POSITION, so the active card can sit half-scrolled with two neighbours
 * looking nearly as prominent — exactly what the reported screenshot showed.
 * A bar cannot be ambiguous: one machine name, full size, and it is the
 * selected one.
 *
 * IT KEEPS THE FIGURE ON SCREEN. It is sticky and sits directly BELOW the full
 * figure, so at rest you see the model at full size and, the moment it scrolls
 * away, the bar pins to the top carrying a small one. That is the whole of the
 * "when I scroll into the details the model disappears" fix in portrait — no
 * IntersectionObserver, no scroll listener, no second element appearing and
 * pushing the content down by its own height. position:sticky already does it.
 */
export interface MachinePickerBarProps {
  machine: CatalogMachine | null;
  count: number;
  view: "front" | "back";
  gender: "male" | "female";
  onOpen: () => void;
}

export function MachinePickerBar({
  machine,
  count,
  view,
  gender,
  onOpen,
}: MachinePickerBarProps) {
  return (
    <button
      type="button"
      className="cat__picker-bar"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={
        machine
          ? `Selected machine: ${machine.name}. Choose from ${count} machines.`
          : `Choose from ${count} machines`
      }
      style={
        {
          "--cat-item-accent": accentVar(machine?.movementPattern ?? ""),
        } as CSSProperties
      }
    >
      {machine && (
        <span className="cat__picker-bar-figure" aria-hidden>
          <BodyModel
            primary={machine.anatomy.primary}
            secondary={machine.anatomy.secondary}
            gender={gender}
            view={view}
          />
        </span>
      )}
      <span className="cat__picker-bar-text">
        <span className="cat__picker-bar-pattern">
          {machine?.movementPattern ?? "Equipment"}
        </span>
        <span className="cat__picker-bar-name">
          {machine?.name ?? "Select a machine"}
        </span>
      </span>
      <span className="cat__picker-bar-cta">
        {count}
        <ChevronUp size={14} aria-hidden />
      </span>
    </button>
  );
}
