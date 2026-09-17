import { describe, expect, it } from "vitest";
import { missedList, teamRecord, teamSummary, teamWindow, type TeamRecordInput } from "./accountability";
import type { TaskInstance, TaskTemplate } from "../../studio-tasks/types";
import type { TeamJob } from "../jobs/types";
import type { InitiativeProgress } from "../../studio-tasks/initiatives";

const TODAY = "2026-09-16"; // Wednesday
const AJ = { id: "t-aj", name: "AJ Jurgens" };
const PRIYA = { id: "t-priya", name: "Priya Shah" };
const MARCUS = { id: "t-marcus", name: "Marcus Bell" };
const DANA = { id: "t-dana", name: "Dana Ortiz" };

const template = (id: string, title: string): TaskTemplate =>
  ({
    id,
    studioId: "s1",
    title,
    kind: "facility",
    category: "ops",
    target: { kind: "facility" },
    recurrence: { type: "daily" },
    active: true,
  }) as TaskTemplate;

let seq = 0;
const inst = (over: Partial<TaskInstance>): TaskInstance =>
  ({
    id: `i${++seq}`,
    studioId: "s1",
    templateId: "close",
    localDate: "2026-09-15",
    shift: "pm",
    status: "open",
    ...over,
  }) as TaskInstance;

const job = (over: Partial<TeamJob>): TeamJob =>
  ({
    id: "j",
    studioId: "s1",
    title: "Job",
    detail: "",
    category: "ops",
    about: { kind: "facility" },
    assignees: [],
    assigneeIds: [],
    openToAll: true,
    parts: {},
    dueOn: null,
    requiresNote: false,
    notifyOnDone: true,
    status: "open",
    closingNote: null,
    completedBy: null,
    createdBy: AJ,
    ...over,
  }) as TeamJob;

function input(over: Partial<TeamRecordInput> = {}): TeamRecordInput {
  return {
    roster: [AJ, PRIYA, MARCUS, DANA],
    todayKey: TODAY,
    instances: [],
    templates: [template("close", "Closing checklist"), template("wipe", "Wipe down every machine")],
    jobs: [],
    requests: [],
    initiatives: [],
    now: Date.parse("2026-09-16T15:00:00-04:00"),
    ...over,
  };
}

const texts = (r: { lines: { text: string }[] }) => r.lines.map((l) => l.text);
const byId = (records: ReturnType<typeof teamRecord>, id: string) => records.find((r) => r.person.id === id)!;

describe("teamRecord — what counts against a person", () => {
  it("counts an assigned task left open on a past day as missed", () => {
    const r = teamRecord(
      input({
        instances: [
          inst({ assignedTo: MARCUS, localDate: "2026-09-14" }),
          inst({ assignedTo: MARCUS, localDate: "2026-09-12" }),
        ],
      }),
    );
    const marcus = byId(r, "t-marcus");
    expect(marcus.standing).toBe("behind");
    expect(marcus.week.missed.map((m) => m.dateKey)).toEqual(["2026-09-14", "2026-09-12"]);
    expect(marcus.lines[0]).toEqual({
      text: "Missed 2 assigned tasks: Closing checklist (Mon), Closing checklist (Sat).",
      tone: "flag",
    });
    expect(r[0].person.id).toBe("t-marcus");
  });

  it("does not hold a task against the person named on it when someone else finished it", () => {
    const r = teamRecord(
      input({ instances: [inst({ assignedTo: MARCUS, status: "done", completedBy: PRIYA })] }),
    );
    expect(byId(r, "t-marcus").standing).toBe("on-track");
    expect(byId(r, "t-marcus").week.missed).toEqual([]);
    expect(byId(r, "t-priya").week.finished).toBe(1);
  });

  it("never counts a skipped task as missed", () => {
    const r = teamRecord(input({ instances: [inst({ assignedTo: MARCUS, status: "skipped" })] }));
    expect(byId(r, "t-marcus").week.missed).toEqual([]);
  });

  it("does not judge today", () => {
    const r = teamRecord(input({ instances: [inst({ assignedTo: MARCUS, localDate: TODAY })] }));
    const marcus = byId(r, "t-marcus");
    expect(marcus.standing).toBe("on-track");
    expect(marcus.today).toEqual({ assigned: 1, done: 0 });
    expect(texts(marcus)).toContain("Today: 0 of 1 assigned task done so far.");
  });

  it("never charges unassigned shift work to anyone", () => {
    const r = teamRecord(input({ instances: [inst({}), inst({ templateId: "wipe", machineId: "m1" })] }));
    expect(r.every((p) => p.standing === "quiet")).toBe(true);
  });

  it("counts a claimed-and-abandoned task separately from an assigned one", () => {
    const r = teamRecord(input({ instances: [inst({ claimedBy: DANA })] }));
    const dana = byId(r, "t-dana");
    expect(dana.standing).toBe("behind");
    expect(dana.week.missed).toEqual([]);
    expect(dana.week.leftOpen).toHaveLength(1);
    expect(dana.lines[0].text).toMatch(/^Took 1 task and left it open: Closing checklist/);
  });

  it("groups a per-machine task into one line with a count", () => {
    const r = teamRecord(
      input({
        instances: [
          inst({ templateId: "wipe", machineId: "m1", assignedTo: PRIYA }),
          inst({ templateId: "wipe", machineId: "m2", assignedTo: PRIYA }),
        ],
      }),
    );
    expect(byId(r, "t-priya").week.missed).toHaveLength(1);
    expect(missedList(byId(r, "t-priya").week.missed)).toBe("Wipe down every machine — closing (Tue, 2 machines)");
  });

  it("ignores a trainer's private tasks", () => {
    const r = teamRecord(input({ instances: [inst({ assignedTo: MARCUS, scope: "personal" })] }));
    expect(byId(r, "t-marcus").standing).toBe("quiet");
  });
});

