/**
 * The intake's words a starting routine is matched on (intake.ts; the design
 * round, §4.2): medical history, goals, the clinical profile, and the
 * client's OPEN Health notes, so a knee named only in a Health note still
 * finds the knee's starting routine.
 */
import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../../types/journal";
import { openHealthWords, planIntakeText } from "./intake";
import { academyStartingRoutines, suggestFromStartingRoutines } from "./starting-routines";

type Entry = Parameters<typeof openHealthWords>[0] extends readonly (infer E)[] | null | undefined ? E : never;

const note = (over: Partial<Entry> & Pick<Entry, "id">): Entry => ({
  threadId: null,
  kind: "injury",
  category: "Surgery",
  body: "",
  resolvedAt: null,
  isArchived: false,
  origin: "profile" as JournalEntry["origin"],
  ...over,
});

describe("the open Health notes' words", () => {
  it("takes each open Health note's flavour and words, and the updates hung off it", () => {
    const words = openHealthWords([
      note({ id: "n1", body: "Knee replacement on Nov 3" }),
      note({ id: "u1", threadId: "n1", kind: "general", category: null, body: "Cleared for light work after Dec 1" }),
      note({ id: "n2", category: "Injury", body: "Sore shoulder" }),
    ]);
    expect(words).toEqual(["Surgery: Knee replacement on Nov 3", "Injury or pain: Sore shoulder", "Cleared for light work after Dec 1"]);
  });

  it("leaves out a closed or archived note, its updates, and every note that isn't Health", () => {
    const words = openHealthWords([
      note({ id: "closed", body: "Old wrist surgery", resolvedAt: new Date() }),
      note({ id: "u-closed", threadId: "closed", kind: "general", category: null, body: "Healed" }),
      note({ id: "gone", body: "Hip", isArchived: true }),
      note({ id: "coach", kind: "coaching", category: "Pace", body: "Slow the knee down on the lowering" }),
    ]);
    expect(words).toEqual([]);
  });

  it("an unread journal is no words, never a crash", () => {
    expect(openHealthWords(null)).toEqual([]);
    expect(openHealthWords(undefined)).toEqual([]);
  });
});

describe("the intake text", () => {
  it("joins what the client said with the open Health notes, and is null when there is nothing", () => {
    expect(
      planIntakeText({ medicalHistory: " Low back ", goals: "", clinicalProfile: ["osteoporosis"], healthNotes: ["Surgery: Knee replacement"] }),
    ).toBe("Low back · osteoporosis · Surgery: Knee replacement");
    expect(planIntakeText({ medicalHistory: "  ", goals: null, clinicalProfile: [], healthNotes: [] })).toBeNull();
  });

  it("a knee named only in an open Health note suggests the knee's starting routine", () => {
    const routines = academyStartingRoutines();
    const knee = routines.find((r) => r.matchWords.includes("knee"));
    expect(knee, "the Academy has a knee routine").toBeTruthy();
    const floor = [...new Set(routines.flatMap((r) => [...r.machineIds, ...r.dayOne]))].map((id) => ({ id }));
    const intakeText = planIntakeText({ healthNotes: openHealthWords([note({ id: "n1", body: "Knee replacement on Nov 3" })]) });
    const s = suggestFromStartingRoutines({ routines, choice: { use: null, defaultId: null }, intakeText, floor });
    expect(s.templateId).toBe(knee!.id);
    expect(s.why).toMatch(/^Matched from the intake: /);
  });
});
