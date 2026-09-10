/**
 * WIKI — one colour and one icon per category, decided once.
 *
 * Round: Wiki Redesign, Sep 2026.
 *
 * WHY THIS IS ITS OWN FILE
 * ------------------------
 * "Colour-coded categories" only teaches anything if the colour means the same
 * thing everywhere it appears. Before this file the Catalog derived an accent
 * inside features/catalog/accents.ts, the routine builder had its own category
 * labels, and nothing gave a category an ICON at all — so a trainer learning
 * that orange means push learned it on exactly one screen.
 *
 * Everything that paints a category — index card, row stripe, article eyebrow,
 * infobox header, search result, related-machine chip — resolves it here.
 *
 * TWO VOCABULARIES ARRIVE, ONE PALETTE COMES OUT
 * ----------------------------------------------
 * The app genuinely uses two groupings and they do not nest (see the header of
 * catalog/grouping.ts): the kinematic movement pattern, which is free text on
 * the machine document, and the Academy's five programming categories. Both
 * map INTO the accent set here rather than one being rewritten as the other,
 * so a screen grouped either way still reads in the same six colours.
 *
 * PURE MODULE — no React state, no Firestore. Icons are component references,
 * which is a value, not a render.
 */

import {
  Activity,
  Anchor,
  Circle,
  Dumbbell,
  Layers,
  Target,
  Zap,
} from "lucide-react";
import type { AcademyCategory } from "../routine-builder/academy";

/**
 * The six accents, plus a neutral. Deliberately few: a colour per movement
 * pattern would be nine or more, and past about six a reader stops decoding
 * hue and starts reading the label anyway — at which point the colour is
 * decoration that has to be maintained.
 */
export type WikiAccent =
  | "push"
  | "pull"
  | "legs"
  | "posterior"
  | "trunk"
  | "hips"
  | "other";

/**
 * A lucide icon component.
 *
 * `any`, and deliberately so: this project has no `@types/react` installed
 * at all (see the windows-linux-toolchain note — it is also why components
 * here declare `key?: any` themselves). Every structural type one could write
 * for a `ForwardRefExoticComponent` resolves against React types that are not
 * present, so a precise signature would fail to compile for a reason that has
 * nothing to do with this file. Existing components in the repo use the same
 * escape hatch.
 */
export type WikiIcon = any;

export const ACCENTS: WikiAccent[] = [
  "pull",
  "push",
  "legs",
  "posterior",
  "trunk",
  "hips",
  "other",
];

/**
 * Icons. Chosen from the long-stable core of lucide rather than the most
 * literal match available, because an icon that disappears in a minor bump
 * takes the build with it. Anchor for pull and Dumbbell for push are the two
 * that carry actual meaning; the rest are consistent markers, not pictograms,
 * and the label beside them is always readable.
 */
export const ACCENT_ICON: Record<WikiAccent, WikiIcon> = {
  push: Dumbbell,
  pull: Anchor,
  legs: Activity,
  posterior: Zap,
  trunk: Layers,
  hips: Target,
  other: Circle,
};

/**
 * A group key, as an element id.
 *
 * The contents cards scroll to a section by id, and a group key under the
 * kinematic or regional grouping is authored text — "Horizontal Push", "Lower
 * Body: Posterior Chain". An `id` attribute may not contain whitespace, so it
 * is slugged here rather than at each of the two call sites that have to
 * agree on the result.
 */
export function groupElementId(key: string): string {
  const slug = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `wk-group-${slug || "other"}`;
}

/** The stroke/text colour for an accent. A token name, never a hex. */
export function accentVar(accent: WikiAccent): string {
  return `var(--wk-cat-${accent})`;
}

/** The tinted background for an accent. */
export function accentFillVar(accent: WikiAccent): string {
  return `var(--wk-cat-${accent}-fill)`;
}

/**
 * The CSS custom properties an accented element needs, as a style object.
 *
 * Returned together so a component sets one spread rather than remembering two
 * variable names — the pair going out of sync is exactly how the old catalog
 * ended up with an orange stripe over a blue fill.
 */
export function accentStyle(accent: WikiAccent): Record<string, string> {
  return {
    "--wk-accent": accentVar(accent),
    "--wk-accent-fill": accentFillVar(accent),
  };
}

/**
 * A free-text movement pattern -> an accent.
 *
 * Substring matching on purpose: `movementPattern` is authored text on the
 * machine document ("Horizontal Push", "Lower Body: Posterior Chain") and a
 * studio adding its own equipment will write something this file has never
 * seen. An unknown pattern lands on "other" and renders correctly in grey; it
 * never throws and never silently borrows another category's colour.
 *
 * Order matters. "Posterior" is checked before "pull" because
 * "Lower Body: Posterior Chain — Pull" is a real phrasing and the posterior
 * chain is the more useful answer for it.
 */
export function accentForPattern(pattern: string | null | undefined): WikiAccent {
  const p = (pattern ?? "").toLowerCase();
  if (!p) return "other";
  if (p.includes("posterior") || p.includes("hamstring")) return "posterior";
  if (p.includes("hip") || p.includes("abduct") || p.includes("adduct")) return "hips";
  if (p.includes("core") || p.includes("trunk") || p.includes("spine")) return "trunk";
  if (p.includes("quad") || p.includes("leg") || p.includes("calf")) return "legs";
  if (p.includes("push") || p.includes("press") || p.includes("extension")) return "push";
  if (p.includes("pull") || p.includes("row") || p.includes("curl")) return "pull";
  if (p.includes("isolation")) return "trunk";
  return "other";
}

/** An Academy programming category -> an accent. Exhaustive, so no fallback. */
export const ACADEMY_ACCENT: Record<AcademyCategory, WikiAccent> = {
  "upper-pull": "pull",
  "upper-push": "push",
  legs: "legs",
  trunk: "trunk",
  hips: "hips",
};

export function accentForAcademyCategory(
  category: AcademyCategory | null | undefined,
): WikiAccent {
  return category ? (ACADEMY_ACCENT[category] ?? "other") : "other";
}

/**
 * A group key from catalog/grouping.ts -> an accent, for whichever grouping
 * mode is live.
 *
 * Under "academy" the key IS the category id, so the exhaustive map above
 * answers directly. Under the other two the key is authored text and the
 * substring matcher does. One entry point means the index, the rail and the
 * article cannot disagree about a group's colour.
 */
export function accentForGroupKey(key: string, mode: string): WikiAccent {
  if (mode === "academy") {
    return accentForAcademyCategory(key as AcademyCategory);
  }
  return accentForPattern(key);
}
