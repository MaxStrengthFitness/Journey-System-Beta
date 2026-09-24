/**
 * The body figure on Where it matters: one simple silhouette, front or back,
 * with a plum diamond where a watch-out is on file and an ink ring where she
 * told us something hurts. The marks come from figure-map.ts; this only
 * draws them.
 *
 * Client codex, Sep 2026 (phase 12). The silhouette is the approved mockup's
 * (viewBox 0 0 120 262), used for both views. Colours are the codex tokens
 * through body.css classes — never red, never a heat map: the two sources are
 * told apart by SHAPE. The marks are not tappable (a 9px diamond is no
 * target); the region list beside the figure is, and a tapped region lights
 * its marks here.
 */
import type { Pronouns } from "../kit/pronouns";
import { figureLabel, type FigureMark, type FigureRegion, type FigureView } from "./figure-map";

/** The silhouette: head, neck, torso, pelvis, arms, hands, legs, feet. */
function Silhouette() {
  return (
    <g aria-hidden="true">
      <circle className="bp-fig__b" cx="60" cy="21" r="15" />
      <rect className="bp-fig__b" x="53" y="35" width="14" height="11" rx="4" />
      <rect className="bp-fig__b" x="34" y="45" width="52" height="76" rx="15" />
      <rect className="bp-fig__b" x="38" y="114" width="44" height="28" rx="11" />
      <rect className="bp-fig__b" x="18" y="49" width="14" height="56" rx="7" />
      <rect className="bp-fig__b" x="88" y="49" width="14" height="56" rx="7" />
      <rect className="bp-fig__b" x="15" y="103" width="13" height="52" rx="6.5" />
      <rect className="bp-fig__b" x="92" y="103" width="13" height="52" rx="6.5" />
      <circle className="bp-fig__b" cx="21" cy="162" r="7" />
      <circle className="bp-fig__b" cx="99" cy="162" r="7" />
      <rect className="bp-fig__b" x="40" y="138" width="18" height="64" rx="9" />
      <rect className="bp-fig__b" x="62" y="138" width="18" height="64" rx="9" />
      <rect className="bp-fig__b" x="41" y="204" width="16" height="46" rx="8" />
      <rect className="bp-fig__b" x="63" y="204" width="16" height="46" rx="8" />
      <rect className="bp-fig__b" x="37" y="248" width="21" height="9" rx="4.5" />
      <rect className="bp-fig__b" x="62" y="248" width="21" height="9" rx="4.5" />
    </g>
  );
}

/** A 9×9 square turned 45° about its centre. */
const DIAMOND = 9;

export function BodyFigure({
  view,
  marks,
  highlight,
  pronouns,
}: {
  view: FigureView;
  marks: readonly FigureMark[];
  highlight: FigureRegion | null;
  pronouns: Pick<Pronouns, "subject">;
}) {
  const mine = marks.filter((m) => m.view === view);
  return (
    <svg className="bp-fig" viewBox="0 0 120 262" role="img" aria-label={figureLabel(view, marks, pronouns)}>
      <Silhouette />
      {mine.map((m) => {
        const hl = highlight === m.region ? "" : undefined;
        if (m.kind === "onfile") {
          return (
            <rect
              key={m.key}
              className="bp-fig__onfile"
              data-region={m.region}
              data-hl={hl}
              x={m.x - DIAMOND / 2}
              y={m.y - DIAMOND / 2}
              width={DIAMOND}
              height={DIAMOND}
              transform={`rotate(45 ${m.x} ${m.y})`}
            />
          );
        }
        return (
          <circle key={m.key} className="bp-fig__told" data-region={m.region} data-hl={hl} cx={m.x} cy={m.y} r={m.r} />
        );
      })}
    </svg>
  );
}
