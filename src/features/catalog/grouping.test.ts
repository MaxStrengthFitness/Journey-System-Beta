import { describe, expect, it } from "vitest";
import type { UpkeepEvent } from "../admin/upkeep/upkeepLog";
import {
  GROUPING_MODES,
  UNCATEGORISED_KEY,
  UNCATEGORISED_LABEL,
  academyCategoryOf,
  catalogOverview,
  groupKeyOf,
  groupLabelOf,
  groupMachines,
  landingTiles,
  dayKey,
  searchMachines,
  upkeepByMachine,
  upkeepEventsFrom,
} from "./grouping";
import type { CatalogMachine } from "./types";

const TODAY = "2026-09-06";

function machine(id: string, over: Partial<CatalogMachine> = {}): CatalogMachine {
  return {
    id,
    name: id,
    movementPattern: "Lower Body: Posterior Chain",
    anatomicalRegion: "Lower Body",
    isStudioCustom: false,
    rosterStatus: "active",
    anatomy: {} as CatalogMachine["anatomy"],
    clinicalNote: "",
    kinematicClassification: "",
    executionPosture: "",
    setupGap: "",
    requiresHandoff: false,
    targetMuscles: [],
    synergists: [],
    clinicalWarnings: [],
    contraindicatedFor: [],
    setup: "",
    setupCues: [],
    execution: "",
    executionCues: [],
    studioNotes: "",
    ...over,
  };
}

function event(
  machineId: string,
  kind: UpkeepEvent["kind"],
  day: string,
): UpkeepEvent {
  return { id: `${machineId}-${kind}-${day}`, machineId, kind, day, source: "logged" };
}

describe("the three grouping vocabularies", () => {
  it("offers all three", () => {
    expect(GROUPING_MODES).toEqual(["movement", "region", "academy"]);
  });

  it("buckets by movement pattern", () => {
    expect(groupKeyOf(machine("m-ext", { movementPattern: "Knee Extension" }), "movement")).toBe(
      "Knee Extension",
    );
  });

  it("buckets by anatomical region", () => {
    expect(
      groupKeyOf(machine("m-ext", { anatomicalRegion: "Lower Body" }), "region"),
    ).toBe("Lower Body");
  });

  it("buckets by the Academy category, read from the routine builder", () => {
    expect(groupKeyOf(machine("m-hip-abd"), "academy")).toBe("hips");
    expect(groupKeyOf(machine("m-chest-press"), "academy")).toBe("upper-push");
    expect(groupKeyOf(machine("m-pulldown"), "academy")).toBe("upper-pull");
  });

  it("REGRESSION: Academy and kinematics disagree, and both are right", () => {
    // routine-builder/academy.ts says so in its own header: Hip Abduction is
    // posterior-chain kinematically and its own programming category. A
    // mapping between the two vocabularies would have to pick one.
    const hipAbd = machine("m-hip-abd", {
      movementPattern: "Lower Body: Posterior Chain",
    });
    expect(groupKeyOf(hipAbd, "movement")).toBe("Lower Body: Posterior Chain");
    expect(groupKeyOf(hipAbd, "academy")).toBe("hips");
  });

  it("does not silently drop a machine the Academy has no category for", () => {
    const custom = machine("studio-custom-sled");
    expect(academyCategoryOf(custom)).toBeNull();
    expect(groupKeyOf(custom, "academy")).toBe(UNCATEGORISED_KEY);
    expect(groupLabelOf(UNCATEGORISED_KEY, "academy")).toBe(UNCATEGORISED_LABEL);
  });

  it("labels an Academy bucket in the Academy's words", () => {
    expect(groupLabelOf("hips", "academy")).toBe("Hips");
    expect(groupLabelOf("upper-pull", "academy")).toBe("Upper Body — Pull");
  });

  it("passes a movement or region key straight through as its own label", () => {
    expect(groupLabelOf("Vertical Pull", "movement")).toBe("Vertical Pull");
  });
});

describe("groupMachines ordering", () => {
  it("keeps roster order for movement, so a studio can influence it", () => {
    const groups = groupMachines(
      [
        machine("a", { movementPattern: "Zebra" }),
        machine("b", { movementPattern: "Alpha" }),
      ],
      "movement",
    );
    expect(groups.map((g) => g.key)).toEqual(["Zebra", "Alpha"]);
  });

  it("uses the Academy's own order, so two studios read the same screen", () => {
    const groups = groupMachines(
      [
        machine("m-hip-abd"), // hips, last
        machine("m-abs"), // trunk, fourth
        machine("m-chest-press"), // upper-push, second
      ],
      "academy",
    );
    expect(groups.map((g) => g.key)).toEqual(["upper-push", "trunk", "hips"]);
  });

  it("sorts uncategorised machines to the end rather than the front", () => {
    const groups = groupMachines(
      [machine("mystery"), machine("m-chest-press")],
      "academy",
    );
    expect(groups.map((g) => g.key)).toEqual([
      "upper-push",
      UNCATEGORISED_KEY,
    ]);
  });

  it("keeps every machine", () => {
    const machines = [machine("m-abs"), machine("m-hip-abd"), machine("x")];
    const total = groupMachines(machines, "academy").reduce(
      (n, g) => n + g.machines.length,
      0,
    );
    expect(total).toBe(3);
  });
});

