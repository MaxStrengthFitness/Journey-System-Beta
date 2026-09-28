import { BodyModel } from "../../components/anatomy";
import { useWikiPageGuard } from "../wiki/page-guard";
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
 *
 * ITS COLOURS ARE LEARNING'S TOKENS (voice review follow-up, Sep 27 2026).
 * It passed none, so BodyModel's built-in hex applied in both themes: the
 * worked muscles (#0A548B) and the rest of the body (#4B555C) were 1.04:1
 * apart, the one thing the figure is for. It now passes --wk-muscle-*, as
 * the codex's BodyFigure passes its own, and learning-tokens.test.ts holds
 * the worked muscles at 3:1 or more against the rest in both themes.
 */
const MUSCLE_COLOURS: [string, string] = ["var(--wk-muscle-primary)", "var(--wk-muscle-secondary)"];
const BODY_COLOUR = "var(--wk-muscle-base)";
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
  // A muscle is a link to another machine's page: it asks about typing on
  // this one first (features/wiki/page-guard).
  const guard = useWikiPageGuard();
  return (
    <div>
      <div className="wk__figure">
        <BodyModel
          primary={anatomy.primary}
          secondary={anatomy.secondary}
          gender={gender}
          view={view}
          colors={MUSCLE_COLOURS}
          baseFill={BODY_COLOUR}
          onRegionClick={onRegionClick ? (slug) => guard(() => onRegionClick(slug)) : undefined}
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
