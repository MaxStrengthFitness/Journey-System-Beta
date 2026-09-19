import { describe, expect, it } from "vitest";
import {
  blankJobDraft,
  closeProblem,
  contributors,
  dayWords,
  dueLabel,
  isOnJob,
  isUpForGrabs,
  jobFields,
  jobFromDoc,
  jobProgress,
  jobTiming,
  jobTopic,
  partsBy,
  partsFor,
  peopleLine,
  sortJobs,
  sortedParts,
  uniqueActors,
  validateJobDraft,
  dueChoices,
  jobSummary,
} from "./jobs";
import type { JobDraft, TeamJob } from "./types";

const AJ = { id: "t-aj", name: "AJ Jurgens" };
const PRIYA = { id: "t-priya", name: "Priya Shah" };
const MARCUS = { id: "t-marcus", name: "Marcus Bell" };
const TODAY = "2026-09-16"; // a Wednesday
const machineName = (id: string) => ({ "m-leg": "Leg Press", "m-row": "Compound Row" })[id] ?? "";

function draft(patch: Partial<JobDraft> = {}): JobDraft {
  return { ...blankJobDraft(), title: "Deep clean", ...patch };
}

function job(patch: Partial<TeamJob> = {}): TeamJob {
  return {
    ...jobFields(draft(), "s1", AJ, machineName),
    id: "j1",
    ...patch,
  } as TeamJob;
}

describe("partsFor", () => {
  it("makes one part per client, labelled with the name", () => {
    const parts = partsFor(
      { kind: "client", clientIds: ["c1", "c2"], clientNames: { c1: "Linda Moreau", c2: "Tom Keller" } },
      [],
      machineName,
    );
    expect(Object.keys(parts)).toEqual(["p01", "p02"]);
    expect(parts.p01).toMatchObject({ label: "Linda Moreau", refId: "c1", order: 0, doneBy: null });
  });

  it("makes one part per machine, by its name", () => {
    const parts = partsFor({ kind: "machine", machineIds: ["m-leg", "m-row"] }, [], machineName);
    expect(sortedParts({ parts }).map((p) => p.label)).toEqual(["Leg Press", "Compound Row"]);
  });

  it("uses the typed lines for a facility job, dropping blanks", () => {
    const parts = partsFor({ kind: "facility" }, ["  Mirrors ", "", "Bathrooms"], machineName);
    expect(sortedParts({ parts }).map((p) => p.label)).toEqual(["Mirrors", "Bathrooms"]);
    expect(parts.p02.refId).toBeNull();
  });

  it("allows a job with no parts at all", () => {
    expect(partsFor({ kind: "facility" }, [], machineName)).toEqual({});
  });

  it("caps the parts at sixty", () => {
    const lines = Array.from({ length: 70 }, (_, i) => `Card ${i}`);
    expect(Object.keys(partsFor({ kind: "facility" }, lines, machineName))).toHaveLength(60);
  });
});

describe("validateJobDraft", () => {
  it("needs a title", () => {
    expect(validateJobDraft(draft({ title: "   " }), TODAY).map((p) => p.field)).toEqual(["title"]);
  });

  it("needs clients for a client job and machines for a machine job", () => {
    expect(validateJobDraft(draft({ about: { kind: "client", clientIds: [], clientNames: {} } }), TODAY)[0].field).toBe("about");
    expect(validateJobDraft(draft({ about: { kind: "machine", machineIds: [] } }), TODAY)[0].field).toBe("about");
  });

  it("refuses a due date in the past, and accepts today", () => {
    expect(validateJobDraft(draft({ dueOn: "2026-09-15" }), TODAY)[0].field).toBe("dueOn");
    expect(validateJobDraft(draft({ dueOn: TODAY }), TODAY)).toEqual([]);
  });

  it("refuses more than sixty parts rather than silently dropping them", () => {
    const partLabels = Array.from({ length: 61 }, (_, i) => `P${i}`);
    expect(validateJobDraft(draft({ partLabels }), TODAY)[0].field).toBe("parts");
  });
});

