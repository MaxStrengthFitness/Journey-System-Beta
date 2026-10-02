/**
 * WHAT STUDIOS OFFERED — each document read as one row an administrator can
 * decide (the Admins dashboard's review, Sep 28 2026).
 */
import { describe, expect, it } from "vitest";
import { byOldestOffer, offerFrom, studioIdFromPath } from "./offers";

describe("studioIdFromPath", () => {
  it("reads the studio from the document's path, and nothing else", () => {
    expect(studioIdFromPath("studios/westlake/wiki/machine__m-leg-press")).toBe("westlake");
    expect(studioIdFromPath("studios/westlake")).toBeNull();
    expect(studioIdFromPath("clients/123/notes/1")).toBeNull();
  });
});

describe("offerFrom", () => {
  it("never lists an offer from Demo Mode for head office (Oct 2 2026)", () => {
    expect(
      offerFrom("tip", "studios/demo-studio/playbook/tip1", "tip1", { shareStatus: "pending", title: "x", worked: "y" }),
    ).toBeNull();
  });

  it("reads a tip whole, credited to the studio its path names", () => {
    const o = offerFrom("tip", "studios/westlake/playbook/tip1", "tip1", {
      studioId: "solon", // what the writer filled in: never trusted for credit
      title: "Knees on the leg press",
      situation: "Knee pain at the bottom",
      tried: "Shorter range",
      worked: "Seat one notch back",
      shareStatus: "pending",
      shareRequestedBy: "uid-eowyn",
      studioName: "Westlake",
    });
    expect(o).toMatchObject({
      kind: "tip",
      studioId: "westlake",
      docId: "tip1",
      title: "Knees on the leg press",
      lines: ["When: Knee pain at the bottom", "Tried: Shorter range", "What worked: Seat one notch back"],
      offeredBy: "uid-eowyn",
      studioName: "Westlake",
    });
  });

  it("reads a note's blocks in order, bullets marked", () => {
    const o = offerFrom("note", "studios/westlake/wiki/machine__m-leg-press", "machine__m-leg-press", {
      title: "Leg Press",
      blocks: [
        { kind: "para", text: "Ours sits two notches lower." },
        { kind: "bullet", text: "Footstool for short legs" },
        { kind: "para", text: "   " },
      ],
      shareStatus: "pending",
      authorId: "uid-hama",
    });
    expect(o?.lines).toEqual(["Ours sits two notches lower.", "• Footstool for short legs"]);
    expect(o?.offeredBy).toBe("uid-hama");
  });

  it("reads a studio's own machine by what a reviewer needs: movement, cautions, cues", () => {
    const o = offerFrom("machine", "studios/westlake/roster/sm-westlake-sled", "sm-westlake-sled", {
      machineId: "sm-westlake-sled",
      source: "custom",
      shareStatus: "pending",
      sharedStudioName: "Westlake",
      sharedBy: "uid-faramir",
      definition: {
        name: "Sled Push",
        movementPattern: "hip_extension",
        clinicalNote: "Keep the spine long.",
        clinicalWarnings: ["Stop at knee pain"],
        contraindicatedFor: [],
        execution: { keyCues: ["Drive through the heel"] },
      },
    });
    expect(o).toMatchObject({ title: "Sled Push", studioName: "Westlake", offeredBy: "uid-faramir" });
    expect(o?.lines).toEqual([
      "Movement: hip extension",
      "Clinical note: Keep the spine long.",
      "Warnings: Stop at knee pain",
      "Key cues: Drive through the heel",
    ]);
  });

  it("is not an offer unless it waits: shared already, declined, or never offered", () => {
    const base = { title: "x", worked: "y" };
    expect(offerFrom("tip", "studios/a/playbook/1", "1", { ...base, shareStatus: "declined" })).toBeNull();
    expect(offerFrom("tip", "studios/a/playbook/1", "1", { ...base, shareStatus: "pending", shared: true })).toBeNull();
    expect(offerFrom("tip", "studios/a/playbook/1", "1", base)).toBeNull();
    expect(offerFrom("tip", "elsewhere/1", "1", { ...base, shareStatus: "pending" })).toBeNull();
  });
});

describe("byOldestOffer", () => {
  it("answers the queue in the order it was asked", () => {
    const at = (ms: number) => ({ toMillis: () => ms });
    const make = (title: string, ms: number) =>
      offerFrom("tip", `studios/a/playbook/${title}`, title, { title, worked: "w", shareStatus: "pending", shareRequestedAt: at(ms) })!;
    const sorted = [make("late", 300), make("early", 100), make("middle", 200)].sort(byOldestOffer);
    expect(sorted.map((o) => o.title)).toEqual(["early", "middle", "late"]);
  });
});
