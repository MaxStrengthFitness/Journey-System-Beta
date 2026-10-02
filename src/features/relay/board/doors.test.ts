import { describe, expect, it } from "vitest";
import { BEREGOND, GLORFINDEL, IORETH, MABLUNG, TODAY, ask, job, row, template } from "./fixtures";
import { boardItems, deckFor, doorFaces, doorOf, giverOf, jobsBehind, pressureOf, whereOf, whyNow, type BoardInput } from "./doors";

const wipe = template("wipe-down", { title: "Wipe-down round", estMinutes: 2 });
const report = template("report", { kind: "client", title: "Progress report for Hugo Bracegirdle", target: { kind: "client", clientId: "hugo", action: "progress-report" } as never });

const input = (over: Partial<BoardInput> = {}): BoardInput => ({
  rows: [row(wipe, "lp"), row(wipe, "cp"), row(wipe, "cr", "done"), row(report, undefined)],
  jobs: [
    job("towels", { title: "Restock towels", about: { kind: "facility" } }),
    job("cards", { title: "Birthday cards", about: { kind: "client", clientIds: ["x"], clientNames: { x: "Rosie Cotton" } } }),
  ],
  requests: [
    ask("cover", { kind: "cover", title: "Cover Farmer Maggot at 4:20", createdBy: MABLUNG, priority: "urgent" }),
    ask("q", { kind: "question", title: "Pullover elbows?", createdBy: BEREGOND }),
    ask("hugo", { kind: "handoff", title: "Finish Hugo's report", createdBy: BEREGOND, forId: IORETH.id, forName: IORETH.name }),
    ask("inbody", { kind: "initiative", title: "5 InBody scans each by Oct 31", createdBy: GLORFINDEL }),
  ],
  trainerId: IORETH.id,
  uid: IORETH.id,
  todayKey: TODAY,
  gapMinutes: 22,
  ...over,
});

describe("the five doors", () => {
  it("puts every open job behind the door where it happens, and yours behind Mine", () => {
    const i = input();
    const doors = Object.fromEntries(boardItems(i).map((it) => [it.id, doorOf(it, i)]));
    expect(doors["group:wipe-down:any"]).toBe("floor");
    expect(doors["job:towels"]).toBe("floor");
    expect(doors["job:cards"]).toBe("desk");
    expect(doors[`row:${row(report, undefined).id}`]).toBe("desk");
    expect(doors["ask:cover"]).toBe("help");
    expect(doors["ask:q"]).toBe("help");
    expect(doors["ask:hugo"]).toBe("mine");
    expect(doors["ask:inbody"]).toBe("lead");
  });

  it("counts on the older id as well as the Auth uid (the two differ on older accounts)", () => {
    const i = input({ uid: "auth-uid" });
    const hugo = boardItems(i).find((it) => it.id === "ask:hugo")!;
    expect(doorOf(hugo, i)).toBe("mine");
  });

  it("puts a job with your name on it behind Mine, and a leader's chore assigned to you", () => {
    const named = job("named", { title: "Mirrors", assignees: [IORETH], assigneeIds: [IORETH.id] });
    const i = input({ jobs: [named] });
    const item = boardItems(i).find((it) => it.id === "job:named")!;
    expect(doorOf(item, i)).toBe("mine");
  });

  it("says on each door how many, how long, and one more line — the chores for the whole studio, never a person", () => {
    const faces = doorFaces(input(), "mid");
    expect(faces.floor).toMatchObject({ label: "Floor work", count: "2 open", sub: "Mid chores 1 of 3", hot: false, n: 2 });
    expect(faces.floor.range).toBe("~4 min");
    expect(faces.desk).toMatchObject({ label: "Desk work", count: "2 open", sub: "1 client task" });
    expect(faces.help).toMatchObject({ label: "Help a teammate", count: "2 asks", sub: "cover needed", hot: true });
    expect(faces.lead).toMatchObject({ label: "From leadership", count: "1 initiative" });
    expect(faces.mine).toMatchObject({ label: "My work", count: "1 with your name", sub: "1 handed to you" });
  });

  it("deals the best fit first, and leaves out what was passed over", () => {
    const deck = deckFor("help", input());
    expect(deck.map((s) => s.item.id)).toEqual(["ask:cover", "ask:q"]);
    expect(deckFor("help", input({ snoozed: new Set(["ask:cover"]) })).map((s) => s.item.id)).toEqual(["ask:q"]);
  });

  it("files a team job behind the door where it happens", () => {
    const i = input();
    expect(jobsBehind("floor", i.jobs).map((j) => j.id)).toEqual(["towels"]);
    expect(jobsBehind("desk", i.jobs).map((j) => j.id)).toEqual(["cards"]);
  });
});

