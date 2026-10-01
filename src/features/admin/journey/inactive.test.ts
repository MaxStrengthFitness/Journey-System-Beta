/**
 * A LEADER'S INACTIVE MARK — what is stored, what is refused, and when it
 * holds (the inactive round, Oct 1 2026).
 */
import { describe, expect, it } from "vitest";
import {
  INACTIVE_REASONS,
  INACTIVE_REASON_WORDS,
  inactiveDraftProblem,
  inactiveMarkDoc,
  markHolds,
  markReasonWords,
  parseInactiveMark,
  pastInactiveLine,
} from "./inactive";

const by = { id: "uid-leader", name: "Beregond Leader" };

describe("the mark's document", () => {
  it("is exactly the shape the rules hold, the note only when there is one", () => {
    expect(inactiveMarkDoc("eowyn", { reason: "moved", note: "  " }, "2026-10-01", by, "NOW")).toEqual({
      clientId: "eowyn",
      reason: "moved",
      day: "2026-10-01",
      markedBy: { id: "uid-leader", name: "Beregond Leader" },
      markedAt: "NOW",
    });
    expect(inactiveMarkDoc("eowyn", { reason: "other", note: " Back in the spring " }, "2026-10-01", by, "NOW")).toMatchObject({ note: "Back in the spring" });
  });

  it("refuses a mark without a reason, or with a note past the limit, in words", () => {
    expect(inactiveDraftProblem({ reason: null, note: "" })).toBe("Choose a reason.");
    expect(inactiveDraftProblem({ reason: "cost", note: "x".repeat(301) })).toBe("Keep the note to 300 characters.");
    expect(inactiveDraftProblem({ reason: "cost", note: "" })).toBeNull();
    expect(() => inactiveMarkDoc("eowyn", { reason: null, note: "" }, "2026-10-01", by, "NOW")).toThrow("Choose a reason.");
    expect(() => inactiveMarkDoc("eowyn", { reason: "cost", note: "" }, "10/01/2026", by, "NOW")).toThrow();
  });

  it("reads a stored mark defensively", () => {
    const at = new Date("2026-10-01T14:00:00Z");
    expect(parseInactiveMark("eowyn", { clientId: "eowyn", reason: "health", note: "Knee", day: "2026-10-01", markedBy: by, markedAt: { toDate: () => at } })).toEqual({
      clientId: "eowyn",
      reason: "health",
      note: "Knee",
      day: "2026-10-01",
      markedBy: by,
      markedAt: at,
    });
    expect(parseInactiveMark("eowyn", { reason: "bored", day: "2026-10-01", markedBy: by })).toBeNull();
    expect(parseInactiveMark("eowyn", { reason: "cost", day: "Oct 1", markedBy: by })).toBeNull();
    expect(parseInactiveMark("eowyn", { reason: "cost", day: "2026-10-01" })).toBeNull();
    expect(parseInactiveMark("eowyn", null)).toBeNull();
  });

  it("has a word for every reason", () => {
    for (const r of INACTIVE_REASONS) expect(INACTIVE_REASON_WORDS[r].length).toBeGreaterThan(0);
    expect(markReasonWords({ reason: "moved", note: null })).toBe("Moved away");
    expect(markReasonWords({ reason: "other", note: "Back in the spring" })).toBe("Other: Back in the spring");
  });
});

describe("when it holds", () => {
  it("holds until she visits after the day she was marked", () => {
    expect(markHolds({ day: "2026-10-01" }, null)).toBe(true);
    expect(markHolds({ day: "2026-10-01" }, "2026-09-01")).toBe(true);
    // Marked the day she last came in (she said she was moving): it holds.
    expect(markHolds({ day: "2026-10-01" }, "2026-10-01")).toBe(true);
    expect(markHolds({ day: "2026-10-01" }, "2026-10-04")).toBe(false);
  });

  it("puts her past the line only on a known last visit with nothing booked", () => {
    expect(pastInactiveLine(90, true, 90)).toBe(true);
    expect(pastInactiveLine(89, true, 90)).toBe(false);
    expect(pastInactiveLine(200, false, 90)).toBe(false);
    expect(pastInactiveLine(null, true, 90)).toBe(false);
  });
});