describe("searchMachines", () => {
  const machines = [
    machine("m-hip-abd", { name: "Hip Abduction", targetMuscles: ["Gluteus Medius"] }),
    machine("m-chest-press", {
      name: "Chest Press",
      movementPattern: "Horizontal Push",
      anatomicalRegion: "Upper Body",
    }),
  ];

  it("returns everything for a blank search", () => {
    expect(searchMachines(machines, "   ")).toHaveLength(2);
  });

  it("matches the name, case-insensitively", () => {
    expect(searchMachines(machines, "CHEST").map((m) => m.id)).toEqual([
      "m-chest-press",
    ]);
  });

  it("matches a target muscle", () => {
    expect(searchMachines(machines, "gluteus").map((m) => m.id)).toEqual([
      "m-hip-abd",
    ]);
  });

  it("matches the Academy category name, which is on no machine", () => {
    // "Hips" appears nowhere in the Hip Abduction record except as its
    // programming category, and a trainer searching for it means that.
    expect(searchMachines(machines, "hips").map((m) => m.id)).toEqual([
      "m-hip-abd",
    ]);
  });
});

describe("upkeepByMachine", () => {
  const machines = [machine("m-ext"), machine("m-abs")];

  it("reports never for a machine nobody has logged", () => {
    expect(upkeepByMachine(machines, [], TODAY)["m-ext"]).toBe("never");
  });

  it("a machine cleaned today but never serviced still reports never", () => {
    // worstStatus takes the worse of the two axes, and "never" outranks "ok".
    // Wiping a machine down does not clear a service that has never happened,
    // and a tile that went green on a daily clean would say the opposite.
    expect(
      upkeepByMachine(machines, [event("m-ext", "clean", TODAY)], TODAY)["m-ext"],
    ).toBe("never");
  });

  it("counts a deep clean as a clean", () => {
    const out = upkeepByMachine(
      machines,
      [event("m-ext", "deep-clean", TODAY), event("m-ext", "service", TODAY)],
      TODAY,
    );
    expect(out["m-ext"]).toBe("ok");
  });

  it("escalates as the days pass", () => {
    const withService = (day: string) => [
      event("m-ext", "clean", day),
      event("m-ext", "service", day),
    ];
    expect(upkeepByMachine(machines, withService("2026-09-06"), TODAY)["m-ext"]).toBe(
      "ok",
    );
    expect(upkeepByMachine(machines, withService("2026-09-04"), TODAY)["m-ext"]).toBe(
      "due",
    );
    expect(upkeepByMachine(machines, withService("2026-08-01"), TODAY)["m-ext"]).toBe(
      "overdue",
    );
  });

  it("keeps machines apart", () => {
    const out = upkeepByMachine(
      machines,
      [event("m-ext", "clean", TODAY), event("m-ext", "service", TODAY)],
      TODAY,
    );
    expect(out["m-ext"]).toBe("ok");
    expect(out["m-abs"]).toBe("never");
  });
});

describe("landingTiles", () => {
  const machines = [
    machine("m-chest-press"),
    machine("m-dip"),
    machine("m-hip-abd"),
  ];

  it("counts what THIS studio has, not the global catalog", () => {
    const tiles = landingTiles({ machines, events: [], todayKey: TODAY });
    const push = tiles.find((t) => t.key === "upper-push");
    // The Academy lists six upper-push machines; this studio has two.
    expect(push?.count).toBe(2);
    expect(push?.machineIds).toEqual(["m-chest-press", "m-dip"]);
  });

  it("does not render a tile for a category this studio has nothing in", () => {
    const tiles = landingTiles({ machines, events: [], todayKey: TODAY });
    expect(tiles.map((t) => t.key)).toEqual(["upper-push", "hips"]);
  });

  it("carries the worst upkeep state in the tile up from its machines", () => {
    const tiles = landingTiles({
      machines,
      events: [
        event("m-chest-press", "clean", TODAY),
        event("m-chest-press", "service", TODAY),
        event("m-dip", "clean", "2026-01-01"),
        event("m-dip", "service", "2026-01-01"),
      ],
      todayKey: TODAY,
    });
    expect(tiles.find((t) => t.key === "upper-push")?.upkeep).toBe("overdue");
    expect(tiles.find((t) => t.key === "upper-push")?.needsUpkeep).toBe(1);
  });

  it("counts flagged machines per tile", () => {
    const tiles = landingTiles({
      machines,
      events: [],
      todayKey: TODAY,
      flaggedIds: new Set(["m-dip"]),
    });
    expect(tiles.find((t) => t.key === "upper-push")?.flagged).toBe(1);
    expect(tiles.find((t) => t.key === "hips")?.flagged).toBe(0);
  });

  it("is empty for an empty roster rather than five zeroed tiles", () => {
    expect(landingTiles({ machines: [], events: [], todayKey: TODAY })).toEqual(
      [],
    );
  });
});

