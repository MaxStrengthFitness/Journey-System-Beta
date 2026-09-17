import { describe, expect, it } from "vitest";
import {
  dueReminders,
  hasReminder,
  nextRing,
  reminderBody,
  reminderId,
  taskInstant,
  upcomingTimed,
} from "./reminders";
import type { TaskInstance, TaskTemplate } from "../../studio-tasks/types";

// Wednesday Sep 16 2026, studio time (Eastern, UTC-4).
const at = (hhmm: string, day = "2026-09-16") => new Date(`${day}T${hhmm}:00-04:00`);

function personal(over: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: "call",
    studioId: "s1",
    scope: "personal",
    ownerId: "u1",
    title: "Call Grace's physio",
    kind: "facility",
    category: "ops",
    target: { kind: "facility" },
    recurrence: { type: "once", onDate: "2026-09-16", shifts: ["any"] },
    timeOfDay: "15:30",
    remindMinutesBefore: 10,
    active: true,
    ...over,
  };
}

const none = new Set<string>();

describe("hasReminder and taskInstant", () => {
  it("needs a personal, active task with a time and a reminder", () => {
    expect(hasReminder(personal())).toBe(true);
    expect(hasReminder(personal({ scope: "studio" }))).toBe(false);
    expect(hasReminder(personal({ remindMinutesBefore: null }))).toBe(false);
    expect(hasReminder(personal({ timeOfDay: undefined }))).toBe(false);
    expect(hasReminder(personal({ active: false }))).toBe(false);
  });

  it("reads the time on the studio's clock", () => {
    expect(taskInstant(personal(), "2026-09-16")?.toISOString()).toBe("2026-09-16T19:30:00.000Z");
  });
});

describe("dueReminders", () => {
  it("rings once the reminder time has come", () => {
    expect(dueReminders({ templates: [personal()], instances: {}, now: at("15:19"), rung: none })).toEqual([]);
    const due = dueReminders({ templates: [personal()], instances: {}, now: at("15:20"), rung: none });
    expect(due.map((d) => d.id)).toEqual([reminderId("call", "2026-09-16")]);
    expect(due[0].ringAt.toISOString()).toBe("2026-09-16T19:20:00.000Z");
  });

  it("rings only once", () => {
    const rung = new Set([reminderId("call", "2026-09-16")]);
    expect(dueReminders({ templates: [personal()], instances: {}, now: at("15:25"), rung })).toEqual([]);
  });

  it("still rings a little late, but not hours after", () => {
    expect(dueReminders({ templates: [personal()], instances: {}, now: at("17:00"), rung: none })).toHaveLength(1);
    expect(dueReminders({ templates: [personal()], instances: {}, now: at("17:31"), rung: none })).toEqual([]);
  });

  it("stays quiet when the task is already done", () => {
    const instances: Record<string, TaskInstance> = {
      x: {
        id: "x",
        studioId: "s1",
        templateId: "call",
        localDate: "2026-09-16",
        shift: "any",
        status: "done",
      } as TaskInstance,
    };
    expect(dueReminders({ templates: [personal()], instances, now: at("15:25"), rung: none })).toEqual([]);
  });

  it("rings the day before for tomorrow's task", () => {
    const t = personal({ recurrence: { type: "once", onDate: "2026-09-17" }, remindMinutesBefore: 24 * 60 });
    const due = dueReminders({ templates: [t], instances: {}, now: at("15:31"), rung: none });
    expect(due.map((d) => d.dateKey)).toEqual(["2026-09-17"]);
  });

  it("rings a repeating task on each day it is due", () => {
    const t = personal({ recurrence: { type: "weekly", daysOfWeek: [3] }, remindMinutesBefore: 0 });
    expect(dueReminders({ templates: [t], instances: {}, now: at("15:30"), rung: none })).toHaveLength(1);
    // Thursday: not due.
    expect(dueReminders({ templates: [t], instances: {}, now: at("15:30", "2026-09-17"), rung: none })).toEqual([]);
  });

  it("ignores a studio task, even with the field set", () => {
    expect(dueReminders({ templates: [personal({ scope: "studio" })], instances: {}, now: at("15:25"), rung: none })).toEqual([]);
  });
});

describe("nextRing", () => {
  it("finds the soonest future ring", () => {
    const early = personal({ id: "a", timeOfDay: "16:00", remindMinutesBefore: 0 });
    const late = personal({ id: "b", timeOfDay: "18:00", remindMinutesBefore: 0 });
    expect(nextRing([late, early], at("15:00"))?.toISOString()).toBe("2026-09-16T20:00:00.000Z");
    expect(nextRing([late, early], at("19:00"))).toBeNull();
  });
});

describe("upcomingTimed", () => {
  it("lists timed personal tasks over the coming days, in time order", () => {
    const daily = personal({ id: "d", title: "Stretch", recurrence: { type: "daily" }, timeOfDay: "07:00", remindMinutesBefore: null });
    const once = personal();
    const untimed = personal({ id: "u", timeOfDay: undefined });
    const list = upcomingTimed([once, daily, untimed], "2026-09-16", 2);
    expect(list.map((u) => `${u.dateKey} ${u.time} ${u.template.title} ${u.reminds}`)).toEqual([
      "2026-09-16 07:00 Stretch false",
      "2026-09-16 15:30 Call Grace's physio true",
      "2026-09-17 07:00 Stretch false",
    ]);
  });
});

describe("reminderBody", () => {
  it("says the day and time, with the instructions if any", () => {
    const clock = (hhmm: string) => (hhmm === "15:30" ? "3:30 PM" : hhmm);
    expect(reminderBody({ template: personal(), dateKey: "2026-09-16" }, "2026-09-16", clock)).toBe("Today at 3:30 PM.");
    expect(
      reminderBody({ template: personal({ detail: "Ask about the MRI" }), dateKey: "2026-09-17" }, "2026-09-16", clock),
    ).toBe("Tomorrow at 3:30 PM — Ask about the MRI");
  });
});
