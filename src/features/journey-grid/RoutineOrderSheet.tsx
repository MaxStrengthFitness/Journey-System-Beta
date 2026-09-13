import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowUpToLine, Check, GripVertical, Plus, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { JourneyRow, LiveSet } from "./types";

/**
 * TODAY'S ORDER — the reorder sheet (tracker round, Sep 2026).
 *
 * The occupied-machine pivot used to be up/down arrows inside the grid's
 * machine cell: functional, and four taps to move one machine past three
 * others while a client stands waiting. The audit asked for drag and drop.
 *
 * Why a sheet and not dragging the grid rows themselves: `.jg-row` is
 * `display: contents` (journey-grid/types.ts explains why), so a row has no
 * box for dnd-kit to measure. A sheet also gives the list room — 44px rows
 * with a grip you can actually hold on an iPad — and a place for "add from
 * the floor", which today hides behind Show: All.
 *
 * What it edits is the SESSION's sequence, never the routine: every change
 * goes out through `onChange(ids)`, which the tracker feeds into
 * `applySessionMachineIds` (guarded by routine-builder/session-scope.test).
 *
 * The one-tap pivot: ▲ "Do next" moves a machine straight to the first
 * unfinished slot — the Pulldown is free, the Leg Press is not, so the
 * Pulldown goes next. Drag is for everything else.
 */

export interface RoutineOrderSheetProps {
  open: boolean;
  onClose: () => void;
  /** Today's sequence, in order. */
  ids: string[];
  /** Every machine on file for this client (the grid's rows). */
  rows: JourneyRow[];
  /** Live values, to show what is already done and what is current. */
  values: Record<string, LiveSet | undefined>;
  focusId?: string | null;
  onChange: (ids: string[]) => void;
  /** "Do next" also makes that machine the current one. */
  onFocus?: (id: string) => void;
}

type Status = "done" | "practice" | "skipped" | "current" | "todo";

function statusOf(v: LiveSet | undefined, current: boolean): Status {
  if (v?.outcome === "practice") return "practice";
  if (v?.outcome === "skipped") return "skipped";
  const counted = !!v && (v.isTSC ? v.seconds != null : v.reps != null);
  if (counted) return "done";
  return current ? "current" : "todo";
}

const STATUS_WORD: Record<Status, string> = {
  done: "Done",
  practice: "Practice",
  skipped: "Skipped",
  current: "Now",
  todo: "",
};

function Row({
  id,
  index,
  row,
  status,
  canDoNext,
  onDoNext,
  onRemove,
}: {
  id: string;
  index: number;
  row: JourneyRow | undefined;
  status: Status;
  canDoNext: boolean;
  onDoNext: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const settings = row?.machine.settings
    ? Object.entries(row.machine.settings)
        .map(([k, v]) => `${k} ${v}`)
        .join(" · ")
    : "";
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`jg-order__row is-${status} ${isDragging ? "is-dragging" : ""}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="jg-order__grip"
        aria-label={`Drag to move ${row?.machine.name ?? "machine"}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} strokeWidth={2.25} />
      </button>
      <i className="jg-order__ord">{index + 1}</i>
      <span className="jg-order__id">
        <span className="jg-order__name">{row?.machine.name ?? id}</span>
        {settings && <span className="jg-order__settings">{settings}</span>}
      </span>
      {STATUS_WORD[status] && <span className="jg-order__status">{STATUS_WORD[status]}</span>}
      {canDoNext && (
        <button type="button" className="jg-order__next" onClick={onDoNext} aria-label={`Do ${row?.machine.name ?? "this"} next`}>
          <ArrowUpToLine size={15} strokeWidth={2.5} />
          <span>Do next</span>
        </button>
      )}
      <button
        type="button"
        className="jg-order__remove"
        onClick={onRemove}
        aria-label={`Take ${row?.machine.name ?? "this machine"} out of today's routine`}
      >
        <X size={16} strokeWidth={2.75} />
      </button>
    </li>
  );
}

export function RoutineOrderSheet({ open, onClose, ids, rows, values, focusId, onChange, onFocus }: RoutineOrderSheetProps) {
  const byId = useMemo(() => new Map(rows.map((r) => [r.machine.id, r] as const)), [rows]);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    if (!open) setFilter("");
  }, [open]);

  const sensors = useSensors(
    // A finger needs a moment to distinguish a scroll from a drag; a mouse
    // needs a little travel so a click on the grip is not a drag.
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const statuses = useMemo(
    () => ids.map((id) => statusOf(values[id], id === focusId)),
    [ids, values, focusId],
  );
  // The first slot that is not already done: where "Do next" puts a machine.
  const nextSlot = useMemo(() => {
    const i = statuses.findIndex((s) => s === "current" || s === "todo");
    return i === -1 ? ids.length : i;
  }, [statuses, ids.length]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onChange(arrayMove(ids, from, to));
  };

  const doNext = (id: string) => {
    const from = ids.indexOf(id);
    if (from === -1 || from <= nextSlot) return;
    onChange(arrayMove(ids, from, nextSlot));
    onFocus?.(id);
  };

  const inRoutine = new Set(ids);
  const q = filter.trim().toLowerCase();
  const floor = rows.filter(
    (r) => !inRoutine.has(r.machine.id) && (!q || r.machine.name.toLowerCase().includes(q)),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-auto bottom-0 left-1/2 translate-y-0 max-w-none sm:max-w-[620px] w-full max-h-[88dvh] rounded-b-none rounded-t-[22px] p-0 border-0 bg-transparent shadow-none"
      >
        <div className="jg-order">
          <div className="jg-order__grab" aria-hidden />
          <header className="jg-order__head">
            <div>
              <h2 className="jg-order__title">Today's order</h2>
              <p className="jg-order__sub">Drag to reorder · ▲ moves a machine up to next · × takes it out for today. The routine itself is not changed.</p>
            </div>
            <button type="button" className="jg-order__done" onClick={onClose}>
              <Check size={16} strokeWidth={3} />
              Done
            </button>
          </header>

          <div className="jg-order__body">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <ol className="jg-order__list" aria-label="Today's routine, in order">
                  {ids.map((id, i) => (
                    <Row
                      key={id}
                      id={id}
                      index={i}
                      row={byId.get(id)}
                      status={statuses[i]}
                      canDoNext={(statuses[i] === "todo" || statuses[i] === "skipped") && i > nextSlot}
                      onDoNext={() => doNext(id)}
                      onRemove={() => onChange(ids.filter((m) => m !== id))}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
            {ids.length === 0 && <p className="jg-order__empty">Nothing planned yet — add a machine below.</p>}

            <section className="jg-order__floor" aria-label="Add a machine">
              <div className="jg-order__floorhead">
                <h3 className="jg-order__kicker">Add from the floor</h3>
                <input
                  className="jg-order__find"
                  type="search"
                  placeholder="Find a machine"
                  aria-label="Find a machine to add"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <ul className="jg-order__floorlist">
                {floor.map((r) => (
                  <li key={r.machine.id}>
                    <button
                      type="button"
                      className="jg-order__add"
                      onClick={() => onChange([...ids, r.machine.id])}
                      aria-label={`Add ${r.machine.name} to today's routine`}
                    >
                      <Plus size={15} strokeWidth={2.75} />
                      <span>{r.machine.name}</span>
                    </button>
                  </li>
                ))}
                {floor.length === 0 && <li className="jg-order__empty">{q ? "No machine matches." : "Every machine on file is already in today's routine."}</li>}
              </ul>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
