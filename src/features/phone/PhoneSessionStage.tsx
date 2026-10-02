/**
 * The Active Session on a phone (Journey Lite, Oct 1 2026).
 *
 * AJ: "we could make running a session just show the routine and current
 * weight and reps but it is not advised to run a session on your phone", and
 * then: "its not that a trainer isnt allowed to i just dont know how well we
 * can fit sizing ... seeing at least 5 sessions at a time is actually
 * meaningful".
 *
 * So this is the live part of WorkoutTrackerView drawn for a phone, and
 * nothing else: the tracker still runs the briefing, Start, every write
 * (`onChange` IS the grid's handleGridLiveChange), Finish and the Wrap-up.
 * One card per machine in today's order, each with its settings, its last
 * five times, and today's weight, count and mark. The card in hand is the
 * Now Bar's machine (`focusId`), so the machine clocks and Finish read the
 * same thing on a phone as on an iPad.
 *
 * What the iPad has that this leaves to it: the full grid and its older
 * columns, the analytics, the stopwatch, the per-machine flag line. The
 * machine sheet (settings, notes) opens from a machine's name, as on the iPad.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, ListOrdered, Minus, Plus } from "lucide-react";
import type { JourneyRow, JourneySession, LiveSet, RepQuality } from "../journey-grid/types";
import { QualityMark } from "../journey-grid/QualityMark";
import {
  cardLogged,
  countsSeconds,
  lastPerformed,
  lastTimes,
  parseCount,
  parseWeight,
  stepWeight,
  todayWeight,
  toggledQuality,
  type PastCell,
} from "./phone-session";
import "./phone.css";

export interface PhoneSessionStageProps {
  /** Today's routine, in order. */
  rows: JourneyRow[];
  /** Her past sessions, oldest → newest. */
  history: JourneySession[];
  values: Record<string, LiveSet>;
  focusId: string | null;
  onFocus: (machineId: string) => void;
  onChange: (machineId: string, patch: Partial<LiveSet>) => void;
  /** Send what is waiting now (moving on from a machine). */
  onCommit: () => void;
  /** The machine sheet: settings and notes. */
  onOpenMachine: (machineId: string) => void;
  /** Reorder, add or take off a machine (the iPad's RoutineOrderSheet). */
  onReorder: () => void;
  step?: number;
}