describe("jobFields", () => {
  it("keeps assignee ids beside the names, de-duplicated", () => {
    const f = jobFields(draft({ assignees: [PRIYA, MARCUS, PRIYA], openToAll: false }), "s1", AJ, machineName);
    expect(f.assignees).toEqual([PRIYA, MARCUS]);
    expect(f.assigneeIds).toEqual(["t-priya", "t-marcus"]);
    expect(f.openToAll).toBe(false);
  });

  it("makes a job with nobody named open to everyone, whatever the switch says", () => {
    expect(jobFields(draft({ openToAll: false }), "s1", AJ, machineName).openToAll).toBe(true);
  });

  it("starts open, unclosed, and signed by the poster", () => {
    const f = jobFields(draft({ title: "  Birthday   cards " }), "s1", AJ, machineName);
    expect(f).toMatchObject({ status: "open", title: "Birthday cards", createdBy: AJ, closingNote: null, closedOn: null });
  });

  it("carries only the names of the clients it is about", () => {
    const f = jobFields(
      draft({ about: { kind: "client", clientIds: ["c1"], clientNames: { c1: "Linda", c9: "Someone else" } } }),
      "s1",
      AJ,
      machineName,
    );
    expect(f.about).toEqual({ kind: "client", clientIds: ["c1"], clientNames: { c1: "Linda" } });
  });
});

describe("jobFromDoc", () => {
  it("reads a sparse or odd document without throwing", () => {
    const j = jobFromDoc("x", "s1", { parts: { p01: { label: "A", order: 0, doneBy: { id: "t1", name: "T" } }, bad: 3 } });
    expect(j.title).toBe("Untitled job");
    expect(j.status).toBe("open");
    expect(j.openToAll).toBe(true);
    expect(Object.keys(j.parts)).toEqual(["p01"]);
    expect(j.parts.p01.doneBy).toEqual({ id: "t1", name: "T" });
  });

  it("rebuilds assigneeIds from the names, so the two cannot disagree", () => {
    const j = jobFromDoc("x", "s1", { assignees: [PRIYA], assigneeIds: ["someone-else"], openToAll: false });
    expect(j.assigneeIds).toEqual(["t-priya"]);
    expect(j.openToAll).toBe(false);
  });

  it("ignores a malformed due date", () => {
    expect(jobFromDoc("x", "s1", { dueOn: "Friday" }).dueOn).toBeNull();
  });
});

describe("progress and people", () => {
  const withParts = job({
    parts: {
      p01: { id: "p01", label: "A", order: 0, doneBy: PRIYA },
      p02: { id: "p02", label: "B", order: 1, doneBy: null },
      p03: { id: "p03", label: "C", order: 2, doneBy: PRIYA },
    },
  });

  it("counts ticked parts", () => {
    expect(jobProgress(withParts)).toEqual({ done: 2, total: 3, allDone: false });
  });

  it("treats a job with no parts as one piece of work", () => {
    expect(jobProgress(job())).toEqual({ done: 0, total: 1, allDone: false });
    expect(jobProgress(job({ status: "done" }))).toEqual({ done: 1, total: 1, allDone: true });
  });

  it("lists who ticked parts once each, and how many", () => {
    expect(contributors(withParts)).toEqual([PRIYA]);
    expect(partsBy(withParts, "t-priya")).toBe(2);
    expect(partsBy(withParts, "t-marcus")).toBe(0);
  });

  it("says who is on it the way a person would", () => {
    expect(peopleLine([])).toBe("Nobody yet");
    expect(peopleLine([PRIYA])).toBe("Priya");
    expect(peopleLine([PRIYA, MARCUS], "t-marcus")).toBe("You and Priya");
    expect(peopleLine([PRIYA, MARCUS, AJ])).toBe("Priya, Marcus and AJ");
    expect(peopleLine([PRIYA, MARCUS, AJ, { id: "d", name: "Dana Ortiz" }])).toBe("Priya, Marcus and 2 more");
  });

  it("is up for grabs with nobody named, or when named and open to all", () => {
    expect(isUpForGrabs(job())).toBe(true);
    expect(isUpForGrabs(job({ assigneeIds: ["t-priya"], openToAll: false }))).toBe(false);
    expect(isUpForGrabs(job({ assigneeIds: ["t-priya"], openToAll: true }))).toBe(true);
    expect(isUpForGrabs(job({ status: "done" }))).toBe(false);
  });

  it("knows whether you are on it", () => {
    expect(isOnJob(job({ assigneeIds: ["t-priya"] }), "t-priya")).toBe(true);
    expect(isOnJob(job({ assigneeIds: ["t-priya"] }), null)).toBe(false);
  });

  it("de-duplicates people and drops blanks", () => {
    expect(uniqueActors([PRIYA, { id: "", name: "x" }, PRIYA, { id: "z", name: "" }])).toEqual([
      PRIYA,
      { id: "z", name: "A trainer" },
    ]);
  });
});

