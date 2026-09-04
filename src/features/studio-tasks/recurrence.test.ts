import { describe, expect, it } from "vitest";
import {
  dayOfMonthOf,
  expandTemplate,
  instanceId,
  isTemplateDueOn,
  planDay,
  shiftsFor,
  weekdayOf,
} from "./recurrence";
import type { TaskTemplate } from "./types";

const tpl = (over: Partial<TaskTemplate> = {}): TaskTemplate => ({
  id: "t1",
  studioId: "solon",
  title: "Wipe down",
  kind: "machine",
  category: "cleaning",
  target: { kind: "machine", machineIds: "all" },
  recurrence: { type: "daily" },
  active: true,
  ...over,
});

describe("weekdayOf", () => {
  it("reads the key as the calendar day it names, not the device's", () => {
    // 2026-09-06 is a Sunday. Parsed as local time this flips to Saturday for
    // anyone west of UTC, which would silently shift every weekly task by a day.
    expect(weekdayOf("2026-09-06")).toBe(0);
    expect(weekdayOf("2026-09-07")).toBe(1);
    expect(weekdayOf("2026-09-12")).toBe(6);
  });

  it("agrees with the date regardless of how it was built", () => {
    expect(dayOfMonthOf("2026-09-04")).toBe(4);
    expect(dayOfMonthOf("2026-12-31")).toBe(31);
  });
});

describe("isTemplateDueOn", () => {
  it("never fires an inactive template", () => {
    expect(isTemplateDueOn(tpl({ active: false }), "2026-09-04")).toBe(false);
  });

  it("fires a daily template every day", () => {
    expect(isTemplateDueOn(tpl(), "2026-09-04")).toBe(true);
    expect(isTemplateDueOn(tpl(), "2026-09-05")).toBe(true);
  });

  it("fires a weekly template only on its days", () => {
    const t = tpl({ recurrence: { type: "weekly", daysOfWeek: [1, 3, 5] } });
    expect(isTemplateDueOn(t, "2026-09-07")).toBe(true); // Monday
    expect(isTemplateDueOn(t, "2026-09-08")).toBe(false); // Tuesday
    expect(isTemplateDueOn(t, "2026-09-09")).toBe(true); // Wednesday
  });

  it("treats an empty weekly selection as every day, not never", () => {
    // A half-finished edit should be loud, not silent. A manager who thinks
    // they scheduled something and gets nothing has no way to tell why.
    const t = tpl({ recurrence: { type: "weekly", daysOfWeek: [] } });
    expect(isTemplateDueOn(t, "2026-09-08")).toBe(true);
  });

  it("fires a monthly template on its day only", () => {
    const t = tpl({ recurrence: { type: "monthly", dayOfMonth: 15 } });
    expect(isTemplateDueOn(t, "2026-09-15")).toBe(true);
    expect(isTemplateDueOn(t, "2026-09-14")).toBe(false);
  });

  it("skips a monthly 31st in a short month rather than moving it", () => {
    // Clamping to the last day would silently reschedule a quarterly service
    // check. Skipping is visible; moving is not.
    const t = tpl({ recurrence: { type: "monthly", dayOfMonth: 31 } });
    expect(isTemplateDueOn(t, "2026-09-30")).toBe(false);
    expect(isTemplateDueOn(t, "2026-10-31")).toBe(true);
  });

  it("fires a one-off on its date only", () => {
    const t = tpl({ recurrence: { type: "once", onDate: "2026-09-04" } });
    expect(isTemplateDueOn(t, "2026-09-04")).toBe(true);
    expect(isTemplateDueOn(t, "2026-09-05")).toBe(false);
  });
});

describe("shiftsFor", () => {
  it("defaults to a single anytime instance", () => {
    expect(shiftsFor(tpl())).toEqual(["any"]);
  });

  it("keeps opening and closing separate", () => {
    // Closing is not satisfied by having opened, so these are two instances.
    const t = tpl({ recurrence: { type: "daily", shifts: ["am", "pm"] } });
    expect(shiftsFor(t)).toEqual(["am", "pm"]);
  });
});

