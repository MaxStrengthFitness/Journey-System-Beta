/**
 * The accolade cards (client copy), the accolade slot editor, and the focus
 * history shown in the 4 P's step and on the printed report.
 *
 * Every rule lives in accolades.ts / focus-history.ts; these components only
 * draw what those functions return. In particular a slot with no real data is
 * never drawn — `reportCards` drops it — so an old report with blank slots
 * prints cleanly too.
 */
import React from "react";
import { Award, Compass, Sparkles, TrendingUp, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "../../lib/utils";
import type { ProgressReport } from "../../types";
import type { ClientFocus } from "../../types/journal";
import {
  METRIC_CHOICES,
  METRIC_TITLES,
  MACHINE_METRICS,
  buildSlot,
  choiceOf,
  reportCards,
  slotCard,
  type AccoladeCandidate,
  type HighlightSlot,
  type SlotContext,
  type SlotMetric,
} from "./accolades";
import { focusLine, snapshotLine, sortFocuses } from "./focus-history";

const CHOOSE = "choose";
const NO_MACHINE = "none";
const ALL_MACHINES = "all";

const HERO_TONE = {
  gain: "text-[#F06C22]",
  quality: "text-emerald-400",
  plain: "text-white",
} as const;

const GRID_COLS: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
};

/* ------------------------------------------------------------------ *
 * Client copy
 * ------------------------------------------------------------------ */

