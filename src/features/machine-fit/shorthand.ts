/**
 * MACHINE FIT — reading FileMaker's shorthand.
 *
 * FileMaker let every chart spell a machine's settings its own way. AJ's
 * examples, all for the SAME Compound Row:
 *
 *     Gap:4 Seat:3
 *     G:4,S:3
 *     Gap:6, Handles:in, seat: up, Chest:3 PILLOW
 *     GAP:4, S:4 C:4 H:W
 *
 * and the grid itself prints them a fourth way — "S- 8", "Pads- 1", "Gap 9",
 * "S- 3.75", "Pad- D". Journey does not work like that: a machine has ONE list
 * of setting fields and every client uses it. This module is the bridge. Give
 * it a line of shorthand and the machine's fields and it says which field
 * each piece belongs to.
 *
 * It exists for two reasons, and they are the two ways the migration can go:
 *   · If the export never arrives, a trainer copying a chart can type the
 *     line as they read it (quick entry's "abc" box) instead of finding four
 *     separate inputs.
 *   · If it does arrive, the importer hands every settings string through the
 *     same function, and gets the same answers a trainer would have typed.
 *
 * THE RULE THAT MATTERS: NOTHING IS THROWN AWAY. Anything it cannot place —
 * "PILLOW", a label no field answers to, a second value for a field already
 * filled — comes back in `leftovers` in its original spelling, and the screen
 * keeps it as a note on the machine. It would rather place too little than
 * guess: a wrong seat is worse than a seat somebody has to type.
 *
 * Replaces, for this path, `parseMachineSettings` in src/lib/utils.ts — five
 * hard-coded letters that did not know which machine they were reading
 * ("C:4" had nowhere to go, and "Gap: 4" with a space lost its value).
 *
 * Pure. No regex lookbehind (older iPadOS Safari throws on parse).
 */

export interface ShorthandField {
  /** The field's STORAGE key — what clientMachineSettings.settings is keyed by for this machine. */
  key: string;
  label: string;
  type: "enum" | "number" | "text";
  options?: readonly string[] | null;
  /** Extra names a studio uses for this field. */
  aliases?: readonly string[] | null;
}

export interface ShorthandResult {
  /** Storage key → the value as a trainer would have typed it. */
  values: Record<string, string>;
  /** "WT:120", "Weight 85 lbs" — the load, when the line carries one. Not a setting field. */
  weight?: string;
  /** Everything that could not be placed, original spelling, original order. */
  leftovers: string[];
  /** Plain sentences about anything it was unsure of. */
  notes: string[];
}

/**
 * What one letter means on a Max Strength chart when more than one field
 * could claim it. Only ever a tie-break: a machine with no seat never gets a
 * seat because someone wrote "S".
 */
const LETTER_CONVENTION: Record<string, string[]> = {
  s: ["seat"],
  g: ["gap"],
  b: ["back"],
  h: ["handle", "hand"],
  a: ["arm", "ankle"],
  c: ["chest"],
  p: ["pad"],
  r: ["rom", "range"],
  f: ["foot", "feet"],
  t: ["thigh"],
  l: ["leg", "lever"],
};

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const singular = (s: string): string => (s.length > 3 && s.endsWith("s") ? s.slice(0, -1) : s);

interface FieldNames {
  field: ShorthandField;
  /** Every full spelling: label, key, aliases — normalised, singular. */
  names: string[];
  /** Initials of multi-word names ("bp" for Back Pad). */
  initials: string[];
}

function namesOf(field: ShorthandField): FieldNames {
  const raw = [field.label, field.key, ...(field.aliases ?? [])].filter(Boolean);
  const names = new Set<string>();
  const initials = new Set<string>();
  for (const r of raw) {
    const parts = words(r);
    if (parts.length === 0) continue;
    names.add(singular(parts.join("")));
    if (parts.length > 1) {
      initials.add(parts.map((p) => p[0]).join(""));
      // "Chest Pad" also answers to "chest": the first word is how charts say it.
      names.add(singular(parts[0]));
    }
  }
  return { field, names: [...names], initials: [...initials] };
}

