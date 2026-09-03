import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Plus, Activity } from "lucide-react";
import { suggestedWeight } from "./adapters";
import { saveWeights, type MutationAuthor, type SaveWeightsResult } from "./mutations";
import type { EquipmentMachine } from "./types";

/**
 * The prescription — and the redesigned weight flow (box 9).
 *
 * The old "UPDATE WEIGHTS" modal showed two bare number boxes and a blue
 * "STUDIO STANDARD" label that was not a value, not a button, and did nothing.
 * It also cost a modal open and close to change a number the trainer was
 * already looking at.
 *
 * Now the numbers are editable where they are read. What the flow adds:
 *   - the DELTA, which is the number a trainer is actually judging (+26, +65%)
 *   - the studio standard as a real, tappable value rather than a caption
 *   - ± steppers at the studio's 2 lb increment, because pin stacks move in
 *     fixed steps and a keyboard on a tablet mid-session is a tax
 *   - no modal at all
 */

const STEP = 2;

function Stepper({
  label,
  value,
  onChange,
  emphasis = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  emphasis?: boolean;
}) {
  const nudge = (by: number) => {
    const base = Number(value);
    const next = Math.max(0, (Number.isFinite(base) ? base : 0) + by);
    onChange(String(next));
  };

  return (
    <div className={`eq-step ${emphasis ? "eq-step--current" : ""}`}>
      <span className="eq-rx__label">{label}</span>
      <div className="eq-step__row">
        <button type="button" className="eq-step__btn" onClick={() => nudge(-STEP)} aria-label={`${label} minus ${STEP}`}>
          <Minus size={16} strokeWidth={3} aria-hidden />
        </button>
        <input
          className="eq-step__input"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          aria-label={`${label} in pounds`}
        />
        <button type="button" className="eq-step__btn" onClick={() => nudge(STEP)} aria-label={`${label} plus ${STEP}`}>
          <Plus size={16} strokeWidth={3} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export interface PrescriptionCardProps {
  machine: EquipmentMachine;
  clientId: string;
  author: MutationAuthor | null;
  experienceLevel?: string;
  gender?: string;
  studioMachineSettings?: Record<string, Record<string, string>>;
  onSaved?: (result: SaveWeightsResult, machine: EquipmentMachine) => void;
  onError?: (message: string) => void;
}

export function PrescriptionCard({
  machine,
  clientId,
  author,
  experienceLevel,
  gender,
  studioMachineSettings,
  onSaved,
  onError,
}: PrescriptionCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [start, setStart] = useState("");
  const [current, setCurrent] = useState("");

  const standard = useMemo(
    () => suggestedWeight(machine, experienceLevel, gender, studioMachineSettings),
    [machine, experienceLevel, gender, studioMachineSettings],
  );

  useEffect(() => {
    setStart(machine.startingWeight?.toString() ?? "");
    setCurrent(machine.currentWeight?.toString() ?? "");
    setEditing(false);
  }, [machine.id, machine.startingWeight, machine.currentWeight]);

  const savedStart = machine.startingWeight;
  const savedCurrent = machine.currentWeight;
  const delta = savedStart !== null && savedCurrent !== null ? savedCurrent - savedStart : null;
  const pct = delta !== null && savedStart ? Math.round((delta / savedStart) * 100) : null;

  const dirty =
    (start.trim() || "") !== (savedStart?.toString() ?? "") ||
    (current.trim() || "") !== (savedCurrent?.toString() ?? "");

  const applyStandard = () => {
    setStart(String(standard));
    // A first prescription starts where it starts — current equals starting
    // until the client has actually moved. Never overwrite a real current.
    if (savedCurrent === null) setCurrent(String(standard));
  };

  const handleSave = async () => {
    if (!author) {
      onError?.("Trainer session required.");
      return;
    }
    setSaving(true);
    try {
      const result = await saveWeights({
        clientId,
        machineId: machine.id,
        machineName: machine.name,
        savedStarting: savedStart,
        savedCurrent,
        draftStarting: start,
        draftCurrent: current,
        author,
      });
      if (result) onSaved?.(result, machine);
      setEditing(false);
    } catch (err) {
      console.error(err);
      onError?.("Failed to save weights.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="eq-card">
      <header className="eq-card__head">
        <h3 className="eq-card__title">Prescription</h3>
        {!editing && (
          <button type="button" className="eq-btn eq-btn--live" onClick={() => setEditing(true)}>
            <Activity size={14} strokeWidth={2.4} aria-hidden />
            {savedCurrent === null ? "Set weights" : "Update"}
          </button>
        )}
      </header>

      <div className="eq-card__body">
        {!editing ? (
          <>
            <div className="eq-rx">
              <div className="eq-rx__stat">
                <span className="eq-rx__label">Starting</span>
                <span className={`eq-rx__value ${savedStart === null ? "eq-rx__value--empty" : ""}`}>
                  {savedStart ?? "—"}
                  {savedStart !== null && <small>lbs</small>}
                </span>
              </div>
              <div className="eq-rx__stat eq-rx__stat--current">
                <span className="eq-rx__label">Current</span>
                <span className={`eq-rx__value ${savedCurrent === null ? "eq-rx__value--empty" : ""}`}>
                  {savedCurrent ?? "—"}
                  {savedCurrent !== null && <small>lbs</small>}
                </span>
              </div>
              <div className="eq-rx__stat">
                <span className="eq-rx__label">Change</span>
                <span className="eq-rx__value">
                  {delta === null ? (
                    <span className="eq-rx__value--empty">—</span>
                  ) : (
                    <span className={`eq-rx__delta ${delta < 0 ? "eq-rx__delta--down" : ""}`}>
                      {delta > 0 ? "+" : ""}
                      {delta}
                      {pct !== null && (
                        <>
                          {" "}
                          ({pct > 0 ? "+" : ""}
                          {pct}%)
                        </>
                      )}
                    </span>
                  )}
                </span>
              </div>
            </div>
            <p className="eq-rx__std">
              Studio standard <b>{standard} lbs</b>
              {experienceLevel ? ` (${experienceLevel})` : ""}
            </p>
          </>
        ) : (
          <>
            <div className="eq-rx">
              <Stepper label="Starting" value={start} onChange={setStart} />
              <Stepper label="Current" value={current} onChange={setCurrent} emphasis />
            </div>

            <div className="eq-actions">
              <button type="button" className="eq-btn" onClick={applyStandard}>
                Use studio standard · {standard} lbs
              </button>
              <span className="eq-actions__spacer" />
              <button
                type="button"
                className="eq-btn eq-btn--ghost"
                disabled={saving}
                onClick={() => {
                  setStart(savedStart?.toString() ?? "");
                  setCurrent(savedCurrent?.toString() ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="eq-btn eq-btn--hero"
                onClick={handleSave}
                disabled={!dirty || saving}
              >
                {saving && <Loader2 size={14} className="animate-spin" aria-hidden />}
                Confirm
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
