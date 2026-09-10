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
 *
 * ============================================================================
 * WHO — added Sep 2026 after a flow review
 * ============================================================================
 * The strip used to say nothing at all about people. Three problems, one root:
 *
 *   - It was headed "My shift" and showed the STUDIO's shared list. Nine
 *     trainers on nine iPads saw the same "2 / 21", and none of it was theirs.
 *   - `completedBy` had been written on every tick since the feature shipped
 *     and appeared in exactly one place: the manager's review panel. The
 *     people doing the work never saw who had done what, which on a shared
 *     list makes "someone else probably got it" the rational read.
 *   - `toggleClaim` was fully implemented in useTaskActions, exported, and
 *     called by nothing. The soft-claim design — argued at length on
 *     TaskInstance.claimedBy — never reached a button.
 *
 * NONE OF THIS IS OWNERSHIP, and that is AJ's explicit call. A claim is
 * advisory: the tick box stays live for everyone, so a trainer who claims the
 * bins and then gets pulled into a consultation does not leave the bin full
 * because the app told everyone else it was handled.
 *
 * It also now distinguishes the two TIERS. useStudioTasks merges the studio's
 * shared list and the trainer's private one into a single array — deliberately
 * — but the strip rendered them identically, so ticking a row that eight
 * colleagues can see looked exactly like ticking a private note. Personal
 * groups carry a "Just you" badge.
 */
import { useState } from "react";
import { Check, ChevronDown, Flag, Lock, UserPlus, UserRound } from "lucide-react";
import { SHIFT_LABEL, type StudioTaskCategory, type TaskRow } from "./types";
import { shiftGroupCredit, shiftGroups, shiftTotals, type ShiftGroup } from "./board";

export interface ShiftStripProps {
  rows: TaskRow[];
  studioCategories?: StudioTaskCategory[];
  busyIds?: Set<string>;
  /** The signed-in trainer, for "you have this" vs "Sarah has this". */
  trainerId?: string | null;
  /** Narrows the heading only; the caller has already filtered `rows`. */
  mineOnly?: boolean;
  /** Close one row. */
  onComplete: (row: TaskRow) => void;
  /** Close every open row in the group, in one batch. */
  onCompleteGroup: (group: ShiftGroup) => void;
  /** Re-open a row that was ticked in error. */
  onReopen?: (row: TaskRow) => void;
  /** Report a problem instead of completing — writes the flag on the instance. */
  onFlag?: (row: TaskRow) => void;
  /**
   * Take or hand back a group. Advisory only — see the header.
   *
   * Applied to every OPEN row in the group, because the group is the unit a
   * trainer thinks in: "I've got closing", not "I've got the leg press, the
   * chest press and seventeen others".
   */
  onToggleClaim?: (group: ShiftGroup) => void;
  /**
   * Open the assign picker for a group. Head trainers and studio leaders only
   * — the caller decides, and firestore.rules enforces it independently, so a
   * hidden button is a convenience rather than the security boundary.
   */
  onAssign?: (group: ShiftGroup) => void;
}

