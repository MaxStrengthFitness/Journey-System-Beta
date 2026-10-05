/**
 * The Wrap-up's "Next session's weights" (the Atlas answers, Oct 2 2026).
 *
 * One row per machine she performed today: the weight the next session will
 * load, which starts at what she lifted today (the app's rule until now:
 * "currently our app uses the last sessions weight"), with − and + in the
 * machine's step and the number itself to type into. Each change is written
 * the moment it is made (a tap) or the field is left (typing), onto her
 * settings for that machine, so the next session — by any trainer, at any
 * studio — starts from it and says who set it (next-weight.ts).
 *
 * The app never suggests a weight. Nothing here proposes a number or a
 * direction; it shows what was lifted today and what the trainer set.
 */
import { useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import type { TodayLine } from "../../lib/post-session";
import { useUnsavedChanges } from "../unsaved-changes";
import { DEFAULT_WEIGHT_STEP_LB, bumpWeight, nextWeightChangeLine, parseWeightEntry } from "./next-weight";

export type SaveNextWeight = (machineId: string, weight: number, today: number | null) => void | boolean | Promise<void | boolean>;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function NextWeightRow({ line, onSave, step }: { line: TodayLine; onSave: SaveNextWeight; step: number }) {
  const today = line.weight;
  const [weight, setWeight] = useState<number>(today ?? 0);
  const [text, setText] = useState<string>(fmt(today ?? 0));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const seq = useRef(0);

  const typedDirty = parseWeightEntry(text) !== weight;
  useUnsavedChanges(typedDirty, `the next session's weight on ${line.name}`, {
    onDiscard: () => setText(fmt(weight)),
  });

  const save = (w: number) => {
    setWeight(w);
    setText(fmt(w));
    setState("saving");
    const mine = ++seq.current;
    Promise.resolve(onSave(line.machineId, w, today)).then(
      (ok) => mine === seq.current && setState(ok === false ? "failed" : "saved"),
      () => mine === seq.current && setState("failed"),
    );
  };

  const commitTyped = () => {
    const n = parseWeightEntry(text);
    if (n === null) {
      setText(fmt(weight));
      return;
    }
    if (n !== weight) save(n);
  };

  const change = nextWeightChangeLine(weight, today);
  const btn =
    "min-h-11 min-w-11 rounded-xl border border-input bg-(--raised) shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) transition-transform text-ink-d1 flex items-center justify-center hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring)";

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 border-b border-div-d last:border-b-0" data-testid="next-weight-row" data-machine={line.machineId}>
      <div className="flex-1 min-w-[10rem] flex flex-col">
        <span className="text-[14px] font-semibold text-ink-d1 break-words">{line.name}</span>
        <span className="text-[12px] text-ink-d3" data-testid="next-weight-today">
          Today {today !== null ? `${fmt(today)} lb` : "–"}
          {change ? ` · ${change}` : ""}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} aria-label={`Lower ${line.name}'s next weight by ${step} lb`} onClick={() => save(bumpWeight(weight, -1, step))}>
          <Minus size={16} strokeWidth={2.5} />
        </button>
        <label className="flex items-center gap-1 min-h-11 rounded-xl border border-input bg-(--well) shadow-(--elev-0) px-2">
          <input
            type="text"
            inputMode="decimal"
            className="w-14 bg-transparent text-center font-mono tabular-nums text-[17px] font-bold text-ink-d1 outline-none"
            aria-label={`${line.name}: next session's weight in pounds`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commitTyped}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
          />
          <span className="text-[11px] font-semibold text-ink-d3">lb</span>
        </label>
        <button type="button" className={btn} aria-label={`Raise ${line.name}'s next weight by ${step} lb`} onClick={() => save(bumpWeight(weight, 1, step))}>
          <Plus size={16} strokeWidth={2.5} />
        </button>
      </div>
      <span className="w-full text-[11px] font-bold min-h-4" role="status" aria-live="polite" data-testid="next-weight-state">
        {state === "saved" && (
          <span className="text-(--eq-ok) inline-flex items-center gap-1">
            <Check size={12} strokeWidth={3} /> Saved for next time
          </span>
        )}
        {state === "failed" && <span className="text-(--eq-warn)">Not saved. Set it again.</span>}
      </span>
    </li>
  );
}

export function NextWeightCard({ lines, onSave, step = DEFAULT_WEIGHT_STEP_LB }: { lines: TodayLine[]; onSave: SaveNextWeight; step?: number }) {
  const shown = lines.filter((l) => l.outcome === "performed" && l.weight !== null);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" data-testid="next-weight-card">
      <p className="text-[12px] text-ink-d2">The next session starts from these. Change one and the next trainer sees who set it.</p>
      <ul className="flex flex-col">
        {shown.map((l) => (
          <NextWeightRow key={l.machineId} line={l} onSave={onSave} step={step} />
        ))}
      </ul>
    </div>
  );
}
