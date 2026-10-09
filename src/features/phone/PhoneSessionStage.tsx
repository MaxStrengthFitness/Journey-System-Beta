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
 * machine menu (settings, notes) opens from a machine's name, as on the iPad.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronRight, ListOrdered, ListPlus, Minus, Plus, Route } from "lucide-react";
import type { JourneyRow, JourneySession, LiveSet, RepQuality } from "../journey-grid/types";
import type { Client } from "../../types";
import type { HistoryCoverage } from "../../lib/prior-history";
import { studioTodayKey } from "../../lib/studio-time";
import { QualityMark } from "../journey-grid/QualityMark";
import { knownElsewhere } from "../machine-menu/header-words";
import { noteKey } from "../machine-menu/note-key";
import {
  cardLogged,
  cardNextOf,
  countsSeconds,
  lastPerformed,
  lastTimes,
  noPastWords,
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
  /**
   * The rest of the floor, in its walking order, when the FileMaker floor is
   * showing (the open session round, Oct 9 2026; AJ's "1b": "you have every
   * machine on the screen and you just fill in the ones you did"): drawn
   * under today's cards as a plain list of names, each with its own Add.
   * Null or absent: today's cards only, as before.
   */
  floor?: JourneyRow[] | null;
  /** Adds a machine of the floor to today's list and makes it the card in hand (the grid's +). */
  onAddMachine?: (machineId: string) => void;
  /** Her past sessions, oldest → newest. */
  history: JourneySession[];
  values: Record<string, LiveSet>;
  focusId: string | null;
  onFocus: (machineId: string) => void;
  onChange: (machineId: string, patch: Partial<LiveSet>) => void;
  /** Send what is waiting now (moving on from a machine). */
  onCommit: () => void;
  /** The machine menu (features/machine-menu): settings, notes and how the client has done. */
  onOpenMachine: (machineId: string) => void;
  /** Reorder, add or take off a machine (the iPad's RoutineOrderSheet). */
  onReorder: () => void;
  /**
   * Routine A's plan's next machine for today (the first-session design
   * round, Oct 8 2026, §4.6), offered on the last card's Next ("Next in the
   * plan: Hip Abduction · Add") and under an empty list; null without one.
   */
  planNext?: { id: string; name: string } | null;
  /** Adds the plan's next machine to today's order (today only) and makes it the card in hand. */
  onAddPlanned?: (machineId: string) => void;
  /**
   * Routine A's plan, how far along ("The plan · 3 of 6"), and the door to
   * its sheet, the iPad's corner's (Swap in the plan, Can't do, Re-plan, the
   * Academy column): on a phone too, so a can't-do mid-session is never out
   * of reach (AJ's Q6: "you shouldn't really be blocked"; the whole-branch
   * review, Oct 9 2026). Absent without a plan.
   */
  plan?: { have: number; of: number } | null;
  onOpenPlan?: () => void;
  /**
   * Start from a routine… (the open session round, Oct 9 2026; AJ's "1b"):
   * the iPad corner's sheet, from the phone's foot. Absent until today's
   * list is on screen.
   */
  onStartFrom?: () => void;
  step?: number;
  /**
   * What a card with no past times may say (machine menu, Oct 2026): every
   * one of the client's sessions has had its sets read, the client's
   * coverage, and the running totals that know a machine was done before
   * (evidence only, never a count). Each defaults to the cautious answer.
   */
  everythingRead?: boolean;
  coverage?: HistoryCoverage;
  totals?: Pick<Client, "machineStats" | "currentMachineMetrics"> | null;
  /**
   * How far the read of the past sets has got (the tracker's logs window):
   * while it is out, or when it failed, a card says so rather than "nothing
   * recorded". Defaults to an answered read.
   */
  historyState?: "loading" | "ready" | "cache-only" | "failed";
}

