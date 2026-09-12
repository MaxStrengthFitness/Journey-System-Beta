import { describe, expect, it } from "vitest";
import { myTaskBuckets, taskMeta, timeLabel } from "./my-tasks";
import type { TaskRow } from "../studio-tasks/types";

const row = (
  id: string,
  over: {
    scope?: "studio" | "personal";
    status?: "open" | "done" | "skipped";
    time?: string;
    assignedTo?: string;
    clientName?: string;
    machineName?: string;
  } = {},
): TaskRow =>
  ({
    id,
    templateId: `t-${id}`,
    localDate: "2026-09-11",
    shift: "any",
    title: id,
    category: "operations",
    kind: "one-off",
    status: over.status ?? "open",
    clientName: over.clientName,
    machineName: over.machineName,
    template: { id: `t-${id}`, scope: over.scope ?? "personal", timeOfDay: over.time } as any,
    instance: over.assignedTo ? ({ assignedTo: { id: over.assignedTo, name: "X" } } as any) : null,
  }) as unknown as TaskRow;

describe("myTaskBuckets", () => {
  it("keeps personal tasks, open and done, in time order with untimed last", () => {
    const b = myTaskBuckets(
      [
        row("zeta"),
        row("call physio", { time: "14:00" }),
        row("towels", { time: "09:30" }),
        row("filed", { status: "done" }),
        row("skipped", { status: "skipped" }),
      ],
      "me",
    );
    expect(b.open.map((r) => r.id)).toEqual(["towels", "call physio", "zeta"]);
    expect(b.done.map((r) => r.id)).toEqual(["filed"]);
  });

  it("includes studio tasks only when they are assigned to this trainer and still open", () => {
    const b = myTaskBuckets(
      [
        row("mine", { scope: "studio", assignedTo: "me" }),
        row("theirs", { scope: "studio", assignedTo: "someone" }),
        row("unassigned", { scope: "studio" }),
        row("closed", { scope: "studio", assignedTo: "me", status: "done" }),
      ],
      "me",
    );
    expect(b.assigned.map((r) => r.id)).toEqual(["mine"]);
    expect(b.open).toEqual([]);
  });

  it("assigns nothing to a trainer it cannot identify", () => {
    expect(myTaskBuckets([row("x", { scope: "studio", assignedTo: "me" })], null).assigned).toEqual([]);
  });
});

describe("timeLabel / taskMeta", () => {
  it("reads studio-local times the way a person says them", () => {
    expect(timeLabel("09:30")).toBe("9:30 AM");
    expect(timeLabel("12:05")).toBe("12:05 PM");
    expect(timeLabel("00:15")).toBe("12:15 AM");
    expect(timeLabel("21:00")).toBe("9:00 PM");
    expect(timeLabel("after lunch")).toBe("after lunch");
    expect(timeLabel(undefined)).toBeNull();
  });

  it("joins time, client and machine, skipping what is missing", () => {
    expect(taskMeta(row("a", { time: "14:00", clientName: "Priya S", machineName: "Leg Press" }))).toBe(
      "2:00 PM · Priya S · Leg Press",
    );
    expect(taskMeta(row("b"))).toBe("");
  });
});
