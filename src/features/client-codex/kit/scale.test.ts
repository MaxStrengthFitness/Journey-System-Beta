import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE CODEX'S LOOK, ENFORCED — a scan of the actual files, not a promise in
 * a comment.
 *
 * Client codex, Sep 2026. The old record grew a dozen text sizes, raw colours
 * and clipped names because nothing checked. The codex's contract is small and
 * this test holds every codex file to it:
 *
 *   1. Text is 11, 12, 14, 17 or 30px (or the --cx-fs-* token for one of
 *      them, or `inherit`) — in a stylesheet's `font-size` and `font`, and in
 *      a component's `fontSize` and `font`. No Tailwind text-size utility in
 *      a component.
 *   2. No raw hex colour anywhere, the tokens file included: the codex's
 *      colours are aliases of the app's tokens. A component sets no colour
 *      of its own either — no rgb()/hsl(), no named colour in a style or an
 *      SVG fill, no Tailwind colour utility (`text-red-500`, `bg-white`).
 *   3. Nothing is clipped — no ellipsis, no one-line cut-off (nowrap with
 *      overflow hidden, in one rule or split across two for the same
 *      selector, or as Tailwind classes), no Tailwind `truncate`. One
 *      exception, from the integration plan: a note or beat BODY in a list
 *      row may clamp to two lines, because the whole note is one tap away —
 *      only in the exactly named body selectors (LINE_CLAMP_BODIES), and only
 *      at two lines. A row's name, label or meta is never clamped.
 *   4. No regex lookbehind in code that ships to an iPad (older iPadOS Safari
 *      fails the whole module when it parses one).
 *   5. No raw invisible or control character in any codex source or test
 *      (a no-break space, a zero-width space, a byte-order mark): CLAUDE.md's
 *      always-on rule is to write the escape.
 *
 * CODEX_FILES is explicit, and every page area's phase adds its files to it.
 * A file in src/features/client-codex/ that is not on the list fails the
 * suite, so the folder cannot grow a file this scan never reads.
 *
 * HOSTED_FILES is for the shell's phase: components the codex MOUNTS but does
 * not own (the focus board, the contract panel), counted rather than failed, with
 * a budget that each area phase lowers as it brings its hosted piece onto the
 * scale. The shell (phase 8) set it to what it measured; it reaches its final
 * value in the cleanup phase.
 *
 * If this fails on a size, the fix is the size, not the list.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "..");
const CODEX_DIR = join(SRC, "features", "client-codex");

