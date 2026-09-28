import { describe, expect, it } from "vitest";
import type { Studio, Trainer } from "../../../types";
import {
  TEMPLATE,
  addDays,
  autoCheck,
  blockDue,
  blocksOf,
  buildChecklist,
  checklistLine,
  isLaunching,
  leadersOf,
  openingDayOf,
  openingRecord,
  readiness,
  shortDay,
  stageLine,
  stageOf,
  type SetupFacts,
} from "./checklist";
import { customItemId } from "./setup-store";
import { newStudioDoc } from "./AddStudioSheet";

const tz = "America/New_York";
const avon = {
  id: "edoras",
  name: "Edoras",
  timezone: tz,
  stage: "setting-up",
  openingDay: "2027-01-12",
  mindbodySiteId: "7120334",
  contactEmail: "edoras@example.com",
  phone: "440-555-0101",
} as unknown as Studio;
const person = (id: string, fullName: string, role: string, extra: Record<string, unknown> = {}) =>
  ({ id, fullName, initials: "XX", role, primaryHomeStudioId: "edoras", accessibleStudioIds: [], activeGuestStudioIds: [], ...extra }) as unknown as Trainer;
const trainers = [
  person("t-eowyn", "Éowyn", "StudioLeader", { mindbodyStaffId: "1" }),
  person("t-hama", "Háma", "LifeTransformer"),
  person("t-gamling", "Gamling", "LifeTransformer", { mindbodyStaffId: "3" }),
];
const facts = (over: Partial<SetupFacts> = {}): SetupFacts => ({
  studio: avon,
  studios: [avon],
  trainers,
  roster: { state: "ok", onFloor: 19 },
  today: "2026-09-28",
  ...over,
});

describe("a studio's stage and opening day", () => {
  it("reads only the three stages and a real day", () => {
    expect(stageOf(avon)).toBe("setting-up");
    expect(stageOf({ stage: "cooking" } as unknown as Studio)).toBeNull();
    expect(stageOf({} as Studio)).toBeNull();
    expect(openingDayOf(avon)).toBe("2027-01-12");
    expect(openingDayOf({ openingDay: "January" } as unknown as Studio)).toBeNull();
  });

  it("lists a studio on Launches while it is setting up or handed over, never the practice studio", () => {
    expect(isLaunching(avon)).toBe(true);
    expect(isLaunching({ ...avon, stage: "handed-over" })).toBe(true);
    expect(isLaunching({ ...avon, stage: "running" })).toBe(false);
    expect(isLaunching({ ...avon, stage: undefined })).toBe(false);
    expect(isLaunching({ ...avon, id: "demo-studio", isDemo: true } as unknown as Studio)).toBe(false);
  });

  it("says where it stands in words", () => {
    expect(stageLine(avon)).toBe("Setting up · opens Tue, Jan 12, 2027");
    expect(stageLine({ ...avon, openingDay: null })).toBe("Setting up · no opening day yet");
    expect(stageLine({ ...avon, stage: "running" })).toBe("Running");
    expect(stageLine({ ...avon, stage: undefined })).toBeNull();
  });

  it("counts days on the calendar, never through a time zone", () => {
    expect(addDays("2027-01-12", -7 * 13)).toBe("2026-10-13");
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-11-01", 7)).toBe("2026-11-08");
    expect(shortDay("2026-10-13")).toBe("Tue, Oct 13");
  });
});

