/**
 * THE SHIFT STRIP — the recurring ops, collapsed.
 *
 * This is the single biggest change in the round. AJ's own words: "the main
 * one trainers are going to be going on here for is just to mark off, hey I
 * did all the opening tasks, I did all the cleaning tasks, I did all the
 * closing tasks."
 *
 * The old screen rendered that as 21 checkbox rows, 19 of which were one chore
 * expanded per machine. So the job that should cost three taps cost twenty-one,
 * and the human content that trainers actually needed to READ was pushed below
 * the fold by cleaning.
 *
 * So: one line per group, a count, and a Mark all. Expanding to see individual
 * machines is available and deliberately secondary — at close, the answer is
 * almost always "all of them", and the per-machine detail matters when
 * something could not be done, not when everything could.
 *
 * A finished group stays visible rather than disappearing. Disappearing rows
 * are how a trainer loses track of whether they did a thing or the app ate it,
 * and "Closing ✓" is worth more at a glance than an absence.
 */
import { useState } from "react";
import { Check, ChevronDown, Flag } from "lucide-react";
import { SHIFT_LABEL, type StudioTaskCategory, type TaskRow } from "./types";
import { shiftGroups, shiftTotals, type ShiftGroup } from "./board";

export interface ShiftStripProps {
  rows: TaskRow[];
  studioCategories?: StudioTaskCategory[];
  busyIds?: Set<string>;
  /** Close one row. */
  onComplete: (row: TaskRow) => void;
  /** Close every open row in the group, in one batch. */
  onCompleteGroup: (group: ShiftGroup) => void;
  /** Re-open a row that was ticked in error. */
  onReopen?: (row: TaskRow) => void;
  /** Report a problem instead of completing — writes the flag on the instance. */
  onFlag?: (row: TaskRow) => void;
}

export function ShiftStrip({
  rows,
  studioCategories,
  busyIds,
  onComplete,
  onCompleteGroup,
  onReopen,
  onFlag,
}: ShiftStripProps) {
  const groups = shiftGroups(rows, studioCategories);
  const totals = shiftTotals(groups);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (groups.length === 0) {
    return (
      <section className="sh__strip sh__strip--empty">
        <p className="sh__strip-clear">
          Nothing scheduled today. Enjoy it.
        </p>
      </section>
    );
  }

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="sh__strip" aria-label="Today's shift">
      <header className="sh__strip-head">
        <h2 className="sh__strip-title">My shift</h2>
        <span
          className="sh__strip-count tabular"
          // The count is the honest headline. A studio at 2 of 21 should see
          // that, not a cheerful summary of the two.
          aria-label={`${totals.done} of ${totals.total} done`}
        >
          {totals.done} / {totals.total}
        </span>
      </header>

      <ul className="sh__groups">
        {groups.map((g) => {
          const key = `${g.templateId}__${g.shift}`;
          const isOpen = expanded.has(key);
          const openRows = g.rows.filter((r) => r.status === "open");
          const busy = g.rows.some((r) => busyIds?.has(r.id));

          return (
            <li
              key={key}
              className={`sh__group${g.complete ? " sh__group--done" : ""}`}
            >
              <div className="sh__group-row">
                <span
                  className={`sh__tick${g.complete ? " sh__tick--on" : ""}`}
                  aria-hidden
                >
                  {g.complete && <Check size={13} strokeWidth={3} />}
                </span>

                <button
                  type="button"
                  className="sh__group-main"
                  onClick={() => g.expandable && toggle(key)}
                  // A single-row group has nothing to expand into, so it must
                  // not present itself as expandable.
                  aria-expanded={g.expandable ? isOpen : undefined}
                  disabled={!g.expandable}
                >
                  <span className="sh__group-title">{g.title}</span>
                  <span className="sh__group-meta">
                    {SHIFT_LABEL[g.shift]}
                    {g.total > 1 && (
                      <>
                        {" · "}
                        <span className="tabular">
                          {g.done} of {g.total}
                        </span>
                      </>
                    )}
                  </span>
                </button>

                {g.expandable && (
                  <ChevronDown
                    size={15}
                    className={`sh__chev${isOpen ? " sh__chev--open" : ""}`}
                    aria-hidden
                  />
                )}

                {!g.complete && (
                  <button
                    type="button"
                    className="sh__markall"
                    disabled={busy}
                    onClick={() => onCompleteGroup(g)}
                  >
                    {g.total > 1 ? `Mark all ${openRows.length}` : "Done"}
                  </button>
                )}
              </div>

              {isOpen && g.expandable && (
                <ul className="sh__rows">
                  {g.rows.map((r) => (
                    <li key={r.id} className="sh__row">
                      <button
                        type="button"
                        className={`sh__row-tick${
                          r.status === "done" ? " sh__row-tick--on" : ""
                        }`}
                        disabled={busyIds?.has(r.id)}
                        aria-pressed={r.status === "done"}
                        onClick={() =>
                          r.status === "done"
                            ? onReopen?.(r)
                            : onComplete(r)
                        }
                      >
                        {r.status === "done" && (
                          <Check size={12} strokeWidth={3} aria-hidden />
                        )}
                      </button>
                      <span className="sh__row-name">
                        {r.machineName ?? r.clientName ?? r.title}
                      </span>
                      {r.status === "skipped" && (
                        <span className="sh__row-skipped">Skipped</span>
                      )}
                      {onFlag && r.status !== "done" && (
                        <button
                          type="button"
                          className="sh__row-flag"
                          title="Report a problem with this one"
                          aria-label={`Report a problem with ${
                            r.machineName ?? r.title
                          }`}
                          onClick={() => onFlag(r)}
                        >
                          <Flag size={13} aria-hidden />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
