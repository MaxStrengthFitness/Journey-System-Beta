import { describe, expect, it } from "vitest";
import type { MachineCatalogEntry } from "../../../types/machines";
import { defaultSignals, overriddenDefaults, signalLine, type RosterDocLike } from "./studio-defaults";

const catalog = [
  { id: "m-leg-press", name: "Leg Press", settingFields: [{ key: "seat", label: "Seat", type: "enum" }] },
  { id: "m-ext", name: "Leg Extension" },
  { id: "m-lumbar", name: "Lumbar Extension" },
] as unknown as MachineCatalogEntry[];

const names: Record<string, string> = { solon: "Solon", strongsville: "Strongsville", westlake: "Westlake", willoughby: "Willoughby" };
const studioName = (id: string) => names[id] ?? id;

const copy = (basedOn: string, overrides: Record<string, unknown>, extra: Partial<RosterDocLike> = {}): RosterDocLike => ({
  machineId: basedOn,
  source: "catalog",
  basedOn,
  status: "active",
  overrides,
  ...extra,
});

describe("which house defaults a studio set its own", () => {
  it("reads the baseline, the body-type set-ups, the dials and the starting load, in words", () => {
    expect(
      overriddenDefaults(
        {
          name: "Big Press",
          imageUrl: "photo.jpg",
          universalBaseline: { seatHeightPosition: "P3" },
          bodyTypeAdjustments: { tallerStature: { seatAdjustment: "Lower" } },
          defaultSettings: { seat: "5" },
          baselineLoad: { male: 150 },
        },
        catalog[0],
      ),
    ).toEqual([
      { path: "universalBaseline.seatHeightPosition", what: "the seat position" },
      { path: "bodyTypeAdjustments.tallerStature", what: "the set-up for taller clients" },
      { path: "defaultSettings.seat", what: "the Seat dial's default" },
      { path: "baselineLoad.male", what: "the starting load for men" },
    ]);
    expect(overriddenDefaults(undefined, catalog[0])).toEqual([]);
  });
});

describe("where studios set their own", () => {
  const rosters: Record<string, RosterDocLike[]> = {
    solon: [copy("m-leg-press", { universalBaseline: { seatHeightPosition: "P3" }, defaultSettings: { seat: "5" } }), copy("m-ext", { baselineLoad: { male: 90 } })],
    strongsville: [copy("m-leg-press", { universalBaseline: { seatHeightPosition: "P3" }, name: "Leg Press 2" }), copy("m-ext", { baselineLoad: { female: 40 } })],
    westlake: [copy("m-leg-press", { defaultSettings: { seat: "6" } }, { status: "inactive" }), copy("m-lumbar", {})],
    willoughby: [
      copy("m-leg-press", { universalBaseline: { seatHeightPosition: "P4" } }),
      { machineId: "sm-willoughby-sled", source: "custom", basedOn: "m-leg-press", overrides: { universalBaseline: { seatHeightPosition: "P1" } } },
    ],
  };

  it("flags a default from two studios up, one line per machine and default", () => {
    const signals = defaultSignals(rosters, studioName, catalog);
    expect(signals.map(signalLine)).toEqual(["Leg Press: 3 studios set their own seat position (Solon, Strongsville and Willoughby)."]);
  });

  it("leaves out a switched-off machine, a studio's own machine and a studio's own name", () => {
    const signals = defaultSignals(rosters, studioName, catalog);
    // Westlake's seat dial is on a switched-off copy; Solon's alone is one studio.
    expect(signals.some((s) => s.path === "defaultSettings.seat")).toBe(false);
    // Men's and women's starting loads are different defaults, one studio each.
    expect(signals.some((s) => s.machineId === "m-ext")).toBe(false);
  });

  it("can be asked for fewer studios", () => {
    const lines = defaultSignals(rosters, studioName, catalog, 1).map(signalLine);
    expect(lines).toContain("Leg Extension: 1 studio sets its own starting load for men (Solon).");
  });
});