/**
 * Which field a label means, or null. Scores, best first: the whole name (4),
 * initials of a multi-word name (3), a prefix of two letters or more (2), a
 * single letter (1). `strict` refuses the weakest two, for labels that came
 * with no separator — "seat 5" is a label, "up 5" is not.
 */
export function matchField(
  label: string,
  fields: readonly ShorthandField[],
  strict = false,
): { field: ShorthandField | null; ambiguous: boolean } {
  const token = singular(norm(label));
  if (!token) return { field: null, ambiguous: false };

  let bestScore = 0;
  let best: FieldNames[] = [];
  for (const candidate of fields.map(namesOf)) {
    let score = 0;
    if (candidate.names.includes(token)) score = 4;
    else if (candidate.initials.includes(token)) score = 3;
    else if (token.length >= 2 && candidate.names.some((n) => n.startsWith(token))) score = 2;
    else if (token.length === 1 && candidate.names.some((n) => n.startsWith(token))) score = 1;
    if (score === 0) continue;
    if (score > bestScore) {
      bestScore = score;
      best = [candidate];
    } else if (score === bestScore) best.push(candidate);
  }

  if (best.length === 0) return { field: null, ambiguous: false };
  if (strict && bestScore < 3 && !(bestScore === 2 && token.length >= 3)) return { field: null, ambiguous: false };
  if (best.length === 1) return { field: best[0].field, ambiguous: false };

  // More than one field could be meant. The chart convention settles a letter…
  const wanted = LETTER_CONVENTION[token[0]] ?? [];
  const conventional = best.filter((c) => c.names.some((n) => wanted.some((w) => n.startsWith(w))));
  if (conventional.length === 1) return { field: conventional[0].field, ambiguous: false };
  // …and otherwise it is honestly ambiguous: say so rather than pick.
  return { field: null, ambiguous: true };
}

/** A raw value, fitted to the field: an option's own spelling, a plain number, or the text as typed. */
export function fitValue(field: ShorthandField, raw: string): { value: string; note?: string } {
  const text = raw.trim();
  const options = field.options ?? [];
  if (field.type === "enum" && options.length > 0) {
    const lower = text.toLowerCase();
    const exact = options.find((o) => o.toLowerCase() === lower);
    if (exact) return { value: exact };
    const sameNumber = options.find((o) => o.trim() !== "" && Number(o) === Number(text) && !Number.isNaN(Number(text)));
    if (sameNumber) return { value: sameNumber };
    const starts = options.filter((o) => o.toLowerCase().startsWith(lower));
    if (starts.length === 1) return { value: starts[0] };
    return { value: text, note: `${field.label}: "${text}" is not one of ${options.join(" / ")}` };
  }
  if (field.type === "number") {
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return { value: text };
    return { value: text, note: `${field.label}: "${text}" is not a number` };
  }
  return { value: text.length === 1 ? text.toUpperCase() : text };
}

const SEP = ":";

/** Split a line into chunks (commas, semicolons, new lines) of words, with every label separator as ":". */
function tokenize(text: string): string[][] {
  const cleaned = text
    .replace(/[\u2013\u2014]/g, "-")
    // A colon or equals sign is always a separator.
    .replace(/\s*[:=]\s*/g, ` ${SEP} `)
    // "S- 8", "Pad-D", "B-P2", and FileMaker's empty "Gap-": a dash straight
    // after a letter. "3-5" (digits before the dash) is a value and is left alone.
    .replace(/([A-Za-z])\s*-\s*(?=[A-Za-z0-9])/g, `$1 ${SEP} `)
    .replace(/([A-Za-z])-(?=\s|$)/g, `$1 ${SEP} `);
  return cleaned
    .split(/[,;\n\r|]+/)
    .map((chunk) => chunk.trim().split(/\s+/).filter(Boolean))
    .filter((chunk) => chunk.length > 0);
}

const COMPACT = /^([A-Za-z]{1,3})(\d+(?:\.\d+)?)$/;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
/** FileMaker prints "WEIG" beside every machine's settings. It is the load, not a dial. */
const WEIGHT_LABEL = /^(weig|weigh|weight|wt|lb|lbs)$/i;