describe("instanceId", () => {
  it("is derived entirely from its coordinates", () => {
    expect(instanceId("t1", "2026-09-04", "am")).toBe("t1__2026-09-04__am");
    expect(instanceId("t1", "2026-09-04", "am", "m-ext")).toBe(
      "t1__2026-09-04__am__m-ext",
    );
  });

  it("is stable, which is what makes materialization idempotent", () => {
    // Three iPads opening the list in the same second must compute the same id
    // and merge onto one document rather than create three copies of the day.
    const a = instanceId("t1", "2026-09-04", "any", "m-hip-abd");
    const b = instanceId("t1", "2026-09-04", "any", "m-hip-abd");
    expect(a).toBe(b);
  });

  it("never contains a character Firestore forbids in a doc id", () => {
    const id = instanceId("t-1", "2026-09-04", "pm", "sm-solon-leg-press");
    expect(id).not.toContain("/");
    expect(id.length).toBeLessThan(1500);
  });

  it("separates shifts and machines so neither collides", () => {
    const ids = new Set([
      instanceId("t1", "2026-09-04", "am"),
      instanceId("t1", "2026-09-04", "pm"),
      instanceId("t1", "2026-09-04", "am", "m-ext"),
      instanceId("t1", "2026-09-04", "am", "m-leg-curl"),
    ]);
    expect(ids.size).toBe(4);
  });
});

describe("expandTemplate", () => {
  const machines = ["m-ext", "m-leg-curl", "m-hip-abd"];

  it("produces one instance per machine for an all-machines template", () => {
    const out = expandTemplate(tpl(), "2026-09-04", machines);
    expect(out).toHaveLength(3);
    expect(out.map((i) => i.machineId)).toEqual(machines);
  });

  it("expands 'all' against the CURRENT roster, so new equipment is covered", () => {
    const out = expandTemplate(tpl(), "2026-09-04", [...machines, "sm-solon-x"]);
    expect(out.map((i) => i.machineId)).toContain("sm-solon-x");
  });

  it("drops machines the studio no longer has", () => {
    const t = tpl({
      target: { kind: "machine", machineIds: ["m-ext", "m-retired"] },
    });
    const out = expandTemplate(t, "2026-09-04", machines);
    expect(out.map((i) => i.machineId)).toEqual(["m-ext"]);
  });

  it("multiplies machines by shifts", () => {
    const t = tpl({ recurrence: { type: "daily", shifts: ["am", "pm"] } });
    expect(expandTemplate(t, "2026-09-04", machines)).toHaveLength(6);
  });

  it("produces exactly one instance for a facility task", () => {
    const t = tpl({
      kind: "facility",
      target: { kind: "facility", area: "Front desk" },
    });
    const out = expandTemplate(t, "2026-09-04", machines);
    expect(out).toHaveLength(1);
    expect(out[0].machineId).toBeUndefined();
  });

  it("produces nothing on a day it is not due", () => {
    const t = tpl({ recurrence: { type: "weekly", daysOfWeek: [1] } });
    expect(expandTemplate(t, "2026-09-08", machines)).toEqual([]);
  });

  it("denormalizes the title so a completed instance survives a rename", () => {
    const out = expandTemplate(tpl({ title: "Sanitize" }), "2026-09-04", ["m-ext"]);
    expect(out[0].title).toBe("Sanitize");
    expect(out[0].category).toBe("cleaning");
  });
});

describe("planDay", () => {
  it("orders opening before anytime before closing", () => {
    const templates = [
      tpl({
        id: "close",
        title: "Lock up",
        kind: "facility",
        target: { kind: "facility" },
        recurrence: { type: "daily", shifts: ["pm"] },
      }),
      tpl({
        id: "open",
        title: "Unlock",
        kind: "facility",
        target: { kind: "facility" },
        recurrence: { type: "daily", shifts: ["am"] },
      }),
      tpl({
        id: "mid",
        title: "Trash",
        kind: "facility",
        target: { kind: "facility" },
        recurrence: { type: "daily" },
      }),
    ];
    expect(planDay(templates, "2026-09-04", []).map((i) => i.templateId)).toEqual([
      "open",
      "mid",
      "close",
    ]);
  });

  it("respects the manager's explicit order within a shift", () => {
    const mk = (id: string, order: number) =>
      tpl({
        id,
        order,
        title: id,
        kind: "facility",
        target: { kind: "facility" },
      });
    const out = planDay([mk("b", 2), mk("a", 1)], "2026-09-04", []);
    expect(out.map((i) => i.templateId)).toEqual(["a", "b"]);
  });

  it("produces no duplicate ids across a whole day", () => {
    const templates = [
      tpl({ id: "wipe", recurrence: { type: "daily", shifts: ["am", "pm"] } }),
      tpl({ id: "inspect", recurrence: { type: "daily" } }),
    ];
    const out = planDay(templates, "2026-09-04", ["m-ext", "m-leg-curl"]);
    expect(new Set(out.map((i) => i.id)).size).toBe(out.length);
  });

  it("is stable — replanning the same day gives the same ids in the same order", () => {
    const templates = [tpl({ id: "wipe" })];
    const a = planDay(templates, "2026-09-04", ["m-ext", "m-leg-curl"]);
    const b = planDay(templates, "2026-09-04", ["m-ext", "m-leg-curl"]);
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });
});