export function PhoneSessionStage({
  rows,
  floor = null,
  onAddMachine,
  history,
  values,
  focusId,
  onFocus,
  onChange,
  onCommit,
  onOpenMachine,
  onReorder,
  planNext = null,
  onAddPlanned,
  plan = null,
  onOpenPlan,
  onStartFrom,
  step = 2,
  everythingRead = false,
  coverage = "unknown",
  totals = null,
  historyState = "ready",
}: PhoneSessionStageProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const today = studioTodayKey();
  const floorRows = floor && onAddMachine ? floor : null;

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
        <>
          <p className="ph-stage__empty">
            {floorRows && floorRows.length > 0 ? "Tap Add on a machine you're doing." : "No machines in today's routine yet."}
          </p>
          {planNext && onAddPlanned && (
            <button type="button" className="ph-card__next ph-card__next--plan ph-stage__plan" onClick={() => onAddPlanned(planNext.id)}>
              Next in the plan: <span>{planNext.name}</span> · Add
            </button>
          )}
        </>
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
                planNext={planNext && onAddPlanned ? planNext : null}
                onAddPlanned={(planned) => {
                  onCommit();
                  onAddPlanned?.(planned);
                }}
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
                noPast={noPastWords({
                  knownElsewhere: knownElsewhere(
                    { metric: totals?.currentMachineMetrics?.[id] ?? null, stat: totals?.machineStats?.[id] ?? null },
                    today,
                  ),
                  everythingRead,
                  coverage,
                  state: historyState,
                })}
              />
            );
          })}
        </ol>
      )}
      {floorRows && floorRows.length > 0 && (
        /* The rest of the floor: names only, in the walking order, each a
           40px Add. A plain list, never a second set of cards: the card is
           for the machine in hand. */
        <section className="ph-floor" aria-label="Rest of the floor">
          <h3 className="ph-floor__head">Rest of the floor</h3>
          <ul className="ph-floor__list">
            {floorRows.map((row) => (
              <li key={row.machine.id} className="ph-floor__row">
                <span className="ph-floor__name">{row.machine.name}</span>
                {row.machine.outOfService ? (
                  /* Out of service on the roster: said, with no Add (the grid's Today cell says the same). */
                  <span className="ph-floor__out">Out of service</span>
                ) : (
                  <button
                    type="button"
                    className="ph-floor__add"
                    aria-label={`Add ${row.machine.name} to today's session`}
                    onClick={() => {
                      onCommit();
                      onAddMachine?.(row.machine.id);
                    }}
                  >
                    <Plus size={16} strokeWidth={2.5} aria-hidden />
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="ph-stage__doors">
        <button type="button" className="ph-stage__reorder" onClick={onReorder}>
          <ListOrdered size={16} aria-hidden />
          Reorder or add a machine
        </button>
        {onStartFrom && (
          <button type="button" className="ph-stage__reorder" data-testid="phone-start-from" onClick={onStartFrom}>
            <ListPlus size={16} aria-hidden />
            Start from a routine…
          </button>
        )}
        {plan && onOpenPlan && (
          <button type="button" className="ph-stage__reorder" data-testid="phone-plan" onClick={onOpenPlan}>
            <Route size={16} aria-hidden />
            The plan · {plan.have} of {plan.of}
          </button>
        )}
      </div>
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
  planNext,
  onAddPlanned,
  onFocus,
  onNext,
  onChange,
  onOpenMachine,
  noPast,
}: {
  order: number;
  row: JourneyRow;
  history: JourneySession[];
  value: LiveSet | undefined;
  inHand: boolean;
  step: number;
  nextName: string | null;
  /** On the last card: the plan's next machine, offered as Next. */
  planNext: { id: string; name: string } | null;
  onAddPlanned: (machineId: string) => void;
  onFocus: () => void;
  onNext: () => void;
  onChange: (patch: Partial<LiveSet>) => void;
  onOpenMachine: () => void;
  /** What the strip says with no past times on the card (`noPastWords`). */
  noPast: string;
}) {
  const { machine } = row;
  const past = lastTimes(row, history);
  const last = lastPerformed(row, history);
  const seconds = countsSeconds(value, last);
  const weight = todayWeight(value, row);
  const logged = cardLogged(value);
  const outcome = value?.outcome ?? null;
  const bloodFlow = outcome === "practice" && value?.bloodFlow === true;
  const settings = machine.settings ? Object.entries(machine.settings) : [];
  const nextIs = cardNextOf(nextName, planNext);
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
          {machine.alert && <NoteLoudnessMark level={machine.alert} />}
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

      <PastStrip cells={past} none={noPast} />

      {outcome === "practice" || outcome === "skipped" ? (
        <p className="ph-card__outcome">
          {outcome === "practice" ? (bloodFlow ? "Blood flow set · not counted" : "Practice set · not counted") : "Skipped today"}
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
          className={`ph-chip${outcome === "practice" && !bloodFlow ? " is-on" : ""}`}
          aria-pressed={outcome === "practice" && !bloodFlow}
          onClick={() =>
            onChange(outcome === "practice" && !bloodFlow ? { outcome: null, bloodFlow: null } : { outcome: "practice", bloodFlow: null })
          }
        >
          Practice
        </button>
        {/* Blood flow: a light set when a muscle or joint isn't up to par,
            recorded and never counted, like practice (AJ, Oct 3 2026). */}
        <button
          type="button"
          className={`ph-chip${bloodFlow ? " is-on" : ""}`}
          aria-pressed={bloodFlow}
          onClick={() => onChange(bloodFlow ? { outcome: null, bloodFlow: null } : { outcome: "practice", bloodFlow: true })}
        >
          Blood flow
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

      {inHand &&
        (nextIs.kind === "plan" ? (
          /* A door left open, never the press-me-to-finish: the quiet dashed
             blue the iPad's Now Bar draws it in (.jg-nb__next--add), with the
             last machine's cue kept under it (the whole-branch review, Oct 9
             2026). */
          <>
            <button type="button" className="ph-card__next ph-card__next--plan" onClick={() => onAddPlanned(nextIs.id)}>
              Next in the plan: <span>{nextIs.name}</span> · Add
            </button>
            <p className="ph-card__last">Last machine · Finish is at the top</p>
          </>
        ) : (
          <button type="button" className="ph-card__next" onClick={onNext} disabled={nextIs.kind === "last"}>
            {nextIs.kind === "next" ? (
              <>
                Next: <span>{nextIs.name}</span>
              </>
            ) : (
              "Last machine · Finish is at the top"
            )}
          </button>
        ))}
    </li>
  );
}

/**
 * The mark beside the name: the loudest open note about the client on this
 * machine, in the one note key (machine-menu/note-key.ts), as on the iPad's
 * grid: a plum circle for a Heads up, the Hub's crimson triangle for
 * Critical (machine menu, Oct 2026).
 */
function NoteLoudnessMark({ level }: { level: "elevated" | "critical" }) {
  const key = noteKey(level);
  const Glyph = key.glyph;
  return <Glyph size={14} className="ph-card__alert" data-level={level} aria-label={`${key.word} note on this machine`} />;
}

/** The machine's last five times, newest on the right. */
function PastStrip({ cells, none }: { cells: PastCell[]; none: string }) {
  if (cells.length === 0) {
    return <p className="ph-past ph-past--none">{none}</p>;
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
