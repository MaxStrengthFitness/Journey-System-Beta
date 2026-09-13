import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Minus, Pause, Play, Plus, RotateCcw, Timer } from "lucide-react";
import {
  OUTCOME_GLOSS,
  PICKABLE_SKIP_REASONS,
  SKIP_REASON_LABEL,
  SKIP_REASON_SHORT,
  type SkipReason,
} from "../../lib/set-outcome";
import type { JourneyRow, JourneySession, LiveSet, RepQuality } from "./types";
import { computeRowStats, formatSeconds, journeySummary, orderedSets } from "./stats";
import { QualityMark, QUALITY_MARK_LABEL } from "./QualityMark";

/* ------------------------------------------------------------------ *
 * Timer
 * ------------------------------------------------------------------ */

/**
 * Isolated so a 1Hz tick re-renders eleven characters, not the bar and not
 * the grid behind it. This is the old floating Stopwatch, moved in: it was
 * a position:fixed pill hovering above a position:fixed nav, which is two
 * overlays covering the bottom two rows of the very list it belongs to.
 *
 * "Log as TSC" is gone as a separate orange button. Stopping the clock
 * writes seconds to the focused machine, which is what the button did.
 */
const NowTimer = memo(function NowTimer({ onLogTSC }: { onLogTSC?: (seconds: number) => void }) {
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) ref.current = setInterval(() => setTime((t) => t + 1), 1000);
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [running]);

  const stopAndLog = useCallback(() => {
    setRunning(false);
    if (time > 0) onLogTSC?.(time);
  }, [time, onLogTSC]);

  return (
    <div className="jg-nb__timer">
      <button
        type="button"
        className="jg-nb__tbtn"
        aria-label={running ? "Stop the clock and log the time under tension" : "Start the clock"}
        onClick={() => (running ? stopAndLog() : setRunning(true))}
      >
        {running ? <Pause size={15} strokeWidth={2.5} fill="currentColor" /> : <Play size={15} strokeWidth={2.5} fill="currentColor" />}
      </button>
      <span className="jg-nb__time" aria-live="off">
        {formatSeconds(time).includes(":") ? formatSeconds(time) : `0:${String(time).padStart(2, "0")}`}
      </span>
      <button
        type="button"
        className="jg-nb__tbtn jg-nb__tbtn--quiet"
        aria-label="Reset the clock"
        onClick={() => {
          setRunning(false);
          setTime(0);
        }}
      >
        <RotateCcw size={13} strokeWidth={2.5} />
      </button>
    </div>
  );
});

/* ------------------------------------------------------------------ *
 * Bar
 * ------------------------------------------------------------------ */

export interface SessionNowBarProps {
  /** The machine being performed right now. */
  row?: JourneyRow;
  /** Its 1-based place in today's routine. */
  orderNumber?: number;
  value?: LiveSet;
  /** Every loaded session, oldest -> newest. Drives "last" and "best". */
  history: JourneySession[];
  onChange: (machineId: string, patch: Partial<LiveSet>) => void;
  /** Weight stepper increment in lb (MedX-style machines move in 2 lb steps). */
  step?: number;
  /** Next machine in the routine, and the handler that advances to it. */
  nextName?: string;
  onNext?: () => void;
  onLogTSC?: (seconds: number) => void;
  doneCount?: number;
  totalCount?: number;
}

const EMPTY: LiveSet = { weight: null, reps: null, seconds: null, isTSC: false, quality: null };

/* ------------------------------------------------------------------ *
 * Skip strip
 * ------------------------------------------------------------------ */

/**
 * "Why is this machine skipped?" — the reason vocabulary AJ approved on Sep
 * 12 2026, one tap each. Every reason but pain writes the skip and moves on
 * at once; pain asks one more question, "where?", because the answer is
 * what the pain map and the Monday review need and nobody remembers it by
 * the end of the session. The field is optional: a trainer with a client
 * waiting can still just hit "Save and next".
 */
