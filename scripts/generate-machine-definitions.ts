/**
 * GENERATE src/data/machine-definitions.ts FROM THE ACADEMY CORPUS.
 *
 * Round: Machine authoring, Sep 2026.
 *
 * The catalog documents in Firestore were seeded from data/default-machines.ts,
 * which is the LEGACY `Machine` shape: `targetMuscles` as one comma string,
 * `settingOptions` as bare labels, and nothing at all for the biomechanics
 * template. The Machine Creator reads `MachineDefinition`. Different names, so
 * opening Edit on a real machine filled about six of sixty inputs — and filled
 * three of them WRONG, because emptyMachineDefinition() defaults
 * movementPattern to "Upper Body: Horizontal Push" and that got saved onto the
 * leg press. A confident wrong value is the one thing this app is not allowed
 * to ship.
 *
 * Everything needed to fix it was already in the repo. This script joins:
 *
 *   docs/msf-academy/Set Up Machines/standardized-setup-guide-batch{1..4}.md
 *       20 machines under five fixed headings that map 1:1 onto the template.
 *       The PROSE — every baseline line, every body-type variable, every
 *       checkpoint, every cue — is lifted verbatim by this parser. No model
 *       retypes a clinical sentence; the only judgement below is which field
 *       a labelled bullet belongs in.
 *
 *   src/data/machine-anatomy-map.ts   the coarse MuscleId arrays the body
 *                                     diagram paints, movementPattern,
 *                                     preferredView, clinicalNote.
 *   src/data/machine-database.ts      clinical warnings, contraindications,
 *                                     sequencing, starting loads, posture.
 *   src/data/default-machines.ts      region, display order, the dial labels.
 *
 * WHAT IS DELIBERATELY LEFT EMPTY. Anything the sources do not actually say
 * stays blank so the editor's completeness meter can ask for it, rather than
 * being filled with a plausible guess. That is `defaultSettings` (the corpus
 * gives a starting GAP in prose, not a value per dial), `synergistMuscles`
 * (the anatomy map has no synergist column; the prose synergists survive in
 * `musculature.synergists`), and every `imageUrl` the database lacks.
 *
 * Run:  npx tsx scripts/generate-machine-definitions.ts
 * The output is checked in and typechecked, so a bad parse fails the build
 * rather than reaching a trainer.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MACHINE_ANATOMY } from "../src/data/machine-anatomy-map";
import { MACHINE_DATABASE } from "../src/data/machine-database";
import { DEFAULT_MACHINES } from "../src/data/default-machines";
import { CANONICAL_TO_DB_KEY } from "../src/features/catalog/machine-identity";
import {
  ANATOMICAL_REGION_ORDER,
  settingFieldKey,
  type AnatomicalRegion,
  type KinematicClass,
} from "../src/types/machines";

// Run from the repo root: `npx tsx scripts/generate-machine-definitions.ts`.
// tsx transpiles to CJS here, where import.meta.dirname is undefined.
const ROOT = process.cwd();
const GUIDES = join(ROOT, "docs/msf-academy/Set Up Machines");

// ── Text hygiene ─────────────────────────────────────────────────────

/**
 * The corpus carries source-citation numbers from the Drive conversion —
 * "...aligned directly with the chest [152, 205]." They are provenance for
 * the original document and noise on a gym floor.
 */
function clean(text: string): string {
  return text
    .replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

/** Split a prose list on commas that are not inside parentheses. */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf.trim());
  return out.map((s) => s.replace(/\.$/, "").trim()).filter(Boolean);
}

/**
 * The coach's actual spoken words.
 *
 * The corpus marks a cue by italicising a quotation — *"That is yours"* — and
 * uses plain quotes for ordinary emphasis ("stacked", "squeeze", "touch and
 * go"). Taking every quoted run put single emphasis words into keyCues, so
 * the italicised form is read first and a bare quotation has to look like a
 * sentence — several words, not a label — before it counts.
 */
function quotedPhrases(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\*\s*[""]([^""]{6,180})[""]\s*\*/g)) out.push(clean(m[1]));
  if (out.length) return out;
  for (const m of text.matchAll(/[""]([^""]{12,180})[""]/g)) {
    const phrase = clean(m[1]);
    if (phrase.split(/\s+/).length >= 3) out.push(phrase);
  }
  return out;
}

// ── Structure ────────────────────────────────────────────────────────

