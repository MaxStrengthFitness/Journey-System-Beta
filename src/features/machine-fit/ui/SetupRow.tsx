/**
 * MACHINE FIT — one machine on the Setup screen.
 *
 * The same row in three modes, because it is the same fact looked at three
 * ways — what she is set to, what she could be set to, and whether what she
 * is set to looks like anyone else:
 *
 *   CHECK   the saved values, read-only. A value worth a look carries a plum
 *           diamond (shape AND colour — never red, which is rep quality's)
 *           and its sentence sits under the row. Nothing else is marked.
 *   SET UP  the values as cells, with the suggested set-up underneath: the
 *           offered values as chips, how many similar clients they rest on,
 *           and Use. Nothing is a value until it is tapped.
 *   QUICK   the same cells plus the load and an "abc" box for a line of
 *           FileMaker shorthand. No suggestions: this mode is for copying
 *           what a chart already says.
 *
 * The machine's name is never truncated (CLAUDE.md), and every target is at
 * least 44px.
 */

import { memo, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, ChevronUp, Diamond, Undo2 } from "lucide-react";
import type { FitFlag, FlagLevel } from "../types";
import { chainSentence, cohortPhrase, flagSentence, missingPhrase, noSuggestionSentence, suggestionSentence } from "./sentences";
import { shownValue, type FitField } from "./field-values";
import type { SetupMode } from "./setup-draft";
import type { SetupRowModel } from "./useSetupModel";

export const WEIGHT_KEY = "__weight";
export const cellId = (machineId: string, key: string) => `${machineId}::${key}`;

export interface SetupRowProps {
  row: SetupRowModel;
  mode: SetupMode;
  activeCell: string | null;
  padOn: boolean;
  /** The one cell handed back to the system keyboard ("abc"). */
  systemCell: string | null;
  weightShown: string;
  weightDirty: boolean;
  note: string | undefined;
  evidenceOpen: boolean;
  onActivate: (id: string) => void;
  onChange: (key: string, value: string) => void;
  onWeight: (value: string) => void;
  onEnter: () => void;
  onUse: (keys?: string[]) => void;
  onShorthand: (text: string) => void;
  onRevert: () => void;
  onToggleEvidence: () => void;
  onAcknowledge: (flag: FitFlag) => void;
  onAdjust: (key: string) => void;
}

function levelFor(row: SetupRowModel, field: FitField): FlagLevel | null {
  const flags = row.audit?.flags.filter((f) => (f.kind === "value" ? f.key === field.nk : f.keys.includes(field.nk))) ?? [];
  if (flags.some((f) => f.level === "rare")) return "rare";
  return flags.length > 0 ? "uncommon" : null;
}

