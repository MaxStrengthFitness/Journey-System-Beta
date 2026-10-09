import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronRight, Info, Minus, Pause, Play, Plus, RotateCcw, Ruler, ShieldAlert, X } from "lucide-react";
import type { FlagLine } from "./session-flags";
import {
  OUTCOME_GLOSS,
  PICKABLE_SKIP_REASONS,
  SKIP_REASON_LABEL,
  SKIP_REASON_SHORT,
  type SkipReason, BLOOD_FLOW_GLOSS, BLOOD_FLOW_LABEL } from "../../lib/set-outcome";
import type { TraineeLevel } from "../routine-builder/academy";
import type { JourneyRow, JourneySession, LiveSet, RepQuality } from "./types";
import { formatSeconds, orderedSets } from "./stats";
import { QualityMark, QUALITY_MARK_LABEL } from "./QualityMark";
import type { HistoryCoverage } from "../../lib/prior-history";
import { gainWords, progressFromSets } from "../machine-menu/progress-figure";
import type { StartingRangeSlot } from "../routine-plan/session-plan";
import "./journey-grid.css";

/* ------------------------------------------------------------------ *
 * Bar
 * ------------------------------------------------------------------ */

export interface SessionNowBarProps {
  /** The machine being performed right now. */
  row?: JourneyRow;
  /** Its 1-based place in today's routine. */
  orderNumber?: number;
  value?: LiveSet;
  /** Every loaded session, oldest -> newest. Drives "last" and the start. */
  history: JourneySession[];
  /**
   * Every one of the client's sessions has had its sets read, so the first
   * counted set in `history` really is Journey's first on this machine. Only
   * then may the start fall back to it when no starting weight is on file
   * (progress-figure.ts). Optional, defaulting to the cautious answer: no
   * fallback, so no start and no % without a starting weight on file.
   */
  everythingRead?: boolean;
  onChange: (machineId: string, patch: Partial<LiveSet>) => void;
  /**
   * The trainer has finished typing into a field on this machine: left it,
   * or pressed Enter (session record, Sep 26 2026). The field's writes wait
   * for typing to stop; this tells the tracker to send them now, so a set is
   * saved the moment it is entered rather than a moment later.
   */
  onCommit?: (machineId: string) => void;
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
   * The plan's next machine for today (the first-session design round, Oct
   * 8 2026, §4.6): Routine A's plan's first machine today's session doesn't
   * have (routine-plan/session-plan.ts). On the last machine the Next slot
   * offers it ("Next in the plan · Hip Abduction · Add") beside a quieter
   * "Add another machine"; an empty bar offers it beside "Add a machine".
   * Adding is today only: the Wrap-up decides what the routine keeps. Give
   * it a stable object (the bar is memo).
   */
  planNext?: { id: string; name: string } | null;
  /** Adds the plan's next machine to today's order and makes it the machine in hand. */
  onAddPlanned?: (machineId: string) => void;
  /** Today's order has nothing in it yet: the empty bar says so. */
  nothingToday?: boolean;
  /**
   * The Academy's starting range for this machine (AJ's "3a"), in the head's
   * readout slot, only on a first time here (routine-plan/session-plan.ts
   * `startingRangeSlot`): the range line with an (i), the quiet "Academy's
   * starting range" button while no column is picked, or nothing. It is a
   * reference beside the weight, never a number in it.
   */
  startingRange?: StartingRangeSlot;
  /** Opens the column picker ("pick") or the sheet's notes and source ("about"). */
  onStartingRange?: (mode: "pick" | "about") => void;
  /**
   * "First time on this machine" (the first-session design round, Oct 8
   * 2026, §4.6), in the readout slot, the history-claims words
   * (`noMachineHistoryLine`): the caller says it only when Journey holds the
   * client's whole story, every session's sets are read, nothing is on
   * record here and no running total knows the machine (the machine menu's
   * own gate). Null or absent, nothing: the bar stays as quiet as the Oct 3
   * round left it (AJ: "the text feels like clutter").
   */
  noHistoryLine?: string | null;
  /**
   * What is tied to THIS machine for THIS client — a critical note written on
   * it, a heads-up, a condition's instruction that names it. One line under
   * the settings, red or amber, a tap opens the machine menu where the whole
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
  /**
   * Reads the focused machine's seconds (lib/machine-clock.ts). Given it, the
   * bar ticks ITSELF once a second while `machineClockRunning`, and the
   * screen around it never redraws for the clock (speed round, Oct 5 2026;
   * R10: the whole Active Session used to re-render every second for this
   * one number). Wins over `onMachineSeconds`.
   */
  readMachineSeconds?: () => number;
  machineClockRunning?: boolean;
  /**
   * How much of this client's story Journey actually holds
   * (lib/client-coverage.ts). It decides ONE sentence on this bar, and that
   * sentence is the most-read line in the app: the trainer sees it walking
   * up to the machine, twice a machine, five to eight machines a session.
   *
   * "First time on this machine" is a claim about the CLIENT and may only be
   * made when Journey holds her whole story. Machine-level history does not
   * come across from FileMaker, so a woman who has used this machine four
   * hundred times arrives with nothing on it - and the bar told her trainer
   * she had never touched it. Anything short of `complete` says "Nothing
   * recorded", which is a claim about our RECORDS and is always true. Since
   * the machine menu (Oct 2026) it decides the start's label when the start
   * is Journey's first counted set ("First in Journey", or "First performed"
   * with the whole story); a starting weight on file is always "Starting
   * weight".
   *
   * Optional, defaulting to the cautious answer: a caller who forgets it
   * gets the safe sentence, never the confident one.
   */
  coverage?: HistoryCoverage;
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
  /*
   * READ THE CLOCK, NEVER COUNT THE TICKS (fixed Sep 22 2026).
   *
   * This used to be a one-second interval that incremented a counter, and it
   * handed that count straight to onStop. Browsers under-fire that timer when
   * busy, and iPadOS suspends it outright when the tab is backgrounded or the
   * screen locks - and the trainer sets the iPad down on the machine for the
   * whole of a sixty-to-ninety-second hold, or hops to the client's notes
   * mid-set (AJ, Sep 22). Every one of those silently under-counted the only
   * honest time-under-tension number in the app.
   *
   * The value is DERIVED now, the way ActiveSessionTimer and machine-clock.ts
   * already do it: seconds banked by earlier runs, plus now minus when this
   * run started. The interval below exists only to re-render - if it never
   * fires the readout freezes, but the number written on stop is still right.
   */
  const [running, setRunning] = useState(false);
  const [, setTick] = useState(0);
  /** Seconds banked by earlier runs of this watch, on this machine. */
  const bankedRef = useRef(0);
  /** When the current run began, or null while stopped. */
  const startedAtRef = useRef<number | null>(null);

  const elapsed = () =>
    bankedRef.current +
    (startedAtRef.current === null ? 0 : (Date.now() - startedAtRef.current) / 1000);

  const reset = () => {
    setRunning(false);
    bankedRef.current = 0;
    startedAtRef.current = null;
    setTick((t) => t + 1);
  };

  /* Scoped to one machine: moving on can never land seconds on the wrong one. */
  useEffect(() => {
    setRunning(false);
    bankedRef.current = 0;
    startedAtRef.current = null;
  }, [machineId]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = () => {
    startedAtRef.current = Date.now();
    setRunning(true);
  };

  const stop = () => {
    bankedRef.current = elapsed();
    startedAtRef.current = null;
    setRunning(false);
    const seconds = Math.round(bankedRef.current);
    if (seconds > 0) onStop(seconds);
  };

  const time = Math.floor(elapsed());

  return (
    <span className={`jg-nb__watch ${running ? "is-running" : ""}`}>
      <button
        type="button"
        className="jg-nb__wbtn"
        aria-label={running ? "Stop the clock and log the seconds" : "Start the clock"}
        onClick={() => (running ? stop() : start())}
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
        onClick={reset}
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
  onCommit,
  step = 2,
  nextName,
  onNext,
  onMachineSeconds: onMachineSecondsProp,
  readMachineSeconds,
  machineClockRunning = false,
  onAddMachine,
  planNext = null,
  onAddPlanned,
  nothingToday = false,
  startingRange = null,
  onStartingRange,
  noHistoryLine = null,
  flagLine = null,
  onOpenFlag,
  coverage = "unknown",
  everythingRead = false,
  layout = "bar",
}: SessionNowBarProps) {
  const onMachineSeconds = useMachineSeconds(readMachineSeconds, machineClockRunning) ?? onMachineSecondsProp;
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
    /* Where she started on this machine and how far the load has come (AJ,
       Oct 3 2026: "show the starting weight and then next to that a green %
       increase"). The machine menu says the same figure from the same module
       (machine-menu/progress-figure.ts; AJ, Oct 4 2026, Q2 (a)), so the two
       can never disagree: the starting weight ON FILE, labelled "Starting
       weight"; with none on file, the first counted set only once every
       session has been read (labelled "First in Journey", or "First
       performed" with the whole story); otherwise no start and no %. It
       used to call a typed starting weight, and the oldest of the sessions
       loaded, "First in Journey". Performed sets only. */
    const progress = progressFromSets(sets, { startingWeight: row.startingWeight, everythingRead, coverage });
    return { last, progress };
  }, [row, history, everythingRead, coverage]);
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

  /* Leaving a typed field sends what was typed; Enter leaves the field. The
     stepper is not a commit: it is tapped in runs, and the queue gathers a
     run into one write. */
  const commit = () => {
    if (machine) onCommit?.(machine.id);
  };
  const enterLeaves = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
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
    onChange(machine.id, v.outcome === "practice" ? { outcome: null, bloodFlow: null } : { outcome: "practice", bloodFlow: null });
  };
  /* Blood flow: a practice set with its own name (AJ, Oct 3 2026, "beside
     Practice / Skipped"). Recorded, never counted, like practice. */
  const toggleBloodFlow = () => {
    if (!machine) return;
    setSkipOpen(false);
    onChange(machine.id, v.outcome === "practice" && v.bloodFlow ? { outcome: null, bloodFlow: null } : { outcome: "practice", bloodFlow: true });
  };
  const pickSkip = (reason: SkipReason, note: string | null) => {
    if (!machine) return;
    setSkipOpen(false);
    onChange(machine.id, { outcome: "skipped", skipReason: reason, skipNote: note });
    onNext?.();
  };
  const clearOutcome = () => {
    if (!machine) return;
    onChange(machine.id, { outcome: null, bloodFlow: null, skipReason: null, skipNote: null });
  };

  /* The plan's next machine, offered where the bar would otherwise end:
     a dashed blue row, the whole row the Add (the first-session design
     round, Oct 8 2026, §4.6). Never orange: Start and Finish are the floor's
     only orange. */
  const planOffer =
    planNext && onAddPlanned ? (
      <button
        type="button"
        className="jg-nb__next jg-nb__next--add jg-nb__next--plan"
        onClick={() => onAddPlanned(planNext.id)}
        aria-label={`Next in the plan: add ${planNext.name} to today`}
      >
        <span className="jg-nb__nextlbl">Next in the plan</span>
        <span className="jg-nb__nextname">{planNext.name}</span>
        <span className="jg-nb__nextadd">
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          Add
        </span>
      </button>
    ) : null;

  if (!machine) {
    return (
      <div className={`jg-nb jg-nb--empty jg-nb--${layout}`}>
        <span className="jg-nb__idle">
          {nothingToday ? "Nothing in today's order yet." : "Tap a machine in the Today column to start logging."}
        </span>
        {(planOffer || onAddMachine) && (
          <div className="jg-nb__offers">
            {planOffer}
            {onAddMachine && (
              <button type="button" className="jg-nb__addmore" onClick={onAddMachine}>
                <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
                Add a machine
              </button>
            )}
          </div>
        )}
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
          onBlur={commit}
          onKeyDown={enterLeaves}
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
          ? v.bloodFlow
            ? BLOOD_FLOW_LABEL
            : "Practice"
          : `Skipped${
              SKIP_REASON_SHORT[v.skipReason ?? "unknown"] ? " · " + SKIP_REASON_SHORT[v.skipReason ?? "unknown"] : ""
            }`}
      </span>
      <button
        type="button"
        className="jg-nb__outclear"
        onClick={clearOutcome}
        aria-label={
          v.outcome === "practice"
            ? `Undo ${v.bloodFlow ? "blood flow" : "practice"} — enter reps instead`
            : "Undo skip — enter reps instead"
        }
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
            {noHistoryLine && (
              <span className="jg-nb__expectline" data-testid="nb-first">
                {noHistoryLine}
              </span>
            )}
            {/* The Academy's starting range (AJ's "3a"), only on a first
                time here, where the readout would otherwise be empty: a
                reference beside the weight, never typed into it. */}
            {startingRange?.kind === "line" && (
              <button
                type="button"
                className="jg-nb__range"
                data-testid="nb-range"
                onClick={() => onStartingRange?.("about")}
                disabled={!onStartingRange}
                aria-label={`${startingRange.says}${startingRange.forToday ? ", for today" : ""}. About the Academy's starting weights.`}
              >
                <span className="jg-nb__rangetext">
                  {startingRange.says}
                  {startingRange.forToday ? " · for today" : ""}
                </span>
                <Info size={14} strokeWidth={2.5} aria-hidden="true" />
              </button>
            )}
            {startingRange?.kind === "ask" && onStartingRange && (
              <button type="button" className="jg-nb__rangeask" data-testid="nb-range-ask" onClick={() => onStartingRange("pick")}>
                <Ruler size={14} strokeWidth={2.5} aria-hidden="true" />
                Academy's starting range
              </button>
            )}
            {/* No "Last · Best" here (AJ, Oct 3 2026: "the last isn't really
                needed, or even best"): the grid's row says both. */}
            {expect.progress && (
              <span className="jg-nb__expectline" data-testid="nb-start">
                {/* "Starting weight" for the number on file; Journey's first
                    set is "First performed" only when Journey holds her
                    whole story (docs/business/migration-and-prior-history.md). */}
                {expect.progress.startLabel} <em>{expect.progress.start} lb</em>
                {gainWords(expect.progress) && (
                  <span className="jg-nb__gain" data-testid="nb-gain">
                    {gainWords(expect.progress)}
                  </span>
                )}
              </span>
            )}
            {/* One faint line at the box's top right with the history above
                it (AJ, Oct 3 2026: "move that somewhere not invasive ... the
                top right of the box maybe in a faint gray"). Today's weight
                set at the last Wrap-up says who set it. */}
            {row?.weightSource || (onMachineSeconds != null && onMachineSeconds > 0) ? (
              <span className="jg-nb__readouts">
                {row?.weightSource ? (
                  <span className="jg-nb__readout" data-testid="weight-source">
                    {row.weightSource}
                  </span>
                ) : null}
                {onMachineSeconds != null && onMachineSeconds > 0 ? (
                  <span className="jg-nb__readout" title="Time this machine has been the current machine, session pauses excluded">
                    On machine {onMachineSeconds >= 60 ? formatSeconds(onMachineSeconds) : `${onMachineSeconds}s`}
                  </span>
                ) : null}
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
                  onBlur={commit}
                  onKeyDown={enterLeaves}
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
                  aria-label={`${BLOOD_FLOW_LABEL}: ${BLOOD_FLOW_GLOSS}`}
                  onClick={toggleBloodFlow}
                >
                  {BLOOD_FLOW_LABEL}
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
          aria-label={`Watch out on this machine: ${flagLine.text}${flagLine.more > 0 ? `, and ${flagLine.more} more` : ""}. Opens the machine menu.`}
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
      ) : planOffer ? (
        /* The last machine, with the plan's next one to offer: the plan's
           row, and a quieter Add another machine beside it. */
        <div className="jg-nb__offers">
          {planOffer}
          <button type="button" className="jg-nb__addmore" onClick={onAddMachine} disabled={!onAddMachine}>
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            Add another machine
          </button>
        </div>
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

/**
 * The machine clock's tick, kept inside the bar (R10): a redraw of the bar
 * once a second while the clock runs, and the reading taken as it draws.
 * Null when no reader is given (the caller passes a number instead).
 */
function useMachineSeconds(read: (() => number) | undefined, running: boolean): number | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!read || !running) return;
    const t = setInterval(() => setTick((n) => (n + 1) % 1_000_000), 1000);
    return () => clearInterval(t);
  }, [read, running]);
  return read ? read() : null;
}

export const SessionNowBar = memo(SessionNowBarImpl);