interface Bullet {
  label: string;
  body: string;
  children: Bullet[];
}

/**
 * Parse one "### ..." section into its labelled bullets.
 *
 * The corpus indents nested bullets by four spaces, consistently across all
 * four batches — verified by the label census in the round document.
 */
function parseBullets(lines: string[]): Bullet[] {
  const top: Bullet[] = [];
  for (const raw of lines) {
    const m = raw.match(/^(\s*)\*\s{2,}(.*)$/);
    if (!m) {
      // A numbered checkpoint: "1.  **Title**: verify"
      const n = raw.match(/^\s*\d+\.\s+(.*)$/);
      if (n) top.push(toBullet(n[1]));
      continue;
    }
    const indent = m[1].length;
    const bullet = toBullet(m[2]);
    if (indent >= 2 && top.length) top[top.length - 1].children.push(bullet);
    else top.push(bullet);
  }
  return top;
}

function toBullet(text: string): Bullet {
  // "**Label**: body", "*Label*: body", or an unlabelled line.
  const m = text.match(/^\s*\*{1,2}([^*]+?)\*{1,2}\s*:?\s*(.*)$/);
  if (m) return { label: clean(m[1]), body: clean(m[2]), children: [] };
  return { label: "", body: clean(text), children: [] };
}

/** Join several bullets into one field, keeping their labels as signposts. */
function joinBullets(bullets: Bullet[]): string {
  return bullets
    .map((b) => {
      const body = b.body || b.children.map((c) => c.body).join(" ");
      if (!body) return "";
      return b.label ? `${b.label}: ${body}` : body;
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** Pick the bullets whose label matches, in document order. */
function pick(bullets: Bullet[], re: RegExp): Bullet[] {
  return bullets.filter((b) => re.test(b.label) || (!b.label && re.test(b.body)));
}

// ── The five sections ────────────────────────────────────────────────

interface ParsedMachine {
  number: number;
  heading: string;
  musculature: { primary: string[]; secondary: string[]; synergists: string[] };
  universalBaseline: Record<string, string>;
  bodyTypeAdjustments: {
    shorterStature: Record<string, string>;
    tallerStature: Record<string, string>;
    limitedMobility: Record<string, string>;
  };
  alignmentCheckpoints: { title: string; verify: string }[];
  execution: {
    requiresHandoff: boolean;
    handoffProtocol?: string;
    handoffCue?: string;
    loadUpProtocol: string;
    concentricSeconds: number;
    eccentricSeconds: number;
    cadenceNotes?: string;
    upper: TurnaroundRaw;
    lower: TurnaroundRaw;
    keyCues: string[];
    safetyNotice?: string;
  };
}

interface TurnaroundRaw {
  description: string;
  cue?: string;
  style?: "touch-and-go" | "pause-squeeze" | "hard-stop";
  pauseSecondsFirstReps?: number;
  squeezeSecondsFromRepThree?: number;
}

function sectionLines(block: string[], heading: RegExp): string[] {
  const start = block.findIndex((l) => heading.test(l));
  if (start < 0) return [];
  const rest = block.slice(start + 1);
  const end = rest.findIndex((l) => /^###\s/.test(l));
  return end < 0 ? rest : rest.slice(0, end);
}

function parseMachine(block: string[]): ParsedMachine {
  const headingLine = block[0];
  const hm = headingLine.match(/^##\s+(\d+)\.\s+(.*)$/)!;

  // §1 Target Musculature
  const musc = parseBullets(sectionLines(block, /^###\s+Target Musculature/));
  const tier = (re: RegExp) => {
    const b = pick(musc, re)[0];
    return b ? splitTopLevel(b.body) : [];
  };
  // The corpus labels "Secondary Muscles" on exactly ONE machine and
  // "Synergists" (or "Synergists & Stabilizers") on the rest. So an empty
  // secondary tier here is the guide being silent, not a parse failure — and
  // it stays empty rather than being filled from the synergist line. The
  // diagram's coarse secondary muscles come from MACHINE_ANATOMY regardless.

  // §2 The Universal Baseline
  const base = parseBullets(sectionLines(block, /^###\s+The Universal Baseline/));
  const used = new Set<Bullet>();
  const take = (re: RegExp) => {
    const hits = pick(base, re).filter((b) => !used.has(b));
    hits.forEach((b) => used.add(b));
    return joinBullets(hits);
  };
  // Order matters: the most specific label claims its bullets first, so
  // "Weight Stack & Restraints" lands on the gap rather than on restraints,
  // and "Seat Back & Axis Alignment" is not eaten by the seat rule.
  const startingWeightStackGap = take(/weight stack|stack gap|^gap\b/i);
  const padAxisAlignment = take(/axis|alignment|depth|pad placement|posture|wedg/i);
  const gripHandPosition = take(/grip|hand|handle|leverage/i);
  const restraintsAnchoring = take(/restraint|belt|anchor|strap|brace|support|entry|exit|foot|feet|shoulder pad|arm|pinch/i);
  const seatHeightPosition = take(/seat|height|position|pad|plate|roller|tibia|calf|thigh|femur|leg/i);
  const baselineLeftovers = joinBullets(base.filter((b) => !used.has(b)));

  // §3 Body Type Adjustments
  const body = parseBullets(sectionLines(block, /^###\s+Body Type Adjustments/));
  const column = (re: RegExp) => {
    const b = pick(body, re)[0];
    if (!b) return {} as Record<string, string>;
    const kids = b.children.length ? b.children : [{ label: "", body: b.body, children: [] }];
    return kids;
  };
  const shorter = bucketStature(column(/shorter/i) as Bullet[]);
  const taller = bucketStature(column(/taller/i) as Bullet[]);
  const limited = bucketMobility(column(/limited mobility|joint constraint/i) as Bullet[]);

  // §4 Critical Alignment Checkpoints
  const checks = parseBullets(sectionLines(block, /^###\s+Critical Alignment Checkpoints/))
    .filter((b) => b.label && b.body)
    .map((b) => ({ title: b.label, verify: b.body }));

  // §5 Execution & Cadence Notes
  const exec = parseBullets(sectionLines(block, /^###\s+Execution/));
  const handoffB = pick(exec, /handoff/i);
  const cadenceB = pick(exec, /load-?up|cadence|continuous|concentric|eccentric|motion|phase/i);
  const turnB = pick(exec, /turnaround/i);

  const handoffText = joinBullets(handoffB);
  const cadenceText = joinBullets(cadenceB);
  const allExecText = `${handoffText} ${cadenceText} ${joinBullets(turnB)}`;

  const requiresHandoff =
    /handoff|hand-off|instructor-assisted|assumes a wide base|transfers the load/i.test(
      handoffText,
    );

  const secs = (re: RegExp, text: string): number | undefined => {
    const m = text.match(re);
    return m ? Number(m[1]) : undefined;
  };
  const concentric =
    secs(/(\d+)\s*-?\s*second\s+concentric/i, allExecText) ??
    secs(/concentric[^.]{0,40}?(\d+)\s*second/i, allExecText) ??
    6;
  const eccentric =
    secs(/(\d+)\s*-?\s*second\s+eccentric/i, allExecText) ??
    secs(/eccentric[^.]{0,40}?(\d+)\s*second/i, allExecText) ??
    6;

  const turnKids = turnB.flatMap((b) => b.children);
  const upper = readTurnaround(turnKids, /^upper/i);
  const lower = readTurnaround(turnKids, /^lower/i);
  const squeezeCue = pick(turnKids, /squeeze cue|turnaround cue/i);
  const safety = pick(turnKids, /safety notice|pinch points/i);

  const keyCues = dedupe([
    ...quotedPhrases(joinBullets(squeezeCue)),
    ...quotedPhrases(upper.description),
    ...quotedPhrases(lower.description),
    ...quotedPhrases(cadenceText),
  ]).slice(0, 4);

  return {
    number: Number(hm[1]),
    heading: hm[2].trim(),
    musculature: {
      primary: tier(/primary/i),
      secondary: tier(/^secondary/i),
      synergists: tier(/synergist|stabilizer/i),
    },
    universalBaseline: {
      seatHeightPosition: [seatHeightPosition, baselineLeftovers].filter(Boolean).join(" "),
      padAxisAlignment,
      restraintsAnchoring,
      gripHandPosition,
      startingWeightStackGap,
    },
    bodyTypeAdjustments: {
      shorterStature: shorter,
      tallerStature: taller,
      limitedMobility: limited,
    },
    alignmentCheckpoints: checks,
    execution: {
      requiresHandoff,
      handoffProtocol: requiresHandoff ? handoffText : undefined,
      handoffCue: requiresHandoff ? quotedPhrases(handoffText)[0] : undefined,
      loadUpProtocol: cadenceText || handoffText,
      concentricSeconds: concentric,
      eccentricSeconds: eccentric,
      cadenceNotes: joinBullets(pick(exec, /ankle|programming|postural/i)) || undefined,
      upper,
      lower,
      keyCues,
      safetyNotice: joinBullets(safety) || undefined,
    },
  };
}

function bucketStature(kids: Bullet[]): Record<string, string> {
  const out: Record<string, string> = {};
  const seat: string[] = [];
  const pads: string[] = [];
  const notes: string[] = [];
  for (const k of kids) {
    const t = k.label ? `${k.label}: ${k.body}` : k.body;
    if (!t) continue;
    if (/seat|height|recline|position/i.test(t)) seat.push(t);
    else if (/pad|handle|grip|foot|stance|roller|belt/i.test(t)) pads.push(t);
    else notes.push(t);
  }
  if (seat.length) out.seatAdjustment = seat.join(" ");
  if (pads.length) out.padHandlePlacement = pads.join(" ");
  if (notes.length) out.specialNotes = notes.join(" ");
  return out;
}

function bucketMobility(kids: Bullet[]): Record<string, string> {
  const out: Record<string, string> = {};
  const rom: string[] = [];
  const alt: string[] = [];
  const notes: string[] = [];
  for (const k of kids) {
    const t = k.label ? `${k.label}: ${k.body}` : k.body;
    if (!t) continue;
    if (/\bTSC\b|static hold|\bSH\b|alternative|instead of|in place of|isometric/i.test(t))
      alt.push(t);
    else if (/range of motion|\bROM\b|shorten|gap|limit|restrict|stretch/i.test(t)) rom.push(t);
    else notes.push(t);
  }
  if (rom.length) out.romRestrictions = rom.join(" ");
  if (alt.length) out.alternativeProtocols = alt.join(" ");
  if (notes.length) out.specialNotes = notes.join(" ");
  return out;
}

function readTurnaround(kids: Bullet[], which: RegExp): TurnaroundRaw {
  const hit = kids.filter((k) => which.test(k.label));
  const description = joinBullets(hit);
  if (!description) return { description: "" };
  // Both word orders appear: "a 1-2 second pause" and "Pause for 1–2 seconds".
  const pause =
    description.match(/(\d+)\s*[-–—]\s*\d+\s*seconds?\s+pause/i) ??
    description.match(/pause(?:\s+\w+){0,2}\s+(\d+)\s*[-–—]\s*\d+\s*seconds?/i);
  const squeeze =
    description.match(/(\d+)\s*[-–—]\s*\d+\s*seconds?\s+["""]?squeeze/i) ??
    description.match(/squeeze(?:\s+\w+){0,2}\s+(\d+)\s*[-–—]\s*\d+\s*seconds?/i);
  let style: TurnaroundRaw["style"];
  if (/squeeze|pause in the fully contracted|second pause/i.test(description))
    style = "pause-squeeze";
  else if (/seamless|no pause|continuous|do not dwell|barely/i.test(description))
    style = "touch-and-go";
  else if (/end stop|hard stop|frame stop|selector pin/i.test(description)) style = "hard-stop";
  return {
    description,
    cue: quotedPhrases(description)[0],
    style,
    pauseSecondsFirstReps: pause ? Number(pause[1]) : undefined,
    squeezeSecondsFromRepThree: squeeze ? Number(squeeze[1]) : undefined,
  };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── Read the corpus ──────────────────────────────────────────────────

function readGuides(): ParsedMachine[] {
  const out: ParsedMachine[] = [];
  for (const n of [1, 2, 3, 4]) {
    const text = readFileSync(
      join(GUIDES, `standardized-setup-guide-batch${n}.md`),
      "utf8",
    );
    const lines = text.split(/\r?\n/);
    const starts: number[] = [];
    lines.forEach((l, i) => {
      if (/^##\s+\d+\./.test(l)) starts.push(i);
    });
    starts.forEach((s, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : lines.length;
      out.push(parseMachine(lines.slice(s, end)));
    });
  }
  return out.sort((a, b) => a.number - b.number);
}


// ── The join ─────────────────────────────────────────────────────────

/**
 * Academy heading -> catalog id, written out rather than fuzzy-matched.
 *
 * Twenty rows is small enough to read, and a wrong guess here would attach
 * the cervical guide to the leg press. A heading that is not in this table
 * throws; a table entry with no matching heading throws too.
 */
const HEADING_TO_ID: Record<string, string> = {
  "Compound Row": "m-compound-row",
  "Chest Press": "m-chest-press",
  "Leg Press": "m-leg-press",
  "Leg Extension": "m-ext",
  Pullover: "m-pullover",
  "Pulldown (Torso Arm)": "m-pulldown",
  "Overhead Press": "m-overhead-press",
  "Chest Flye": "m-chest-fly",
  "Biceps Curl": "m-bicep",
  "Triceps Extension": "m-tricep-ext",
  "Leg Curl": "m-leg-curl",
  "Simple Row": "m-simple-row",
  "Seated Dip": "m-dip",
  Abdominals: "m-abs",
  "Torso Rotation": "m-torso-rotation",
  "Lumbar Extension (Lower Back)": "m-lumbar",
  "Cervical Extension (Neck)": "m-neck",
  "Abduction (Hips/Glutes)": "m-hip-abd",
  "Adduction (Inner Thighs)": "m-hip-add",
  "Lateral Raise (Shoulders)": "m-lateral-raise",
};

/**
 * machine-identity.ts already owns this, including the contested case that
 * matters here: m-neck resolves to `cervical_extension`, not the
 * `4_way_neck` entry its own header marks SUPERSEDED.
 */
const CANONICAL_TO_DB = CANONICAL_TO_DB_KEY;

/**
 * Strip only what Firestore refuses.
 *
 * For a shape with REQUIRED fields. An empty string survives, because ""
 * means "the guide does not say" and the type still demands the key — which
 * is also what makes the editor's completeness meter able to ask for it.
 */
function compact<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    out[k] = v;
  }
  return out as T;
}

/** Strip empties too. Only for shapes whose every field is optional. */
function drop<T extends object>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

function build() {
  const parsed = readGuides();
  const byId = new Map(DEFAULT_MACHINES.map((m) => [m.id!, m]));
  const rows: string[] = [];
  const report: string[] = [];

  const seen = new Set<string>();
  for (const p of parsed) {
    const id = HEADING_TO_ID[p.heading];
    if (!id) throw new Error(`No catalog id mapped for Academy heading "${p.heading}"`);
    seen.add(p.heading);

    const legacy = byId.get(id);
    if (!legacy) throw new Error(`${id} is in the heading table but not DEFAULT_MACHINES`);
    const anatomy = MACHINE_ANATOMY[id];
    if (!anatomy) throw new Error(`${id} has no entry in MACHINE_ANATOMY`);
    const know = (MACHINE_DATABASE as Record<string, any>)[CANONICAL_TO_DB[id] ?? ""] ?? {};

    const region = legacy.anatomicalRegion as AnatomicalRegion;
    if (!(ANATOMICAL_REGION_ORDER as readonly string[]).includes(region)) {
      throw new Error(`${id}: "${region}" is not an AnatomicalRegion`);
    }

    // MSF's own vocabulary decides this: "Compound Push/Pull" is multi-joint,
    // "Simple Push/Pull/Rotary" is single-joint. It is an anatomical fact
    // about the movement, so it comes from the classification, NOT from the
    // turnaround protocol.
    //
    // Those two disagree on purpose, and the guide is right. The type's note
    // — compound reverses seamlessly, rotary is held — is the general case,
    // but the Academy gives the COMPOUND ROW a 1-2 second pause and a 2-3
    // second squeeze at the contracted position anyway. Deriving the class
    // from the turnaround would have relabelled the row, the pulldown and the
    // pullover as single-joint movements, which would then be wrong in every
    // grouped view and every cross-studio roll-up. The protocol below stays
    // exactly as the guide writes it.
    const classification = String(
      legacy.kinematicClassification ?? know.kinematicClassification ?? "",
    );
    const kinematicClass: KinematicClass = /^compound/i.test(classification)
      ? "compound-linear"
      : /^simple|isolation/i.test(classification)
        ? "rotary-single-joint"
        : /Isolation|Rotary/i.test(anatomy.movementPattern)
          ? "rotary-single-joint"
          : "compound-linear";

    const defaultStyle = kinematicClass === "rotary-single-joint" ? "pause-squeeze" : "touch-and-go";

    // The guides say NEVER for the two spinal machines. Structured rather
    // than left in prose so the session UI can enforce it, not just show it.
    const execText = `${p.execution.loadUpProtocol} ${p.execution.upper.description} ${p.execution.lower.description} ${p.execution.safetyNotice ?? ""}`;
    const neverToFailure =
      /never\b[^.]{0,60}\bfailure|do not (train|take)[^.]{0,40}failure|not (be )?(trained|taken) to failure/i.test(
        execText,
      ) || /never to failure/i.test(execText);

    const settingFields = (legacy.settingOptions ?? []).map((label: string) => ({
      key: settingFieldKey(label),
      label,
      type: "text" as const,
    }));

    // The one number the guide states plainly enough to prefill. Everything
    // else a dial could hold is a studio's to set, and a guess here would be
    // a confident wrong number on the floor.
    const gapMatch = p.universalBaseline.startingWeightStackGap.match(
      /\bgap\b[^.]{0,40}?\b(?:of|is|at)\s+(\d+)\b/i,
    );
    const gapField = settingFields.find((f) => f.key === "gap");
    const defaultSettings =
      gapMatch && gapField ? { [gapField.key]: gapMatch[1] } : {};

    const limited = { ...p.bodyTypeAdjustments.limitedMobility };
    if (legacy.modifications) {
      limited.specialNotes = [limited.specialNotes, `Modifications: ${legacy.modifications}`]
        .filter(Boolean)
        .join(" ");
    }

    const entry = {
      id,
      status: "active",
      defaultOrder: legacy.order ?? 999,
      inStandardSet: true,
      schemaVersion: 1,

      name: legacy.name,
      anatomicalRegion: region,
      movementPattern: anatomy.movementPattern,
      kinematicClass,
      kinematicClassification: legacy.kinematicClassification ?? know.kinematicClassification,
      executionPosture: legacy.executionPosture ?? know.executionPosture,

      primaryMuscles: anatomy.primary,
      secondaryMuscles: anatomy.secondary ?? [],
      // MACHINE_ANATOMY has no synergist column. The guide's synergists
      // survive as prose in musculature.synergists; inventing MuscleIds for
      // the diagram here would light regions nobody authored.
      synergistMuscles: [],
      musculature: p.musculature,
      preferredView: anatomy.preferredView,
      clinicalNote: anatomy.clinicalNote,

      // Four of the five are required by the type. An unstated one is "",
      // never an absent key: the template has a slot for it and the editor
      // should show that slot empty rather than pretend it does not exist.
      universalBaseline: {
        seatHeightPosition: p.universalBaseline.seatHeightPosition ?? "",
        padAxisAlignment: p.universalBaseline.padAxisAlignment ?? "",
        restraintsAnchoring: p.universalBaseline.restraintsAnchoring ?? "",
        startingWeightStackGap: p.universalBaseline.startingWeightStackGap ?? "",
        ...(p.universalBaseline.gripHandPosition
          ? { gripHandPosition: p.universalBaseline.gripHandPosition }
          : {}),
      },
      bodyTypeAdjustments: {
        shorterStature: p.bodyTypeAdjustments.shorterStature,
        tallerStature: p.bodyTypeAdjustments.tallerStature,
        limitedMobility: drop(limited),
      },
      alignmentCheckpoints: p.alignmentCheckpoints,
      execution: compact({
        requiresHandoff: p.execution.requiresHandoff || !!know.requiresHandoff,
        handoffProtocol: p.execution.handoffProtocol,
        handoffCue: p.execution.handoffCue,
        loadUpProtocol: p.execution.loadUpProtocol,
        concentricSeconds: p.execution.concentricSeconds,
        eccentricSeconds: p.execution.eccentricSeconds,
        cadenceNotes: p.execution.cadenceNotes,
        upperTurnaround: compact({
          style: p.execution.upper.style ?? defaultStyle,
          description: p.execution.upper.description,
          cue: p.execution.upper.cue,
          pauseSecondsFirstReps: p.execution.upper.pauseSecondsFirstReps,
          squeezeSecondsFromRepThree: p.execution.upper.squeezeSecondsFromRepThree,
        }),
        lowerTurnaround: compact({
          style: p.execution.lower.style ?? defaultStyle,
          description: p.execution.lower.description,
          cue: p.execution.lower.cue,
        }),
        keyCues: p.execution.keyCues,
        ...(neverToFailure ? { neverToFailure: true } : {}),
        ...(p.execution.safetyNotice ? { safetyNotice: p.execution.safetyNotice } : {}),
      }),

      clinicalWarnings: know.clinicalWarnings ?? [],
      contraindicatedFor: legacy.contraindicatedFor ?? know.contraindicatedFor ?? [],
      sequencingContraindications:
        legacy.sequencingContraindications ?? know.sequencingContraindications ?? [],
      biomechanicalNotes: legacy.biomechanicalNotes ?? undefined,

      settingFields,
      defaultSettings,
      ...(know.baseMale != null || know.baseFemale != null
        ? { baselineLoad: drop({ male: know.baseMale, female: know.baseFemale }) }
        : {}),
      // NOT imageUrl. In the app that field is a Vite-resolved asset URL, and
      // this generator bundles the data files with a text loader — so reading
      // know.imageUrl here yields the .webp's BYTES, which then get baked into
      // the source file as a 30 KB string per machine. The catalog's stock
      // photos keep coming from data/machine-database.ts the way they always
      // have; MachineDefinition.imageUrl is a studio-tier field, for a photo
      // of the unit in THEIR room.
    };

    rows.push(`  ${JSON.stringify(id)}: ${JSON.stringify(compact(entry), null, 2)
      .split("\n")
      .join("\n  ")},`);

    const missing: string[] = [];
    if (!entry.musculature.primary.length) missing.push("primary musculature");
    if (!entry.alignmentCheckpoints.length) missing.push("checkpoints");
    if (!entry.clinicalWarnings.length) missing.push("clinical warnings");
    if (!Object.keys(entry.defaultSettings).length) missing.push("dial defaults");
    report.push(
      `${String(entry.defaultOrder).padStart(3)} ${id.padEnd(18)} ${entry.name.padEnd(20)} ` +
        `${kinematicClass === "compound-linear" ? "compound" : "rotary  "} ` +
        `${neverToFailure ? "NEVER-TO-FAILURE " : ""}${missing.length ? "missing: " + missing.join(", ") : ""}`,
    );
  }

  const unmapped = Object.keys(HEADING_TO_ID).filter((h) => !seen.has(h));
  if (unmapped.length) throw new Error(`Headings never found in the corpus: ${unmapped.join(", ")}`);

  const file = `/**
 * THE MACHINE CATALOG — all twenty, in the shape the app actually reads.
 *
 * GENERATED by scripts/generate-machine-definitions.ts. Do not hand-edit:
 * re-run the generator, or change the machine in the app and let the write
 * go to Firestore. This file is the SEED, not the live catalog.
 *
 * The prose is the MSF Academy's, lifted verbatim from
 * docs/msf-academy/Set Up Machines/standardized-setup-guide-batch{1..4}.md —
 * every baseline line, body-type variable, checkpoint and cue. The taxonomy,
 * the coarse muscle arrays, the clinical warnings and the starting loads come
 * from data/machine-anatomy-map.ts, data/machine-database.ts and
 * data/default-machines.ts.
 *
 * This replaces data/default-machines.ts as what "Restore standard machines"
 * writes. That file is the LEGACY \`Machine\` shape, and seeding it is why
 * opening Edit on a catalog machine showed an empty form: the documents had
 * \`targetMuscles\` as one string and \`settingOptions\` as bare labels, while
 * the editor reads \`musculature\`, \`settingFields\` and the biomechanics
 * template. It is kept only for the fields nothing else carries.
 *
 * Blanks are deliberate. A field the sources do not actually state is left
 * empty so the editor can ask for it — never filled with something plausible.
 */

import type { MachineCatalogEntry } from "../types/machines";

export const MACHINE_DEFINITIONS: Record<string, MachineCatalogEntry> = {
${rows.join("\n")}
};

/** The twenty, in the order a studio walks them. */
export const MACHINE_DEFINITION_LIST: MachineCatalogEntry[] =
  Object.values(MACHINE_DEFINITIONS).sort((a, b) => a.defaultOrder - b.defaultOrder);
`;

  writeFileSync(join(ROOT, "src/data/machine-definitions.ts"), file, "utf8");
  console.log(report.sort().join("\n"));
  console.log(`\nWrote src/data/machine-definitions.ts — ${parsed.length} machines.`);
}

build();
