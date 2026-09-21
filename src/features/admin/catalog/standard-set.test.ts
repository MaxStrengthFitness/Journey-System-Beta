import { describe, expect, it } from "vitest";
import type { MachineCatalogEntry } from "../../../types/machines";
import { CATALOG_ID_RE, catalogIdFor, migrationCommand, outsideStandard, publishPlan, reorderPlan, standardSet } from "./standard-set";

const m = (id: string, extra: Partial<MachineCatalogEntry> = {}): MachineCatalogEntry =>
  ({ id, name: id.slice(2).replace(/-/g, " "), status: "active", inStandardSet: true, defaultOrder: 10, schemaVersion: 1, ...extra }) as MachineCatalogEntry;

const catalog = [
  m("m-chest", { defaultOrder: 20 }),
  m("m-leg-press", { defaultOrder: 10 }),
  m("m-row", { defaultOrder: 30, inStandardSet: false }),
  m("m-old", { defaultOrder: 5, status: "retired" }),
  m("m-draft", { defaultOrder: 1, status: "draft" }),
];

describe("the standard set", () => {
  it("is the active machines flagged in, in defaultOrder; the rest are outside", () => {
    expect(standardSet(catalog).map((x) => x.id)).toEqual(["m-leg-press", "m-chest"]);
    expect(outsideStandard(catalog).map((x) => x.id)).toEqual(["m-row"]);
  });

  it("renumbers in tens on a move and writes only what changed", () => {
    const set = [m("a", { defaultOrder: 10 }), m("b", { defaultOrder: 20 }), m("c", { defaultOrder: 30 })];
    expect(reorderPlan(set, 2, 0)).toEqual([
      { id: "c", defaultOrder: 10 },
      { id: "a", defaultOrder: 20 },
      { id: "b", defaultOrder: 30 },
    ]);
    expect(reorderPlan(set, 0, 1)).toEqual([
      { id: "b", defaultOrder: 10 },
      { id: "a", defaultOrder: 20 },
    ]);
    expect(reorderPlan(set, 1, 1)).toEqual([]);
    expect(reorderPlan(set, 5, 0)).toEqual([]);
  });
});

/**
 * Why a plan was refused.
 *
 * Read off the object rather than narrowed to it: the repo compiles without
 * `strict`, so TypeScript will narrow a discriminated union to its `ok: true`
 * arm (`if (!r.ok) return`, the pattern used throughout) but not to the other
 * one. Reaching for the reason directly is the honest way to say that.
 */
const refusal = (r: ReturnType<typeof publishPlan>): string =>
  (r as { reason?: string }).reason ?? "";

/**
 * A definition that clears the publish gate, so a test about ids and ordering
 * is not also a test about completeness. review.test.ts owns the gate itself.
 */
const publishable = (name: string): MachineCatalogEntry =>
  ({
    name,
    anatomicalRegion: "Legs",
    movementPattern: "Lower Body: Isolation",
    kinematicClass: "simple-rotary",
    primaryMuscles: ["quads"],
    execution: {
      concentricSeconds: 6,
      eccentricSeconds: 6,
      upperTurnaround: { description: "Pause at the squeeze." },
      lowerTurnaround: { description: "Reverse before the stack touches." },
      keyCues: ["Drive through the heels."],
    },
  }) as unknown as MachineCatalogEntry;

describe("publishing a studio's machine", () => {
  it("makes a catalog id from the name, unique against the catalog", () => {
    expect(catalogIdFor("Hip Adduction", [])).toBe("m-hip-adduction");
    expect(catalogIdFor("Chest", ["m-chest"])).toBe("m-chest-2");
    expect(catalogIdFor("!!!", [])).toBe("m-machine");
    expect(CATALOG_ID_RE.test("m-hip-adduction")).toBe(true);
    expect(CATALOG_ID_RE.test("sm-solon-sled")).toBe(false);
  });

  it("builds the catalog document last in the order and outside the standard set, and refuses a bad id or a taken one", () => {
    const submission = { definition: publishable(" Sled "), studioName: "Solon" };
    const r = publishPlan(submission, catalog, "m-sled");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.doc).toMatchObject({ id: "m-sled", name: "Sled", status: "active", inStandardSet: false, defaultOrder: 40, schemaVersion: 1 });
    expect(publishPlan(submission, catalog, "m-chest").ok).toBe(false);
    expect(publishPlan(submission, catalog, "Sled").ok).toBe(false);
    expect(publishPlan({ definition: publishable(""), studioName: "Solon" }, catalog, "m-x").ok).toBe(false);
  });

  it("refuses a machine the floor would read wrong, and names what it needs", () => {
    // Every location inherits a catalog machine, so this is the one place the
    // app holds a write rather than taking a blank. review.ts owns the list.
    const noCadence = publishable("Sled");
    noCadence.execution = { ...noCadence.execution, concentricSeconds: 0, eccentricSeconds: 0 };
    const r = publishPlan({ definition: noCadence, studioName: "Solon" }, catalog, "m-sled");
    expect(r.ok).toBe(false);
    expect(refusal(r)).toContain("Every floor inherits a catalog machine");
    expect(refusal(r)).toContain("the concentric count");
    expect(refusal(r)).toContain("the eccentric count");
  });

  it("does not hold a machine for a blank a studio would override anyway", () => {
    // No dials, no baseline, no contraindications — all studio-tier, all
    // named on the panel, none of them a reason to refuse.
    const sparse = publishable("Sled");
    sparse.settingFields = [];
    sparse.defaultSettings = {};
    sparse.universalBaseline = {} as MachineCatalogEntry["universalBaseline"];
    sparse.contraindicatedFor = [];
    expect(publishPlan({ definition: sparse, studioName: "Solon" }, catalog, "m-sled").ok).toBe(true);
  });

  it("spells out the PC command that moves the studio's id onto the catalog id", () => {
    expect(migrationCommand({ machineId: "sm-solon-sled" }, "m-sled")).toBe(
      "npx tsx scripts/migrate-machine-id.ts --from sm-solon-sled --to m-sled --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa",
    );
    expect(migrationCommand({ machineId: "sm-solon-sled" }, "m-sled", true)).toContain("--to m-sled --commit ");
  });
});