/** Does this look like something a setting is SET TO, rather than another label or a stray word? */
function looksLikeValue(token: string, field: ShorthandField): boolean {
  if (NUMBER.test(token)) return true;
  const lower = token.toLowerCase();
  if ((field.options ?? []).some((o) => o.toLowerCase().startsWith(lower))) return true;
  return token.length <= 4;
}

export function parseShorthand(text: string, fields: readonly ShorthandField[]): ShorthandResult {
  const values: Record<string, string> = {};
  const leftovers: string[] = [];
  const notes: string[] = [];

  let weight: string | undefined;

  const place = (label: string, raw: string, strict: boolean): boolean => {
    if (WEIGHT_LABEL.test(label.trim()) && !matchField(label, fields, true).field) {
      if (!NUMBER.test(raw) || weight !== undefined) return false;
      weight = raw;
      return true;
    }
    const { field, ambiguous } = matchField(label, fields, strict);
    if (!field) {
      if (ambiguous) notes.push(`"${label}" could mean more than one setting on this machine`);
      return false;
    }
    if (values[field.key] !== undefined) {
      notes.push(`${field.label} was given twice; kept ${values[field.key]}`);
      return false;
    }
    const fitted = fitValue(field, raw);
    values[field.key] = fitted.value;
    if (fitted.note) notes.push(fitted.note);
    return true;
  };

  for (const chunk of tokenize(text || "")) {
    let i = 0;
    while (i < chunk.length) {
      const w = chunk[i];
      if (w === SEP) {
        i += 1;
        continue;
      }

      // "Back Pad : 6" / "Seat : 5" — an explicit separator.
      const twoWordLabel = chunk[i + 2] === SEP && chunk[i + 1] !== SEP;
      const oneWordLabel = chunk[i + 1] === SEP;
      if (twoWordLabel || oneWordLabel) {
        const label = twoWordLabel ? `${w} ${chunk[i + 1]}` : w;
        const at = i + (twoWordLabel ? 3 : 2);
        const value = chunk[at];
        // FileMaker prints empty fields ("Gap- "): a label whose "value" is
        // missing, or is itself the next label, is simply not set.
        // The same goes for a "value" that is really the next printed label:
        // "S-  Gap 9" is an empty seat and a gap, and "Gap- WEIG" an empty gap.
        const empty =
          value === undefined ||
          value === SEP ||
          chunk[at + 1] === SEP ||
          WEIGHT_LABEL.test(value) ||
          (chunk[at + 1] !== undefined && matchField(value, fields, true).field !== null);
        if (empty) {
          i = at;
          continue;
        }
        // "WT: 120 lbs" — the unit is not a leftover.
        if (WEIGHT_LABEL.test(label) && /^lbs?$/i.test(chunk[at + 1] ?? "")) chunk.splice(at + 1, 1);
        if (!place(label, value, false)) leftovers.push(`${label}: ${value}`);
        i = at + 1;
        continue;
      }

      // "S4", "G2", "BP2", "S3.75" — letter and number run together.
      const compact = COMPACT.exec(w);
      if (compact && matchField(compact[1], fields).field) {
        if (!place(compact[1], compact[2], false)) leftovers.push(w);
        i += 1;
        continue;
      }

      // "Back Pad 6", then "Seat 5" / "seat up" — a label with no separator.
      const next = chunk[i + 1];
      const afterNext = chunk[i + 2];
      if (next !== undefined && afterNext !== undefined && afterNext !== SEP) {
        const two = matchField(`${w} ${next}`, fields, true).field;
        if (two && looksLikeValue(afterNext, two)) {
          if (!place(`${w} ${next}`, afterNext, true)) leftovers.push(`${w} ${next} ${afterNext}`);
          i += 3;
          continue;
        }
      }
      if (next !== undefined && next !== SEP) {
        // The grid's own form is "S  8": one letter, a space, a number. A
        // single letter is only trusted as a label when a NUMBER follows it.
        const loose = w.length <= 2 && NUMBER.test(next);
        const one = matchField(w, fields, !loose).field;
        if (one && looksLikeValue(next, one)) {
          if (!place(w, next, !loose)) leftovers.push(`${w} ${next}`);
          i += 2;
          continue;
        }
        if (WEIGHT_LABEL.test(w) && NUMBER.test(next) && place(w, next, true)) {
          i += /^lbs?$/i.test(afterNext ?? "") ? 3 : 2;
          continue;
        }
      }

      // FileMaker's empty "WEIG" label is furniture, not something to keep.
      if (!WEIGHT_LABEL.test(w)) leftovers.push(w);
      i += 1;
    }
  }

  return weight === undefined ? { values, leftovers, notes } : { values, weight, leftovers, notes };
}