function SkipStrip({
  machineName,
  onPick,
  onCancel,
}: {
  machineName: string;
  onPick: (reason: SkipReason, note: string | null) => void;
  onCancel: () => void;
}) {
  const [pain, setPain] = useState(false);
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (pain) inputRef.current?.focus();
  }, [pain]);

  return (
    <div className="jg-nb__skip" role="group" aria-label={`Why is ${machineName} skipped?`}>
      <span className="jg-nb__skiplbl">
        Skip <b>{machineName}</b> — why?
      </span>
      {!pain ? (
        <div className="jg-nb__reasons">
          {PICKABLE_SKIP_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              className={`jg-nb__reason ${r === "pain_injury" ? "jg-nb__reason--pain" : ""}`}
              onClick={() => (r === "pain_injury" ? setPain(true) : onPick(r, null))}
            >
              {SKIP_REASON_LABEL[r]}
            </button>
          ))}
          <button type="button" className="jg-nb__reason jg-nb__reason--cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="jg-nb__reasons">
          <input
            ref={inputRef}
            className="jg-nb__where"
            type="text"
            aria-label="Where is the pain? Optional."
            placeholder="Where? e.g. left knee (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onPick("pain_injury", note.trim() || null);
            }}
          />
          <button
            type="button"
            className="jg-nb__reason jg-nb__reason--go"
            onClick={() => onPick("pain_injury", note.trim() || null)}
          >
            Save and next
          </button>
          <button type="button" className="jg-nb__reason jg-nb__reason--cancel" onClick={() => setPain(false)}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Zone 4 -- "The Now".
 *
 * Everything the trainer needs between walking up to a machine and logging
 * the set, in one place that never moves: which machine, how it is set up
 * for this client, what to expect, the set itself, and what is next.
 *
 * It exists because the same controls inside the grid's Today column cost
 * 252px of width and forced a 96px row height on the whole timeline. Down
 * here width is free, so the settings can be spelled out ("Seat H 4" rather
 * than "SH4"), the steppers can be 44px, and the numbers can be big enough
 * to read at arm's length from the machine.
 */
