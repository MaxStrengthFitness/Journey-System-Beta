import { describe, expect, it } from "vitest";
import { taskMeta, timeLabel } from "./my-tasks";
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
