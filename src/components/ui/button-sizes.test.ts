import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

/**
 * THE SHARED PRIMITIVES, RAISED, SUNK AND 40px (type and depth, phase 4,
 * Oct 4 2026; AJ's answers "1a 2a 3b").
 *
 * AJ: "a lot of buttons and backgrounds in the app currently have a sharp
 * cutoff look ... borders and headers just needs a little bit of weight and
 * depth ... add some dropshadows". His answer 2A: buttons keep the firm 3:1
 * outline he said yes to that day, and gain a lighter face, a small lift and
 * a press. This file holds what src/components/ui gives every screen:
 *
 *   1. Every Button size is at least 40px tall (44 for lg), the icon sizes
 *      included, and no caller shrinks one back under 40: nothing tappable
 *      under 40px (CLAUDE.md). jsdom loads no Tailwind, so a computed
 *      min-height can't be measured; the class strings are what is read.
 *   2. No Button, tab or caller animates a shadow: a transition never names
 *      `all` or `shadow` (rule 5 of the plan). The press is a transform.
 *   3. The outline Button is raised ON its 3:1 --input edge, on --raised,
 *      never the page colour (today's bg-background) or the decorative
 *      --border; the solid one has its tinted drop.
 *   4. A dialog lifts (--elev-5) over the navy scrim; a sheet, a menu and a
 *      select's list are popovers (--elev-4); a Card lifts with its edge.
 *   5. The tabs are a sunk tray with the picked one raised out of it;
 *      fields keep their 3:1 edge and sink into a well (never bg-muted,
 *      which goes LIGHTER in dark).
 *   6. A shadow in a className is shadow-(--token) or a named size, never
 *      shadow-[var(...)...]: tailwind-merge files that as a shadow COLOUR,
 *      so a caller's shadow-none would not remove it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const words = (classes: string) => classes.split(/\s+/).filter(Boolean);
const has = (classes: string, cls: string) => words(classes).includes(cls);

/** A Tailwind height or size class, unprefixed (no `sm:` or `data-…:`), in px; null if it is not one. */
function basePx(cls: string): number | null {
  const m = /^!?(?:h|size|min-h)-(?:(\d+(?:\.\d+)?)|\[(\d+(?:\.\d+)?)px\])!?$/.exec(cls);
  if (!m) return null;
  return m[1] !== undefined ? Number(m[1]) * 4 : Number(m[2]);
}

/** Every Tailwind class a transition sets, unprefixed or not. */
const transitions = (classes: string) => words(classes).filter((c) => /(^|:)transition(-|$)/.test(c));
/** A transition that would animate box-shadow: `transition-all`, `transition-shadow`, or a list naming it. */
const animatesShadow = (cls: string) =>
  /(^|:)transition-(all|shadow)$/.test(cls) || /(^|:)transition-\[[^\]]*(box-shadow|shadow|all)[^\]]*\]$/.test(cls);

/* ---------------------------------------------------------------------------
   The Button's own variants, read from its source so a new size is checked
   --------------------------------------------------------------------------- */

const BUTTON_SOURCE = read("components/ui/button.tsx");
const SIZE_BLOCK = /size:\s*\{([\s\S]*?)\n\s{6}\},/.exec(BUTTON_SOURCE)?.[1] ?? "";
const SIZES = [...SIZE_BLOCK.matchAll(/^\s*"?([\w-]+)"?:/gm)].map((m) => m[1]);
type Size = NonNullable<Parameters<typeof buttonVariants>[0]>["size"];
type Variant = NonNullable<Parameters<typeof buttonVariants>[0]>["variant"];

