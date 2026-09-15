import { describe, expect, it } from "vitest";
import { REPORT_STEPS, STEP_INDEX } from "./steps";

describe("report steps follow the owner's four-phase report", () => {
  it("keeps the step ids and their order", () => {
    expect(REPORT_STEPS.map((s) => s.id)).toEqual([
      "celebrate",
      "highlights",
      "machines",
      "fourps",
      "checkin",
      "goals",
    ]);
    expect(REPORT_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("titles the four phases, leaving machines and the Assessment as they were", () => {
    const title = (id: keyof typeof STEP_INDEX) => REPORT_STEPS[STEP_INDEX[id]].title;
    expect(title("celebrate")).toBe("Volume & gratitude");
    expect(title("highlights")).toBe("Accolades");
    expect(title("machines")).toBe("Machine progression");
    expect(title("fourps")).toBe("The 4 P's");
    expect(title("checkin")).toBe("Assessment");
    expect(title("goals")).toBe("Kaizen blueprint");
  });
});