/** Every file the codex owns, relative to src/. Area phases add theirs. */
const CODEX_FILES: readonly string[] = [
  "features/client-codex/codex.tokens.css",
  "features/client-codex/kit/kit.css",
  "features/client-codex/kit/primitives.tsx",
  "features/client-codex/kit/ReadEdit.tsx",
  "features/client-codex/kit/fields.tsx",
  "features/client-codex/kit/SaveBar.tsx",
  "features/client-codex/kit/save-bar.ts",
  "features/client-codex/kit/text.ts",
  "features/client-codex/kit/pronouns.ts",
  "features/client-codex/kit/index.ts",
  "lib/first-sentences.ts",
  // Notes' pieces the codex mounts on every page (phase 7): the critical line
  // under the bar, its stylesheet, and the selectors that write its words.
  "features/client-notes/CriticalLine.tsx",
  "features/client-notes/critical-line.css",
  "features/client-notes/record-selectors.ts",
  // The shell (phase 8): the tab, its one load, its one form, the sub-toggle's
  // lines, and the page adapters that host the long scroll's sections.
  "features/client-codex/ClientCodex.tsx",
  "features/client-codex/codex.css",
  "features/client-codex/index.ts",
  "features/client-codex/access.ts",
  "features/client-codex/codex-data.ts",
  "features/client-codex/useCodexData.ts",
  "features/client-codex/record-form.ts",
  "features/client-codex/useRecordForm.ts",
  "features/client-codex/page-meta.ts",
  "features/client-codex/pages/OverviewPage.tsx",
  "features/client-codex/pages/NotesPage.tsx",
  "features/client-codex/pages/FordPage.tsx",
  "features/client-codex/pages/BodyPage.tsx",
  "features/client-codex/pages/GoalsPage.tsx",
  "features/client-codex/pages/StoryPage.tsx",
  "features/client-codex/pages/AccountPage.tsx",
  "features/client-codex/pages/RecordLock.tsx",
  // The Notes page (phase 9): the page, its catalog, a thread card and a row,
  // their stylesheet, and the doors' vocabulary. The composer and the To-file
  // tray are shared with the session sheet and keep their own sizes there;
  // on this page `.nx-notes` rules in notes-page.css bring them onto the scale.
  "features/client-notes/NotesPage.tsx",
  "features/client-notes/NotesCatalog.tsx",
  "features/client-notes/NoteThreadCard.tsx",
  "features/client-notes/ThreadRow.tsx",
  "features/client-notes/notes-page.css",
  "features/client-notes/notes-intent.ts",
  // The FORD page (phase 10): the page and its parts, its stylesheet, the
  // pure modules that write its words, and the life editors its Work and
  // Recreation bands open (Body & Pulse's Training story is the third).
  "features/ford/page/FordPage.tsx",
  "features/ford/page/bands.tsx",
  "features/ford/page/PillarCard.tsx",
  "features/ford/page/AskNextLine.tsx",
  "features/ford/page/ComingUp.tsx",
  "features/ford/page/UnfiledTray.tsx",
  "features/ford/page/AboveAndBeyond.tsx",
  "features/ford/page/ford-page.css",
  "features/ford/ask-next.ts",
  "features/ford/coming-up.ts",
  "features/ford/pulse-links.ts",
  "features/ford/page-model.ts",
  "features/client-life/LifeBaseline.tsx",
  "features/client-life/controls.tsx",
  "features/client-life/client-life.css",
  "features/client-life/life.ts",
  // FORD's new fields (phase 11): In one line's panel and its pure module.
  // Follow up next time lives in ask-next.ts and AskNextLine.tsx, above.
  "features/ford/page/OneLinePanel.tsx",
  "features/ford/one-line.ts",
  // Body & Pulse (phase 12): the page, its cards and figure, its stylesheet,
  // the pure modules that write its words, and the InBody card, restyled on
  // the kit (it was a hosted Tailwind component).
  "features/client-codex/body/BodyPulsePage.tsx",
  "features/client-codex/body/BuildCard.tsx",
  "features/client-codex/body/WhereItMattersCard.tsx",
  "features/client-codex/body/BodyFigure.tsx",
  "features/client-codex/body/WatchOutsCard.tsx",
  "features/client-codex/body/OnOurFloorCard.tsx",
  "features/client-codex/body/MeasuredToldCard.tsx",
  "features/client-codex/body/PulseCard.tsx",
  "features/client-codex/body/body.css",
  "features/client-codex/body/build.ts",
  "features/client-codex/body/figure-map.ts",
  "features/client-codex/body/watchout-groups.ts",
  "features/client-codex/body/floor.ts",
  "features/client-codex/body/pulse-read.ts",
  "features/client-codex/body/pairs.ts",
  "features/client-codex/body/built-like-her.ts",
  "features/client-codex/body/page-lines.ts",
  "features/inbody/InBodyCard.tsx",
  "features/inbody/inbody-card.css",
  // Body & Pulse → Over time (phase 13): the card, the timeline's drawing,
  // and the two pure modules that write its lanes and its sentences.
  "features/client-codex/body/OverTimeCard.tsx",
  "features/client-codex/body/BodyTimeline.tsx",
  "features/client-codex/body/arrivals.ts",
  "features/client-codex/body/timeline.ts",
  // Goals & Focus (phase 14): the page and its cards, its stylesheet, the
  // pure modules that write its words, the focus writes, and the pieces it
  // mounts, brought onto the kit (they were hosted): the focus board, the
  // team's shared plans and the trainer's jot strip.
  "features/goals/GoalsPage.tsx",
  "features/goals/HowToCoachCard.tsx",
  "features/goals/HerWhyCard.tsx",
  "features/goals/WorkingTowardCard.tsx",
  "features/goals/ReachedShelf.tsx",
  "features/goals/goals.css",
  "features/goals/goals-page.ts",
  "features/goals/goals.ts",
  "features/goals/focus.ts",
  "features/goals/useFocusActions.ts",
  "components/journal/FocusBoard.tsx",
  "features/relay/notes/SharedNotesCard.tsx",
  "features/relay/notes/ClientJotStrip.tsx",
];

/**
 * The only selectors whose rules may clamp lines: a list row's note or beat
 * BODY (Notes' `nx-row`, Goals' `gf-row`). Named exactly, so a row's name,
 * machine name, label or meta can never be clamped. The Notes and Goals
 * phases confirm these names when they build their rows — change them then,
 * never wider.
 */
const LINE_CLAMP_BODIES: readonly string[] = [".nx-row__body", ".gf-row__text"];
/** How many lines a body may clamp to. */
const LINE_CLAMP_LINES = 2;

