import { describe, expect, it } from "vitest";
import { REPORT_STEPS, RETIRED_STEP_IDS, STEP_INDEX, resolveStepId } from "./steps";

describe("report steps follow the owner's four-phase report", () => {
  it("keeps the step ids and their order — five steps, the Pulse is out", () => {
    expect(REPORT_STEPS.map((s) => s.id)).toEqual([
      "celebrate",
      "highlights",
      "machines",
      "fourps",
      "goals",
    ]);
    expect(REPORT_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    expect(REPORT_STEPS.some((s) => (s.id as string) === "checkin")).toBe(false);
  });

  it("titles the four phases, leaving machines as it was", () => {
    const title = (id: keyof typeof STEP_INDEX) => REPORT_STEPS[STEP_INDEX[id]].title;
    expect(title("celebrate")).toBe("Volume & gratitude");
    expect(title("highlights")).toBe("Accolades");
    expect(title("machines")).toBe("Machine progression");
    expect(title("fourps")).toBe("The 4 P's");
    expect(title("goals")).toBe("Kaizen blueprint");
  });

  it("gives every step a short tab label that fits an iPad in portrait", () => {
    expect(REPORT_STEPS.map((s) => s.label)).toEqual(["Volume", "Accolades", "Machines", "4 P's", "Blueprint"]);
    for (const s of REPORT_STEPS) expect(s.label.length).toBeLessThanOrEqual(9);
  });

  it("never says Assessment, check-in or 90-day on a label", () => {
    for (const s of REPORT_STEPS) {
      expect(`${s.title} ${s.label} ${s.subtitle}`).not.toMatch(/assessment|check-in|90-day/i);
    }
  });

  it("lands the retired Assessment step on the Kaizen blueprint", () => {
    expect(RETIRED_STEP_IDS.checkin).toBe("goals");
    expect(resolveStepId("checkin")).toBe("goals");
    expect(resolveStepId("fourps")).toBe("fourps");
    expect(resolveStepId("nonsense")).toBe("celebrate");
    expect(resolveStepId(null)).toBe("celebrate");
  });
});
