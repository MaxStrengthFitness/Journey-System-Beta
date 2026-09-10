import { BodyModel } from "../../components/anatomy";
import type { MachineAnatomy } from "./anatomy";

/**
 * The anatomy figure, in the wiki's infobox.
 *
 * Round: Wiki Redesign, Sep 2026.
 *
 * Replaces AnatomyStage, whose only real difference is where it sits. The old
 * layout gave the model a column of its own on landscape and condensed it to
 * a 72px strip in portrait — so on the 834px portrait iPad this app is
 * actually used on, the thing the screen exists for became a bar you tapped
 * to get back. AJ was explicit this round: "keeping the model of the muscles
 * is key and all the info we have with it is fully necessary."
 *
 * So it is the first thing in the infobox in BOTH layouts, at a size worth
 * looking at, with the muscle names listed right underneath it in the same
 * box — the diagram cannot say "Gluteus Medius (hip horizontal abduction)",
 * and the two have disagreed on this screen before (see catalog/anatomy.ts).
 *
 * The controls sit BELOW the figure rather than above it. Above, they were
 * the first thing under the machine title and read as the page's primary
 * action; below, the figure is what you see first and the switch is where
 * your thumb already is.
 */
export interface MachineFigureProps {
  anatomy: MachineAnatomy;
  view: "front" | "back";
  gender: "male" | "female";
  onViewChange: (view: "front" | "back") => void;
  onGenderChange: (gender: "male" | "female") => void;
  /** Tapping a muscle group jumps to a machine that trains it. */
  onRegionClick?: (slug: string) => void;
}

export function MachineFigure({
  anatomy,
  view,
  gender,
  onViewChange,
  onGenderChange,
  onRegionClick,
}: MachineFigureProps) {
  return (
    <div>
      <div className="wk__figure">
        <BodyModel
          primary={anatomy.primary}
          secondary={anatomy.secondary}
          gender={gender}
          view={view}
          onRegionClick={onRegionClick}
        />
      </div>

      <div className="wk__figure-controls">
        <div className="wk__seg" role="group" aria-label="Figure view">
          <button
            type="button"
            className="wk__seg-btn"
            aria-pressed={view === "front"}
            onClick={() => onViewChange("front")}
          >
            Anterior
          </button>
          <button
            type="button"
            className="wk__seg-btn"
            aria-pressed={view === "back"}
            onClick={() => onViewChange("back")}
          >
            Posterior
          </button>
          <span className="wk__seg-divider" aria-hidden />
          <button
            type="button"
            className="wk__seg-btn"
            aria-pressed={gender === "male"}
            onClick={() => onGenderChange("male")}
          >
            Type M
          </button>
          <button
            type="button"
            className="wk__seg-btn"
            aria-pressed={gender === "female"}
            onClick={() => onGenderChange("female")}
          >
            Type F
          </button>
        </div>
      </div>
    </div>
  );
}