function SessionNowBarImpl({
  row,
  orderNumber,
  value,
  history,
  onChange,
  step = 2,
  nextName,
  onNext,
  onLogTSC,
  doneCount,
  totalCount,
}: SessionNowBarProps) {
  const machine = row?.machine;
  const v = value ?? EMPTY;
  const weight = v.weight ?? row?.prescribedWeight ?? null;
  const sides = !!machine?.sides;
  const [skipOpen, setSkipOpen] = useState(false);
  // The strip belongs to one machine; moving on closes it.
  useEffect(() => setSkipOpen(false), [machine?.id]);

  /* --- what to expect: the last set, the best set, the journey --------- */
  const expect = useMemo(() => {
    if (!row) return null;
    const sets = orderedSets(row, history);
    const last = sets[sets.length - 1];
    const stats = computeRowStats(row, history);
    const best = stats.mostReps ?? stats.high;
    return { last, best: best?.set, readout: journeySummary(row, history) };
  }, [row, history]);

  const parseNum = (raw: string): number | null => {
    const n = Number(raw.replace(/[^\d.]/g, ""));
    return raw.trim() === "" || Number.isNaN(n) ? null : n;
  };

  const bump = (dir: 1 | -1) => {
    if (!machine) return;
    onChange(machine.id, { weight: Math.max(0, (weight ?? 0) + dir * step) });
  };

  const setQuality = (q: RepQuality) => {
    if (!machine) return;
    onChange(machine.id, { quality: v.quality === q ? null : q });
  };

  /* --- the outcome buttons: what this set WAS, when it was not a set ---- *
     Practice toggles; the numbers stay and are recorded, never counted.
     Skip opens the reason strip, and picking a reason moves on to the next
     machine by itself — a skip is the one entry that IS "move on", so the
     screen is allowed to move here where it never moves on its own for a
     set being judged. Tapping the active button again clears the outcome. */
  const togglePractice = () => {
    if (!machine) return;
    setSkipOpen(false);
    onChange(machine.id, v.outcome === "practice" ? { outcome: null } : { outcome: "practice" });
  };
  const pickSkip = (reason: SkipReason, note: string | null) => {
    if (!machine) return;
    setSkipOpen(false);
    onChange(machine.id, { outcome: "skipped", skipReason: reason, skipNote: note });
    onNext?.();
  };
  const clearSkip = () => {
    if (!machine) return;
    onChange(machine.id, { outcome: null, skipReason: null, skipNote: null });
  };

  if (!machine) {
    return (
      <div className="jg-nb jg-nb--empty">
        <span className="jg-nb__idle">Tap a machine in the Today column to start logging.</span>
      </div>
    );
  }

  const settingEntries = machine.settings ? Object.entries(machine.settings) : [];
  const label = (k: string) => machine.settingLabels?.[k] ?? k;

  /** One number + its unit, in a single control. Tapping the unit swaps it. */
  const outcome = (side: "L" | "R") => {
    const val = side === "R" ? (v.isTSC ? v.secondsR : v.repsR) : v.isTSC ? v.seconds : v.reps;
    const logged = val !== null && val !== undefined;
    return (
      <div className={`jg-nb__out ${logged ? "is-logged" : ""}`} key={side}>
        {sides && (
          <span className="jg-nb__side" aria-hidden="true">
            {side}
          </span>
        )}
        <input
          className="jg-nb__outin"
          type="text"
          inputMode="numeric"
          aria-label={`${sides ? (side === "R" ? "Right side " : "Left side ") : ""}${
            v.isTSC ? "seconds under tension" : "reps to failure"
          }`}
          placeholder="0"
          value={val ?? ""}
          onChange={(e) => {
            const n = parseNum(e.target.value);
            if (side === "R") onChange(machine.id, v.isTSC ? { secondsR: n } : { repsR: n });
            else onChange(machine.id, v.isTSC ? { seconds: n } : { reps: n });
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
        {side === "L" ? (
          <button
            type="button"
            className="jg-nb__unit"
            aria-pressed={v.isTSC}
            aria-label={
              v.isTSC ? "Logging seconds under tension. Switch to reps." : "Logging reps to failure. Switch to seconds."
            }
            onClick={() => onChange(machine.id, { isTSC: !v.isTSC })}
          >
            <Timer size={11} strokeWidth={2.5} aria-hidden="true" />
            {v.isTSC ? "SEC" : "REPS"}
          </button>
        ) : (
          <span className="jg-nb__unit is-static" aria-hidden="true">
            {v.isTSC ? "SEC" : "REPS"}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="jg-nb" aria-label="Current machine">
      {/* --- identity + setup + what to expect --- */}
      <div className="jg-nb__head">
        <span className="jg-nb__id">
          {orderNumber !== undefined && <i className="jg-nb__ord">{orderNumber}</i>}
          {/* Announced on change so a trainer using VoiceOver hears the machine
              switch without hunting for it. */}
          <span className="jg-nb__name" aria-live="polite">
            {machine.name}
          </span>
        </span>

        {settingEntries.length > 0 && (
          <span className="jg-nb__settings">
            {settingEntries.map(([k, val]) => (
              <span className="jg-nb__chip" key={k}>
                <b>{label(k)}</b>
                {val}
              </span>
            ))}
          </span>
        )}

        <span className="jg-nb__sp" />

        {expect && (
          <span className="jg-nb__expect">
            {expect.last && (
              <>
                Last{" "}
                <em>
                  {expect.last.weight} &times;{" "}
                  {expect.last.isTSC ? formatSeconds(expect.last.seconds ?? 0) : expect.last.reps}
                </em>
                {(expect.last.quality === 1 || expect.last.quality === 3) && (
                  <span className={`jg-nb__mark jg-nb__mark--q${expect.last.quality}`}>
                    <QualityMark quality={expect.last.quality} size={11} />
                  </span>
                )}
              </>
            )}
            {expect.best && !expect.best.isTSC && (
              <>
                {" · Best "}
                <em>
                  {expect.best.weight} &times; {expect.best.reps}
                </em>
              </>
            )}
            <span className="jg-nb__readout">
              {expect.readout}
              {totalCount ? ` · ${doneCount ?? 0} of ${totalCount} logged` : ""}
            </span>
          </span>
        )}
      </div>

      {/* --- the set --- */}
      {skipOpen ? (
        <div className="jg-nb__controls jg-nb__controls--skip">
          <SkipStrip machineName={machine.name} onPick={pickSkip} onCancel={() => setSkipOpen(false)} />
        </div>
      ) : (
      <div className="jg-nb__controls">
        <div className="jg-nb__step">
          <button type="button" className="jg-nb__sbtn" aria-label={`Decrease weight by ${step}`} onClick={() => bump(-1)}>
            <Minus size={18} strokeWidth={2.5} />
          </button>
          <div className="jg-nb__wwrap">
            <input
              className="jg-nb__weight"
              type="text"
              inputMode="decimal"
              aria-label="Weight in pounds"
              value={weight ?? ""}
              placeholder="lb"
              onChange={(e) => onChange(machine.id, { weight: parseNum(e.target.value) })}
              onFocus={(e) => e.currentTarget.select()}
            />
            <span className="jg-nb__lb" aria-hidden="true">
              lb
            </span>
          </div>
          <button type="button" className="jg-nb__sbtn" aria-label={`Increase weight by ${step}`} onClick={() => bump(1)}>
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>

        {outcome("L")}
        {sides && outcome("R")}

        <div className="jg-nb__quality" role="group" aria-label="Rep quality">
          <button
            type="button"
            className={`jg-nb__qbtn ${v.quality === 1 ? "is-on" : ""}`}
            data-q="1"
            aria-pressed={v.quality === 1}
            aria-label={`${QUALITY_MARK_LABEL[1].name}: ${QUALITY_MARK_LABEL[1].gloss}`}
            onClick={() => setQuality(1)}
          >
            <QualityMark quality={1} size={19} />
          </button>
          <button
            type="button"
            className={`jg-nb__qbtn ${v.quality === 3 ? "is-on" : ""}`}
            data-q="3"
            aria-pressed={v.quality === 3}
            aria-label={`${QUALITY_MARK_LABEL[3].name}: ${QUALITY_MARK_LABEL[3].gloss}`}
            onClick={() => setQuality(3)}
          >
            <QualityMark quality={3} size={19} />
          </button>
        </div>

        <div className="jg-nb__outcome" role="group" aria-label="Set outcome">
          <button
            type="button"
            className={`jg-nb__obtn ${v.outcome === "practice" ? "is-on" : ""}`}
            aria-pressed={v.outcome === "practice"}
            aria-label={`Practice set: ${OUTCOME_GLOSS.practice}`}
            onClick={togglePractice}
          >
            Practice
          </button>
          <button
            type="button"
            className={`jg-nb__obtn jg-nb__obtn--skip ${v.outcome === "skipped" ? "is-on" : ""}`}
            aria-pressed={v.outcome === "skipped"}
            aria-label={
              v.outcome === "skipped"
                ? `Skipped — ${SKIP_REASON_LABEL[v.skipReason ?? "unknown"]}. Tap to undo.`
                : `Skip this machine: ${OUTCOME_GLOSS.skipped}`
            }
            onClick={() => (v.outcome === "skipped" ? clearSkip() : setSkipOpen(true))}
          >
            {v.outcome === "skipped" ? `Skipped${SKIP_REASON_SHORT[v.skipReason ?? "unknown"] ? " · " + SKIP_REASON_SHORT[v.skipReason ?? "unknown"] : ""}` : "Skip"}
          </button>
        </div>

        <span className="jg-nb__sp" />
        <NowTimer onLogTSC={onLogTSC} />
      </div>
      )}

      {/* --- what is next --- */}
      <button type="button" className="jg-nb__next" onClick={onNext} disabled={!nextName}>
        <span className="jg-nb__nextlbl">{nextName ? "Next" : "Last machine"}</span>
        {nextName && <span className="jg-nb__nextname">{nextName}</span>}
        {nextName && <ChevronRight size={17} strokeWidth={2.5} />}
      </button>
    </div>
  );
}

export const SessionNowBar = memo(SessionNowBarImpl);
