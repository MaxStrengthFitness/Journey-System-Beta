import { describe, expect, it } from "vitest";
import {
  blankDraft,
  canShare,
  clientLabel,
  draftChanged,
  draftFromNote,
  effectiveTitle,
  excerpt,
  folderCounts,
  folderFromDoc,
  noteErrorMessage,
  noteFields,
  noteFromDoc,
  noteListItems,
  noteMatches,
  notesInView,
  sharePlan,
  sharedFields,
  sharedNoteFromDoc,
  sortFolders,
  sortNotes,
  validFolderName,
  validateNoteDraft,
  whenLabel,
} from "./notes";
import { clearDraftStash, dropDraft, stashDraft, stashedDraft, stashedDrafts } from "./draft-stash";
import type { NoteDraft, TrainerNote } from "./types";

const note = (id: string, over: Partial<TrainerNote> = {}): TrainerNote => ({
  id,
  title: id,
  body: "",
  kind: "note",
  folderId: null,
  clientIds: [],
  clientNames: {},
  pinned: false,
  sharedWith: null,
  ...over,
});

const draft = (over: Partial<NoteDraft> = {}): NoteDraft => ({ ...blankDraft(), title: "Plan", ...over });

describe("validateNoteDraft", () => {
  it("needs a title or a line of body", () => {
    expect(validateNoteDraft(draft({ title: "   " })).map((p) => p.field)).toEqual(["title"]);
    expect(validateNoteDraft(draft({ title: "", body: "Call physio" }))).toEqual([]);
    expect(validateNoteDraft(draft())).toEqual([]);
  });

  it("titles a quick jot from its first line", () => {
    expect(effectiveTitle({ title: "  Knee  plan ", body: "x" })).toBe("Knee plan");
    expect(effectiveTitle({ title: "", body: "\n\n  Call Priya's   physio \nabout the knee" })).toBe("Call Priya's physio");
    expect(effectiveTitle({ title: "", body: "y".repeat(120) })).toBe(`${"y".repeat(79)}…`);
    expect(noteFields(draft({ title: "", body: "First line\nsecond" }), null).title).toBe("First line");
  });

  it("only shares a note about exactly one client", () => {
    expect(validateNoteDraft(draft({ share: true }))[0].message).toMatch(/Link the client first/);
    expect(
      validateNoteDraft(draft({ share: true, clientIds: ["a", "b"] }))[0].message,
    ).toMatch(/one client/);
    expect(validateNoteDraft(draft({ share: true, clientIds: ["a"] }))).toEqual([]);
  });

  it("caps the body and the client list", () => {
    expect(validateNoteDraft(draft({ body: "x".repeat(10001) })).map((p) => p.field)).toEqual(["body"]);
    const many = Array.from({ length: 11 }, (_, i) => `c${i}`);
    expect(validateNoteDraft(draft({ clientIds: many })).map((p) => p.field)).toEqual(["clients"]);
  });
});

describe("canShare / sharePlan", () => {
  it("shares one client, never none or two", () => {
    expect(canShare([])).toBe(false);
    expect(canShare(["a"])).toBe(true);
    expect(canShare(["a", "b"])).toBe(false);
  });

  it("writes the copy when sharing, removes it when unsharing", () => {
    expect(sharePlan(null, { share: true, clientIds: ["a"] })).toEqual({ write: "a", remove: null });
    expect(sharePlan({ sharedWith: "a" }, { share: true, clientIds: ["a"] })).toEqual({ write: "a", remove: null });
    expect(sharePlan({ sharedWith: "a" }, { share: false, clientIds: ["a"] })).toEqual({ write: null, remove: "a" });
    expect(sharePlan(null, { share: false, clientIds: ["a"] })).toEqual({ write: null, remove: null });
  });

  it("never leaves an old copy behind if the client somehow changed", () => {
    expect(sharePlan({ sharedWith: "a" }, { share: true, clientIds: ["b"] })).toEqual({ write: "b", remove: "a" });
    // Two clients cannot be shared: the old copy goes.
    expect(sharePlan({ sharedWith: "a" }, { share: true, clientIds: ["a", "b"] })).toEqual({ write: null, remove: "a" });
  });
});

describe("noteFields / sharedFields", () => {
  it("trims, de-duplicates, and keeps names only for linked clients", () => {
    const f = noteFields(
      draft({ title: "  Knee plan ", clientIds: ["a", "a", "b"], clientNames: { a: " Ann ", b: "Bob", z: "Zed" } }),
      null,
    );
    expect(f.title).toBe("Knee plan");
    expect(f.clientIds).toEqual(["a", "b"]);
    expect(f.clientNames).toEqual({ a: "Ann", b: "Bob" });
    expect(f.sharedWith).toBeNull();
  });

  it("puts nothing about other clients on the shared copy", () => {
    const s = sharedFields({ title: "Knee plan", body: "Go easy", kind: "injury" }, "a", { id: "u1", name: "" });
    expect(s).toEqual({
      clientId: "a",
      title: "Knee plan",
      body: "Go easy",
      kind: "injury",
      authorId: "u1",
      authorName: "A trainer",
    });
    expect(Object.keys(s)).not.toContain("clientIds");
    expect(Object.keys(s)).not.toContain("clientNames");
  });
});

