import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Search, X } from "lucide-react";
import { RoutinePreset } from "../../types";
import { MachineCatalogEntry } from "../../types/machines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * The routine template editor.
 *
 * Round: Routine Template Builder, Sep 2026.
 *
 * A template is an ORDERED machine list plus an optional coaching note per
 * machine. Order is the point -- it is the sequence a trainer is meant to
 * work through -- so it gets explicit up/down controls rather than drag.
 * Drag is nicer with a mouse and worse on a 10" iPad held in one hand,
 * which is where this app actually runs.
 *
 * Machines come from the global catalog. A template may name a machine a
 * given studio does not own; that is expected and handled at apply time,
 * where the routine drawer filters to what the studio actually has.
 */
export function RoutineTemplateForm({
  value,
  onChange,
  catalog,
}: {
  value: RoutinePreset;
  onChange: (next: RoutinePreset) => void;
  catalog: MachineCatalogEntry[];
}) {
  const [search, setSearch] = useState("");

  const set = <K extends keyof RoutinePreset>(k: K, v: RoutinePreset[K]) =>
    onChange({ ...value, [k]: v });

  const byId = useMemo(() => {
    const m: Record<string, MachineCatalogEntry> = {};
    for (const c of catalog) m[c.id] = c;
    return m;
  }, [catalog]);

  const chosen = value.machineIds ?? [];
  const notes = value.machineNotes ?? {};

  /** Catalog minus what is already chosen, minus retired, minus the search. */
  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((m) => m.status !== "retired")
      .filter((m) => !chosen.includes(m.id))
      .filter((m) => !q || (m.name ?? "").toLowerCase().includes(q))
      .sort(
        (a, b) =>
          (a.defaultOrder ?? 999) - (b.defaultOrder ?? 999) ||
          (a.name ?? "").localeCompare(b.name ?? ""),
      );
  }, [catalog, chosen, search]);

  const addMachine = (id: string) => set("machineIds", [...chosen, id]);

  const removeMachine = (id: string) => {
    const { [id]: _dropped, ...rest } = notes;
    onChange({
      ...value,
      machineIds: chosen.filter((m) => m !== id),
      machineNotes: rest,
    });
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= chosen.length) return;
    const next = [...chosen];
    [next[index], next[target]] = [next[target], next[index]];
    set("machineIds", next);
  };

  const setNote = (id: string, note: string) => {
    const next = { ...notes };
    if (note.trim()) next[id] = note;
    else delete next[id];
    set("machineNotes", next);
  };

  const nameFor = (id: string) => byId[id]?.name ?? id;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Identity ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
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
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            When to use it
          </span>
          <Textarea
            value={value.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            placeholder="One push, one pull, one leg, one core — a balanced starting template for a new client."
            rows={2}
          />
          <span className="text-[11px] text-muted-foreground">
            This is the only guidance a trainer sees before applying it. Say who
            it is for, not what is in it — they can see the machine list.
          </span>
        </label>
      </div>

      <div className="h-px bg-border" />

      {/* ── The sequence ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-bold uppercase tracking-wide">
            The sequence
          </h4>
          <span className="text-[11px] text-muted-foreground">
            {chosen.length} machine{chosen.length === 1 ? "" : "s"} · order matters
          </span>
        </div>

        {chosen.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No machines yet. Add them from the catalog below, in the order a
            trainer should work through them.
          </p>
        )}

        <ol className="flex flex-col gap-2">
          {chosen.map((id, i) => (
            <li
              key={id}
              className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold tabular-nums">
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm font-semibold">
                  {nameFor(id)}
                  {!byId[id] && (
                    <span className="ml-2 text-[11px] font-normal text-amber-600 dark:text-amber-500">
                      not in the catalog
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10"
                  aria-label={`Move ${nameFor(id)} earlier`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10"
                  aria-label={`Move ${nameFor(id)} later`}
                  disabled={i === chosen.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 text-destructive"
                  aria-label={`Remove ${nameFor(id)}`}
                  onClick={() => removeMachine(id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <Input
                value={notes[id] ?? ""}
                onChange={(e) => setNote(id, e.target.value)}
                placeholder="Coaching note for this machine in this template (optional)"
                className="h-10 text-xs"
              />
            </li>
          ))}
        </ol>
      </div>

      <div className="h-px bg-border" />

      {/* ── Catalog picker ───────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-bold uppercase tracking-wide">
          Add from the catalog
        </h4>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search machines…"
            className="h-10 pl-9"
          />
        </div>

        {available.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-2">
            {search.trim()
              ? "No catalog machines match that."
              : "Every catalog machine is already in this template."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {available.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => addMachine(m.id)}
                className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{m.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
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
