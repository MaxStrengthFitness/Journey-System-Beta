import { describe, expect, it } from "vitest";
import {
  blankCapture,
  captureProblems,
  captureSentence,
  detailOf,
  inferredCategory,
  repeatChipLabel,
  titleOf,
  toJobDraft,
  toRequest,
  toTemplate,
  whenChipLabel,
} from "./capture";

const TODAY = "2026-09-16";
const ctx = { todayKey: TODAY, studioName: "Solon", machineName: (id: string) => ({ lp: "Leg Press" })[id] ?? "" };
const author = { id: "u1", name: "Marina Borden" };

describe("the text", () => {
  it("splits the first line from the detail", () => {
    expect(titleOf("  Deep-clean the leg press \nsalt got tracked in\nand the pads")).toBe("Deep-clean the leg press");
    expect(detailOf("Deep-clean the leg press\nsalt got tracked in\nand the pads")).toBe("salt got tracked in\nand the pads");
    expect(detailOf("just a title")).toBe("");
  });
});

describe("the category follows the entity", () => {
  it("machine → cleaning, client → client service, growth → growth, else ops", () => {
    expect(inferredCategory(blankCapture({ machineIds: ["lp"] }))).toBe("cleaning");
    expect(inferredCategory(blankCapture({ client: { id: "c", name: "Priya" } }))).toBe("client-service");
    expect(inferredCategory(blankCapture({ growth: true }))).toBe("growth");
    expect(inferredCategory(blankCapture())).toBe("ops");
    expect(inferredCategory(blankCapture({ machineIds: ["lp"], category: "maintenance" }))).toBe("maintenance");
  });
});

describe("problems", () => {
  it("needs a title, a person for Someone, a day that hasn't passed, a time for a bell", () => {
    expect(captureProblems(blankCapture(), { todayKey: TODAY }).map((p) => p.field)).toEqual(["text"]);
    expect(captureProblems(blankCapture({ text: "x", destination: "someone" }), { todayKey: TODAY }).map((p) => p.field)).toEqual(["people"]);
    expect(captureProblems(blankCapture({ text: "x", date: "2026-09-01" }), { todayKey: TODAY }).map((p) => p.field)).toEqual(["date"]);
    expect(captureProblems(blankCapture({ text: "x", remindMinutesBefore: 10 }), { todayKey: TODAY }).map((p) => p.field)).toEqual(["remind"]);
    expect(captureProblems(blankCapture({ text: "x", repeat: "weekly" }), { todayKey: TODAY }).map((p) => p.field)).toEqual(["days"]);
    expect(captureProblems(blankCapture({ text: "x", machineIds: [] }), { todayKey: TODAY }).map((p) => p.field)).toEqual(["machines"]);
    expect(captureProblems(blankCapture({ text: "x", time: "14:30", remindMinutesBefore: 10 }), { todayKey: TODAY })).toEqual([]);
  });
});

describe("the sentence", () => {
  it("asks for the text first", () => {
    expect(captureSentence(blankCapture(), ctx)).toBe("Say what it is, then who it's for.");
  });
  it("a personal one-off reads as a to-do, with the bell when set", () => {
    expect(captureSentence(blankCapture({ text: "Call Priya's physio" }), ctx)).toBe("For you, today. Only you see it.");
    expect(captureSentence(blankCapture({ text: "Call", date: "2026-09-17", time: "14:30", remindMinutesBefore: 10 }), ctx)).toBe(
      "For you, tomorrow at 2:30 PM. Only you see it. Your bell rings 10 minutes before.",
    );
    expect(captureSentence(blankCapture({ text: "Read the hinge chapter", growth: true }), ctx)).toContain("Filed under Growth.");
  });
  it("a repeating personal task uses the template sentence", () => {
    const s = captureSentence(blankCapture({ text: "Stretch", repeat: "daily", shift: "am" }), ctx);
    expect(s).toContain("Every day at opening");
    expect(s).toContain("Only you see it.");
  });
  it("a floor ask names the studio, the machine, the day and the duration", () => {
    const s = captureSentence(
      blankCapture({ text: "Deep-clean the leg press", destination: "floor", machineIds: ["lp"], date: "2026-09-17", estMinutes: 10 }),
      ctx,
    );
    expect(s).toBe("On the Floor. Anyone at Solon can take it. Leg Press. Wanted by tomorrow. About 10 min.");
    expect(captureSentence(blankCapture({ text: "x", destination: "floor", askKind: "cover" }), ctx)).toContain("as a cover request");
  });
  it("a hand-off names the person", () => {
    const s = captureSentence(
      blankCapture({ text: "Call the physio", destination: "someone", people: [{ id: "a", name: "Austin Jurgens" }], notifyOnDone: true }),
      ctx,
    );
    expect(s).toBe("Handed to Austin. It rings their bell once and waits on their list. You'll hear when it's done.");
  });
  it("a team job counts its parts", () => {
    const s = captureSentence(
      blankCapture({
        text: "Deep clean",
        destination: "someone",
        someoneForm: "job",
        people: [{ id: "a", name: "Austin J" }, { id: "b", name: "Marina B" }],
        partLines: "Mirrors\nBathrooms\n\n",
        openToAll: false,
        date: "2026-09-18",
      }),
      ctx,
    );
    expect(s).toBe("A team job for Austin and Marina, by Fri, Sep 18. 2 parts to tick off.");
  });
});

