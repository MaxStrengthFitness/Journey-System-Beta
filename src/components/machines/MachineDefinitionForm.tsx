import React from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, X, ShieldAlert, Lock } from "lucide-react";
import {
  ANATOMICAL_REGION_ORDER,
  AlignmentCheckpoint,
  AnatomicalRegion,
  AnatomyView,
  KinematicClass,
  MOVEMENT_PATTERN_ORDER,
  MachineDefinition,
  MachineSettingField,
  MovementPattern,
  MuscleId,
  TurnaroundRule,
  settingFieldKey,
} from "../../types/machines";

/**
 * MACHINE DEFINITION FORM
 *
 * Round: Machine Creator & Studio Roster, Sep 2026.
 *
 * One form, three surfaces. A catalog entry and a studio-original machine are
 * the same MachineDefinition, so the Admin Machine Creator, the studio's "Add
 * Custom Machine" flow and the roster manager's override editor all render
 * this component and differ only in where they write.
 *
 * Section order deliberately matches the studio's own "Master Machine Setup &
 * Biomechanics Template" so an evaluator working from the paper doc fills this
 * in top to bottom without hunting.
 *
 * `lockedFields` marks fields a studio may extend but not remove (the additive
 * safety content in lib/resolve-machine.ts). The form shows the inherited
 * entries greyed out and lets the studio append below them, which is the
 * honest UI for a merge the resolver is going to do anyway.
 */

const ALL_MUSCLES: MuscleId[] = [
  "pecs", "delts-front", "delts-rear", "biceps", "triceps", "forearms",
  "traps", "rhomboids", "lats", "lower-back",
  "abs", "obliques",
  "glutes", "quads", "hamstrings", "adductors", "abductors", "calves",
  "neck",
];

const MUSCLE_LABELS: Record<MuscleId, string> = {
  "pecs": "Pecs", "delts-front": "Front Delts", "delts-rear": "Rear Delts",
  "biceps": "Biceps", "triceps": "Triceps", "forearms": "Forearms",
  "traps": "Traps", "rhomboids": "Rhomboids", "lats": "Lats",
  "lower-back": "Lower Back", "abs": "Abs", "obliques": "Obliques",
  "glutes": "Glutes", "quads": "Quads", "hamstrings": "Hamstrings",
  "adductors": "Adductors", "abductors": "Abductors", "calves": "Calves",
  "neck": "Neck",
};

const selectClass =
  "w-full h-9 rounded-md border border-border bg-background px-3 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const sectionLabel =
  "text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground";

