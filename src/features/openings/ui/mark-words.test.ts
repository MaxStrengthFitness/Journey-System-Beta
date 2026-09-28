/**
 * "Mark this time"'s own words, quoted (Openings round, phase 6). Every line
 * about the time itself is present.ts's and is tested there.
 */
import { describe, expect, it } from "vitest";
import {
  MARK_CHANGES,
  MARK_INTRO,
  MARK_WORD,
  markLabel,
  markNoteHint,
  markNoteLine,
  removeQuestion,
} from "./mark-words";
import { leaveQuestion } from "../../unsaved-changes";

describe("Mark this time's words", () => {
  it("names a mark's two words as the grid does", () => {
    expect(MARK_WORD).toEqual({ full: "Always full", room: "Usually has room" });
  });

  it("says what each word changes, and that a mark never replaces the numbers", () => {
    expect(MARK_CHANGES.full).toBe("Always full counts as usually full on Next 7 days, and is never offered as a new regular time.");
    expect(MARK_CHANGES.room).toBe("Usually has room is offered as a new regular time, with the mark and the numbers shown beside it.");
    expect(MARK_INTRO).toContain("never replaces them");
  });

  it("says who sees the note, and how much is left", () => {
    expect(markNoteHint("Westlake", 12)).toBe("Everyone at Westlake sees it, with your name. 12 of 200.");
  });

  it("asks once before a mark goes, for everyone", () => {
    expect(removeQuestion("Westlake")).toBe("Remove this mark? It goes for everyone at Westlake.");
  });

  it("names a half-written mark in the leave question", () => {
    expect(leaveQuestion([markLabel("1-0800")])).toBe("You have unsaved changes to the mark on Monday 8:00 AM. Leave without saving?");
    expect(markLabel("6-1930")).toBe("the mark on Saturday 7:30 PM");
  });

  it("shows a note in quotation marks, as it was written", () => {
    expect(markNoteLine("Always taken")).toBe("“Always taken”");
  });
});
