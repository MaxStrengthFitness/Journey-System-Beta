/**
 * The body figure on Where it matters: the Catalog's muscle figure, front or
 * back, with a plum diamond where a watch-out is on file and an ink ring where
 * she told us something hurts. The marks come from figure-map.ts; this only
 * draws them.
 *
 * Client codex, Sep 2026 (phase 12); the figure became the Catalog's on Sep 26
 * (AJ: "update the pulse body visualizer to be matching to the body chart that
 * we use in the catalog"). It was a silhouette of its own. Now it is the same
 * BodyModel the Catalog and the Routine Builder draw, male or female by her
 * record, and the marks sit in a second svg laid over it in the figure's own
 * coordinates (`FIGURE_VIEWBOX`), so they land on the knee the figure draws.
 *
 * Colours are the codex tokens — never red, never a heat map: the two sources
 * are told apart by SHAPE. The figure and its marks are not tappable (a 10px
 * diamond is no target); the region list beside the figure is, and a tapped
 * region lights its marks here and its area on the figure, in the codex's
 * blue, as the Catalog lights a machine's muscles.
 */
import { useLayoutEffect, useRef } from "react";
import { BodyModel } from "../../../components/anatomy";
import type { Pronouns } from "../kit/pronouns";
import {
  DIAMOND_SIZE,
  FIGURE_VIEWBOX,
  figureLabel,
  type FigureGender,
  type FigureMark,
  type FigureRegion,
  type FigureView,
} from "./figure-map";

const LIT: [string, string] = ["var(--cx-muscle-lit)", "var(--cx-muscle-lit)"];
const NOTHING_LIT: readonly FigureRegion[] = [];

export function BodyFigure({
  view,
  gender,
  marks,
  highlight,
  pronouns,
}: {
  view: FigureView;
  gender: FigureGender;
  marks: readonly FigureMark[];
  highlight: FigureRegion | null;
  pronouns: Pick<Pronouns, "subject">;
}) {
  const mine = marks.filter((m) => m.view === view);
  const lit = highlight ? [highlight] : NOTHING_LIT;

  /*
   * The model stamps every path with its region as an `id` — dozens to a
   * figure, the same again on the other view. The codex allows no two
   * elements one id (its anchors and aria references rely on it), so each
   * region moves to `data-part` once the model has drawn. React leaves both
   * alone afterwards: it only rewrites a prop that changed, and `id` never
   * does. After every commit, so a path the model re-creates is caught too.
   */
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    bodyRef.current?.querySelectorAll("[id]").forEach((el) => {
      el.setAttribute("data-part", el.id);
      el.removeAttribute("id");
    });
  });

  return (
    <div className="bp-fig" data-gender={gender} role="img" aria-label={figureLabel(view, marks, pronouns)}>
      <div className="bp-fig__body" ref={bodyRef} aria-hidden="true">
        <BodyModel gender={gender} view={view} areas={lit} colors={LIT} baseFill="var(--cx-muscle)" />
      </div>
      <svg className="bp-fig__marks" viewBox={FIGURE_VIEWBOX[gender][view]} aria-hidden="true" focusable="false">
        {mine.map((m) => {
          const hl = highlight === m.region ? "" : undefined;
          if (m.kind === "onfile") {
            return (
              <rect
                key={m.key}
                className="bp-fig__onfile"
                data-region={m.region}
                data-hl={hl}
                x={m.x - DIAMOND_SIZE / 2}
                y={m.y - DIAMOND_SIZE / 2}
                width={DIAMOND_SIZE}
                height={DIAMOND_SIZE}
                transform={`rotate(45 ${m.x} ${m.y})`}
              />
            );
          }
          return (
            <circle key={m.key} className="bp-fig__told" data-region={m.region} data-hl={hl} cx={m.x} cy={m.y} r={m.r} />
          );
        })}
      </svg>
    </div>
  );
}
