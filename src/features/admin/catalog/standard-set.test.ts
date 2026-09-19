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

describe("publishing a studio's machine", () => {
  it("makes a catalog id from the name, unique against the catalog", () => {
    expect(catalogIdFor("Hip Adduction", [])).toBe("m-hip-adduction");
    expect(catalogIdFor("Chest", ["m-chest"])).toBe("m-chest-2");
    expect(catalogIdFor("!!!", [])).toBe("m-machine");
    expect(CATALOG_ID_RE.test("m-hip-adduction")).toBe(true);
    expect(CATALOG_ID_RE.test("sm-solon-sled")).toBe(false);
  });

  it("builds the catalog document last in the order and outside the standard set, and refuses a bad id or a taken one", () => {
    const submission = { definition: { name: " Sled " } as MachineCatalogEntry, studioName: "Solon" };
    const r = publishPlan(submission, catalog, "m-sled");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.doc).toMatchObject({ id: "m-sled", name: "Sled", status: "active", inStandardSet: false, defaultOrder: 40, schemaVersion: 1 });
    expect(publishPlan(submission, catalog, "m-chest").ok).toBe(false);
    expect(publishPlan(submission, catalog, "Sled").ok).toBe(false);
    expect(publishPlan({ definition: { name: "" } as MachineCatalogEntry, studioName: "Solon" }, catalog, "m-x").ok).toBe(false);
  });

  it("spells out the PC command that moves the studio's id onto the catalog id", () => {
    expect(migrationCommand({ machineId: "sm-solon-sled" }, "m-sled")).toBe(
      "npx tsx scripts/migrate-machine-id.ts --from sm-solon-sled --to m-sled --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa",
    );
    expect(migrationCommand({ machineId: "sm-solon-sled" }, "m-sled", true)).toContain("--to m-sled --commit ");
  });
});