describe("catalogOverview", () => {
  it("names the Academy categories this studio cannot programme", () => {
    const overview = catalogOverview({
      machines: [machine("m-chest-press"), machine("m-pulldown")],
      events: [],
      todayKey: TODAY,
    });
    // Present: upper-push, upper-pull. Missing: legs, trunk, hips.
    expect(overview.missingCategories).toEqual([
      "Lower Body",
      "Trunk / Spine / Core",
      "Hips",
    ]);
  });

  it("reports nothing missing for a complete roster", () => {
    const overview = catalogOverview({
      machines: [
        machine("m-pulldown"),
        machine("m-chest-press"),
        machine("m-leg-press"),
        machine("m-abs"),
        machine("m-hip-abd"),
      ],
      events: [],
      todayKey: TODAY,
    });
    expect(overview.missingCategories).toEqual([]);
  });

  it("counts custom, out-of-service, flagged and overdue", () => {
    const overview = catalogOverview({
      machines: [
        machine("m-ext", { isStudioCustom: true }),
        machine("m-abs", { rosterStatus: "maintenance" }),
        machine("m-hip-abd"),
      ],
      events: [
        event("m-ext", "clean", "2026-01-01"),
        event("m-ext", "service", "2026-01-01"),
      ],
      todayKey: TODAY,
      flaggedIds: new Set(["m-abs"]),
    });
    expect(overview.total).toBe(3);
    expect(overview.studioCustom).toBe(1);
    expect(overview.outOfService).toBe(1);
    expect(overview.needsUpkeep).toBe(1);
    expect(overview.flagged).toBe(1);
  });

  it("does not count a never-logged machine as needing upkeep", () => {
    // "never" is an onboarding gap, not a maintenance failure. Counting it
    // here would put every new studio permanently in the red.
    const overview = catalogOverview({
      machines: [machine("m-ext")],
      events: [],
      todayKey: TODAY,
    });
    expect(overview.needsUpkeep).toBe(0);
  });
});

describe("upkeepEventsFrom", () => {
  it("turns the Catalog's task records into upkeep events", () => {
    const events = upkeepEventsFrom({
      "m-ext": {
        lastCleaned: { localDate: "2026-09-05" },
        lastServiced: { localDate: "2026-06-01" },
      },
    });
    expect(events).toEqual([
      { id: "m-ext-clean", machineId: "m-ext", kind: "clean", day: "2026-09-05", source: "task" },
      { id: "m-ext-service", machineId: "m-ext", kind: "service", day: "2026-06-01", source: "task" },
    ]);
  });

  it("emits nothing for a machine with no completed task", () => {
    expect(upkeepEventsFrom({ "m-ext": {} })).toEqual([]);
    expect(upkeepEventsFrom({ "m-ext": { flagged: {} } })).toEqual([]);
  });

  it("emits only the half it has", () => {
    const events = upkeepEventsFrom({
      "m-ext": { lastCleaned: { localDate: "2026-09-05" } },
    });
    expect(events.map((e) => e.kind)).toEqual(["clean"]);
  });

  it("feeds the same judgement the admin panel uses", () => {
    // The point of the bridge: "cleaned in January" reads as overdue in the
    // Catalog because it is the same upkeepStatus call, not a second
    // threshold written beside it.
    const events = upkeepEventsFrom({
      "m-ext": {
        lastCleaned: { localDate: "2026-01-02" },
        lastServiced: { localDate: "2026-01-02" },
      },
    });
    expect(upkeepByMachine([machine("m-ext")], events, TODAY)["m-ext"]).toBe(
      "overdue",
    );
  });
});

describe("dayKey", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(dayKey(new Date(2026, 8, 6))).toBe("2026-09-06");
  });

  it("pads single-digit months and days", () => {
    expect(dayKey(new Date(2026, 0, 3))).toBe("2026-01-03");
  });

  it("uses local time, not UTC, so a late-evening clean is not tomorrow", () => {
    expect(dayKey(new Date(2026, 8, 6, 23, 30))).toBe("2026-09-06");
  });
});
