import { describe, it, expect } from "vitest";
import { toFloorMachines, dialLabelsOf, isPerSideMachine, studioFloorOf } from "./floor-machines";
import type { Machine } from "../types";
import type { ResolvedMachine } from "../types/machines";

/** Minimal ResolvedMachine — only the fields this module reads. */
const resolved = (over: Partial<ResolvedMachine> & { machineId: string; name: string }) =>
  ({
    studioId: "solon",
    source: "catalog",
    rosterStatus: "active",
    order: 10,
    comparisonKey: over.machineId,
    overriddenFields: [],
    ...over,
  }) as unknown as ResolvedMachine;

const legacyLegPress: Machine = {
  id: "m-leg-press",
  name: "LEG PRESS",
  settingOptions: ["Gap", "Seat Angle", "Shoulder Pads", "Seat Distance"],
  standardSettings: { Gap: "2" },
  trainerTips: "Belt them in before the handoff.",
  anatomicalRegion: "Lower Body",
  requiresHandoff: true,
  imageUrl: "/legacy.webp",
};

describe("studioFloorOf — the floor a profile hands the codex", () => {
  it("carries a studio's own machine and its lineage, which the app-wide list has neither of", () => {
    const floor = studioFloorOf(
      [
        resolved({ machineId: "m-leg-press", name: "LEG PRESS" }),
        resolved({ machineId: "sm-solon-hammer", name: "Our Hammer Leg Press", source: "studio", comparisonKey: "m-leg-press" } as never),
      ],
      [legacyLegPress, { id: "m-chest-press", name: "CHEST PRESS" }],
    );
    expect(floor.map((m) => m.id)).toEqual(["m-leg-press", "sm-solon-hammer"]);
    expect((floor[1] as Machine & { comparisonKey?: string }).comparisonKey).toBe("m-leg-press");
    // Only what is on this floor: the chest press is not rostered here.
    expect(floor.some((m) => m.id === "m-chest-press")).toBe(false);
    // The legacy fields still arrive for a catalog machine.
    expect(floor[0].trainerTips).toBe("Belt them in before the handoff.");
  });

  it("falls back to the app-wide list while the studio has no roster", () => {
    const all = [legacyLegPress];
    expect(studioFloorOf([], all)).toEqual(all);
  });
});

