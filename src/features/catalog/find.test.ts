import { describe, expect, it } from "vitest";
import { BODY_REGIONS, regionNames } from "./body-lens";
import { findOnFloor, findUnitsFrom, type FindHit, type FindUnit } from "./find";
import { MOVEMENTS, movementsWithAliases } from "./names";
import type { CatalogMachine } from "./types";

/** A floor machine with only what Find reads. */
function unit(id: string, name: string, over: Partial<FindUnit> = {}): FindUnit {
  return {
    id,
    name,
    movement: MOVEMENTS[id] ?? null,
    maker: null,
    requiresHandoff: false,
    neverToFailure: false,
    outOfService: false,
    flagged: false,
    muscles: [],
    lines: [],
    ...over,
  };
}

const FLOOR: FindUnit[] = [
  unit("m-neck", "CX (4 WAY NECK)", { requiresHandoff: true, neverToFailure: true }),
  unit("m-leg-press", "LEG PRESS", { maker: "Nautilus", muscles: ["Quadriceps (knee extension)", "Gluteus Maximus"] }),
  unit("sm-solon-leg-press-2", "LEG PRESS 2", {
    movement: MOVEMENTS["m-leg-press"],
    maker: "Hoist",
    lines: [{ section: "Clinical warnings", text: "Knees never lock. Stop at once if a headache comes on during the set." }],
  }),
  unit("m-lumbar", "LUMBAR", { neverToFailure: true, outOfService: true }),
  unit("m-compound-row", "COMPOUND ROW", { requiresHandoff: true, flagged: true }),
];

const find = (query: string, units = FLOOR) => findOnFloor({ query, units, studioName: "Solon" });
const label = (h: FindHit | null) => (h ? h.label : null);
const inGroup = (query: string, key: FindHit["kind"]) =>
  find(query).groups.find((g) => g.key === key)?.hits.map((h) => h.label) ?? [];

describe("Find with head office's own names (wave 2)", () => {
  const table = movementsWithAliases({ "m-lumbar": ["Bad Back Box"], "m-pulldown": ["The Lat Tower"] });
  const floorWith = () =>
    findUnitsFrom(
      [
        { id: "m-lumbar", name: "LUMBAR", comparisonKey: "m-lumbar", rosterStatus: "active", requiresHandoff: false, targetMuscles: [], synergists: [], clinicalWarnings: [], setup: "", setupCues: [], execution: "", executionCues: [], contraindicatedFor: [] } as unknown as CatalogMachine,
      ],
      { movements: table },
    );

  it("opens a unit on this floor by a name head office added", () => {
    const r = findOnFloor({ query: "bad back box", units: floorWith(), studioName: "Solon", movements: table });
    expect(r.top?.kind).toBe("unit");
    expect(r.top?.label).toBe("LUMBAR");
  });

  it("opens a movement the floor lacks in All MSF by head office's name for it", () => {
    const r = findOnFloor({ query: "the lat tower", units: floorWith(), studioName: "Solon", movements: table });
    expect(r.top).toMatchObject({ kind: "movement", movementId: "m-pulldown" });
  });

  it("knows none of them without the merged table", () => {
    expect(findOnFloor({ query: "bad back box", units: findUnitsFrom([]), studioName: "Solon" }).none).toBe(true);
  });
});

describe("Find on the floor", () => {
  it("opens the Lumbar from every name it goes by", () => {
    for (const q of ["LUMBAR", "Low Back", "lumb", "Lumbar Extension", "lower back"]) {
      const r = find(q);
      expect(r.top?.kind, q).toBe("unit");
      expect(label(r.top), q).toBe("LUMBAR");
    }
  });

  it("opens the neck machine by its Academy name, its code and its floor name", () => {
    for (const q of ["cervical extension", "Cx", "cx 4 way neck", "neck"]) {
      expect(label(find(q).top), q).toBe("CX (4 WAY NECK)");
    }
  });

  it("jumps to the floor's second leg press on lp2, in walking order", () => {
    expect(label(find("lp2").top)).toBe("LEG PRESS 2");
    expect(label(find("LP 2").top)).toBe("LEG PRESS 2");
    expect(label(find("lp1").top)).toBe("LEG PRESS");
  });

  it("shows both leg presses for 'leg press' rather than guessing which", () => {
    const r = find("leg press");
    // The unit literally named LEG PRESS is exact; the movement is a filter
    // over both units, and both units are listed.
    expect(inGroup("leg press", "unit")).toEqual(expect.arrayContaining(["LEG PRESS 2"]));
    const filter = r.groups.find((g) => g.key === "filter")?.hits[0];
    expect(filter?.kind).toBe("filter");
    if (filter?.kind === "filter") expect(filter.filter.unitIds).toEqual(["m-leg-press", "sm-solon-leg-press-2"]);
  });

  it("filters the floor on a switch or a maker, with the count", () => {
    const handoff = find("handoff").top;
    expect(handoff?.kind).toBe("filter");
    if (handoff?.kind === "filter") expect(handoff.filter.unitIds).toEqual(["m-neck", "m-compound-row"]);
    expect(handoff?.sub).toBe("2 on Solon's floor");
    const hoist = find("hoist").top;
    expect(hoist?.kind === "filter" && hoist.filter.unitIds).toEqual(["sm-solon-leg-press-2"]);
    expect(find("never to failure").top?.sub).toBe("2 on Solon's floor");
  });

  it("offers no Flagged filter when the flags could not be read", () => {
    const unknown = FLOOR.map((u) => ({ ...u, flagged: null }));
    expect(find("flagged", unknown).none).toBe(true);
    expect(label(find("flagged").top)).toBe("Flagged");
  });

  it("finds a line inside a page, never as the top match", () => {
    const r = find("headache");
    expect(r.top).toBeNull();
    const line = r.groups.find((g) => g.key === "line")?.hits[0];
    expect(line?.kind).toBe("line");
    if (line?.kind === "line") {
      expect(line.unitId).toBe("sm-solon-leg-press-2");
      expect(line.section).toBe("Clinical warnings");
      // The whole sentence, never a cut fragment.
      expect(line.text).toBe("Stop at once if a headache comes on during the set.");
    }
  });

  it("finds a machine by a muscle its page names, below a name", () => {
    expect(inGroup("glute", "unit")).toEqual(["LEG PRESS"]);
    expect(find("glute").top).toBeNull();
  });

  it("sends a movement this floor does not have to All MSF, never inventing a unit", () => {
    const r = find("torso arm");
    expect(r.top?.kind).toBe("movement");
    expect(label(r.top)).toBe("Pulldown");
    expect(r.top?.sub).toBe("Pd · Not on Solon's floor");
  });

  it("ranks the Extensions together for 'extension' rather than picking the Leg Extension", () => {
    const r = find("extension");
    expect(r.top).toBeNull();
    // The two Extensions by name first; the leg press follows only because
    // its muscles say "knee extension".
    expect(inGroup("extension", "unit")).toEqual(["CX (4 WAY NECK)", "LUMBAR", "LEG PRESS"]);
  });

  it("says plainly when nothing goes by that name", () => {
    const r = find("zzq");
    expect(r.none).toBe(true);
    expect(r.groups).toEqual([]);
  });

  it("is empty, not 'nothing found', before anything is typed", () => {
    const r = find("   ");
    expect(r.none).toBe(false);
    expect(r.top).toBeNull();
  });

  it("keeps the Academy's name off a row whose floor name already says it", () => {
    expect(find("LEG PRESS 2").top?.sub).toBe("LP");
    expect(find("LUMBAR").top?.sub).toBe("Lumbar Extension · Lumb · Out of service");
  });
});

