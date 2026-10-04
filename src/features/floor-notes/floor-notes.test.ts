import { describe, expect, it } from "vitest";
import { blocksText, copiedKeysOf, earlierNotes, floorNoteFromDoc, floorThreads, openFloorLines, type FloorNote } from "./floor-notes";

const at = (iso: string) => ({ toDate: () => new Date(iso) });

function note(over: Partial<FloorNote> & { id: string }): FloorNote {
  return {
    machineId: "leg",
    body: "The pin sticks at 7.",
    threadId: null,
    authorId: "u1",
    authorName: "Lee",
    createdAt: at("2026-10-01T14:00:00Z"),
    updatedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    isArchived: false,
    ...over,
  };
}

describe("floorNoteFromDoc", () => {
  it("reads a stored note", () => {
    const n = floorNoteFromDoc("a", {
      machineId: "leg",
      machineName: "Leg Press",
      copiedFrom: "studio-notes",
      body: "  Seat sticks  ",
      threadId: null,
      authorId: "u1",
      authorName: "Lee",
      isArchived: false,
      resolvedBy: { id: "u2", name: "Sam" },
      shared: false,
      shareStatus: "pending",
    });
    expect(n).toMatchObject({
      id: "a",
      machineId: "leg",
      machineName: "Leg Press",
      copiedFrom: "studio-notes",
      body: "Seat sticks",
      resolvedBy: { id: "u2", name: "Sam" },
      shareStatus: "pending",
    });
  });

  it("refuses a note with no machine or no words, and an unknown copiedFrom", () => {
    expect(floorNoteFromDoc("a", { machineId: "", body: "x" })).toBeNull();
    expect(floorNoteFromDoc("a", { machineId: "leg", body: "   " })).toBeNull();
    expect(floorNoteFromDoc("a", undefined)).toBeNull();
    expect(floorNoteFromDoc("a", { machineId: "leg", body: "x", copiedFrom: "elsewhere" })?.copiedFrom).toBeUndefined();
  });
});

describe("floorThreads", () => {
  it("hangs updates off their note, oldest first, and puts open notes before closed ones", () => {
    const notes = [
      note({ id: "r1", createdAt: at("2026-09-01T14:00:00Z"), resolvedAt: at("2026-09-10T14:00:00Z") }),
      note({ id: "r2", body: "Back pad loose.", createdAt: at("2026-09-20T14:00:00Z") }),
      note({ id: "u2", threadId: "r2", body: "Maintenance booked.", createdAt: at("2026-09-25T14:00:00Z") }),
      note({ id: "u1", threadId: "r2", body: "Still loose.", createdAt: at("2026-09-22T14:00:00Z") }),
      note({ id: "other", machineId: "chest" }),
    ];
    const threads = floorThreads(notes, "leg");
    expect(threads.map((t) => t.id)).toEqual(["r2", "r1"]);
    expect(threads[0].updates.map((u) => u.id)).toEqual(["u1", "u2"]);
    expect(threads[0].lastMs).toBe(new Date("2026-09-25T14:00:00Z").getTime());
    expect(threads[1].closed).toBe(true);
  });

  it("orders open notes by their newest word", () => {
    const notes = [
      note({ id: "old", createdAt: at("2026-08-01T14:00:00Z") }),
      note({ id: "new", createdAt: at("2026-09-01T14:00:00Z") }),
      note({ id: "up", threadId: "old", createdAt: at("2026-09-15T14:00:00Z") }),
    ];
    expect(floorThreads(notes, "leg").map((t) => t.id)).toEqual(["old", "new"]);
  });

  it("leaves archived notes out, and keeps an update whose note is gone as its own", () => {
    const notes = [note({ id: "gone", isArchived: true }), note({ id: "orphan", threadId: "missing" })];
    const threads = floorThreads(notes, "leg");
    expect(threads.map((t) => t.id)).toEqual(["orphan"]);
    expect(threads[0].root.threadId).toBeNull();
  });
});

