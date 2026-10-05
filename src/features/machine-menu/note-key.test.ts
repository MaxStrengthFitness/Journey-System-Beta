import { AlertCircle, AlertTriangle, NotebookPen } from "lucide-react";
import { describe, expect, it } from "vitest";
import { LOUDNESS_TONE } from "../rating/Loudness";
import { asImportance, loudestOpen, noteKey, noteKeyOf } from "./note-key";

describe("the one note key", () => {
  it("draws Note with the grid's notebook pen in ink-2", () => {
    expect(noteKey("standard")).toMatchObject({ word: "Note", listWord: "Note", glyph: NotebookPen, glyphName: "NotebookPen", color: "--eq-ink-2" });
  });

  it("draws Heads up with the plum circle", () => {
    expect(noteKey("elevated")).toMatchObject({ word: "Heads up", glyph: AlertCircle, glyphName: "AlertCircle", color: "--eq-warn" });
  });

  it("draws Critical with the Hub's crimson triangle, a shape the kaizen ring can't be mistaken for", () => {
    expect(noteKey("critical")).toMatchObject({ word: "Critical", glyph: AlertTriangle, glyphName: "AlertTriangle", color: "--eq-alert" });
  });

  it("mutes a resolved note, keeps its glyph and says Resolved in a list", () => {
    const key = noteKey("critical", { resolved: true });
    expect(key).toMatchObject({ glyph: AlertTriangle, color: "--eq-ink-muted", word: "Critical", listWord: "Resolved", resolved: true });
  });

  it("follows the Loudness control's one colour mapping", () => {
    for (const level of ["standard", "elevated", "critical"] as const) {
      expect(noteKey(level).tone).toBe(LOUDNESS_TONE[level]);
    }
  });

  it("reads anything it doesn't know as a Note", () => {
    expect([asImportance(undefined), asImportance("high"), asImportance(3)]).toEqual(["standard", "standard", "standard"]);
    expect(noteKey(null).glyphName).toBe("NotebookPen");
  });

  it("reads the timeline lane's notes", () => {
    expect(noteKeyOf({ loudness: "elevated", resolved: false }).glyphName).toBe("AlertCircle");
    expect(noteKeyOf({ loudness: "elevated", resolved: true }).color).toBe("--eq-ink-muted");
  });
});

describe("one mark for several notes", () => {
  it("shows the loudest open note, leaving resolved ones out", () => {
    expect(loudestOpen([{ importance: "standard" }, { importance: "elevated" }])).toBe("elevated");
    expect(loudestOpen([{ importance: "critical", resolved: true }, { importance: "standard" }])).toBe("standard");
    expect(loudestOpen([{ importance: "critical", resolved: true }])).toBeNull();
    expect(loudestOpen([])).toBeNull();
  });
});
