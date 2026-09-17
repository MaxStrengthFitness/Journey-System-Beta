import { describe, expect, it } from "vitest";
import {
  cleanTeamShare,
  expiryChoices,
  newlyNamed,
  noteShareFields,
  noteShareFromDoc,
  shareExpired,
  teamShareFromDoc,
  teamSharePlan,
  teamShareProblem,
  teamShareSentence,
  visibleShares,
  type NoteShare,
  type TeamShare,
} from "./team-share";

const TODAY = "2026-09-16";
const PRIYA = { id: "u-priya", name: "Priya Shah" };
const MARCUS = { id: "u-marcus", name: "Marcus Bell" };

const share = (over: Partial<TeamShare> = {}): TeamShare => ({
  studioId: "s1",
  studioName: "Solon",
  audience: "people",
  people: [PRIYA],
  expiresOn: null,
  message: "",
  ...over,
});

const copy = (over: Partial<NoteShare> = {}): NoteShare => ({
  id: "n1",
  noteId: "n1",
  studioId: "s1",
  authorId: "u-aj",
  authorName: "AJ",
  title: "Grace plan",
  body: "",
  kind: "plan",
  links: [],
  clientIds: [],
  clientNames: {},
  audience: "people",
  audienceIds: ["u-priya"],
  expiresOn: null,
  message: "",
  ...over,
});

describe("cleanTeamShare / teamShareFromDoc", () => {
  it("drops repeated people, and names nobody for a team share", () => {
    expect(cleanTeamShare(share({ people: [PRIYA, PRIYA, MARCUS] }))?.people).toEqual([PRIYA, MARCUS]);
    expect(cleanTeamShare(share({ audience: "team" }))?.people).toEqual([]);
  });

  it("reads a marker, and nothing from junk", () => {
    expect(teamShareFromDoc({ studioId: "s1", audience: "team", expiresOn: "2026-09-30" })).toMatchObject({
      studioId: "s1",
      audience: "team",
      expiresOn: "2026-09-30",
    });
    expect(teamShareFromDoc(null)).toBeNull();
    expect(teamShareFromDoc({ audience: "team" })).toBeNull();
    expect(teamShareFromDoc({ studioId: "s1", expiresOn: "Friday" })?.expiresOn).toBeNull();
  });
});

describe("teamShareProblem", () => {
  it("needs someone to share with", () => {
    expect(teamShareProblem(share({ people: [] }), TODAY)?.message).toMatch(/Pick who/);
    expect(teamShareProblem(share({ audience: "team", people: [] }), TODAY)).toBeNull();
  });

  it("refuses an end date in the past", () => {
    expect(teamShareProblem(share({ expiresOn: "2026-09-15" }), TODAY)?.message).toMatch(/passed/);
    expect(teamShareProblem(share({ expiresOn: TODAY }), TODAY)).toBeNull();
  });

  it("has nothing to say when not sharing", () => {
    expect(teamShareProblem(null, TODAY)).toBeNull();
  });
});

describe("expiry", () => {
  it("runs through its last day", () => {
    expect(shareExpired({ expiresOn: TODAY }, TODAY)).toBe(false);
    expect(shareExpired({ expiresOn: "2026-09-15" }, TODAY)).toBe(true);
    expect(shareExpired({ expiresOn: null }, TODAY)).toBe(false);
  });

  it("offers a week, two, a month, or open-ended", () => {
    expect(expiryChoices(TODAY).map((c) => c.expiresOn)).toEqual([null, "2026-09-22", "2026-09-29", "2026-10-15"]);
  });
});