function SetupRowImpl({
  row,
  mode,
  activeCell,
  padOn,
  systemCell,
  weightShown,
  weightDirty,
  note,
  evidenceOpen,
  onActivate,
  onChange,
  onWeight,
  onEnter,
  onUse,
  onShorthand,
  onRevert,
  onToggleEvidence,
  onAcknowledge,
  onAdjust,
}: SetupRowProps) {
  const { machine, fields } = row;
  const [shorthandOpen, setShorthandOpen] = useState(false);
  const [shorthand, setShorthand] = useState("");

  const show = {
    label: (nk: string) => fields.find((f) => f.nk === nk)?.label ?? nk,
    value: (nk: string, v: string) => {
      const f = fields.find((x) => x.nk === nk);
      return f ? shownValue(f, v) : v;
    },
  };

  const hasDraft = row.dirty.size > 0 || weightDirty || !!note;
  const rare = row.audit?.flags.filter((f) => f.level === "rare") ?? [];
  const editing = mode !== "check";
  const suggestion = row.suggestion;
  const offered = Object.keys(row.offer);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEnter();
    }
  };

  const state = !row.isSetUp && !hasDraft ? "empty" : rare.length > 0 && mode === "check" ? "flag" : "set";
  // Check is about what IS set. A machine with nothing saved is one quiet
  // line there, not a row of empty boxes — twenty machines fit on a screen.
  const compact = mode === "check" && !row.isSetUp && machine.currentWeight === null;

  if (compact) {
    return (
      <li className="fit-row fit-row--compact" data-state="empty" id={`fit-row-${machine.id}`}>
        <h4 className="fit-row__name">{machine.name}</h4>
        <div className="fit-row__meta">
          {row.routines.map((r) => (
            <span key={r} className="fit-tag">
              Routine {r}
            </span>
          ))}
          <span className="fit-row__empty">{fields.length > 0 ? "Not set up" : "No adjustable settings"}</span>
        </div>
      </li>
    );
  }

  return (
    <li className="fit-row" data-state={state} data-dirty={hasDraft || undefined} id={`fit-row-${machine.id}`}>
      <div className="fit-row__id">
        <h4 className="fit-row__name">{machine.name}</h4>
        <div className="fit-row__meta">
          {row.routines.map((r) => (
            <span key={r} className="fit-tag" title={`In Routine ${r}`}>
              Routine {r}
            </span>
          ))}
          {!row.isSetUp && fields.length > 0 ? <span className="fit-row__empty">Not set up</span> : null}
          {hasDraft ? (
            <button type="button" className="fit-row__revert" onClick={onRevert} aria-label={`Undo changes to ${machine.name}`}>
              <Undo2 size={14} strokeWidth={2.6} aria-hidden /> Undo
            </button>
          ) : null}
        </div>
      </div>

      <div className="fit-row__body">
        <div className="fit-row__main">
        {fields.length === 0 ? (
          <p className="fit-row__none">No adjustable settings on this machine&rsquo;s catalog entry.</p>
        ) : (
          <div className="fit-cells">
            {fields.map((f) => {
              const value = row.shown[f.key];
              const id = cellId(machine.id, f.key);
              const level = levelFor(row, f);
              if (!editing) {
                const flagged = level !== null;
                const inner = (
                  <>
                    <span className="fit-cell__label">{f.label}</span>
                    <span className="fit-cell__value">
                      {flagged ? <Diamond size={11} strokeWidth={3} aria-hidden className="fit-cell__mark" /> : null}
                      {value || "—"}
                    </span>
                  </>
                );
                return flagged ? (
                  <button
                    key={f.key}
                    type="button"
                    className="fit-cell fit-cell--read"
                    data-flag={level}
                    onClick={onToggleEvidence}
                    aria-label={`${f.label} ${value}: ${level === "rare" ? "worth a look" : "less common"}. Show why.`}
                  >
                    {inner}
                  </button>
                ) : (
                  <div key={f.key} className="fit-cell fit-cell--read" data-empty={!value || undefined}>
                    {inner}
                  </div>
                );
              }
              const offer = row.offer[f.key];
              const usePad = padOn && systemCell !== id;
              return (
                <label
                  key={f.key}
                  className="fit-cell fit-cell--edit"
                  data-active={activeCell === id || undefined}
                  data-dirty={row.dirty.has(f.key) || undefined}
                >
                  <span className="fit-cell__label">{f.label}</span>
                  <input
                    className="fit-cell__input"
                    id={`fit-cell-${id}`}
                    value={value}
                    // The pad types into this cell, so the system keyboard stays
                    // down — but a hardware keyboard still works, and "abc"
                    // hands one cell back to the system keyboard.
                    inputMode={usePad ? "none" : f.type === "number" ? "decimal" : "text"}
                    enterKeyHint="next"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder={offer && mode === "setup" ? offer.value : f.ghost ? `Std ${f.ghost}` : ""}
                    data-offer={(offer && mode === "setup") || undefined}
                    onFocus={() => onActivate(id)}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    onKeyDown={onKeyDown}
                    aria-label={`${machine.name} ${f.label}`}
                  />
                </label>
              );
            })}

            {editing ? (
              <label
                className="fit-cell fit-cell--edit fit-cell--weight"
                data-active={activeCell === cellId(machine.id, WEIGHT_KEY) || undefined}
                data-dirty={weightDirty || undefined}
              >
                <span className="fit-cell__label">Load lb</span>
                <input
                  className="fit-cell__input"
                  id={`fit-cell-${cellId(machine.id, WEIGHT_KEY)}`}
                  value={weightShown}
                  inputMode={padOn && systemCell !== cellId(machine.id, WEIGHT_KEY) ? "none" : "decimal"}
                  enterKeyHint="next"
                  autoComplete="off"
                  onFocus={() => onActivate(cellId(machine.id, WEIGHT_KEY))}
                  onChange={(e) => onWeight(e.target.value)}
                  onKeyDown={onKeyDown}
                  aria-label={`${machine.name} load in pounds`}
                />
              </label>
            ) : machine.currentWeight !== null ? (
              <div className="fit-cell fit-cell--read fit-cell--weight">
                <span className="fit-cell__label">Load lb</span>
                <span className="fit-cell__value">{machine.currentWeight}</span>
              </div>
            ) : null}

            {mode === "quick" ? (
              <button
                type="button"
                className="fit-abc"
                data-on={shorthandOpen || undefined}
                onClick={() => setShorthandOpen((v) => !v)}
                aria-expanded={shorthandOpen}
                aria-label={`Type ${machine.name} as a line of chart shorthand`}
              >
                abc
              </button>
            ) : null}
          </div>
        )}

          {/* Set up: what similar clients use. The offered VALUES are already in
              the empty boxes as placeholders, so this is one line: how many
              clients it rests on, and Use. */}
          {mode === "setup" && suggestion && offered.length > 0 && suggestion.ok === true ? (
            <div className="fit-suggest" data-strength={suggestion.strength}>
              <p className="fit-suggest__why">
                <span className="fit-suggest__kicker">{suggestion.strength === "strong" ? "Suggested" : "Possible"}</span>
                {suggestionSentence(suggestion)}
              </p>
              <div className="fit-suggest__actions">
                <button type="button" className="fit-btn fit-btn--live" onClick={() => onUse()}>
                  <Check size={16} strokeWidth={2.8} aria-hidden /> Use {offered.length > 1 ? "all" : "it"}
                </button>
                <button
                  type="button"
                  className="fit-btn fit-btn--quiet"
                  onClick={onToggleEvidence}
                  aria-expanded={evidenceOpen}
                  aria-label={`Why this is suggested for ${machine.name}`}
                >
                  Why {evidenceOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {mode === "quick" && shorthandOpen ? (
          <form
            className="fit-shorthand"
            onSubmit={(e) => {
              e.preventDefault();
              if (!shorthand.trim()) return;
              onShorthand(shorthand);
              setShorthand("");
              setShorthandOpen(false);
            }}
          >
            <input
              className="fit-shorthand__input"
              value={shorthand}
              onChange={(e) => setShorthand(e.target.value)}
              placeholder="As the chart says it: G:4, S:3, H:W  ·  Gap 6 seat 5 PILLOW"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              aria-label={`${machine.name} shorthand`}
            />
            <button type="submit" className="fit-btn fit-btn--live">
              Fill
            </button>
          </form>
        ) : null}

        {note ? <p className="fit-row__note">Kept as a note on this machine: {note}</p> : null}

        {mode === "setup" && suggestion && suggestion.ok === false && fields.some((f) => !row.shown[f.key]) ? (
          <p className="fit-row__quiet">{noSuggestionSentence(suggestion)}</p>
        ) : null}

        {/* ---- Check: what is worth a look ---- */}
        {mode === "check" && rare.length > 0
          ? rare.map((flag, i) => (
              <div key={i} className="fit-flag">
                <p className="fit-flag__text">
                  <Diamond size={12} strokeWidth={3} aria-hidden className="fit-flag__mark" />
                  {flagSentence(flag, show, row.audit?.cohort ?? null, row.audit?.tier ?? null)}
                </p>
                <div className="fit-flag__actions">
                  <button type="button" className="fit-btn fit-btn--quiet" onClick={() => onAcknowledge(flag)}>
                    Right for this client
                  </button>
                  <button
                    type="button"
                    className="fit-btn fit-btn--live"
                    onClick={() => onAdjust(fields.find((f) => f.nk === (flag.kind === "value" ? flag.key : flag.keys[0]))?.key ?? fields[0].key)}
                  >
                    Adjust
                  </button>
                </div>
              </div>
            ))
          : null}
        {mode === "check" && row.audit?.state === "not-enough" && row.isSetUp ? (
          <p className="fit-row__quiet">Too few similar clients are set up on this to compare yet.</p>
        ) : null}

        {/* ---- The evidence, for either mode ---- */}
        {evidenceOpen ? <Evidence row={row} show={show} mode={mode} onAcknowledge={onAcknowledge} onUse={onUse} /> : null}
      </div>
    </li>
  );
}

function Evidence({
  row,
  show,
  mode,
  onAcknowledge,
  onUse,
}: {
  row: SetupRowModel;
  show: { label: (nk: string) => string; value: (nk: string, v: string) => string };
  mode: SetupMode;
  onAcknowledge: (flag: FitFlag) => void;
  onUse: (keys?: string[]) => void;
}) {
  const fromSuggestion = mode === "setup" && row.suggestion && row.suggestion.cohort ? row.suggestion : null;
  const cohort = fromSuggestion?.cohort ?? row.audit?.cohort ?? null;
  const tier = fromSuggestion?.tier ?? row.audit?.tier ?? null;
  if (!cohort) return null;
  const missing = missingPhrase(cohort);
  const faint = mode === "check" ? (row.audit?.flags.filter((f) => f.level === "uncommon") ?? []) : [];
  const reviewed = mode === "check" ? (row.audit?.acknowledged ?? []) : [];

  return (
    <div className="fit-evidence">
      <p className="fit-evidence__who">
        Compared with <b>{cohort.clients}</b> {cohortPhrase(cohort, tier)}.
      </p>
      {cohort.ladder.length > 1 ? (
        <ol className="fit-ladder" aria-label="How the search widened">
          {cohort.ladder.map((step) => (
            <li key={step.ring} data-stop={step.ring === cohort.ring || undefined}>
              <span>{step.ring === 0 ? "Tightest" : `Step ${step.ring}`}</span>
              <b>{step.clients}</b>
            </li>
          ))}
        </ol>
      ) : null}
      {missing ? <p className="fit-evidence__note">{missing}</p> : null}
      {mode === "setup" && row.suggestion?.ok === true && chainSentence(row.suggestion, show) ? (
        <p className="fit-evidence__note">{chainSentence(row.suggestion, show)}</p>
      ) : null}

      {mode === "setup" && Object.keys(row.offer).length > 0 ? (
        <div className="fit-suggest__picks">
          <span className="fit-suggest__kicker">Use one</span>
          {row.fields
            .filter((f) => row.offer[f.key])
            .map((f) => (
              <button
                key={f.key}
                type="button"
                className="fit-pick"
                data-strong={row.offer[f.key].strong || undefined}
                onClick={() => onUse([f.key])}
                aria-label={`Use ${f.label} ${row.offer[f.key].value}`}
              >
                <span className="fit-pick__label">{f.label}</span>
                <b>{row.offer[f.key].value}</b>
                <span className="fit-pick__count">
                  {row.offer[f.key].universal ? "nearly everyone" : `${row.offer[f.key].support} of ${row.offer[f.key].outOf}`}
                </span>
              </button>
            ))}
        </div>
      ) : null}

      <div className="fit-dists">
        {row.fields.map((f) => {
          const counts = new Map<string, number>();
          let total = 0;
          for (const s of cohort.samples) {
            const v = s.settings[f.nk];
            if (v === undefined) continue;
            counts.set(v, (counts.get(v) ?? 0) + s.n);
            total += s.n;
          }
          if (total === 0) return null;
          const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
          const mine = row.shown[f.key];
          return (
            <div key={f.key} className="fit-dist">
              <span className="fit-dist__label">{f.label}</span>
              <ul className="fit-dist__bars">
                {top.map(([value, n]) => {
                  const shown = show.value(f.nk, value);
                  return (
                    <li key={value} data-mine={(mine && shown.toLowerCase() === mine.trim().toLowerCase()) || undefined}>
                      <span className="fit-dist__value">{shown}</span>
                      <span className="fit-dist__track">
                        <i style={{ width: `${Math.max(6, Math.round((n / total) * 100))}%` }} />
                      </span>
                      <span className="fit-dist__n">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {faint.map((flag, i) => (
        <div key={`f${i}`} className="fit-flag fit-flag--faint">
          <p className="fit-flag__text">{flagSentence(flag, show, cohort, tier)}</p>
          <div className="fit-flag__actions">
            <button type="button" className="fit-btn fit-btn--quiet" onClick={() => onAcknowledge(flag)}>
              Right for this client
            </button>
          </div>
        </div>
      ))}
      {reviewed.map((flag, i) => {
        const key = flag.kind === "value" ? flag.key : [...flag.keys].sort().join("+");
        const ack = row.machine.fitAcks?.[key];
        return (
          <p key={`r${i}`} className="fit-evidence__note">
            Reviewed{ack?.byName ? ` by ${ack.byName}` : ""}
            {ack?.at ? ` on ${new Date(ack.at).toLocaleDateString()}` : ""}: {flagSentence(flag, show, cohort, tier)}
          </p>
        );
      })}
    </div>
  );
}

export const SetupRow = memo(SetupRowImpl);