/**
 * Components the codex hosts but does not own yet (the shell phase, phase 8):
 * the long scroll's sections moved onto the pages unchanged, and the pieces
 * those pages mount directly. Their text sizes are COUNTED, not failed, and
 * the count may only go down: each page area's phase takes its hosted pieces
 * off this list as it rebuilds them on the kit, and lowers the budget to the
 * new count in the same commit. `legacy-blocks.tsx` is the one hosted file
 * inside the codex folder; the cleanup phase deletes it.
 *
 * Shared pieces stay listed until their area replaces them on the codex:
 * ClientJournalTab (the focus area; Notes left it in phase 9, which moved no
 * text size, so the budget stayed at 168), the goals panel, the contract
 * panel, the shared notes and jots, the flag picker, and ford.css (the
 * detail dialog's). The FORD phase (10) deleted the FORD hub and its CSS and
 * brought the life editors onto the kit (they are CODEX_FILES now): 168 →
 * 148. Body & Pulse (12) deleted the watch-out banner (BodyWatchOuts), took
 * the Pulse area out of ClientJournalTab and the Body blocks out of
 * legacy-blocks, brought the InBody card onto the kit (CODEX_FILES now) and
 * collapsed the flag picker's stylesheet onto the scale: 148 → 125. The
 * picker stays hosted: its screen-reader-only text is one line clipped on
 * purpose, which the clipping rule would refuse. Goals & Focus (14) deleted
 * the goals panel, took the focus board out of ClientJournalTab (which only
 * the cleanup phase's delete is left for), and brought the focus board, the
 * goals stylesheet, the shared plans and the jot strip onto the kit
 * (CODEX_FILES now) — and the jot rules of notes.css onto the scale: 125 →
 * 93. notes.css stays hosted: the rest of it is Relay's.
 */
const HOSTED_FILES: readonly string[] = [
  "features/client-codex/pages/legacy-blocks.tsx",
  "components/client-dossier/DossierPrimitives.tsx",
  "components/client-dossier/JournalRail.tsx",
  "components/journal/ClientJournalTab.tsx",
  "features/ford/ford.css",
  "features/client-admin/ContractPanel.tsx",
  "features/client-admin/client-admin.css",
  "features/relay/notes/notes.css",
  "features/clinical-flags/ClinicalFlagPicker.tsx",
  "features/clinical-flags/clinical-flags.css",
];
/** Measured when the shell landed (phase 8): 168; after the FORD page (phase 10): 148; after Body & Pulse (phase 12): 125; after Goals & Focus (phase 14): 93. Lower it; never raise it. */
const HOSTED_OFF_SCALE_BUDGET = 93;

/**
 * The shared note pieces the Notes page mounts — the composer, the To-file
 * tray, the mattering picker, all drawn from client-notes/notes.css — keep
 * their own sizes in the Active Session sheet and on the post-session screen.
 * On the Notes page, notes-page.css brings each off-scale rule onto the scale
 * with a `.nx-notes` rule of its own; the test below finds every off-scale
 * size in notes.css and fails if the page has no override for it. Listed here:
 * selectors the Notes page never draws, and why.
 */
const NOTES_CSS_NOT_ON_THE_PAGE: Readonly<Record<string, string>> = {
  ".nc-tofile": "the dense entry card's To-file mark; the Notes page draws no JournalEntryCard",
};

const SCALE_PX = [11, 12, 14, 17, 30] as const;

/* ------------------------------------------------------------------ */
/* The checker                                                         */
/* ------------------------------------------------------------------ */

type Kind = "css" | "tsx" | "ts";

const kindOf = (path: string): Kind => (path.endsWith(".css") ? "css" : path.endsWith(".tsx") ? "tsx" : "ts");

const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** A font-size value on the scale. */
function onScale(raw: string): boolean {
  const v = raw.replace(/!important/i, "").trim().toLowerCase();
  if (v === "inherit") return true;
  const token = /^var\(--cx-fs-(\d+)\)$/.exec(v);
  if (token) return (SCALE_PX as readonly number[]).includes(Number(token[1]));
  const px = /^(\d+(?:\.\d+)?)px$/.exec(v);
  return !!px && (SCALE_PX as readonly number[]).includes(Number(px[1]));
}

/** The size inside a `font:` shorthand, or null when it names none. */
function shorthandSize(value: string): string | null {
  const m =
    /(?:^|\s)((?:\d*\.)?\d+(?:px|rem|em|pt|%|vw|vh|ch|ex)|var\(--[\w-]+\)|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)(?=\/|\s|$)/i.exec(
      value.trim(),
    );
  return m ? m[1] : null;
}