describe("toFloorMachines — the studio's truth over the legacy shape", () => {
  it("keeps every legacy field a floor screen still reads", () => {
    const [m] = toFloorMachines(
      [resolved({ machineId: "m-leg-press", name: "LEG PRESS" })],
      { "m-leg-press": legacyLegPress },
    );
    // These are read by the machine sheet, the briefing and the routine rows.
    expect(m.trainerTips).toBe("Belt them in before the handoff.");
    expect(m.anatomicalRegion).toBe("Lower Body");
    expect(m.requiresHandoff).toBe(true);
  });

  it("uses the studio's name for its own unit", () => {
    // "Max Strength owns the method; a studio owns its hardware" — the name
    // the location uses is explicitly the studio's.
    const [m] = toFloorMachines(
      [resolved({ machineId: "m-leg-press", name: "Leg Press (Hoist)" })],
      { "m-leg-press": legacyLegPress },
    );
    expect(m.name).toBe("Leg Press (Hoist)");
  });

  it("puts the studio's dial labels on the floor, not the legacy list", () => {
    const [m] = toFloorMachines(
      [
        resolved({
          machineId: "m-leg-press",
          name: "LEG PRESS",
          settingFields: [
            { key: "gap", label: "Gap", type: "text" },
            { key: "seat", label: "Seat", type: "text" },
            { key: "foot-plate", label: "Foot Plate", type: "text" },
          ],
        } as Partial<ResolvedMachine> as never),
      ],
      { "m-leg-press": legacyLegPress },
    );
    expect(m.settingOptions).toEqual(["Gap", "Seat", "Foot Plate"]);
  });

  it("falls back to the legacy dials when the machine declares none", () => {
    const [m] = toFloorMachines(
      [resolved({ machineId: "m-leg-press", name: "LEG PRESS" })],
      { "m-leg-press": legacyLegPress },
    );
    expect(m.settingOptions).toEqual(legacyLegPress.settingOptions);
  });

  it("uses the studio's resolved defaults over the legacy standard", () => {
    const [m] = toFloorMachines(
      [
        resolved({
          machineId: "m-leg-press",
          name: "LEG PRESS",
          defaultSettings: { gap: "5", seat: "3" },
        } as Partial<ResolvedMachine> as never),
      ],
      { "m-leg-press": legacyLegPress },
    );
    expect(m.standardSettings).toEqual({ gap: "5", seat: "3" });
  });

  it("carries the roster order, so the floor runs in the studio's sequence", () => {
    const out = toFloorMachines(
      [
        resolved({ machineId: "b", name: "B", order: 10 }),
        resolved({ machineId: "a", name: "A", order: 20 }),
      ],
      {},
    );
    expect(out.map((m) => [m.id, m.order])).toEqual([
      ["b", 10],
      ["a", 20],
    ]);
  });

  it("includes a studio's own machine that the global catalog has never heard of", () => {
    // The whole point of the roster: a location's own unit reaches the floor.
    const out = toFloorMachines(
      [resolved({ machineId: "sm-solon-rear-delt", name: "Rear Delt Hoist", source: "custom" })],
      {},
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("sm-solon-rear-delt");
    expect(out[0].name).toBe("Rear Delt Hoist");
  });

  it("does not invent a name for a machine with none", () => {
    const [m] = toFloorMachines([resolved({ machineId: "sm-x", name: "" })], {});
    expect(m.name).toBe("sm-x");
  });

  it("returns the legacy list unchanged in shape when the roster is the catalog bridge", () => {
    // Empty-roster studios (westlake, Willoughby) get the catalog through
    // bridgeWhenRosterEmpty, so this must degrade to today's behaviour.
    const out = toFloorMachines(
      [resolved({ machineId: "m-leg-press", name: "LEG PRESS" })],
      { "m-leg-press": legacyLegPress },
    );
    expect(out).toHaveLength(1);
    expect(out[0].settingOptions).toEqual(legacyLegPress.settingOptions);
    expect(out[0].standardSettings).toEqual(legacyLegPress.standardSettings);
  });
});

describe("dialLabelsOf", () => {
  it("prefers the label and falls back to the key", () => {
    const r = resolved({
      machineId: "m",
      name: "M",
      settingFields: [
        { key: "gap", label: "Gap", type: "text" },
        { key: "back-pad", label: "", type: "text" },
      ],
    } as Partial<ResolvedMachine> as never);
    expect(dialLabelsOf(r)).toEqual(["Gap", "back-pad"]);
  });

  it("is empty for a machine with no declared dials", () => {
    expect(dialLabelsOf(resolved({ machineId: "m", name: "M" }))).toEqual([]);
  });
});

describe("isPerSideMachine", () => {
  it("recognises the torso rotation by canonical id even when renamed", () => {
    // The tracker's old inline check was name-only, so a studio that renamed
    // its unit lost the Left/Right fields.
    expect(isPerSideMachine({ id: "m-torso-rotation", name: "Trunk Twist" })).toBe(true);
    expect(isPerSideMachine({ id: "torso_rotation", name: "Anything" })).toBe(true);
  });

  it("still recognises it by name, for a studio's own copy", () => {
    expect(isPerSideMachine({ id: "sm-solon-tr", name: "Torso Rotation (MX)" })).toBe(true);
    expect(
      isPerSideMachine({ id: "sm-solon-tr", name: "Custom", comparisonKey: "m-torso-rotation" }),
    ).toBe(true);
  });

  it("is false for everything else", () => {
    expect(isPerSideMachine({ id: "m-leg-press", name: "LEG PRESS" })).toBe(false);
    expect(isPerSideMachine({})).toBe(false);
  });
});