describe("the setup checklist", () => {
  it("counts each block's due date back from the opening day", () => {
    expect(blockDue("studio", "2027-01-12")).toBe("2026-09-22");
    expect(blockDue("mindbody", "2027-01-12")).toBe("2026-10-13");
    expect(blockDue("floor", "2027-01-12")).toBe("2026-11-03");
    expect(blockDue("people", "2027-01-12")).toBe("2026-12-01");
    expect(blockDue("first-week", "2027-01-12")).toBe("2027-01-19");
    expect(blockDue("people", null)).toBeNull();
  });

  it("ticks the items it can from the studio's own data, and says why", () => {
    const items = buildChecklist(facts(), {});
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId.details).toMatchObject({ state: "done", proof: "Opens Tue, Jan 12, 2027." });
    expect(byId.contact).toMatchObject({ state: "todo", proof: "Missing: address." });
    expect(byId["mindbody-linked"]).toMatchObject({ state: "done", proof: "Mindbody site 7120334." });
    expect(byId.cutover).toMatchObject({ state: "todo", proof: "No Journey cutover date yet." });
    expect(byId["floor-machines"]).toMatchObject({ state: "done", proof: "19 machines on its floor." });
    expect(byId.leader).toMatchObject({ state: "done", proof: "Éowyn leads it." });
    expect(byId["staff-linked"]).toMatchObject({ state: "todo", proof: "1 of 3 aren't linked yet: Háma." });
    // A person's items wait for a person; the first week waits for the opening day.
    expect(byId["floor-names"].state).toBe("todo");
    expect(byId["first-session"].state).toBe("later");
    // Overdue: The studio block was due Sep 22, and its contact line isn't done.
    expect(byId.contact.overdue).toBe(true);
    expect(byId.cutover.overdue).toBe(false);
  });

  it("never says a floor it couldn't read is empty", () => {
    const failed = autoCheck("floor-machines", facts({ roster: { state: "failed" } }));
    expect(failed).toEqual({ state: "unknown", proof: "Couldn't read its floor just now." });
    expect(autoCheck("floor-machines", facts({ roster: { state: "ok", onFloor: 0 } })).state).toBe("todo");
  });

  it("reads what a person did: a tick with who, a skip with its reason, an item they added", () => {
    const at = { toMillis: () => Date.parse("2026-09-27T20:00:00Z") };
    const items = buildChecklist(facts(), {
      "floor-names": { block: "floor", title: "x", dueOn: "2026-11-03", doneAt: at, doneBy: { uid: "u", name: "Tuor" } },
      "staff-linked": { block: "people", title: "x", doneAt: null, doneBy: { uid: "u", name: "Tuor" }, skipReason: "Háma isn't on Mindbody yet." },
      "custom-a1": { block: "floor", title: "Order the chalk", dueOn: "2026-10-01", doneAt: null, doneBy: null },
      "custom-bad": { block: "the-bar", title: "Nope" },
    });
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId["floor-names"]).toMatchObject({ state: "done", doneByName: "Tuor", doneAt: Date.parse("2026-09-27T20:00:00Z") });
    expect(byId["staff-linked"]).toMatchObject({ state: "skipped", skipReason: "Háma isn't on Mindbody yet.", doneByName: "Tuor" });
    expect(byId["custom-a1"]).toMatchObject({ custom: true, block: "floor", state: "todo", dueOn: "2026-10-01", overdue: false });
    expect(byId["custom-bad"]).toBeUndefined();
    // The item added sits at the end of its own block.
    const floor = items.filter((i) => i.block === "floor").map((i) => i.id);
    expect(floor).toEqual(["floor-machines", "floor-names", "custom-a1"]);
    expect(items.filter((i) => !i.custom)).toHaveLength(TEMPLATE.length);
  });

  it("gives each block a word, and the whole a sentence", () => {
    const f = facts();
    const items = buildChecklist(f, {});
    const blocks = blocksOf(items, f);
    expect(blocks.map((b) => [b.title, b.word])).toEqual([
      ["The studio", "Overdue since Tue, Sep 22"],
      ["Mindbody", "Due Tue, Oct 13"],
      ["The floor", "Due Tue, Nov 3"],
      ["People", "Due Tue, Dec 1"],
      ["First week", "After Tue, Jan 12"],
    ]);
    const r = readiness(items, "setting-up");
    expect(r.sentence).toBe("Not ready to hand over: 4 things left.");
    expect(r.ready).toBe(false);
    expect(r.next?.id).toBe("contact");
    expect(r.overdue.map((i) => i.id)).toEqual(["contact"]);
  });

  it("is ready to hand over when blocks one to four are done or skipped on purpose", () => {
    const f = facts({
      studio: { ...avon, address: "Meduseld", journeyCutoverDate: "2027-01-12" } as Studio,
      trainers: trainers.map((t) => ({ ...t, mindbodyStaffId: "9" })) as Trainer[],
    });
    const items = buildChecklist(f, { "floor-names": { block: "floor", title: "x", doneAt: { toMillis: () => 1 }, doneBy: { uid: "u", name: "Tuor" } } });
    expect(readiness(items, "setting-up")).toMatchObject({ ready: true, sentence: "Ready to hand over." });
    expect(readiness(items, "handed-over").sentence).toBe("Handed over. First week: 3 things left.");
    expect(blocksOf(items, f)[0].word).toBe("Done");
  });

  it("says who leads a studio: a leader role at home there or owning it, never someone replaced", () => {
    const list = [
      ...trainers,
      person("t-owner", "Erkenbrand", "StudioOwner", { primaryHomeStudioId: "helms-deep", ownedStudioIds: ["edoras"] }),
      person("t-old", "Old Leader", "StudioLeader", { supersededByUid: "t-new" }),
      person("t-guest", "Guest Leader", "HeadTrainer", { primaryHomeStudioId: "helms-deep" }),
    ];
    expect(leadersOf(list, "edoras").map((t) => t.fullName)).toEqual(["Éowyn", "Erkenbrand"]);
  });
});