describe("every Button size reaches 40px", () => {
  it("finds the sizes in button.tsx", () => {
    expect(SIZES).toEqual(["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"]);
  });

  it.each(SIZES)("%s", (size) => {
    const classes = buttonVariants({ size: size as Size });
    const heights = words(classes).map(basePx).filter((px): px is number => px !== null);
    expect(heights.length, `${size}: a height or size class`).toBeGreaterThan(0);
    for (const px of heights) expect(px, `${size}: ${classes}`).toBeGreaterThanOrEqual(40);
    expect(
      words(classes).some((c) => ["h-10", "h-11", "min-h-10", "size-10", "size-11"].includes(c)),
      `${size} names h-10, h-11, min-h-10, size-10 or size-11`,
    ).toBe(true);
  });

  it("the parser itself", () => {
    expect(["h-8", "size-9", "h-[38px]", "min-h-10", "h-11!", "sm:h-6", "w-4"].map(basePx)).toEqual([32, 36, 38, 40, 44, null, null]);
  });
});

describe("the Button never animates a shadow, and presses with a transform", () => {
  const base = buttonVariants({ variant: "ghost", size: "default" });

  it("keeps the focus ring on the base", () => {
    expect(has(base, "focus-visible:ring-3")).toBe(true);
  });

  it("transitions colours, opacity and the transform, never all or a shadow", () => {
    expect(transitions(base)).toEqual(["transition-[color,background-color,border-color,opacity,transform]"]);
    expect(transitions(base).filter(animatesShadow)).toEqual([]);
    expect(has(base, "active:not-aria-[haspopup]:translate-y-px")).toBe(true);
  });

  it("the transition scanner catches every way of naming a shadow", () => {
    expect(["transition-all", "hover:transition-shadow", "transition-[opacity,box-shadow]", "transition-colors", "transition-[color,transform]"].map(animatesShadow)).toEqual([
      true, true, true, false, false,
    ]);
  });
});

