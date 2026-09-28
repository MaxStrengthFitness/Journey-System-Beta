/**
 * COMPARE — every studio's differences from the Max Strength standard for
 * one catalog machine (Codex R5, the Sep 21 rule, built Sep 28 2026). PURE.
 *
 * The Sep 21 rule lets a studio change anything on its own copy, safety
 * included, and what keeps that safe is VISIBILITY: head office can see,
 * for any machine, which studios changed what — and every safety line a
 * studio took off, with its reason, who and when. This file turns the
 * studios' roster entries into that view.
 *
 * It is a view of SETTINGS AND WORDS, never of a studio's numbers: no
 * clients, no loads, no ranking of one studio against another ("must never
 * turn into a ranking", the blueprint). Studios are listed by name.
 *
 * A roster entry is read the way the app reads it: a copy's `overrides` is
 * its difference from the standard (pruned on every write), so a key being
 * there means the studio set its own; a studio's OWN machine (`source:
 * "custom"`) that names this one as its lineage inherits nothing and is
 * listed as that, not compared line by line.
 */

import type {
  MachineDefinition,
  MachineDefinitionField,
  RemovedSafetyLine,
  SafetyListField,
} from "../../../../types/machines";
import { SAFETY_LIST_FIELDS } from "../../../../types/machines";
import { FIELD_LABELS, tierOf, type TemplateTier } from "../../../../lib/machine-template";
import { safetyLineKey, validRemovals } from "../../../../lib/resolve-machine";

/** A roster document as Compare reads it; every field optional, as Firestore gives them. */
export interface RosterDocLike {
  /** The document's path, "studios/{s}/roster/{m}", when the reader has it. */
  path?: string;
  machineId?: string;
  studioId?: string;
  source?: string;
  basedOn?: string;
  status?: string;
  overrides?: Record<string, unknown>;
  modelId?: string;
  definition?: Record<string, unknown>;
  adoptedFrom?: { studioName?: string };
}

export interface CompareLine {
  /** What the line is: "Seat", "Upper turnaround: the cue". */
  label: string;
  standard: string;
  studio: string;
}

export interface CompareDifference {
  field: MachineDefinitionField;
  /** "Baseline setup". */
  label: string;
  tier: TemplateTier;
  lines: CompareLine[];
}

export interface CompareAddition {
  field: SafetyListField;
  label: string;
  line: string;
}

export interface StudioComparison {
  studioId: string;
  studioName: string;
  machineId: string;
  /** "copy" of this catalog machine, or the studio's "own" machine based on it. */
  kind: "copy" | "own";
  status: string;
  modelId?: string;
  differences: CompareDifference[];
  added: CompareAddition[];
  removed: RemovedSafetyLine[];
  /** A copy with nothing of its own: it follows the standard exactly. */
  follows: boolean;
  /** Copied from another studio's shared machine (an own machine only). */
  adoptedFromName?: string;
}

export interface NetworkLine {
  /** A field, or "added-safety" / "removed-safety". */
  key: string;
  /** "changed the dial defaults", "added a safety line". */
  words: string;
  units: number;
}

export interface CompareResult {
  units: StudioComparison[];
  copies: number;
  own: number;
  studios: number;
  /** Every safety line taken off, across the network, newest first. */
  removed: (RemovedSafetyLine & { studioId: string; studioName: string })[];
  changed: NetworkLine[];
}

const SAFETY = new Set<string>(SAFETY_LIST_FIELDS);

