import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Minus, Pause, Play, Plus, RotateCcw, ShieldAlert, X } from "lucide-react";
import type { FlagLine } from "./session-flags";
import {
  OUTCOME_GLOSS,
  PICKABLE_SKIP_REASONS,
  SKIP_REASON_LABEL,
  SKIP_REASON_SHORT,
  type SkipReason,
} from "../../lib/set-outcome";
import type { TraineeLevel } from "../routine-builder/academy";
import type { JourneyRow, JourneySession, LiveSet, RepQuality } from "./types";
import { computeRowStats, formatSeconds, orderedSets } from "./stats";
import { QualityMark, QUALITY_MARK_LABEL } from "./QualityMark";

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
  /**
   * On the last machine the Next slot is not a dead end: it offers to add
   * another machine, because trainers do — a neck that hurts, an arm that
   * is fine after all. Opens the add-from-the-floor list.
   */
  onAddMachine?: () => void;
  /**
   * What is tied to THIS machine for THIS client — a critical note written on
   * it, a heads-up, a condition's instruction that names it. One line under
   * the settings, red or amber, a tap opens the machine sheet where the whole
   * of it lives (fluidity round, Sep 2026). Null when nothing is tied.
   */
  flagLine?: FlagLine | null;
  onOpenFlag?: () => void;
  /**
   * The client's training level. Unused since the progression cue left the
   * bar (fluidity round, Sep 18) — kept so callers need not change; a future
   * analytics reader may want it.
   */
  level?: TraineeLevel;
  /**
   * Seconds this machine has been the focused machine (lib/machine-clock.ts).
   * Shown quietly as "time on machine"; not the stopwatch, and not counted
   * as time under tension.
   */
  onMachineSeconds?: number | null;
  /** "side" lays the bar out as a right-hand column (landscape). */
  layout?: "bar" | "side";
}

const EMPTY: LiveSet = { weight: null, reps: null, seconds: null, isTSC: false, quality: null };

/* ------------------------------------------------------------------ *
 * Stopwatch — lives INSIDE the seconds field
 * ------------------------------------------------------------------ */

/**
 * The floating stopwatch used to be a fourth cluster on the set line, with
 * its own play / reset buttons and a reading that had nothing to do with
 * the number beside it. It is now part of the SEC control: switch the unit
 * to seconds and the clock appears in the same box; stopping it writes the
 * seconds into the field it sits in. Scoped to one machine — moving to
 * another machine resets it, so the seconds can never land on the wrong
 * machine.
 */
