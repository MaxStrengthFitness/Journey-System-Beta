import { useEffect, useMemo, useState } from "react";
import { Lightbulb, Loader2, Settings2 } from "lucide-react";
import type { EquipmentMachine, SettingFieldSpec } from "./types";
import type { JournalContext, MutationAuthor, SaveSettingsResult } from "./mutations";
import { saveSettings } from "./mutations";
import {
  parseHeightInches,
  statureBand,
  statureTip,
  suggestFromTrend,
} from "./setting-suggestions";
import { useMachineTrend } from "./useMachineTrend";

/**
 * Machine settings — read, then edit in place.
 *
 * Boxes 7 and 8 in the review. Two rules drive the whole component:
 *
 *  1. GHOSTS, NOT GUESSES. The studio standard shows as placeholder text in an
 *     empty field. It is never saved. The old "Initialize Parameters" dialog
 *     pre-filled every field for real, so tapping Save Setup wrote values the
 *     trainer never chose — which is exactly how a client ends up prescribed a
 *     weight nobody set.
 *  2. ONE EXCEPTION. A dial that is identical for every client on that machine
 *     is a fact, not a guess, so it pre-fills for real. Today that is the gap.
 *     WHICH dials qualify lives in adapters.ts (ABSOLUTE_STANDARDS), not in an
 *     `if` here, so adding the next one is a one-line change. WHAT it fills is
 *     the machine's own resolved default (absoluteValueFor) — until Sep 20
 *     2026 the constant supplied both and every machine pre-filled 0, against
 *     a catalog that says 2 on the row, pulldown, pullover, press and flye.
 *
 * SUGGESTIONS (client-profile audit, Sep 2026). While editing an EMPTY field
 * for a client whose height is on file, the card may offer what most clients
 * of about that height use on this machine (setting-suggestions.ts), with a
 * "Use" button. Still rule 1: nothing is filled until the trainer taps it.
 *
 * The audit reason (box 10) is required only when there were settings to
 * change. A first-time setup is not an override of anything, so demanding a
 * justification for it is friction with no audit value.
 */

