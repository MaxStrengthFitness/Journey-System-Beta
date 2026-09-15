import { describe, expect, it } from "vitest";
import type { ClientFocus } from "../../types/journal";
import {
  FOCUS_OUTCOME_LABEL,
  canManageFocus,
  focusDaysActive,
  focusEndDate,
  focusTrainers,
  formatSpan,
  isWritableFocus,
  pastFocuses,
} from "./focus";

const day = (d: number) => new Date(2026, 7, d, 10, 0); // August 2026, local

function focus(over: Partial<ClientFocus>): ClientFocus {
  return {
    id: "f1",
    clientId: "c1",
    studioId: "s1",
    trainerId: "t1",
    trainerName: "Jane Coach",
    trainerInitials: "JC",
    category: "Pace",
    intent: "No dumping at the ends",
    targetMachineId: null,
    status: "active",
    startedAt: day(1),
    reviewDueAt: null,
    passedAt: null,
    lastExtendedAt: null,
    extensionCount: 0,
    checkInCount: 0,
    lastCheckInAt: null,
    createdAt: day(1),
    updatedAt: day(1),
    ...over,
  };
}

describe("how long a focus was active", () => {
  it("runs to now while active", () => {
    expect(focusEndDate(focus({}))).toBeNull();
    expect(focusDaysActive(focus({}), day(22))).toBe(21);
  });

  it("ends at achievedAt, then passedAt, for an achieved focus", () => {
    expect(focusDaysActive(focus({ status: "passed", achievedAt: day(15), passedAt: day(20) }))).toBe(14);
    expect(focusDaysActive(focus({ status: "passed", passedAt: day(8) }))).toBe(7);
  });

  it("ends at retiredAt, then updatedAt, for a retired focus", () => {
    expect(focusDaysActive(focus({ status: "retired", retiredAt: day(4), updatedAt: day(30) }))).toBe(3);
    expect(focusDaysActive(focus({ status: "retired", updatedAt: day(29) }))).toBe(28);
  });

  it("is unknown without a start, and never negative", () => {
    expect(focusDaysActive(focus({ startedAt: null, createdAt: null }))).toBeNull();
    expect(focusDaysActive(focus({ status: "passed", achievedAt: day(1), startedAt: day(3) }))).toBe(0);
  });

  it("reads Firestore-shaped timestamps", () => {
    const ts = (d: Date) => ({ toDate: () => d });
    expect(
      focusDaysActive(focus({ startedAt: ts(day(1)), status: "passed", achievedAt: ts(day(11)) })),
    ).toBe(10);
  });
});

describe("formatSpan", () => {
  it("says it the way a coach would", () => {
    expect(formatSpan(null)).toBe("—");
    expect(formatSpan(0)).toBe("under a day");
    expect(formatSpan(1)).toBe("1 day");
    expect(formatSpan(9)).toBe("9 days");
    expect(formatSpan(14)).toBe("2 weeks");
    expect(formatSpan(21)).toBe("3 weeks");
    expect(formatSpan(59)).toBe("8 weeks");
    expect(formatSpan(60)).toBe("2 months");
    expect(formatSpan(365)).toBe("12 months");
    expect(formatSpan(800)).toBe("2 years");
  });
});

describe("history and permissions", () => {
  const list = [
    focus({ id: "a", status: "active" }),
    focus({ id: "b", status: "passed", achievedAt: day(5) }),
    focus({ id: "c", status: "retired", retiredAt: day(20), trainerId: "t2", trainerName: "Sam", trainerInitials: "SK" }),
    focus({ id: "d", status: "passed", passedAt: day(12) }),
  ];

  it("lists ended focuses, most recently ended first, optionally by trainer", () => {
    expect(pastFocuses(list).map((f) => f.id)).toEqual(["c", "d", "b"]);
    expect(pastFocuses(list, "t1").map((f) => f.id)).toEqual(["d", "b"]);
  });

  it("names every trainer once, busiest first", () => {
    expect(focusTrainers(list)).toEqual([
      { id: "t1", name: "Jane Coach", initials: "JC", count: 3 },
      { id: "t2", name: "Sam", initials: "SK", count: 1 },
    ]);
  });

  it("labels passed as Achieved", () => {
    expect(FOCUS_OUTCOME_LABEL.passed).toBe("Achieved");
  });

  it("offers the actions only to whom the rules allow", () => {
    const f = focus({});
    expect(canManageFocus(f, ["t1"])).toBe(true);
    expect(canManageFocus(f, ["uid-x", "t1"])).toBe(true);
    expect(canManageFocus(f, ["t9"], "LifeTransformer")).toBe(false);
    // A studio leader is not in the clientFocuses update rule.
    expect(canManageFocus(f, ["t9"], "StudioLeader")).toBe(false);
    expect(canManageFocus(f, ["t9"], "Admin")).toBe(true);
    expect(canManageFocus(f, ["t9"], "FranchiseOwner")).toBe(true);
    const legacy = focus({ id: "legacy:trainerFocuses:x" });
    expect(isWritableFocus(legacy)).toBe(false);
    expect(canManageFocus(legacy, ["t1"], "Admin")).toBe(false);
  });
});
