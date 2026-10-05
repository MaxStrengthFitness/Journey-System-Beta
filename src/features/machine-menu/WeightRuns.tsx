/**
 * THE MACHINE MENU — Weight by weight: one line for each run at one weight.
 *
 * AJ's "instead of scrolling two hundred sessions": every run of counted
 * sessions at one load is one line, newest first — the weight, how many
 * times, the dates and the reps in order, marks by exception — so a long
 * history reads as a short list. A folded gap and a set-up change sit between
 * the runs as divider lines; practice and skips are noted, never counted.
 *
 * The structure is step-runs.ts and every word timeline-words.ts's
 * `runLines`. Counts only: no rate, no score, no advice word.
 */
import { stepRuns } from "./step-runs";
import type { TimelineModel } from "./timeline-model";
import { RUNS_FOOT, RUNS_LIST_LABEL, runLines, type WordsContext } from "./timeline-words";
import "./machine-menu.css";

/** "100 lb · 3 times · …": the load is the line's lead, drawn larger. */
function splitLead(text: string, weight: number | null): [string, string] | null {
  if (weight === null) return null;
  const lead = `${weight} lb`;
  return text.startsWith(`${lead} · `) ? [lead, text.slice(lead.length)] : null;
}

export function WeightRuns({ id, model, ctx }: { id?: string; model: TimelineModel; ctx: Pick<WordsContext, "today"> }) {
  const lines = runLines(stepRuns(model), model, ctx);
  return (
    <div className="mm-listbody" id={id} data-list="runs">
      <ol className="mm-runs" aria-label={RUNS_LIST_LABEL}>
        {lines.map((line, k) => {
          if (line.kind === "divider") {
            return (
              <li key={k} className="mm-run-div" data-divider="">
                <span className="mm-run-div__t">{line.text}</span>
              </li>
            );
          }
          const parts = splitLead(line.text, line.weight);
          return (
            <li key={k} className="mm-run" data-run={line.weight ?? ""}>
              {parts ? (
                <>
                  <b className="mm-run__w">{parts[0]}</b>
                  {parts[1]}
                </>
              ) : (
                line.text
              )}
            </li>
          );
        })}
      </ol>
      <p className="mm-runs__foot">{RUNS_FOOT}</p>
    </div>
  );
}
