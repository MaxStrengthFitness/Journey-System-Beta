/**
 * THE BODY LENS — what trains what, on the app's own anatomy model.
 *
 * Round: the Machine Catalog, Sep 28 2026 (Catalog R3 "The body and All
 * MSF"). AJ: "take the pick but use our anatomy of muscles model". The pick
 * makes the body one of the Catalog's three ways in, beside the floor and All
 * MSF: tap a part of the body (or pick it from the list beside it — nothing
 * is only on the figure, and nothing is only on hover) and see the machines
 * on this floor that train it most, the ones that help, and the MSF movements
 * this floor does not have.
 *
 * THE REGIONS ARE THE MODEL'S
 * ---------------------------
 * One region per part the body model can light (components/anatomy/
 * BodyModel, through types/machines.ts), named as a trainer would. Where the
 * model has one patch for two muscles the name says both: the model lights
 * the same "upper back" for the lats and the rhomboids, and the whole glute
 * for the hip abductors, so those regions are "Upper back and lats" and
 * "Glutes and outer hip". AJ asked to keep this model and said its markings
 * are not the most accurate; the round document lists the ones that look
 * wrong, and nothing here redraws them.
 *
 * WHICH MACHINES
 * --------------
 * A floor machine counts by its own resolved anatomy (CatalogMachine.anatomy:
 * the studio's override, else the catalog's, else MACHINE_ANATOMY), primary
 * first — "trains it most" — then secondary — "helps". The MSF movements not
 * on this floor come from MACHINE_ANATOMY, by their primary muscles only.
 *
 * PURE MODULE — no React, no Firestore.
 */

import { MACHINE_ANATOMY } from "../../data/machine-anatomy-map";
import { musclesForBodySlug, type MuscleId } from "../../types/machines";
import { MOVEMENTS, MOVEMENT_IDS, movementOf, normaliseName, type MovementNames } from "./names";
import type { CatalogMachine } from "./types";

export type RegionGroup = "upper" | "trunk" | "lower";

export interface BodyRegion {
  /** The body model's own name for the part it lights. */
  id: string;
  /** What a trainer calls it. Where the model has one patch for two, both. */
  label: string;
  group: RegionGroup;
  /** Our muscle ids the model draws on this part. */
  muscles: MuscleId[];
  /** The side of the figure it is shown on first. */
  view: "front" | "back";
  /** Other words for it, for Find ("quadriceps", "pecs", "erectors"). */
  words: string[];
}

export const REGION_GROUP_LABEL: Record<RegionGroup, string> = {
  upper: "Upper body",
  trunk: "Trunk",
  lower: "Lower body",
};

/** [model part, label, group, first view, other words], in reading order. */
const REGION_ROWS: [string, string, RegionGroup, "front" | "back", string[]][] = [
  ["neck", "Neck", "upper", "back", ["cervical", "neck extensors"]],
  ["deltoids", "Shoulders", "upper", "front", ["shoulder", "delts", "deltoid", "deltoids"]],
  ["chest", "Chest", "upper", "front", ["pecs", "pectorals", "pectoralis"]],
  ["trapezius", "Traps", "upper", "back", ["trapezius", "trap"]],
  ["upper-back", "Upper back and lats", "upper", "back", ["lats", "latissimus", "rhomboids", "upper back"]],
  ["biceps", "Biceps", "upper", "front", ["bicep"]],
  ["triceps", "Triceps", "upper", "back", ["tricep"]],
  ["forearm", "Forearms", "upper", "front", ["forearm", "grip"]],
  ["abs", "Abs", "trunk", "front", ["abdominals", "abdominal", "rectus"]],
  ["obliques", "Obliques", "trunk", "front", ["oblique", "waist"]],
  ["lower-back", "Lower back", "trunk", "back", ["low back", "erectors", "erector spinae"]],
  ["gluteal", "Glutes and outer hip", "lower", "back", ["glutes", "glute", "gluteus", "abductors", "outer hip"]],
  ["adductors", "Inner thigh", "lower", "front", ["adductors", "adductor", "groin"]],
  ["quadriceps", "Quads", "lower", "front", ["quadriceps", "quad", "front of thigh"]],
  ["hamstring", "Hamstrings", "lower", "back", ["hamstrings", "hams", "back of thigh"]],
  ["calves", "Calves", "lower", "back", ["calf", "gastrocnemius"]],
];

export const BODY_REGIONS: BodyRegion[] = REGION_ROWS.map(([id, label, group, view, words]) => ({
  id,
  label,
  group,
  view,
  words,
  muscles: musclesForBodySlug(id),
}));

/** The region a tap on the figure landed on, or null for a part no machine trains (a hand, a foot). */
export function regionForSlug(slug: string): BodyRegion | null {
  return BODY_REGIONS.find((r) => r.id === slug) ?? null;
}

export function regionById(id: string | null | undefined): BodyRegion | null {
  return id ? (BODY_REGIONS.find((r) => r.id === id) ?? null) : null;
}

const touches = (muscles: readonly MuscleId[] | undefined, region: BodyRegion) =>
  (muscles ?? []).some((m) => region.muscles.includes(m));

export interface RegionOnFloor {
  /** Floor machines whose primary muscles are here, in walking order. */
  main: CatalogMachine[];
  /** Floor machines that only assist here. */
  helps: CatalogMachine[];
  /** MSF movements that train it most and this floor has none of. */
  notHere: MovementNames[];
}

/** What trains a region: on this floor, main movers then helpers, and the MSF movements the floor lacks. */
export function regionOnFloor(region: BodyRegion, floor: CatalogMachine[]): RegionOnFloor {
  const main = floor.filter((m) => touches(m.anatomy?.primary, region));
  const helps = floor.filter((m) => !main.includes(m) && touches(m.anatomy?.secondary, region));
  const onFloor = new Set(floor.map((m) => movementOf(m)?.id).filter(Boolean) as string[]);
  const notHere = MOVEMENT_IDS.filter(
    (id) => !onFloor.has(id) && touches(MACHINE_ANATOMY[id]?.primary, region),
  ).map((id) => MOVEMENTS[id]);
  return { main, helps, notHere };
}

/** How many floor machines train each region most, for the list's counts. */
export function mainCounts(floor: CatalogMachine[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of BODY_REGIONS) out[r.id] = floor.filter((m) => touches(m.anatomy?.primary, r)).length;
  return out;
}

/** Every name a region answers to in Find, normalised: its label and its other words. */
export function regionNames(region: BodyRegion): string[] {
  return [region.label, ...region.words].map(normaliseName).filter(Boolean);
}
