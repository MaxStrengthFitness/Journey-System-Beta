#!/usr/bin/env node
/*
 * THE EAGER BUNDLE'S SIZE BUDGET (the speed round, Oct 5 2026, R13).
 *
 * What an iPad must download and parse before Journey can draw its first
 * screen is exactly what the built index.html names: its module script, every
 * <link rel="modulepreload"> and every stylesheet. This script reads a build's
 * index.html, sums those files raw and gzipped (level 9, the way the audit
 * measured them) and fails when the gzipped total is over the budget.
 *
 * Why a budget: the eager payload grew 21% in nine days (Sep 26 to Oct 5)
 * through import edges nobody saw, a screen's stylesheet imported from
 * main.tsx, a helper imported from a big module, an icon in a pinned vendor
 * group. Each was small; together they cost every cold open. A number that
 * fails a build is how the next one gets seen the day it lands.
 *
 * Usage:
 *   node scripts/check-bundle-budget.mjs [buildDir] [--budget-kb N] [--json]
 *   npm run check:bundle               (reads dist/, after `npx vite build`)
 *
 * Exit 0 within budget; 1 over it, or with a lazy-only library on the first
 * screen, or for a build made with React's DEVELOPMENT files (see below);
 * 2 when it cannot measure (no index.html).
 *
 * The budget is in KB of gzip (1 KB = 1,024 bytes, as every earlier
 * measurement of this payload was). When a round genuinely needs more on the
 * first screen, raise BUDGET_GZIP_KB below in the same commit and say why in
 * the commit message; never raise it to make a red build green without
 * knowing what grew. `--json` prints the measurement for a ship script's log.
 *
 * MEASURE A PRODUCTION BUILD. Vite builds React's development files when
 * NODE_ENV is set to anything but "production" in the shell that runs it (a
 * test runner or an agent's shell often sets NODE_ENV=test), and those are
 * about 70 KB gzip bigger and much slower. Render's build is production (the
 * live files carry React's production error codes). This script refuses a
 * development build rather than measure the wrong thing: build with
 * NODE_ENV=production (PowerShell: $env:NODE_ENV="production"; npx vite build).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

// Measured on production builds (Oct 5 2026): 577.9 KB gzip in 34 files
// before the bundle diet (master c20d2abe plus the speed round's other
// groups), 456.9 KB in 8 files after it. The budget sits a little above that,
// under the blueprint's 500, so an ordinary round has room and a stylesheet
// or a vendor library leaking onto the first screen (each 20-40 KB) fails.
export const BUDGET_GZIP_KB = 480;

// Files that must never be on the first screen, whatever the total: each is a
// library only lazy screens use (recharts leaked onto the login screen
// once through a shared utility: vite.config.ts, the note above vendor-ui).
// motion left the first screen in the speed round (R13): the shell moves with
// CSS, and only lazy screens import motion/react.
export const NEVER_EAGER = [/(^|\/)vendor-charts-/, /(^|\/)vendor-dnd-/, /(^|\/)vendor-motion-/];

/** React's production build carries its minified error text; the development build does not. */
export function isDevelopmentReact(buildDir, files) {
  const scripts = files.filter((f) => f.file.endsWith(".js"));
  const hasReact = scripts.some((f) => /__REACT_DEVTOOLS_GLOBAL_HOOK__|react\.transitional\.element/.test(fs.readFileSync(path.join(buildDir, f.file), "utf8")));
  if (!hasReact) return false;
  return !scripts.some((f) => fs.readFileSync(path.join(buildDir, f.file), "utf8").includes("Minified React error"));
}

/** The files index.html makes the browser fetch before the app can run. */
export function eagerAssets(html) {
  const out = new Set();
  const tagRe = /<(script|link)\b[^>]*>/gi;
  for (const m of html.matchAll(tagRe)) {
    const tag = m[0];
    const kind = m[1].toLowerCase();
    const attr = (name) => {
      const a = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
      return a ? (a[2] ?? a[3]) : undefined;
    };
    let ref;
    if (kind === "script") {
      if ((attr("type") || "").toLowerCase() !== "module") continue;
      ref = attr("src");
    } else {
      const rel = (attr("rel") || "").toLowerCase().split(/\s+/);
      if (!rel.includes("modulepreload") && !rel.includes("stylesheet")) continue;
      ref = attr("href");
    }
    if (!ref) continue;
    // Only the build's own files: a font from Google or a CDN is not ours to budget.
    if (/^(https?:)?\/\//i.test(ref)) continue;
    out.add(ref.replace(/^\.?\//, "").split(/[?#]/)[0]);
  }
  return [...out];
}

export function measure(buildDir) {
  const html = fs.readFileSync(path.join(buildDir, "index.html"), "utf8");
  const files = eagerAssets(html).map((rel) => {
    const buf = fs.readFileSync(path.join(buildDir, rel));
    return { file: rel, raw: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
  });
  const raw = files.reduce((n, f) => n + f.raw, 0);
  const gzip = files.reduce((n, f) => n + f.gzip, 0);
  return { files, raw, gzip };
}

const kb = (n) => (n / 1024).toFixed(1);

function main(argv) {
  let dir = "dist";
  let budget = BUDGET_GZIP_KB;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--budget-kb") budget = Number(argv[++i]);
    else if (a === "--json") json = true;
    else dir = a;
  }
  if (!Number.isFinite(budget) || budget <= 0) {
    console.error("check-bundle-budget: --budget-kb needs a positive number");
    return 2;
  }
  if (!fs.existsSync(path.join(dir, "index.html"))) {
    console.error(`check-bundle-budget: no index.html in ${dir}. Build first (npx vite build).`);
    return 2;
  }
  const m = measure(dir);
  if (isDevelopmentReact(dir, m.files)) {
    console.error(
      `check-bundle-budget: ${dir} was built with React's development files (NODE_ENV was not "production" when it was built). ` +
        'Build again with NODE_ENV=production; PowerShell: $env:NODE_ENV="production"; npx vite build',
    );
    return 1;
  }
  const over = m.gzip > budget * 1024;
  const leaked = m.files.filter((f) => NEVER_EAGER.some((re) => re.test(f.file))).map((f) => f.file);
  if (json) {
    console.log(JSON.stringify({ dir, budgetGzipKb: budget, files: m.files.length, rawKb: +kb(m.raw), gzipKb: +kb(m.gzip), over, leaked }));
  } else {
    const rows = [...m.files].sort((a, b) => b.gzip - a.gzip);
    for (const f of rows) console.log(`${kb(f.gzip).padStart(7)} KB gz  ${kb(f.raw).padStart(7)} KB  ${f.file}`);
    console.log("");
    console.log(`Eager payload: ${m.files.length} files, ${kb(m.raw)} KB raw, ${kb(m.gzip)} KB gzip (budget ${budget} KB gzip).`);
  }
  if (leaked.length) {
    console.error(
      `BUNDLE BUDGET: ${leaked.join(", ")} is on the first screen. Only lazy screens use it; ` +
        "something the first screen imports now reaches it: a shared utility (the note above vendor-ui in vite.config.ts) or an eager file importing the library itself.",
    );
    return 1;
  }
  if (over) {
    console.error(
      `BUNDLE BUDGET EXCEEDED: the first screen now needs ${kb(m.gzip)} KB gzip, over the ${budget} KB budget. ` +
        "Find what joined the eager graph (a stylesheet in main.tsx, a helper imported from a big module, a vendor group) " +
        "before raising BUDGET_GZIP_KB in scripts/check-bundle-budget.mjs.",
    );
    return 1;
  }
  return 0;
}

const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
