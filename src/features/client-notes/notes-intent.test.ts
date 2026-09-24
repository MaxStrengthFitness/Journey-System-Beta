import { describe, expect, it } from "vitest";
import { noteAnchor, threadIdOfAnchor } from "../client-profile/profile-nav";
import { notesIntentOf } from "./notes-intent";

describe("notesIntentOf — what a door asks of the Notes page", () => {
  it("reads the composer, the Resolved zone and one thread", () => {
    expect(notesIntentOf("notes-compose")).toEqual({ kind: "compose" });
    expect(notesIntentOf("notes-resolved")).toEqual({ kind: "resolved" });
    expect(notesIntentOf(noteAnchor("crit1"))).toEqual({ kind: "thread", threadId: "crit1" });
    // A synthesised journal id keeps its colons.
    expect(notesIntentOf(noteAnchor("legacy:clinicalIncidents:x9"))).toEqual({
      kind: "thread",
      threadId: "legacy:clinicalIncidents:x9",
    });
  });

  it("is null for every other page's card, for nothing, and for an empty thread id", () => {
    expect(notesIntentOf("ford-occupation")).toBeNull();
    expect(notesIntentOf("body-watchouts")).toBeNull();
    expect(notesIntentOf(undefined)).toBeNull();
    expect(notesIntentOf(null)).toBeNull();
    expect(notesIntentOf("note-")).toBeNull();
    expect(threadIdOfAnchor("notes-compose")).toBeNull();
    expect(threadIdOfAnchor(noteAnchor("a"))).toBe("a");
  });
});
