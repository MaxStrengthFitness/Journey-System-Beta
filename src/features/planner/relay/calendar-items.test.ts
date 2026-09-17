import { describe, expect, it } from "vitest";
import { byDay, relayCalendarItems } from "./calendar-items";
import type { TaskTemplate } from "../../studio-tasks/types";
import type { TeamJob } from "../jobs/types";
import type { TaskRequest } from "../../studio-tasks/requests";

const t = (id: string, over: Partial<TaskTemplate> = {}): TaskTemplate => ({
  id,
  studioId: "s1",
  scope: "studio",
  title: id,
  kind: "facility",
  category: "ops",
  target: { kind: "facility" },
  recurrence: { type: "daily", shifts: ["any"] },
  active: true,
  ...over,
});
const job = (id: string, over: Partial<TeamJob> = {}): TeamJob =>
  ({ id, title: id, status: "open", assignees: [], assigneeIds: [], openToAll: true, dueOn: null, about: { kind: "facility" }, parts: {}, ...over }) as TeamJob;
const ask = (id: string, over: Partial<TaskRequest> = {}): TaskRequest =>
  ({ id, title: id, status: "open", kind: "todo", createdBy: { id: "m", name: "Marina Borden" }, ...over }) as TaskRequest;

const base = { fromKey: "2026-09-14", toKey: "2026-09-20", uid: "u1", trainerId: "t1" };

describe("relayCalendarItems", () => {
  it("draws personal timed tasks every day they fall, and one-off personal days without a time", () => {
    const items = relayCalendarItems({
      ...base,
      templates: [
        t("stretch", { scope: "personal", ownerId: "u1", timeOfDay: "07:00", remindMinutesBefore: 10, recurrence: { type: "weekly", daysOfWeek: [1, 3], shifts: ["any"] } }),
        t("call-physio", { scope: "personal", ownerId: "u1", recurrence: { type: "once", onDate: "2026-09-17", shifts: ["any"] } }),
        t("bins", { scope: "personal", ownerId: "u1" }),
      ],
      jobs: [],
      requests: [],
    });
    expect(items.map((i) => `${i.dateKey} ${i.time ?? "all-day"} ${i.title}`)).toEqual([
      "2026-09-14 07:00 stretch",
      "2026-09-16 07:00 stretch",
      "2026-09-17 all-day call-physio",
    ]);
    expect(items[0]).toMatchObject({ origin: "mine", kind: "reminder", reminds: true });
    expect(items[2].kind).toBe("task");
  });

  it("draws a studio task only with a set time, as the Floor's", () => {
    const items = relayCalendarItems({ ...base, templates: [t("wipe"), t("open-up", { timeOfDay: "05:30" })], jobs: [], requests: [] });
    expect(items).toHaveLength(7);
    expect(items[0]).toMatchObject({ title: "open-up", origin: "floor", kind: "studio-task", time: "05:30", open: { kind: "open-floor" } });
  });

  it("puts jobs, initiatives and hand-offs on their due day, mine in my colour", () => {
    const items = relayCalendarItems({
      ...base,
      templates: [],
      jobs: [job("deep clean", { dueOn: "2026-09-18", assignees: [{ id: "t1", name: "Austin J" }], assigneeIds: ["t1"], openToAll: false }), job("later", { dueOn: "2026-10-01" }), job("grabs", { dueOn: "2026-09-15" })],
      requests: [
        ask("CPRs", { kind: "initiative", target: { action: "progress-report", dueOn: "2026-09-19" } }),
        ask("call the physio", { kind: "handoff", forId: "u1", forName: "Me", dueOn: "2026-09-16" }),
        ask("no date"),
      ],
    });
    expect(items.map((i) => `${i.dateKey} ${i.title} ${i.origin}`)).toEqual([
      "2026-09-15 grabs floor",
      "2026-09-16 call the physio mine",
      "2026-09-18 deep clean mine",
      "2026-09-19 CPRs floor",
    ]);
    expect(items[0].sub).toBe("up for grabs");
    expect(items[2].sub).toBe("AJ");
    expect(items[2].open).toEqual({ kind: "open-job", jobId: "deep clean" });
    expect(items[1].sub).toBe("from Marina");
  });

  it("groups by day in order, timed before all-day", () => {
    const items = relayCalendarItems({
      ...base,
      templates: [t("open-up", { timeOfDay: "05:30", recurrence: { type: "once", onDate: "2026-09-15", shifts: ["any"] } })],
      jobs: [job("grabs", { dueOn: "2026-09-15" })],
      requests: [],
    });
    const days = byDay(items);
    expect(days).toHaveLength(1);
    expect(days[0].items.map((i) => i.title)).toEqual(["open-up", "grabs"]);
  });
});
