/**
 * MARKS ON A TIME, WRITTEN (Openings round, phase 6): what marks-store.ts
 * sends, faked at `firebase/firestore`. The rules that hold it are in
 * tests/firestore.rules.test.ts ("marks on a time").
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ writes: [] as { op: string; path: string; data?: unknown; options?: unknown }[] }));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: null }, functions: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  serverTimestamp: () => "SERVER_TIME",
  setDoc: (r: { path: string }, data: unknown, options?: unknown) => {
    sent.writes.push({ op: "set", path: r.path, data, options });
    return Promise.resolve();
  },
  deleteDoc: (r: { path: string }) => {
    sent.writes.push({ op: "delete", path: r.path });
    return Promise.resolve();
  },
}));

import { MARK_NAME_MAX, keepMark, markDocument, removeMark, saveMark } from "./marks-store";

const SAM = { uid: "uid-sam", name: "Sam Lee" };

beforeEach(() => {
  sent.writes = [];
});

describe("the document a mark is written as", () => {
  it("is the time, the word, the note trimmed, who, and the server's time", () => {
    expect(markDocument("1-0800", "full", "  Always taken  ", SAM)).toEqual({
      weekday: 1,
      time: "08:00",
      mark: "full",
      note: "Always taken",
      by: { id: "uid-sam", name: "Sam Lee" },
      at: "SERVER_TIME",
    });
  });

  it("leaves an empty note out, never undefined", () => {
    const d = markDocument("6-1930", "room", "   ", SAM)!;
    expect(d).toEqual({ weekday: 6, time: "19:30", mark: "room", by: { id: "uid-sam", name: "Sam Lee" }, at: "SERVER_TIME" });
    expect("note" in d).toBe(false);
    expect(Object.values(d).includes(undefined)).toBe(false);
  });

  it("holds the note to 200 characters and the name to the rules' 120", () => {
    const d = markDocument("1-0800", "full", "x".repeat(250), { uid: "u", name: `  ${"n".repeat(130)}  ` })!;
    expect(d.note).toHaveLength(200);
    expect(d.by.name).toHaveLength(MARK_NAME_MAX);
  });

  it("is nothing for a key that isn't a time of the usual week, or with nobody signed in", () => {
    expect(markDocument("0-0800", "full", "", SAM)).toBeNull();
    expect(markDocument("1-0815", "full", "", SAM)).toBeNull();
    expect(markDocument("Monday", "full", "", SAM)).toBeNull();
    expect(markDocument("1-0800", "full", "", { uid: "", name: "Sam Lee" })).toBeNull();
  });
});

describe("the writes", () => {
  it("saveMark writes the whole mark to its time, never a merge", async () => {
    await saveMark("westlake", "2-1030", "room", "Most weeks", SAM);
    expect(sent.writes).toEqual([
      {
        op: "set",
        path: "studios/westlake/openingsMarks/2-1030",
        data: { weekday: 2, time: "10:30", mark: "room", note: "Most weeks", by: { id: "uid-sam", name: "Sam Lee" }, at: "SERVER_TIME" },
        options: undefined,
      },
    ]);
  });

  it("keepMark signs a colleague's mark again, as the person keeping it, with its word and note", async () => {
    await keepMark("westlake", { id: "1-0800", mark: "full", note: "Always taken" }, SAM);
    expect(sent.writes).toEqual([
      {
        op: "set",
        path: "studios/westlake/openingsMarks/1-0800",
        data: { weekday: 1, time: "08:00", mark: "full", note: "Always taken", by: { id: "uid-sam", name: "Sam Lee" }, at: "SERVER_TIME" },
        options: undefined,
      },
    ]);
  });

  it("removeMark deletes the time's mark", async () => {
    await removeMark("westlake", "1-0800");
    expect(sent.writes).toEqual([{ op: "delete", path: "studios/westlake/openingsMarks/1-0800" }]);
  });

  it("refuses, before sending anything, a mark with no studio, no time or nobody signed in", async () => {
    await expect(saveMark("", "1-0800", "full", "", SAM)).rejects.toThrow();
    await expect(saveMark("westlake", "8-0800", "full", "", SAM)).rejects.toThrow();
    await expect(saveMark("westlake", "1-0800", "full", "", { uid: "", name: "" })).rejects.toThrow();
    await expect(removeMark("", "1-0800")).rejects.toThrow();
    expect(sent.writes).toEqual([]);
  });
});
