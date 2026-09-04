import { BodyModel } from "../../components/anatomy";
import type { MachineAnatomy } from "./anatomy";

/**
 * The figure, plus the two controls that change what it shows.
 *
 * In split mode this sits in the middle column and NEVER scrolls — not because
 * anything is pinned, but because only the rail and the detail pane overflow.
 * That is the whole of the "the model disappears when I scroll" fix.
 */
export interface AnatomyStageProps {
  anatomy: MachineAnatomy;
  view: "front" | "back";
  gender: "male" | "female";
  onViewChange: (view: "front" | "back") => void;
  onGenderChange: (gender: "male" | "female") => void;
  onRegionClick?: (slug: string) => void;
}

export function AnatomyStage({
  anatomy,
  view,
  gender,
  onViewChange,
  onGenderChange,
  onRegionClick,
}: AnatomyStageProps) {
  return (
    <div className="cat__stage">
      <div className="cat__segmented" role="group" aria-label="Figure view">
        <button
          type="button"
          className="cat__seg"
          aria-pressed={view === "front"}
          onClick={() => onViewChange("front")}
        >
          Anterior
        </button>
        <button
          type="button"
          className="cat__seg"
          aria-pressed={view === "back"}
          onClick={() => onViewChange("back")}
        >
          Posterior
        </button>
        <span className="cat__seg-divider" aria-hidden />
        <button
          type="button"
          className="cat__seg"
          aria-pressed={gender === "male"}
          onClick={() => onGenderChange("male")}
        >
          Type M
        </button>
        <button
          type="button"
          className="cat__seg"
          aria-pressed={gender === "female"}
          onClick={() => onGenderChange("female")}
        >
          Type F
        </button>
      </div>

      <div className="cat__figure">
        <BodyModel
          primary={anatomy.primary}
          secondary={anatomy.secondary}
          gender={gender}
          view={view}
          onRegionClick={onRegionClick}
        />
      </div>
    </div>
  );
}
