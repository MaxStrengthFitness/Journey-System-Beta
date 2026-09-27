import { describe, expect, it } from "vitest";
import { focusHeadline, focusOf } from "./focus";

/**
 * The network's focus this quarter: the one shape the Floor banner and
 * Operations → All my studios both read (voice review follow-up, Sep 27 2026).
 */

describe("focusOf", () => {
  it("is null for a network with no focus, or with every line empty", () => {
    expect(focusOf(null)).toBeNull();
    expect(focusOf({})).toBeNull();
    expect(focusOf({ relayFocus: { mastery: "", machine: "", note: "" } })).toBeNull();
  });

  it("counts a line for the floor alone as a focus, and keeps who set it and when", () => {
    const at = { toDate: () => new Date("2026-09-27T14:00:00Z") };
    expect(focusOf({ relayFocus: { note: "Five clients by October.", setBy: { id: "u", name: "Ann" }, setAt: at } })).toEqual({
      mastery: "",
      machine: "",
      note: "Five clients by October.",
      setBy: { id: "u", name: "Ann" },
      setAt: at,
    });
  });
});

describe("focusHeadline", () => {
  it("names the mastery series and the machine to try", () => {
    expect(focusHeadline({ mastery: "Hip hinge", machine: "Leg Curl" })).toBe("This quarter · Mastery: Hip hinge · Try the Leg Curl");
    expect(focusHeadline({ mastery: "Hip hinge", machine: "" })).toBe("This quarter · Mastery: Hip hinge");
    expect(focusHeadline({ mastery: "", machine: "Leg Curl" })).toBe("This quarter · Try the Leg Curl");
  });

  it("says plain 'This quarter', with no dangling separator, when only the floor line is set", () => {
    expect(focusHeadline({ mastery: "", machine: "" })).toBe("This quarter");
  });
});
