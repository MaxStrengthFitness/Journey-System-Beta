import { describe, expect, it } from "vitest";
import {
  MAX_CHANGE_FIELDS,
  changeDocument,
  changeOf,
  changeSentence,
  changeWhen,
  changedFields,
  changesOf,
  fieldWord,
  type MachineChange,
} from "./change-log";

const ELROND = { uid: "u-elrond", name: "Elrond Peredhel" };

const change = (over: Partial<MachineChange> = {}): MachineChange => ({
  id: "c1",
  at: Date.UTC(2026, 8, 29, 18, 41),
  by: ELROND,
  kind: "edited",
  fields: ["stopRules"],
  ...over,
});

describe("what a save records", () => {
  it("keeps definition fields only, each once, in the definition's order", () => {
    expect(changedFields(["stopRules", "updatedAt", "id", "baselineLoad", "stopRules", "status", "inStandardSet"])).toEqual([
      "baselineLoad",
      "stopRules",
    ]);
  });

  it("caps the list at the rules' limit", () => {
    const many = Array.from({ length: 200 }, (_, i) => (i % 2 ? "name" : "rep"));
    expect(changedFields(many).length).toBeLessThanOrEqual(MAX_CHANGE_FIELDS);
  });

  it("writes exactly the shape, and nothing for an edit that changed no definition field", () => {
    expect(changeDocument("edited", ["updatedAt"], ELROND)).toBeNull();
    expect(changeDocument("edited", ["name"], ELROND)).toEqual({ by: ELROND, kind: "edited", fields: ["name"] });
    // A create with no fields is still a create: the machine appeared.
    expect(changeDocument("created", [], ELROND)).toEqual({ by: ELROND, kind: "created", fields: [] });
  });
});

describe("reading the log", () => {
  it("reads a stored document, a Timestamp-like time, and refuses what isn't a change", () => {
    const c = changeOf("c9", { at: { toMillis: () => 1000 }, by: { uid: "u1", name: " Ada " }, kind: "created", fields: ["name", 4] });
    expect(c).toEqual({ id: "c9", at: 1000, by: { uid: "u1", name: "Ada" }, kind: "created", fields: ["name"] });
    expect(changeOf("x", { kind: "moved", by: { uid: "u1" } })).toBeNull();
    expect(changeOf("x", { kind: "edited", by: {} })).toBeNull();
    expect(changeOf("x", null)).toBeNull();
    // A name that was never written still names someone, never an email.
    expect(changeOf("x", { kind: "edited", by: { uid: "u1" } })?.by.name).toBe("An administrator");
  });

  it("sorts newest first, a write still on its way first of all", () => {
    const list = changesOf([
      { id: "old", data: { at: 1, by: { uid: "u" }, kind: "created", fields: [] } },
      { id: "new", data: { at: 3, by: { uid: "u" }, kind: "edited", fields: ["rep"] } },
      { id: "pending", data: { at: null, by: { uid: "u" }, kind: "edited", fields: ["rep"] } },
      { id: "junk", data: { nope: true } },
    ]);
    expect(list.map((c) => c.id)).toEqual(["pending", "new", "old"]);
  });
});

describe("the sentence", () => {
  it("says who changed what, in the app's words for each field", () => {
    expect(changeSentence(change())).toBe("Elrond Peredhel changed the stop rules.");
    expect(changeSentence(change({ fields: ["stopRules", "baselineLoad"] }))).toBe(
      "Elrond Peredhel changed the stop rules and the starting weight.",
    );
    expect(changeSentence(change({ fields: ["name", "settingFields", "baselineLoad"] }))).toBe(
      "Elrond Peredhel changed the name, the dials and the starting weight.",
    );
  });

  it("says a create, a save with no named field, and a field with no label by its key", () => {
    expect(changeSentence(change({ kind: "created", fields: [] }))).toBe("Elrond Peredhel added it to the catalog.");
    expect(changeSentence(change({ fields: [] }))).toBe("Elrond Peredhel saved it.");
    expect(fieldWord("someNewField")).toBe("someNewField");
    expect(changeSentence(change({ fields: ["someNewField"] }))).toBe("Elrond Peredhel changed the someNewField.");
  });

  it("says when in the studio's zone, and nothing while the time isn't known", () => {
    expect(changeWhen(change(), "America/New_York")).toBe("Sep 29, 2026, 2:41 PM");
    expect(changeWhen(change({ at: 0 }))).toBeNull();
  });
});
