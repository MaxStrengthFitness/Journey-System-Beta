import { describe, expect, it } from "vitest";
import { coverInstant, coverIsLater, coverTimeOf, coverToName, neededWords } from "./cover";
import { BEREGOND, IORETH, MABLUNG, TODAY, ask } from "./fixtures";

const at = (iso: string) => Date.parse(iso);

describe("a cover ask that keeps its time", () => {
  it("turns the session's day and wall-clock time into the instant, in the studio's zone", () => {
    expect(coverInstant(TODAY, "16:00")).toBe(at(`${TODAY}T16:00:00-04:00`));
    expect(coverInstant(TODAY, "9:05")).toBe(at(`${TODAY}T09:05:00-04:00`));
    expect(coverInstant(TODAY, null)).toBeNull();
    expect(coverInstant(null, "16:00")).toBeNull();
    expect(coverInstant("next week", "16:00")).toBeNull();
  });

  it("reads the kept time back as a studio day and minute, and only on a cover", () => {
    const r = ask("c", { kind: "cover", coverAt: at(`${TODAY}T16:20:00-04:00`) });
    expect(coverTimeOf(r)).toEqual({ at: r.coverAt, day: TODAY, min: 16 * 60 + 20 });
    expect(coverTimeOf(ask("q", { kind: "question", coverAt: r.coverAt }))).toBeNull();
    expect(coverTimeOf(ask("old", { kind: "cover" }))).toBeNull();
  });

  it("says when it is needed", () => {
    expect(neededWords({ at: 0, day: TODAY, min: 16 * 60 + 20 }, TODAY)).toBe("needed at 4:20 PM");
    expect(neededWords({ at: 0, day: "2026-09-29", min: 9 * 60 + 30 }, TODAY)).toBe("needed tomorrow at 9:30 AM");
    expect(neededWords({ at: 0, day: "2026-10-01", min: 9 * 60 + 30 }, TODAY)).toBe("needed Thursday at 9:30 AM");
  });

  it("knows a cover for a later day doesn't press on today", () => {
    expect(coverIsLater(ask("c", { kind: "cover", coverAt: at("2026-10-01T09:30:00-04:00") }), TODAY)).toBe(true);
    expect(coverIsLater(ask("c", { kind: "cover", coverAt: at(`${TODAY}T16:00:00-04:00`) }), TODAY)).toBe(false);
    expect(coverIsLater(ask("c", { kind: "cover" }), TODAY)).toBe(false);
  });

  it("names the soonest cover still to come today, not yours, nobody on it, never one for a later day", () => {
    const me = new Set([IORETH.id]);
    const now = at(`${TODAY}T14:18:00-04:00`);
    const requests = [
      ask("thu", { kind: "cover", createdBy: MABLUNG, coverAt: at("2026-10-01T09:30:00-04:00") }),
      ask("five", { kind: "cover", createdBy: MABLUNG, coverAt: at(`${TODAY}T17:00:00-04:00`) }),
      ask("four", { kind: "cover", createdBy: BEREGOND, coverAt: at(`${TODAY}T16:20:00-04:00`) }),
      ask("gone", { kind: "cover", createdBy: BEREGOND, coverAt: at(`${TODAY}T10:00:00-04:00`) }),
      ask("mine", { kind: "cover", createdBy: IORETH, coverAt: at(`${TODAY}T15:00:00-04:00`) }),
      ask("taken", { kind: "cover", createdBy: MABLUNG, coverAt: at(`${TODAY}T15:30:00-04:00`), claimedBy: BEREGOND }),
    ];
    expect(coverToName(requests, me, TODAY, now)?.id).toBe("four");
    // One with no kept time still counts, after the timed ones.
    expect(coverToName([ask("old", { kind: "cover", createdBy: MABLUNG }), requests[1]], me, TODAY, now)?.id).toBe("five");
    expect(coverToName([requests[0]], me, TODAY, now)).toBeNull();
  });
});
