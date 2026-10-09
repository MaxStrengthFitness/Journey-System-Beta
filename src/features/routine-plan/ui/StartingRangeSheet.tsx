/**
 * THE ACADEMY'S STARTING RANGE — the column, picked once per client (the
 * design round, Oct 8 2026, §4.6; AJ's "3a": "The trainer picks one of the
 * Academy sheet's four columns once per client, labelled as the sheet labels
 * them. After that, the range shows beside the weight on any first time on a
 * machine").
 *
 * Two faces of one sheet, opened from the Now Bar:
 * - "pick": the sheet's four columns with its own labels, and Don't show
 *   ranges, five answers to one question, the current one the blue chip.
 *   The app never picks one, and never from the client's gender. The
 *   sheet's labels are drawn here only; elsewhere a column is its level.
 * - "about": the (i) on the range line: the sheet's notes and its source,
 *   Change column and Don't show ranges.
 *
 * AJ: "Thing I don't like about the Academy starting weights is they don't
 * really follow too much. I think we can use this as a crutch until we have
 * reliable data within our app. But let's go ahead and just have this as a
 * reference point, not as an end-all be-all." So nothing here puts a number
 * in the weight: the trainer types the weight.
 *
 * The sheet only asks; the caller writes the pick (a "column" change on
 * Routine A's plan, never awaited, or this session's state when there is no
 * plan to keep it on).
 */
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startingSourceWords } from "../start-part";
import { STARTING_COLUMN_LABEL, STARTING_COLUMN_LEVEL, STARTING_WEIGHTS_NOTES, STARTING_WEIGHTS_SOURCE, type StartingColumn } from "../starting-weights";
import { Chip, PlanSheet, SourceTag } from "./parts";

const COLUMNS = Object.keys(STARTING_COLUMN_LABEL) as StartingColumn[];

export interface StartingRangeSheetProps {
  open: boolean;
  mode: "pick" | "about";
  firstName: string;
  /** The column picked now, if any. */
  column: StartingColumn | "none" | undefined;
  /** Routine A has a plan to keep the pick on; without one it is kept for today's session only. */
  keptOnPlan: boolean;
  onPick: (column: StartingColumn | "none") => void;
  /** From "about" to "pick". */
  onChangeColumn: () => void;
  onClose: () => void;
}

export function StartingRangeSheet({ open, mode, firstName, column, keptOnPlan, onPick, onChangeColumn, onClose }: StartingRangeSheetProps) {
  const source = startingSourceWords(STARTING_WEIGHTS_SOURCE);
  const kept = keptOnPlan ? "Kept on Routine A's plan, for every trainer." : "Kept for today's session.";
  const first = firstName.trim() || "the client";
  return (
    <PlanSheet
      open={open}
      title={mode === "pick" ? `Which of the Academy's columns fits ${first}?` : "The Academy's starting weights"}
      meta={mode === "pick" ? "A reference beside the weight, never a weight." : "A reference, not a rule."}
      onClose={onClose}
      footer={
        mode === "about" ? (
          <>
            <Button variant="ghost" onClick={() => onPick("none")}>
              Don't show ranges
            </Button>
            <Button variant="outline" onClick={onChangeColumn}>
              Change column
            </Button>
          </>
        ) : undefined
      }
    >
      {mode === "pick" ? (
        <section className="rpl-sheet__section">
          <div className="rpl-chips" role="group" aria-label="The Academy's columns">
            {COLUMNS.map((c) => (
              <Chip key={c} on={column === c} onClick={() => onPick(c)}>
                {column === c && <Check size={16} aria-hidden="true" />}
                {STARTING_COLUMN_LABEL[c]}
              </Chip>
            ))}
            {/* The fifth answer, beside the four: picked, it is the blue chip (every selection is blue). */}
            <Chip on={column === "none"} onClick={() => onPick("none")}>
              {column === "none" && <Check size={16} aria-hidden="true" />}
              Don't show ranges
            </Chip>
          </div>
          <p className="rpl-meta">{kept}</p>
        </section>
      ) : (
        <section className="rpl-sheet__section">
          <ul className="rpl-notes">
            {STARTING_WEIGHTS_NOTES.map((n) => (
              <li key={n} className="rpl-well">
                {n}
              </li>
            ))}
          </ul>
          {column && column !== "none" && <p className="rpl-meta">Column: {STARTING_COLUMN_LEVEL[column]} · {kept}</p>}
        </section>
      )}
      {source && (
        <div>
          <SourceTag>{source}</SourceTag>
        </div>
      )}
    </PlanSheet>
  );
}
