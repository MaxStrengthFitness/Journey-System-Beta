/**
 * Turn docs/msf-academy/ into the JSON the MSF Topics screen ships.
 *
 * Round: MSF Topics, Sep 2026.
 *
 *   npx tsx scripts/build-academy-content.ts
 *
 * WHY GENERATED AND COMMITTED, RATHER THAN READ AT RUNTIME
 * -------------------------------------------------------
 * Three reasons, in order of weight.
 *
 * The corpus has no markup, so turning it into blocks is a classifier, not a
 * conversion (see features/academy/parse.ts). Running that on 283,000 words on
 * an iPad, every time someone opens the screen, would be slow and would put
 * the guesswork somewhere it cannot be reviewed. Generating it once means the
 * output is a diff a person can read.
 *
 * The three near-identical copies of the equipment tree have to be
 * deduplicated, and picking a canonical source is a decision — it belongs in a
 * script with a comment, not in a runtime loop.
 *
 * And the app should ship what it needs. This writes one file per module so
 * the screen can import a module's worth at a time rather than the whole
 * curriculum.
 *
 * The README's "Refreshing" section covers re-exporting the Drive folder.
 * Re-run this afterwards; the diff shows what changed.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  countWords,
  orderFromFilename,
  parseDoc,
  parseGlossary,
  parseQuickReference,
  titleFromFilename,
} from "../src/features/academy/parse";

const ROOT = join(process.cwd(), "docs", "msf-academy");
const OUT = join(process.cwd(), "src", "features", "academy", "content");

/**
 * The curriculum, in the order a trainer should meet it.
 *
 * Written out rather than discovered, because the folder names do not sort
 * into the teaching order and two of them are actively misleading: the
 * top-level `Academy 2/` is NOT module 2 (it is the Mastery Series), and
 * module 6 is split across two directories with the same name at different
 * depths — the README's code-mapping table points at the top-level one.
 */
const MODULES: {
  id: string;
  n: number;
  title: string;
  blurb: string;
  dirs: string[];
}[] = [
  {
    id: "intro",
    n: 1,
    title: "Introduction",
    blurb: "How to use the manual, where MSF came from, and the vocabulary you are expected to use.",
    dirs: ["Academy/Academy 1 - Introduction"],
  },
  {
    id: "benefits",
    n: 2,
    title: "Benefits of Resistance Training",
    blurb: "Why properly performed resistance training covers every factor of fitness on its own.",
    dirs: ["Academy/Academy 2 - Benefits of Resistance Training"],
  },
  {
    id: "principles",
    n: 3,
    title: "Basic Principles of Exercise",
    blurb: "Overload, intensity, volume, frequency — and the stimulating reps model.",
    dirs: ["Academy/Academy 3 - Basic Principles of Exercise"],
  },
  {
    id: "performance",
    n: 4,
    title: "Exercise Performance",
    blurb: "The mechanics of one repetition, and why the turnarounds are the part to master.",
    dirs: ["Academy/Academy 4 - Exercise Performance"],
  },
  {
    id: "continuous-tension",
    n: 5,
    title: "Continuous Tension Method",
    blurb: "The house protocol: six to ten seconds each way, and never unloading the muscle.",
    dirs: ["Academy/Academy 5 - Continuous Tension Method"],
  },
  {
    id: "programming",
    n: 6,
    title: "Programming and Progression",
    blurb: "The rulebook the routine builder is built on — categories, rep ranges, A/B rotation.",
    // Both halves. Parts 1-5 sit under Academy/, parts 6-7 at the top level.
    dirs: [
      "Academy/Academy 6 - General Recommendations for Programming and Progression",
      "Academy 6 - General Recommendations for Programming and Progression",
    ],
  },
  {
    id: "variations",
    n: 7,
    title: "Variations on the Protocol",
    blurb: "Timed static contraction, static hold, forced reps and drop sets — and when each is allowed.",
    dirs: ["Academy/Academy 7 - Variations on the Continuous Tension Protocol"],
  },
  {
    id: "equipment",
    n: 8,
    title: "Basic Equipment Knowledge",
    blurb: "What you must know about every machine before you train anyone on it.",
    dirs: ["Academy/Academy 8 - Basic Equipment and Exercise Information"],
  },
  {
    id: "instruction",
    n: 9,
    title: "Exercise Instruction",
    blurb: "The verbal layer: cue phrases by moment in the set, and the full workout scripts.",
    dirs: [
      "Academy/Academy 9 - Exercise Instruction",
      "Workout Setups and Instruction",
    ],
  },
  {
    id: "mastery",
    n: 10,
    title: "Mastery Series",
    blurb: "The short pieces on posture, pace, path, purpose, breathing and effort.",
    // Named "Academy 2" on disk, which is a collision with module 2.
    dirs: ["Academy 2"],
  },
];

/**
 * The canonical copy of the per-machine cards.
 *
 * Three near-identical trees exist. Two are byte-identical; the copy under
 * `Set Up Machines/` differs in two files and is missing a third. This one is
 * the shallowest path, which makes the choice checkable by eye.
 */
const QRG_DIR = "Initial Setups (Comprehensive Overview)/Quick Reference Guides";
const OVERVIEW_DIR = "Initial Setups (Comprehensive Overview)/Comprehensive Equipment Overview";
const GLOSSARY = "Academy/Academy 1 - Introduction/Academy - Intro 2 - Glossary.txt";

