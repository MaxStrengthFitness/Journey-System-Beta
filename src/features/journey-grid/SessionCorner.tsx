/**
 * The Active Session's grid corner as its one control (AJ, Oct 3 2026, the
 * session top's option 1: "no toolbar at all, the grid's corner is the
 * control, like Journey"). It says what is listed and how many ("ROUTINE
 * 6 of 20"), and a tap opens: today's routine or every machine, Reorder
 * today's routine, the plan when Routine A has one, and the Key. The
 * toolbar row it replaces held the same four things plus Older, which
 * scrolling back now does by itself.
 *
 * The plan (the first-session design round, Oct 8 2026, §4.6; AJ's Q6: "you
 * shouldn't really be blocked"): "The plan · 3 of 6" opens Routine A's plan,
 * where a trainer swaps a machine in the plan, marks one can't do, or
 * re-plans, mid-session.
 */
import { Check, ChevronDown, Info, ListChecks, ListFilter, Settings2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import "./journey-grid.css";

export function SessionCorner({
  showAll,
  routineCount,
  allCount,
  onShowAll,
  onReorder,
  plan = null,
  onPlan,
  onKey,
}: {
  showAll: boolean;
  routineCount: number;
  allCount: number;
  onShowAll: (all: boolean) => void;
  /** Absent while there is no session to reorder. */
  onReorder?: () => void;
  /** How much of Routine A's plan today runs; null when Routine A has no plan. */
  plan?: { have: number; of: number } | null;
  /** Opens the plan's sheet. */
  onPlan?: () => void;
  onKey: () => void;
}) {
  const item = "min-h-11 rounded-lg px-3 flex items-center gap-2 cursor-pointer text-[13px] font-semibold";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="jg-corner__filter"
        aria-label={`Showing ${showAll ? "every machine" : "today's routine"}, ${routineCount} of ${allCount}. Tap for the list, Reorder${plan ? ", the plan" : ""} and the Key.`}
        data-testid="session-corner"
      >
        <ListFilter className="jg-corner__filter-icon" aria-hidden="true" />
        <span className="jg-corner__title">{showAll ? "All machines" : "Routine"}</span>
        <span className="jg-corner__count">
          {routineCount} of {allCount}
        </span>
        <ChevronDown className="jg-corner__filter-chev" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 rounded-xl p-1.5">
        <DropdownMenuItem onClick={() => onShowAll(false)} className={item} data-testid="session-corner-routine">
          <Check className={`w-4 h-4 shrink-0 ${showAll ? "opacity-0" : ""}`} aria-hidden="true" />
          <span className="flex-1">Today&apos;s routine</span>
          <span className="text-[12px] tabular-nums text-muted-foreground">{routineCount}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onShowAll(true)} className={item} data-testid="session-corner-all">
          <Check className={`w-4 h-4 shrink-0 ${showAll ? "" : "opacity-0"}`} aria-hidden="true" />
          <span className="flex-1">All machines</span>
          <span className="text-[12px] tabular-nums text-muted-foreground">{allCount}</span>
        </DropdownMenuItem>
        <div className="my-1 border-t border-slate-200 dark:border-slate-800" role="separator" />
        <DropdownMenuItem onClick={onReorder} disabled={!onReorder} className={item} data-testid="session-corner-reorder">
          <Settings2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Reorder today&apos;s routine</span>
        </DropdownMenuItem>
        {plan && onPlan && (
          <DropdownMenuItem onClick={onPlan} className={item} data-testid="session-corner-plan">
            <ListChecks className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">
              The plan · {plan.have} of {plan.of}
            </span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onKey} className={item} data-testid="session-corner-key">
          <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Key</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
