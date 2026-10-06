import React from "react";
import { AdminInput, AdminSelect } from "../../primitives";
import type {
  CodexAbnormal,
  CodexFault,
  CodexMomentLine,
  CodexStopRule,
  CodexSwitches,
  CodexWatchOut,
  LineSource,
  MachineDefinition,
} from "../../../../types/machines";
import { CODEX_MOMENT_ORDER } from "../../../../types/machines";
import {
  CODEX_LEAVES,
  coverageSentence,
  lineKey,
  methodLines,
  momentLabel,
  sourceCoverage,
  type LeafId,
} from "../../../machine-codex/format";
import { FieldShell } from "./controls";
import { LeafField, LeafLine, RecordList, cleanList, withLine, type RecordField } from "./codex-controls";
import type { SectionProps } from "./sections";
import type { EditScope } from "../../../../lib/machine-template";
import type { ModelWithId } from "../../../machine-codex/models";
import { ModelPicker } from "../models/ModelPicker";
import { InheritedSafety } from "./safety-removal";
import { splitSafety } from "./safety-edit";
import "../../admin.css";
import "./codex-editor.css";

/**
 * THE CODEX SECTIONS — the format v2 fields in the editor (Codex R2, Sep 28
 * 2026).
 *
 * Four sections after the eight, each OPTIONAL: nothing here is a gap, so
 * the completeness meter, the catalog list's "still missing" line and the
 * catalog gate's blocking list (features/admin/catalog/review.ts, held by
 * review.test.ts to what the twenty clear) read exactly as they did. What a
 * machine says in them reaches the Codex page (features/machine-codex).
 *
 * Every field is prose in the read view and inputs in the edit view, from
 * one source, like the eight. Who may write each field is the template
 * boundary's answer (`canWrite`), asked per field because one section holds
 * both the studio's hardware (a dial's letter) and the method (its rule).
 */

export interface CodexSectionProps extends SectionProps {
  /** May this scope write this field? lib/machine-template.ts's canEdit. */
  canWrite: (key: keyof MachineDefinition) => boolean;
  /** Who is editing: the standard (catalog), or a studio's machine. */
  scope?: EditScope;
  /** The MSF movement this machine is, for its models. */
  movementId?: string;
  /** Every model record; absent, the model picker is not shown. */
  models?: ModelWithId[];
}

export type CodexSectionId = "codex-machine" | "codex-set" | "codex-study" | "codex-sources";

export interface CodexSectionSpec {
  id: CodexSectionId;
  title: string;
  blurb: string;
  fields: (keyof MachineDefinition)[];
  Body: (p: CodexSectionProps) => React.ReactElement;
}

/** Says anything at all. */
function hasAny(v: unknown): boolean {
  return contentCount(v) > 0;
}

/**
 * Lines of content: a string, a number or a yes is one; a list counts the
 * records that say anything (a record is one line however many parts it
 * has); an object counts its lines.
 */
function contentCount(v: unknown): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "string") return v.trim() ? 1 : 0;
  if (typeof v === "number") return Number.isFinite(v) ? 1 : 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return v.reduce<number>((n, x) => n + (hasAny(x) ? 1 : 0), 0);
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>).reduce<number>((n, x) => n + contentCount(x), 0);
  }
  return 0;
}

