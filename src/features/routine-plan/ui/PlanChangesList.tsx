/**
 * CHANGES — Routine A's history as ONE list, newest first (the design round,
 * §4.3: "One list holds the plan's changes and the old routineAdjustments,
 * newest first. Each says who, when, what and the reason if one was given").
 *
 * The plan's changes are read once, when the list is mounted (a landscape
 * iPad's right column, or the "Changes" sheet in portrait), and again when a
 * change made on this screen moves `nonce`; the old adjustments are the
 * profile's own live list. A read that hasn't answered says so, and one that
 * failed says it couldn't read them: never "no changes".
 *
 * A Re-plan is a divider ("Re-planned · Oct 8 · Surgery coming up"); nothing
 * before it is erased.
 */
import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { RoutineAdjustment, Trainer } from "../../../types";
import { studioDayKeyOf } from "../../../lib/studio-time";
import { planChangesAndAdjustments, type ChangeRow } from "../changes-list";
import { cantDoDayWords } from "../cant-do";
import type { StoredPlanChange } from "../store";
import { relativeTime } from "../../routines/routine-rows";

export interface PlanChangesListProps {
  routineId: string;
  adjustments: readonly RoutineAdjustment[];
  trainers: readonly Trainer[];
  nameOf: (id: string) => string;
  firstName?: string;
  todayYmd: string;
  read: (routineId: string) => Promise<StoredPlanChange[]>;
  /** Moves when this screen made a change, so the list reads again. */
  nonce?: number;
  /** The count, once known, for the "Changes · N" button. */
  onCount?: (n: number) => void;
  /** Whose changes these are: "Routine A" (the default), or "Routine B" on Routine B's plan. */
  routineName?: "Routine A" | "Routine B";
}

type ReadState = { key: string; status: "ready"; changes: StoredPlanChange[] } | { key: string; status: "failed" };

/** "Oct 8", the studio's day of a moment; "just now" while the server's time is pending. */
function dayWords(at: number | null, todayYmd: string): string {
  if (at === null) return "just now";
  const day = studioDayKeyOf(new Date(at));
  return day ? cantDoDayWords(day, todayYmd) : "";
}

/** "Just now", "today · Oct 8", "3 days ago · Oct 5". */
function whenWords(at: number | null, todayYmd: string): string {
  if (at === null) return "Just now";
  const day = dayWords(at, todayYmd);
  return day ? `${relativeTime(at)} · ${day}` : relativeTime(at);
}

export function PlanChangesList({ routineId, adjustments, trainers, nameOf, firstName, todayYmd, read, nonce = 0, onCount, routineName = "Routine A" }: PlanChangesListProps) {
  const key = `${routineId}|${nonce}`;
  const [state, setState] = useState<ReadState | null>(null);
  useEffect(() => {
    let live = true;
    read(routineId).then(
      (changes) => live && setState({ key, status: "ready", changes }),
      () => live && setState({ key, status: "failed" }),
    );
    return () => {
      live = false;
    };
    // `key` is routineId and nonce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Until a read again answers, the last answer for this routine stays on screen.
  const current = state && state.key.startsWith(`${routineId}|`) ? state : null;

  const rows: ChangeRow[] | null = useMemo(() => {
    if (!current || current.status !== "ready") return null;
    return planChangesAndAdjustments({
      planChanges: current.changes,
      adjustments,
      routineId,
      trainers,
      nameOf,
      routineName,
      firstName,
      todayYmd,
    });
  }, [current, adjustments, routineId, trainers, nameOf, firstName, todayYmd, routineName]);

  useEffect(() => {
    if (rows) onCount?.(rows.length);
  }, [rows, onCount]);

  if (!current) return <p className="rpl-meta">Reading the changes…</p>;
  if (current.status === "failed") return <p className="rpl-meta">Couldn't read the plan's changes just now. Try again in a moment.</p>;
  if (!rows || rows.length === 0) return <p className="rpl-meta">No changes logged for {routineName} yet.</p>;
  return (
    <ol className="rpl-changes" aria-label="Changes, newest first">
      {rows.map((r) =>
        r.isDivider ? (
          <li key={r.id} className="rpl-replan">
            <span className="rpl-replan__row">
              <span className="rpl-replan__rule" aria-hidden="true" />
              <span className="rpl-replan__tag">
                <RotateCcw size={14} aria-hidden="true" />
                {["Re-planned", dayWords(r.at, todayYmd), r.reason].filter(Boolean).join(" · ")}
              </span>
              <span className="rpl-replan__rule" aria-hidden="true" />
            </span>
            <span className="rpl-replan__meta">{r.who}</span>
          </li>
        ) : (
          <li key={r.id} className="rpl-change">
            <span className="rpl-change__who" aria-hidden="true">
              {r.initials}
            </span>
            <span className="rpl-change__text">
              <span className="rpl-change__what">{r.what}</span>
              <span className="rpl-change__meta">{[r.who, whenWords(r.at, todayYmd), r.reason].filter(Boolean).join(" · ")}</span>
            </span>
          </li>
        ),
      )}
    </ol>
  );
}
