import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE SHEETS A SESSION OPENS SPEAK THE SESSION'S VOICE (type and depth, the
 * review's fixes, Oct 5 2026; AJ's answer 3B).
 *
 * 3B was "the Active Session gets the full type voice: no label under 11px,
 * capital labels to ordinary capitalisation where they fit". Phase 13 took
 * the grid there (journey-grid's own guards hold it), but the sheets the
 * session opens kept the old 10px capitals: the machine sheet, the Pulse
 * slide-over and its quick log, the note composer and its chips, the
 * pre-session briefing, the notes sidebar's cards, the Critical strip, the
 * stale-session and pick-a-client dialogs, and the screens every session
 * passes through (a toast, the leave question). The Journal's Today, the
 * one other place the review found the old heading, is held here too.
 *
 * This file holds them there: no font size under 11px and no capitals in
 * those stylesheets (beyond the named exceptions, each with its reason), and
 * no capitals or sub-11px class in those components. A veil over the session
 * is the navy scrim, never raw black or slate.
 *
 * If one of these fails, the fix is the stylesheet or the class list, not
 * the test.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selectors: string[]; body: string };

function rulesOf(file: string): Rule[] {
  const css = stripComments(read(file));
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = m[1].split(";").pop()!.trim().replace(/\s+/g, " ");
    out.push({ selectors: prelude.split(",").map((s) => s.trim()), body: m[2] });
  }
  return out;
}

const declared = (body: string, prop: string): string[] =>
  [...body.matchAll(new RegExp(`(?:^|[;\\s{])${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim());

function pxOf(value: string): number | null {
  const px = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (px) return Number(px[1]);
  const rem = /^(\d+(?:\.\d+)?)rem$/.exec(value);
  return rem ? Number(rem[1]) * 16 : null;
}

/** [stylesheet, which of its rules (all, or those whose selector starts so)]. */
const SHEETS: [string, RegExp | null][] = [
  ["features/equipment/equipment.css", null],
  ["features/client-notes/notes.css", null],
  ["features/briefing/briefing.css", null],
  ["features/relay/notes/journal-today.css", null],
  // The Pulse slide-over (.sra) and its quick log (.pq); the profile's full
  // Pulse (.sr, .pcm) is not a session sheet.
  ["features/subjective-report/subjective-report.css", /^\.(?:sra|pq)[-_]/],
];

/** Capitals that stay, each with its reason. */
const CAPITALS: Record<string, string> = {
  "features/briefing/briefing.css .br__cta": "Go: Start session's own voice (AJ's 1A)",
  "features/briefing/briefing.css .br-safe__clear": "the safety heading read before every session (the Stack's safety voice, Oct 3 2026)",
  "features/briefing/briefing.css .br-safe__title": "a limit's name in the safety block (the Stack's safety voice, Oct 3 2026)",
};

function sheetRules(): [string, Rule][] {
  const out: [string, Rule][] = [];
  for (const [file, only] of SHEETS) {
    for (const r of rulesOf(file)) {
      if (only && !r.selectors.some((s) => only.test(s))) continue;
      out.push([file, r]);
    }
  }
  return out;
}

describe("the sheets a session opens: no label under 11px, words as written", () => {
  it("sets no text under 11px", () => {
    const small: string[] = [];
    for (const [file, r] of sheetRules()) {
      for (const v of declared(r.body, "font-size")) {
        const n = pxOf(v);
        if (n !== null && n < 11) small.push(`${file} ${r.selectors.join(", ")}: ${v}`);
      }
    }
    expect(small).toEqual([]);
  });

  it("sets nothing in capitals but Go and the briefing's safety voice", () => {
    const caps: string[] = [];
    for (const [file, r] of sheetRules()) {
      if (declared(r.body, "text-transform").some((v) => /uppercase/.test(v))) caps.push(`${file} ${r.selectors.join(", ")}`);
    }
    expect(caps.filter((c) => !(c in CAPITALS))).toEqual([]);
    expect(Object.keys(CAPITALS).filter((k) => !caps.includes(k)), "an exception that no longer sets capitals").toEqual([]);
  });

  it("draws the machine sheet's fields and the Pulse slide-over's buttons on their 3:1 edge", () => {
    const eq = rulesOf("features/equipment/equipment.css");
    const field = (sel: string) => eq.filter((r) => r.selectors.includes(sel)).map((r) => r.body).join(";");
    for (const sel of [".eq-field__input", ".eq-step__input", ".eq-composer textarea"]) {
      expect(declared(field(sel), "border").at(-1), sel).toBe("1px solid var(--eq-border-strong)");
      expect(declared(field(sel), "box-shadow").at(-1), `${sel} sinks`).toBe("var(--eq-elev-0)");
    }
    const back = field(".eq-back");
    expect(declared(back, "min-height")).toEqual(["40px"]);
    expect(declared(back, "border")).toEqual(["1px solid var(--eq-border-strong)"]);
    const sr = rulesOf("features/subjective-report/subjective-report.css");
    const btn = sr.filter((r) => r.selectors.includes(".sra-btn")).map((r) => r.body).join(";");
    expect(declared(btn, "border")).toEqual(["1px solid var(--sr-border-strong)"]);
    expect(declared(btn, "background")).toEqual(["var(--sr-raised)"]);
    expect(declared(btn, "font-size")).toEqual(["14px"]);
  });
});

/** The components a session mounts beside the grid. */
const COMPONENTS = [
  "components/journal/JournalEntryCard.tsx",
  "components/journal/CriticalStrip.tsx",
  "components/journal/SessionJournalSidebar.tsx",
  "features/journey-grid/SessionFlagsSheet.tsx",
  "features/tracker/StaleSessionDialog.tsx",
  "features/tracker/ClientSelectionDialog.tsx",
  "contexts/ToastContext.tsx",
  "features/unsaved-changes/LeaveConfirmDialog.tsx",
];

describe("the components a session mounts: no capitals, nothing under 11px, the navy veil", () => {
  it.each(COMPONENTS)("%s", (file) => {
    const src = read(file);
    expect(src, "a class list in capitals").not.toMatch(/(?:^|[\s"'`:])uppercase(?=[\s"'`]|$)/m);
    expect(src, "a class under 11px").not.toMatch(/text-\[(?:[0-9]|10)(?:\.\d+)?px\]/);
    expect(src, "font-black").not.toMatch(/(?:^|[\s"'`:])font-black(?=[\s"'`]|$)/m);
    // A veil is a full-bleed layer (inset-0); a dark toast or chip is not one.
    expect(src, "a raw black or slate veil").not.toMatch(/inset-0[^"'`]*bg-(?:black|slate-900)\/\d|bg-(?:black|slate-900)\/\d[^"'`]*inset-0/);
  });

  it("the two slide-over veils in the session are the navy scrim", () => {
    for (const file of ["components/journal/SessionJournalSidebar.tsx", "components/WorkoutTrackerView.tsx"]) {
      expect(read(file), file).toContain("absolute inset-0 bg-(--scrim) backdrop-blur-sm");
    }
  });
});