/** How many v2 lines a section holds, for its badge ("4 lines written"). */
export function codexLinesIn(def: MachineDefinition, fields: (keyof MachineDefinition)[]): number {
  return fields.reduce((n, f) => n + contentCount((def as unknown as Record<string, unknown>)[f]), 0);
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Per-line props for a line of an object leaf: its lock and its "changed here". */
function useLine(p: CodexSectionProps) {
  return <K extends keyof MachineDefinition>(
    leaf: K,
    key: string,
    label: string,
    hint?: string,
  ) => {
    const cur = ((p.value[leaf] as Record<string, unknown> | undefined) ?? {})[key];
    const std = p.standard
      ? ((p.standard[leaf] as Record<string, unknown> | undefined) ?? {})[key]
      : undefined;
    const locked = p.readOnly || !p.canWrite(leaf);
    const changed = !!p.standard && String(cur ?? "") !== String(std ?? "");
    return {
      shell: {
        label,
        hint,
        locked,
        changed,
        onRevert: p.standard
          ? () => p.set(leaf, withLine(p.value[leaf] as object | undefined, key as never, std) as never)
          : undefined,
      },
      value: typeof cur === "string" ? cur : "",
      readOnly: locked,
      onChange: (next: string) =>
        p.set(leaf, withLine(p.value[leaf] as object | undefined, key as never, next) as never),
    };
  };
}

/**
 * A safety list on a copy: Max Strength's entries this unit keeps (drawn by
 * InheritedSafety, where one comes off only with a reason), and the studio's
 * own below them. On the standard or a studio's own machine: the plain list.
 */
function additive<T extends object>(
  p: CodexSectionProps,
  field: "stopRules" | "watchOuts",
): { kept: T[]; own: T[]; write: (next: T[]) => void } {
  const mine = ((p.value[field] as unknown as T[] | undefined) ?? []);
  if (!p.standard) return { kept: [], own: mine, write: (next) => p.set(field, next as never) };
  const { inherited, own } = splitSafety(field, mine, p.standard[field] as unknown[] | undefined);
  return {
    kept: inherited as T[],
    own: own as T[],
    write: (next) => p.set(field, [...(inherited as T[]), ...next] as never),
  };
}

/** Max Strength's entries of one list, on a copy, with Take off / Put it back. */
function CatalogSafety({
  p,
  field,
  describe,
}: {
  p: CodexSectionProps;
  field: "stopRules" | "watchOuts";
  describe: (e: unknown) => string;
}) {
  if (!p.standard) return null;
  return (
    <InheritedSafety
      field={field}
      value={p.value}
      standard={p.standard}
      describe={describe}
      readOnly={p.readOnly || !p.canWrite(field)}
      actor={p.actor}
      onChange={(list, records) => {
        p.set(field, list as never);
        p.set("removedSafety", (records.length ? records : undefined) as never);
      }}
    />
  );
}

// ── 1. At the machine ────────────────────────────────────────────────

const STOP_FIELDS: RecordField<CodexStopRule>[] = [
  { key: "text", label: "The rule", kind: "textarea", placeholder: "The knees never lock out at the end stop." },
  { key: "why", label: "Why", kind: "textarea", placeholder: "An unexplained prohibition gets ignored." },
];

const WATCH_FIELDS: RecordField<CodexWatchOut>[] = [
  { key: "condition", label: "Condition", kind: "input", placeholder: "Sensitive lower back" },
  { key: "action", label: "What to do", kind: "textarea", placeholder: "A bigger gap, P3, and keep it away from the Lumbar." },
];

const LOWER_TURN_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Not recorded" },
  { value: "stackTouch", label: "The plates barely touch" },
  { value: "jointLimited", label: "Where the joint stops" },
  { value: "flexLimited", label: "Where flexibility stops" },
];

