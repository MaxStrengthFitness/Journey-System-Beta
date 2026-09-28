/**
 * THE CODEX FORMAT, v2 — the one reader.
 *
 * Round: the Machine Codex, second round (Codex R2, Sep 28 2026). AJ
 * approved the new data "all yes"; the fields are in types/machines.ts
 * ("THE CODEX FORMAT, v2"), and this file is how every screen reads them:
 * the Codex page (Codex R3), the Active Session's slice of it, the editor's
 * source view and the Compare view. PURE: no React, no Firestore.
 *
 * Four questions, one answer each:
 *
 *   switchesOf     the machine's switches — the blueprint's seven, read from
 *                  the one field that holds each (so two can never disagree)
 *   presetOf       the preset strip: each dial's letter and this unit's number
 *   stopLinesOf    what a trainer must not miss at the machine: never to
 *                  failure WITH its reason, then the stop rules
 *   methodLines    every line of the method a trainer reads, each with the
 *                  source recorded for it (or none) — "a source on every
 *                  method line, so a line with no source can't slip in
 *                  unseen again" (the codex source check, step 5)
 *
 * A definition written before v2 answers every question from its v1 fields,
 * so every one of the twenty machines has a page tonight, and each v2 line
 * an administrator writes in the editor shows up on it.
 */

import type {
  CodexMomentId,
  CodexSwitches,
  LineSource,
  MachineDefinition,
  TurnaroundRule,
} from "../../types/machines";

// ─────────────────────────────────────────────────────────────────────
// The twelve leaves
// ─────────────────────────────────────────────────────────────────────

export type LeafId =
  | "stop"
  | "setup"
  | "getset"
  | "begin"
  | "rep"
  | "finish"
  | "wrong"
  | "adapt"
  | "program"
  | "faults"
  | "understand"
  | "floor";

export interface LeafSpec {
  id: LeafId;
  n: number;
  title: string;
  /**
   * floor      needed at the machine (the page's first layer)
   * study      read between clients
   * computed   built from Journey's own data; nobody types it
   */
  tier: "floor" | "study" | "computed";
}

/** In reading order: the timeline of a set, then study, then the data. */
export const CODEX_LEAVES: readonly LeafSpec[] = [
  { id: "stop", n: 1, title: "Stop", tier: "floor" },
  { id: "setup", n: 2, title: "Set up", tier: "floor" },
  { id: "getset", n: 3, title: "Get set", tier: "floor" },
  { id: "begin", n: 4, title: "Begin", tier: "floor" },
  { id: "rep", n: 5, title: "The rep", tier: "floor" },
  { id: "finish", n: 6, title: "Finish", tier: "floor" },
  { id: "wrong", n: 7, title: "If something goes wrong", tier: "floor" },
  { id: "adapt", n: 8, title: "Adapt", tier: "study" },
  { id: "program", n: 9, title: "Program it", tier: "study" },
  { id: "faults", n: 10, title: "Faults and fixes", tier: "study" },
  { id: "understand", n: 11, title: "Understand", tier: "study" },
  { id: "floor", n: 12, title: "On our floor", tier: "computed" },
];

// ─────────────────────────────────────────────────────────────────────
// The switches
// ─────────────────────────────────────────────────────────────────────

export type BeginsWith = "loadUp" | "handoff";
export type UpperTurn = "passThrough" | "pauseSqueeze" | "hardStop";

export interface SwitchSet {
  beginsWith: BeginsWith;
  /** Absent when the upper turnaround has no style recorded. */
  upperTurn?: UpperTurn;
  lowerTurn?: NonNullable<CodexSwitches["lowerTurn"]>;
  neverToFailure: boolean;
  /** The reason, when never-to-failure carries one. */
  safetyNotice?: string;
  repCap?: number;
  tscCapable?: boolean;
  unloadTransfer?: boolean;
}

const UPPER_FROM_STYLE: Record<TurnaroundRule["style"], UpperTurn> = {
  "touch-and-go": "passThrough",
  "pause-squeeze": "pauseSqueeze",
  "hard-stop": "hardStop",
};

