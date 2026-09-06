import { describe, expect, it } from "vitest";
import {
  acknowledgeSaved,
  adoptExternal,
  beginSave,
  changedKeys,
  changedPatch,
  discardEdits,
  editField,
  editFields,
  hasUnsavedWork,
  initForm,
  isDirty,
  sameValue,
  saveFailed,
  saveSucceeded,
} from "./formState";

interface StudioForm {
  name: string;
  phone: string;
  timezone: string;
  mindbodySiteId: string;
  accessibleStudioIds: string[];
}

const base: StudioForm = {
  name: "Solon",
  phone: "",
  timezone: "America/New_York",
  mindbodySiteId: "29068",
  accessibleStudioIds: ["a", "b"],
};

describe("sameValue", () => {
  it("treats null and undefined as the same absent value", () => {
    // Firestore omits absent fields, so a doc echoed back through onSnapshot
    // has undefined where the form wrote null. Without this the form would
    // flip to dirty on its own successful save.
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue(undefined, null)).toBe(true);
  });

  it("does not treat empty string as absent", () => {
    expect(sameValue("", null)).toBe(false);
    expect(sameValue("", undefined)).toBe(false);
  });

  it("compares arrays element-wise and in order", () => {
    expect(sameValue(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameValue(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameValue(["a"], ["a", "b"])).toBe(false);
  });

  it("compares nested objects, ignoring keys explicitly set to undefined", () => {
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("does not confuse an array with an object", () => {
    expect(sameValue(["a"], { 0: "a" })).toBe(false);
  });

  it("distinguishes false from absent", () => {
    // A boolean toggle turned off is a real edit; absent is not.
    expect(sameValue(false, undefined)).toBe(false);
    expect(sameValue(false, false)).toBe(true);
  });
});

describe("initForm", () => {
  it("starts clean, so a freshly loaded form never warns about edits", () => {
    const s = initForm(base);
    expect(s.status).toBe("clean");
    expect(isDirty(s)).toBe(false);
    expect(hasUnsavedWork(s)).toBe(false);
  });
});

describe("editing", () => {
  it("marks the form dirty on a real change", () => {
    const s = editField(initForm(base), "name", "Solon Ohio");
    expect(s.status).toBe("dirty");
    expect(isDirty(s)).toBe(true);
  });

  it("returns to clean when a value is typed back to what it was", () => {
    let s = editField(initForm(base), "name", "Solon Ohio");
    s = editField(s, "name", "Solon");
    expect(s.status).toBe("clean");
    expect(isDirty(s)).toBe(false);
  });

  it("clears a stale save error once the form is clean again", () => {
    let s = editField(initForm(base), "name", "Bad");
    s = saveFailed(s, "offline");
    s = editField(s, "name", "Solon");
    expect(s.error).toBeNull();
  });

  it("keeps the error visible while the form is still dirty", () => {
    let s = editField(initForm(base), "name", "Bad");
    s = saveFailed(s, "offline");
    s = editField(s, "phone", "440-555-0100");
    expect(s.status).toBe("dirty");
    expect(s.error).toBe("offline");
  });

  it("applies several fields at once", () => {
    const s = editFields(initForm(base), {
      phone: "440-555-0100",
      timezone: "America/Chicago",
    });
    expect(changedKeys(s).sort()).toEqual(["phone", "timezone"]);
  });
});

describe("changedPatch", () => {
  it("sends only what changed", () => {
    const s = editField(initForm(base), "phone", "440-555-0100");
    expect(changedPatch(s)).toEqual({ phone: "440-555-0100" });
  });

  it("sends nothing for a clean form", () => {
    expect(changedPatch(initForm(base))).toEqual({});
  });

  it("cannot null a field the form does not render", () => {
    // The actual AdminStudioManager bug: ownerId and headTrainerId were
    // removed from the JSX but still read out of FormData at save time, so
    // every studio save wrote them as null. A diff over the rendered draft
    // has no opinion about a field it never held.
    const rendered = { name: "Solon", phone: "" };
    const s = editField(initForm(rendered), "name", "Solon Ohio");
    const patch = changedPatch(s);
    expect(patch).toEqual({ name: "Solon Ohio" });
    expect("ownerId" in patch).toBe(false);
    expect("headTrainerId" in patch).toBe(false);
  });

  it("treats a reordered array as a change", () => {
    const s = editField(initForm(base), "accessibleStudioIds", ["b", "a"]);
    expect(changedPatch(s)).toEqual({ accessibleStudioIds: ["b", "a"] });
  });
});

describe("save lifecycle", () => {
  it("runs dirty -> saving -> saved -> clean", () => {
    let s = editField(initForm(base), "name", "Solon Ohio");
    expect(s.status).toBe("dirty");
    s = beginSave(s);
    expect(s.status).toBe("saving");
    s = saveSucceeded(s);
    expect(s.status).toBe("saved");
    s = acknowledgeSaved(s);
    expect(s.status).toBe("clean");
  });

  it("moves the baseline forward on success, so a second save sends nothing", () => {
    let s = editField(initForm(base), "name", "Solon Ohio");
    s = saveSucceeded(beginSave(s));
    expect(changedPatch(s)).toEqual({});
    expect(s.baseline.name).toBe("Solon Ohio");
  });

  it("keeps the user's typing when the write fails", () => {
    let s = editField(initForm(base), "name", "Solon Ohio");
    s = saveFailed(beginSave(s), "permission-denied");
    expect(s.draft.name).toBe("Solon Ohio");
    expect(s.status).toBe("error");
    expect(s.error).toBe("permission-denied");
    // and the retry is still one tap: the diff survives
    expect(changedPatch(s)).toEqual({ name: "Solon Ohio" });
  });

  it("acknowledgeSaved does nothing to a form that is not showing Saved", () => {
    const s = editField(initForm(base), "name", "X");
    expect(acknowledgeSaved(s)).toBe(s);
  });
});

describe("discardEdits", () => {
  it("restores the last committed value", () => {
    let s = editFields(initForm(base), { name: "X", phone: "Y" });
    s = discardEdits(s);
    expect(s.draft).toEqual(base);
    expect(s.status).toBe("clean");
  });
});

describe("adoptExternal", () => {
  it("takes the new value when the user has no edits", () => {
    const next = { ...base, name: "Solon (renamed elsewhere)" };
    const s = adoptExternal(initForm(base), next);
    expect(s.draft.name).toBe("Solon (renamed elsewhere)");
    expect(s.status).toBe("clean");
  });

  it("never overwrites the draft while the user is mid-edit", () => {
    // An onSnapshot tick arriving while someone types must not rewrite the
    // field under their cursor.
    let s = editField(initForm(base), "name", "half-typed nam");
    s = adoptExternal(s, { ...base, phone: "440-555-0100" });
    expect(s.draft.name).toBe("half-typed nam");
    expect(s.status).toBe("dirty");
  });

  it("still moves the baseline so untouched fields are not written back stale", () => {
    let s = editField(initForm(base), "name", "half-typed nam");
    s = adoptExternal(s, { ...base, phone: "440-555-0100" });
    // The other admin's phone edit is now the baseline, so our save does not
    // include phone at all and cannot revert it.
    expect(s.baseline.phone).toBe("440-555-0100");
    expect(changedPatch(s)).toEqual({ name: "half-typed nam" });
  });

  it("adopts an untouched field while keeping the one being edited", () => {
    // The merge that matters: two admins on one studio must not take turns
    // undoing each other.
    let s = editField(initForm(base), "name", "half-typed nam");
    s = adoptExternal(s, { ...base, phone: "440-555-0100" });
    expect(s.draft.name).toBe("half-typed nam");
    expect(s.draft.phone).toBe("440-555-0100");
  });

  it("goes clean when someone else committed the same edit first", () => {
    let s = editField(initForm(base), "name", "Solon Ohio");
    s = adoptExternal(s, { ...base, name: "Solon Ohio" });
    expect(s.status).toBe("clean");
    expect(changedPatch(s)).toEqual({});
  });

  it("ignores an external value that lands mid-write", () => {
    // Between beginSave and its resolution the database is in an unknown
    // state; adopting a value there could move the baseline past the write
    // we are about to confirm.
    const s = beginSave(editField(initForm(base), "name", "X"));
    expect(adoptExternal(s, { ...base, name: "Z" })).toBe(s);
  });
});

describe("hasUnsavedWork", () => {
  it("is false while a save is in flight", () => {
    const s = beginSave(editField(initForm(base), "name", "X"));
    expect(hasUnsavedWork(s)).toBe(false);
  });

  it("is true for a dirty form", () => {
    expect(hasUnsavedWork(editField(initForm(base), "name", "X"))).toBe(true);
  });
});
