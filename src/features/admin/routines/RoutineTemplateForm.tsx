import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RoutineBuilder } from "../../routine-builder";
import { StartPartEditor } from "../../routine-plan/ui/StartPartEditor";
import type { Machine, RoutinePreset } from "../../../types";
import type { MachineCatalogEntry } from "../../../types/machines";

/**
 * The routine template editor.
 *
 * Round: Routine Template Builder, Sep 2026.
 *        Rebuilt on the shared RoutineBuilder, Sep 2026.
 *
 * A template is an ORDERED machine list plus an optional coaching note per
 * machine. Order is the point — it is the sequence a trainer is meant to work
 * through — and it now gets the same drag-to-reorder interaction as every
 * other routine surface in the app.
 *
 * That reverses this file's original call. It shipped with explicit up/down
 * arrows on the reasoning that drag is worse on a 10" iPad held in one hand,
 * which was true of the drag implementation it was avoiding: a whole row as
 * the drag target, competing with the scroll gesture. The shared row instead
 * has a dedicated 32px full-height handle, so the list still scrolls under a
 * thumb anywhere else on the row, and dnd-kit's keyboard sensor gives the
 * same lift-and-arrow control the buttons did. Set against that, an admin
 * authoring a company standard was the one person in the app who could not
 * see that their template put two pulling movements back to back — which
 * then propagated to every client it was applied to. That is the more
 * expensive of the two problems.
 *
 * Machines come from the global catalog, so a template may name a machine a
 * given studio does not own. That is expected and handled at apply time,
 * where the routine drawer filters to what the studio actually has.
 *
 * FOR NEW CLIENTS (the design round, Oct 8 2026). Under the builder, a
 * template can be switched on as a starting routine: its day one, the words
 * in an intake that suggest it and, on a company template, head office's
 * default (`routine-plan/ui/StartPartEditor`, the pure half
 * `routine-plan/start-part.ts`). It edits the draft's `start` part like any
 * other field, and the tab's Save writes it. AJ: "studios will chose their
 * own, admins will create the routines to pick from in the app during beta".
 */
export function RoutineTemplateForm({
  value,
  onChange,
  catalog,
  otherDefaultName = null,
  pendingWord,
  onPendingWordChange,
}: {
  value: RoutinePreset;
  onChange: (next: RoutinePreset) => void;
  catalog: MachineCatalogEntry[];
  /** The company template that is head office's starting default now, when it is another one. */
  otherDefaultName?: string | null;
  /** A word that suggests the routine, typed but not added yet: the tab's, so it counts as unsaved and Save puts it in. */
  pendingWord: string;
  onPendingWordChange: (word: string) => void;
}) {
  const set = <K extends keyof RoutinePreset>(k: K, v: RoutinePreset[K]) =>
    onChange({ ...value, [k]: v });

  /** The builder speaks `Machine`; the catalog is the richer definition. */
  const machines = useMemo<Machine[]>(
    () =>
      catalog
        .filter((m) => m.status !== "retired")
        .sort(
          (a, b) =>
            (a.defaultOrder ?? 999) - (b.defaultOrder ?? 999) ||
            (a.name ?? "").localeCompare(b.name ?? ""),
        )
        .map((m) => ({ id: m.id, name: m.name ?? m.id })),
    [catalog],
  );

  /** Every catalog machine's name, retired ones included: a template may still name one. */
  const nameOf = useMemo(() => {
    const names = new Map(catalog.map((m) => [m.id, m.name ?? m.id] as const));
    return (id: string) => names.get(id) ?? id;
  }, [catalog]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-bold text-ink-d2">
            Template name
          </span>
          <Input
            value={value.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Full Body Foundations"
            className="h-10"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-bold text-ink-d2">
            When to use it
          </span>
          <Textarea
            value={value.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            placeholder="One push, one pull, one leg, one core — a balanced starting template for a new client."
            rows={2}
          />
          <span className="text-[11px] text-muted-foreground">
            This is the only guidance a trainer sees before applying it. Say who it is for, not
            what is in it — they can see the machine list.
          </span>
        </label>
      </div>

      <div className="h-px bg-border" />

      {/* A definite height, not a min-height: the builder's own list scrolls
          internally and its rail is a sibling column, so against an
          indefinite parent it collapses to its content and the rail stops
          filling. 32rem shows eight rows plus the header. */}
      <div
        className="overflow-hidden rounded-xl border border-border"
        style={{ height: "32rem" }}
      >
        <RoutineBuilder
          mode="template"
          machineIds={value.machineIds ?? []}
          onChange={(ids) => set("machineIds", ids)}
          machines={machines}
          machineNotes={value.machineNotes ?? {}}
          onMachineNotesChange={(notes) => set("machineNotes", notes)}
          established
        />
      </div>

      <div className="h-px bg-border" />

      <StartPartEditor
        start={value.start}
        onChange={(start) => {
          // Absent, never undefined, while the switch is off: the draft is
          // compared field by field, and the write leaves it out.
          const { start: _was, ...rest } = value;
          onChange(start ? { ...rest, start } : rest);
        }}
        machineIds={value.machineIds ?? []}
        nameOf={nameOf}
        tier={value.tier ?? "company"}
        otherDefaultName={otherDefaultName}
        parked={value.startParked}
        word={pendingWord}
        onWordChange={onPendingWordChange}
      />
    </div>
  );
}

/** A blank company-tier template. Tier and scope are set by the caller. */
export function emptyRoutineTemplate(): RoutinePreset {
  return {
    name: "",
    description: "",
    machineIds: [],
    machineNotes: {},
    scope: "global",
    tier: "company",
  };
}