function AtTheMachine(p: CodexSectionProps) {
  const line = useLine(p);
  const stop = additive<CodexStopRule>(p, "stopRules");
  const watch = additive<CodexWatchOut>(p, "watchOuts");
  const sw: CodexSwitches = p.value.switches ?? {};
  const swLocked = p.readOnly || !p.canWrite("switches");
  const setSwitch = (key: keyof CodexSwitches, v: unknown) =>
    p.set("switches", withLine(p.value.switches, key, v) as never);
  const fields = p.value.settingFields ?? [];
  const dialsLocked = p.readOnly || !p.canWrite("settingFields");
  const rulesLocked = p.readOnly || !p.canWrite("dialRules");

  const setDial = (i: number, patch: Record<string, unknown>) => {
    const next = [...fields];
    const merged: Record<string, unknown> = { ...next[i], ...patch };
    for (const k of Object.keys(patch)) if (merged[k] === undefined || merged[k] === "") delete merged[k];
    next[i] = merged as never;
    p.set("settingFields", next);
  };
  const setRule = (key: string, part: "rule" | "firstSetup", v: string) => {
    const all = { ...(p.value.dialRules ?? {}) };
    const nextRule = withLine(all[key], part, v);
    if (nextRule && nextRule.rule === undefined && nextRule.firstSetup === undefined) delete all[key];
    else if (nextRule) all[key] = nextRule as never;
    else delete all[key];
    p.set("dialRules", (Object.keys(all).length ? all : undefined) as never);
  };

  const e = line("setUp", "entry", "Entry", "Getting in, and the stool if there is one.");
  const pre = line("setUp", "preload", "Preload", "Usually a fact about the model: “20 lb main + 18 lb accessory = 38 lb”.");
  const start = line(
    "setUp",
    "startingLoadRule",
    "Choosing a first load",
    "The rule, never a house number: Max Strength has no house starting weight (AJ, Sep 27 2026).",
  );
  const axis = line("getSet", "axisLandmark", "The axis", "Which joint lines up with the pivot.");
  const breath = line("getSet", "breathing", "Breathing");
  const script = line("begin", "script", "The words", "As the spoken script has them.");
  const delay = line("begin", "delayHandoffWhen", "When to delay the handoff");

  const modelLocked = p.readOnly || !p.canWrite("modelId");

  return (
    <div className="adm-me__fields">
      <p className="adm-me__blurb">
        What the Codex page opens on at the machine: the stop rules, the switches, each dial&apos;s
        rule and number, and how the set begins. Optional — a machine is not incomplete without it.
      </p>

      {p.models && (
        <FieldShell
          label={p.scope === "catalog" ? "The reference model" : "Which model this unit is"}
          hint={
            p.scope === "catalog"
              ? "The unit the standard's numbers were written on, if there is one. A studio's copy names its own unit's model."
              : "Settings are compared with other units of the same model. Models are recorded by head office, from the catalog."
          }
          locked={modelLocked}
        >
          <ModelPicker
            models={p.models}
            movementId={p.movementId}
            value={p.value.modelId}
            readOnly={modelLocked}
            onChange={(next) => p.set("modelId", next as never)}
          />
        </FieldShell>
      )}

      <FieldShell
        label="Stop rules"
        hint="Only the true stop rules. Coaching tips belong in the rep or in faults."
        locked={p.readOnly || !p.canWrite("stopRules")}
        changed={p.standard ? p.changed("stopRules") : false}
      >
        <div className="adm-me__stack">
          <CatalogSafety
            p={p}
            field="stopRules"
            describe={(e) => {
              const r = e as CodexStopRule;
              return r.why ? `${r.text} ${r.why}` : r.text;
            }}
          />
          <RecordList
            items={stop.own}
            fields={STOP_FIELDS}
            onChange={stop.write}
            readOnly={p.readOnly || !p.canWrite("stopRules")}
            addLabel="Add a stop rule"
            empty={stop.kept.length ? "Nothing of your own added" : "Not written yet"}
          />
        </div>
      </FieldShell>

      <FieldShell
        label="Watch-outs"
        hint="A condition and what to do about it here — not a blanket “contraindicated”."
        locked={p.readOnly || !p.canWrite("watchOuts")}
        changed={p.standard ? p.changed("watchOuts") : false}
      >
        <div className="adm-me__stack">
          <CatalogSafety
            p={p}
            field="watchOuts"
            describe={(e) => {
              const w = e as CodexWatchOut;
              return `${w.condition}: ${w.action}`;
            }}
          />
          <RecordList
            items={watch.own}
            fields={WATCH_FIELDS}
            onChange={watch.write}
            readOnly={p.readOnly || !p.canWrite("watchOuts")}
            addLabel="Add a watch-out"
            empty={watch.kept.length ? "Nothing of your own added" : "Not written yet"}
          />
        </div>
      </FieldShell>

      <FieldShell
        label="Switches"
        hint="The handoff, the upper turnaround and never-to-failure are set under Execution and cadence."
        locked={swLocked}
        changed={p.standard ? p.changed("switches") : false}
        onRevert={p.standard ? () => p.revert("switches") : undefined}
      >
        {swLocked ? (
          <ul className="adm-me__list">
            <li className="adm-me__listitem">
              Lower turn: {LOWER_TURN_OPTIONS.find((o) => o.value === (sw.lowerTurn ?? ""))?.label}
            </li>
            <li className="adm-me__listitem">Rep cap early on: {sw.repCap ? String(sw.repCap) : "none"}</li>
            <li className="adm-me__listitem">Can be pinned for a TSC: {sw.tscCapable ? "yes" : "not recorded"}</li>
            <li className="adm-me__listitem">
              The trainer takes the weight back: {sw.unloadTransfer ? "yes" : "not recorded"}
            </li>
          </ul>
        ) : (
          <div className="adm-grid">
            <div className="adm-field">
              <span className="adm-label">What limits the lower turn</span>
              <AdminSelect value={sw.lowerTurn ?? ""} onChange={(ev) => setSwitch("lowerTurn", ev.target.value || undefined)}>
                {LOWER_TURN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div className="adm-field">
              <span className="adm-label">Rep cap early on</span>
              <AdminInput
                type="number"
                min={1}
                max={30}
                value={sw.repCap ?? ""}
                placeholder="None"
                onChange={(ev) => setSwitch("repCap", ev.target.value ? Number(ev.target.value) : undefined)}
              />
            </div>
            <div className="adm-field">
              <span className="adm-label">Can be pinned for a timed static contraction</span>
              <AdminSelect value={sw.tscCapable ? "yes" : ""} onChange={(ev) => setSwitch("tscCapable", ev.target.value === "yes" ? true : undefined)}>
                <option value="">Not recorded</option>
                <option value="yes">Yes</option>
              </AdminSelect>
            </div>
            <div className="adm-field">
              <span className="adm-label">The trainer takes the weight back at the end</span>
              <AdminSelect
                value={sw.unloadTransfer ? "yes" : ""}
                onChange={(ev) => setSwitch("unloadTransfer", ev.target.value === "yes" ? true : undefined)}
              >
                <option value="">Not recorded</option>
                <option value="yes">Yes</option>
              </AdminSelect>
            </div>
          </div>
        )}
      </FieldShell>

      <FieldShell {...e.shell}>
        <LeafLine value={e.value} onChange={e.onChange} readOnly={e.readOnly} />
      </FieldShell>

      <div className="adm-me__stack">
        <span className="adm-label">The dials: rule and number</span>
        <p className="adm-hint">
          Each dial&apos;s RULE is the body landmark it is set against — the method. Its letter and
          its callout on the drawing belong to the unit, and its number is where the rule lands on
          this unit (set under The dials).
        </p>
        {fields.length === 0 ? (
          <p className="adm-me__empty">No dials recorded for this unit</p>
        ) : (
          fields.map((f, i) => {
            const rule = p.value.dialRules?.[f.key];
            const number = p.value.defaultSettings?.[f.key];
            return (
              <div key={f.key} className="adm-me__card">
                <div className="adm-me__dialhead">
                  <span className="adm-me__checktitle">
                    {f.callout ?? i + 1}. {f.label}
                  </span>
                  <span className="adm-hint">This unit: {number ? number : "no number set"}</span>
                </div>
                {dialsLocked ? (
                  <p className="adm-me__prose">
                    Letter: {f.letter || "not recorded"} · Callout: {f.callout ?? i + 1}
                  </p>
                ) : (
                  <div className="adm-grid">
                    <div className="adm-field">
                      <span className="adm-label">Letter on the preset</span>
                      <AdminInput
                        value={f.letter ?? ""}
                        placeholder="G, P, SP"
                        maxLength={4}
                        onChange={(ev) => setDial(i, { letter: ev.target.value.trim() || undefined })}
                      />
                    </div>
                    <div className="adm-field">
                      <span className="adm-label">Number on the drawing</span>
                      <AdminInput
                        type="number"
                        min={1}
                        max={40}
                        value={f.callout ?? ""}
                        placeholder={String(i + 1)}
                        onChange={(ev) => setDial(i, { callout: ev.target.value ? Number(ev.target.value) : undefined })}
                      />
                    </div>
                  </div>
                )}
                <LeafField label="The rule it is set against">
                  <LeafLine
                    value={rule?.rule}
                    readOnly={rulesLocked}
                    placeholder="The footplate meets the end stop just before the knees straighten."
                    onChange={(v) => setRule(f.key, "rule", v)}
                  />
                </LeafField>
                <LeafField label="First set-up only">
                  <LeafLine
                    value={rule?.firstSetup}
                    readOnly={rulesLocked}
                    rows={1}
                    placeholder="A couple of settings closer, for pad squash under load."
                    onChange={(v) => setRule(f.key, "firstSetup", v)}
                  />
                </LeafField>
              </div>
            );
          })
        )}
      </div>

      <FieldShell {...pre.shell}>
        <LeafLine value={pre.value} onChange={pre.onChange} readOnly={pre.readOnly} />
      </FieldShell>
      <FieldShell {...start.shell}>
        <LeafLine value={start.value} onChange={start.onChange} readOnly={start.readOnly} />
      </FieldShell>
      <FieldShell {...axis.shell}>
        <LeafLine value={axis.value} onChange={axis.onChange} readOnly={axis.readOnly} rows={1} />
      </FieldShell>
      <FieldShell {...breath.shell}>
        <LeafLine value={breath.value} onChange={breath.onChange} readOnly={breath.readOnly} rows={1} />
      </FieldShell>
      <FieldShell {...script.shell}>
        <LeafLine value={script.value} onChange={script.onChange} readOnly={script.readOnly} rows={3} />
      </FieldShell>
      {p.value.execution?.requiresHandoff && (
        <FieldShell {...delay.shell}>
          <LeafLine value={delay.value} onChange={delay.onChange} readOnly={delay.readOnly} />
        </FieldShell>
      )}
    </div>
  );
}

// ── 2. The set and after ─────────────────────────────────────────────

const MOMENT_FIELDS: RecordField<CodexMomentLine>[] = [
  {
    key: "moment",
    label: "Moment",
    kind: "select",
    options: CODEX_MOMENT_ORDER.map((m) => ({ value: m, label: momentLabel(m) })),
  },
  { key: "say", label: "What to say", kind: "textarea", placeholder: "Barely touch, barely start." },
];

const ABNORMAL_FIELDS: RecordField<CodexAbnormal>[] = [
  { key: "title", label: "What happens", kind: "input", placeholder: "Exertion headache (EIH)" },
  { key: "trigger", label: "How you know", kind: "textarea" },
  { key: "steps", label: "What to do", kind: "lines", placeholder: "One step per line" },
  { key: "next", label: "Next time", kind: "textarea" },
  { key: "record", label: "What to record", kind: "input" },
  { key: "stop", label: "It ends the set", kind: "yesno" },
];

function TheSet(p: CodexSectionProps) {
  const line = useLine(p);
  const lines = [
    line("rep", "path", "The path", "What must stay the same both ways."),
    line("rep", "click", "When to click"),
    line("rep", "firstEccentricCue", "The first eccentric", "It always gets a cue."),
  ];
  const finish = [
    line("finish", "failure", "What failure means here", "And any rep cap, in words."),
    line("finish", "finalDescent", "The final descent"),
    line("finish", "unloadTransfer", "The unloading transfer", "Where the trainer takes the weight back (“that is… mine”)."),
    line("finish", "exit", "Exit"),
    line("finish", "record", "What to record"),
  ];
  const repLocked = p.readOnly || !p.canWrite("rep");
  const moments = p.value.rep?.moments ?? [];

  return (
    <div className="adm-me__fields">
      <p className="adm-me__blurb">
        The rep as a timeline, the finish, and the abnormal procedures — kept apart from the normal
        set, the way a pilot&apos;s quick reference keeps them. Cadence and both turnarounds stay under
        Execution and cadence.
      </p>
      {lines.map((l) => (
        <FieldShell key={l.shell.label} {...l.shell}>
          <LeafLine value={l.value} onChange={l.onChange} readOnly={l.readOnly} />
        </FieldShell>
      ))}
      <FieldShell label="Cues by moment" hint="The phrasebook's lines for this machine, each on its moment." locked={repLocked}>
        <RecordList
          items={moments}
          fields={MOMENT_FIELDS}
          readOnly={repLocked}
          addLabel="Add a cue"
          onChange={(next) =>
            p.set(
              "rep",
              withLine(p.value.rep, "moments", next.map((m) => ({ moment: m.moment ?? "up", say: m.say ?? "" }))) as never,
            )
          }
        />
      </FieldShell>
      {finish.map((l) => (
        <FieldShell key={l.shell.label} {...l.shell}>
          <LeafLine value={l.value} onChange={l.onChange} readOnly={l.readOnly} />
        </FieldShell>
      ))}
      <FieldShell
        label="If something goes wrong"
        locked={p.readOnly || !p.canWrite("ifWrong")}
        changed={p.standard ? p.changed("ifWrong") : false}
        onRevert={p.standard ? () => p.revert("ifWrong") : undefined}
      >
        <RecordList
          items={p.value.ifWrong ?? []}
          fields={ABNORMAL_FIELDS}
          readOnly={p.readOnly || !p.canWrite("ifWrong")}
          addLabel="Add what to do if something goes wrong"
          onChange={(next) => p.set("ifWrong", next)}
        />
      </FieldShell>
    </div>
  );
}

// ── 3. Study ─────────────────────────────────────────────────────────

const FAULT_FIELDS: RecordField<CodexFault>[] = [
  { key: "fault", label: "The fault", kind: "input", placeholder: "Firing out of the bottom" },
  { key: "see", label: "What you see", kind: "textarea" },
  { key: "say", label: "What to say", kind: "input", placeholder: "Crawl out of the bottom" },
  { key: "change", label: "What to change", kind: "textarea" },
];

function Study(p: CodexSectionProps) {
  const line = useLine(p);
  const adapt = [
    line("adapt", "tsc", "Timed static contraction", "Where the arm sits, and the protocol."),
    line("adapt", "staticHold", "Static hold"),
    line("adapt", "bias", "What biases it"),
  ];
  const program = [
    line("program", "pairings", "Pairings"),
    line("program", "substitutes", "Substitutes"),
    line("program", "category", "Where it sits", "Its family, and what it counts for."),
  ];
  const understand = [
    line("understand", "jointActions", "Joint actions"),
    line("understand", "why", "Why the rules are what they are"),
    line("understand", "character", "The machine's character", "Cam feel, direct resistance — usually a fact about the model."),
  ];
  const academyLocked = p.readOnly || !p.canWrite("understand");
  const academy = p.value.understand?.academy ?? [];

  return (
    <div className="adm-me__fields">
      <p className="adm-me__blurb">
        What a trainer reads between clients. The body-type columns stay under Body-type
        adjustments, and sequencing under Safety.
      </p>
      {adapt.map((l) => (
        <FieldShell key={l.shell.label} {...l.shell}>
          <LeafLine value={l.value} onChange={l.onChange} readOnly={l.readOnly} />
        </FieldShell>
      ))}
      {program.map((l) => (
        <FieldShell key={l.shell.label} {...l.shell}>
          <LeafLine value={l.value} onChange={l.onChange} readOnly={l.readOnly} />
        </FieldShell>
      ))}
      <FieldShell
        label="Faults and fixes"
        locked={p.readOnly || !p.canWrite("faults")}
        changed={p.standard ? p.changed("faults") : false}
        onRevert={p.standard ? () => p.revert("faults") : undefined}
      >
        <RecordList
          items={p.value.faults ?? []}
          fields={FAULT_FIELDS}
          readOnly={p.readOnly || !p.canWrite("faults")}
          addLabel="Add a fault and its fix"
          onChange={(next) => p.set("faults", next)}
        />
      </FieldShell>
      {understand.map((l) => (
        <FieldShell key={l.shell.label} {...l.shell}>
          <LeafLine value={l.value} onChange={l.onChange} readOnly={l.readOnly} />
        </FieldShell>
      ))}
      <FieldShell label="In the Academy" hint="Paths under docs/msf-academy, one per line." locked={academyLocked}>
        {academyLocked ? (
          academy.length ? (
            <ul className="adm-me__list">
              {academy.map((a) => (
                <li key={a} className="adm-me__listitem">
                  {a}
                </li>
              ))}
            </ul>
          ) : (
            <p className="adm-me__empty">Not written yet</p>
          )
        ) : (
          <LeafLine
            value={academy.join("\n")}
            rows={3}
            placeholder="Initial Setups (Comprehensive Overview)/Quick Reference Guides/LP – Quick Reference Guide.txt"
            onChange={(v) =>
              p.set(
                "understand",
                withLine(
                  p.value.understand,
                  "academy",
                  v.split("\n").map((s) => s.trim()).filter(Boolean),
                ) as never,
              )
            }
          />
        )}
      </FieldShell>
    </div>
  );
}

// ── 4. Sources ───────────────────────────────────────────────────────

const KIND_OPTIONS: { value: "" | LineSource["kind"]; label: string }[] = [
  { value: "", label: "Not recorded" },
  { value: "academy", label: "The Academy" },
  { value: "guide", label: "Only the setup guide" },
  { value: "book", label: "A book, paraphrased" },
  { value: "unsourced", label: "No source in the Academy" },
];

const REF_PLACEHOLDER: Record<LineSource["kind"], string> = {
  academy: "…/Quick Reference Guides/LP – Quick Reference Guide.txt",
  guide: "Set Up Machines/standardized-setup-guide-batch1.md",
  book: "The Renaissance of Exercise (Ken Hutchins)",
  unsourced: "What was searched for",
};

function Sources(p: CodexSectionProps) {
  const locked = p.readOnly || !p.canWrite("sources");
  const lines = methodLines(p.value);
  const coverage = sourceCoverage(p.value);
  const byLeaf = new Map<LeafId, typeof lines>();
  for (const l of lines) byLeaf.set(l.leaf, [...(byLeaf.get(l.leaf) ?? []), l]);

  const upsert = (path: string, line: string | undefined, patch: Partial<LineSource> | null) => {
    const key = lineKey(path, line);
    const list = [...(p.value.sources ?? [])];
    const i = list.findIndex((s) => lineKey(s.path, s.line) === key);
    if (patch === null) {
      if (i >= 0) list.splice(i, 1);
    } else {
      const base: LineSource = i >= 0 ? list[i] : { path, ...(line !== undefined ? { line } : {}), kind: "academy" };
      const merged: Record<string, unknown> = { ...base, ...patch };
      for (const k of ["ref", "at", "conflict"]) {
        if (typeof merged[k] === "string" && !(merged[k] as string).trim()) delete merged[k];
      }
      if (i >= 0) list[i] = merged as unknown as LineSource;
      else list.push(merged as unknown as LineSource);
    }
    p.set("sources", (list.length ? list : undefined) as never);
  };

  return (
    <div className="adm-me__fields">
      <p className="adm-me__blurb">
        {coverageSentence(coverage)} Every method line says where it comes from, so a line with no
        source can&apos;t slip in unseen. A book is paraphrased with its reference, never quoted.
      </p>
      {lines.length === 0 && <p className="adm-me__empty">No method lines written yet</p>}
      {CODEX_LEAVES.filter((leaf) => byLeaf.has(leaf.id)).map((leaf) => (
        <div key={leaf.id} className="adm-me__stack">
          <h4 className="adm-me__coltitle">
            {leaf.n}. {leaf.title}
          </h4>
          {(byLeaf.get(leaf.id) ?? []).map((l) => {
            const s = l.source;
            const id = `src-${lineKey(l.path, l.line).replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 60)}`;
            return (
              <div key={lineKey(l.path, l.line)} className="adm-me__card adm-mx__srcline">
                <p className="adm-me__prose">
                  <strong>{l.label}.</strong> {l.text.length > 180 ? `${l.text.slice(0, 177)}…` : l.text}
                </p>
                {locked ? (
                  <p className="adm-hint">
                    {s ? KIND_OPTIONS.find((o) => o.value === s.kind)?.label : "Not recorded"}
                    {s?.ref ? ` · ${s.ref}` : ""}
                    {s?.at ? ` · ${s.at}` : ""}
                    {s?.conflict ? ` · Sources disagree: ${s.conflict}` : ""}
                  </p>
                ) : (
                  <div className="adm-grid">
                    <div className="adm-field">
                      <label className="adm-label" htmlFor={`${id}-kind`}>
                        Where it comes from
                      </label>
                      <AdminSelect
                        id={`${id}-kind`}
                        value={s?.kind ?? ""}
                        onChange={(ev) =>
                          upsert(l.path, l.line, ev.target.value ? { kind: ev.target.value as LineSource["kind"] } : null)
                        }
                      >
                        {KIND_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </AdminSelect>
                    </div>
                    {s && (
                      <>
                        <div className="adm-field">
                          <span className="adm-label">{s.kind === "book" ? "The book" : "The file"}</span>
                          <AdminInput
                            value={s.ref ?? ""}
                            placeholder={REF_PLACEHOLDER[s.kind]}
                            onChange={(ev) => upsert(l.path, l.line, { ref: ev.target.value })}
                          />
                        </div>
                        <div className="adm-field">
                          <span className="adm-label">Where in it</span>
                          <AdminInput
                            value={s.at ?? ""}
                            placeholder="Considerations for Setup"
                            onChange={(ev) => upsert(l.path, l.line, { at: ev.target.value })}
                          />
                        </div>
                        <div className="adm-field">
                          <span className="adm-label">If another source disagrees</span>
                          <AdminInput
                            value={s.conflict ?? ""}
                            placeholder="Academy 6.1 includes it after physical therapy"
                            onChange={(ev) => upsert(l.path, l.line, { conflict: ev.target.value })}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export const CODEX_SECTIONS: readonly CodexSectionSpec[] = [
  {
    id: "codex-machine",
    title: "Codex: at the machine",
    blurb: "Stop rules, switches, each dial's rule and the begin.",
    fields: ["stopRules", "watchOuts", "switches", "setUp", "dialRules", "getSet", "begin"],
    Body: AtTheMachine,
  },
  {
    id: "codex-set",
    title: "Codex: the set and after",
    blurb: "The rep as a timeline, the finish, and if something goes wrong.",
    fields: ["rep", "finish", "ifWrong"],
    Body: TheSet,
  },
  {
    id: "codex-study",
    title: "Codex: study",
    blurb: "Adapt, program it, faults and fixes, understand.",
    fields: ["adapt", "program", "faults", "understand"],
    Body: Study,
  },
  {
    id: "codex-sources",
    title: "Sources",
    blurb: "Where every method line comes from.",
    fields: ["sources"],
    Body: Sources,
  },
];

/**
 * The v2 lists with their blank records dropped, for a write: a row added
 * and never filled is kept on screen while typing and never stored.
 */
export function tidyCodexLists(def: Partial<MachineDefinition>): Partial<MachineDefinition> {
  const out: Partial<MachineDefinition> = { ...def };
  const tidy = <K extends keyof MachineDefinition>(key: K, part: string) => {
    if (!(key in out)) return;
    const v = out[key];
    if (!Array.isArray(v)) return;
    // Emptied stays EMPTY, never undefined: on a copy an empty safety list
    // is how the write gate sees that Max Strength's lines were taken off
    // (and checks each has its reason); undefined would read as "untouched"
    // and lose the removal.
    (out as Record<string, unknown>)[key] = cleanList(v as object[], part as never) ?? [];
  };
  tidy("stopRules", "text");
  tidy("watchOuts", "condition");
  tidy("ifWrong", "title");
  tidy("faults", "fault");
  if (out.rep && Array.isArray(out.rep.moments)) {
    const moments = out.rep.moments.filter((m) => typeof m?.say === "string" && m.say.trim());
    out.rep = withLine(out.rep, "moments", moments);
  }
  return out;
}