// ── Small building blocks ──────────────────────────────────────────────

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Free-text list: clinical warnings, cues, precise muscle names. */
function StringListEditor({
  items, onChange, placeholder, inherited = [],
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  /** Catalog entries the studio cannot remove — shown, not editable. */
  inherited?: string[];
}) {
  const [draft, setDraft] = React.useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      {inherited.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border p-2.5">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Lock className="h-3 w-3" /> From the catalog — cannot be removed
          </span>
          {inherited.map((v, i) => (
            <p key={i} className="text-xs text-muted-foreground">{v}</p>
          ))}
        </div>
      )}
      {items.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          <Textarea
            value={v}
            rows={2}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            className="min-h-0 text-sm"
          />
          <Button
            type="button" variant="ghost" size="icon"
            aria-label="Remove"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
          }}
        />
        <Button type="button" variant="outline" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function MusclePicker({
  selected, onChange,
}: { selected: MuscleId[]; onChange: (next: MuscleId[]) => void }) {
  const toggle = (m: MuscleId) =>
    onChange(selected.includes(m) ? selected.filter((x) => x !== m) : [...selected, m]);

  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_MUSCLES.map((m) => {
        const on = selected.includes(m);
        return (
          <button
            key={m}
            type="button"
            onClick={() => toggle(m)}
            aria-pressed={on}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {MUSCLE_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}

function TurnaroundEditor({
  title, value, onChange,
}: { title: string; value: TurnaroundRule; onChange: (v: TurnaroundRule) => void }) {
  const set = <K extends keyof TurnaroundRule>(k: K, v: TurnaroundRule[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <span className={sectionLabel}>{title}</span>

      <Field label="Style">
        <select
          className={selectClass}
          value={value.style}
          onChange={(e) => set("style", e.target.value as TurnaroundRule["style"])}
        >
          <option value="touch-and-go">Touch and go (compound — never dwell)</option>
          <option value="pause-squeeze">Pause / squeeze (rotary)</option>
          <option value="hard-stop">Hard stop (pin or frame)</option>
        </select>
      </Field>

      {value.style === "pause-squeeze" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pause, reps 1–2 (sec)">
            <Input
              type="number" min={0} max={10}
              value={value.pauseSecondsFirstReps ?? ""}
              onChange={(e) =>
                set("pauseSecondsFirstReps", e.target.value === "" ? undefined : Number(e.target.value))
              }
            />
          </Field>
          <Field label="Squeeze, rep 3+ (sec)">
            <Input
              type="number" min={0} max={10}
              value={value.squeezeSecondsFromRepThree ?? ""}
              onChange={(e) =>
                set("squeezeSecondsFromRepThree", e.target.value === "" ? undefined : Number(e.target.value))
              }
            />
          </Field>
        </div>
      )}

      <Field label="What happens here">
        <Textarea
          rows={2}
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <Field label="Verbal cue">
        <Input
          value={value.cue ?? ""}
          placeholder="Barely touch, barely start"
          onChange={(e) => set("cue", e.target.value || undefined)}
        />
      </Field>
    </div>
  );
}

function CheckpointEditor({
  items, onChange, inherited = [],
}: {
  items: AlignmentCheckpoint[];
  onChange: (next: AlignmentCheckpoint[]) => void;
  inherited?: AlignmentCheckpoint[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {inherited.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2.5">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Lock className="h-3 w-3" /> Non-negotiable, from the catalog
          </span>
          {inherited.map((c, i) => (
            <div key={i}>
              <p className="text-xs font-semibold">{c.title}</p>
              <p className="text-[11px] text-muted-foreground">{c.verify}</p>
            </div>
          ))}
        </div>
      )}

      {items.map((c, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <Input
              value={c.title}
              placeholder="Knee-to-Axis Alignment"
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...c, title: e.target.value };
                onChange(next);
              }}
            />
            <Button
              type="button" variant="ghost" size="icon" aria-label="Remove checkpoint"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            rows={2}
            value={c.verify}
            placeholder="What the coach must visually verify before the client moves."
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...c, verify: e.target.value };
              onChange(next);
            }}
          />
        </div>
      ))}

      {items.length < 4 && (
        <Button
          type="button" variant="outline"
          onClick={() => onChange([...items, { title: "", verify: "" }])}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add checkpoint
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground">
        Keep it to one or two. More than that and none of them get checked.
      </p>
    </div>
  );
}