const SUB_LABELS: Record<string, string> = {
  seatHeightPosition: "Seat",
  padAxisAlignment: "Pad and axis",
  restraintsAnchoring: "Restraints",
  gripHandPosition: "Grip",
  startingWeightStackGap: "Stack and gap",
  shorterStature: "Shorter",
  tallerStature: "Taller",
  limitedMobility: "Limited mobility",
  seatAdjustment: "seat",
  padHandlePlacement: "pads and handles",
  specialNotes: "anything else",
  romRestrictions: "range",
  alternativeProtocols: "static work",
  primary: "Primary muscles",
  secondary: "Secondary muscles",
  synergists: "Synergists",
  requiresHandoff: "Handoff",
  handoffProtocol: "The handoff",
  handoffCue: "The transfer cue",
  loadUpProtocol: "The load-up",
  concentricSeconds: "Concentric seconds",
  eccentricSeconds: "Eccentric seconds",
  cadenceNotes: "Cadence notes",
  upperTurnaround: "Upper turnaround",
  lowerTurnaround: "Lower turnaround",
  keyCues: "Key cues",
  neverToFailure: "Never to failure",
  safetyNotice: "Never to failure: why",
  style: "style",
  description: "what happens",
  cue: "the cue",
  pauseSecondsFirstReps: "pause, reps 1–2",
  squeezeSecondsFromRepThree: "squeeze from rep 3",
  entry: "Entry",
  preload: "Preload",
  startingLoadRule: "Choosing a first load",
  axisLandmark: "The axis",
  breathing: "Breathing",
  script: "The words",
  delayHandoffWhen: "When to delay the handoff",
  path: "The path",
  click: "When to click",
  firstEccentricCue: "The first eccentric",
  moments: "Cues by moment",
  failure: "Failure",
  finalDescent: "The final descent",
  unloadTransfer: "The unloading transfer",
  exit: "Exit",
  record: "What to record",
  tsc: "Timed static contraction",
  staticHold: "Static hold",
  bias: "Bias",
  pairings: "Pairings",
  substitutes: "Substitutes",
  category: "Where it sits",
  jointActions: "Joint actions",
  why: "Why",
  character: "The machine's character",
  academy: "In the Academy",
  lowerTurn: "What limits the lower turn",
  repCap: "Rep cap",
  tscCapable: "Can be pinned for a TSC",
};

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A value as a person reads it, never cut mid-word by more than the clip. */
export function summarize(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "string") return clip(v.trim()) || "—";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    if (v.length === 0) return "none";
    if (v.every((x) => typeof x === "string")) return clip((v as string[]).join(" · "));
    const named = v
      .map((x) => {
        if (!x || typeof x !== "object") return String(x);
        const o = x as Record<string, unknown>;
        const name = o.label ?? o.title ?? o.text ?? o.condition ?? o.fault ?? o.say ?? o.key;
        return typeof name === "string" ? name : "";
      })
      .filter(Boolean);
    return named.length ? clip(named.join(" · ")) : `${v.length} ${v.length === 1 ? "entry" : "entries"}`;
  }
  if (typeof v === "object") {
    const parts = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined && x !== "")
      .map(([k, x]) => `${SUB_LABELS[k] ?? k}: ${summarize(x)}`);
    return parts.length ? clip(parts.join("; ")) : "—";
  }
  return String(v);
}

function dialLabel(standard: Partial<MachineDefinition>, key: string): string {
  return standard.settingFields?.find((f) => f.key === key)?.label ?? key;
}

