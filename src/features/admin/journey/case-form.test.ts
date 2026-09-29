import { describe, expect, it } from "vitest";
import type { Trainer } from "../../../types";
import { caseRights, draftAfter, dueWords, mayEditField, ownerChoices, ownerIdOf, startingDraft } from "./case-form";
import type { StoredCase } from "./case-store";

const stored = (over: Partial<StoredCase> = {}): StoredCase => ({
  clientId: "rosie",
  clientName: "Rosie Cotton",
  owner: { id: "uid-ber", name: "Beregond Guard" },
  nextStep: "",
  dueOn: "2026-10-02",
  outcome: "open",
  reason: null,
  openedAt: new Date("2026-09-28T12:00:00Z"),
  updatedAt: new Date("2026-09-28T12:00:00Z"),
  updatedBy: "lead",
  ...over,
});

describe("caseRights — the screen offers what the rules allow", () => {
  it("a leader opens a case and changes every field", () => {
    expect(caseRights({ leads: true, uid: "lead", stored: null })).toEqual({ mayOpen: true, editing: "all" });
    expect(caseRights({ leads: true, uid: "lead", stored: stored() })).toEqual({ mayOpen: true, editing: "all" });
  });

  it("the owner changes their own case, and can't open one", () => {
    expect(caseRights({ leads: false, uid: "uid-ber", stored: stored() })).toEqual({ mayOpen: false, editing: "own" });
  });

  it("everyone else reads", () => {
    expect(caseRights({ leads: false, uid: "uid-mab", stored: stored() })).toEqual({ mayOpen: false, editing: "none" });
    expect(caseRights({ leads: false, uid: "uid-ber", stored: null })).toEqual({ mayOpen: false, editing: "none" });
    expect(caseRights({ leads: false, uid: null, stored: stored() })).toEqual({ mayOpen: false, editing: "none" });
  });

  it("the owner's four fields are the rules' four: never the owner", () => {
    expect(mayEditField("own", "nextStep")).toBe(true);
    expect(mayEditField("own", "dueOn")).toBe(true);
    expect(mayEditField("own", "outcome")).toBe(true);
    expect(mayEditField("own", "reason")).toBe(true);
    expect(mayEditField("own", "owner")).toBe(false);
    expect(mayEditField("all", "owner")).toBe(true);
    expect(mayEditField("none", "nextStep")).toBe(false);
  });
});

describe("ownerChoices — everyone who works here, by sign-in uid", () => {
  const trainers = [
    { id: "t-ber", authUid: "uid-ber", fullName: "Beregond Guard", primaryHomeStudioId: "westlake", isActive: true },
    { id: "t-mab", fullName: "Mablung Ranger", nickname: "Mab", accessibleStudioIds: ["westlake"], isActive: true },
    { id: "t-far", authUid: "uid-far", fullName: "Faramir Steward", primaryHomeStudioId: "solon", isActive: true },
    { id: "t-old", authUid: "uid-old", fullName: "Old Account", primaryHomeStudioId: "westlake", isActive: false },
    { id: "t-new", fullName: "Placeholder Person", primaryHomeStudioId: "westlake", pendingClaim: true },
  ] as unknown as Trainer[];

  it("lists the team by name, keyed by authUid else the trainer id", () => {
    expect(ownerChoices(trainers, "westlake")).toEqual([
      { id: "uid-ber", name: "Beregond Guard" },
      { id: "t-mab", name: "Mab" },
    ]);
    expect(ownerIdOf({ id: "t-mab" } as Trainer)).toBe("t-mab");
    expect(ownerIdOf({ id: "t-ber", authUid: "uid-ber" } as Trainer)).toBe("uid-ber");
  });

  it("keeps a stored owner who no longer works here, so the case is never owned by nobody", () => {
    const out = ownerChoices(trainers, "westlake", { id: "uid-gone", name: "Gone Away" });
    expect(out.map((c) => c.id)).toEqual(["uid-ber", "t-mab", "uid-gone"]);
    expect(ownerChoices(trainers, "westlake", { id: "uid-ber", name: "Beregond Guard" })).toHaveLength(2);
  });

  it("no studio, no choices", () => {
    expect(ownerChoices(trainers, null)).toEqual([]);
  });
});

describe("startingDraft — a new case starts from the page's own answer", () => {
  it("her usual trainer owns it, the rules' due day, open, an empty step", () => {
    expect(startingDraft({ owner: { id: "uid-ber", name: "Beregond Guard", usual: true }, dueDay: "2026-10-01" })).toEqual({
      owner: { id: "uid-ber", name: "Beregond Guard" },
      nextStep: "",
      dueOn: "2026-10-01",
      outcome: "open",
      reason: "",
    });
  });

  it("no usual trainer: no owner yet, and the draft can't be saved until one is chosen", () => {
    expect(startingDraft({ owner: { id: null, name: "A leader", usual: false }, dueDay: null }).owner).toBeNull();
  });
});

describe("draftAfter and dueWords", () => {
  it("applies only the diff to the committed draft", () => {
    const committed = startingDraft({ owner: { id: "uid-ber", name: "Beregond Guard", usual: true }, dueDay: null });
    expect(draftAfter(committed, { nextStep: "Phone her Friday." })).toEqual({ ...committed, nextStep: "Phone her Friday." });
  });

  it("says the due day in words, or nothing", () => {
    expect(dueWords("2026-10-02")).toBe("Fri, Oct 2");
    expect(dueWords(null)).toBe("");
    expect(dueWords("nonsense")).toBe("");
  });
});
