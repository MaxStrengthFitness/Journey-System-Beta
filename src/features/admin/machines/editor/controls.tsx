import React from "react";
import { Lock, Plus, RotateCcw, X } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "../../primitives";
import type {
  AlignmentCheckpoint,
  MachineSettingField,
  MuscleId,
  TurnaroundRule,
} from "../../../../types/machines";
import { settingFieldKey } from "../../../../types/machines";

/**
 * THE MACHINE EDITOR'S CONTROLS.
 *
 * Round: Machine authoring, Sep 2026.
 *
 * Everything here is `adm`-native and iPad-sized. The form these replace was
 * a 60-input Radix dialog rendered at `sm:max-w-5xl` — edge to edge on an
 * iPad, with a sticky footer inside a fixed scroller, 24px muscle chips and
 * icon-only delete buttons. Nothing interactive below is under 40px, per
 * features/admin/README.md.
 *
 * The one idea that is not just styling is <FieldShell>. A studio editing its
 * copy of a catalog machine is looking at a MERGE, and the form has to say so
 * per field: this line is the standard, that one you changed, and here is the
 * way back. Without it "nothing is filled out" is replaced by "I cannot tell
 * what is mine", which is the same complaint one layer up.
 */

export const MUSCLE_LABELS: Record<MuscleId, string> = {
  pecs: "Pecs",
  "delts-front": "Front delts",
  "delts-rear": "Rear delts",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  traps: "Traps",
  rhomboids: "Rhomboids",
  lats: "Lats",
  "lower-back": "Lower back",
  abs: "Abs",
  obliques: "Obliques",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  adductors: "Adductors",
  abductors: "Abductors",
  calves: "Calves",
  neck: "Neck",
};

export const ALL_MUSCLES = Object.keys(MUSCLE_LABELS) as MuscleId[];

// ── The field wrapper ────────────────────────────────────────────────

export interface FieldShellProps {
  label: string;
  hint?: string;
  /** True when this value differs from the Max Strength standard. */
  changed?: boolean;
  /** Put it back to the standard. Absent when there is no standard to go to. */
  onRevert?: () => void;
  /** Read-only: this scope does not own the field. */
  locked?: boolean;
  children: React.ReactNode;
}

/**
 * One labelled field, with its inheritance state said out loud.
 *
 * "Standard" is deliberately NOT rendered as a badge on every untouched
 * field — twenty of those on one screen is noise. Only a difference earns a
 * mark, because a difference is the thing a manager is scanning for.
 */
export function FieldShell({
  label,
  hint,
  changed,
  onRevert,
  locked,
  children,
}: FieldShellProps) {
  return (
    <div className={`adm-me__field${locked ? " adm-me__field--locked" : ""}`}>
      <div className="adm-me__fieldhead">
        <span className="adm-label">{label}</span>
        {locked && (
          <span className="adm-me__lock">
            <Lock className="w-3 h-3" /> Max Strength
          </span>
        )}
        {changed && !locked && (
          <span className="adm-me__changed">
            Changed here
            {onRevert && (
              <button type="button" className="adm-me__revert" onClick={onRevert}>
                <RotateCcw className="w-3 h-3" /> Use the standard
              </button>
            )}
          </span>
        )}
      </div>
      {children}
      {hint && <p className="adm-hint">{hint}</p>}
    </div>
  );
}

/** A field's value as a trainer reads it, for a locked or read-mode section. */
export function ReadValue({ value }: { value?: string | null }) {
  if (!value || !value.trim()) {
    return <p className="adm-me__empty">Not set</p>;
  }
  return <p className="adm-me__prose">{value}</p>;
}

// ── Lists ────────────────────────────────────────────────────────────

export interface StringListProps {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  /**
   * Entries from the catalog that a studio may not remove. Rendered above the
   * studio's own, plainly marked, because resolve-machine is going to union
   * them anyway — showing them is the honest version of a merge that happens
   * whether or not the form mentions it.
   */
  inherited?: string[];
  readOnly?: boolean;
}

