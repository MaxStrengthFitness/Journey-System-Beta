import { describe, expect, it } from "vitest";
import { firstDayOf, missedList, shiftListReports, teamRecord, type TeamRecordInput } from "./accountability";
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
const flags = (r: { lines: { text: string; tone: string }[] }) => r.lines.filter((l) => l.tone === "flag").map((l) => l.text);
const byId = (records: ReturnType<typeof teamRecord>, id: string) => records.find((r) => r.person.id === id)!;
const NOTHING = "Nothing with their name on it in the last seven days.";

describe("teamRecord — what is said on a person's card", () => {
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
    expect(marcus.week.missed.map((m) => m.dateKey)).toEqual(["2026-09-14", "2026-09-12"]);
    expect(marcus.lines[0]).toEqual({
      text: "Missed 2 assigned tasks: Closing checklist (Mon), Closing checklist (Sat).",
      tone: "flag",
    });
    // Missing something does not move Marcus to the top: people are listed by
    // name (voice-review round, Sep 27 2026).
    expect(r.map((p) => p.person.id)).toEqual(["t-aj", "t-dana", "t-marcus", "t-priya"]);
  });

  it("carries no verdict: a card is its person's sentences, never 'behind' or 'on track'", () => {
    const r = teamRecord(input({ instances: [inst({ assignedTo: MARCUS })] }));
    expect(Object.keys(byId(r, "t-marcus"))).not.toContain("standing");
  });

  it("does not hold a task against the person named on it when someone else finished it", () => {
    const r = teamRecord(
      input({ instances: [inst({ assignedTo: MARCUS, status: "done", completedBy: PRIYA })] }),
    );
    expect(flags(byId(r, "t-marcus"))).toEqual([]);
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
    expect(flags(marcus)).toEqual([]);
    expect(marcus.today).toEqual({ assigned: 1, done: 0 });
    expect(texts(marcus)).toContain("Today: 0 of 1 assigned task done so far.");
  });

  it("never charges unassigned shift work to anyone", () => {
    const r = teamRecord(input({ instances: [inst({}), inst({ templateId: "wipe", machineId: "m1" })] }));
    expect(r.every((p) => texts(p).join() === NOTHING)).toBe(true);
  });

  it("counts a claimed-and-abandoned task separately from an assigned one", () => {
    const r = teamRecord(input({ instances: [inst({ claimedBy: DANA })] }));
    const dana = byId(r, "t-dana");
    expect(dana.week.missed).toEqual([]);
    expect(dana.week.leftOpen).toHaveLength(1);
    expect(dana.lines[0]).toMatchObject({ tone: "flag" });
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
    expect(texts(byId(r, "t-marcus"))).toEqual([NOTHING]);
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
        p01: { id: "p01", label: "a", order: 0, doneBy: PRIYA, doneAt: new Date("2026-09-13T15:00:00-04:00") },
        p02: { id: "p02", label: "b", order: 1, doneBy: null },
      },
    });
    const r = teamRecord(input({ jobs: [overdue] }));
    const priya = byId(r, "t-priya");
    expect(priya.jobs.overdue).toEqual([{ jobId: "j1", title: "Birthday cards", dueOn: "2026-09-14", left: 1 }]);
    expect(priya.jobs.partsDone).toBe(1);
    expect(priya.lines[0]).toEqual({ text: "On “Birthday cards” — overdue since Sep 14, 1 part left.", tone: "flag" });
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

  it("credits closed jobs to whoever closed them, in the last seven days", () => {
    const r = teamRecord(input({ jobs: [job({ status: "done", completedBy: DANA, closedOn: "2026-09-15" })] }));
    expect(byId(r, "t-dana").jobs.closed).toBe(1);
    expect(texts(byId(r, "t-dana"))).toContain("Finished 1 job in the last seven days.");
  });

  it("counts only what happened inside the seven days: a job closed 13 days ago and an old part are not this week's", () => {
    // The jobs read looks back fourteen days (useTeamJobs); the card says seven.
    const r = teamRecord(
      input({
        jobs: [
          job({ id: "old", status: "done", completedBy: DANA, closedOn: "2026-09-03" }),
          job({ id: "edge", status: "done", completedBy: DANA, closedOn: firstDayOf(TODAY) }),
          job({
            id: "long",
            status: "open",
            parts: {
              p01: { id: "p01", label: "a", order: 0, doneBy: DANA, doneAt: new Date("2026-08-20T12:00:00-04:00") },
              p02: { id: "p02", label: "b", order: 1, doneBy: DANA, doneAt: new Date("2026-09-15T12:00:00-04:00") },
              // No day to go by: not guessed into the window.
              p03: { id: "p03", label: "c", order: 2, doneBy: DANA },
            },
          }),
        ],
      }),
    );
    const dana = byId(r, "t-dana");
    expect(firstDayOf(TODAY)).toBe("2026-09-10");
    expect(dana.jobs.closed).toBe(1);
    expect(dana.jobs.partsDone).toBe(1);
    expect(texts(dana)).toContain("Finished 1 job part, 1 job in the last seven days.");
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

  it("names an initiative a person has not met, and flags it only once its date has passed", () => {
    const progress = (count: number): InitiativeProgress => ({
      started: 1,
      met: 0,
      expected: 1,
      totalEntries: count,
      ratio: 0,
      perTrainer: [{ trainerId: "t-priya", trainerName: "Priya", count, target: 5, met: count >= 5, entries: [] }],
    });
    const open = teamRecord(input({ initiatives: [{ id: "i1", title: "Five reports", dueOn: "2026-09-30", progress: progress(3) }] }));
    expect(byId(open, "t-priya").lines).toContainEqual({ text: "3 of 5 for “Five reports”.", tone: "plain" });
    const late = teamRecord(input({ initiatives: [{ id: "i1", title: "Five reports", dueOn: "2026-09-10", progress: progress(3) }] }));
    expect(byId(late, "t-priya").lines).toContainEqual({ text: "3 of 5 for “Five reports” — past its date.", tone: "flag" });
    const met = teamRecord(input({ initiatives: [{ id: "i1", title: "Five reports", dueOn: "2026-09-10", progress: progress(5) }] }));
    expect(byId(met, "t-priya").initiatives).toEqual([]);
  });
});