describe("what opening a studio says in the Activity record", () => {
  it("names the item and the studio", () => {
    expect(checklistLine("tick", "Edoras", { title: "First session logged" })).toBe("Ticked “First session logged” on Edoras's setup checklist.");
    expect(checklistLine("skip", "Edoras", { title: "Machines on the floor" }, "Not in the building yet.")).toBe(
      "Skipped “Machines on the floor” on Edoras's setup checklist: “Not in the building yet.”.",
    );
    expect(checklistLine("add", "Edoras", { title: "Order the chalk", block: "floor", dueOn: "2026-11-03" })).toBe(
      "Added “Order the chalk” to Edoras's setup checklist (The floor, due Tue, Nov 3, 2026).",
    );
  });

  it("says a change of stage and opening day together, from what to what", () => {
    expect(openingRecord("Edoras", { stage: null, openingDay: null }, { stage: "setting-up", openingDay: "2027-01-12" })).toEqual({
      what: "Set Edoras's stage to Setting up and its opening day to Tue, Jan 12, 2027.",
      before: { Stage: "Not recorded", "Opening day": "Not set" },
      after: { Stage: "Setting up", "Opening day": "Tue, Jan 12, 2027" },
    });
    expect(openingRecord("Edoras", { stage: "setting-up", openingDay: "2027-01-12" }, { stage: "handed-over", openingDay: "2027-01-12" })!.what).toBe(
      "Set Edoras's stage to Handed over.",
    );
    expect(openingRecord("Edoras", { stage: "running", openingDay: null }, { stage: "running", openingDay: null })).toBeNull();
  });
});

describe("adding a studio", () => {
  it("writes the studio with its stage, and nothing undefined or blank", () => {
    const base = { name: " Aglarond ", timezone: tz, networkId: "", locationType: "franchise" as const, opening: "soon" as const, openingDay: "2027-01-19", mode: "linked" as const, siteId: " 7120334 ", locationId: "", seed: true };
    expect(newStudioDoc(base, "t-tuor")).toEqual({
      name: "Aglarond",
      timezone: tz,
      ownerId: "t-tuor",
      mindbodyMode: "linked",
      locationType: "franchise",
      stage: "setting-up",
      openingDay: "2027-01-19",
      mindbodySiteId: "7120334",
    });
    const open = newStudioDoc({ ...base, opening: "open", openingDay: "", mode: "offline", siteId: "123" }, "t-tuor");
    expect(open.stage).toBe("running");
    expect("openingDay" in open).toBe(false);
    expect("mindbodySiteId" in open).toBe(false);
  });

  it("names an item an administrator adds so it never collides with the template", () => {
    expect(customItemId(0, 0)).toBe("custom-000");
    expect(customItemId(1_700_000_000_000, 0.5)).toMatch(/^custom-[0-9a-z]+$/);
    expect(TEMPLATE.some((t) => t.id.startsWith("custom-"))).toBe(false);
  });
});