/** Every text size the file sets that is NOT on the scale. */
function offScaleSizes(text: string, kind: Kind): string[] {
  const bad: string[] = [];
  if (kind === "css") {
    const css = stripCssComments(text);
    for (const m of css.matchAll(/(?:^|[;{\s])font-size\s*:\s*([^;}]+)/g)) {
      if (!onScale(m[1])) bad.push(`font-size: ${m[1].trim()}`);
    }
    for (const m of css.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]+)/g)) {
      const value = m[1].trim();
      if (value.toLowerCase() === "inherit") continue;
      const size = shorthandSize(value);
      if (size === null || !onScale(size)) bad.push(`font: ${value}`);
    }
    return bad;
  }
  if (kind === "tsx") {
    for (const m of text.matchAll(/fontSize\s*[:=]\s*\{?\s*["'`]?([\w.()-]+)/g)) {
      const v = /^\d+(?:\.\d+)?$/.test(m[1]) ? `${m[1]}px` : m[1];
      if (!onScale(v)) bad.push(`fontSize ${m[1]}`);
    }
    // The shorthand in a style object: style={{ font: "700 13px sans-serif" }}.
    for (const m of text.matchAll(/\bfont\s*:\s*(["'`])([^"'`]*)\1/g)) {
      const value = m[2].trim();
      if (value.toLowerCase() === "inherit") continue;
      const size = shorthandSize(value);
      if (size === null || !onScale(size)) bad.push(`font: ${value}`);
    }
    for (const m of text.matchAll(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/g)) bad.push(`Tailwind text-${m[1]}`);
    for (const m of text.matchAll(/\btext-\[[^\]]*\]/g)) bad.push(`Tailwind ${m[0]}`);
  }
  return bad;
}

/** Raw hex colours ("#38BDF8"), skipping HTML entities ("&#8217;"). */
function hexColours(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    if (m.index !== undefined && text[m.index - 1] === "&") continue;
    out.push(m[0]);
  }
  return out;
}

/** A colour property in a style object, or an SVG colour attribute, with a quoted value. */
const COLOUR_PROP =
  /\b(color|background|backgroundColor|border(?:Top|Right|Bottom|Left)?Color|outlineColor|caretColor|accentColor|textDecorationColor|fill|stroke|stopColor)\s*[:=]\s*\{?\s*(["'`])([^"'`]*)\2/g;
/** The values a component may give one: a codex token, or no colour of its own. */
const OWN_COLOUR_OK = /^(?:var\(--cx-[\w-]+\)|currentcolor|inherit|transparent|none)$/i;
const TAILWIND_COLOUR =
  /\b(?:text|bg|border(?:-[trblxy])?|fill|stroke|ring|outline|divide|from|via|to|decoration|accent|caret|shadow|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/g;

/**
 * Colours a component sets itself instead of taking a --cx-* token: a colour
 * function, a named or raw value in a style or an SVG attribute, a Tailwind
 * colour utility. (A component prop that is not a colour is called `tone` in
 * the kit, never `color`.)
 */
function ownColours(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(?:rgba?|hsla?|hwb|oklch|oklab)\(/g)) out.push(m[0]);
  for (const m of text.matchAll(COLOUR_PROP)) {
    if (!OWN_COLOUR_OK.test(m[3].trim())) out.push(`${m[1]}: ${m[3].trim()}`);
  }
  for (const m of text.matchAll(TAILWIND_COLOUR)) out.push(`Tailwind ${m[0]}`);
  return out;
}

/**
 * Raw invisible and control characters: C0 controls other than tab, line
 * feed and carriage return, DEL, NEL, the no-break and other non-plain
 * spaces, the soft hyphen, zero-width and direction marks, the line and
 * paragraph separators, word joiners and the byte-order mark. They must be
 * written as escapes (CLAUDE.md, always on).
 */
function invisibles(text: string): string[] {
  const out: string[] = [];
  let line = 1;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c === 10) {
      line += 1;
      continue;
    }
    const bad =
      (c < 32 && c !== 9 && c !== 13) ||
      c === 0x7f ||
      c === 0x85 ||
      c === 0xa0 ||
      c === 0xad ||
      c === 0x61c ||
      c === 0x180e ||
      (c >= 0x2000 && c <= 0x200f) ||
      (c >= 0x2028 && c <= 0x202f) ||
      (c >= 0x2060 && c <= 0x2069) ||
      c === 0xfeff;
    if (bad) out.push(`U+${c.toString(16).toUpperCase().padStart(4, "0")} on line ${line}`);
  }
  return out;
}

/** The rules of a stylesheet: innermost selector list and its declarations. */
function cssRules(css: string): Array<{ selectors: string[]; body: string }> {
  const out: Array<{ selectors: string[]; body: string }> = [];
  for (const m of stripCssComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = m[1].trim();
    if (prelude.startsWith("@")) continue;
    out.push({ selectors: prelude.split(",").map((s) => s.trim()), body: m[2] });
  }
  return out;
}

/** True when a selector's subject (its last compound) is a named clampable body. */
function isClampBody(selector: string): boolean {
  const parts = selector.trim().split(/\s*[\s>+~]\s*/);
  return LINE_CLAMP_BODIES.includes(parts[parts.length - 1]);
}

/** Every className value in a component: a quoted string, or a {…} expression. */
function classNameValues(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bclassName\s*=\s*/g)) {
    let i = (m.index ?? 0) + m[0].length;
    const open = text[i];
    if (open === '"' || open === "'") {
      const close = text.indexOf(open, i + 1);
      if (close > i) out.push(text.slice(i + 1, close));
      continue;
    }
    if (open !== "{") continue;
    let depth = 0;
    const start = i;
    for (; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(text.slice(start + 1, i));
  }
  return out;
}

const NOWRAP_CSS = /(?:white-space|text-wrap(?:-mode)?)\s*:\s*nowrap/;
const HIDDEN_CSS = /(?:^|[;\s])overflow(?:-x|-inline)?\s*:\s*(?:hidden|clip)/;
const NOWRAP_TW = /(?:^|[\s"'`])(?:whitespace-nowrap|text-nowrap)(?![\w-])/;
const HIDDEN_TW = /(?:^|[\s"'`])(?:overflow-hidden|overflow-x-hidden|overflow-clip|overflow-x-clip|text-clip)(?![\w-])/;

/** Anything that clips text, as a list of reasons. */
function clipping(text: string, kind: Kind): string[] {
  const bad: string[] = [];
  if (kind === "css") {
    // nowrap and overflow are collected per selector across every rule, so a
    // cut-off split into two rules for the same selector is still one.
    const oneLine = new Map<string, { nowrap: boolean; hidden: boolean }>();
    for (const rule of cssRules(text)) {
      const body = rule.body.toLowerCase();
      const where = rule.selectors.join(", ");
      if (/text-overflow\s*:\s*ellipsis/.test(body)) bad.push(`${where}: text-overflow: ellipsis`);
      const clamps = [...body.matchAll(/(?:^|[;\s])(?:-webkit-)?line-clamp\s*:\s*([^;]+)/g)].map((m) => m[1].trim());
      if (clamps.length > 0) {
        if (!rule.selectors.every(isClampBody)) bad.push(`${where}: line-clamp outside ${LINE_CLAMP_BODIES.join(" / ")}`);
        for (const v of clamps) {
          if (v !== String(LINE_CLAMP_LINES)) bad.push(`${where}: line-clamp ${v}, not ${LINE_CLAMP_LINES}`);
        }
      }
      const nowrap = NOWRAP_CSS.test(body);
      const hidden = HIDDEN_CSS.test(body);
      for (const s of rule.selectors) {
        const key = s.replace(/\s+/g, " ");
        const seen = oneLine.get(key) ?? { nowrap: false, hidden: false };
        oneLine.set(key, { nowrap: seen.nowrap || nowrap, hidden: seen.hidden || hidden });
      }
    }
    for (const [selector, seen] of oneLine) {
      if (seen.nowrap && seen.hidden) bad.push(`${selector}: one line, clipped`);
    }
    return bad;
  }
  if (kind === "tsx") {
    for (const m of text.matchAll(/\b(truncate|text-ellipsis|line-clamp-\d+|textOverflow|WebkitLineClamp)\b/g)) bad.push(m[1]);
    for (const value of classNameValues(text)) {
      if (NOWRAP_TW.test(value) && HIDDEN_TW.test(value)) bad.push(`one line, clipped: ${value.trim()}`);
    }
    if (/whiteSpace\s*:\s*["'`]nowrap/.test(text) && /overflow(?:X)?\s*:\s*["'`](?:hidden|clip)/.test(text)) {
      bad.push("one line, clipped: whiteSpace nowrap with overflow hidden");
    }
  }
  return bad;
}

const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/* ------------------------------------------------------------------ */
/* The checker checks what it should                                   */
/* ------------------------------------------------------------------ */

describe("the scale checker", () => {
  it("catches a 13px rule, in either spelling, and passes the scale", () => {
    expect(offScaleSizes(".a { font-size: 13px; }", "css")).toEqual(["font-size: 13px"]);
    expect(offScaleSizes(".a { font: 800 italic 13px/1.1 var(--cx-font-display); }", "css")).toHaveLength(1);
    expect(offScaleSizes(".a { font-size: 0.8rem; }", "css")).toHaveLength(1);
    expect(offScaleSizes(".a { font-size: var(--cx-fs-13); }", "css")).toHaveLength(1);
    expect(offScaleSizes(".a { font: 12px sans-serif; }", "css")).toEqual([]);
    expect(offScaleSizes(".a { font-size: var(--cx-fs-17); font: inherit; }", "css")).toEqual([]);
    expect(offScaleSizes(".a { --x-font-size: 13px; }", "css")).toEqual([]);
  });

  it("catches an off-scale size in a component", () => {
    expect(offScaleSizes("<span style={{ fontSize: 13 }} />", "tsx")).toHaveLength(1);
    expect(offScaleSizes('<text fontSize="9.5" />', "tsx")).toHaveLength(1);
    expect(offScaleSizes('<span className="text-sm" />', "tsx")).toHaveLength(1);
    expect(offScaleSizes('<span className="text-[13px]" />', "tsx")).toHaveLength(1);
    expect(offScaleSizes('<span style={{ fontSize: 14 }} className="text-left" />', "tsx")).toEqual([]);
    expect(offScaleSizes('<span style={{ font: "700 13px sans-serif" }} />', "tsx")).toHaveLength(1);
    expect(offScaleSizes('<span style={{ font: "700 14px/1.2 var(--cx-font-body)" }} />', "tsx")).toEqual([]);
    expect(offScaleSizes("<span style={{ font: 'inherit' }} />", "tsx")).toEqual([]);
  });

  it("catches clipping, and allows a row body's two-line clamp only", () => {
    expect(clipping(".a { text-overflow: ellipsis; }", "css")).toHaveLength(1);
    expect(clipping(".a { white-space: nowrap; overflow: hidden; }", "css")).toHaveLength(1);
    expect(clipping(".a { -webkit-line-clamp: 2; }", "css")).toHaveLength(1);
    expect(
      clipping(
        ".nx-row .nx-row__body { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }",
        "css",
      ),
    ).toEqual([]);
    expect(clipping(".gf-row__text { -webkit-line-clamp: 2; }", "css")).toEqual([]);
    expect(clipping(".nx-rowdy { -webkit-line-clamp: 2; }", "css")).toHaveLength(1);
    // A row's name, label or meta is never clamped, and a body never to one line.
    expect(clipping(".nx-row__name { -webkit-line-clamp: 1; line-clamp: 1; overflow: hidden; }", "css").length).toBeGreaterThan(0);
    expect(clipping(".nx-row__meta { -webkit-line-clamp: 2; }", "css")).toHaveLength(1);
    expect(clipping(".nx-row__body { -webkit-line-clamp: 1; }", "css")).toHaveLength(1);
    expect(clipping(".nx-row__body, .nx-row__name { -webkit-line-clamp: 2; }", "css")).toHaveLength(1);
    // A one-line cut-off split across two rules for the same selector.
    expect(clipping(".a { white-space: nowrap; }\n.a { overflow: hidden; }", "css")).toEqual([".a: one line, clipped"]);
    expect(clipping(".a { white-space: nowrap; }\n.b { overflow: hidden; }", "css")).toEqual([]);
    expect(clipping(".a { overflow-wrap: anywhere; white-space: nowrap; }", "css")).toEqual([]);
    expect(clipping('<b className="truncate" />', "tsx")).toEqual(["truncate"]);
    expect(clipping("never truncated", "tsx")).toEqual([]);
  });

  it("catches a one-line cut-off in a component's classes or style", () => {
    expect(clipping('<b className="whitespace-nowrap overflow-hidden" />', "tsx")).toHaveLength(1);
    expect(clipping('<b className={cls("whitespace-nowrap", open && "overflow-x-hidden")} />', "tsx")).toHaveLength(1);
    expect(clipping("<b className={`text-nowrap ${a ? 'text-clip' : ''}`} />", "tsx")).toHaveLength(1);
    expect(clipping('<b style={{ whiteSpace: "nowrap", overflow: "hidden" }} />', "tsx")).toHaveLength(1);
    expect(clipping('<b className="whitespace-nowrap" />\n<i className="overflow-hidden" />', "tsx")).toEqual([]);
  });

  it("catches a hex colour but not an entity", () => {
    expect(hexColours("color: #38BDF8;")).toEqual(["#38BDF8"]);
    expect(hexColours("it&#8217;s")).toEqual([]);
    expect(hexColours("root.querySelector('#' + id)")).toEqual([]);
  });

  it("catches a colour a component sets itself", () => {
    expect(ownColours('<b style={{ color: "rgb(255, 0, 0)" }} />').length).toBeGreaterThan(0);
    expect(ownColours('<b style={{ background: "hsl(0 0% 100%)" }} />').length).toBeGreaterThan(0);
    expect(ownColours('<b style={{ color: "red" }} />')).toEqual(["color: red"]);
    expect(ownColours('<path fill="white" />')).toEqual(["fill: white"]);
    expect(ownColours('<b className="text-red-500 bg-white" />')).toEqual(["Tailwind text-red-500", "Tailwind bg-white"]);
    expect(ownColours('<b style={{ color: "var(--cx-ink)" }} />')).toEqual([]);
    expect(ownColours('<path fill="currentColor" stroke="none" />')).toEqual([]);
    expect(ownColours('<b className="text-left bg-transparent" />')).toEqual([]);
  });

  it("catches an invisible character typed raw, and passes its escape", () => {
    expect(invisibles("a\u00a0b")).toEqual(["U+00A0 on line 1"]);
    expect(invisibles("one\ntwo\u200b")).toEqual(["U+200B on line 2"]);
    expect(invisibles("\ufeffimport")).toEqual(["U+FEFF on line 1"]);
    expect(invisibles("a\u0007b")).toHaveLength(1);
    expect(invisibles('c === "\\u00a0"')).toEqual([]);
    expect(invisibles("tab\there\r\n“curly” … 90° 5′0″")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* The codex's files                                                   */
/* ------------------------------------------------------------------ */

function codeFilesUnder(dir: string, withTests = false): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...codeFilesUnder(full, withTests));
    else if (/\.(css|ts|tsx)$/.test(name) && (withTests || !/\.test\.tsx?$/.test(name))) out.push(full);
  }
  return out;
}

/** Every codex source AND test file, for the invisible-character scan. */
function everyCodexFile(): string[] {
  const all = new Set<string>(CODEX_FILES);
  for (const full of codeFilesUnder(CODEX_DIR, true)) all.add(relative(SRC, full).split(sep).join("/"));
  for (const rel of CODEX_FILES) {
    const test = rel.replace(/\.(tsx?)$/, ".test.$1");
    if (test !== rel && existsSync(join(SRC, test))) all.add(test);
  }
  return [...all].sort();
}

describe("the codex's files", () => {
  it("are all on the list, and the list names only real files", () => {
    for (const rel of [...CODEX_FILES, ...HOSTED_FILES]) expect(existsSync(join(SRC, rel)), rel).toBe(true);
    // A file in the folder is either the codex's own (every check) or a
    // hosted one still waiting for its area (counted against the budget).
    const listed = new Set([...CODEX_FILES, ...HOSTED_FILES]);
    for (const full of codeFilesUnder(CODEX_DIR)) {
      const rel = relative(SRC, full).split(sep).join("/");
      expect(listed.has(rel), `${rel} is in the codex folder but not in CODEX_FILES`).toBe(true);
    }
    for (const rel of HOSTED_FILES) expect(CODEX_FILES.includes(rel), `${rel} is on both lists`).toBe(false);
  });

  it("set text only on the 11 / 12 / 14 / 17 / 30 scale", () => {
    for (const rel of CODEX_FILES) expect(offScaleSizes(read(rel), kindOf(rel)), rel).toEqual([]);
  });

  it("hold no raw hex colour, the tokens file included", () => {
    for (const rel of CODEX_FILES) expect(hexColours(read(rel)), rel).toEqual([]);
  });

  it("set no colour of their own in a component", () => {
    for (const rel of CODEX_FILES) {
      if (kindOf(rel) !== "tsx") continue;
      expect(ownColours(read(rel)), rel).toEqual([]);
    }
  });

  it("hold no raw invisible or control character, tests included", () => {
    const files = everyCodexFile();
    expect(files).toContain("lib/first-sentences.test.ts");
    for (const rel of files) expect(invisibles(read(rel)), rel).toEqual([]);
  });

  it("never clip text", () => {
    for (const rel of CODEX_FILES) expect(clipping(read(rel), kindOf(rel)), rel).toEqual([]);
  });

  it("use no regex lookbehind", () => {
    for (const rel of CODEX_FILES) {
      if (kindOf(rel) === "css") continue;
      expect(read(rel), rel).not.toContain("(?<");
    }
  });

  it(`keep the hosted components within ${HOSTED_OFF_SCALE_BUDGET} off-scale sizes`, () => {
    let found = 0;
    for (const rel of HOSTED_FILES) found += offScaleSizes(read(rel), kindOf(rel)).length;
    expect(found).toBeLessThanOrEqual(HOSTED_OFF_SCALE_BUDGET);
  });
});

/* ------------------------------------------------------------------ */
/* The tokens                                                          */
/* ------------------------------------------------------------------ */

/** The custom properties declared in the first block whose prelude starts `selector`. */
function tokenBlock(css: string, selector: string): Record<string, string> {
  const src = stripCssComments(css);
  const i = src.indexOf(selector);
  if (i < 0) throw new Error(`token block not found: ${selector}`);
  const body = src.slice(src.indexOf("{", i) + 1, src.indexOf("\n}", i));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

describe("the Notes page's shared pieces", () => {
  it("bring every off-scale size in notes.css onto the scale inside .nx-notes", () => {
    // Its @import lines would otherwise be read as the first rule's selector.
    const shared = cssRules(read("features/client-notes/notes.css").replace(/@import[^;]*;/g, ""));
    const page = cssRules(read("features/client-notes/notes-page.css"));
    const overridden = new Map<string, string>();
    for (const rule of page) {
      const size = /(?:^|[;\s])font-size\s*:\s*([^;}]+)/.exec(rule.body)?.[1]?.trim();
      if (!size) continue;
      for (const s of rule.selectors) {
        const m = /^\.nx-notes\s+(\.[\w-]+)$/.exec(s.replace(/\s+/g, " "));
        if (m) overridden.set(m[1], size);
      }
    }
    const offScale: string[] = [];
    for (const rule of shared) {
      const size = /(?:^|[;\s])font-size\s*:\s*([^;}]+)/.exec(rule.body)?.[1]?.trim();
      if (!size || onScale(size)) continue;
      offScale.push(...rule.selectors);
    }
    // The scan finds something: notes.css really is off the scale on its own.
    expect(offScale.length).toBeGreaterThan(0);
    for (const selector of offScale) {
      if (selector in NOTES_CSS_NOT_ON_THE_PAGE) continue;
      // A modifier (.nc-chip--small) rides on its base class's override only
      // if it sets no size of its own, so each selector is checked as written.
      expect(overridden.get(selector), `${selector} has no .nx-notes override in notes-page.css`).toBeDefined();
      expect(onScale(overridden.get(selector)!), `${selector} is overridden off the scale`).toBe(true);
    }
  });
});

describe("codex.tokens.css", () => {
  const tokens = tokenBlock(read("features/client-codex/codex.tokens.css"), ".cx,");
  const eq = tokenBlock(read("features/equipment/equipment.tokens.css"), ":root {");
  const ford = tokenBlock(read("features/ford/ford.tokens.css"), ":root {");

  it("declares the whole text scale and nothing else", () => {
    const sizes = Object.entries(tokens).filter(([k]) => k.startsWith("--cx-fs-"));
    expect(sizes.map(([k]) => k).sort()).toEqual(SCALE_PX.map((n) => `--cx-fs-${n}`).sort());
    for (const [k, v] of sizes) expect(v, k).toBe(`${k.slice("--cx-fs-".length)}px`);
  });

  it("aliases every colour to a token the app already has", () => {
    const alias = /^var\((--(?:eq|ford)-[\w-]+)\)$/;
    const mixed = /^color-mix\(in srgb, var\((--(?:eq|ford)-[\w-]+)\) \d+%, transparent\)$/;
    const known = (name: string) => (name.startsWith("--eq-") ? name in eq : name in ford);
    for (const [k, v] of Object.entries(tokens)) {
      if (/^--cx-(fs-|font-|radius-sm$|tap$|row$)/.test(k)) continue;
      const m = alias.exec(v) ?? mixed.exec(v);
      expect(m, `${k}: ${v}`).not.toBeNull();
      expect(known(m![1]), `${k} aliases ${m![1]}, which is not declared`).toBe(true);
    }
  });

  it("keeps touch targets at 40px or more", () => {
    expect(parseFloat(tokens["--cx-tap"])).toBeGreaterThanOrEqual(40);
    expect(parseFloat(tokens["--cx-row"])).toBeGreaterThanOrEqual(40);
  });

  it("is the only colour source kit.css draws from", () => {
    const kit = stripCssComments(read("features/client-codex/kit/kit.css"));
    for (const m of kit.matchAll(/var\((--[\w-]+)/g)) {
      const name = m[1];
      if (name === "--scroll-pad-bottom") continue;
      expect(name.startsWith("--cx-") && name in tokens, `kit.css uses ${name}`).toBe(true);
    }
    expect(kit).not.toMatch(/\b(?:rgba?|hsla?)\(/);
    expect(kit).not.toMatch(/:\s*(?:white|black)\b/);
  });
});
