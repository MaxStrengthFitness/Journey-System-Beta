/**
 * The write half of the to-do screen, lifted out of the view.
 *
 * WHY THIS EXISTS
 * StudioTasksView owns ~150 lines of "tick this, tick all of those, hand it
 * back, close it with a note" and every one of those writes has a detail in it
 * that is easy to get wrong twice: personal tasks live under trainers/{uid}
 * and studio tasks under studios/{id}, so a batch that spans both is two
 * batches; completion notifies, re-opening does not; a template with
 * `requiresNote` must not close silently.
 *
 * The hub needs all of that and none of StudioTasksView's layout. Rather than
 * copy it — and then fix the next bug in one copy — the behaviour lives here
 * and both screens call it.
 *
 * StudioTasksView is deliberately NOT changed to use this yet. It works, it is
 * what trainers are using today, and the hub has to be reviewed on an iPad
 * before anything swaps. Once the hub is the screen, StudioTasksView's copies
 * come out. Until then this is additive: nothing that works today goes through
 * new code.
 *
 * PER-ROW BUSY, NOT A GLOBAL FLAG
 * The old screen sets one `busy` boolean, so ticking one machine disables the
 * whole list. On a tablet mid-shift that reads as the app hanging. This tracks
 * the ids actually in flight, so the row you touched is the row that waits.
 */
import { useCallback, useRef, useState } from "react";
import { useActiveStudio } from "../../ActiveStudioContext";
import { useToast } from "../../contexts/ToastContext";
import {
  setManyTaskAssignments,
  setManyTaskClaims,
  setManyTaskStatuses,
  setTaskClaim,
  setTaskStatus,
} from "./mutations";
import type { TaskAuthor } from "./mutations";
import { notifyTaskAssignment, notifyTaskCompletion } from "./notify";
import { taskLocationOf } from "./types";
import type { PlannedInstance, TaskLocation, TaskRow } from "./types";
import type { ShiftGroup } from "./board";

export interface UseTaskActionsArgs {
  author: TaskAuthor | null;
  /** Raised when a row needs a note before it can close. */
  onNeedsNote?: (row: TaskRow) => void;
}

export interface TaskActions {
  /** Row ids with a write in flight. */
  busyIds: Set<string>;
  /** True while any write is in flight — for whole-screen affordances only. */
  busy: boolean;
  complete: (row: TaskRow) => Promise<void>;
  reopen: (row: TaskRow) => Promise<void>;
  completeGroup: (group: ShiftGroup) => Promise<void>;
  completeMany: (rows: TaskRow[]) => Promise<void>;
  toggleClaim: (row: TaskRow) => Promise<void>;
  /**
   * Take or hand back every OPEN row in a group.
   *
   * The group is the unit a trainer thinks in. `toggleClaim` above went a
   * whole round without a single call site partly because a per-row claim on
   * a nineteen-machine wipe-down is not something anyone taps nineteen times.
   */
  toggleClaimGroup: (group: ShiftGroup) => Promise<void>;
  /**
   * Put a head trainer's chosen name on a group, or clear it with `null`.
   *
   * `planned` lets the caller assign FORWARD — the rows for the next N days
   * rather than just the ones on screen — because re-assigning every morning
   * is the assignment nobody maintains. It defaults to today's open rows.
   */
  assign: (
    group: ShiftGroup,
    assignee: TaskAuthor | null,
    opts?: { planned?: PlannedInstance[]; days?: number },
  ) => Promise<void>;
  /** Close with a note, and optionally flag a problem on the instance. */
  closeWithNote: (
    row: TaskRow,
    note: string,
    flagged: boolean,
  ) => Promise<void>;
}

