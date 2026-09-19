import { beforeEach, describe, expect, it } from "vitest";
import { emptyPrompt, nextUp, resetSnoozes, snooze, snoozedIds } from "./next-up";
import type { TaskRow, TaskTemplate } from "../../studio-tasks/types";
import type { TeamJob } from "../jobs/types";
import type { TaskRequest } from "../../studio-tasks/requests";

const TODAY = "2026-09-16";

const template = (id: string, extra: Partial<TaskTemplate> = {}): TaskTemplate => ({
  id,
  studioId: "s1",
  scope: "studio",
  title: id,
  kind: "machine",
  category: "cleaning",
  target: { kind: "machine", machineIds: "all" },
  recurrence: { type: "daily", shifts: ["any"] },
  active: true,
  ...extra,
});

const row = (t: TaskTemplate, machineId: string | undefined, status: "open" | "done" = "open", extra: Partial<TaskRow> = {}): TaskRow => ({
  id: `${t.id}__${TODAY}__any${machineId ? `__${machineId}` : ""}`,
  templateId: t.id,
  localDate: TODAY,
  shift: "any",
  machineId,
  title: t.title,
  category: t.category,
  kind: t.kind,
  template: t,
  instance: status === "done" ? ({ status: "done" } as never) : null,
  status,
  ...extra,
});

const ask = (id: string, extra: Partial<TaskRequest> = {}): TaskRequest =>
  ({
    id,
    studioId: "s1",
    kind: "todo",
    title: id,
    createdBy: { id: "x", name: "Xavier Lee" },
    status: "open",
    replyCount: 0,
    priority: "low",
    ...extra,
  }) as TaskRequest;

const job = (id: string, extra: Partial<TeamJob> = {}): TeamJob =>
  ({
    id,
    studioId: "s1",
    title: id,
    detail: "",
    category: "ops",
    about: { kind: "facility" },
    assignees: [],
    assigneeIds: [],
    openToAll: true,
    parts: {},
    dueOn: null,
    requiresNote: false,
    notifyOnDone: false,
    status: "open",
    closingNote: null,
    completedBy: null,
    createdBy: { id: "x", name: "X" },
    ...extra,
  }) as TeamJob;

const base = { trainerId: "t1", uid: "t1", todayKey: TODAY, gapMinutes: 12 as number | null };

describe("nextUp", () => {
  beforeEach(() => resetSnoozes());

  it("puts what was handed to me first, then what is due, then what fits", () => {
    const wipe = template("wipe");
    const rows = [row(wipe, "lp"), row(wipe, "cp"), row(wipe, "row", "done")];
    const requests = [
      ask("call-physio", { kind: "handoff", forId: "t1", forName: "Me", createdBy: { id: "m", name: "Marina Borden" } }),
      ask("torn-pad", { dueOn: "2026-09-15", estMinutes: 40 }),
      ask("mirrors", { estMinutes: 5 }),
    ];
    const list = nextUp({ ...base, rows, jobs: [], requests });
    expect(list.map((s) => s.item.title)).toEqual(["call-physio", "torn-pad", "mirrors"]);
    expect(list[0].why).toContain("handed to you by Marina");
    expect(list[1].why).toContain("overdue");
    expect(list[1].fits).toBe(false);
    expect(list[2].why).toContain("fits your gap");
  });

  it("folds a machine template into one group card sized by its open rows", () => {
    const wipe = template("Wipe down machines");
    const rows = [row(wipe, "a"), row(wipe, "b"), row(wipe, "c"), row(wipe, "d", "done")];
    const list = nextUp({ ...base, rows, jobs: [], requests: [] });
    expect(list).toHaveLength(1);
    expect(list[0].item.kind).toBe("group");
    expect(list[0].item.estMinutes).toBe(6);
    expect(list[0].fits).toBe(true);
  });

  it("leaves out finished groups, resolved asks, closed jobs, initiatives and jobs on other people", () => {
    const wipe = template("wipe");
    const rows = [row(wipe, "a", "done")];
    const requests = [ask("done", { status: "resolved" }), ask("init", { kind: "initiative" })];
    const jobs = [
      job("closed", { status: "done" }),
      job("theirs", { assigneeIds: ["t9"], assignees: [{ id: "t9", name: "T" }], openToAll: false }),
      job("grabs"),
    ];
    const list = nextUp({ ...base, rows, jobs, requests });
    expect(list.map((s) => s.item.title)).toEqual(["grabs"]);
  });

  it("nudges up what touches the session that just ended", () => {
    const requests = [ask("leg press", { machineId: "lp", estMinutes: 5 }), ask("chest press", { machineId: "cp", estMinutes: 5 })];
    const list = nextUp({ ...base, rows: [], jobs: [], requests, lastMachineIds: ["cp"] });
    expect(list[0].item.title).toBe("chest press");
    expect(list[0].why).toContain("from the session you just had");
  });

  it("an urgent cover outranks a to-do of the same tier", () => {
    const requests = [ask("todo", { estMinutes: 5 }), ask("cover 2pm", { kind: "cover", priority: "urgent", estMinutes: 5 })];
    expect(nextUp({ ...base, rows: [], jobs: [], requests })[0].item.title).toBe("cover 2pm");
  });

  it("with no next session, nothing is marked as not fitting", () => {
    const requests = [ask("long", { estMinutes: 90 })];
    const list = nextUp({ ...base, gapMinutes: null, rows: [], jobs: [], requests });
    expect(list[0].fits).toBeNull();
  });

  it("caps at three and honours a snooze for the phase", () => {
    const requests = ["a", "b", "c", "d"].map((id) => ask(id, { estMinutes: 2 }));
    expect(nextUp({ ...base, rows: [], jobs: [], requests })).toHaveLength(3);
    const snoozed = snooze("s1", TODAY, "mid", "ask:a");
    expect(snoozedIds("s1", TODAY, "mid")).toEqual(snoozed);
    expect(snoozedIds("s1", TODAY, "closing").size).toBe(0);
    const list = nextUp({ ...base, rows: [], jobs: [], requests, snoozed });
    expect(list.map((s) => s.item.title)).toEqual(["b", "c", "d"]);
  });
});

describe("emptyPrompt", () => {
  it("is sized to the gap", () => {
    expect(emptyPrompt(null, null).title).toBe("Nothing waiting on the Floor.");
    expect(emptyPrompt(3, "Priya").body).toBe("Priya is up.");
    expect(emptyPrompt(14, "Priya").body).toContain("14 min until Priya");
  });
});