/* ------------------------------------------------------------------ *
 * A whole chart at once
 * ------------------------------------------------------------------ */

/**
 * How the FileMaker grid names the twenty standard machines (the screenshot
 * in the round document), beside the names Journey uses. Only the standard
 * set: a studio's own machine is found by its own name.
 */
export const FILEMAKER_MACHINE_NAMES: Record<string, string[]> = {
  "m-neck": ["cx", "4 way neck", "four way neck", "neck"],
  "m-hip-add": ["hip add", "hip adduction", "adduction", "add"],
  "m-hip-abd": ["hip abd", "hip abduction", "abduction", "abd"],
  "m-leg-curl": ["leg curl", "curl"],
  "m-ext": ["leg ext", "leg extension", "extension"],
  "m-leg-press": ["leg press"],
  "m-pulldown": ["pulldown", "pull down", "lat pulldown"],
  "m-chest-press": ["chest press"],
  "m-compound-row": ["comp row", "compound row", "comp. row"],
  "m-overhead-press": ["overhead", "overhead press", "ohp"],
  "m-pullover": ["pullover", "pull over", "seated pullover"],
  "m-dip": ["seated dip", "dip"],
  "m-tricep-ext": ["tricep ext", "tricep extension", "triceps", "tricep"],
  "m-bicep": ["bicep", "biceps", "bicep curl"],
  "m-chest-fly": ["chest fly", "pec fly", "fly"],
  "m-simple-row": ["simple row"],
  "m-lateral-raise": ["lateral raise", "lat raise"],
  "m-lumbar": ["lumbar", "lumbar extension", "low back"],
  "m-torso-rotation": ["torso rotation", "torso", "rotary torso"],
  "m-abs": ["abs", "abdominal", "abdominals", "seated abdominals"],
};

export interface ShorthandMachine {
  id: string;
  name: string;
  fields: readonly ShorthandField[];
}

export interface ShorthandBlockLine {
  line: string;
  machineId: string | null;
  result: ShorthandResult | null;
}

/** The machine a line starts with — the LONGEST name that matches wins ("leg ext" before "leg"). */
export function matchMachineLine(
  line: string,
  machines: readonly ShorthandMachine[],
): { machine: ShorthandMachine; rest: string } | null {
  const lineWords = words(line);
  let best: { machine: ShorthandMachine; used: number } | null = null;
  for (const machine of machines) {
    const names = [machine.name, ...(FILEMAKER_MACHINE_NAMES[machine.id] ?? [])];
    for (const name of names) {
      const nameWords = words(name);
      if (nameWords.length === 0 || nameWords.length > lineWords.length) continue;
      if (!nameWords.every((w, i) => lineWords[i] === w)) continue;
      if (!best || nameWords.length > best.used) best = { machine, used: nameWords.length };
    }
  }
  if (!best) return null;

  // Cut the matched words off the ORIGINAL line, so the rest keeps its punctuation.
  let at = 0;
  let seen = 0;
  while (at < line.length && seen < best.used) {
    while (at < line.length && !/[A-Za-z0-9]/.test(line[at])) at += 1;
    while (at < line.length && /[A-Za-z0-9]/.test(line[at])) at += 1;
    seen += 1;
  }
  const rest = line.slice(at).replace(/^[\s.:\-\u2013\u2014]+/, "");
  return { machine: best.machine, rest };
}

/** One machine per line: "Comp. Row: G:4, S:3". Lines that name no machine come back unplaced. */
export function parseShorthandBlock(text: string, machines: readonly ShorthandMachine[]): ShorthandBlockLine[] {
  return (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const hit = matchMachineLine(line, machines);
      if (!hit) return { line, machineId: null, result: null };
      return { line, machineId: hit.machine.id, result: parseShorthand(hit.rest, hit.machine.fields) };
    });
}
