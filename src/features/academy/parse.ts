/**
 * TURNING THE ACADEMY CORPUS INTO SOMETHING A SCREEN CAN RENDER.
 *
 * Round: MSF Topics, Sep 2026.
 *
 * `docs/msf-academy/` holds 214 plain-text files converted out of Google Docs.
 * The README's closing line was, until this round, the whole problem:
 * "Nothing reads these files at runtime — they exist for humans and for agents
 * doing research before a change." 283,000 words of the studio's own
 * methodology, committed to the repo, and no trainer could read a line of it
 * from the app.
 *
 * WHAT THE TEXT ACTUALLY LOOKS LIKE
 * ---------------------------------
 * It cannot be rendered raw, for four reasons that are not obvious:
 *
 *   1. ONE file in the whole corpus contains a blank line. Paragraph breaks
 *      are implicit — one paragraph per physical line, some of them 1,200
 *      characters long. Rendering the file as-is gives a wall of text.
 *   2. There is no heading markup. No `#`, no underlines, no enforced case.
 *      A heading is simply a short line, and the only reliable signal is
 *      length plus the absence of sentence punctuation.
 *   3. Bullets come in three regimes — a leading `•`, a leading `●`, or
 *      nothing at all, where a list is just consecutive short lines.
 *   4. Every file is CRLF, and one folder was converted by a different tool
 *      that hard-wrapped at 80 columns, so its paragraphs are split
 *      mid-sentence across lines and must be rejoined — while the other
 *      folders must NOT be, or every paragraph would run together.
 *
 * WHY A CLASSIFIER RATHER THAN A CONVERTER
 * ----------------------------------------
 * There is no markup to convert. Every function here is a guess about intent
 * made from shape, so each one is written to fail toward BODY: an essay
 * paragraph mistakenly shown as a heading is jarring and obviously wrong,
 * while a heading shown as body is merely plain. Failing the safe way is the
 * whole design.
 */

/** One renderable piece of a document. */
export type BlockKind = "heading" | "subheading" | "bullet" | "body";

export interface Block {
  kind: BlockKind;
  text: string;
}

export interface ParsedDoc {
  /** The document's own title — usually its first line. */
  title: string;
  /** The module name the file opens with, when it has one. */
  moduleLabel?: string;
  blocks: Block[];
  words: number;
  /** Minutes, at 200 words a minute, floor of one. */
  readingMinutes: number;
}

/** Longer than this and a line is prose, whatever else it looks like. */
export const MAX_HEADING_CHARS = 70;
/** Words a minute, for the "4 min read" label. */
export const WORDS_PER_MINUTE = 200;

const BULLET_PREFIX = /^\s*[•●▪·]\s*/;

/** Lines the .docx conversion left behind that carry no meaning. */
const NOISE = [
  /^pg\s*\d+\s*of\s*\d+$/i,
  /^page\s*\d+$/i,
  /^\d+$/,
];

/**
 * Normalise the raw bytes of one file.
 *
 * The double space after a full stop is a .docx legacy that appears corpus
 * wide; left alone it shows up as a visible gap on a narrow screen.
 */
export function normalise(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/ /g, " ")
    .replace(/([.!?]) {2,}/g, "$1 ")
    .trim();
}

/**
 * Rejoin a file that was hard-wrapped at a fixed column.
 *
 * Detected rather than configured: if most lines land in a narrow band just
 * under a limit AND the file has many lines, it was wrapped by a tool. Doing
 * this by folder name would break the moment a folder is renamed, and doing it
 * to the whole corpus would run every paragraph of every other file together.
 *
 * A line is only joined to the next when it does not end a sentence, so a
 * genuine short line — a heading, a list item — survives.
 */
export function looksHardWrapped(lines: string[]): boolean {
  const long = lines.filter((l) => l.trim().length > 40);
  if (long.length < 8) return false;
  const inBand = long.filter((l) => l.length >= 60 && l.length <= 100);
  return inBand.length / long.length > 0.8;
}

export function unwrap(lines: string[]): string[] {
  const out: string[] = [];
  let buffer = "";
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const continues =
      buffer !== "" &&
      !/[.!?:;]$/.test(buffer) &&
      !BULLET_PREFIX.test(t) &&
      t[0] === t[0].toLowerCase();
    if (continues) {
      buffer = `${buffer} ${t}`;
      continue;
    }
    if (buffer) out.push(buffer);
    buffer = t;
  }
  if (buffer) out.push(buffer);
  return out;
}

const isNoise = (line: string) => NOISE.some((re) => re.test(line.trim()));

/**
 * Is this line a heading?
 *
 * Short, no terminal punctuation, and not a sentence. ALL-CAPS is treated as a
 * stronger signal because the corpus uses it for in-file section breaks
 * (`POSTURE`, `LOAD UP:`), and those are the breaks worth showing.
 */
