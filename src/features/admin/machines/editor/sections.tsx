import React from "react";
import {
  AdminBadge,
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "../../primitives";
import {
  ANATOMICAL_REGION_ORDER,
  MOVEMENT_PATTERN_ORDER,
  type AnatomicalRegion,
  type AnatomyView,
  type KinematicClass,
  type MachineDefinition,
  type MovementPattern,
} from "../../../../types/machines";
import type { SectionId } from "../completeness";
import {
  Checkpoints,
  FieldShell,
  MuscleChips,
  ReadValue,
  SettingFields,
  StringList,
  Turnaround,
} from "./controls";

/**
 * THE EIGHT SECTIONS, in the Academy template's own order.
 *
 * Each one renders in two modes off the same source. `read` is prose — what a
 * trainer sees on the machine's page — and `edit` is inputs. That is not two
 * views bolted together: it is the answer to who owns the field. A studio
 * looking at the company's cadence gets the read version with a lock, an
 * admin gets inputs, and the Read toggle in the masthead lets an admin see
 * what the floor sees without leaving the screen.
 *
 * Keeping both here rather than in a separate preview component is what stops
 * them drifting — a field added to the editor and forgotten in the preview is
 * a field the floor never learns about.
 */

export interface SectionProps {
  value: MachineDefinition;
  /** The Max Strength entry this is a copy of, when there is one. */
  standard?: MachineDefinition;
  set: <K extends keyof MachineDefinition>(key: K, value: MachineDefinition[K]) => void;
  /** True when this whole section is the company's and not this scope's. */
  readOnly: boolean;
  /** Has this field been changed away from the standard? */
  changed: (key: keyof MachineDefinition) => boolean;
  revert: (key: keyof MachineDefinition) => void;
}

function useFieldProps(p: SectionProps) {
  return (key: keyof MachineDefinition, label: string, hint?: string) => ({
    label,
    hint,
    locked: p.readOnly,
    changed: p.standard ? p.changed(key) : false,
    onRevert: p.standard ? () => p.revert(key) : undefined,
  });
}

// ── 1. Identity ──────────────────────────────────────────────────────

function Identity(p: SectionProps) {
  const f = useFieldProps(p);
  const v = p.value;
  return (
    <div className="adm-me__fields">
      <FieldShell {...f("name", "Name")}>
        {p.readOnly ? (
          <ReadValue value={v.name} />
        ) : (
          <AdminInput value={v.name ?? ""} onChange={(e) => p.set("name", e.target.value)} />
        )}
      </FieldShell>

      <FieldShell
        {...f("shortName", "Short name", "For tight spaces. Never a truncation of the full name.")}
      >
        {p.readOnly ? (
          <ReadValue value={v.shortName} />
        ) : (
          <AdminInput
            value={v.shortName ?? ""}
            onChange={(e) => p.set("shortName", e.target.value)}
          />
        )}
      </FieldShell>

      <FieldShell {...f("anatomicalRegion", "Region")}>
        {p.readOnly ? (
          <ReadValue value={v.anatomicalRegion} />
        ) : (
          <AdminSelect
            value={v.anatomicalRegion ?? ""}
            onChange={(e) => p.set("anatomicalRegion", e.target.value as AnatomicalRegion)}
          >
            <option value="">Choose a region</option>
            {ANATOMICAL_REGION_ORDER.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </AdminSelect>
        )}
      </FieldShell>

      <FieldShell {...f("movementPattern", "Movement pattern")}>
        {p.readOnly ? (
          <ReadValue value={v.movementPattern} />
        ) : (
          <AdminSelect
            value={v.movementPattern ?? ""}
            onChange={(e) => p.set("movementPattern", e.target.value as MovementPattern)}
          >
            <option value="">Choose a pattern</option>
            {MOVEMENT_PATTERN_ORDER.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </AdminSelect>
        )}
      </FieldShell>

      <FieldShell
        {...f(
          "kinematicClass",
          "Kinematics",
          "Compound is multi-joint, rotary is single-joint. It decides how the app groups and compares this machine.",
        )}
      >
        {p.readOnly ? (
          <ReadValue
            value={
              v.kinematicClass === "compound-linear"
                ? "Compound — multi-joint"
                : "Rotary — single-joint"
            }
          />
        ) : (
          <AdminSelect
            value={v.kinematicClass ?? "compound-linear"}
            onChange={(e) => p.set("kinematicClass", e.target.value as KinematicClass)}
          >
            <option value="compound-linear">Compound — multi-joint</option>
            <option value="rotary-single-joint">Rotary — single-joint</option>
          </AdminSelect>
        )}
      </FieldShell>

      <FieldShell {...f("executionPosture", "Posture")}>
        {p.readOnly ? (
          <ReadValue value={v.executionPosture} />
        ) : (
          <AdminInput
            value={v.executionPosture ?? ""}
            placeholder="Chest Up / Anterior Pelvic Tilt"
            onChange={(e) => p.set("executionPosture", e.target.value)}
          />
        )}
      </FieldShell>

      <FieldShell {...f("preferredView", "Diagram view")}>
        {p.readOnly ? (
          <ReadValue value={v.preferredView} />
        ) : (
          <AdminSelect
            value={v.preferredView ?? "front"}
            onChange={(e) => p.set("preferredView", e.target.value as AnatomyView)}
          >
            <option value="front">Front</option>
            <option value="side">Side</option>
            <option value="back">Back</option>
          </AdminSelect>
        )}
      </FieldShell>

      <FieldShell
        {...f("clinicalNote", "Clinical note", "One sentence. It is the line under the name on the machine's page.")}
      >
        {p.readOnly ? (
          <ReadValue value={v.clinicalNote} />
        ) : (
          <AdminTextarea
            rows={2}
            value={v.clinicalNote ?? ""}
            onChange={(e) => p.set("clinicalNote", e.target.value)}
          />
        )}
      </FieldShell>

      <FieldShell
        {...f("imageUrl", "Photo of this unit", "A picture of the machine in your room, not the brochure.")}
      >
        {p.readOnly ? (
          <ReadValue value={v.imageUrl} />
        ) : (
          <AdminInput
            value={v.imageUrl ?? ""}
            placeholder="https://…"
            onChange={(e) => p.set("imageUrl", e.target.value)}
          />
        )}
      </FieldShell>
    </div>
  );
}

// ── 2. Musculature ───────────────────────────────────────────────────

function Musculature(p: SectionProps) {
  const f = useFieldProps(p);
  const v = p.value;
  const m = v.musculature ?? { primary: [], secondary: [], synergists: [] };
  const setM = (patch: Partial<typeof m>) => p.set("musculature", { ...m, ...patch });

  return (
    <div className="adm-me__fields">
      <FieldShell
        {...f("primaryMuscles", "Primary — what the diagram lights up")}
      >
        <MuscleChips
          selected={v.primaryMuscles ?? []}
          onChange={(next) => p.set("primaryMuscles", next)}
          readOnly={p.readOnly}
        />
      </FieldShell>

      <FieldShell {...f("secondaryMuscles", "Secondary — lit at lower intensity")}>
        <MuscleChips
          selected={v.secondaryMuscles ?? []}
          onChange={(next) => p.set("secondaryMuscles", next)}
          readOnly={p.readOnly}
        />
      </FieldShell>

      <FieldShell
        {...f(
          "musculature",
          "Primary muscles, in words",
          "The precise anatomy a coach reads. The diagram cannot show “Gluteus Medius (hip horizontal abduction)”; this can.",
        )}
      >
        <StringList
          items={m.primary ?? []}
          onChange={(next) => setM({ primary: next })}
          placeholder="Quadriceps (knee extension)"
          readOnly={p.readOnly}
        />
      </FieldShell>

      <FieldShell label="Synergists and stabilisers" locked={p.readOnly}>
        <StringList
          items={m.synergists ?? []}
          onChange={(next) => setM({ synergists: next })}
          placeholder="Erector Spinae (spinal stabilisers)"
          readOnly={p.readOnly}
        />
      </FieldShell>
    </div>
  );
}

// ── 3. Universal baseline ────────────────────────────────────────────

const BASELINE_FIELDS: {
  key: keyof MachineDefinition["universalBaseline"];
  label: string;
  hint?: string;
}[] = [
  { key: "seatHeightPosition", label: "Seat height and position" },
  { key: "padAxisAlignment", label: "Pad depth and axis alignment", hint: "How the client's joint lines up with the machine's pivot." },
  { key: "restraintsAnchoring", label: "Restraints and anchoring", hint: "Belts, lap pads, foot stools, shoulder pads." },
  { key: "gripHandPosition", label: "Grip and hand position", hint: "Leave empty on a machine with no handles." },
  { key: "startingWeightStackGap", label: "Starting weight stack gap", hint: "As the evaluator writes it: “2”, “1 or 2”, “None (Gap 0)”." },
];

function Baseline(p: SectionProps) {
  const b = p.value.universalBaseline ?? ({} as MachineDefinition["universalBaseline"]);
  const std = p.standard?.universalBaseline;
  return (
    <div className="adm-me__fields">
      <p className="adm-me__blurb">
        The absolute starting point for an average-proportioned new client —
        roughly 5&apos;9&quot; male, 5&apos;4&quot; female.
      </p>
      {BASELINE_FIELDS.map((fd) => {
        // Per LINE, not per object: the baseline merges key by key, so one
        // corrected seat position must not read as "you changed the baseline".
        const changed = !!std && (b[fd.key] ?? "") !== (std[fd.key] ?? "");
        return (
          <FieldShell
            key={fd.key}
            label={fd.label}
            hint={fd.hint}
            locked={p.readOnly}
            changed={changed}
            onRevert={
              std
                ? () =>
                    p.set("universalBaseline", { ...b, [fd.key]: std[fd.key] ?? "" })
                : undefined
            }
          >
            {p.readOnly ? (
              <ReadValue value={b[fd.key]} />
            ) : (
              <AdminTextarea
                rows={3}
                value={b[fd.key] ?? ""}
                onChange={(e) =>
                  p.set("universalBaseline", { ...b, [fd.key]: e.target.value })
                }
              />
            )}
          </FieldShell>
        );
      })}
    </div>
  );
}

// ── 4. Body-type adjustments ─────────────────────────────────────────

const COLUMNS: {
  key: keyof MachineDefinition["bodyTypeAdjustments"];
  title: string;
  fields: { key: string; label: string }[];
}[] = [
  {
    key: "shorterStature",
    title: "Shorter stature, short limbs",
    fields: [
      { key: "seatAdjustment", label: "Seat" },
      { key: "padHandlePlacement", label: "Pads and handles" },
      { key: "specialNotes", label: "Anything else" },
    ],
  },
  {
    key: "tallerStature",
    title: "Taller stature, long limbs",
    fields: [
      { key: "seatAdjustment", label: "Seat" },
      { key: "padHandlePlacement", label: "Pads and handles" },
      { key: "specialNotes", label: "Anything else" },
    ],
  },
  {
    key: "limitedMobility",
    title: "Limited mobility, joint constraints",
    fields: [
      { key: "romRestrictions", label: "Shortening the range" },
      { key: "alternativeProtocols", label: "Static hold or TSC instead" },
      { key: "specialNotes", label: "Anything else" },
    ],
  },
];

function BodyTypes(p: SectionProps) {
  const b = p.value.bodyTypeAdjustments ?? ({} as MachineDefinition["bodyTypeAdjustments"]);
  return (
    <div className="adm-me__cols">
      {COLUMNS.map((col) => {
        const cur = (b[col.key] ?? {}) as Record<string, string>;
        return (
          <div key={col.key} className="adm-me__col">
            <h4 className="adm-me__coltitle">{col.title}</h4>
            {col.fields.map((fd) => (
              <FieldShell key={fd.key} label={fd.label} locked={p.readOnly}>
                {p.readOnly ? (
                  <ReadValue value={cur[fd.key]} />
                ) : (
                  <AdminTextarea
                    rows={3}
                    value={cur[fd.key] ?? ""}
                    onChange={(e) =>
                      p.set("bodyTypeAdjustments", {
                        ...b,
                        [col.key]: { ...cur, [fd.key]: e.target.value },
                      })
                    }
                  />
                )}
              </FieldShell>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── 5. Alignment checkpoints ─────────────────────────────────────────

function CheckpointSection(p: SectionProps) {
  // Additive: the company's checkpoints are shown and kept, and a studio adds
  // below them. resolve-machine unions on title, so this is what will happen
  // whether or not the form says so.
  const inherited = p.standard?.alignmentCheckpoints ?? [];
  const mine = (p.value.alignmentCheckpoints ?? []).filter(
    (c) => !inherited.some((i) => i.title.trim().toLowerCase() === c.title.trim().toLowerCase()),
  );
  return (
    <div className="adm-me__fields">
      <p className="adm-me__blurb">
        One or two. More than that and none of them get checked.
      </p>
      <Checkpoints
        items={p.standard ? mine : (p.value.alignmentCheckpoints ?? [])}
        inherited={p.standard ? inherited : []}
        onChange={(next) =>
          p.set("alignmentCheckpoints", p.standard ? [...inherited, ...next] : next)
        }
        readOnly={p.readOnly}
      />
    </div>
  );
}

// ── 6. Execution and cadence ─────────────────────────────────────────

function Execution(p: SectionProps) {
  const e = p.value.execution ?? ({} as MachineDefinition["execution"]);
  const set = (patch: Partial<MachineDefinition["execution"]>) =>
    p.set("execution", { ...e, ...patch });

  return (
    <div className="adm-me__fields">
      <FieldShell
        label="Does this machine need a handoff?"
        hint="True when leverage is poorest at the start, so the coach places the client and transfers the load."
        locked={p.readOnly}
      >
        {p.readOnly ? (
          <ReadValue value={e.requiresHandoff ? "Yes" : "No"} />
        ) : (
          <AdminSelect
            value={e.requiresHandoff ? "yes" : "no"}
            onChange={(ev) => set({ requiresHandoff: ev.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </AdminSelect>
        )}
      </FieldShell>

      {e.requiresHandoff && (
        <>
          <FieldShell label="How the handoff is performed" locked={p.readOnly}>
            {p.readOnly ? (
              <ReadValue value={e.handoffProtocol} />
            ) : (
              <AdminTextarea
                rows={3}
                value={e.handoffProtocol ?? ""}
                onChange={(ev) => set({ handoffProtocol: ev.target.value })}
              />
            )}
          </FieldShell>
          <FieldShell label="The transfer cue" locked={p.readOnly}>
            {p.readOnly ? (
              <ReadValue value={e.handoffCue} />
            ) : (
              <AdminInput
                value={e.handoffCue ?? ""}
                placeholder="That is yours"
                onChange={(ev) => set({ handoffCue: ev.target.value })}
              />
            )}
          </FieldShell>
        </>
      )}

      <FieldShell
        label="The load-up"
        hint="Cracking the stack — the patient 3–5 second pressure build."
        locked={p.readOnly}
      >
        {p.readOnly ? (
          <ReadValue value={e.loadUpProtocol} />
        ) : (
          <AdminTextarea
            rows={3}
            value={e.loadUpProtocol ?? ""}
            onChange={(ev) => set({ loadUpProtocol: ev.target.value })}
          />
        )}
      </FieldShell>

      <div className="adm-grid">
        <FieldShell label="Concentric seconds" locked={p.readOnly}>
          {p.readOnly ? (
            <ReadValue value={String(e.concentricSeconds ?? "")} />
          ) : (
            <AdminInput
              type="number"
              min={1}
              max={30}
              value={e.concentricSeconds ?? 6}
              onChange={(ev) => set({ concentricSeconds: Number(ev.target.value) })}
            />
          )}
        </FieldShell>
        <FieldShell label="Eccentric seconds" locked={p.readOnly}>
          {p.readOnly ? (
            <ReadValue value={String(e.eccentricSeconds ?? "")} />
          ) : (
            <AdminInput
              type="number"
              min={1}
              max={30}
              value={e.eccentricSeconds ?? 6}
              onChange={(ev) => set({ eccentricSeconds: Number(ev.target.value) })}
            />
          )}
        </FieldShell>
      </div>

      <FieldShell label="Upper turnaround" locked={p.readOnly}>
        <Turnaround
          value={e.upperTurnaround ?? { style: "touch-and-go", description: "" }}
          onChange={(next) => set({ upperTurnaround: next })}
          readOnly={p.readOnly}
        />
      </FieldShell>

      <FieldShell label="Lower turnaround" locked={p.readOnly}>
        <Turnaround
          value={e.lowerTurnaround ?? { style: "touch-and-go", description: "" }}
          onChange={(next) => set({ lowerTurnaround: next })}
          readOnly={p.readOnly}
        />
      </FieldShell>

      <FieldShell label="Key cues" hint="Two or three. The words a coach actually says." locked={p.readOnly}>
        <StringList
          items={e.keyCues ?? []}
          onChange={(next) => set({ keyCues: next })}
          placeholder="Chin down"
          readOnly={p.readOnly}
        />
      </FieldShell>

      <FieldShell
        label="Never train this to failure"
        hint="Structured, not buried in prose, so the session screen can enforce it."
        locked={p.readOnly}
      >
        {p.readOnly ? (
          <ReadValue value={e.neverToFailure ? "Yes — never to failure" : "No"} />
        ) : (
          <AdminSelect
            value={e.neverToFailure ? "yes" : "no"}
            onChange={(ev) => set({ neverToFailure: ev.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes — never to failure</option>
          </AdminSelect>
        )}
      </FieldShell>

      {e.neverToFailure && (
        <FieldShell label="Why — shown prominently on the floor" locked={p.readOnly}>
          {p.readOnly ? (
            <ReadValue value={e.safetyNotice} />
          ) : (
            <AdminTextarea
              rows={2}
              value={e.safetyNotice ?? ""}
              onChange={(ev) => set({ safetyNotice: ev.target.value })}
            />
          )}
        </FieldShell>
      )}
    </div>
  );
}

// ── 7. Safety ────────────────────────────────────────────────────────

function Safety(p: SectionProps) {
  const v = p.value;
  const std = p.standard;
  // Additive, all three. A studio adds a warning about its own floor; the
  // company's "use extremely light loads" never goes away.
  const own = (mine: string[] = [], inherited: string[] = []) =>
    std ? mine.filter((x) => !inherited.includes(x)) : mine;

  return (
    <div className="adm-me__fields">
      <FieldShell label="Clinical warnings" locked={p.readOnly}>
        <StringList
          items={own(v.clinicalWarnings, std?.clinicalWarnings)}
          inherited={std?.clinicalWarnings ?? []}
          onChange={(next) =>
            p.set("clinicalWarnings", std ? [...(std.clinicalWarnings ?? []), ...next] : next)
          }
          placeholder="Stop immediately if any cervical pain is felt"
          readOnly={p.readOnly}
        />
      </FieldShell>

      <FieldShell label="Who must not use this machine" locked={p.readOnly}>
        <StringList
          items={own(v.contraindicatedFor, std?.contraindicatedFor)}
          inherited={std?.contraindicatedFor ?? []}
          onChange={(next) =>
            p.set(
              "contraindicatedFor",
              std ? [...(std.contraindicatedFor ?? []), ...next] : next,
            )
          }
          placeholder="Acute knee effusion"
          readOnly={p.readOnly}
        />
      </FieldShell>

      <FieldShell
        label="Sequencing"
        hint="What must not be paired with it in the same workout."
        locked={p.readOnly}
      >
        <StringList
          items={own(v.sequencingContraindications, std?.sequencingContraindications)}
          inherited={std?.sequencingContraindications ?? []}
          onChange={(next) =>
            p.set(
              "sequencingContraindications",
              std ? [...(std.sequencingContraindications ?? []), ...next] : next,
            )
          }
          placeholder="Do not follow directly with Lumbar Extension"
          readOnly={p.readOnly}
        />
      </FieldShell>

      <FieldShell label="Biomechanics notes" locked={p.readOnly}>
        {p.readOnly ? (
          <ReadValue value={v.biomechanicalNotes} />
        ) : (
          <AdminTextarea
            rows={4}
            value={v.biomechanicalNotes ?? ""}
            onChange={(e) => p.set("biomechanicalNotes", e.target.value)}
          />
        )}
      </FieldShell>
    </div>
  );
}

// ── 8. The dials ─────────────────────────────────────────────────────

function Dials(p: SectionProps) {
  const v = p.value;
  return (
    <div className="adm-me__fields">
      <p className="adm-me__blurb">
        Every adjustment on this unit. The grey code beside each one is its
        permanent name in every client&apos;s saved settings — the label above it
        is yours to change, that code is not.
      </p>
      <SettingFields
        fields={v.settingFields ?? []}
        defaults={v.defaultSettings ?? {}}
        onChangeFields={(next) => p.set("settingFields", next)}
        onChangeDefaults={(next) => p.set("defaultSettings", next)}
        readOnly={p.readOnly}
      />
      <div className="adm-grid">
        <FieldShell
          label="Starting weight — male"
          hint="Where an average new client begins on this stack."
          locked={p.readOnly}
          changed={p.standard ? p.changed("baselineLoad") : false}
          onRevert={p.standard ? () => p.revert("baselineLoad") : undefined}
        >
          {p.readOnly ? (
            <ReadValue value={v.baselineLoad?.male ? String(v.baselineLoad.male) : ""} />
          ) : (
            <AdminInput
              type="number"
              min={0}
              value={v.baselineLoad?.male ?? ""}
              onChange={(e) =>
                p.set("baselineLoad", {
                  ...v.baselineLoad,
                  male: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          )}
        </FieldShell>
        <FieldShell label="Starting weight — female" locked={p.readOnly}>
          {p.readOnly ? (
            <ReadValue value={v.baselineLoad?.female ? String(v.baselineLoad.female) : ""} />
          ) : (
            <AdminInput
              type="number"
              min={0}
              value={v.baselineLoad?.female ?? ""}
              onChange={(e) =>
                p.set("baselineLoad", {
                  ...v.baselineLoad,
                  female: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          )}
        </FieldShell>
      </div>
    </div>
  );
}

export const SECTION_BODIES: Record<SectionId, (p: SectionProps) => React.ReactElement> = {
  identity: Identity,
  musculature: Musculature,
  baseline: Baseline,
  bodytype: BodyTypes,
  checkpoints: CheckpointSection,
  execution: Execution,
  safety: Safety,
  dials: Dials,
};