describe("earlierNotes", () => {
  const catalogNote = {
    id: "machine__leg",
    blocks: [
      { kind: "para" as const, text: "Ours sits two notches lower." },
      { kind: "bullet" as const, text: "Footstool for short legs" },
    ],
    by: "Jo",
    at: at("2026-05-01T14:00:00Z"),
  };

  it("lists the three old notes, the Catalog note first", () => {
    const out = earlierNotes(
      { catalogNote, studioNotes: { text: "Left pad sticks.", by: "Sam" }, unitNote: "Seat replaced March 2026." },
      [],
    );
    expect(out.map((e) => e.key)).toEqual(["catalog-note", "studio-notes", "unit-note"]);
    expect(out[0].text).toBe("Ours sits two notches lower.\nFootstool for short legs");
    expect(out[0].atMs).toBe(new Date("2026-05-01T14:00:00Z").getTime());
    expect(out.every((e) => !e.copied)).toBe(true);
  });

  it("shows the same words once, and none that are already on the list", () => {
    const threads = floorThreads([note({ id: "r", body: "left pad   sticks." })], "leg");
    const out = earlierNotes({ studioNotes: { text: "Left pad sticks." }, unitNote: "Left pad sticks." }, threads);
    expect(out).toEqual([]);
  });

  it("leaves out one copied into the list, even after the copy was changed", () => {
    const threads = floorThreads([note({ id: "r", body: "Reworded since.", copiedFrom: "unit-note" })], "leg");
    expect(earlierNotes({ unitNote: "Seat replaced March 2026." }, threads)).toEqual([]);
  });

  it("keeps a copied Catalog note that is shared, marked copied, for its switch", () => {
    const threads = floorThreads([note({ id: "r", body: "x", copiedFrom: "catalog-note" })], "leg");
    const out = earlierNotes({ catalogNote: { ...catalogNote, shared: true, shareStatus: "approved" } }, threads);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "catalog-note", copied: true, shared: true, wikiDocId: "machine__leg" });
    expect(earlierNotes({ catalogNote }, threads)).toEqual([]);
  });

  it("skips an empty old note", () => {
    expect(earlierNotes({ studioNotes: { text: "  " }, unitNote: "", catalogNote: { id: "w", blocks: [] } }, [])).toEqual([]);
  });
});

describe("blocksText and openFloorLines", () => {
  it("reads blocks as lines and ignores ones with no words", () => {
    expect(blocksText([{ kind: "heading", text: "Set-up" }, { kind: "para", text: " " }])).toBe("Set-up");
    expect(blocksText(null)).toBe("");
  });

  it("gives the open notes with their latest word", () => {
    const threads = floorThreads(
      [
        note({ id: "r", body: "Pin sticks." }),
        note({ id: "u", threadId: "r", body: "Sprayed it.", authorName: "Sam", createdAt: at("2026-10-02T14:00:00Z") }),
        note({ id: "c", body: "Old.", resolvedAt: at("2026-09-01T14:00:00Z") }),
      ],
      "leg",
    );
    expect(openFloorLines(threads)).toEqual([
      { text: "Pin sticks.", latest: "Sprayed it.", by: "Sam", atMs: new Date("2026-10-02T14:00:00Z").getTime() },
    ]);
  });
});

describe("a note taken off the list (the review, Oct 3 2026)", () => {
  it("takes its updates with it: none comes back as a note of its own", () => {
    const notes = [
      note({ id: "r", isArchived: true }),
      note({ id: "u", threadId: "r", body: "Maintenance booked." }),
      note({ id: "other", body: "Back pad loose." }),
    ];
    expect(floorThreads(notes, "leg").map((t) => t.id)).toEqual(["other"]);
  });

  it("still answers for the old note it was copied from, so the old one never comes back", () => {
    const notes = [note({ id: "copy", body: "Left pad sticks.", copiedFrom: "studio-notes", isArchived: true })];
    const threads = floorThreads(notes, "leg");
    expect(threads).toEqual([]);
    expect(copiedKeysOf(notes, "leg")).toEqual(new Set(["studio-notes"]));
    expect(copiedKeysOf(notes, "chest").size).toBe(0);
    expect(earlierNotes({ studioNotes: { text: "Left pad sticks." } }, threads, copiedKeysOf(notes, "leg"))).toEqual([]);
    expect(earlierNotes({ studioNotes: { text: "Left pad sticks." } }, threads)).toHaveLength(1);
  });
});