export function StringList({
  items,
  onChange,
  placeholder,
  inherited = [],
  readOnly,
}: StringListProps) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };

  if (readOnly) {
    const all = [...inherited, ...items];
    if (!all.length) return <p className="adm-me__empty">Not set</p>;
    return (
      <ul className="adm-me__list">
        {all.map((v, i) => (
          <li key={i} className="adm-me__listitem">
            {v}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="adm-me__stack">
      {inherited.length > 0 && (
        <div className="adm-me__inherited">
          <span className="adm-me__inheritedhead">
            <Lock className="w-3 h-3" /> From Max Strength — stays whatever you add
          </span>
          {inherited.map((v, i) => (
            <p key={i} className="adm-me__prose">
              {v}
            </p>
          ))}
        </div>
      )}
      {items.map((v, i) => (
        <div key={i} className="adm-me__row">
          <AdminTextarea
            rows={2}
            value={v}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <AdminButton
            variant="ghost"
            aria-label={`Remove "${v.slice(0, 40)}"`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <X className="w-4 h-4" /> Remove
          </AdminButton>
        </div>
      ))}
      <div className="adm-me__row">
        <AdminInput
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <AdminButton variant="quiet" onClick={add} disabled={!draft.trim()}>
          <Plus className="w-4 h-4" /> Add
        </AdminButton>
      </div>
    </div>
  );
}

// ── Muscle chips ─────────────────────────────────────────────────────

export function MuscleChips({
  selected,
  onChange,
  readOnly,
}: {
  selected: MuscleId[];
  onChange: (next: MuscleId[]) => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    if (!selected.length) return <p className="adm-me__empty">Not set</p>;
    return (
      <div className="adm-me__chips">
        {selected.map((m) => (
          <span key={m} className="adm-me__chip adm-me__chip--on">
            {MUSCLE_LABELS[m]}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="adm-me__chips">
      {ALL_MUSCLES.map((m) => {
        const on = selected.includes(m);
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            className={`adm-me__chip${on ? " adm-me__chip--on" : ""}`}
            onClick={() =>
              onChange(on ? selected.filter((x) => x !== m) : [...selected, m])
            }
          >
            {MUSCLE_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}

// ── Alignment checkpoints ────────────────────────────────────────────

export function Checkpoints({
  items,
  onChange,
  inherited = [],
  readOnly,
}: {
  items: AlignmentCheckpoint[];
  onChange: (next: AlignmentCheckpoint[]) => void;
  inherited?: AlignmentCheckpoint[];
  readOnly?: boolean;
}) {
  const set = (i: number, patch: Partial<AlignmentCheckpoint>) => {
    const next = [...items];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  if (readOnly) {
    const all = [...inherited, ...items];
    if (!all.length) return <p className="adm-me__empty">Not set</p>;
    return (
      <ol className="adm-me__checks">
        {all.map((c, i) => (
          <li key={i}>
            <span className="adm-me__checktitle">{c.title}</span>
            <span className="adm-me__prose">{c.verify}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="adm-me__stack">
      {inherited.length > 0 && (
        <div className="adm-me__inherited">
          <span className="adm-me__inheritedhead">
            <Lock className="w-3 h-3" /> From Max Strength — stays whatever you add
          </span>
          {inherited.map((c, i) => (
            <p key={i} className="adm-me__prose">
              <strong>{c.title}:</strong> {c.verify}
            </p>
          ))}
        </div>
      )}
      {items.map((c, i) => (
        <div key={i} className="adm-me__card">
          <div className="adm-me__row">
            <AdminInput
              value={c.title}
              placeholder="What to check — Knee Tracking"
              onChange={(e) => set(i, { title: e.target.value })}
            />
            <AdminButton
              variant="ghost"
              aria-label={`Remove the ${c.title || "untitled"} checkpoint`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <X className="w-4 h-4" /> Remove
            </AdminButton>
          </div>
          <AdminTextarea
            rows={2}
            value={c.verify}
            placeholder="What the coach must actually see, before the client moves"
            onChange={(e) => set(i, { verify: e.target.value })}
          />
        </div>
      ))}
      {/* Two is the working maximum. The template's own note: more than that
          and none of them get checked. */}
      {items.length < 4 && (
        <AdminButton
          variant="quiet"
          onClick={() => onChange([...items, { title: "", verify: "" }])}
        >
          <Plus className="w-4 h-4" /> Add a checkpoint
        </AdminButton>
      )}
    </div>
  );
}

// ── Turnarounds ──────────────────────────────────────────────────────

const TURNAROUND_STYLES: { value: TurnaroundRule["style"]; label: string }[] = [
  { value: "touch-and-go", label: "Touch and go — seamless, never dwell" },
  { value: "pause-squeeze", label: "Pause and squeeze — hold the contraction" },
  { value: "hard-stop", label: "Hard stop — a pin or the frame sets the limit" },
];

export function Turnaround({
  value,
  onChange,
  readOnly,
}: {
  value: TurnaroundRule;
  onChange: (next: TurnaroundRule) => void;
  readOnly?: boolean;
}) {
  const set = (patch: Partial<TurnaroundRule>) => onChange({ ...value, ...patch });

  if (readOnly) {
    const style = TURNAROUND_STYLES.find((s) => s.value === value?.style);
    return (
      <div className="adm-me__stack">
        {style && <AdminBadge tone="neutral">{style.label}</AdminBadge>}
        <ReadValue value={value?.description} />
        {value?.cue && <p className="adm-me__cue">“{value.cue}”</p>}
      </div>
    );
  }

  return (
    <div className="adm-me__stack">
      <AdminSelect
        value={value?.style ?? "touch-and-go"}
        onChange={(e) => set({ style: e.target.value as TurnaroundRule["style"] })}
      >
        {TURNAROUND_STYLES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </AdminSelect>
      <AdminTextarea
        rows={2}
        value={value?.description ?? ""}
        placeholder="What happens here, in the evaluator's words"
        onChange={(e) => set({ description: e.target.value })}
      />
      <AdminInput
        value={value?.cue ?? ""}
        placeholder="The spoken cue — Barely touch, barely start"
        onChange={(e) => set({ cue: e.target.value })}
      />
      {value?.style === "pause-squeeze" && (
        <div className="adm-grid">
          <div className="adm-field">
            <span className="adm-label">Pause on the first two reps</span>
            <AdminInput
              type="number"
              min={0}
              max={10}
              value={value.pauseSecondsFirstReps ?? ""}
              onChange={(e) =>
                set({
                  pauseSecondsFirstReps: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
            <p className="adm-hint">Seconds. Typically 1–2.</p>
          </div>
          <div className="adm-field">
            <span className="adm-label">Squeeze from the third rep</span>
            <AdminInput
              type="number"
              min={0}
              max={10}
              value={value.squeezeSecondsFromRepThree ?? ""}
              onChange={(e) =>
                set({
                  squeezeSecondsFromRepThree: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
            <p className="adm-hint">Seconds. Typically 2–3.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── The dials ────────────────────────────────────────────────────────

export function SettingFields({
  fields,
  defaults,
  onChangeFields,
  onChangeDefaults,
  readOnly,
}: {
  fields: MachineSettingField[];
  defaults: Record<string, string>;
  onChangeFields: (next: MachineSettingField[]) => void;
  onChangeDefaults: (next: Record<string, string>) => void;
  readOnly?: boolean;
}) {
  const setField = (i: number, patch: Partial<MachineSettingField>) => {
    const next = [...fields];
    next[i] = { ...next[i], ...patch };
    onChangeFields(next);
  };

  if (readOnly) {
    if (!fields.length) return <p className="adm-me__empty">Not set</p>;
    return (
      <ul className="adm-me__list">
        {fields.map((f) => (
          <li key={f.key} className="adm-me__listitem">
            {f.label}
            {defaults[f.key] ? ` — starts at ${defaults[f.key]}` : ""}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="adm-me__stack">
      {fields.map((f, i) => (
        <div key={f.key} className="adm-me__card">
          <div className="adm-me__dialhead">
            {/* The key is a foreign key into every client's saved settings.
                It is shown and never editable: renaming it silently orphans
                every stored value for that dial. The label above it is free. */}
            <AdminBadge tone="neutral">{f.key}</AdminBadge>
            <AdminButton
              variant="ghost"
              aria-label={`Remove the ${f.label} dial`}
              onClick={() => {
                onChangeFields(fields.filter((_, j) => j !== i));
                const next = { ...defaults };
                delete next[f.key];
                onChangeDefaults(next);
              }}
            >
              <X className="w-4 h-4" /> Remove
            </AdminButton>
          </div>
          <div className="adm-grid">
            <div className="adm-field">
              <span className="adm-label">What it is called here</span>
              <AdminInput
                value={f.label}
                onChange={(e) => setField(i, { label: e.target.value })}
              />
            </div>
            <div className="adm-field">
              <span className="adm-label">Where it starts</span>
              <AdminInput
                value={defaults[f.key] ?? ""}
                placeholder="P2, 4, 18 lbs"
                onChange={(e) =>
                  onChangeDefaults({ ...defaults, [f.key]: e.target.value })
                }
              />
            </div>
          </div>
        </div>
      ))}
      <NewDial
        existing={fields.map((f) => f.key)}
        onAdd={(label) =>
          onChangeFields([
            ...fields,
            { key: settingFieldKey(label), label, type: "text" },
          ])
        }
      />
    </div>
  );
}

function NewDial({
  existing,
  onAdd,
}: {
  existing: string[];
  onAdd: (label: string) => void;
}) {
  const [label, setLabel] = React.useState("");
  const key = settingFieldKey(label);
  const clash = !!key && existing.includes(key);
  return (
    <div className="adm-me__stack">
      <div className="adm-me__row">
        <AdminInput
          value={label}
          placeholder="Another dial on this unit — Back Pad"
          invalid={clash}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && key && !clash) {
              e.preventDefault();
              onAdd(label.trim());
              setLabel("");
            }
          }}
        />
        <AdminButton
          variant="quiet"
          disabled={!key || clash}
          onClick={() => {
            onAdd(label.trim());
            setLabel("");
          }}
        >
          <Plus className="w-4 h-4" /> Add a dial
        </AdminButton>
      </div>
      {clash && <p className="adm-hint--error">This unit already has a “{label}”.</p>}
    </div>
  );
}
