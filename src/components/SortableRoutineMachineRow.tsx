import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";

/**
 * One draggable row in a routine's machine sequence. Extracted out of
 * ClientProfileView.tsx (Aug 2026) so it can be reused by EditRoutineDrawer
 * without a circular import back into that file.
 *
 * Aug 2026 (round 4): added a numbered badge so sequence order reads at a
 * glance, and always-visible "last performed" weight/date fields sourced
 * from the client's own session history (EditRoutineDrawer computes these
 * and passes them down — "N/A" when the client has never done the machine).
 */
interface SortableRoutineMachineRowProps {
  key?: any;
  id: string;
  machineName: string;
  sequenceNumber: number;
  lastWeightText: string;
  lastDateText: string;
  isEditMode?: boolean;
  onRemove?: () => void;
}

export function SortableRoutineMachineRow({
  id,
  machineName,
  sequenceNumber,
  lastWeightText,
  lastDateText,
  isEditMode,
  onRemove,
}: SortableRoutineMachineRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 transition-all",
        isDragging &&
          "opacity-95 scale-[1.02] shadow-md ring-2 ring-cyan/30 z-50 bg-white dark:bg-slate-850 border-cyan/40",
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 text-xs font-bold shrink-0 border border-cyan-500/20">
          {sequenceNumber}
        </div>
        {isEditMode ? (
          <div
            {...attributes}
            {...listeners}
            className="flex items-center justify-center h-12 w-12 cursor-grab active:cursor-grabbing bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-lg shrink-0 touch-none"
            title="Drag to reorder"
          >
            <GripVertical className="w-5 h-5 text-slate-400 dark:text-slate-500" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-tight text-slate-800 dark:text-neutral-200 truncate">
            {machineName}
          </p>
          <p className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
            <span>
              Last Weight:{" "}
              <span className="text-slate-500 dark:text-slate-300">
                {lastWeightText}
              </span>
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span>
              Last Date:{" "}
              <span className="text-slate-500 dark:text-slate-300">
                {lastDateText}
              </span>
            </span>
          </p>
        </div>
      </div>

      {isEditMode && onRemove && (
        <Button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          variant="ghost"
          size="sm"
          className="h-10 w-10 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg shrink-0"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