export function useTaskActions({
  author,
  onNeedsNote,
}: UseTaskActionsArgs): TaskActions {
  const { activeStudioId } = useActiveStudio();
  const { success: toastSuccess, error: toastError } = useToast();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  /*
   * A ref alongside the state because two taps in the same frame both read the
   * same stale `busyIds` and the second one's release would drop the first
   * one's id. The ref is the truth; the state exists to re-render.
   */
  const inFlight = useRef<Set<string>>(new Set());

  const mark = useCallback((ids: string[], on: boolean) => {
    for (const id of ids) {
      if (on) inFlight.current.add(id);
      else inFlight.current.delete(id);
    }
    setBusyIds(new Set(inFlight.current));
  }, []);

  /**
   * One place where a failed write becomes a sentence a trainer can act on.
   *
   * "Could not save" and nothing else is what turns a rules denial into a
   * bug report about the app being broken, so a permission failure says so.
   */
  const run = useCallback(
    async (ids: string[], fn: () => Promise<unknown>, ok: string) => {
      if (!activeStudioId) {
        toastError("No active studio selected.");
        return;
      }
      mark(ids, true);
      try {
        await fn();
        if (ok) toastSuccess(ok);
      } catch (err) {
        console.error("Studio task write failed:", err);
        const code = (err as { code?: string } | null)?.code ?? "";
        toastError(
          code === "permission-denied"
            ? "You do not have permission to change that task."
            : "Could not save. Check your connection and try again.",
        );
      } finally {
        mark(ids, false);
      }
    },
    [activeStudioId, mark, toastError, toastSuccess],
  );

  /**
   * A selection can span both tiers and they are different collections, so one
   * batch cannot cover both. Group by where each row actually lives.
   */
  const writeMany = useCallback(
    async (chosen: TaskRow[], status: "done" | "open") => {
      const groups = new Map<
        string,
        { location: TaskLocation; planned: TaskRow[] }
      >();
      for (const r of chosen) {
        const location = taskLocationOf(r.template ?? {}, activeStudioId!);
        const key =
          location.scope === "personal"
            ? `personal:${location.ownerId}`
            : "studio";
        const g = groups.get(key) ?? { location, planned: [] };
        g.planned.push(r);
        groups.set(key, g);
      }
      let written = 0;
      for (const g of groups.values()) {
        written += await setManyTaskStatuses({
          location: g.location,
          planned: g.planned,
          status,
          author,
        });
      }
      return written;
    },
    [activeStudioId, author],
  );

  const complete = useCallback(
    async (row: TaskRow) => {
      // A task that must carry a note goes through the dialog rather than
      // silently completing without one.
      if (row.template?.requiresNote) {
        onNeedsNote?.(row);
        return;
      }
      await run(
        [row.id],
        async () => {
          await setTaskStatus({
            location: taskLocationOf(row.template ?? {}, activeStudioId!),
            planned: row,
            status: "done",
            author,
          });
          // notify() decides whether anyone actually hears about it — see
          // notify.ts for the filters that keep this from becoming 40
          // receipts a day.
          await notifyTaskCompletion({ row, author, studioId: activeStudioId });
        },
        "Marked done.",
      );
    },
    [activeStudioId, author, onNeedsNote, run],
  );

  const reopen = useCallback(
    async (row: TaskRow) => {
      await run(
        [row.id],
        () =>
          setTaskStatus({
            location: taskLocationOf(row.template ?? {}, activeStudioId!),
            planned: row,
            status: "open",
            author,
          }),
        "Re-opened.",
      );
    },
    [activeStudioId, author, run],
  );

  const completeMany = useCallback(
    async (rows: TaskRow[]) => {
      const pending = rows.filter((r) => r.status !== "done");
      if (pending.length === 0) return;
      await run(
        pending.map((r) => r.id),
        () => writeMany(pending, "done"),
        `Marked ${pending.length} done.`,
      );
    },
    [run, writeMany],
  );

  const completeGroup = useCallback(
    (group: ShiftGroup) => completeMany(group.rows),
    [completeMany],
  );

  const toggleClaim = useCallback(
    async (row: TaskRow) => {
      const mine = row.instance?.claimedBy?.id === author?.id;
      await run(
        [row.id],
        () =>
          setTaskClaim({
            location: taskLocationOf(row.template ?? {}, activeStudioId!),
            planned: row,
            author,
            claimed: !mine,
          }),
        mine ? "Handed back." : "You've got it.",
      );
    },
    [activeStudioId, author, run],
  );

  /**
   * Whose group is it? Claim if it is not already yours, hand it back if it is.
   *
   * "Mine" reads the GROUP's claimedBy, which board.ts sets only when exactly
   * one person has claimed. A group you and Sarah have both touched is
   * ambiguous by nature, and the honest reading of a tap in that state is
   * "make it mine" rather than silently dropping her claim as well.
   */
  const toggleClaimGroup = useCallback(
    async (group: ShiftGroup) => {
      const open = group.rows.filter((r) => r.status === "open");
      if (open.length === 0) return;
      const mine = Boolean(author?.id && group.claimedBy?.id === author.id);
      await run(
        open.map((r) => r.id),
        () =>
          setManyTaskClaims({
            location: taskLocationOf(open[0].template ?? {}, activeStudioId!),
            planned: open,
            author,
            claimed: !mine,
          }),
        mine ? "Handed back to the floor." : "You've got it.",
      );
    },
    [activeStudioId, author, run],
  );

  const assign = useCallback(
    async (
      group: ShiftGroup,
      assignee: TaskAuthor | null,
      opts: { planned?: PlannedInstance[]; days?: number } = {},
    ) => {
      const open = group.rows.filter((r) => r.status === "open");
      if (open.length === 0) return;
      const planned = opts.planned?.length ? opts.planned : open;
      const days = opts.days ?? 1;

      /*
       * Busy marks only the rows ON SCREEN. `planned` can run a week ahead,
       * and those ids belong to no rendered row — marking them would leave
       * ids stuck in the in-flight set forever, because nothing ever releases
       * a row that was never displayed.
       */
      await run(
        open.map((r) => r.id),
        async () => {
          await setManyTaskAssignments({
            location: taskLocationOf(open[0].template ?? {}, activeStudioId!),
            planned,
            assignee,
            assignedBy: author,
          });
          await notifyTaskAssignment({
            row: { title: group.title, machineName: open[0].machineName },
            assignee,
            assignedBy: author,
            studioId: activeStudioId,
            days,
          });
        },
        assignee
          ? days > 1
            ? `${assignee.name} has it for ${days} days.`
            : `${assignee.name} has it today.`
          : "Assignment cleared.",
      );
    },
    [activeStudioId, author, run],
  );

  const closeWithNote = useCallback(
    async (row: TaskRow, note: string, flagged: boolean) => {
      await run(
        [row.id],
        async () => {
          await setTaskStatus({
            location: taskLocationOf(row.template ?? {}, activeStudioId!),
            planned: row,
            status: "done",
            author,
            note,
            flagged,
          });
          await notifyTaskCompletion({ row, author, studioId: activeStudioId });
        },
        flagged ? "Marked done and flagged." : "Marked done.",
      );
    },
    [activeStudioId, author, run],
  );

  return {
    busyIds,
    busy: busyIds.size > 0,
    complete,
    reopen,
    completeGroup,
    completeMany,
    toggleClaim,
    toggleClaimGroup,
    assign,
    closeWithNote,
  };
}
