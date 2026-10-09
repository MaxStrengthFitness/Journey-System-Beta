/**
 * THE ROAD — the plan as one line (the design round, Oct 8 2026; AJ's "1d":
 * the Lineup on Programming, "with the Road's one-line route wherever a
 * glance is all there is: the briefing, the session's Plan chip and the
 * Wrap-up").
 *
 * Today's machines sit under a "Today" bracket, solid; then the rest of the
 * road, hollow, the next one marked "Next stop"; and, when there are any, the
 * machines the client can't do, crossed. The line runs left to right and
 * wraps onto as many lines as it needs: a station is a fixed width, and its
 * name wraps under its dot, never cut short. Under it, the progress line
 * ("3 of 6 · next: Hip Abduction") and, when asked for, the segmented meter.
 *
 * Pure drawing: the groups come from `roadGroups` (lineup.ts), the names
 * from the caller (a floor's names).
 */
import { Fragment } from "react";
import type { RoadGroup, RoadStationKind } from "../lineup";
import type { PlanProgress } from "../plan";
import { PlanMeter } from "./parts";
import "./routine-plan.css";

export interface RoadStripProps {
  groups: readonly RoadGroup[];
  nameOf: (id: string) => string;
  /** "3 of 6 · next: Hip Abduction", under the line. */
  progressLine?: string | null;
  /** The segmented meter under the progress line. */
  progress?: PlanProgress | null;
  /** What the strip is, for a screen reader: "Routine A's plan". */
  label?: string;
}

const KIND_WORDS: Record<RoadStationKind, string> = {
  in: "today",
  planned: "planned",
  next: "next stop",
  cantdo: "can't do",
};

export function RoadStrip({ groups, nameOf, progressLine, progress, label = "The plan" }: RoadStripProps) {
  const total = groups.reduce((n, g) => n + g.stations.length, 0);
  let at = 0;
  return (
    <div className="rpl-road" role="group" aria-label={label}>
      <div className="rpl-road__groups">
        {groups.map((g) => (
          <div key={g.key} className={g.bracket ? "rpl-road__group rpl-road__group--bracket" : "rpl-road__group"}>
            <span className="rpl-road__label">{g.label}</span>
            <span className="rpl-road__bracket" aria-hidden="true" />
            <ol className="rpl-road__stops">
              {g.stations.map((s) => {
                const i = at++;
                const lineClass = s.kind === "in" ? "rpl-road__line rpl-road__line--in" : "rpl-road__line";
                return (
                  <li key={s.id} className="rpl-road__stop" data-kind={s.kind} aria-label={`${nameOf(s.id)}, ${KIND_WORDS[s.kind]}`}>
                    <span className="rpl-road__track" aria-hidden="true">
                      {i > 0 && <span className={`${lineClass} rpl-road__line--before`} />}
                      {i < total - 1 && <span className={`${lineClass} rpl-road__line--after`} />}
                      <span className="rpl-road__dot" data-kind={s.kind} />
                    </span>
                    <span className="rpl-road__name">{nameOf(s.id)}</span>
                    {s.mark && <span className="rpl-road__mark">{s.mark}</span>}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      {(progressLine || progress) && (
        <Fragment>
          {progressLine && <p className="rpl-road__progress">{progressLine}</p>}
          {progress && progress.of > 0 && <PlanMeter progress={progress} />}
        </Fragment>
      )}
    </div>
  );
}