/** The lines of one overridden field, per key where the field merges per key. */
function linesOf(
  field: MachineDefinitionField,
  standard: Partial<MachineDefinition>,
  value: unknown,
): CompareLine[] {
  const std = (standard as Record<string, unknown>)[field];
  const bag = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const b = bag(value);

  if (field === "defaultSettings" && b) {
    return Object.entries(b).map(([k, x]) => ({
      label: dialLabel(standard, k),
      standard: summarize(bag(std)?.[k]),
      studio: summarize(x),
    }));
  }
  if (field === "dialRules" && b) {
    return Object.entries(b).map(([k, x]) => ({
      label: `${dialLabel(standard, k)}: the rule`,
      standard: summarize(bag(std)?.[k]),
      studio: summarize(x),
    }));
  }
  if (field === "bodyTypeAdjustments" && b) {
    const out: CompareLine[] = [];
    for (const [col, inner] of Object.entries(b)) {
      for (const [k, x] of Object.entries(bag(inner) ?? {})) {
        out.push({
          label: `${SUB_LABELS[col] ?? col}: ${SUB_LABELS[k] ?? k}`,
          standard: summarize(bag(bag(std)?.[col])?.[k]),
          studio: summarize(x),
        });
      }
    }
    return out;
  }
  if (field === "execution" && b) {
    const out: CompareLine[] = [];
    for (const [k, x] of Object.entries(b)) {
      const innerStudio = bag(x);
      const innerStd = bag(bag(std)?.[k]);
      if (innerStudio && (k === "upperTurnaround" || k === "lowerTurnaround")) {
        for (const [kk, xx] of Object.entries(innerStudio)) {
          out.push({
            label: `${SUB_LABELS[k]}: ${SUB_LABELS[kk] ?? kk}`,
            standard: summarize(innerStd?.[kk]),
            studio: summarize(xx),
          });
        }
      } else {
        out.push({ label: SUB_LABELS[k] ?? k, standard: summarize(bag(std)?.[k]), studio: summarize(x) });
      }
    }
    return out;
  }
  if (b && !Array.isArray(value)) {
    return Object.entries(b).map(([k, x]) => ({
      label: SUB_LABELS[k] ?? k,
      standard: summarize(bag(std)?.[k]),
      studio: summarize(x),
    }));
  }
  return [{ label: cap(FIELD_LABELS[field] ?? String(field)), standard: summarize(std), studio: summarize(value) }];
}

function studioIdOf(doc: RosterDocLike): string {
  if (doc.studioId) return doc.studioId;
  const m = /^studios\/([^/]+)\/roster\//.exec(doc.path ?? "");
  return m ? m[1] : "";
}

/** One safety entry in words: a line, a checkpoint, a stop rule or a watch-out. */
function entryWords(e: unknown): string {
  if (typeof e === "string") return e.trim();
  if (!e || typeof e !== "object") return "";
  const o = e as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (s(o.title)) return s(o.verify) ? `${s(o.title)}: ${s(o.verify)}` : s(o.title);
  if (s(o.text)) return s(o.why) ? `${s(o.text)} ${s(o.why)}` : s(o.text);
  if (s(o.condition)) return s(o.action) ? `${s(o.condition)}: ${s(o.action)}` : s(o.condition);
  return summarize(e);
}

/** The additions a copy made to one safety list (and its rewording of a line it took off). */
function additionsTo(
  field: SafetyListField,
  standard: Partial<MachineDefinition>,
  value: unknown,
  removed: RemovedSafetyLine[],
): CompareAddition[] {
  const stdList = ((standard[field] as unknown[]) ?? []);
  const stdKeys = new Map(stdList.map((e) => [safetyLineKey(field, e).toLowerCase(), e]));
  const gone = new Set(removed.filter((r) => r.field === field).map((r) => r.line.toLowerCase()));
  const label = cap(FIELD_LABELS[field] ?? field);
  const out: CompareAddition[] = [];
  for (const e of Array.isArray(value) ? value : []) {
    const k = safetyLineKey(field, e);
    if (!k) continue;
    const std = stdKeys.get(k.toLowerCase());
    const reworded = std !== undefined && gone.has(k.toLowerCase()) && JSON.stringify(std) !== JSON.stringify(e);
    if (std === undefined || reworded) out.push({ field, label, line: entryWords(e) });
  }
  return out;
}

const NETWORK_WORDS: Partial<Record<string, string>> = {
  defaultSettings: "changed the dials' defaults",
  settingFields: "changed the dials",
  universalBaseline: "changed the baseline set-up",
  bodyTypeAdjustments: "changed the body-type set-ups",
  baselineLoad: "set their own starting weight",
  name: "call it something else",
  execution: "changed the execution and cadence",
  musculature: "changed the musculature",
  "added-safety": "added a safety line",
  "removed-safety": "took a safety line off",
};

/**
 * Every studio's comparison with the standard, and the network in a line.
 * `standard` is the catalog machine's definition; `docs` the roster entries
 * whose `basedOn` names it; `studioNames` studio id → name.
 */
