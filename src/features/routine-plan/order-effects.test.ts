import { describe, expect, it } from "vitest";
import { ACADEMY_MOVEMENT_NAME } from "../catalog/names";
import { orderEffectSentence, orderEffects } from "./order-effects";
import type { FloorMachine } from "./starting-plan";

const nameOf = (id: string) => ACADEMY_MOVEMENT_NAME[id.replace(/^unit-/, "")] ?? id;

describe("order effects, as quiet sentences", () => {
  it("says the Academy's avoid between the two machines that trip it", () => {
    const effects = orderEffects(["m-compound-row", "m-lumbar", "m-leg-press"], nameOf);
    const into = effects.find((e) => e.ruleId === "lumbar-into-leg-press")!;
    expect(into).toMatchObject({
      title: "Lumbar directly into Leg Press",
      severity: "avoid",
      scope: "adjacent",
      machineIds: ["m-lumbar", "m-leg-press"],
      names: ["Lumbar Extension", "Leg Press"],
      indices: [1, 2],
      sentence: "Lumbar directly into Leg Press · the Academy says avoid",
    });
    expect(into.why.length).toBeGreaterThan(0);
    expect(into.source).toMatch(/msf-academy/);
    // The avoid comes before anything gentler.
    expect(effects[0].severity).toBe("avoid");
  });

  it("says a caution as the Academy's caution", () => {
    const effects = orderEffects(["m-lumbar", "m-compound-row", "m-leg-press"], nameOf);
    expect(effects.map((e) => e.sentence)).toEqual(["Lumbar and Leg Press in the same session · the Academy's caution"]);
    expect(effects[0]).toMatchObject({ scope: "session", indices: [0, 2] });
  });

  it("reads a studio's own unit ids through the floor, and hands them back as they were", () => {
    const floor: FloorMachine[] = [
      { id: "unit-m-lumbar", canonicalId: "m-lumbar" },
      { id: "unit-m-leg-press", canonicalId: "m-leg-press" },
    ];
    const effects = orderEffects(["unit-m-lumbar", "unit-m-leg-press"], nameOf, floor);
    expect(effects[0].machineIds).toEqual(["unit-m-lumbar", "unit-m-leg-press"]);
    expect(effects[0].names).toEqual(["Lumbar Extension", "Leg Press"]);
    // Without the floor, an id the rules don't know trips nothing.
    expect(orderEffects(["unit-m-lumbar", "unit-m-leg-press"], nameOf)).toEqual([]);
  });

  it("says nothing about an order the Academy has no rule for", () => {
    expect(orderEffects(["m-compound-row", "m-chest-press", "m-leg-press"], nameOf)).toEqual([]);
    expect(orderEffects([], nameOf)).toEqual([]);
    expect(orderEffectSentence({ title: "Two pushing movements back to back", severity: "avoid" })).toBe(
      "Two pushing movements back to back · the Academy says avoid",
    );
  });
});
