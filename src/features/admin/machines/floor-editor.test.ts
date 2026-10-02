import { describe, expect, it } from "vitest";
import type { MachineCatalogEntry, ResolvedMachine, StudioMachineRosterEntry } from "../../../types/machines";
import { addableFromMsf, moveInOrder, onFloor, orderForNewMachine, orderReach } from "./floor-editor";

const resolved = (machineId: string, over: Partial<ResolvedMachine> = {}): ResolvedMachine =>
  ({ machineId, name: machineId.toUpperCase(), studioId: "solon", source: "catalog", rosterStatus: "active", order: 0, comparisonKey: machineId, overriddenFields: [], ...over }) as ResolvedMachine;

const entry = (machineId: string, over: Partial<StudioMachineRosterEntry> = {}): StudioMachineRosterEntry =>
  ({ machineId, studioId: "solon", source: "catalog", basedOn: machineId, status: "active", ...over }) as StudioMachineRosterEntry;

const catalog = (id: string, over: Partial<MachineCatalogEntry> = {}): MachineCatalogEntry =>
  ({ id, name: id, status: "active", inStandardSet: true, defaultOrder: 10, schemaVersion: 1, ...over }) as MachineCatalogEntry;

describe("the floor, as the editor lists it", () => {
  it("is what is on the roster and not switched off, in walking order; out of service still counts", () => {
    const machines = [
      resolved("m-leg-press"),
      resolved("m-lumbar", { rosterStatus: "maintenance" }),
      resolved("m-chest-press", { rosterStatus: "inactive" }),
      resolved("m-neck", { rosterStatus: "inactive" }),
    ];
    const rostered = new Set(["m-leg-press", "m-lumbar", "m-chest-press"]);
    expect(onFloor(machines, rostered).map((m) => m.machineId)).toEqual(["m-leg-press", "m-lumbar"]);
  });
});

describe("Add from MSF", () => {
  const machines = [
    resolved("m-leg-press"),
    resolved("m-lumbar", { rosterStatus: "inactive" }), // switched off here
    resolved("m-neck", { rosterStatus: "inactive" }), // never rostered, in the standard
    resolved("m-hip-sled", { rosterStatus: "inactive" }), // never rostered, outside the standard
    resolved("m-old", { rosterStatus: "inactive" }), // retired
    resolved("sm-solon-sled", { source: "custom", rosterStatus: "active" }),
  ];
  const rosterEntries = [entry("m-leg-press"), entry("m-lumbar", { status: "inactive" }), entry("sm-solon-sled", { source: "custom" })];
  const cat = [
    catalog("m-leg-press"),
    catalog("m-lumbar"),
    catalog("m-neck"),
    catalog("m-hip-sled", { inStandardSet: false }),
    catalog("m-old", { status: "retired" }),
  ];

  it("offers the standard's machines first, then the rest of the catalog, then what the studio switched off", () => {
    const a = addableFromMsf({ machines, rosterEntries, catalog: cat });
    expect(a.standard.map((x) => x.machineId)).toEqual(["m-neck"]);
    expect(a.others.map((x) => x.machineId)).toEqual(["m-hip-sled"]);
    expect(a.switchedOff).toEqual([{ machineId: "m-lumbar", name: "M-LUMBAR", switchedOff: true }]);
  });

  it("offers back a studio's own machine it took off the floor (retired, never deleted: AJ, Oct 2 2026)", () => {
    const a = addableFromMsf({
      machines: [...machines, resolved("sm-solon-bench", { source: "custom", rosterStatus: "inactive" })],
      rosterEntries: [...rosterEntries, entry("sm-solon-bench", { source: "custom", status: "inactive" })],
      catalog: cat,
    });
    expect(a.switchedOff.map((x) => x.machineId)).toEqual(["m-lumbar", "sm-solon-bench"]);
  });

  it("never offers a retired machine, one already on the floor, or a studio's own on the floor", () => {
    const a = addableFromMsf({ machines, rosterEntries, catalog: cat });
    const all = [...a.standard, ...a.others, ...a.switchedOff].map((x) => x.machineId);
    expect(all).not.toContain("m-old");
    expect(all).not.toContain("m-leg-press");
    expect(all).not.toContain("sm-solon-sled");
  });
});

describe("where a machine added now goes", () => {
  it("joins the end of a walking order the studio keeps", () => {
    expect(orderForNewMachine([entry("a", { order: 1 }), entry("b", { order: 2 }), entry("c", { order: 7 })])).toBe(8);
  });

  it("takes its place in the standard order when the studio keeps none", () => {
    expect(orderForNewMachine([entry("a"), entry("b")])).toBeNull();
  });

  it("doesn't count a switched-off machine's old place", () => {
    expect(orderForNewMachine([entry("a", { order: 3 }), entry("b", { order: 30, status: "inactive" })])).toBe(4);
  });
});

describe("the walking order, one place at a time", () => {
  it("moves a machine up or down, and leaves the ends where they are", () => {
    const ids = ["a", "b", "c"];
    expect(moveInOrder(ids, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(ids, 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveInOrder(ids, 0, -1)).toEqual(ids);
    expect(moveInOrder(ids, 2, 1)).toEqual(ids);
    // Never the list it was given.
    expect(moveInOrder(ids, 0, 1)).not.toBe(ids);
  });

  it("says whom the order reaches", () => {
    expect(orderReach("Solon")).toBe("Saves for everyone at Solon: the Catalog, the Journey grid and the session walk the floor in this order.");
  });
});
