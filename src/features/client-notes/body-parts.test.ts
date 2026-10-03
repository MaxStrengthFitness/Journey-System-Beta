import { describe, expect, it } from "vitest";
import {
  NOTE_BODY_PARTS,
  bodyMarkWords,
  bodyMarksLine,
  normaliseBodyMarks,
  pulseRegionsOf,
  setBodySide,
  toggleBodyPart,
} from "./body-parts";
import { currentDraftOf } from "./session-draft";

describe("the body map a note uses (AJ, Oct 3 2026)", () => {
  it("is AJ's list, head to toe, the same order every time", () => {
    expect(NOTE_BODY_PARTS.map((p) => p.label)).toEqual([
      "Neck",
      "Shoulder",
      "Chest",
      "Upper back",
      "Lower back",
      "Abdominals",
      "Hip",
      "Knee",
      "Ankle",
      "Foot",
      "Elbow",
      "Wrist",
      "Hand",
    ]);
  });

  it("is not a fifth body list: every part but the abdominals is a Pulse region", () => {
    const unmapped = NOTE_BODY_PARTS.filter((p) => p.pulse === null).map((p) => p.id);
    expect(unmapped).toEqual(["abdominals"]);
    expect(pulseRegionsOf([{ part: "wrist", side: "left" }, { part: "hand", side: "left" }])).toEqual(["wrist_hand"]);
    expect(pulseRegionsOf([{ part: "knee", side: "both" }, { part: "abdominals", side: null }])).toEqual(["knee"]);
  });

  it("gives a side only to a part that comes in pairs", () => {
    expect(NOTE_BODY_PARTS.filter((p) => p.paired).map((p) => p.id)).toEqual([
      "shoulder",
      "hip",
      "knee",
      "ankle",
      "foot",
      "elbow",
      "wrist",
      "hand",
    ]);
    expect(normaliseBodyMarks([{ part: "neck", side: "left" }])).toEqual([{ part: "neck", side: null }]);
  });

  it("stores known parts once, in the map's order, and drops what it can't read", () => {
    expect(
      normaliseBodyMarks([
        { part: "knee", side: "left" },
        { part: "neck", side: null },
        { part: "knee", side: "right" },
        { part: "spleen", side: null },
        null,
        "knee",
        { part: "hip", side: "sideways" },
      ]),
    ).toEqual([
      { part: "neck", side: null },
      { part: "hip", side: null },
      { part: "knee", side: "left" },
    ]);
    expect(normaliseBodyMarks(undefined)).toEqual([]);
  });

  it("toggles a part and its side with the picker's one move", () => {
    let marks = toggleBodyPart([], "knee");
    expect(marks).toEqual([{ part: "knee", side: null }]);
    marks = setBodySide(marks, "knee", "left");
    expect(marks).toEqual([{ part: "knee", side: "left" }]);
    // A second tap on the same side takes the side away, never the part.
    expect(setBodySide(marks, "knee", "left")).toEqual([{ part: "knee", side: null }]);
    marks = toggleBodyPart(marks, "neck");
    expect(marks.map((m) => m.part)).toEqual(["neck", "knee"]);
    expect(toggleBodyPart(marks, "knee")).toEqual([{ part: "neck", side: null }]);
  });

  it("says it in words", () => {
    expect(bodyMarkWords({ part: "knee", side: "left" })).toBe("left knee");
    expect(bodyMarkWords({ part: "shoulder", side: "both" })).toBe("both shoulders");
    expect(bodyMarkWords({ part: "foot", side: "both" })).toBe("both feet");
    expect(bodyMarkWords({ part: "neck", side: null })).toBe("neck");
    expect(bodyMarksLine([{ part: "knee", side: "left" }, { part: "neck", side: null }])).toBe("Neck · left knee");
    expect(bodyMarksLine(null)).toBe("");
  });
});

describe("a session's unsaved draft, read back in today's words", () => {
  it("reads a draft from before Oct 3 2026: Injury is Health, Equipment is Set-up, the old P is the flavour", () => {
    expect(currentDraftOf({ body: "x", category: "injury" as any, p: null } as any)).toMatchObject({
      category: "health",
      flavour: null,
      bodyParts: [],
    });
    expect(currentDraftOf({ body: "x", category: "equipment" as any } as any)).toMatchObject({
      category: "coaching",
      flavour: "Setup",
    });
    expect(currentDraftOf({ body: "x", category: "coaching", p: "Pace" } as any)).toMatchObject({
      category: "coaching",
      flavour: "Pace",
    });
  });

  it("keeps a flavour and body parts that belong, and drops ones that don't", () => {
    expect(
      currentDraftOf({
        body: "x",
        category: "health",
        flavour: "Surgery",
        bodyParts: [{ part: "knee", side: "right" }, { part: "nope" }] as any,
      } as any),
    ).toMatchObject({ category: "health", flavour: "Surgery", bodyParts: [{ part: "knee", side: "right" }] });
    expect(currentDraftOf({ body: "x", category: "health", flavour: "Pace" } as any).flavour).toBeNull();
  });
});