describe("the dealt card in words", () => {
  it("says why now as one sentence, or nothing", () => {
    expect(whyNow(["handed to you by Beregond", "due today", "fits your gap"])).toBe("Handed to you by Beregond, due today, fits your gap.");
    expect(whyNow([])).toBeNull();
  });

  it("names who a card comes from: a teammate, a leader, or the studio for a chore", () => {
    const i = input();
    const items = boardItems(i);
    expect(giverOf(items.find((x) => x.id === "ask:cover")!)).toEqual({ name: MABLUNG.name, person: true });
    expect(giverOf(items.find((x) => x.id === "group:wipe-down:any")!)).toEqual({ name: "The studio", person: false });
  });

  it("says where the work happens", () => {
    const items = boardItems(input());
    expect(whereOf(items.find((x) => x.id === "group:wipe-down:any")!)).toBe("on the floor");
    expect(whereOf(items.find((x) => x.id === "ask:q")!)).toBe("a reply in the app");
  });

  it("puts time pressure in words, orange and never red: a cover nobody has, overdue, due today", () => {
    const deck = deckFor("help", input());
    expect(pressureOf(deck[0])).toBe("cover needed");
    expect(pressureOf({ item: deck[1].item, why: ["due today"] })).toBe("due today");
    expect(pressureOf({ item: deck[1].item, why: [] })).toBeNull();
  });
});

describe("a cover ask that keeps its time (the second wave, Sep 28 2026)", () => {
  const at = (iso: string) => Date.parse(iso);
  const covers = [
    ask("five", { kind: "cover", title: "Cover Rosie Cotton at 5:00 PM", createdBy: MABLUNG, priority: "urgent", coverAt: at(`${TODAY}T17:00:00-04:00`) }),
    ask("thu", { kind: "cover", title: "Cover Hamfast Gamgee on Thursday at 9:30 AM", createdBy: BEREGOND, priority: "urgent", coverAt: at("2026-10-01T09:30:00-04:00") }),
    ask("four", { kind: "cover", title: "Cover Farmer Maggot at 4:20 PM", createdBy: BEREGOND, priority: "urgent", coverAt: at(`${TODAY}T16:20:00-04:00`) }),
    ask("q", { kind: "question", title: "Pullover elbows?", createdBy: BEREGOND, dueOn: TODAY }),
  ];

  it("deals the covers needed today first, soonest first, and one for a later day after today's asks", () => {
    const deck = deckFor("help", input({ requests: covers }));
    expect(deck.map((s) => s.item.id)).toEqual(["ask:four", "ask:five", "ask:q", "ask:thu"]);
  });

  it("says when each is needed: in orange today, and in the reasons for a later day", () => {
    const deck = deckFor("help", input({ requests: covers }));
    expect(pressureOf(deck[0])).toBe("needed at 4:20 PM");
    const thu = deck.find((s) => s.item.id === "ask:thu")!;
    expect(pressureOf(thu)).toBeNull();
    expect(whyNow(thu.why)).toContain("Needed Thursday at 9:30 AM");
    expect(thu.why).not.toContain("urgent");
  });

  it("names the soonest time on the door, and doesn't press for a cover on a later day", () => {
    expect(doorFaces(input({ requests: covers }), "mid").help).toMatchObject({ sub: "cover needed at 4:20 PM", hot: true });
    expect(doorFaces(input({ requests: [covers[1]] }), "mid").help).toMatchObject({ sub: "from teammates", hot: false });
  });

  it("stops pressing once someone has it", () => {
    const taken = ask("four", { ...covers[2], claimedBy: IORETH });
    const deck = deckFor("help", input({ requests: [taken] }));
    expect(pressureOf(deck[0])).toBeNull();
  });
});
