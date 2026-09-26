import { describe, expect, it } from "vitest";
import {
  clockLabel,
  firstStep,
  nextStep,
  normaliseTime,
  prevStep,
  problemsFor,
  remindLabel,
  reminderPreset,
  taskSentence,
  withoutUndefined,
} from "./task-wizard";
import type { TaskTemplate } from "./types";

const TODAY = "2026-09-16";

function task(over: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: "",
    studioId: "s1",
    scope: "studio",
    title: "Wipe down",
    kind: "machine",
    category: "cleaning",
    target: { kind: "machine", machineIds: "all" },
    recurrence: { type: "daily", shifts: ["any"] },
    active: true,
    ...over,
  };
}

describe("normaliseTime and clockLabel", () => {
  it("pads and validates a clock time", () => {
    expect(normaliseTime("9:5")).toBe("09:05");
    expect(normaliseTime(" 15:30 ")).toBe("15:30");
    expect(normaliseTime("24:00")).toBeNull();
    expect(normaliseTime("noon")).toBeNull();
    expect(normaliseTime(undefined)).toBeNull();
  });

  it("says a time the way a person reads it", () => {
    expect(clockLabel("00:15")).toBe("12:15 AM");
    expect(clockLabel("12:00")).toBe("12:00 PM");
    expect(clockLabel("15:30")).toBe("3:30 PM");
  });

  it("says how early a reminder rings", () => {
    expect(remindLabel(0)).toBe("at the time");
    expect(remindLabel(10)).toBe("10 minutes before");
    expect(remindLabel(60)).toBe("1 hour before");
    expect(remindLabel(120)).toBe("2 hours before");
    expect(remindLabel(1440)).toBe("the day before");
  });
});

describe("problemsFor", () => {
  it("needs a title on the first step", () => {
    expect(problemsFor(task({ title: " " }), "what")).toEqual([
      { step: "what", field: "title", message: "Give the task a title." },
    ]);
    expect(problemsFor(task({ title: " " }), "when")).toEqual([]);
  });

  it("needs at least one machine when choosing machines", () => {
    expect(problemsFor(task({ target: { kind: "machine", machineIds: [] } }))[0].field).toBe("machines");
  });

  it("needs a client on a personal client task", () => {
    const t = task({ scope: "personal", kind: "client", target: { kind: "client" } });
    expect(problemsFor(t)[0].field).toBe("client");
    // A studio client task may be a general one ("client follow-ups").
    expect(problemsFor(task({ kind: "client", target: { kind: "client" } }))).toEqual([]);
  });

  it("needs a day for a one-off", () => {
    expect(problemsFor(task({ recurrence: { type: "once" } }), "when")[0].field).toBe("date");
    expect(problemsFor(task({ recurrence: { type: "once", onDate: TODAY } }), "when")).toEqual([]);
  });

  it("needs a real time, and a time for a reminder", () => {
    expect(problemsFor(task({ timeOfDay: "3pm" }))[0].field).toBe("time");
    expect(problemsFor(task({ remindMinutesBefore: 10 }))[0].field).toBe("remind");
    expect(problemsFor(task({ timeOfDay: "15:00", remindMinutesBefore: 10 }))).toEqual([]);
    expect(problemsFor(task({ remindMinutesBefore: null }))).toEqual([]);
  });
});

describe("taskSentence", () => {
  it("describes a daily closing duty on every machine", () => {
    expect(taskSentence(task({ recurrence: { type: "daily", shifts: ["pm"] }, requiresNote: true }))).toBe(
      "Every day at closing, on every machine. Everyone at the studio sees it on the days it's due. Closing it needs a note.",
    );
  });

  it("names the days of a weekly task, and a single machine by name", () => {
    const s = taskSentence(
      task({
        recurrence: { type: "weekly", daysOfWeek: [5, 1], shifts: ["am", "pm"] },
        target: { kind: "machine", machineIds: ["m-leg"] },
      }),
      { machineName: () => "Leg Press" },
    );
    expect(s).toBe(
      "Every Mon and Fri at opening and closing, on Leg Press. Everyone at the studio sees it on the days it's due.",
    );
  });

  it("describes a personal reminder", () => {
    const s = taskSentence(
      task({
        scope: "personal",
        kind: "client",
        target: { kind: "client", clientId: "c1", action: "progress-report" },
        recurrence: { type: "once", onDate: "2026-09-17" },
        timeOfDay: "15:30",
        remindMinutesBefore: 10,
      }),
      { todayKey: TODAY, clientName: () => "Grace Ahn" },
    );
    expect(s).toBe(
      "Once, tomorrow, 3:30 PM, for Grace Ahn (opens the progress report). Only you see it. Your bell rings 10 minutes before.",
    );
  });

  it("calls the stored 'assessment' action the Pulse, capital P (Sep 24 2026)", () => {
    const s = taskSentence(
      task({
        scope: "personal",
        kind: "client",
        target: { kind: "client", clientId: "c1", action: "assessment" },
        recurrence: { type: "once", onDate: "2026-09-17" },
      }),
      { todayKey: TODAY, clientName: () => "Grace Ahn" },
    );
    expect(s).toContain("for Grace Ahn (opens the Pulse).");
    expect(s).not.toMatch(/assessment/i);
  });

  it("says a one-off studio task tells its author, unless switched off", () => {
    const once = task({ recurrence: { type: "once", onDate: "2026-09-25" } });
    expect(taskSentence(once, { todayKey: TODAY })).toMatch(/^Once, Fri, Sep 25, on every machine\. .* You'll hear when it's done\.$/);
    expect(taskSentence({ ...once, notifyCreatorOnComplete: false })).not.toMatch(/hear/);
  });

  it("treats a weekly task with every day ticked as every day", () => {
    expect(taskSentence(task({ recurrence: { type: "weekly", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] } }))).toMatch(/^Every day,/);
  });
});

describe("withoutUndefined", () => {
  it("drops undefined at any depth and keeps nulls, arrays and dates", () => {
    const at = new Date(0);
    expect(
      withoutUndefined({ a: 1, b: undefined, c: { d: undefined, e: null, f: [1, { g: undefined }] }, at }),
    ).toEqual({ a: 1, c: { e: null, f: [1, {}] }, at });
  });

  it("leaves a class instance alone (a Firestore sentinel is one)", () => {
    class Sentinel {
      x = undefined;
    }
    const s = new Sentinel();
    expect(withoutUndefined({ s }).s).toBe(s);
  });
});

describe("steps", () => {
  it("opens a new task on What and an edit on Rules", () => {
    expect(firstStep(true)).toBe("what");
    expect(firstStep(false)).toBe("rules");
  });

  it("walks the steps in order", () => {
    expect(nextStep("what")).toBe("when");
    expect(nextStep("rules")).toBeNull();
    expect(prevStep("when")).toBe("what");
    expect(prevStep("what")).toBeNull();
  });
});

describe("reminderPreset", () => {
  it("is a one-off today at the next half hour on the studio's clock, bell at the time", () => {
    const p = reminderPreset(TODAY, new Date("2026-09-16T14:10:00-04:00"));
    expect(p.recurrence).toEqual({ type: "once", onDate: TODAY, shifts: ["any"] });
    expect(p.timeOfDay).toBe("14:30");
    expect(p.remindMinutesBefore).toBe(0);
  });

  it("never runs past the end of the day", () => {
    expect(reminderPreset(TODAY, new Date("2026-09-16T23:50:00-04:00")).timeOfDay).toBe("23:30");
  });
});