export function PhoneSessionStage({
  rows,
  history,
  values,
  focusId,
  onFocus,
  onChange,
  onCommit,
  onOpenMachine,
  onReorder,
  step = 2,
}: PhoneSessionStageProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // The card in hand comes into view when it changes (Next, or a tap on
  // another card), never while the trainer is typing into it.
  useEffect(() => {
    if (!focusId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-machine-id="${CSS.escape(focusId)}"]`);
    el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [focusId]);

  return (
    <div className="ph-stage" ref={listRef}>
      <p className="ph-stage__note" role="note">
        Sessions are meant to be run on the iPad. This is the phone's short version.
      </p>
      {rows.length === 0 ? (
        <p className="ph-stage__empty">No machines in today's routine yet.</p>
      ) : (
        <ol className="ph-cards" aria-label="Today's routine">
          {rows.map((row, i) => {
            const id = row.machine.id;
            const next = rows[i + 1];
            return (
              <MachineCard
                key={id}
                order={i + 1}
                row={row}
                history={history}
                value={values[id]}
                inHand={focusId === id}
                step={step}
                nextName={next?.machine.name ?? null}
                onFocus={() => {
                  if (focusId !== id) {
                    onCommit();
                    onFocus(id);
                  }
                }}
                onNext={() => {
                  onCommit();
                  if (next) onFocus(next.machine.id);
                }}
                onChange={(patch) => onChange(id, patch)}
                onOpenMachine={() => onOpenMachine(id)}
              />
            );
          })}
        </ol>
      )}
      <button type="button" className="ph-stage__reorder" onClick={onReorder}>
        <ListOrdered size={16} aria-hidden />
        Reorder or add a machine
      </button>
    </div>
  );
}

function MachineCard({
  order,
  row,
  history,
  value,
  inHand,
  step,
  nextName,
  onFocus,
  onNext,
  onChange,
  onOpenMachine,
}: {
  order: number;
  row: JourneyRow;
  history: JourneySession[];
  value: LiveSet | undefined;
  inHand: boolean;
  step: number;
  nextName: string | null;
  onFocus: () => void;
  onNext: () => void;
  onChange: (patch: Partial<LiveSet>) => void;
  onOpenMachine: () => void;
}) {
  const { machine } = row;
  const past = lastTimes(row, history);
  const last = lastPerformed(row, history);
  const seconds = countsSeconds(value, last);
  const weight = todayWeight(value, row);
  const logged = cardLogged(value);
  const outcome = value?.outcome ?? null;
  const settings = machine.settings ? Object.entries(machine.settings) : [];
  const ghost = seconds
    ? last?.isTSC && typeof last.seconds === "number"
      ? String(last.seconds)
      : ""
    : !last?.isTSC && typeof last?.reps === "number"
      ? String(last.reps)
      : "";

  return (
    <li
      className={`ph-card${inHand ? " is-in-hand" : ""}${logged ? " is-logged" : ""}`}
      data-machine-id={machine.id}
      // Any touch on the card makes it the machine in hand, as a tap on a
      // Today cell does on the iPad; the controls inside still do their own.
      onPointerDown={onFocus}
      onFocusCapture={onFocus}
    >
      <div className="ph-card__head">
        <span className="ph-card__order" aria-hidden>
          {order}
        </span>
        <button type="button" className="ph-card__name" onClick={onOpenMachine}>
          <span>{machine.name}</span>
          {machine.alert && (
            <AlertTriangle size={14} className="ph-card__alert" aria-label="Important machine note" />
          )}
          <ChevronRight size={16} className="ph-card__chev" aria-hidden />
        </button>
      </div>

      {settings.length > 0 && (
        <p className="ph-card__settings">
          {settings.map(([k, v]) => (
            <span key={k} title={machine.settingLabels?.[k] ?? k}>
              <abbr aria-label={machine.settingLabels?.[k] ?? k}>{k}</abbr> {v}
            </span>
          ))}
        </p>
      )}

      <PastStrip cells={past} />

      {outcome === "practice" || outcome === "skipped" ? (
        <p className="ph-card__outcome">
          {outcome === "practice" ? "Practice set · not counted" : "Skipped today"}
        </p>
      ) : null}

      <div className="ph-today">
        <div className="ph-weight" role="group" aria-label={`${machine.name} weight`}>
          <button
            type="button"
            className="ph-step"
            aria-label={`Lighter by ${step}`}
            onClick={() => onChange({ weight: stepWeight(weight, step, -1) })}
            disabled={outcome === "skipped"}
          >
            <Minus size={16} aria-hidden />
          </button>
          <WeightBox
            value={weight}
            disabled={outcome === "skipped"}
            label={`${machine.name} weight in pounds`}
            onCommit={(w) => onChange({ weight: w })}
          />
          <button
            type="button"
            className="ph-step"
            aria-label={`Heavier by ${step}`}
            onClick={() => onChange({ weight: stepWeight(weight, step, 1) })}
            disabled={outcome === "skipped"}
          >
            <Plus size={16} aria-hidden />
          </button>
        </div>

        {machine.sides ? (
          <div className="ph-sides">
            <CountBox
              label="L"
              aria={`${machine.name} left side ${seconds ? "seconds" : "reps"}`}
              value={seconds ? value?.seconds ?? null : value?.reps ?? null}
              ghost={ghost}
              disabled={outcome === "skipped"}
              onCommit={(n) => onChange(seconds ? { seconds: n, isTSC: true } : { reps: n })}
            />
            <CountBox
              label="R"
              aria={`${machine.name} right side ${seconds ? "seconds" : "reps"}`}
              value={seconds ? value?.secondsR ?? null : value?.repsR ?? null}
              ghost=""
              disabled={outcome === "skipped"}
              onCommit={(n) => onChange(seconds ? { secondsR: n, isTSC: true } : { repsR: n })}
            />
          </div>
        ) : (
          <CountBox
            label={seconds ? "Secs" : "Reps"}
            aria={`${machine.name} ${seconds ? "seconds" : "reps"}`}
            value={seconds ? value?.seconds ?? null : value?.reps ?? null}
            ghost={ghost}
            disabled={outcome === "skipped"}
            onCommit={(n) => onChange(seconds ? { seconds: n, isTSC: true } : { reps: n })}
          />
        )}
      </div>

      <div className="ph-marks">
        <MarkButton
          quality={3}
          on={value?.quality === 3}
          disabled={!logged || outcome === "skipped"}
          onTap={() => onChange({ quality: toggledQuality(value?.quality, 3) })}
        />
        <MarkButton
          quality={1}
          on={value?.quality === 1}
          disabled={!logged || outcome === "skipped"}
          onTap={() => onChange({ quality: toggledQuality(value?.quality, 1) })}
        />
        <button
          type="button"
          className={`ph-chip${seconds ? " is-on" : ""}`}
          aria-pressed={seconds}
          onClick={() => onChange({ isTSC: !seconds })}
          disabled={outcome === "skipped"}
        >
          Timed
        </button>
        <span className="ph-marks__sp" />
        <button
          type="button"
          className={`ph-chip${outcome === "practice" ? " is-on" : ""}`}
          aria-pressed={outcome === "practice"}
          onClick={() => onChange({ outcome: outcome === "practice" ? null : "practice" })}
        >
          Practice
        </button>
        <button
          type="button"
          className={`ph-chip${outcome === "skipped" ? " is-on" : ""}`}
          aria-pressed={outcome === "skipped"}
          onClick={() =>
            onChange(outcome === "skipped" ? { outcome: null } : { outcome: "skipped", skipReason: "other" })
          }
        >
          Skip
        </button>
      </div>

      {inHand && (
        <button type="button" className="ph-card__next" onClick={onNext} disabled={!nextName}>
          {nextName ? (
            <>
              Next: <span>{nextName}</span>
            </>
          ) : (
            "Last machine · Finish is at the top"
          )}
        </button>
      )}
    </li>
  );
}

/** The machine's last five times, newest on the right. */
function PastStrip({ cells }: { cells: PastCell[] }) {
  if (cells.length === 0) {
    return <p className="ph-past ph-past--none">First time on this machine in Journey.</p>;
  }
  return (
    <ol className="ph-past" aria-label={`Last ${cells.length === 1 ? "time" : `${cells.length} times`}`}>
      {cells.map((c) => (
        <li
          key={c.sessionId}
          className={`ph-past__cell ph-past__cell--${c.outcome}`}
          aria-label={pastWords(c)}
        >
          <span className="ph-past__date">{c.dateText}</span>
          <span className="ph-past__weight">{c.weight ?? "—"}</span>
          <span className="ph-past__count">
            {c.outcome === "skipped" ? "Skip" : c.outcome === "practice" ? `${c.count ?? ""} P` : c.count ?? "—"}
            {c.outcome === "performed" && c.quality !== 2 && (
              <QualityMark quality={c.quality} size={11} className={`ph-q ph-q--${c.quality}`} />
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

function pastWords(c: PastCell): string {
  if (c.outcome === "skipped") return `${c.dateText}: skipped`;
  const what = `${c.dateText}: ${c.weight ?? "no"} pounds, ${c.count ?? "no count"}`;
  if (c.outcome === "practice") return `${what}, practice set`;
  if (c.quality === 3) return `${what}, max strength`;
  if (c.quality === 1) return `${what}, needs improvement`;
  return what;
}

function MarkButton({
  quality,
  on,
  disabled,
  onTap,
}: {
  quality: 1 | 3;
  on: boolean;
  disabled: boolean;
  onTap: () => void;
}) {
  const label = quality === 3 ? "Max strength" : "Needs improvement";
  return (
    <button
      type="button"
      className={`ph-mark ph-mark--${quality}${on ? " is-on" : ""}`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onTap}
    >
      <QualityMark quality={quality as RepQuality} size={18} />
    </button>
  );
}

/**
 * A count box: what is typed is held here and written as it is typed (the
 * tracker debounces), so a re-render from the listener never eats a digit.
 */
function CountBox({
  label,
  aria,
  value,
  ghost,
  disabled,
  onCommit,
}: {
  label: string;
  aria: string;
  value: number | null;
  ghost: string;
  disabled: boolean;
  onCommit: (n: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(value == null ? "" : String(value));
  }, [value]);
  return (
    <label className="ph-count">
      <span className="ph-count__label">{label}</span>
      <input
        className="ph-count__input"
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="done"
        autoComplete="off"
        aria-label={aria}
        placeholder={ghost}
        value={text}
        disabled={disabled}
        onFocus={() => {
          editing.current = true;
        }}
        onBlur={() => {
          editing.current = false;
        }}
        onChange={(e) => {
          const n = parseCount(e.target.value);
          setText(n == null ? "" : String(n));
          if (n !== value) onCommit(n);
        }}
      />
    </label>
  );
}

function WeightBox({
  value,
  disabled,
  label,
  onCommit,
}: {
  value: number | null;
  disabled: boolean;
  label: string;
  onCommit: (n: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(value == null ? "" : String(value));
  }, [value]);
  return (
    <label className="ph-weight__box">
      <input
        className="ph-weight__input"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        aria-label={label}
        value={text}
        disabled={disabled}
        onFocus={(e) => {
          editing.current = true;
          e.currentTarget.select();
        }}
        onBlur={() => {
          editing.current = false;
          const n = parseWeight(text);
          if (n !== value) onCommit(n);
          setText(n == null ? "" : String(n));
        }}
        onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
      />
      <span className="ph-weight__unit">lb</span>
    </label>
  );
}