describe("teamRecord — jobs, requests and initiatives", () => {
  it("flags an overdue job the person is on, with parts left", () => {
    const overdue = job({
      id: "j1",
      title: "Birthday cards",
      dueOn: "2026-09-14",
      assigneeIds: ["t-priya"],
      assignees: [PRIYA],
      parts: {
        p01: { id: "p01", label: "a", order: 0, doneBy: PRIYA },
        p02: { id: "p02", label: "b", order: 1, doneBy: null },
      },
    });
    const r = teamRecord(input({ jobs: [overdue] }));
    const priya = byId(r, "t-priya");
    expect(priya.standing).toBe("behind");
    expect(priya.jobs.overdue).toEqual([{ jobId: "j1", title: "Birthday cards", dueOn: "2026-09-14", left: 1 }]);
    expect(priya.jobs.partsDone).toBe(1);
    expect(priya.lines[0].text).toBe("On “Birthday cards” — overdue since Sep 14, 1 part left.");
  });

  it("does not flag an overdue job whose parts are all ticked", () => {
    const r = teamRecord(
      input({
        jobs: [
          job({
            dueOn: "2026-09-14",
            assigneeIds: ["t-priya"],
            parts: { p01: { id: "p01", label: "a", order: 0, doneBy: PRIYA } },
          }),
        ],
      }),
    );
    expect(byId(r, "t-priya").jobs.overdue).toEqual([]);
  });

  it("credits closed jobs to whoever closed them", () => {
    const r = teamRecord(input({ jobs: [job({ status: "done", completedBy: DANA })] }));
    expect(byId(r, "t-dana").jobs.closed).toBe(1);
    expect(texts(byId(r, "t-dana"))).toContain("Finished 1 job this week.");
  });

  it("flags a request held for two days or more, not one claimed this morning", () => {
    const now = Date.parse("2026-09-16T15:00:00-04:00");
    const r = teamRecord(
      input({
        now,
        requests: [
          { id: "r1", kind: "cover", title: "Cover Linda", status: "open", claimedBy: MARCUS, claimedAt: new Date(now - 3 * 86_400_000) },
          { id: "r2", kind: "question", title: "Seat height?", status: "open", claimedBy: PRIYA, claimedAt: new Date(now - 3_600_000) },
        ],
      }),
    );
    expect(byId(r, "t-marcus").holding).toEqual([{ requestId: "r1", title: "Cover Linda", days: 3 }]);
    expect(byId(r, "t-priya").holding).toEqual([]);
  });

  it("names an initiative a person has not met, and only calls it behind once its date has passed", () => {
    const progress = (count: number): InitiativeProgress => ({
      started: 1,
      met: 0,
      expected: 1,
      totalEntries: count,
      ratio: 0,
      perTrainer: [{ trainerId: "t-priya", trainerName: "Priya", count, target: 5, met: count >= 5, entries: [] }],
    });
    const open = teamRecord(input({ initiatives: [{ id: "i1", title: "Five reports", dueOn: "2026-09-30", progress: progress(3) }] }));
    expect(byId(open, "t-priya").standing).toBe("on-track");
    expect(texts(byId(open, "t-priya"))).toContain("3 of 5 for “Five reports”.");
    const late = teamRecord(input({ initiatives: [{ id: "i1", title: "Five reports", dueOn: "2026-09-10", progress: progress(3) }] }));
    expect(byId(late, "t-priya").standing).toBe("behind");
    const met = teamRecord(input({ initiatives: [{ id: "i1", title: "Five reports", dueOn: "2026-09-10", progress: progress(5) }] }));
    expect(byId(met, "t-priya").initiatives).toEqual([]);
  });
});

describe("teamRecord — people and order", () => {
  it("says so plainly when nothing has anyone's name on it", () => {
    const r = teamRecord(input());
    expect(r.every((p) => p.lines[0].text === "Nothing with their name on it this week.")).toBe(true);
  });

  it("adds a guest who was assigned work here, so it can be seen", () => {
    const guest = { id: "t-guest", name: "Guest Trainer" };
    const r = teamRecord(input({ instances: [inst({ assignedTo: guest })] }));
    expect(byId(r, "t-guest").standing).toBe("behind");
  });

  it("orders people behind first, then on track, then quiet", () => {
    const r = teamRecord(
      input({
        instances: [
          inst({ assignedTo: MARCUS }),
          inst({ assignedTo: PRIYA, status: "done", completedBy: PRIYA }),
        ],
      }),
    );
    expect(r.map((p) => p.standing)).toEqual(["behind", "on-track", "quiet", "quiet"]);
  });
});

describe("teamSummary and teamWindow", () => {
  it("adds up the team", () => {
    const r = teamRecord(
      input({
        instances: [inst({ assignedTo: MARCUS }), inst({ assignedTo: PRIYA, status: "done", completedBy: PRIYA })],
      }),
    );
    const s = teamSummary(r, [job({ dueOn: "2026-09-01" }), job({ assigneeIds: ["x"] }), job({ status: "done" })], TODAY);
    expect(s).toEqual({ assignedPast: 2, assignedPastDone: 1, behind: 1, jobsOpen: 2, jobsOverdue: 1, upForGrabs: 1 });
  });

  it("reads the last seven studio days, today included", () => {
    expect(teamWindow(TODAY)).toEqual({ from: "2026-09-10", to: TODAY });
  });
});