describe("Find knows the body (Catalog R3)", () => {
  const regions = BODY_REGIONS.map((r) => ({ id: r.id, label: r.label, names: regionNames(r), mainCount: r.id === "upper-back" ? 2 : 0 }));
  const withBody = (query: string) => findOnFloor({ query, units: FLOOR, studioName: "Solon", regions });

  it("opens the body lens on a muscle's own name", () => {
    const r = withBody("lats");
    expect(r.top?.kind).toBe("muscle");
    expect(r.top?.label).toBe("Upper back and lats");
    expect(r.top?.sub).toBe("2 on Solon's floor train it most");
  });

  it("says plainly when nothing on the floor trains a part most", () => {
    const r = withBody("quadriceps");
    expect(r.top?.kind).toBe("muscle");
    expect(r.top?.sub).toBe("Nothing on Solon's floor trains it most");
  });

  it("still opens the neck machine first on 'neck', the body lens beside it", () => {
    const r = withBody("neck");
    expect(r.top?.kind).toBe("unit");
    expect(r.groups.find((g) => g.key === "muscle")?.hits[0]?.label).toBe("Neck");
  });
});

describe("the floor's machines, as Find reads them", () => {
  const machine = (over: Partial<CatalogMachine>): CatalogMachine =>
    ({
      id: "m-lumbar",
      name: "LUMBAR",
      requiresHandoff: false,
      rosterStatus: "active",
      targetMuscles: [],
      synergists: [],
      clinicalWarnings: [],
      setup: "",
      setupCues: [],
      execution: "",
      executionCues: [],
      contraindicatedFor: [],
      ...over,
    }) as CatalogMachine;

  it("reads the switches, the maker and the flags", () => {
    const [u] = findUnitsFrom(
      [machine({ neverToFailure: true, safetyNotice: "Never take Lumbar Extension to failure.", rosterStatus: "maintenance" })],
      { makers: { "m-lumbar": "MedX" }, flagged: new Set(["m-lumbar"]) },
    );
    expect(u.movement?.id).toBe("m-lumbar");
    expect(u.maker).toBe("MedX");
    expect(u.neverToFailure).toBe(true);
    expect(u.outOfService).toBe(true);
    expect(u.flagged).toBe(true);
    expect(u.lines[0]).toEqual({ section: "Never to failure", text: "Never take Lumbar Extension to failure." });
  });

  it("says a flag is unknown, not absent, when the flags could not be read", () => {
    expect(findUnitsFrom([machine({})], { flagged: null })[0].flagged).toBeNull();
    expect(findUnitsFrom([machine({})], {})[0].flagged).toBe(false);
  });

  it("finds a unit by why it is out of service, and only while it is (wave 2)", () => {
    const outOfService = { reason: "A new cable is on order", by: { uid: "u", name: "Glorfindel" }, at: 0 };
    const [out] = findUnitsFrom([machine({ rosterStatus: "maintenance", outOfService })]);
    expect(out.lines[0]).toEqual({ section: "Out of service", text: "A new cable is on order" });
    const hit = findOnFloor({ query: "cable", units: [out], studioName: "Solon" });
    expect(hit.groups.find((g) => g.key === "line")?.hits[0]).toMatchObject({ kind: "line", section: "Out of service" });
    const [back] = findUnitsFrom([machine({ rosterStatus: "active", outOfService })]);
    expect(back.lines.some((l) => l.section === "Out of service")).toBe(false);
  });
});