describe("dates", () => {
  it("names days the way a studio talks", () => {
    expect(dayWords(TODAY, TODAY)).toBe("today");
    expect(dayWords("2026-09-17", TODAY)).toBe("tomorrow");
    expect(dayWords("2026-09-15", TODAY)).toBe("yesterday");
    expect(dayWords("2026-09-18", TODAY)).toBe("Friday");
    expect(dayWords("2026-09-30", TODAY)).toBe("Sep 30");
  });

  it("grades how pressing a due date is", () => {
    expect(jobTiming({ dueOn: null }, TODAY)).toBe("whenever");
    expect(jobTiming({ dueOn: "2026-09-10" }, TODAY)).toBe("overdue");
    expect(jobTiming({ dueOn: TODAY }, TODAY)).toBe("today");
    expect(jobTiming({ dueOn: "2026-09-19" }, TODAY)).toBe("soon");
    expect(jobTiming({ dueOn: "2026-09-20" }, TODAY)).toBe("later");
  });

  it("labels overdue plainly and a closed job in the past tense", () => {
    expect(dueLabel({ dueOn: "2026-09-15", status: "open" }, TODAY)).toBe("Overdue — was due yesterday");
    expect(dueLabel({ dueOn: "2026-09-18", status: "open" }, TODAY)).toBe("Due Friday");
    expect(dueLabel({ dueOn: "2026-09-18", status: "done" }, TODAY)).toBe("Was due Friday");
    expect(dueLabel({ dueOn: null, status: "open" }, TODAY)).toBeNull();
  });
});

describe("sortJobs", () => {
  it("puts your open jobs first, then the most pressing, closed last", () => {
    const list = [
      job({ id: "closed", status: "done", assigneeIds: ["t-priya"] }),
      job({ id: "later", dueOn: "2026-10-01" }),
      job({ id: "overdue", dueOn: "2026-09-01" }),
      job({ id: "mine", dueOn: "2026-10-05", assigneeIds: ["t-priya"] }),
    ];
    expect(sortJobs(list, "t-priya", TODAY).map((j) => j.id)).toEqual(["mine", "overdue", "later", "closed"]);
  });
});

describe("closing and topics", () => {
  it("asks for a closing message only when the job requires one", () => {
    expect(closeProblem({ requiresNote: true }, " ")).toMatch(/closing message/);
    expect(closeProblem({ requiresNote: true }, "All clean")).toBeNull();
    expect(closeProblem({ requiresNote: false }, "")).toBeNull();
  });

  it("files a job under the chip its subject belongs to", () => {
    expect(jobTopic({ about: { kind: "client", clientIds: [], clientNames: {} } })).toBe("clients");
    expect(jobTopic({ about: { kind: "machine", machineIds: [] } })).toBe("equipment");
    expect(jobTopic({ about: { kind: "facility" } })).toBe("help");
  });
});

describe("dueChoices", () => {
  it("offers the coming Friday midweek, and next week's at the weekend", () => {
    // 2026-09-16 is a Wednesday; the 19th a Saturday.
    expect(dueChoicesFor("2026-09-16")).toContain("By Friday=2026-09-18");
    expect(dueChoicesFor("2026-09-18")).toContain("By Friday=2026-09-25");
    expect(dueChoicesFor("2026-09-19")).toContain("By Friday=2026-09-25");
  });
});

function dueChoicesFor(today: string) {
  return dueChoices(today).map((c) => `${c.label}=${c.dateKey}`);
}

describe("jobSummary", () => {
  it("says an unnamed job is up for grabs", () => {
    expect(jobSummary(draft(), TODAY)).toBe("Up for grabs — anyone at the studio can take it, no due date. One piece of work.");
  });

  it("names the people, the date, the parts and the closing rule", () => {
    const s = jobSummary(
      draft({
        assignees: [PRIYA, MARCUS],
        openToAll: false,
        dueOn: "2026-09-18",
        about: { kind: "client", clientIds: ["c1", "c2", "c3"], clientNames: {} },
        requiresNote: true,
      }),
      TODAY,
    );
    expect(s).toBe("Priya and Marcus are on it, due Friday. 3 clients to tick off. Closing it needs a message.");
  });
});