describe("labels", () => {
  // 2026-09-11 14:30 Eastern (EDT, UTC-4).
  const now = new Date("2026-09-11T18:30:00Z");

  it("says when a note changed the way a person would", () => {
    expect(whenLabel(new Date("2026-09-11T13:05:00Z"), now)).toBe("Today, 9:05 AM");
    // 11 PM Eastern on the 10th is already the 11th in UTC — still yesterday here.
    expect(whenLabel(new Date("2026-09-11T03:00:00Z"), now)).toBe("Yesterday");
    expect(whenLabel({ seconds: Date.parse("2026-09-03T16:00:00Z") / 1000 }, now)).toBe("Sep 3");
    expect(whenLabel(new Date("2025-12-30T16:00:00Z"), now)).toBe("Dec 30, 2025");
    expect(whenLabel(null, now)).toBe("Just now");
  });

  it("never shows a bare client id", () => {
    const n = { clientNames: { c1: "Priya Shah" } };
    expect(clientLabel("c1", n, () => "Priya S.")).toBe("Priya S.");
    expect(clientLabel("c1", n, () => "")).toBe("Priya Shah");
    expect(clientLabel("c2", n, () => "")).toBe("A client");
  });
});

describe("reading notes", () => {
  const notes = [
    note("old", { updatedAt: { seconds: 1 } }),
    note("pinned-old", { pinned: true, updatedAt: { seconds: 0 } }),
    note("new", { updatedAt: { seconds: 5 }, folderId: "f1", kind: "injury", clientIds: ["c1"], sharedWith: "c1" }),
    note("typing"),
  ];

  it("sorts pinned first, then newest, with a just-typed note on top", () => {
    expect(sortNotes(notes).map((n) => n.id)).toEqual(["pinned-old", "typing", "new", "old"]);
  });

  it("filters by view, kind and query together", () => {
    const nameOf = (id: string) => (id === "c1" ? "Priya Shah" : "");
    expect(notesInView(notes, { kind: "shared" }, "all", "", nameOf).map((n) => n.id)).toEqual(["new"]);
    expect(notesInView(notes, { kind: "folder", folderId: "f1" }, "all", "", nameOf).map((n) => n.id)).toEqual(["new"]);
    expect(notesInView(notes, { kind: "unfiled" }, "all", "", nameOf)).toHaveLength(3);
    expect(notesInView(notes, { kind: "all" }, "injury", "", nameOf).map((n) => n.id)).toEqual(["new"]);
    // A client's name finds their notes, even though the note stores an id.
    expect(notesInView(notes, { kind: "all" }, "all", "priya", nameOf).map((n) => n.id)).toEqual(["new"]);
  });

  it("matches every word, across title, body, kind and saved client names", () => {
    const n = note("x", { title: "Shoulder", body: "No overhead pressing", kind: "injury", clientIds: ["c9"], clientNames: { c9: "Mark Lee" } });
    const none = () => "";
    expect(noteMatches(n, "overhead mark", none)).toBe(true);
    expect(noteMatches(n, "injury plan", none)).toBe(true);
    expect(noteMatches(n, "overhead knee", none)).toBe(false);
  });

  it("counts folders and the unfiled", () => {
    expect(folderCounts(notes)).toEqual({ byFolder: { f1: 1 }, unfiled: 3 });
  });

  it("puts a note whose folder was deleted in Unfiled, once the folders are known", () => {
    const stray = [...notes, note("stray", { folderId: "gone" })];
    const known = new Set(["f1"]);
    expect(folderCounts(stray, known)).toEqual({ byFolder: { f1: 1 }, unfiled: 4 });
    expect(notesInView(stray, { kind: "unfiled" }, "all", "", () => "", known).map((n) => n.id)).toContain("stray");
    // Before the folders have loaded, nothing is guessed.
    expect(folderCounts(stray)).toEqual({ byFolder: { f1: 1, gone: 1 }, unfiled: 3 });
  });

  it("excerpts one line", () => {
    expect(excerpt("Line one\n\nline   two")).toBe("Line one line two");
    expect(excerpt("x".repeat(200), 10)).toBe("xxxxxxxxx…");
  });
});

describe("drafts", () => {
  it("starts about a client when opened from a profile", () => {
    expect(blankDraft({ id: "c1", name: "Priya" })).toMatchObject({ clientIds: ["c1"], clientNames: { c1: "Priya" } });
  });

  it("round-trips a saved note and notices a real change", () => {
    const saved = note("n", { title: "A", body: "b", sharedWith: "c1", clientIds: ["c1"] });
    const d = draftFromNote(saved);
    expect(d.share).toBe(true);
    expect(draftChanged(d, draftFromNote(saved))).toBe(false);
    expect(draftChanged(d, { ...d, title: "A " })).toBe(false);
    expect(draftChanged(d, { ...d, body: "changed" })).toBe(true);
  });

  it("names folders sensibly", () => {
    expect(validFolderName("  ")).toMatch(/Name/);
    expect(validFolderName("x".repeat(61))).toMatch(/under 60/);
    expect(validFolderName("Rehab")).toBeNull();
  });
});

