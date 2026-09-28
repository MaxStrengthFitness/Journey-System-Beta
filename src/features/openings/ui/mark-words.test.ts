/**
 * "Mark this time"'s own words, quoted (Openings round, phase 6). Every line
 * about the time itself is present.ts's and is tested there, except
 * `markChangeLine`, which waits here until it moves into present.ts.
 */
import { describe, expect, it } from "vitest";
import {
  MARK_INTRO,
  MARK_QUEUED,
  MARK_WORD,
  markChangeLine,
  markLabel,
  markNoteHint,
  markNoteLine,
  removeQuestion,
} from "./mark-words";
import { leaveQuestion } from "../../unsaved-changes";
import { offerable } from "../marks";
import type { UsualTime, UsualWord } from "../usual";

/** A time that reads `word`: markChangeLine reads only the word (and the key it names). */
const time = (word: UsualWord) => ({ key: "1-0800", weekday: 1, row: 480, word }) as unknown as UsualTime;
const WORDS: UsualWord[] = ["always-full", "usually-full", "usually-room", "mixed", "booked", "rotation", "not-enough", "blank"];

describe("Mark this time's words", () => {
  it("names a mark's two words as the grid does", () => {
    expect(MARK_WORD).toEqual({ full: "Always full", room: "Usually has room" });
  });

  it("says a mark never replaces the numbers", () => {
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

  it("says a write saved on the iPad is on its way, rather than Saving… until the Wi-Fi returns", () => {
    expect(MARK_QUEUED).toEqual({
      save: "Saved on this iPad. It goes to the studio when the connection is back.",
      keep: "Kept on this iPad. It goes to the studio when the connection is back.",
      remove: "Removed on this iPad. It goes to the studio when the connection is back.",
    });
  });

  it("shows a note in quotation marks, as it was written", () => {
    expect(markNoteLine("Always taken")).toBe("“Always taken”");
  });
});

describe("what the chosen word changes, for this time", () => {
  it("Always full: counts as full on Next 7 days and is never offered, whatever the time reads", () => {
    for (const word of WORDS) {
      expect(markChangeLine(time(word), "full")).toBe("Always full counts as usually full on Next 7 days, and is never offered as a new regular time.");
    }
  });

  it("Usually has room on a time that reads Always full: never offered, whatever the mark", () => {
    const line = markChangeLine(time("always-full"), "room");
    expect(line).toBe("This time reads Always full, so it isn't offered as a new regular time, whatever the mark.");
    expect(line).not.toContain("can be offered");
  });

  it("Usually has room on a time that reads Usually has room: the offer is the numbers' own, and names no mark", () => {
    expect(markChangeLine(time("usually-room"), "room")).toBe(
      "Usually has room can be offered as a new regular time when someone's agreed week has them in then with no regular there, and the coming weeks don't show it taken.",
    );
  });

  it("Usually has room elsewhere: offered with the mark, and the numbers when there are any", () => {
    for (const word of ["usually-full", "mixed", "booked", "rotation"] as const) {
      expect(markChangeLine(time(word), "room")).toBe(
        "Usually has room can be offered as a new regular time when someone's agreed week has them in then with no regular there, and the coming weeks don't show it taken, with the mark and the numbers beside it.",
      );
    }
    for (const word of ["not-enough", "blank"] as const) {
      expect(markChangeLine(time(word), "room")).toMatch(/taken, with the mark beside it\.$/);
    }
  });

  it("never says a time can be offered when the core would not offer it", () => {
    const mark = { id: "1-0800", weekday: 1, time: "08:00", mark: "room" as const, note: "", by: { id: "uid", name: "" }, at: null };
    for (const word of WORDS) {
      expect(markChangeLine(time(word), "room").includes("can be offered")).toBe(offerable(word, mark));
    }
  });
});
