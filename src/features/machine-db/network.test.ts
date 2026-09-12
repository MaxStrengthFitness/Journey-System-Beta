import { describe, expect, it } from "vitest";
import { networkItems, noteFromWikiDoc, studiosLine, tipFromDoc, type NetworkItem } from "./network";

describe("reading what other studios shared", () => {
  it("takes a shared, current tip and nothing else", () => {
    const base = { shared: true, title: "Shoulder pain at the top", worked: "Neutral grip, slow 10/10.", studioId: "solon", studioName: "Solon" };
    expect(tipFromDoc("t1", null, base)).toMatchObject({ kind: "tip", studioId: "solon", confirmations: 0 });
    expect(tipFromDoc("t1", null, { ...base, confirmations: { a: {}, b: {} } })?.confirmations).toBe(2);
    expect(tipFromDoc("t1", null, { ...base, shared: false })).toBeNull();
    expect(tipFromDoc("t1", null, { ...base, retiredAt: { seconds: 1 } })).toBeNull();
    expect(tipFromDoc("t1", null, { ...base, worked: "  " })).toBeNull();
    // An older entry without studioId falls back to its path.
    expect(tipFromDoc("t1", "westlake", { ...base, studioId: undefined })?.studioId).toBe("westlake");
  });

  it("takes a shared machine note, never a page or a note on the Academy", () => {
    const base = {
      shared: true,
      kind: "overlay",
      targetType: "machine",
      studioId: "solon",
      blocks: [{ kind: "para", text: "Ours sits two notches lower." }, { kind: "bogus", text: "x" }, { kind: "para", text: " " }],
    };
    expect(noteFromWikiDoc("w1", null, base)?.blocks).toEqual([{ kind: "para", text: "Ours sits two notches lower." }]);
    expect(noteFromWikiDoc("w1", null, { ...base, kind: "page" })).toBeNull();
    expect(noteFromWikiDoc("w1", null, { ...base, targetType: "topic" })).toBeNull();
    expect(noteFromWikiDoc("w1", null, { ...base, blocks: [] })).toBeNull();
  });
});

describe("networkItems", () => {
  const tip = (id: string, studioId: string, seconds: number): NetworkItem => ({
    kind: "tip", id, studioId, studioName: studioId, title: id, situation: "", tried: "", worked: "w", confirmations: 0, authorName: "", updatedAt: { seconds },
  });
  const note = (id: string, studioId: string, seconds: number): NetworkItem => ({
    kind: "note", id, studioId, studioName: studioId, blocks: [], authorName: "", updatedAt: { seconds },
  });

  it("leaves out this studio's own, and puts notes before tips, newest first", () => {
    const out = networkItems([tip("t-old", "a", 1), note("n", "b", 2), tip("t-new", "b", 5), tip("mine", "me", 9)], "me");
    expect(out.map((i) => i.id)).toEqual(["n", "t-new", "t-old"]);
  });

  it("names the studios it came from", () => {
    expect(studiosLine([tip("1", "Solon", 1)])).toBe("From Solon");
    expect(studiosLine([tip("1", "Solon", 1), tip("2", "Westlake", 1)])).toBe("From Solon and Westlake");
    expect(studiosLine([tip("1", "A", 1), tip("2", "B", 1), tip("3", "C", 1)])).toBe("From 3 studios");
    expect(studiosLine([])).toBe("");
  });
});