describe("what each destination writes", () => {
  it("Me → a personal template with the bell and no undefined anywhere", () => {
    const t = toTemplate(blankCapture({ text: "Call Priya's physio\nre: shoulder", time: "14:30", remindMinutesBefore: 10, estMinutes: 5 }), {
      studioId: "s1",
      ownerId: "u1",
      todayKey: TODAY,
    });
    expect(t).toMatchObject({
      scope: "personal",
      ownerId: "u1",
      title: "Call Priya's physio",
      detail: "re: shoulder",
      kind: "facility",
      category: "ops",
      target: { kind: "facility" },
      recurrence: { type: "once", onDate: TODAY, shifts: ["any"] },
      timeOfDay: "14:30",
      remindMinutesBefore: 10,
      estMinutes: 5,
      active: true,
    });
    expect(JSON.stringify(t)).not.toContain("undefined");
    expect(t.id).toMatch(/^call-priya-s-physio-/);
  });
  it("a Floor task by a leader is a studio template that repeats", () => {
    const t = toTemplate(
      blankCapture({ text: "Wipe the mirrors", destination: "floor", floorForm: "task", repeat: "weekly", daysOfWeek: [3, 1], shift: "pm", notifyOnDone: true }),
      { studioId: "s1", ownerId: "u1", todayKey: TODAY },
    );
    expect(t.scope).toBe("studio");
    expect(t.ownerId).toBeUndefined();
    expect(t.recurrence).toEqual({ type: "weekly", daysOfWeek: [1, 3], shifts: ["pm"] });
    expect(t.notifyCreatorOnComplete).toBe(true);
    expect(t.remindMinutesBefore).toBeNull();
  });
  it("a monthly task keeps the chosen day of the month", () => {
    const t = toTemplate(blankCapture({ text: "Check the cables", repeat: "monthly", date: "2026-09-28" }), { studioId: "s1", ownerId: "u1", todayKey: TODAY });
    expect(t.recurrence).toEqual({ type: "monthly", dayOfMonth: 28, shifts: ["any"] });
  });
  it("The Floor → an ask with the machine, the day and the duration", () => {
    const r = toRequest(blankCapture({ text: "Leg press pad is torn", destination: "floor", askKind: "heads-up", machineIds: ["lp"], date: "2026-09-17", estMinutes: 5 }), {
      studioId: "s1",
      author,
      todayKey: TODAY,
    });
    expect(r).toMatchObject({ kind: "heads-up", title: "Leg press pad is torn", machineId: "lp", dueOn: "2026-09-17", estMinutes: 5, priority: "low", expiry: "none" });
    expect(r.forId).toBeUndefined();
    expect(toRequest(blankCapture({ text: "x", destination: "floor", askKind: "cover" }), { studioId: "s1", author, todayKey: TODAY }).priority).toBe("urgent");
    // several machines: none named on the ask, the board's topic falls to the text
    expect(toRequest(blankCapture({ text: "x", destination: "floor", machineIds: ["lp", "cp"] }), { studioId: "s1", author, todayKey: TODAY }).machineId).toBeUndefined();
  });
  it("Someone → a hand-off that carries the name", () => {
    const r = toRequest(blankCapture({ text: "Call the physio", destination: "someone", people: [{ id: "a", name: "Austin J" }], notifyOnDone: true }), {
      studioId: "s1",
      author,
      todayKey: TODAY,
    });
    expect(r).toMatchObject({ kind: "handoff", forId: "a", forName: "Austin J", priority: "normal", notifyOnDone: true });
  });
  it("a team job carries people, parts and the entity", () => {
    const d = toJobDraft(
      blankCapture({ text: "Birthday calls\nthis month's list", destination: "someone", someoneForm: "job", people: [{ id: "a", name: "Austin" }], partLines: "Priya\nMarcus", client: { id: "c1", name: "Priya A" } }),
      { clients: [] },
    );
    expect(d).toMatchObject({
      title: "Birthday calls",
      detail: "this month's list",
      category: "client-service",
      about: { kind: "client", clientIds: ["c1"], clientNames: { c1: "Priya A" } },
      assignees: [{ id: "a", name: "Austin" }],
      partLabels: ["Priya", "Marcus"],
    });
    expect(toJobDraft(blankCapture({ text: "x", machineIds: "all" }), { clients: [] }).about).toEqual({ kind: "machine", machineIds: [] });
  });
});

describe("chip labels", () => {
  it("say when and how often", () => {
    expect(whenChipLabel(blankCapture(), TODAY)).toBe("When");
    expect(whenChipLabel(blankCapture({ date: "2026-09-17" }), TODAY)).toBe("Tomorrow");
    expect(whenChipLabel(blankCapture({ shift: "am" }), TODAY)).toBe("Today · Opening");
    expect(whenChipLabel(blankCapture({ time: "09:05" }), TODAY)).toBe("today 9:05 AM");
    expect(repeatChipLabel(blankCapture())).toBe("Repeat");
    expect(repeatChipLabel(blankCapture({ repeat: "weekly", daysOfWeek: [5, 1] }))).toBe("Every Mon and Fri");
  });
});