function seedDraft(machine: EquipmentMachine): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const f of machine.fields) {
    const saved = machine.settings[f.key];
    if (saved !== undefined && saved !== "") {
      draft[f.key] = String(saved);
    } else if (f.absolute && f.absoluteValue !== undefined) {
      // Rule 2: absolute standards are pre-filled for real.
      draft[f.key] = f.absoluteValue;
    } else {
      draft[f.key] = "";
    }
  }
  return draft;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: SettingFieldSpec;
  value: string;
  onChange: (v: string) => void;
}) {
  // The ghost is the studio standard, shown but not owned. helpText from the
  // catalog wins when there is one ("Seat: 3-5" beats a bare "3").
  const placeholder = field.ghost ? `Std ${field.ghost}` : field.helpText || "—";

  if (field.type === "enum" && field.options?.length) {
    return (
      <select
        className="eq-field__select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={field.label}
      >
        <option value="">{placeholder}</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className="eq-field__input"
      // inputMode over type=number: iPad Safari's number spinner is a
      // fingertip-sized hazard beside a 46px field, and we want the numeric pad.
      inputMode={field.type === "number" ? "decimal" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={field.label}
    />
  );
}

export interface SettingsCardProps {
  machine: EquipmentMachine;
  clientId: string;
  author: MutationAuthor | null;
  onSaved?: (result: SaveSettingsResult, machine: EquipmentMachine) => void;
  onError?: (message: string) => void;
  /** Open in edit mode straight away (the in-session setup prompt does this). */
  startEditing?: boolean;
  journal?: JournalContext;
  /** The client's height as stored ("5'7\""). Enables suggestions for empty fields. */
  clientHeight?: string | null;
  /** The client's gender, for the catalog's stature baseline. */
  clientGender?: string | null;
  /**
   * The client's HOME studio. With it, a save also updates that studio's
   * machine-fit index (features/machine-fit); without it the index is simply
   * not touched and the rebuild script picks the row up later.
   */
  clientHomeStudioId?: string | null;
}

export function SettingsCard({
  machine,
  clientId,
  author,
  onSaved,
  onError,
  startEditing = false,
  journal,
  clientHeight = null,
  clientGender = null,
  clientHomeStudioId = null,
}: SettingsCardProps) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState<Record<string, string>>(() => seedDraft(machine));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  // Field key → the value "Use" put there. While the draft still holds that
  // value the field is saved as "suggested", which keeps it out of other
  // clients' evidence until this client has performed the machine with it.
  const [used, setUsed] = useState<Record<string, string>>({});

  // Selecting another machine must not carry the previous machine's draft.
  useEffect(() => {
    setDraft(seedDraft(machine));
    setReason("");
    setUsed({});
    setEditing(startEditing);
  }, [machine.id, startEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  const isInitialSetup = !machine.isConfigured;

  const heightIn = useMemo(() => parseHeightInches(clientHeight), [clientHeight]);
  const hasEmptyField = machine.fields.some((f) => !(machine.settings[f.key] ?? "").trim());
  // One read per machine per session, and only while editing something empty.
  const trend = useMachineTrend(machine.id, editing && heightIn !== null && hasEmptyField);
  const tip = useMemo(
    () => statureTip(machine.bodyType, statureBand(heightIn, clientGender)),
    [machine.bodyType, heightIn, clientGender],
  );

  const dirty = useMemo(
    () =>
      machine.fields.some(
        (f) => (draft[f.key] ?? "").trim() !== (machine.settings[f.key] ?? "").trim(),
      ),
    [draft, machine.fields, machine.settings],
  );

  const needsReason = dirty && !isInitialSetup;
  const canSave = dirty && (!needsReason || reason.trim().length > 0);

  const handleSave = async () => {
    if (!author) {
      onError?.("Trainer session required.");
      return;
    }
    setSaving(true);
    try {
      const result = await saveSettings({
        clientId,
        machineId: machine.id,
        fields: machine.fields,
        saved: machine.settings,
        draft,
        reason,
        author,
        isInitialSetup,
        machineName: machine.name,
        journal,
        existingSources: machine.sources,
        changedSources: Object.fromEntries(
          Object.entries(used)
            .filter(([k, v]) => (draft[k] ?? "").trim() === v)
            .map(([k]) => [k, "suggested" as const]),
        ),
        homeStudioId: clientHomeStudioId,
        existingAcks: machine.fitAcks ?? null,
      });
      if (result) onSaved?.(result, machine);
      setEditing(false);
      setReason("");
      setUsed({});
    } catch (err) {
      console.error(err);
      onError?.("Failed to save machine settings.");
    } finally {
      setSaving(false);
    }
  };

  if (machine.fields.length === 0) {
    return (
      <section className="eq-card">
        <header className="eq-card__head">
          <h3 className="eq-card__title">Machine settings</h3>
        </header>
        <div className="eq-card__body">
          <p className="eq-field__help">
            This machine has no adjustable settings on its catalog entry. Add them in the
            Machine Creator and they will appear here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="eq-card">
      <header className="eq-card__head">
        <h3 className="eq-card__title">Machine settings</h3>
        {!editing && (
          <button type="button" className="eq-btn eq-btn--live" onClick={() => setEditing(true)}>
            <Settings2 size={14} strokeWidth={2.4} aria-hidden />
            {isInitialSetup ? "Set up" : "Adjust"}
          </button>
        )}
      </header>

      <div className="eq-card__body">
        {!editing ? (
          <div className="eq-fields">
            {machine.fields.map((f) => {
              const v = machine.settings[f.key];
              return (
                <div className="eq-field" key={f.key}>
                  <span className="eq-field__label">{f.label}</span>
                  <div className="eq-field__read">
                    {v ? <b>{v}</b> : <i>{f.ghost ? `Std ${f.ghost}` : "Not set"}</i>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {tip && hasEmptyField && (
              <p className="eq-suggest__tip">
                <Lightbulb size={14} strokeWidth={2.4} aria-hidden />
                <span>
                  <b>{statureBand(heightIn, clientGender) === "shorter" ? "Shorter client" : "Taller client"}:</b> {tip}
                </span>
              </p>
            )}
            <div className="eq-fields">
              {machine.fields.map((f) => {
                const savedEmpty = !(machine.settings[f.key] ?? "").trim();
                const draftEmpty = !(draft[f.key] ?? "").trim();
                const suggestion =
                  savedEmpty && draftEmpty
                    ? suggestFromTrend(trend, [f.key, f.label], heightIn, f.options)
                    : null;
                return (
                  <div className="eq-field" key={f.key}>
                    <span className="eq-field__label">{f.label}</span>
                    <FieldInput
                      field={f}
                      value={draft[f.key] ?? ""}
                      onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                    />
                    {f.helpText && <span className="eq-field__help">{f.helpText}</span>}
                    {suggestion && (
                      <span className="eq-suggest">
                        <span className="eq-suggest__text">
                          Around {suggestion.heightLabel} here, the most common setting is <b>{suggestion.value}</b>{" "}
                          ({suggestion.clients} of {suggestion.bandClients} clients)
                        </span>
                        <button
                          type="button"
                          className="eq-suggest__use"
                          onClick={() => {
                            setDraft((d) => ({ ...d, [f.key]: suggestion.value }));
                            setUsed((u) => ({ ...u, [f.key]: suggestion.value }));
                          }}
                          aria-label={`Use ${suggestion.value} for ${f.label}`}
                        >
                          Use {suggestion.value}
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {needsReason && (
              <div className="eq-reason">
                <label className="eq-reason__label" htmlFor={`eq-reason-${machine.id}`}>
                  Reason for change (required)
                </label>
                <input
                  id={`eq-reason-${machine.id}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Needs more ROM, progressed past standard"
                />
              </div>
            )}

            <div className="eq-actions eq-actions--end">
              <button
                type="button"
                className="eq-btn eq-btn--ghost"
                onClick={() => {
                  setDraft(seedDraft(machine));
                  setReason("");
                  setUsed({});
                  setEditing(false);
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="eq-btn eq-btn--hero"
                onClick={handleSave}
                disabled={!canSave || saving}
              >
                {saving && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {isInitialSetup ? "Save setup" : "Log & save"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