describe("teamSharePlan", () => {
  it("writes where it is shared and removes where it was", () => {
    expect(teamSharePlan(null, share())).toEqual({ write: ["s1"], remove: [] });
    expect(teamSharePlan(share(), null)).toEqual({ write: [], remove: ["s1"] });
    expect(teamSharePlan(share(), share({ studioId: "s2" }))).toEqual({ write: ["s2"], remove: ["s1"] });
    expect(teamSharePlan(share(), share())).toEqual({ write: ["s1"], remove: [] });
    expect(teamSharePlan(null, null)).toEqual({ write: [], remove: [] });
  });

  it("a network share fans out to every studio and pulls back what it left (Relay)", () => {
    const network = share({ audience: "network", studioIds: ["s1", "s2", "s3"] });
    expect(teamSharePlan(null, network)).toEqual({ write: ["s1", "s2", "s3"], remove: [] });
    expect(teamSharePlan(network, share())).toEqual({ write: ["s1"], remove: ["s2", "s3"] });
    expect(teamSharePlan(network, null)).toEqual({ write: [], remove: ["s1", "s2", "s3"] });
    // The marker keeps no people, and always counts its home studio.
    expect(cleanTeamShare({ ...network, studioIds: ["s2"], people: [{ id: "x", name: "X" }] })).toMatchObject({ audience: "network", people: [], studioIds: ["s1", "s2"] });
    // The copy at each studio is a "team" share there — the rules know two audiences.
    expect(noteShareFields({ noteId: "n", title: "t", body: "", kind: "note", links: [], clientIds: [], clientNames: {} }, network, { id: "u", name: "U" }, "s2")).toMatchObject({ studioId: "s2", audience: "team", audienceIds: [] });
  });
});

describe("noteShareFields", () => {
  const note = {
    noteId: "n1",
    title: "Grace plan",
    body: "Week 1",
    kind: "plan" as const,
    links: [{ url: "https://x.org/", title: "X" }],
    clientIds: ["c1"],
    clientNames: { c1: "Grace Ahn", c2: "Someone else" },
  };

  it("names the people by uid and carries only the linked clients' names", () => {
    const f = noteShareFields(note, share({ people: [PRIYA, MARCUS], message: "Covering Tuesdays" }), { id: "u-aj", name: "AJ" });
    expect(f.audienceIds).toEqual(["u-priya", "u-marcus"]);
    expect(f.clientNames).toEqual({ c1: "Grace Ahn" });
    expect(f.message).toBe("Covering Tuesdays");
    expect(Object.keys(f)).not.toContain("log");
  });

  it("names nobody on a team share", () => {
    expect(noteShareFields(note, share({ audience: "team", people: [PRIYA] }), { id: "u-aj", name: "AJ" }).audienceIds).toEqual([]);
  });
});

describe("visibleShares", () => {
  it("shows what is addressed to me or my team, not mine, not expired", () => {
    const list = [
      copy({ id: "a" }),
      copy({ id: "b", audience: "team", audienceIds: [] }),
      copy({ id: "c", audienceIds: ["u-marcus"] }),
      copy({ id: "d", authorId: "u-priya" }),
      copy({ id: "e", expiresOn: "2026-09-01" }),
    ];
    expect(visibleShares(list, "u-priya", TODAY).map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect(visibleShares(list, null, TODAY)).toEqual([]);
  });

  it("reads an odd copy safely, never trusting a non-http link", () => {
    const s = noteShareFromDoc("x", { links: [{ url: "javascript:1", title: "bad" }, { url: "https://ok.org", title: "ok" }], kind: "weird" });
    expect(s.links).toEqual([{ url: "https://ok.org", title: "ok" }]);
    expect(s.kind).toBe("note");
    expect(s.noteId).toBe("x");
  });
});

describe("newlyNamed and the sentence", () => {
  it("tells only the people added since last time", () => {
    expect(newlyNamed(share(), share({ people: [PRIYA, MARCUS] }))).toEqual([MARCUS]);
    expect(newlyNamed(null, share())).toEqual([PRIYA]);
    expect(newlyNamed(share(), share({ audience: "team", people: [] }))).toEqual([]);
  });

  it("says who and until when", () => {
    const dayWords = (k: string) => (k === "2026-09-22" ? "Tuesday" : k);
    expect(teamShareSentence(share({ expiresOn: "2026-09-22" }), { dayWords, saved: false })).toMatch(
      /^When you save, it's shared with Priya Shah until the end of Tuesday\./,
    );
    expect(teamShareSentence(share({ audience: "team", people: [] }), { dayWords, saved: true })).toMatch(
      /^Shared with everyone who works at Solon\./,
    );
  });
});