describe("the outline Button is raised on its 3:1 edge (AJ's 2A)", () => {
  const outline = buttonVariants({ variant: "outline" });

  it("draws --input, the 3:1 control edge, and not the decorative --border", () => {
    expect(has(outline, "border-input")).toBe(true);
    expect(has(outline, "border-border")).toBe(false);
    expect(words(outline).filter((c) => /^dark:border-/.test(c))).toEqual([]);
  });

  it("sits on --raised, never the page colour", () => {
    expect(has(outline, "bg-(--raised)")).toBe(true);
    expect(words(outline).filter((c) => /(^|:)bg-(background|input\/30)$/.test(c) && !/hover/.test(c))).toEqual([]);
  });

  it("lifts with its top light, and presses in", () => {
    expect(has(outline, "shadow-(--raised-lift)")).toBe(true);
    expect(has(outline, "active:not-aria-[haspopup]:shadow-(--press)")).toBe(true);
  });

  it("the solid blue Button has its tinted drop, and presses in", () => {
    const solid = buttonVariants({ variant: "default" });
    expect(has(solid, "shadow-(--solid-lift)")).toBe(true);
    expect(has(solid, "active:not-aria-[haspopup]:shadow-(--press)")).toBe(true);
  });

  it("speaks in the button voice, 14/700", () => {
    const anyButton = buttonVariants({ variant: "outline" as Variant });
    expect(has(anyButton, "text-sm")).toBe(true);
    expect(has(anyButton, "font-bold")).toBe(true);
  });

  it("a caller's shadow class still replaces the lift (tailwind-merge files shadow-(--x) as a shadow)", () => {
    expect(words(cn(buttonVariants({ variant: "outline" }), "shadow-none"))).not.toContain("shadow-(--raised-lift)");
    expect(words(cn(buttonVariants({ variant: "default" }), "shadow-lg shadow-primary/20"))).not.toContain("shadow-(--solid-lift)");
    // The trap this avoids: an arbitrary shadow that starts with var() is
    // filed as a COLOUR, so shadow-none leaves it in place.
    expect(words(cn("shadow-[var(--elev-1),inset_0_1px_0_var(--highlight)]", "shadow-none"))).toContain(
      "shadow-[var(--elev-1),inset_0_1px_0_var(--highlight)]",
    );
  });

  it("index.css declares the three lifts a className reads, in :root and .dark", () => {
    const css = read("index.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const root = css.slice(css.indexOf("\n:root {"), css.indexOf("\n}", css.indexOf("\n:root {")));
    const dark = css.slice(css.indexOf("\n.dark {"), css.indexOf("\n}", css.indexOf("\n.dark {")));
    const LIFTS: Record<string, string> = {
      "--raised-lift": "var(--elev-1), inset 0 1px 0 var(--highlight)",
      "--solid-lift": "var(--glow-live), var(--solid-light)",
      "--go-lift": "var(--glow-go), var(--go-light)",
    };
    for (const [name, value] of Object.entries(LIFTS)) {
      expect(root, `${name} in :root`).toContain(`${name}: ${value};`);
      expect(dark, `${name} in .dark`).toContain(`${name}: ${value};`);
    }
  });
});

/* ---------------------------------------------------------------------------
   Dialogs, sheets, menus, cards
   --------------------------------------------------------------------------- */

/** The class string the first `<tag` … className={cn("…"` (or `="…"`) in a file sets. */
function classesOf(rel: string, slot: string): string {
  const source = read(rel);
  const at = source.indexOf(`data-slot="${slot}"`);
  expect(at, `${rel}: data-slot="${slot}"`).toBeGreaterThan(-1);
  const m = /className=\{?(?:cn\()?\s*(?:\/\/[^\n]*\n\s*)*["`]([^"`]*)["`]/.exec(source.slice(at));
  expect(m, `${rel}: ${slot}'s classes`).not.toBeNull();
  return m![1];
}

describe("a dialog lifts over a navy veil", () => {
  it("DialogContent takes --elev-5 and the panel edge", () => {
    const content = classesOf("components/ui/dialog.tsx", "dialog-content");
    expect(has(content, "shadow-2xl")).toBe(true);
    expect(has(content, "ring-(--edge)")).toBe(true);
    expect(has(content, "ring-foreground/10")).toBe(false);
  });

  it("the overlays are the navy scrim, not black", () => {
    for (const [file, slot] of [["components/ui/dialog.tsx", "dialog-overlay"], ["components/ui/sheet.tsx", "sheet-overlay"]]) {
      const overlay = classesOf(file, slot);
      expect(has(overlay, "bg-(--scrim)"), `${slot}`).toBe(true);
      expect(words(overlay).filter((c) => /bg-black/.test(c)), `${slot}`).toEqual([]);
    }
  });

  it("DialogTitle is the panel-title voice: 17/700, -0.01em, a line-height a wrapped title can live with", () => {
    const title = classesOf("components/ui/dialog.tsx", "dialog-title");
    for (const cls of ["text-[17px]", "font-bold", "tracking-[-0.01em]", "leading-tight"]) expect(has(title, cls), cls).toBe(true);
    expect(has(title, "leading-none")).toBe(false);
  });

  it("a sheet is a popover, cast upward when it rises from the bottom, with the panel edge", () => {
    const sheet = classesOf("components/ui/sheet.tsx", "sheet-content");
    expect(has(sheet, "shadow-xl")).toBe(true);
    expect(has(sheet, "data-[side=bottom]:shadow-(--elev-4-up)")).toBe(true);
    expect(has(sheet, "border-(--edge)")).toBe(true);
    expect(transitions(sheet).filter((c) => /transition-(all|shadow)$/.test(c))).toEqual([]);
  });

  it("menus and a select's list are popovers with the panel edge", () => {
    for (const [file, slot] of [
      ["components/ui/dropdown-menu.tsx", "dropdown-menu-content"],
      ["components/ui/dropdown-menu.tsx", "dropdown-menu-sub-content"],
      ["components/ui/select.tsx", "select-content"],
    ]) {
      const source = read(file);
      const at = source.indexOf(`data-slot="${slot}"`);
      const popup = /rounded-lg bg-popover[^"]*/.exec(source.slice(at))?.[0] ?? "";
      expect(has(popup, "shadow-xl"), slot).toBe(true);
      expect(has(popup, "ring-(--edge)"), slot).toBe(true);
      expect(words(popup).filter((c) => /^shadow-(md|lg)$|ring-foreground/.test(c)), slot).toEqual([]);
    }
  });

  it("a menu's and a select's items are 40px tall", () => {
    for (const [file, slots] of [
      ["components/ui/dropdown-menu.tsx", ["dropdown-menu-item", "dropdown-menu-sub-trigger", "dropdown-menu-checkbox-item", "dropdown-menu-radio-item"]],
      ["components/ui/select.tsx", ["select-item"]],
    ] as const) {
      for (const slot of slots) expect(has(classesOf(file, slot), "min-h-10"), slot).toBe(true);
    }
  });

  it("a Card lifts with an edge seen from outside it", () => {
    const card = classesOf("components/ui/card.tsx", "card");
    for (const cls of ["border", "border-(--edge)", "bg-clip-padding", "shadow-md"]) expect(has(card, cls), cls).toBe(true);
    expect(has(card, "ring-foreground/10")).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
   Tabs and fields
   --------------------------------------------------------------------------- */

describe("the tabs are a sunk tray with the picked tab raised out of it", () => {
  const source = read("components/ui/tabs.tsx");
  const list = /const tabsListVariants = cva\(\s*"([^"]*)"/.exec(source)![1];
  const trayVariant = /default:\s*"([^"]*)"/.exec(source)![1];
  const trigger = classesOf("components/ui/tabs.tsx", "tabs-trigger");
  const triggerAll = /data-slot="tabs-trigger"[\s\S]*?className=\{cn\(([\s\S]*?)className\s*\)/.exec(source)![1];

  it("the tray sinks: --tray and the well's inset, never bg-muted", () => {
    expect(words(trayVariant)).toEqual(["bg-(--tray)", "shadow-(--elev-0)"]);
    expect(has(list, "group-data-horizontal/tabs:h-12")).toBe(true);
    expect(has(list, "p-1")).toBe(true);
  });

  it("a tab is 40px and never animates a shadow", () => {
    expect(has(trigger, "min-h-10")).toBe(true);
    expect(transitions(trigger)).toEqual(["transition-[color,background-color,border-color,opacity]"]);
  });

  it("the picked tab is raised: --raised, the lift and a soft ring, in 700", () => {
    for (const cls of [
      "data-active:bg-(--raised)",
      "data-active:font-bold",
      "group-data-[variant=default]/tabs-list:data-active:shadow-(--raised-lift)",
      "group-data-[variant=default]/tabs-list:data-active:border-(--edge-control)",
    ]) expect(triggerAll, cls).toContain(cls);
    expect(triggerAll).not.toMatch(/data-active:bg-input|data-active:bg-card|data-active:shadow-sm/);
  });
});

describe("fields keep their 3:1 edge and sink", () => {
  for (const [file, slot] of [
    ["components/ui/input.tsx", "input"],
    ["components/ui/textarea.tsx", "textarea"],
    ["components/ui/select.tsx", "select-trigger"],
  ]) {
    it(`${slot}`, () => {
      const field = classesOf(file, slot);
      expect(has(field, "border-input"), "the 3:1 edge").toBe(true);
      expect(has(field, "bg-(--well)")).toBe(true);
      expect(has(field, "shadow-(--elev-0)")).toBe(true);
      expect(words(field).filter((c) => /^(dark:)?bg-(muted|input\/30|transparent)$/.test(c))).toEqual([]);
    });
  }

  it("an Input and a select's trigger are 40px", () => {
    expect(has(classesOf("components/ui/input.tsx", "input"), "h-10")).toBe(true);
    const trigger = classesOf("components/ui/select.tsx", "select-trigger");
    expect(has(trigger, "data-[size=default]:h-10")).toBe(true);
    expect(has(trigger, "data-[size=sm]:h-10")).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
   The callers: none shrinks a Button, none animates its shadow
   --------------------------------------------------------------------------- */

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

/** The attributes of the JSX tag that opens at `start`, up to its `>` outside every {…} and string. */
function attributes(source: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "`" || (ch === "'" && depth > 0)) quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return source.slice(start, i);
  }
  return source.slice(start);
}

/** The value of a tag's className: a "string", or a {expression} read to its closing brace. */
function classNameValue(attrs: string): string {
  const at = attrs.search(/(?<![\w-])className=/);
  if (at < 0) return "";
  const start = at + "className=".length;
  if (attrs[start] === '"') return attrs.slice(start + 1, attrs.indexOf('"', start + 1));
  let depth = 0;
  for (let i = start; i < attrs.length; i++) {
    if (attrs[i] === "{") depth++;
    else if (attrs[i] === "}" && --depth === 0) return attrs.slice(start + 1, i);
  }
  return attrs.slice(start);
}

/** Every `<Button …>` from components/ui/button: where it is, and the classes its className literals name. */
const CALLERS = tsxFiles(SRC)
  .filter((p) => /components\/ui\/button["']/.test(readFileSync(p, "utf8")))
  .flatMap((p) => {
    const source = readFileSync(p, "utf8");
    const rel = p.slice(SRC.length + 1).split("\\").join("/");
    return [...source.matchAll(/<Button\b/g)].map((m) => {
      const value = classNameValue(attributes(source, m.index! + "<Button".length));
      // A plain string is the classes; an expression's are its string literals.
      const literals = /["`]/.test(value) ? [...value.matchAll(/"([^"]*)"|`([^`]*)`/g)].map((l) => l[1] ?? l[2]).join(" ") : value;
      return { where: `${rel}:${source.slice(0, m.index).split("\n").length}`, classes: literals };
    });
  });

describe("no caller shrinks a Button under 40px or animates its shadow", () => {
  it("finds the callers", () => {
    expect(CALLERS.length).toBeGreaterThan(60);
  });

  it("no caller sets a height or size under 40px", () => {
    const small = CALLERS.flatMap(({ where, classes }) =>
      words(classes)
        .filter((c) => {
          const px = basePx(c);
          return px !== null && px < 40;
        })
        .map((c) => `${where} ${c}`),
    );
    expect(small).toEqual([]);
  });

  it("no caller brings back transition-all or a shadow transition", () => {
    const bad = CALLERS.flatMap(({ where, classes }) => transitions(classes).filter(animatesShadow).map((c) => `${where} ${c}`));
    expect(bad).toEqual([]);
  });

  it("the frame's icon buttons are 40px at every width", () => {
    // AppContent hands these to the Refresh, theme, feedback and Settings
    // buttons on the header and in the avatar menu. They were 36px on a
    // phone (h-9, sm:h-10).
    const app = read("AppContent.tsx");
    for (const name of ["headerIconClass", "menuIconClass"]) {
      const classes = new RegExp(`const ${name} =\\s*"([^"]*)"`).exec(app)?.[1] ?? "";
      expect(classes, name).not.toBe("");
      const heights = words(classes).map(basePx).filter((px): px is number => px !== null);
      expect(heights, name).toEqual([40]);
    }
  });
});

describe("a className never writes a shadow as shadow-[var(...)]", () => {
  it("tailwind-merge would file it as a colour; use shadow-(--token)", () => {
    const bad = tsxFiles(SRC).flatMap((p) => {
      // Comments may name the trap; code may not. A block comment keeps its
      // newlines so a line number still points at the code.
      const source = readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
        .replace(/^\s*\/\/.*$/gm, "");
      return [...source.matchAll(/(?<![\w-])(?:[\w-]+:)*(?:inset-)?shadow-\[var\(/g)].map(
        (m) => `${p.slice(SRC.length + 1).split("\\").join("/")}:${source.slice(0, m.index).split("\n").length}`,
      );
    });
    expect(bad).toEqual([]);
  });
});