export function compareStandard(
  standard: Partial<MachineDefinition>,
  docs: readonly RosterDocLike[],
  studioNames: Readonly<Record<string, string>> = {},
): CompareResult {
  const units: StudioComparison[] = [];
  for (const doc of docs) {
    const studioId = studioIdOf(doc);
    const studioName = studioNames[studioId] || studioId || "A studio";
    const base = {
      studioId,
      studioName,
      machineId: doc.machineId ?? "",
      status: doc.status ?? "active",
      ...(doc.modelId ? { modelId: doc.modelId } : {}),
    };
    if (doc.source === "custom") {
      units.push({
        ...base,
        kind: "own",
        differences: [],
        added: [],
        removed: [],
        follows: false,
        ...(doc.adoptedFrom?.studioName ? { adoptedFromName: doc.adoptedFrom.studioName } : {}),
      });
      continue;
    }
    const overrides = doc.overrides ?? {};
    const removed = validRemovals(standard, overrides.removedSafety);
    const added: CompareAddition[] = [];
    const differences: CompareDifference[] = [];
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined || key === "removedSafety" || key === "modelId") continue;
      const field = key as MachineDefinitionField;
      if (SAFETY.has(key)) {
        added.push(...additionsTo(key as SafetyListField, standard, value, removed));
        continue;
      }
      if (key === "sources") {
        const n = Array.isArray(value) ? value.length : 0;
        if (n) {
          differences.push({
            field,
            label: "Sources",
            tier: tierOf(field),
            lines: [{ label: "Sources", standard: "—", studio: `records its own source for ${n} ${n === 1 ? "line" : "lines"}` }],
          });
        }
        continue;
      }
      const lines = linesOf(field, standard, value).filter((l) => l.standard !== l.studio);
      if (lines.length === 0) continue;
      differences.push({ field, label: cap(FIELD_LABELS[field] ?? key), tier: tierOf(field), lines });
    }
    const order: Record<TemplateTier, number> = { additive: 0, method: 1, studio: 2 };
    differences.sort((a, b) => order[a.tier] - order[b.tier] || a.label.localeCompare(b.label));
    units.push({
      ...base,
      kind: "copy",
      differences,
      added,
      removed,
      follows: differences.length === 0 && added.length === 0 && removed.length === 0,
    });
  }
  units.sort((a, b) => a.studioName.localeCompare(b.studioName) || a.machineId.localeCompare(b.machineId));

  const removedAll = units
    .flatMap((u) => u.removed.map((r) => ({ ...r, studioId: u.studioId, studioName: u.studioName })))
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));

  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const u of units) {
    if (u.kind !== "copy") continue;
    for (const d of u.differences) bump(d.field);
    if (u.added.length) bump("added-safety");
    if (u.removed.length) bump("removed-safety");
  }
  const changed: NetworkLine[] = [...counts.entries()]
    .map(([key, n]) => ({
      key,
      words: NETWORK_WORDS[key] ?? `changed ${FIELD_LABELS[key as MachineDefinitionField] ?? key}`,
      units: n,
    }))
    .sort((a, b) => b.units - a.units || a.words.localeCompare(b.words));

  return {
    units,
    copies: units.filter((u) => u.kind === "copy").length,
    own: units.filter((u) => u.kind === "own").length,
    studios: new Set(units.map((u) => u.studioId)).size,
    removed: removedAll,
    changed,
  };
}

/**
 * "4 units at 3 studios: 2 changed the dials' defaults · 1 took a safety
 * line off." A description of the network's configuration, never a ranking.
 */
export function networkSentence(r: CompareResult, machineName: string): string {
  const total = r.units.length;
  if (total === 0) return `No studio has ${machineName} on its floor yet.`;
  const head = `${total} ${total === 1 ? "unit" : "units"} at ${r.studios} ${r.studios === 1 ? "studio" : "studios"}`;
  const own = r.own ? ` (${r.own} ${r.own === 1 ? "is a studio's own machine" : "are studios' own machines"})` : "";
  if (r.copies === 0) return `${head}${own}.`;
  if (r.changed.length === 0) return `${head}${own}: every copy follows the standard exactly.`;
  return `${head}${own}: ${r.changed.map((c) => `${c.units} ${c.words}`).join(" · ")}.`;
}