function Stopwatch({
  machineId,
  onStop,
}: {
  machineId: string;
  onStop: (seconds: number) => void;
}) {
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const timeRef = useRef(0);
  timeRef.current = time;

  useEffect(() => {
    setRunning(false);
    setTime(0);
  }, [machineId]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const stop = () => {
    setRunning(false);
    if (timeRef.current > 0) onStop(timeRef.current);
  };

  return (
    <span className={`jg-nb__watch ${running ? "is-running" : ""}`}>
      <button
        type="button"
        className="jg-nb__wbtn"
        aria-label={running ? "Stop the clock and log the seconds" : "Start the clock"}
        onClick={() => (running ? stop() : setRunning(true))}
      >
        {running ? (
          <Pause size={15} strokeWidth={2.5} fill="currentColor" />
        ) : (
          <Play size={15} strokeWidth={2.5} fill="currentColor" />
        )}
      </button>
      <span className="jg-nb__wtime" aria-live="off">
        {time >= 60 ? formatSeconds(time) : `0:${String(time).padStart(2, "0")}`}
      </span>
      <button
        type="button"
        className="jg-nb__wbtn jg-nb__wbtn--quiet"
        aria-label="Reset the clock"
        onClick={() => {
          setRunning(false);
          setTime(0);
        }}
      >
        <RotateCcw size={13} strokeWidth={2.5} />
      </button>
    </span>
  );
}

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
 * Zone 4 -- "The Now" (rebuilt in the tracker round, Sep 2026).
 *
 * The audit's verdict on the first version: the stats cluster in the corner
 * was clutter, the modifier row (kaizen ring, star, Practice, Skip, the
 * REPS/SEC toggle, a stopwatch) had no hierarchy, and the machine settings —
 * the thing a trainer needs FIRST, to set the machine up — were the
 * smallest text on the bar.
 *
 * The bar is now built around the one sentence AJ gave for how a set is
 * recorded: "the weight is always there; every set you enter reps; if you
 * aren't entering reps, that's when it's Practice or Skipped."
 *
 *   Line 1 — SET UP.  Order badge, machine name, then the settings as
 *            tiles (GAP 8 · SEAT 8) big enough to preset the machine from
 *            across it. On the right, one quiet context line: last set,
 *            best set, and the Up / Hold / Down cue.
 *   Line 2 — THE SET.  Three labelled groups. LOAD: − [66 lb] +, sized for
 *            three digits. SET: the reps field with a real REPS | SEC
 *            switch, and the stopwatch inside the field when SEC is on.
 *            FORM: the two exception marks. Then, visibly subordinate to
 *            the reps field, NO SET: Practice and Skip — the two things a
 *            set can be instead of a count. Choosing one turns the reps
 *            field itself into that outcome, so the field always says what
 *            happened on this machine.
 *   Line 3 — NEXT. Unchanged: the loudest control on the bar.
 *
 * Practice and Skipped are recorded for history and pain mapping but never
 * counted: every average reads performed sets only (src/lib/set-outcome.ts).
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
  onMachineSeconds,
  onAddMachine,
  flagLine = null,
  onOpenFlag,
  layout = "bar",
}: SessionNowBarProps) {
  const machine = row?.machine;
  const v = value ?? EMPTY;
  const weight = v.weight ?? row?.prescribedWeight ?? null;
  const sides = !!machine?.sides;
  const [skipOpen, setSkipOpen] = useState(false);
  // The strip belongs to one machine; moving on closes it.
  useEffect(() => setSkipOpen(false), [machine?.id]);

  /* --- what to expect: the last set and the best set ---------------------
     No progression cue. The bar used to say "▲ Up" against the last set;
     AJ (docs/business/the-floor.md): "the goal of this app is not to come up
     with a system that tells the trainer when they should be progressing —
     that's the trainer's job and will always be the trainer's job." The app
     shows what happened; the trainer decides what happens next. */
  const expect = useMemo(() => {
    if (!row) return null;
    const sets = orderedSets(row, history);
    const last = sets[sets.length - 1];
    const stats = computeRowStats(row, history);
    const best = stats.mostReps ?? stats.high;
    return { last, best: best?.set };
  }, [row, history]);
  /* The ghost in the count field: what she did last time, in grey, so the
     eye can stay at the bottom of the iPad instead of climbing the chart.
     A placeholder, never a value — tapping Next with it showing logs
     nothing. */
  const ghost = useMemo(() => {
    const last = expect?.last;
    if (!last) return "";
    if (last.isTSC) return last.seconds != null && last.seconds > 0 ? formatSeconds(last.seconds) : "";
    return last.reps != null && last.reps > 0 ? String(last.reps) : "";
  }, [expect]);

  const parseNum = (raw: string): number | null => {
    const n = Number(raw.replace(/[^\d.]/g, ""));
    return raw.trim() === "" || Number.isNaN(n) ? null : n;
  };

  const bump = (dir: 1 | -1) => {
    if (!machine) return;
    onChange(machine.id, { weight: Math.max(0, (weight ?? 0) + dir * step) });
  };

  /* Tapping the mark that is on takes it OFF — back to plain "completed"
     (2), which is what a set with reps is unless a trainer says otherwise.
     It used to send null, which the writer dropped on the floor, so a red
     ring tapped by mistake was permanent for the rest of the session. */
  const setQuality = (q: RepQuality) => {
    if (!machine) return;
    onChange(machine.id, { quality: v.quality === q ? 2 : q });
  };

  /* --- Practice / Skip: what the set WAS when it was not a set ---------- *
     Practice toggles; the numbers stay and are recorded, never counted.
     Skip opens the reason strip, and picking a reason moves on to the next
     machine by itself — a skip is the one entry that IS "move on", so the
     screen is allowed to move here where it never moves on its own for a
     set being judged. The × on the field clears either. */
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
  const clearOutcome = () => {
    if (!machine) return;
    onChange(machine.id, { outcome: null, skipReason: null, skipNote: null });
  };

  if (!machine) {
    return (
      <div className={`jg-nb jg-nb--empty jg-nb--${layout}`}>
        <span className="jg-nb__idle">Tap a machine in the Today column to start logging.</span>
      </div>
    );
  }

  const settingEntries = machine.settings ? Object.entries(machine.settings) : [];
  const label = (k: string) => machine.settingLabels?.[k] ?? k;
  const noSet = v.outcome === "practice" || v.outcome === "skipped";

  /** The count field for one side: a number and the unit it is counted in. */
  const countField = (side: "L" | "R") => {
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
          placeholder={ghost || "–"}
          value={val ?? ""}
          onChange={(e) => {
            const n = parseNum(e.target.value);
            if (side === "R") onChange(machine.id, v.isTSC ? { secondsR: n } : { repsR: n });
            else onChange(machine.id, v.isTSC ? { seconds: n } : { reps: n });
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
        {v.isTSC && side === "L" && (
          <Stopwatch
            machineId={machine.id}
            onStop={(seconds) => onChange(machine.id, { isTSC: true, seconds })}
          />
        )}
      </div>
    );
  };

  /** The field when the machine was not a set today: says so, with an × to undo. */
  const outcomeField = () => (
    <div className={`jg-nb__out jg-nb__out--${v.outcome} is-outcome`}>
      <span className="jg-nb__outlbl">
        {v.outcome === "practice"
          ? "Practice"
          : `Skipped${
              SKIP_REASON_SHORT[v.skipReason ?? "unknown"] ? " · " + SKIP_REASON_SHORT[v.skipReason ?? "unknown"] : ""
            }`}
      </span>
      <button
        type="button"
        className="jg-nb__outclear"
        onClick={clearOutcome}
        aria-label={v.outcome === "practice" ? "Undo practice — enter reps instead" : "Undo skip — enter reps instead"}
      >
        <X size={14} strokeWidth={2.75} />
      </button>
    </div>
  );

  return (
    <div className={`jg-nb jg-nb--${layout}`} aria-label="Current machine">
      {/* --- line 1 · set up ------------------------------------------- */}
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
          <span className="jg-nb__settings" aria-label="Machine settings for this client">
            {settingEntries.map(([k, val]) => (
              <span className="jg-nb__chip" key={k}>
                <b>{label(k)}</b>
                <span>{val}</span>
              </span>
            ))}
          </span>
        )}

        <span className="jg-nb__sp" />

        {expect && (
          <span className="jg-nb__expect">
            <span className="jg-nb__expectline">
              {expect.last ? (
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
              ) : (
                <>First time on this machine</>
              )}
              {expect.best && !expect.best.isTSC && (
                <>
                  {" · Best "}
                  <em>
                    {expect.best.weight} &times; {expect.best.reps}
                  </em>
                </>
              )}
            </span>
            {onMachineSeconds != null && onMachineSeconds > 0 ? (
              <span className="jg-nb__readout" title="Time this machine has been the current machine, session pauses excluded">
                On machine {onMachineSeconds >= 60 ? formatSeconds(onMachineSeconds) : `${onMachineSeconds}s`}
              </span>
            ) : null}
          </span>
        )}
      </div>

      {/* --- line 2 · the set ------------------------------------------ */}
      {skipOpen ? (
        <div className="jg-nb__controls jg-nb__controls--skip">
          <SkipStrip machineName={machine.name} onPick={pickSkip} onCancel={() => setSkipOpen(false)} />
        </div>
      ) : (
        <div className="jg-nb__controls">
          <div className="jg-nb__grp">
            <span className="jg-nb__kicker">Load</span>
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
                  placeholder="–"
                  size={3}
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
          </div>

          <div className={`jg-nb__grp jg-nb__grp--set ${noSet ? "is-noset" : ""}`}>
            <span className="jg-nb__kicker">Set</span>
            <div className="jg-nb__setrow">
              {noSet ? (
                outcomeField()
              ) : (
                <>
                  {countField("L")}
                  {sides && countField("R")}
                  <div className="jg-nb__unit" role="group" aria-label="Counted in">
                    <button
                      type="button"
                      className={`jg-nb__ubtn ${!v.isTSC ? "is-on" : ""}`}
                      aria-pressed={!v.isTSC}
                      onClick={() => v.isTSC && onChange(machine.id, { isTSC: false })}
                    >
                      Reps
                    </button>
                    <button
                      type="button"
                      className={`jg-nb__ubtn ${v.isTSC ? "is-on" : ""}`}
                      aria-pressed={v.isTSC}
                      onClick={() => !v.isTSC && onChange(machine.id, { isTSC: true })}
                    >
                      Sec
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="jg-nb__grp">
            <span className="jg-nb__kicker">Form</span>
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
          </div>

          <span className="jg-nb__sp" />

          {/* No reps? Then it was one of these. Ghost buttons: present every
              set, never competing with the count. */}
          {!noSet && (
            <div className="jg-nb__grp jg-nb__grp--noset">
              <span className="jg-nb__kicker">No set?</span>
              <div className="jg-nb__outcome" role="group" aria-label="Instead of a set">
                <button
                  type="button"
                  className="jg-nb__obtn"
                  aria-label={`Practice: ${OUTCOME_GLOSS.practice}`}
                  onClick={togglePractice}
                >
                  Practice
                </button>
                <button
                  type="button"
                  className="jg-nb__obtn"
                  aria-label={`Skip this machine: ${OUTCOME_GLOSS.skipped}`}
                  onClick={() => setSkipOpen(true)}
                >
                  Skip
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- the flag · what a previous trainer needs this one to know --- */}
      {flagLine && (
        <button
          type="button"
          className={`jg-nb__flag jg-nb__flag--${flagLine.tone}`}
          onClick={onOpenFlag}
          disabled={!onOpenFlag}
          aria-label={`Watch out on this machine: ${flagLine.text}${flagLine.more > 0 ? `, and ${flagLine.more} more` : ""}. Opens the machine sheet.`}
        >
          <ShieldAlert size={14} strokeWidth={2.5} aria-hidden="true" />
          <span className="jg-nb__flagtext">{flagLine.text}</span>
          {flagLine.more > 0 && <span className="jg-nb__flagmore">+{flagLine.more}</span>}
        </button>
      )}

      {/* --- line 3 · what is next --------------------------------------
          On the last machine this used to go dim and read "Last machine" — a
          dead end in the loudest slot on the bar. Now it offers the one thing
          a trainer might still want to do here. End Session stays at the top
          of the screen, where a thumb reaching for this cannot hit it. */}
      {nextName ? (
        <button type="button" className="jg-nb__next" onClick={onNext}>
          <span className="jg-nb__nextlbl">Next</span>
          <span className="jg-nb__nextname">{nextName}</span>
          <ChevronRight size={17} strokeWidth={2.5} />
        </button>
      ) : (
        <button
          type="button"
          className="jg-nb__next jg-nb__next--add"
          onClick={onAddMachine}
          disabled={!onAddMachine}
        >
          <span className="jg-nb__nextlbl">Last in today's order</span>
          <span className="jg-nb__nextname">Add another machine</span>
          <Plus size={17} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

export const SessionNowBar = memo(SessionNowBarImpl);
