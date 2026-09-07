import { describe, expect, it } from "vitest";
import {
  CANONICAL_TO_DB_KEY,
  canonicalMachineId,
  dedupeMachines,
} from "./machine-identity";

describe("canonicalMachineId", () => {
  it("leaves an already-canonical id alone", () => {
    expect(canonicalMachineId("m-ext")).toBe("m-ext");
    expect(canonicalMachineId("m-hip-abd")).toBe("m-hip-abd");
  });

  it("maps MACHINE_DATABASE keys onto the canonical id", () => {
    expect(canonicalMachineId("leg_extension")).toBe("m-ext");
    expect(canonicalMachineId("abduction")).toBe("m-hip-abd");
    expect(canonicalMachineId("4_way_neck")).toBe("m-neck");
  });

  it("falls back to the name when the id is unrecognised", () => {
    expect(canonicalMachineId("weird-legacy-id", "Seated Leg Extension")).toBe(
      "m-ext",
    );
    expect(canonicalMachineId("xyz", "CX (4 WAY NECK)")).toBe("m-neck");
  });

  it("never collapses a studio's own machine", () => {
    // Two locations' bespoke leg presses are different machines; merging them
    // would merge their leaderboards.
    expect(canonicalMachineId("sm-solon-leg-press", "Leg Press")).toBe(
      "sm-solon-leg-press",
    );
  });

  it("leaves a genuinely unknown machine as itself", () => {
    expect(canonicalMachineId("m-glute-ham-raise", "Glute Ham Raise")).toBe(
      "m-glute-ham-raise",
    );
  });
});

describe("dedupeMachines", () => {
  it("collapses the duplicate Leg Extension onto the canonical entry", () => {
    const { machines, collisions } = dedupeMachines([
      { id: "m-ext", name: "LEG EXTENSION" },
      { id: "leg_extension", name: "Seated Leg Extension" },
    ]);
    expect(machines).toHaveLength(1);
    expect(machines[0].id).toBe("m-ext");
    expect(collisions["m-ext"]).toEqual(["m-ext", "leg_extension"]);
  });

  it("keeps the canonical entry even when the stray one comes first", () => {
    const { machines } = dedupeMachines([
      { id: "leg_extension", name: "Seated Leg Extension" },
      { id: "m-ext", name: "LEG EXTENSION" },
    ]);
    expect(machines[0].id).toBe("m-ext");
    expect(machines[0].name).toBe("LEG EXTENSION");
  });

  it("backfills fields the winner is missing rather than dropping them", () => {
    const { machines } = dedupeMachines([
      { id: "m-ext", name: "LEG EXTENSION", imageUrl: "" },
      { id: "leg_extension", name: "Seated Leg Extension", imageUrl: "x.webp" },
    ] as { id: string; name: string; imageUrl?: string }[]);
    expect(machines[0].imageUrl).toBe("x.webp");
  });

  it("reports no collision when there is none", () => {
    const { machines, collisions } = dedupeMachines([
      { id: "m-ext", name: "LEG EXTENSION" },
      { id: "m-leg-curl", name: "LEG CURL" },
    ]);
    expect(machines).toHaveLength(2);
    expect(collisions).toEqual({});
  });

  it("keeps two studios' custom machines apart", () => {
    const { machines } = dedupeMachines([
      { id: "sm-solon-leg-press", name: "Leg Press" },
      { id: "sm-beachwood-leg-press", name: "Leg Press" },
    ]);
    expect(machines).toHaveLength(2);
  });
});

describe("CANONICAL_TO_DB_KEY — the contested neck machine", () => {
  it("REGRESSION: m-neck reaches the Cervical Extension, not the 4-Way Neck", () => {
    // This resolved to "4_way_neck" purely because that key was typed first.
    // The 4_way_neck record carries requiresHandoff: false and one generic
    // warning; cervical_extension carries the Academy's never-to-failure rule
    // and the hand-off requirement. The Academy has no 4-Way Neck document at
    // all. Getting this wrong is a safety defect, so it is pinned by a test.
    expect(CANONICAL_TO_DB_KEY["m-neck"]).toBe("cervical_extension");
  });

  it("still resolves every other machine to its only database key", () => {
    expect(CANONICAL_TO_DB_KEY["m-leg-press"]).toBe("leg_press");
    expect(CANONICAL_TO_DB_KEY["m-ext"]).toBe("leg_extension");
    expect(CANONICAL_TO_DB_KEY["m-lumbar"]).toBe("lumbar_extension");
  });

  it("keeps recognising both spellings on the way in", () => {
    // The mapping that decides which RECORD wins is separate from the one that
    // recognises an incoming id, and both spellings must still be accepted.
    expect(canonicalMachineId("4_way_neck")).toBe("m-neck");
    expect(canonicalMachineId("cervical_extension")).toBe("m-neck");
  });
});