/**
 * The blueprint's seven switches. Three already had a field before v2
 * (`execution.requiresHandoff`, `execution.upperTurnaround.style`,
 * `execution.neverToFailure`) and are read from it; the other four are v2's
 * `switches`. One source for each, so the page and the editor can never
 * disagree about whether the Leg Press starts with a handoff.
 */
export function switchesOf(def: Partial<MachineDefinition> | null | undefined): SwitchSet {
  const e = def?.execution;
  const sw = def?.switches ?? {};
  const style = e?.upperTurnaround?.style;
  const notice = typeof e?.safetyNotice === "string" ? e.safetyNotice.trim() : "";
  const out: SwitchSet = {
    beginsWith: e?.requiresHandoff ? "handoff" : "loadUp",
    neverToFailure: e?.neverToFailure === true,
  };
  if (style && UPPER_FROM_STYLE[style]) out.upperTurn = UPPER_FROM_STYLE[style];
  if (sw.lowerTurn === "stackTouch" || sw.lowerTurn === "jointLimited" || sw.lowerTurn === "flexLimited") {
    out.lowerTurn = sw.lowerTurn;
  }
  if (out.neverToFailure && notice) out.safetyNotice = notice;
  if (typeof sw.repCap === "number" && Number.isFinite(sw.repCap) && sw.repCap > 0) {
    out.repCap = Math.floor(sw.repCap);
  }
  if (sw.tscCapable === true) out.tscCapable = true;
  if (sw.unloadTransfer === true) out.unloadTransfer = true;
  return out;
}

export const BEGINS_WITH_WORDS: Record<BeginsWith, string> = {
  loadUp: "Begins with a gradual load-up",
  handoff: "Begins with a handoff",
};

export const UPPER_TURN_WORDS: Record<UpperTurn, string> = {
  passThrough: "Upper turn: pass straight through",
  pauseSqueeze: "Upper turn: pause, then squeeze",
  hardStop: "Upper turn: a hard stop",
};

export const LOWER_TURN_WORDS: Record<NonNullable<CodexSwitches["lowerTurn"]>, string> = {
  stackTouch: "Lower turn: the plates barely touch",
  jointLimited: "Lower turn: where the joint stops",
  flexLimited: "Lower turn: where her flexibility stops",
};

