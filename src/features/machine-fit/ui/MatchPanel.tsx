/**
 * MACHINE FIT — "Similar to": who this client is compared with.
 *
 * The brief: "It should look for an exact height match first, but be able to
 * expand … allow for the combination of a single factor or multiple."
 *
 * Height is on by default. Everything else is opt-in — most clients will
 * have no wingspan and no InBody scan, and a factor that is on but empty
 * cannot be matched on. The panel says so per factor ("not on file")
 * rather than letting a trainer switch it on and wonder why nothing changed.
 *
 * Each factor shows the ONE number that matters: how far it may stretch.
 * The ladder always starts as tight as it can and stops at the first band
 * with enough clients, so this is a ceiling, not a target.
 *
 * An inline panel, not a dialog: no overlay, no scroll lock, nothing for the
 * iPad to get stuck behind.
 */

import { Minus, Plus } from "lucide-react";
import { formatInches } from "../factors";
import { FACTOR_LABELS, FACTOR_UNITS, MAX_STEPS_LIMIT, widest, withFactor } from "../match-spec";
import { FACTOR_FIELD, NUMERIC_FACTORS, type FitFactors, type MatchSpec, type NumericFactor } from "../types";

export interface MatchPanelProps {
  spec: MatchSpec;
  target: FitFactors;
  onChange: (spec: MatchSpec) => void;
  onReset: () => void;
  /** "14 of 21 machines have enough similar clients." */
  coverage: string;
}

function onFile(factor: NumericFactor, target: FitFactors): string | null {
  const v = target[FACTOR_FIELD[factor]];
  if (typeof v !== "number") return null;
  if (factor === "height" || factor === "wingspan") return formatInches(v);
  if (factor === "bodyFat") return `${v}%`;
  if (factor === "age") return `${v}`;
  return `${v} lb`;
}

const WHERE: Partial<Record<NumericFactor, string>> = {
  wingspan: "Add it beside height on the client's record.",
  bodyFat: "Comes from the latest InBody scan.",
  muscle: "Comes from the latest InBody scan.",
  weight: "Add it on the client's record, or log an InBody scan.",
  age: "Comes from the date of birth.",
  height: "Add it on the client's record \u2014 nothing can be matched without it.",
};

export function MatchPanel({ spec, target, onChange, onReset, coverage }: MatchPanelProps) {
  return (
    <section className="fit-match" aria-label="Who this client is compared with">
      <header className="fit-match__head">
        <div>
          <h3 className="fit-match__title">Similar to</h3>
          <p className="fit-match__sub">
            The search starts as tight as it can and widens one step at a time, stopping at the first group of{" "}
            {spec.minClients} clients. These are ceilings, not targets.
          </p>
        </div>
        <button type="button" className="fit-btn fit-btn--quiet" onClick={onReset}>
          Height only
        </button>
      </header>

      <ul className="fit-match__list">
        {NUMERIC_FACTORS.map((factor) => {
          const t = spec.numeric[factor];
          const mine = onFile(factor, target);
          const unit = FACTOR_UNITS[factor];
          return (
            <li key={factor} className="fit-match__row" data-on={t.on || undefined} data-missing={mine === null || undefined}>
              <label className="fit-match__toggle">
                <input
                  type="checkbox"
                  checked={t.on}
                  onChange={(e) => onChange(withFactor(spec, factor, { on: e.target.checked }))}
                />
                <span className="fit-match__name">{FACTOR_LABELS[factor]}</span>
                <span className="fit-match__onfile">{mine ?? "not on file"}</span>
              </label>
              {t.on && mine !== null ? (
                <div className="fit-match__reach">
                  <button
                    type="button"
                    className="fit-step"
                    aria-label={`Narrow ${FACTOR_LABELS[factor]}`}
                    disabled={t.maxSteps <= 0}
                    onClick={() => onChange(withFactor(spec, factor, { maxSteps: t.maxSteps - 1 }))}
                  >
                    <Minus size={18} strokeWidth={2.6} aria-hidden />
                  </button>
                  <span className="fit-match__value">
                    {widest(t) === 0 ? "exact only" : `up to ±${widest(t)} ${unit}`}
                  </span>
                  <button
                    type="button"
                    className="fit-step"
                    aria-label={`Widen ${FACTOR_LABELS[factor]}`}
                    disabled={t.maxSteps >= MAX_STEPS_LIMIT}
                    onClick={() => onChange(withFactor(spec, factor, { maxSteps: t.maxSteps + 1 }))}
                  >
                    <Plus size={18} strokeWidth={2.6} aria-hidden />
                  </button>
                </div>
              ) : t.on ? (
                <p className="fit-match__why">{WHERE[factor]} Left out of the match until then.</p>
              ) : null}
            </li>
          );
        })}

        <li className="fit-match__row" data-on={spec.gender || undefined} data-missing={target.gender === null || undefined}>
          <label className="fit-match__toggle">
            <input type="checkbox" checked={spec.gender} onChange={(e) => onChange({ ...spec, gender: e.target.checked })} />
            <span className="fit-match__name">{FACTOR_LABELS.gender}</span>
            <span className="fit-match__onfile">
              {target.gender === "f" ? "Female" : target.gender === "m" ? "Male" : "not on file"}
            </span>
          </label>
          {spec.gender && target.gender === null ? (
            <p className="fit-match__why">Left out of the match until it is on the record.</p>
          ) : null}
        </li>
      </ul>

      <p className="fit-match__coverage">{coverage}</p>
      <p className="fit-match__note">
        Company-wide data knows height and gender only, so the other factors narrow the match to this studio&rsquo;s
        own clients.
      </p>
    </section>
  );
}