/**
 * Quick Reference card -> the app's canonical machine id.
 *
 * The abbreviations are the Academy's own (MACHINE_ABBR in
 * routine-builder/academy.ts uses the same ones), and this is what lets the
 * Catalog put a machine's card one tap from the machine.
 */
const CARD_TO_MACHINE: Record<string, string> = {
  Abd: "m-hip-abd",
  Abs: "m-abs",
  Add: "m-hip-add",
  Bi: "m-bicep",
  CF: "m-chest-fly",
  CP: "m-chest-press",
  CR: "m-compound-row",
  Cx: "m-neck",
  LC: "m-leg-curl",
  LE: "m-ext",
  LP: "m-leg-press",
  Lumb: "m-lumbar",
  OH: "m-overhead-press",
  PO: "m-pullover",
  Pd: "m-pulldown",
  SD: "m-dip",
  SR: "m-simple-row",
  TR: "m-torso-rotation",
};

const read = (p: string) => readFileSync(p, "utf8");
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function listTxt(dir: string): string[] {
  const full = join(ROOT, dir);
  try {
    return readdirSync(full)
      .filter((f) => f.toLowerCase().endsWith(".txt"))
      .filter((f) => statSync(join(full, f)).isFile());
  } catch {
    console.warn(`  ! missing directory: ${dir}`);
    return [];
  }
}

function main() {
  mkdirSync(OUT, { recursive: true });

  const index: any[] = [];
  let totalWords = 0;

  for (const mod of MODULES) {
    const topics: any[] = [];
    for (const dir of mod.dirs) {
      for (const file of listTxt(dir)) {
        const raw = read(join(ROOT, dir, file));
        const doc = parseDoc(raw, titleFromFilename(file));
        topics.push({
          id: slug(`${mod.id}-${titleFromFilename(file)}`),
          title: titleFromFilename(file),
          order: orderFromFilename(file),
          source: relative(process.cwd(), join(ROOT, dir, file)).replace(/\\/g, "/"),
          moduleLabel: doc.moduleLabel,
          words: doc.words,
          readingMinutes: doc.readingMinutes,
          blocks: doc.blocks,
        });
      }
    }
    // Numeric, then alphabetical for the unnumbered tail.
    topics.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

    writeFileSync(
      join(OUT, `${mod.id}.json`),
      JSON.stringify({ id: mod.id, title: mod.title, topics }, null, 0),
    );
    totalWords += topics.reduce((n, t) => n + t.words, 0);
    index.push({
      id: mod.id,
      n: mod.n,
      title: mod.title,
      blurb: mod.blurb,
      topics: topics.map((t) => ({
        id: t.id,
        title: t.title,
        readingMinutes: t.readingMinutes,
        words: t.words,
      })),
    });
    console.log(`  ${mod.n}. ${mod.title} — ${topics.length} topics`);
  }

  // ── the per-machine cards ──────────────────────────────────────────
  const cards: any[] = [];
  for (const file of listTxt(QRG_DIR)) {
    const raw = read(join(ROOT, QRG_DIR, file));
    const qrg = parseQuickReference(raw, titleFromFilename(file));
    // "LP – Quick Reference Guide.txt" -> "LP". Both dash forms are in use.
    const abbr = file.split(/\s*[-–]\s*/)[0].trim();
    cards.push({
      id: slug(abbr),
      abbr,
      machineId: CARD_TO_MACHINE[abbr] ?? null,
      title: qrg.title,
      sections: qrg.sections,
      words: countWords(qrg.sections.flatMap((s) => s.items).join(" ")),
    });
  }
  cards.sort((a, b) => a.title.localeCompare(b.title));
  writeFileSync(join(OUT, "cards.json"), JSON.stringify({ cards }, null, 0));
  const unmapped = cards.filter((c) => !c.machineId).map((c) => c.abbr);
  console.log(`  Cards — ${cards.length}${unmapped.length ? ` (unmapped: ${unmapped.join(", ")})` : ""}`);

  // ── the deep per-machine write-ups ─────────────────────────────────
  const overviews: any[] = [];
  for (const file of listTxt(OVERVIEW_DIR)) {
    const doc = parseDoc(read(join(ROOT, OVERVIEW_DIR, file)), titleFromFilename(file));
    overviews.push({
      id: slug(titleFromFilename(file)),
      title: titleFromFilename(file),
      readingMinutes: doc.readingMinutes,
      words: doc.words,
      blocks: doc.blocks,
    });
  }
  overviews.sort((a, b) => a.title.localeCompare(b.title));
  writeFileSync(join(OUT, "overviews.json"), JSON.stringify({ overviews }, null, 0));
  console.log(`  Equipment overviews — ${overviews.length}`);

  // ── the glossary ───────────────────────────────────────────────────
  const glossary = parseGlossary(read(join(ROOT, GLOSSARY)));
  writeFileSync(join(OUT, "glossary.json"), JSON.stringify({ glossary }, null, 0));
  console.log(`  Glossary — ${glossary.length} terms`);

  writeFileSync(
    join(OUT, "index.json"),
    JSON.stringify(
      {
        generatedFrom: "docs/msf-academy",
        // A hash of the inputs, so a stale build is visible in the diff.
        corpusHash: createHash("sha1")
          .update(index.map((m) => m.topics.map((t: any) => t.id).join()).join())
          .digest("hex")
          .slice(0, 12),
        totalWords,
        modules: index,
        cardCount: cards.length,
        overviewCount: overviews.length,
        glossaryCount: glossary.length,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${index.length} modules, ${totalWords.toLocaleString()} words to ${relative(process.cwd(), OUT)}`);
}

main();
