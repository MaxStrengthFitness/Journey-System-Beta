import { describe, expect, it } from "vitest";
import { bodyMarksFromWords, painSkipNotes } from "./pain-notes";

describe("bodyMarksFromWords — only what the words say plainly", () => {
  it("reads a part and the side said just before it", () => {
    expect(bodyMarksFromWords("left knee")).toEqual([{ part: "knee", side: "left" }]);
    expect(bodyMarksFromWords("Right shoulder, tender since Tuesday")).toEqual([{ part: "shoulder", side: "right" }]);
    expect(bodyMarksFromWords("R hip")).toEqual([{ part: "hip", side: "right" }]);
    expect(bodyMarksFromWords("both wrists")).toEqual([{ part: "wrist", side: "both" }]);
    expect(bodyMarksFromWords("knees")).toEqual([{ part: "knee", side: "both" }]);
    expect(bodyMarksFromWords("feet")).toEqual([{ part: "foot", side: "both" }]);
    expect(bodyMarksFromWords("knee")).toEqual([{ part: "knee", side: null }]);
  });

  it("names more than one, in the map's order, and a centre part never has a side", () => {
    expect(bodyMarksFromWords("left knee and neck")).toEqual([
      { part: "neck", side: null },
      { part: "knee", side: "left" },
    ]);
    expect(bodyMarksFromWords("lower back")).toEqual([{ part: "lower_back", side: null }]);
  });

  it("never guesses: 'back' alone, or nothing plain, is no part", () => {
    expect(bodyMarksFromWords("back")).toEqual([]);
    expect(bodyMarksFromWords("felt off")).toEqual([]);
    expect(bodyMarksFromWords("")).toEqual([]);
    expect(bodyMarksFromWords(null)).toEqual([]);
    // "kneel" is not a knee, and "handle" is not a hand.
    expect(bodyMarksFromWords("couldn't kneel, grabbed the handle")).toEqual([]);
  });
});

describe("painSkipNotes — a set skipped for pain becomes an Incident at Finish", () => {
  const nameOf = (id: string) => ({ leg: "Leg Press", row: "Compound Row" })[id] ?? "";

  it("one per machine skipped for pain, with where when it was said", () => {
    const notes = painSkipNotes(
      [
        { machineId: "leg", outcome: "skipped", skipReason: "pain_injury", skipNote: "left knee." },
        { machineId: "row", outcome: "skipped", skipReason: "pain_injury", skipNote: "" },
        { machineId: "chest", outcome: "skipped", skipReason: "machine_occupied", skipNote: "busy" },
        { machineId: "curl", outcome: "performed", skipReason: null },
      ],
      nameOf,
    );
    expect(notes).toEqual([
      { machineId: "leg", body: "Skipped Leg Press for pain: left knee.", bodyParts: [{ part: "knee", side: "left" }] },
      { machineId: "row", body: "Skipped Compound Row for pain.", bodyParts: null },
    ]);
  });

  it("writes nothing for a pain skip that was undone before Finish, and never twice for one machine", () => {
    expect(painSkipNotes([{ machineId: "leg", outcome: null, skipReason: null, skipNote: "left knee" }], nameOf)).toEqual([]);
    expect(
      painSkipNotes(
        [
          { machineId: "leg", outcome: "skipped", skipReason: "pain_injury" },
          { machineId: "leg", outcome: "skipped", skipReason: "pain_injury" },
        ],
        nameOf,
      ),
    ).toHaveLength(1);
    expect(painSkipNotes([{ machineId: "x", outcome: "skipped", skipReason: "pain_injury" }], () => "")[0].body).toBe(
      "Skipped a machine for pain.",
    );
  });
});