export function ShiftStrip({
  rows,
  studioCategories,
  busyIds,
  trainerId,
  mineOnly,
  onComplete,
  onCompleteGroup,
  onReopen,
  onFlag,
  onToggleClaim,
  onAssign,
}: ShiftStripProps) {
  const groups = shiftGroups(rows, studioCategories, { trainerId });
  const totals = shiftTotals(groups);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (groups.length === 0) {
    return (
      <section className="sh__strip sh__strip--empty">
        <p className="sh__strip-clear">
          {mineOnly
            ? "Nothing here is yours yet. Take something below, or switch back to Everyone."
            : "Nothing scheduled today. Enjoy it."}
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
        {/*
          Not "My shift". This is the studio's list — the old heading claimed
          ownership the data never had. It becomes "Mine" only when the caller
          has actually filtered to this trainer's rows.
        */}
        <h2 className="sh__strip-title">{mineOnly ? "Mine today" : "Today's shift"}</h2>
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
          const key = `${g.scope}__${g.templateId}__${g.shift}`;
          const isOpen = expanded.has(key);
          const openRows = g.rows.filter((r) => r.status === "open");
          const busy = g.rows.some((r) => busyIds?.has(r.id));
          const credit = shiftGroupCredit(g);
          const mineClaim = Boolean(trainerId && g.claimedBy?.id === trainerId);
          const mineAssigned = Boolean(
            trainerId && g.assignedTo?.id === trainerId,
          );

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
                  <span className="sh__group-title">
                    {g.title}
                    {/*
                      A private task looks identical to a shared one otherwise,
                      and ticking a shared row is a statement to eight
                      colleagues. The badge is the only thing telling them apart.
                    */}
                    {g.scope === "personal" && (
                      <span className="sh__own" title="Only you can see this">
                        <Lock size={10} aria-hidden />
                        Just you
                      </span>
                    )}
                  </span>
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
                    {credit && (
                      <>
                        {" · "}
                        <span
                          className={`sh__credit${
                            g.assignedTo ? " sh__credit--assigned" : ""
                          }`}
                        >
                          {/* "Yours" outranks "You're on it": being assigned
                              is the stronger fact, and it is the one somebody
                              else decided. */}
                          {mineAssigned
                            ? "Yours"
                            : mineClaim && !g.assignedTo
                              ? "You're on it"
                              : credit}
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

                {/*
                  Assigning is a manager's act and a private task has no one to
                  assign it to, so it is offered on studio work only, and only
                  when the caller says this trainer may.
                */}
                {!g.complete && onAssign && g.scope === "studio" && (
                  <button
                    type="button"
                    className={`sh__assign${g.assignedTo ? " sh__assign--on" : ""}`}
                    disabled={busy}
                    onClick={() => onAssign(g)}
                    title={
                      g.assignedTo
                        ? `${g.assignedTo.name} has this — tap to change`
                        : "Put someone's name on this"
                    }
                    aria-label={
                      g.assignedTo
                        ? `Change who is assigned to ${g.title}`
                        : `Assign ${g.title} to someone`
                    }
                  >
                    <UserPlus size={13} aria-hidden />
                    <span className="sh__assign-label">
                      {g.assignedTo ? g.assignedTo.name.split(" ")[0] : "Assign"}
                    </span>
                  </button>
                )}

                {/*
                  Claiming is offered on the studio's own work only. A private
                  task is already yours; a "take it" button on it would be
                  asking whether you would like to own the thing you wrote.
                */}
                {!g.complete && onToggleClaim && g.scope === "studio" && (
                  <button
                    type="button"
                    className={`sh__claim${mineClaim ? " sh__claim--mine" : ""}`}
                    disabled={busy}
                    aria-pressed={mineClaim}
                    onClick={() => onToggleClaim(g)}
                    title={
                      mineClaim
                        ? "Hand this back to the floor"
                        : "Let the floor know you're on this"
                    }
                  >
                    <UserRound size={13} aria-hidden />
                    <span className="sh__claim-label">
                      {mineClaim ? "Drop" : "Take it"}
                    </span>
                  </button>
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
                  {g.rows.map((r) => {
                    const who =
                      r.status === "done"
                        ? r.instance?.completedBy?.name
                        : (r.instance?.claimedBy?.name ??
                          r.instance?.assignedTo?.name);
                    return (
                      <li key={r.id} className="sh__row">
                        <button
                          type="button"
                          className={`sh__row-tick${
                            r.status === "done" ? " sh__row-tick--on" : ""
                          }`}
                          disabled={busyIds?.has(r.id)}
                          aria-pressed={r.status === "done"}
                          onClick={() =>
                            r.status === "done" ? onReopen?.(r) : onComplete(r)
                          }
                        >
                          {r.status === "done" && (
                            <Check size={12} strokeWidth={3} aria-hidden />
                          )}
                        </button>
                        <span className="sh__row-name">
                          {r.machineName ?? r.clientName ?? r.title}
                        </span>
                        {/* Per row, because a nineteen-machine group is often
                            closed by two people and the group line can only
                            carry one name. */}
                        {who && <span className="sh__row-who">{who}</span>}
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
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