describe("the list", () => {
  const saved = [
    note("a", { title: "Knee plan", updatedAt: { seconds: 10 }, folderId: "f1" }),
    note("b", { title: "Renewal chat", updatedAt: { seconds: 20 }, kind: "retention" }),
  ];
  const none = () => "";

  it("shows a never-saved note as its draft, on top, and marks edits in progress", () => {
    const items = noteListItems(
      saved,
      [
        { noteId: "new1", draft: draft({ title: "", body: "Call physio" }), isNew: true },
        { noteId: "a", draft: draft({ title: "Knee plan v2" }), isNew: false },
      ],
      { kind: "all" },
      "all",
      "",
      none,
    );
    expect(items.map((i) => [i.id, i.unsaved, i.isNew])).toEqual([
      ["new1", true, true],
      ["b", false, false],
      ["a", true, false],
    ]);
    expect(items[0].note.title).toBe("Call physio");
    // The card shows what is saved, not the draft.
    expect(items[2].note.title).toBe("Knee plan");
  });

  it("filters drafts like everything else", () => {
    const drafts = [{ noteId: "new1", draft: draft({ title: "Towels" }), isNew: true }];
    expect(noteListItems(saved, drafts, { kind: "all" }, "retention", "", none).map((i) => i.id)).toEqual(["b"]);
    expect(noteListItems(saved, drafts, { kind: "folder", folderId: "f1" }, "all", "", none).map((i) => i.id)).toEqual(["a"]);
  });

  it("names an untitled, empty new draft", () => {
    const items = noteListItems([], [{ noteId: "n", draft: draft({ title: "", body: "" }), isNew: true }], { kind: "all" }, "all", "", none);
    expect(items[0].note.title).toBe("New note");
  });

  it("orders folders by name, numbers naturally", () => {
    expect(sortFolders([{ name: "week 10" }, { name: "Rehab" }, { name: "week 2" }]).map((f) => f.name)).toEqual([
      "Rehab",
      "week 2",
      "week 10",
    ]);
  });
});

describe("errors", () => {
  it("says what happened in studio English", () => {
    expect(noteErrorMessage({ code: "permission-denied" }, "save")).toMatch(/turn Share off/);
    expect(noteErrorMessage({ code: "unavailable" }, "delete")).toMatch(/No connection/);
    expect(noteErrorMessage(new Error("x"), "delete")).toBe("Couldn't delete that note. Try again.");
  });
});

describe("draft stash", () => {
  it("keeps drafts per trainer and forgets them on request", () => {
    clearDraftStash();
    const d = draft({ title: "Mine" });
    stashDraft("u1", "n1", { draft: d, baseline: blankDraft(), isNew: true });
    expect(stashedDraft("u1", "n1")?.draft.title).toBe("Mine");
    expect(stashedDraft("u2", "n1")).toBeNull();
    expect(stashedDrafts("u2")).toEqual([]);
    expect(stashedDrafts("u1").map((s) => s.noteId)).toEqual(["n1"]);
    dropDraft("u1", "n1");
    expect(stashedDraft("u1", "n1")).toBeNull();
    expect(stashedDraft(null, "n1")).toBeNull();
  });
});

describe("from Firestore", () => {
  it("reads a note defensively", () => {
    const n = noteFromDoc("n1", {
      title: "Plan",
      kind: "bogus",
      clientIds: ["c1", 7, "", "c2"],
      clientNames: { c1: "Ann", c2: 5, zz: "Nope" },
      sharedWith: "",
      pinned: "yes",
    });
    expect(n).toMatchObject({ id: "n1", title: "Plan", body: "", kind: "note", folderId: null, pinned: false, sharedWith: null });
    expect(n.clientIds).toEqual(["c1", "c2"]);
    expect(n.clientNames).toEqual({ c1: "Ann" });
    expect(noteFromDoc("n2", undefined).title).toBe("");
  });

  it("reads folders and shared copies with sensible stand-ins", () => {
    expect(folderFromDoc("f", {}).name).toBe("Folder");
    expect(sharedNoteFromDoc("s", { kind: "injury", title: "Knee" })).toMatchObject({ kind: "injury", authorName: "A trainer" });
  });
});

describe("draftChanged", () => {
  it("compares what a save would store", () => {
    const jot = draft({ title: "", body: "Call physio\nabout the knee" });
    // After saving, the note carries its first line as the title: not a change.
    expect(draftChanged(jot, { ...jot, title: "Call physio" })).toBe(false);
    expect(draftChanged(jot, { ...jot, title: "Physio" })).toBe(true);
    expect(draftChanged(draft({ clientIds: ["a", "a"] }), draft({ clientIds: ["a"] }))).toBe(false);
  });
});