function SettingFieldsEditor({
  fields, defaults, onFields, onDefaults,
}: {
  fields: MachineSettingField[];
  defaults: Record<string, string>;
  onFields: (f: MachineSettingField[]) => void;
  onDefaults: (d: Record<string, string>) => void;
}) {
  const addField = () => {
    const label = `Dial ${fields.length + 1}`;
    onFields([...fields, { key: settingFieldKey(label), label, type: "text" }]);
  };

  return (
    <div className="flex flex-col gap-3">
      {fields.map((f, i) => (
        <div key={f.key} className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">{f.key}</Badge>
            <Button
              type="button" variant="ghost" size="icon" aria-label="Remove dial"
              onClick={() => {
                onFields(fields.filter((_, j) => j !== i));
                const d = { ...defaults };
                delete d[f.key];
                onDefaults(d);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Label"
              hint="Safe to rename — saved client values follow the key, not this."
            >
              <Input
                value={f.label}
                onChange={(e) => {
                  const next = [...fields];
                  next[i] = { ...f, label: e.target.value };
                  onFields(next);
                }}
              />
            </Field>
            <Field label="Type">
              <select
                className={selectClass}
                value={f.type}
                onChange={(e) => {
                  const next = [...fields];
                  next[i] = { ...f, type: e.target.value as MachineSettingField["type"] };
                  onFields(next);
                }}
              >
                <option value="enum">Enum (fixed options)</option>
                <option value="number">Number</option>
                <option value="text">Free text</option>
              </select>
            </Field>
          </div>

          {f.type === "enum" && (
            <Field label="Options" hint="Comma separated, e.g. 1, 2, 3, 4">
              <Input
                value={(f.options ?? []).join(", ")}
                onChange={(e) => {
                  const next = [...fields];
                  next[i] = {
                    ...f,
                    options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  };
                  onFields(next);
                }}
              />
            </Field>
          )}

          <Field label="House default">
            <Input
              value={defaults[f.key] ?? ""}
              placeholder="Leave blank for no default"
              onChange={(e) => onDefaults({ ...defaults, [f.key]: e.target.value })}
            />
          </Field>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addField}>
        <Plus className="mr-1.5 h-4 w-4" /> Add adjustable dial
      </Button>
    </div>
  );
}

// ── The form ───────────────────────────────────────────────────────────

export interface MachineDefinitionFormProps {
  value: MachineDefinition;
  onChange: (next: MachineDefinition) => void;
  /**
   * When editing a studio override, pass the catalog's additive safety
   * content so the form can show what is inherited and un-removable.
   */
  inherited?: Pick<
    MachineDefinition,
    "clinicalWarnings" | "contraindicatedFor" | "alignmentCheckpoints"
  >;
}

export function MachineDefinitionForm({
  value, onChange, inherited,
}: MachineDefinitionFormProps) {
  const set = <K extends keyof MachineDefinition>(k: K, v: MachineDefinition[K]) =>
    onChange({ ...value, [k]: v });

  const setBaseline = <K extends keyof MachineDefinition["universalBaseline"]>(
    k: K, v: MachineDefinition["universalBaseline"][K],
  ) => set("universalBaseline", { ...value.universalBaseline, [k]: v });

  const setExec = <K extends keyof MachineDefinition["execution"]>(
    k: K, v: MachineDefinition["execution"][K],
  ) => set("execution", { ...value.execution, [k]: v });

  return (
    <Accordion
      type="multiple"
      defaultValue={["identity", "musculature", "baseline"]}
      className="w-full"
    >
      {/* 1 ── Identity & taxonomy */}
      <AccordionItem value="identity">
        <AccordionTrigger className="text-sm font-bold uppercase tracking-wide">
          1 · Identity &amp; Kinematics
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Machine name">
              <Input
                value={value.name}
                placeholder="LEG PRESS"
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Short name" hint="Optional — used where space is tight.">
              <Input
                value={value.shortName ?? ""}
                onChange={(e) => set("shortName", e.target.value || undefined)}
              />
            </Field>
            <Field label="Anatomical region">
              <select
                className={selectClass}
                value={value.anatomicalRegion}
                onChange={(e) => set("anatomicalRegion", e.target.value as AnatomicalRegion)}
              >
                {ANATOMICAL_REGION_ORDER.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Movement pattern">
              <select
                className={selectClass}
                value={value.movementPattern}
                onChange={(e) => set("movementPattern", e.target.value as MovementPattern)}
              >
                {MOVEMENT_PATTERN_ORDER.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field
              label="Kinematic class"
              hint="Compound takes touch-and-go at both ends. Rotary takes a pause/squeeze."
            >
              <select
                className={selectClass}
                value={value.kinematicClass}
                onChange={(e) => set("kinematicClass", e.target.value as KinematicClass)}
              >
                <option value="compound-linear">Compound / linear (multi-joint)</option>
                <option value="rotary-single-joint">Rotary / single-joint</option>
              </select>
            </Field>
            <Field label="Preferred diagram view">
              <select
                className={selectClass}
                value={value.preferredView}
                onChange={(e) => set("preferredView", e.target.value as AnatomyView)}
              >
                <option value="front">Anterior</option>
                <option value="back">Posterior</option>
                <option value="side">Side</option>
              </select>
            </Field>
            <Field label="Execution posture">
              <Input
                value={value.executionPosture ?? ""}
                placeholder="Chest Up / Anterior Pelvic Tilt"
                onChange={(e) => set("executionPosture", e.target.value || undefined)}
              />
            </Field>
            <Field label="Kinematic classification" hint="Free text, e.g. Compound Push.">
              <Input
                value={value.kinematicClassification ?? ""}
                onChange={(e) => set("kinematicClassification", e.target.value || undefined)}
              />
            </Field>
          </div>
          <Field label="Clinical note" hint="One sentence for the catalog card.">
            <Textarea
              rows={2}
              value={value.clinicalNote}
              onChange={(e) => set("clinicalNote", e.target.value)}
            />
          </Field>
        </AccordionContent>
      </AccordionItem>

      {/* 2 ── Target musculature */}
      <AccordionItem value="musculature">
        <AccordionTrigger className="text-sm font-bold uppercase tracking-wide">
          2 · Target Musculature
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-5 pt-2">
          <p className="text-[11px] text-muted-foreground">
            The chips drive the body diagram and are deliberately coarse. The text
            fields below carry the precise anatomy with joint actions — the diagram
            has no region for Multifidus or Pectineus, but a coach still needs to read it.
          </p>

          <Field label="Primary — diagram">
            <MusclePicker selected={value.primaryMuscles} onChange={(m) => set("primaryMuscles", m)} />
          </Field>
          <Field label="Secondary — diagram">
            <MusclePicker selected={value.secondaryMuscles} onChange={(m) => set("secondaryMuscles", m)} />
          </Field>
          <Field label="Synergists / stabilizers — diagram">
            <MusclePicker selected={value.synergistMuscles} onChange={(m) => set("synergistMuscles", m)} />
          </Field>

          <div className="h-px bg-border" />

          <Field label="Primary muscles — with joint actions">
            <StringListEditor
              items={value.musculature.primary}
              placeholder="Gluteus Medius (hip horizontal abduction)"
              onChange={(v) => set("musculature", { ...value.musculature, primary: v })}
            />
          </Field>
          <Field label="Secondary muscles">
            <StringListEditor
              items={value.musculature.secondary}
              placeholder="Posterior Deltoid"
              onChange={(v) => set("musculature", { ...value.musculature, secondary: v })}
            />
          </Field>
          <Field label="Synergists / stabilizers">
            <StringListEditor
              items={value.musculature.synergists}
              placeholder="Erector Spinae (spinal stabilizers)"
              onChange={(v) => set("musculature", { ...value.musculature, synergists: v })}
            />
          </Field>
        </AccordionContent>
      </AccordionItem>

      {/* 3 ── Universal baseline */}
      <AccordionItem value="baseline">
        <AccordionTrigger className="text-sm font-bold uppercase tracking-wide">
          3 · The Universal Baseline
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 pt-2">
          <p className="text-[11px] text-muted-foreground">
            The absolute starting point for an average-proportioned new client
            (roughly 5&apos;9&quot; male / 5&apos;4&quot; female).
          </p>
          <Field label="Seat height & position">
            <Textarea rows={2} value={value.universalBaseline.seatHeightPosition}
              placeholder="Set seat so the handles align with mid-chest. Seat back to P2."
              onChange={(e) => setBaseline("seatHeightPosition", e.target.value)} />
          </Field>
          <Field label="Pad & axis alignment">
            <Textarea rows={2} value={value.universalBaseline.padAxisAlignment}
              placeholder="Align the client's joint axis with the machine's physical pivot."
              onChange={(e) => setBaseline("padAxisAlignment", e.target.value)} />
          </Field>
          <Field label="Restraints & anchoring">
            <Textarea rows={2} value={value.universalBaseline.restraintsAnchoring}
              placeholder="Fasten lap belt snugly across the hip crease. Footstool for all clients."
              onChange={(e) => setBaseline("restraintsAnchoring", e.target.value)} />
          </Field>
          <Field label="Grip & hand position" hint="Optional — not every machine has one.">
            <Textarea rows={2} value={value.universalBaseline.gripHandPosition ?? ""}
              onChange={(e) => setBaseline("gripHandPosition", e.target.value || undefined)} />
          </Field>
          <Field
            label="Starting weight stack gap"
            hint="Free text on purpose — a third of the lineup has no single numeric answer ('None', 'Custom', '1 or 2')."
          >
            <Input value={value.universalBaseline.startingWeightStackGap}
              placeholder="Gap of 2"
              onChange={(e) => setBaseline("startingWeightStackGap", e.target.value)} />
          </Field>
        </AccordionContent>
      </AccordionItem>

      {/* 4 ── Body type adjustments */}
      <AccordionItem value="bodytype">
        <AccordionTrigger className="text-sm font-bold uppercase tracking-wide">
          4 · Body Type Adjustments
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-5 pt-2">
          {(["shorterStature", "tallerStature"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <span className={sectionLabel}>
                {k === "shorterStature" ? "Shorter stature / short limbs" : "Taller stature / long limbs"}
              </span>
              <Field label="Seat adjustment">
                <Input value={value.bodyTypeAdjustments[k].seatAdjustment ?? ""}
                  placeholder="Raise seat, move back pad forward"
                  onChange={(e) => set("bodyTypeAdjustments", {
                    ...value.bodyTypeAdjustments,
                    [k]: { ...value.bodyTypeAdjustments[k], seatAdjustment: e.target.value || undefined },
                  })} />
              </Field>
              <Field label="Pad / handle placement">
                <Input value={value.bodyTypeAdjustments[k].padHandlePlacement ?? ""}
                  placeholder="Use narrow handle setting (N)"
                  onChange={(e) => set("bodyTypeAdjustments", {
                    ...value.bodyTypeAdjustments,
                    [k]: { ...value.bodyTypeAdjustments[k], padHandlePlacement: e.target.value || undefined },
                  })} />
              </Field>
              <Field label="Special setup notes">
                <Textarea rows={2} value={value.bodyTypeAdjustments[k].specialNotes ?? ""}
                  placeholder="Watch for head clearance or midsection congestion"
                  onChange={(e) => set("bodyTypeAdjustments", {
                    ...value.bodyTypeAdjustments,
                    [k]: { ...value.bodyTypeAdjustments[k], specialNotes: e.target.value || undefined },
                  })} />
              </Field>
            </div>
          ))}

          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <span className={sectionLabel}>Limited mobility / joint constraints</span>
            <Field label="Range of motion restrictions">
              <Textarea rows={2} value={value.bodyTypeAdjustments.limitedMobility.romRestrictions ?? ""}
                placeholder="Increase weight stack gap to 4 to protect a compromised shoulder"
                onChange={(e) => set("bodyTypeAdjustments", {
                  ...value.bodyTypeAdjustments,
                  limitedMobility: { ...value.bodyTypeAdjustments.limitedMobility, romRestrictions: e.target.value || undefined },
                })} />
            </Field>
            <Field label="Alternative protocols" hint="Static Hold (SH) or Timed Static Contraction (TSC).">
              <Textarea rows={2} value={value.bodyTypeAdjustments.limitedMobility.alternativeProtocols ?? ""}
                placeholder="TSC: pin an immovable load at the midpoint, 30s @ 50% / 75% / 100%"
                onChange={(e) => set("bodyTypeAdjustments", {
                  ...value.bodyTypeAdjustments,
                  limitedMobility: { ...value.bodyTypeAdjustments.limitedMobility, alternativeProtocols: e.target.value || undefined },
                })} />
            </Field>
            <Field label="Notes">
              <Textarea rows={2} value={value.bodyTypeAdjustments.limitedMobility.specialNotes ?? ""}
                onChange={(e) => set("bodyTypeAdjustments", {
                  ...value.bodyTypeAdjustments,
                  limitedMobility: { ...value.bodyTypeAdjustments.limitedMobility, specialNotes: e.target.value || undefined },
                })} />
            </Field>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* 5 ── Alignment checkpoints */}
      <AccordionItem value="checkpoints">
        <AccordionTrigger className="text-sm font-bold uppercase tracking-wide">
          5 · Critical Alignment Checkpoints
        </AccordionTrigger>
        <AccordionContent className="pt-2">
          <CheckpointEditor
            items={value.alignmentCheckpoints}
            inherited={inherited?.alignmentCheckpoints}
            onChange={(v) => set("alignmentCheckpoints", v)}
          />
        </AccordionContent>
      </AccordionItem>

      {/* 6 ── Execution & cadence */}
      <AccordionItem value="execution">
        <AccordionTrigger className="text-sm font-bold uppercase tracking-wide">
          6 · Execution &amp; Cadence
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 pt-2">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-xs font-semibold">Requires trainer handoff</p>
              <p className="text-[11px] text-muted-foreground">
                On when leverage is poorest at the start and the coach must transfer the load.
              </p>
            </div>
            <Switch
              checked={value.execution.requiresHandoff}
              onCheckedChange={(c) => setExec("requiresHandoff", c)}
            />
          </div>

          {value.execution.requiresHandoff && (
            <>
              <Field label="Handoff protocol">
                <Textarea rows={3} value={value.execution.handoffProtocol ?? ""}
                  placeholder="Coach assumes a wide base, grabs the movement arm and the handle, pulls back with the client..."
                  onChange={(e) => setExec("handoffProtocol", e.target.value || undefined)} />
              </Field>
              <Field label="Handoff cue">
                <Input value={value.execution.handoffCue ?? ""}
                  placeholder="That... is... yours"
                  onChange={(e) => setExec("handoffCue", e.target.value || undefined)} />
              </Field>
            </>
          )}

          <Field label="Load-up protocol" hint="Cracking the stack — the patient 3–5 second pressure build.">
            <Textarea rows={3} value={value.execution.loadUpProtocol}
              placeholder="Build pressure through the footplate over 3–5 seconds."
              onChange={(e) => setExec("loadUpProtocol", e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Concentric (sec)">
              <Input type="number" min={1} max={30} value={value.execution.concentricSeconds}
                onChange={(e) => setExec("concentricSeconds", Number(e.target.value))} />
            </Field>
            <Field label="Eccentric (sec)">
              <Input type="number" min={1} max={30} value={value.execution.eccentricSeconds}
                onChange={(e) => setExec("eccentricSeconds", Number(e.target.value))} />
            </Field>
          </div>

          <Field label="Cadence notes" hint="Anything beyond the two numbers — e.g. the Leg Curl ankle-toggling protocol.">
            <Textarea rows={2} value={value.execution.cadenceNotes ?? ""}
              onChange={(e) => setExec("cadenceNotes", e.target.value || undefined)} />
          </Field>

          <TurnaroundEditor
            title="Upper turnaround"
            value={value.execution.upperTurnaround}
            onChange={(v) => setExec("upperTurnaround", v)}
          />
          <TurnaroundEditor
            title="Lower turnaround"
            value={value.execution.lowerTurnaround}
            onChange={(v) => setExec("lowerTurnaround", v)}
          />

          <Field label="Key coaching cues">
            <StringListEditor
              items={value.execution.keyCues}
              placeholder="Drive through the elbows, not the hands"
              onChange={(v) => setExec("keyCues", v)}
            />
          </Field>
        </AccordionContent>
      </AccordionItem>

      {/* 7 ── Safety */}
      <AccordionItem value="safety">
        <AccordionTrigger className="text-sm font-bold uppercase tracking-wide">
          7 · Safety &amp; Contraindications
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 pt-2">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold">Never train to failure</p>
                <Switch
                  checked={value.execution.neverToFailure ?? false}
                  onCheckedChange={(c) => setExec("neverToFailure", c || undefined)}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Set for Lumbar Extension and Cervical Extension. The session UI reads this flag,
                so it is enforced rather than merely displayed.
              </p>
            </div>
          </div>

          {value.execution.neverToFailure && (
            <Field label="Safety notice">
              <Textarea rows={2} value={value.execution.safetyNotice ?? ""}
                placeholder="Never take this machine to failure. Stop the set early if form degrades."
                onChange={(e) => setExec("safetyNotice", e.target.value || undefined)} />
            </Field>
          )}

          <Field label="Clinical warnings" hint="Studios can add to these but never remove them.">
            <StringListEditor
              items={value.clinicalWarnings}
              inherited={inherited?.clinicalWarnings}
              placeholder="Use extremely light loads; stop if any cervical pain is felt"
              onChange={(v) => set("clinicalWarnings", v)}
            />
          </Field>
          <Field label="Contraindicated for">
            <StringListEditor
              items={value.contraindicatedFor}
              inherited={inherited?.contraindicatedFor}
              placeholder="Osteoporosis / osteopenia"
              onChange={(v) => set("contraindicatedFor", v)}
            />
          </Field>
          <Field label="Sequencing contraindications">
            <StringListEditor
              items={value.sequencingContraindications}
              placeholder="Avoid pairing with Lumbar Extension in the same workout"
              onChange={(v) => set("sequencingContraindications", v)}
            />
          </Field>
          <Field label="Biomechanical notes">
            <Textarea rows={3} value={value.biomechanicalNotes ?? ""}
              onChange={(e) => set("biomechanicalNotes", e.target.value || undefined)} />
          </Field>
        </AccordionContent>
      </AccordionItem>

      {/* 8 ── Dials */}
      <AccordionItem value="dials">
        <AccordionTrigger className="text-sm font-bold uppercase tracking-wide">
          8 · Adjustable Dials
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 pt-2">
          <p className="text-[11px] text-muted-foreground">
            Each dial has a permanent key and a renameable label. Every client&apos;s saved
            setting is stored against the key, so changing a label never orphans their data.
          </p>
          <SettingFieldsEditor
            fields={value.settingFields}
            defaults={value.defaultSettings}
            onFields={(f) => set("settingFields", f)}
            onDefaults={(d) => set("defaultSettings", d)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Baseline load — male (lbs)">
              <Input type="number" value={value.baselineLoad?.male ?? ""}
                onChange={(e) => set("baselineLoad", {
                  ...value.baselineLoad,
                  male: e.target.value === "" ? undefined : Number(e.target.value),
                })} />
            </Field>
            <Field label="Baseline load — female (lbs)">
              <Input type="number" value={value.baselineLoad?.female ?? ""}
                onChange={(e) => set("baselineLoad", {
                  ...value.baselineLoad,
                  female: e.target.value === "" ? undefined : Number(e.target.value),
                })} />
            </Field>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/** A blank definition prefilled with the house cadence and turnaround defaults. */
export function emptyMachineDefinition(): MachineDefinition {
  return {
    name: "",
    anatomicalRegion: "Chest",
    movementPattern: "Upper Body: Horizontal Push",
    kinematicClass: "compound-linear",
    primaryMuscles: [],
    secondaryMuscles: [],
    synergistMuscles: [],
    musculature: { primary: [], secondary: [], synergists: [] },
    preferredView: "front",
    clinicalNote: "",
    universalBaseline: {
      seatHeightPosition: "",
      padAxisAlignment: "",
      restraintsAnchoring: "",
      startingWeightStackGap: "",
    },
    bodyTypeAdjustments: {
      shorterStature: {},
      tallerStature: {},
      limitedMobility: {},
    },
    alignmentCheckpoints: [],
    execution: {
      requiresHandoff: false,
      loadUpProtocol: "",
      concentricSeconds: 6,
      eccentricSeconds: 6,
      upperTurnaround: { style: "touch-and-go", description: "" },
      lowerTurnaround: { style: "touch-and-go", description: "" },
      keyCues: [],
    },
    clinicalWarnings: [],
    contraindicatedFor: [],
    sequencingContraindications: [],
    settingFields: [],
    defaultSettings: {},
  };
}