export function AccoladeCards({ slots }: { slots: ProgressReport["highlights"] | undefined }) {
  const cards = reportCards(slots);
  if (cards.length === 0) return null;
  return (
    <section className="space-y-3 break-inside-avoid" data-testid="accolade-cards">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full border border-white/10">
          <TrendingUp className="w-3.5 h-3.5 text-[#F06C22]" />
          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#FAF9F6] print:text-[#0A2E46]">
            Your Accolades
          </h3>
        </div>
        <div className="h-px bg-white/10 flex-1"></div>
      </div>
      <div className={cn("grid grid-cols-1 gap-3", GRID_COLS[Math.min(cards.length, 3)])}>
        {cards.map((c, i) => (
          <div
            key={i}
            data-testid="accolade-card"
            className="bg-slate-800/50 p-6 rounded-[25px] shadow-xl flex flex-col justify-between min-h-40 border border-white/5 relative group overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-3 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
              <Award className="w-24 h-24 text-white" />
            </div>
            <div className="relative z-10 space-y-2">
              <div className="text-[11px] font-black tracking-[0.2em] uppercase text-[#F06C22]">
                {c.title}
              </div>
              {c.label && (
                <div className="text-xs text-slate-400 font-bold tracking-wider uppercase">
                  {c.label}
                </div>
              )}
              <p
                className={cn(
                  "pt-2 text-3xl font-black italic tracking-tighter leading-tight drop-shadow-sm",
                  HERO_TONE[c.tone],
                )}
              >
                {c.hero}
              </p>
            </div>
            {c.context && (
              <div className="mt-4 pt-3 border-t border-white/10 w-full relative z-10">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  {c.context}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Editor: one slot
 * ------------------------------------------------------------------ */

export interface AccoladeSlotEditorProps {
  index: number;
  slot: HighlightSlot;
  machines: { id?: string; name: string }[];
  ctx: SlotContext;
  /** Every accolade the data supports, best first. */
  candidates: AccoladeCandidate[];
  /** Keys already on the report's other slots. */
  takenKeys: ReadonlySet<string>;
  /** Still loading the window: say so instead of "no data". */
  loading?: boolean;
  onChange: (next: HighlightSlot) => void;
}

const fmt = (n: number | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : null;

export function AccoladeSlotEditor({
  index,
  slot,
  machines,
  ctx,
  candidates,
  takenKeys,
  loading,
  onChange,
}: AccoladeSlotEditorProps) {
  const metric = (slot.metricType ?? "") as SlotMetric | "";
  const choice = choiceOf(slot);
  const card = slotCard(slot);
  const note = card ? null : buildSlot(choice, ctx).note;
  const needsMachine = !!metric && (MACHINE_METRICS.has(metric) || metric === "consistent_quality");
  const machineValue =
    choice.machineId ?? (metric === "consistent_quality" ? ALL_MACHINES : NO_MACHINE);
  const machineName = (id: string) => machines.find((m) => m.id === id)?.name ?? "";
  const withStats = machines.filter((m) => m.id && ctx.stats[m.id]);
  const stats = choice.machineId ? ctx.stats[choice.machineId] : undefined;
  const swaps = candidates.filter((c) => !takenKeys.has(c.key));

  const rebuild = (next: Parameters<typeof buildSlot>[0]) => onChange(buildSlot(next, ctx).slot);

  return (
    <div
      className="flex flex-col gap-4 p-6 rounded-3xl bg-slate-800 text-white shadow-xl"
      data-testid="accolade-slot"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Accolade {index + 1}
          </p>
          {slot.suggested && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              <Sparkles className="h-3 w-3" /> Suggested from data
            </span>
          )}
        </div>
        {(metric || slot.headline) && (
          <button
            type="button"
            onClick={() => onChange(buildSlot({}, ctx).slot)}
            className="inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-xl border border-slate-600 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-300 hover:border-slate-400"
            aria-label={`Clear accolade ${index + 1}`}
          >
            <X className="h-4 w-4" /> Clear
          </button>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-widest text-slate-400">Accolade</Label>
        <Select
          value={metric || CHOOSE}
          onValueChange={(v) =>
            rebuild({
              ...choice,
              metricType: !v || v === CHOOSE ? "" : (v as SlotMetric),
              machineId: v === "consistent_quality" && !choice.machineId ? undefined : choice.machineId,
            })
          }
        >
          <SelectTrigger className="w-full min-h-11 bg-slate-900 border-slate-700 text-white">
            <SelectValue>{metric ? METRIC_TITLES[metric] : "Choose an accolade"}</SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700 text-white">
            <SelectItem value={CHOOSE}>Choose an accolade</SelectItem>
            {METRIC_CHOICES.map((m) => (
              <SelectItem key={m} value={m}>
                {METRIC_TITLES[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsMachine && (
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-widest text-slate-400">Machine</Label>
          <Select
            value={machineValue}
            onValueChange={(v) =>
              rebuild({ ...choice, machineId: !v || v === NO_MACHINE || v === ALL_MACHINES ? undefined : v })
            }
          >
            <SelectTrigger className="w-full min-h-11 bg-slate-900 border-slate-700 text-white">
              <SelectValue>
                {choice.machineId
                  ? machineName(choice.machineId) || "Machine"
                  : metric === "consistent_quality"
                    ? "All machines"
                    : "Choose a machine"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700 text-white max-h-72 overflow-y-auto min-w-75">
              {metric === "consistent_quality" ? (
                <SelectItem value={ALL_MACHINES}>All machines</SelectItem>
              ) : (
                <SelectItem value={NO_MACHINE}>None</SelectItem>
              )}
              {withStats.map((m) => {
                const s = ctx.stats[m.id!]!;
                return (
                  <SelectItem key={m.id!} value={m.id!}>
                    <div className="flex justify-between items-center w-full gap-4">
                      <span className="font-medium">{m.name}</span>
                      <span className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        {s.percentageIncrease > 0 ? `+${s.percentageIncrease}%` : `${s.percentageIncrease}%`}
                        {typeof s.sessionCount === "number" ? ` · ${s.sessionCount} sess.` : ""}
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {metric === "custom" && (
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-widest text-[#F06C22]">Your highlight</Label>
          <Input
            value={slot.customText || ""}
            onChange={(e) => rebuild({ metricType: "custom", customText: e.target.value })}
            placeholder="e.g. Mastered eccentric breathing!"
            className="min-h-11 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus:border-[#F06C22]"
          />
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4" aria-live="polite">
        {card ? (
          <>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#F06C22]">{card.title}</p>
            {card.label && (
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{card.label}</p>
            )}
            <p className={cn("mt-1 text-2xl font-black italic tracking-tight", HERO_TONE[card.tone])}>
              {card.hero}
            </p>
            {card.context && <p className="mt-1 text-xs text-slate-300">{card.context}</p>}
          </>
        ) : (
          <p className="text-sm text-slate-300">
            {loading
              ? "Reading the client's sessions…"
              : note ?? "Choose an accolade — or take one of the suggestions below. An empty slot is not printed."}
          </p>
        )}
        {stats && (
          <p className="mt-3 border-t border-slate-800 pt-2 text-[11px] text-slate-400">
            This window: {fmt(stats.startWeight)} → {fmt(stats.currentWeight)} lbs
            {typeof stats.sessionCount === "number" ? ` · ${stats.sessionCount} sessions` : ""}
            {fmt(stats.totalVolume) ? ` · ${fmt(stats.totalVolume)} lbs moved` : ""}
            {stats.perfectSets ? ` · ${stats.perfectSets} top-quality sets` : ""}
          </p>
        )}
      </div>

      {swaps.length > 0 && (
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-widest text-slate-400">
            {slot.suggested || !card ? "Suggestions from the data" : "Swap for a suggestion"}
          </Label>
          <Select
            value=""
            onValueChange={(v) => {
              const c = swaps.find((x) => x.key === v);
              if (c) onChange({ ...c.slot, suggested: false });
            }}
          >
            <SelectTrigger className="w-full min-h-11 bg-slate-900 border-slate-700 text-white">
              <SelectValue>{`${swaps.length} more from the data`}</SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700 text-white max-h-72 overflow-y-auto min-w-75">
              {swaps.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  <div className="flex justify-between items-center w-full gap-4">
                    <span className="font-medium">
                      {METRIC_TITLES[c.slot.metricType ?? "strength_gain"]} · {c.label}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-emerald-300">{c.slot.headline}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Focus history
 * ------------------------------------------------------------------ */

export function FocusHistoryPanel({
  focuses,
  status,
  asOf,
}: {
  focuses: ClientFocus[];
  status: "loading" | "ready" | "error";
  asOf: Date;
}) {
  const sorted = sortFocuses(focuses, asOf);
  return (
    <div
      className="mb-6 rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/50"
      data-testid="focus-history"
    >
      <div className="mb-3 flex items-center gap-2">
        <Compass className="h-4 w-4 text-[#0A548B]" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#0A2E46] dark:text-white">
          Coaching focus history
        </p>
      </div>
      {status === "loading" && <p className="text-sm text-slate-500">Reading their focuses…</p>}
      {status === "error" && (
        <p className="text-sm text-slate-500">
          Couldn't read their focuses just now — the report will keep whatever it saved last time.
        </p>
      )}
      {status === "ready" && sorted.length === 0 && (
        <p className="text-sm text-slate-500">No coaching focus has been set for this client yet.</p>
      )}
      {status === "ready" && sorted.length > 0 && (
        <ul className="space-y-2">
          {sorted.map((f) => (
            <li key={f.id} className="text-sm">
              <p
                className={cn(
                  "font-bold",
                  f.status === "active" ? "text-[#0A2E46] dark:text-white" : "text-slate-500",
                )}
              >
                {focusLine(f, asOf)}
              </p>
              {f.intent && <p className="text-xs text-slate-500">{f.intent}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FocusSnapshotCard({ entries }: { entries: ProgressReport["focusSnapshot"] }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="bg-white/5 rounded-2xl p-4 border border-white/10" data-testid="focus-snapshot">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white print:text-[#0A2E46]">
        Coaching focus
      </h4>
      <ul className="space-y-1">
        {entries.map((e, i) => (
          <li key={i} className="text-[12px] font-bold text-white/80">
            {snapshotLine(e)}
          </li>
        ))}
      </ul>
    </div>
  );
}