export function classify(line: string, index: number): BlockKind {
  const t = line.trim();
  if (BULLET_PREFIX.test(line)) return "bullet";
  if (t.length > MAX_HEADING_CHARS) return "body";
  if (/[.!?,;]$/.test(t)) return "body";

  const letters = t.replace(/[^A-Za-z]/g, "");
  const isShouted = letters.length >= 3 && letters === letters.toUpperCase();
  if (isShouted) return "heading";

  // A short line that reads like a sentence is a sentence. "We do not." is
  // eleven characters and is not a heading.
  const words = t.split(/\s+/).length;
  if (words > 10) return "body";

  // The first two lines are the module label and the document title, handled
  // by the caller; anything else short and unpunctuated is a section break.
  return index <= 1 ? "heading" : "subheading";
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Parse one Academy file.
 *
 * `moduleLabel` is the first line when the document repeats its module name
 * there — most of modules 1 to 7 do — because showing "Exercise Performance /
 * Turnaround Technique" is more use than showing the filename twice. Files
 * that open straight into their own title simply have no label.
 */
export function parseDoc(raw: string, fallbackTitle: string): ParsedDoc {
  const text = normalise(raw);
  let lines = text.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  if (looksHardWrapped(lines)) lines = unwrap(lines);
  lines = lines.filter((l) => !isNoise(l));

  if (lines.length === 0) {
    return { title: fallbackTitle, blocks: [], words: 0, readingMinutes: 1 };
  }

  let moduleLabel: string | undefined;
  let title = lines[0].trim();
  let rest = lines.slice(1);

  // Two short opening lines means module name then document title.
  if (
    lines.length > 2 &&
    lines[0].trim().length <= MAX_HEADING_CHARS &&
    lines[1].trim().length <= MAX_HEADING_CHARS &&
    !/[.!?]$/.test(lines[1].trim())
  ) {
    moduleLabel = lines[0].trim();
    title = lines[1].trim();
    rest = lines.slice(2);
  }

  const blocks: Block[] = rest.map((line, i) => ({
    kind: classify(line, i + 2),
    text: line.replace(BULLET_PREFIX, "").trim(),
  }));

  const words = countWords(rest.join(" "));
  return {
    title,
    moduleLabel,
    blocks,
    words,
    readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
  };
}

/* ------------------------------------------------------------------ *
 * THE QUICK REFERENCE CARDS
 * ------------------------------------------------------------------ */

/**
 * The 18 Quick Reference Guides share one skeleton, which makes them the only
 * part of the corpus that can be rendered as real structure rather than as
 * classified prose. They are also the part a trainer wants at the machine.
 */
export const QRG_SECTIONS = [
  "Target Muscles",
  "Synergists",
  "Considerations for Setup",
  "Posture / Get Set",
  "Execution, Instruction, and Turnarounds",
  "Notes",
] as const;

export interface QuickReference {
  title: string;
  /** Section heading -> its lines, in order. */
  sections: { heading: string; items: string[] }[];
}

export function parseQuickReference(raw: string, fallbackTitle: string): QuickReference {
  const lines = normalise(raw)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const title = lines[0] ?? fallbackTitle;
  const sections: QuickReference["sections"] = [];
  let current: { heading: string; items: string[] } | null = null;

  for (const line of lines.slice(1)) {
    if (isNoise(line)) continue;
    const bare = line.replace(BULLET_PREFIX, "").trim();
    const isSection =
      !BULLET_PREFIX.test(line) &&
      bare.length <= MAX_HEADING_CHARS &&
      !/[.!?,]$/.test(bare);
    if (isSection) {
      current = { heading: bare, items: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      // The standard preamble sentence, before any heading. Kept under a
      // heading of its own rather than dropped, so nothing goes missing.
      current = { heading: "About this card", items: [] };
      sections.push(current);
    }
    current.items.push(bare);
  }

  return { title, sections };
}

/* ------------------------------------------------------------------ *
 * THE GLOSSARY
 * ------------------------------------------------------------------ */

export interface GlossaryEntry {
  term: string;
  definition: string;
}

/**
 * The glossary is 56 lines of `Term - definition`, which is a gift: it is the
 * one file in the corpus with machine-readable structure already in it.
 *
 * Split on the FIRST hyphen only, and only when what precedes it is short
 * enough to be a term — definitions contain plenty of their own dashes, and
 * splitting on the last would produce nonsense.
 */
export function parseGlossary(raw: string): GlossaryEntry[] {
  return normalise(raw)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.{2,60}?)\s+[-–—]\s+(.+)$/);
      if (!m) return null;
      return { term: m[1].trim(), definition: m[2].trim() };
    })
    .filter((e): e is GlossaryEntry => e !== null);
}

/* ------------------------------------------------------------------ *
 * TITLES
 * ------------------------------------------------------------------ */

/** Filename typos that would otherwise surface in the UI. */
const TITLE_FIXES: [RegExp, string][] = [
  [/Restistance/g, "Resistance"],
  [/Substitues/g, "Substitutes"],
  [/Consclusion/g, "Conclusion"],
];

/**
 * A readable title from a filename.
 *
 * The corpus repeats the module name in most filenames ("Academy - Exercise
 * Performance 6 - Turnaround Technique"), which is useful in a folder and
 * noise in a list that is already grouped by module.
 */
export function titleFromFilename(name: string): string {
  let t = name.replace(/\.txt$/i, "").replace(/_/g, "");
  t = t.replace(/^Academy\s*[-–]\s*/i, "");
  t = t.replace(/^(.*?)\s+\d+\s*[-–]\s*/, "");
  for (const [re, to] of TITLE_FIXES) t = t.replace(re, to);
  return t.trim();
}

/**
 * The number in a filename, for ordering.
 *
 * Lexicographic sort puts "Exercise Performance 10" second, between 1 and 2 —
 * and the Benefits module's first file is misspelled "Restistance", so it
 * sorts last. Both are why ordering reads a number rather than a string.
 */
export function orderFromFilename(name: string): number {
  const m = name.match(/\s(\d+)\s*[-–]/);
  return m ? parseInt(m[1], 10) : 999;
}