describe("teamRecord — people and order", () => {
  it("says so plainly when nothing has anyone's name on it", () => {
    const r = teamRecord(input());
    expect(r.every((p) => p.lines[0].text === NOTHING)).toBe(true);
  });

  it("adds a guest who was assigned work here, so it can be seen", () => {
    const guest = { id: "t-guest", name: "Guest Trainer" };
    const r = teamRecord(input({ instances: [inst({ assignedTo: guest })] }));
    expect(flags(byId(r, "t-guest"))).toHaveLength(1);
  });

  it("lists people by name, never behind first (recognition, never ranking — voice-review round)", () => {
    const r = teamRecord(
      input({
        instances: [
          inst({ assignedTo: MARCUS }),
          inst({ assignedTo: PRIYA, status: "done", completedBy: PRIYA }),
        ],
      }),
    );
    const names = r.map((p) => p.person.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    // The one who missed something is where their name puts them, not first.
    expect(r.findIndex((p) => flags(p).length > 0)).toBe(names.indexOf(MARCUS.name));
  });
});

describe("shiftListReports — the shift list's machine reports on Open loops", () => {
  const flagged = (over: Partial<TaskInstance>) => inst({ templateId: "check", status: "done", flagged: true, ...over });

  it("keeps a report from earlier in the week, not only today's (they used to drop off at midnight)", () => {
    const reports = shiftListReports([flagged({ id: "a", machineId: "leg-press", localDate: "2026-09-14", note: "Cable frayed", completedBy: DANA })]);
    expect(reports).toEqual([
      { key: "leg-press", machineId: "leg-press", templateId: "check", dateKey: "2026-09-14", note: "Cable frayed", by: DANA },
    ]);
  });

  it("lists a machine once, with its latest report, whichever duties flagged it", () => {
    const reports = shiftListReports([
      flagged({ id: "a", machineId: "leg-press", localDate: "2026-09-13", note: "Squeak" }),
      flagged({ id: "b", machineId: "leg-press", localDate: "2026-09-15", templateId: "wipe", note: "Pad torn" }),
      flagged({ id: "c", machineId: "chest", localDate: "2026-09-14" }),
    ]);
    expect(reports.map((r) => [r.key, r.note ?? null, r.dateKey])).toEqual([
      ["leg-press", "Pad torn", "2026-09-15"],
      ["chest", null, "2026-09-14"],
    ]);
  });

  it("leaves out a machine the Floor Map already flags, an unflagged row and a private task", () => {
    const reports = shiftListReports(
      [
        flagged({ id: "a", machineId: "leg-press" }),
        inst({ id: "b", machineId: "chest", status: "done" }),
        flagged({ id: "c", machineId: "row", scope: "personal" }),
      ],
      new Set(["leg-press"]),
    );
    expect(reports).toEqual([]);
  });

  it("takes the later copy of the same row, so today's live row wins over the week's read", () => {
    const week = flagged({ id: "today-row", machineId: "leg-press", localDate: TODAY });
    const live = { ...week, flagged: false };
    expect(shiftListReports([week, live])).toEqual([]);
    expect(shiftListReports([live, week])).toHaveLength(1);
  });

  it("closes a report when the same check on the same machine was done clean on a later day", () => {
    const reports = shiftListReports([
      flagged({ id: "mon", machineId: "leg-press", localDate: "2026-09-14", note: "Cable frayed", completedBy: DANA }),
      inst({ id: "tue", templateId: "check", machineId: "leg-press", localDate: "2026-09-15", status: "done", completedBy: PRIYA }),
    ]);
    expect(reports).toEqual([]);
  });

  it("keeps a report that a clean check of ANOTHER duty, another machine or an earlier day does not answer", () => {
    const reports = shiftListReports([
      flagged({ id: "tue", machineId: "leg-press", localDate: "2026-09-15", note: "Cable frayed" }),
      inst({ id: "wipe", templateId: "wipe", machineId: "leg-press", localDate: "2026-09-16", status: "done" }),
      inst({ id: "chest", templateId: "check", machineId: "chest", localDate: "2026-09-16", status: "done" }),
      inst({ id: "mon", templateId: "check", machineId: "leg-press", localDate: "2026-09-14", status: "done" }),
    ]);
    expect(reports.map((r) => [r.key, r.note])).toEqual([["leg-press", "Cable frayed"]]);
  });

  it("lists the machine's earlier report on another duty once the later one is closed clean", () => {
    const reports = shiftListReports([
      flagged({ id: "a", machineId: "leg-press", localDate: "2026-09-13", templateId: "wipe", note: "Pad torn" }),
      flagged({ id: "b", machineId: "leg-press", localDate: "2026-09-14", note: "Squeak" }),
      inst({ id: "c", templateId: "check", machineId: "leg-press", localDate: "2026-09-15", status: "done" }),
    ]);
    expect(reports.map((r) => [r.key, r.note, r.dateKey])).toEqual([["leg-press", "Pad torn", "2026-09-13"]]);
  });

  it("does not list a skipped row or a reopened one, even when the document still says flagged", () => {
    const reports = shiftListReports([
      flagged({ id: "skipped", machineId: "leg-press", status: "skipped", note: "Out of order" }),
      // Reopening writes status "open" and completedBy null, and leaves `flagged` as it was.
      flagged({ id: "reopened", machineId: "chest", status: "open", completedBy: null, note: "Squeak" }),
    ]);
    expect(reports).toEqual([]);
  });

  it("carries the row's own title, so a report still reads after its template is deleted", () => {
    const [report] = shiftListReports([flagged({ id: "a", machineId: "gone", title: "Weekly machine check" })]);
    expect(report.title).toBe("Weekly machine check");
  });

  it("lists a flagged row with no machine by itself", () => {
    const reports = shiftListReports([flagged({ id: "fac", localDate: "2026-09-15", templateId: "close" }), null, undefined]);
    expect(reports).toEqual([{ key: "fac", templateId: "close", dateKey: "2026-09-15", by: null }]);
  });
});