/** The switches as short sentences, in the order a trainer meets them. */
export function switchWords(s: SwitchSet): string[] {
  const out: string[] = [BEGINS_WITH_WORDS[s.beginsWith]];
  if (s.upperTurn) out.push(UPPER_TURN_WORDS[s.upperTurn]);
  if (s.lowerTurn) out.push(LOWER_TURN_WORDS[s.lowerTurn]);
  if (s.neverToFailure) out.push("Never to failure");
  if (s.repCap) out.push(`No more than ${s.repCap} reps early on`);
  if (s.tscCapable) out.push("Can be pinned for a timed static contraction");
  if (s.unloadTransfer) out.push("The trainer takes the weight back at the end");
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// The preset strip
// ─────────────────────────────────────────────────────────────────────

export interface PresetDial {
  key: string;
  label: string;
  /** "G", "P", "SP". Absent until someone records the unit's letters. */
  letter?: string;
  /** This unit's number, or absent when none is set. */
  number?: string;
  /** Its number on the drawing: the recorded callout, else its place in the list. */
  callout: number;
  /** The rule it is set against (method), when written. */
  rule?: string;
  /** First set-up only. */
  firstSetup?: string;
}

export interface Preset {
  dials: PresetDial[];
  /** Dials with no number yet. */
  unset: number;
  state: "set" | "partial" | "none" | "no-dials";
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function numberIn(map: Record<string, string> | undefined | null, ...names: string[]): string {
  if (!map) return "";
  for (const n of names) {
    const v = map[n];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  const wanted = new Set(names.map(squash));
  for (const [k, v] of Object.entries(map)) {
    if (wanted.has(squash(k)) && v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

/**
 * Where this unit's dials sit, in the unit's own dial order.
 *
 * The number comes from the studio's own setup card first (`studioNumbers`,
 * the studio's machineSettings standards) and the unit's resolved defaults
 * second — the same order as the Catalog's preset line and the Active
 * Session's ghost values, so the three never quote different numbers.
 */
export function presetOf(
  def: Partial<MachineDefinition> | null | undefined,
  studioNumbers?: Record<string, string> | null,
): Preset {
  const fields = def?.settingFields ?? [];
  if (fields.length === 0) return { dials: [], unset: 0, state: "no-dials" };
  let unset = 0;
  const dials = fields.map((f, i): PresetDial => {
    const number = numberIn(studioNumbers, f.label, f.key) || numberIn(def?.defaultSettings, f.key, f.label);
    if (!number) unset += 1;
    const rule = def?.dialRules?.[f.key];
    const d: PresetDial = {
      key: f.key,
      label: f.label || f.key,
      callout: typeof f.callout === "number" && f.callout > 0 ? Math.floor(f.callout) : i + 1,
    };
    const letter = typeof f.letter === "string" ? f.letter.trim() : "";
    if (letter) d.letter = letter;
    if (number) d.number = number;
    if (rule?.rule?.trim()) d.rule = rule.rule.trim();
    if (rule?.firstSetup?.trim()) d.firstSetup = rule.firstSetup.trim();
    return d;
  });
  const set = dials.length - unset;
  const state = set === 0 ? "none" : unset > 0 ? "partial" : "set";
  return { dials, unset, state };
}

/**
 * "G 4 · P 2 · SP 3 · S 8" — a letter where the unit has one, else the
 * dial's name ("Gap 4"); the dials with no number are counted, not guessed.
 */
export function presetLine(p: Preset): string {
  if (p.state === "no-dials") return "No dials recorded for this unit";
  if (p.state === "none") return "No numbers set for this unit yet";
  const line = p.dials
    .filter((d) => d.number)
    .map((d) => `${d.letter ?? d.label} ${d.number}`)
    .join(" · ");
  return p.state === "partial" ? `${line} · ${p.unset} not set` : line;
}

// ─────────────────────────────────────────────────────────────────────
// The stop rules — pinned, never folded
// ─────────────────────────────────────────────────────────────────────

export interface StopLine {
  kind: "never-to-failure" | "stop-rule";
  text: string;
  why?: string;
}

/**
 * What a trainer must not miss at this machine, most important first:
 * never to failure with its reason ("an unexplained prohibition gets
 * ignored"), then the v2 stop rules. Show-only on every screen — the
 * session never refuses a set over one (the Codex room's question 5).
 */
export function stopLinesOf(def: Partial<MachineDefinition> | null | undefined): StopLine[] {
  const out: StopLine[] = [];
  const s = switchesOf(def);
  if (s.neverToFailure) {
    out.push({
      kind: "never-to-failure",
      text: "Never to failure.",
      why: s.safetyNotice ?? "Stop the set while it is still controlled.",
    });
  }
  for (const r of def?.stopRules ?? []) {
    const text = typeof r?.text === "string" ? r.text.trim() : "";
    if (!text) continue;
    const why = typeof r.why === "string" ? r.why.trim() : "";
    out.push(why ? { kind: "stop-rule", text, why } : { kind: "stop-rule", text });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Every method line, with its source
// ─────────────────────────────────────────────────────────────────────

export interface MethodLine {
  /** "execution.loadUpProtocol", "clinicalWarnings", "dialRules.seat". */
  path: string;
  /** For a list entry: its words (or its title), which is also its key. */
  line?: string;
  /** What the line is, for a person: "The load-up", "Clinical warning". */
  label: string;
  /** What it says. */
  text: string;
  leaf: LeafId;
  /** The source recorded for exactly this line, if any. */
  source?: LineSource;
}

const MOMENT_LABEL: Record<CodexMomentId, string> = {
  loadUp: "Load-up",
  up: "Up",
  upperTurn: "Upper turn",
  down: "Down",
  lowerTurn: "Lower turn",
};

export function momentLabel(m: CodexMomentId): string {
  return MOMENT_LABEL[m] ?? m;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The key a source is filed under: the path, and for a list the entry's words. */
export function lineKey(path: string, line?: string): string {
  return `${path}\u0000${(line ?? "").trim()}`;
}

/**
 * Every line of the method a trainer reads, in page order, each with the
 * source recorded for it. Blank fields are not lines; a list entry is one
 * line per entry.
 */
export function methodLines(def: Partial<MachineDefinition> | null | undefined): MethodLine[] {
  if (!def) return [];
  const out: Omit<MethodLine, "source">[] = [];
  const add = (path: string, label: string, text: unknown, leaf: LeafId, line?: string) => {
    const t = str(text);
    if (t) out.push(line === undefined ? { path, label, text: t, leaf } : { path, label, text: t, leaf, line });
  };
  const addList = (path: string, label: string, list: unknown, leaf: LeafId) => {
    if (!Array.isArray(list)) return;
    for (const v of list) {
      const t = str(v);
      if (t) out.push({ path, label, text: t, leaf, line: t });
    }
  };

  // 1 Stop
  if (def.execution?.neverToFailure) add("execution.safetyNotice", "Never to failure: why", def.execution.safetyNotice, "stop");
  for (const r of def.stopRules ?? []) {
    const t = str(r?.text);
    if (t) out.push({ path: "stopRules", label: "Stop rule", text: str(r.why) ? `${t} ${str(r.why)}` : t, leaf: "stop", line: t });
  }
  for (const w of def.watchOuts ?? []) {
    const c = str(w?.condition);
    if (c) out.push({ path: "watchOuts", label: "Watch-out", text: `${c}: ${str(w.action)}`, leaf: "stop", line: c });
  }
  addList("clinicalWarnings", "Clinical warning", def.clinicalWarnings, "stop");
  addList("contraindicatedFor", "Contraindicated for", def.contraindicatedFor, "stop");

  // 2 Set up
  add("setUp.entry", "Entry", def.setUp?.entry, "setup");
  const b = def.universalBaseline;
  add("universalBaseline.seatHeightPosition", "Seat", b?.seatHeightPosition, "setup");
  add("universalBaseline.padAxisAlignment", "Pad and axis", b?.padAxisAlignment, "setup");
  add("universalBaseline.restraintsAnchoring", "Restraints", b?.restraintsAnchoring, "setup");
  add("universalBaseline.gripHandPosition", "Grip", b?.gripHandPosition, "setup");
  add("universalBaseline.startingWeightStackGap", "Stack and gap", b?.startingWeightStackGap, "setup");
  for (const f of def.settingFields ?? []) {
    const rule = def.dialRules?.[f.key];
    if (rule) {
      add(`dialRules.${f.key}`, `${f.label || f.key}: the rule`, rule.rule, "setup");
      add(`dialRules.${f.key}.firstSetup`, `${f.label || f.key}: first set-up`, rule.firstSetup, "setup");
    }
  }
  add("setUp.preload", "Preload", def.setUp?.preload, "setup");
  add("setUp.startingLoadRule", "Starting load", def.setUp?.startingLoadRule, "setup");

  // 3 Get set
  add("executionPosture", "Posture", def.executionPosture, "getset");
  add("getSet.axisLandmark", "Axis", def.getSet?.axisLandmark, "getset");
  add("getSet.breathing", "Breathing", def.getSet?.breathing, "getset");
  for (const c of def.alignmentCheckpoints ?? []) {
    const t = str(c?.title);
    if (t) out.push({ path: "alignmentCheckpoints", label: "Checkpoint", text: `${t}: ${str(c.verify)}`, leaf: "getset", line: t });
  }

  // 4 Begin
  const e = def.execution;
  add("execution.loadUpProtocol", "The load-up", e?.loadUpProtocol, "begin");
  add("begin.script", "The words", def.begin?.script, "begin");
  if (e?.requiresHandoff) {
    add("execution.handoffProtocol", "The handoff", e.handoffProtocol, "begin");
    add("execution.handoffCue", "The transfer cue", e.handoffCue, "begin");
    add("begin.delayHandoffWhen", "When to delay the handoff", def.begin?.delayHandoffWhen, "begin");
  }

  // 5 The rep
  add("execution.cadenceNotes", "Cadence", e?.cadenceNotes, "rep");
  add("execution.upperTurnaround.description", "Upper turnaround", e?.upperTurnaround?.description, "rep");
  add("execution.lowerTurnaround.description", "Lower turnaround", e?.lowerTurnaround?.description, "rep");
  add("rep.click", "When to click", def.rep?.click, "rep");
  add("rep.firstEccentricCue", "First eccentric", def.rep?.firstEccentricCue, "rep");
  add("rep.path", "The path", def.rep?.path, "rep");
  addList("execution.keyCues", "Key cue", e?.keyCues, "rep");
  for (const m of def.rep?.moments ?? []) {
    const t = str(m?.say);
    if (t) out.push({ path: "rep.moments", label: `Cue: ${momentLabel(m.moment)}`, text: t, leaf: "rep", line: t });
  }

  // 6 Finish
  add("finish.failure", "Failure", def.finish?.failure, "finish");
  add("finish.finalDescent", "The final descent", def.finish?.finalDescent, "finish");
  add("finish.unloadTransfer", "The unloading transfer", def.finish?.unloadTransfer, "finish");
  add("finish.exit", "Exit", def.finish?.exit, "finish");
  add("finish.record", "What to record", def.finish?.record, "finish");

  // 7 If something goes wrong
  for (const a of def.ifWrong ?? []) {
    const t = str(a?.title);
    if (!t) continue;
    const steps = (a.steps ?? []).map(str).filter(Boolean).join(" ");
    out.push({ path: "ifWrong", label: "If something goes wrong", text: [t, str(a.trigger), steps].filter(Boolean).join(" — "), leaf: "wrong", line: t });
  }

  // 8 Adapt
  const bt = def.bodyTypeAdjustments;
  add("bodyTypeAdjustments.shorterStature.seatAdjustment", "Shorter: seat", bt?.shorterStature?.seatAdjustment, "adapt");
  add("bodyTypeAdjustments.shorterStature.padHandlePlacement", "Shorter: pads and handles", bt?.shorterStature?.padHandlePlacement, "adapt");
  add("bodyTypeAdjustments.shorterStature.specialNotes", "Shorter: anything else", bt?.shorterStature?.specialNotes, "adapt");
  add("bodyTypeAdjustments.tallerStature.seatAdjustment", "Taller: seat", bt?.tallerStature?.seatAdjustment, "adapt");
  add("bodyTypeAdjustments.tallerStature.padHandlePlacement", "Taller: pads and handles", bt?.tallerStature?.padHandlePlacement, "adapt");
  add("bodyTypeAdjustments.tallerStature.specialNotes", "Taller: anything else", bt?.tallerStature?.specialNotes, "adapt");
  add("bodyTypeAdjustments.limitedMobility.romRestrictions", "Limited mobility: range", bt?.limitedMobility?.romRestrictions, "adapt");
  add("bodyTypeAdjustments.limitedMobility.alternativeProtocols", "Limited mobility: static work", bt?.limitedMobility?.alternativeProtocols, "adapt");
  add("bodyTypeAdjustments.limitedMobility.specialNotes", "Limited mobility: anything else", bt?.limitedMobility?.specialNotes, "adapt");
  add("adapt.tsc", "Timed static contraction", def.adapt?.tsc, "adapt");
  add("adapt.staticHold", "Static hold", def.adapt?.staticHold, "adapt");
  add("adapt.bias", "Bias", def.adapt?.bias, "adapt");

  // 9 Program it
  addList("sequencingContraindications", "Sequencing", def.sequencingContraindications, "program");
  add("program.pairings", "Pairings", def.program?.pairings, "program");
  add("program.substitutes", "Substitutes", def.program?.substitutes, "program");
  add("program.category", "Where it sits", def.program?.category, "program");

  // 10 Faults and fixes
  for (const f of def.faults ?? []) {
    const t = str(f?.fault);
    if (t) {
      const rest = [str(f.see), str(f.say) ? `say “${str(f.say)}”` : "", str(f.change)].filter(Boolean).join(" · ");
      out.push({ path: "faults", label: "Fault", text: rest ? `${t}: ${rest}` : t, leaf: "faults", line: t });
    }
  }

  // 11 Understand
  add("clinicalNote", "Clinical note", def.clinicalNote, "understand");
  addList("musculature.primary", "Primary muscle", def.musculature?.primary, "understand");
  addList("musculature.secondary", "Secondary muscle", def.musculature?.secondary, "understand");
  addList("musculature.synergists", "Synergist", def.musculature?.synergists, "understand");
  add("understand.jointActions", "Joint actions", def.understand?.jointActions, "understand");
  add("understand.why", "Why", def.understand?.why, "understand");
  add("understand.character", "The machine's character", def.understand?.character, "understand");
  add("biomechanicalNotes", "Biomechanics", def.biomechanicalNotes, "understand");

  const byKey = new Map<string, LineSource>();
  for (const s of def.sources ?? []) {
    if (s && typeof s.path === "string") byKey.set(lineKey(s.path, s.line), s);
  }
  return out.map((l) => {
    const source = byKey.get(lineKey(l.path, l.line));
    return source ? { ...l, source } : l;
  });
}

/** The source recorded for one line, if any. */
export function sourceFor(
  def: Partial<MachineDefinition> | null | undefined,
  path: string,
  line?: string,
): LineSource | undefined {
  const key = lineKey(path, line);
  return (def?.sources ?? []).find((s) => s && lineKey(s.path, s.line) === key);
}

/** The last part of a path under docs/msf-academy, without its extension. */
function shortRef(ref: string): string {
  const last = ref.split(/[\\/]/).filter(Boolean).pop() ?? ref;
  return last.replace(/\.(txt|md)$/i, "").trim();
}

/**
 * A source in the words a page prints in small type. A book is always
 * "paraphrased from" — the app never quotes it (AJ, Sep 27 2026).
 */
export function sourceLabel(s: LineSource | undefined | null): string {
  if (!s) return "No source recorded";
  const at = s.at?.trim() ? ` · ${s.at.trim()}` : "";
  switch (s.kind) {
    case "academy":
      return s.ref?.trim() ? `${shortRef(s.ref)}${at}` : `The Academy${at}`;
    case "guide":
      return `Setup guide${s.ref?.trim() ? ` · ${shortRef(s.ref)}` : ""}${at}`;
    case "book":
      return `Paraphrased from ${s.ref?.trim() || "a book"}${at}`;
    case "unsourced":
      return "No source in the Academy";
  }
}

export interface SourceCoverage {
  /** Method lines the definition holds. */
  lines: number;
  /** Lines with an Academy, guide or book source. */
  sourced: number;
  /** Lines with no record, or recorded as unsourced. */
  unsourced: MethodLine[];
  /** Lines whose sources disagree: "Corporate to rule". */
  conflicts: MethodLine[];
}

/** How much of this machine's method says where it came from. */
export function sourceCoverage(def: Partial<MachineDefinition> | null | undefined): SourceCoverage {
  const lines = methodLines(def);
  const unsourced = lines.filter((l) => !l.source || l.source.kind === "unsourced");
  const conflicts = lines.filter((l) => !!l.source?.conflict?.trim());
  return { lines: lines.length, sourced: lines.length - unsourced.length, unsourced, conflicts };
}

/** "31 of 44 lines say where they come from · 2 where the sources disagree". */
export function coverageSentence(c: SourceCoverage): string {
  if (c.lines === 0) return "No method lines written yet.";
  const head =
    c.sourced === 0
      ? `None of its ${c.lines} lines has a source recorded yet`
      : c.sourced === c.lines
        ? `All ${c.lines} lines say where they come from`
        : `${c.sourced} of ${c.lines} lines say where they come from`;
  const tail = c.conflicts.length
    ? ` · ${c.conflicts.length} where the sources disagree`
    : "";
  return `${head}${tail}.`;
}
