import { describe, expect, it } from "vitest";
import { machineLink } from "./links";

describe("machineLink", () => {
  it("opens the flagged machine's page, by ref and by the old view/id", () => {
    expect(machineLink("m-leg-press", "Leg Press")).toEqual({
      view: "machine-anatomy",
      id: "m-leg-press",
      learning: { kind: "machine", id: "m-leg-press", title: "Leg Press" },
    });
  });

  it("never writes an undefined id, which Firestore would refuse", () => {
    const link = machineLink(undefined, "Leg Press");
    expect(link).toEqual({ view: "studio-tasks" });
    expect(Object.values(link).every((v) => v !== undefined)).toBe(true);
  });

  it("keeps the old shape when the id cannot be a ref", () => {
    // A control character is not a usable Learning id; the bell's view/id
    // fallback still opens the Catalog there.
    expect(machineLink("m-\u0001")).toEqual({ view: "machine-anatomy", id: "m-\u0001" });
  });
});
