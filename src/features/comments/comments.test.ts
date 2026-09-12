import { describe, expect, it } from "vitest";
import {
  activeMention,
  canDeleteComment,
  commentFromDoc,
  commentSegments,
  hasTag,
  initialsOf,
  insertMention,
  mentionMatches,
  mentionTitle,
  mentionablePeople,
  mentionsIn,
  newMentions,
  tagIsFinished,
  sortComments,
  validateComment,
  type StudioComment,
} from "./comments";

const people = [
  { id: "u1", name: "Jordan Head", initials: "JH" },
  { id: "u2", name: "Jo Anne Smith", initials: "JS" },
  { id: "u3", name: "Sam Kim", initials: "SK" },
];

describe("who can be tagged", () => {
  it("lists the studio's people who can sign in, by name, never the author", () => {
    const list = mentionablePeople(
      [
        { id: "me", fullName: "Alex Trainer", primaryHomeStudioId: "w" },
        { id: "a", fullName: "Zed Last", accessibleStudioIds: ["w"] },
        { id: "b", fullName: "Amy First", primaryHomeStudioId: "w", initials: "AF" },
        { id: "c", fullName: "Guest", activeGuestStudioIds: ["w"] },
        { id: "d", fullName: "Owner", ownedStudioIds: ["w"] },
        { id: "e", fullName: "Elsewhere", primaryHomeStudioId: "s" },
        { id: "f", fullName: "Placeholder", primaryHomeStudioId: "w", pendingClaim: true },
        { id: "g", fullName: "Replaced", primaryHomeStudioId: "w", supersededByUid: "g2" },
        { id: "h", fullName: "  ", primaryHomeStudioId: "w" },
      ],
      "w",
      "me",
    );
    expect(list.map((p) => p.id)).toEqual(["b", "c", "d", "a"]);
    expect(list.find((p) => p.id === "a")?.initials).toBe("ZL");
    expect(mentionablePeople([], null, null)).toEqual([]);
  });

  it("makes initials from a name", () => {
    expect(initialsOf("jordan head")).toBe("JH");
    expect(initialsOf("Cher")).toBe("C");
    expect(initialsOf(" ")).toBe("?");
  });
});

describe("typing a tag", () => {
  it("notices an @ being typed, and only at the start of a word", () => {
    expect(activeMention("Ask @Jor", 8)).toEqual({ start: 4, query: "Jor" });
    expect(activeMention("@", 1)).toEqual({ start: 0, query: "" });
    expect(activeMention("Ask @Jo An", 10)).toEqual({ start: 4, query: "Jo An" });
    expect(activeMention("email me@home", 13)).toBeNull();
    expect(activeMention("Ask @Jordan  then", 17)).toBeNull();
    expect(activeMention("Ask @12", 7)).toBeNull();
    expect(activeMention("no tag here", 5)).toBeNull();
  });

  it("finds people by any part of their name", () => {
    expect(mentionMatches(people, "jo").map((p) => p.id)).toEqual(["u1", "u2"]);
    expect(mentionMatches(people, "jo an").map((p) => p.id)).toEqual(["u2"]);
    expect(mentionMatches(people, "kim").map((p) => p.id)).toEqual(["u3"]);
    expect(mentionMatches(people, "").length).toBe(3);
  });

  it("puts the person's name in and the caret after it", () => {
    const m = activeMention("Ask @jor about it", 8)!;
    expect(insertMention("Ask @jor about it", m, people[0])).toEqual({ body: "Ask @Jordan Head about it", caret: 17 });
  });

  it("tags only the people the text still names", () => {
    const picked = [people[0], people[1], people[0]];
    expect(mentionsIn("Thanks @Jordan Head", picked)).toEqual([{ id: "u1", name: "Jordan Head" }]);
    expect(mentionsIn("Thanks everyone", picked)).toEqual([]);
  });

  it("notifies an edit's new tags only", () => {
    expect(newMentions([{ id: "u1", name: "J" }], [{ id: "u1", name: "J" }, { id: "u3", name: "S" }])).toEqual([{ id: "u3", name: "S" }]);
  });
});

describe("showing a comment", () => {
  it("draws each tag as a tag, the longest name first", () => {
    const segs = commentSegments("@Jo Anne Smith and @Jordan Head, see the seat", [
      { id: "u1", name: "Jordan Head" },
      { id: "u2", name: "Jo Anne Smith" },
    ]);
    expect(segs).toEqual([
      { kind: "mention", text: "@Jo Anne Smith", id: "u2" },
      { kind: "text", text: " and " },
      { kind: "mention", text: "@Jordan Head", id: "u1" },
      { kind: "text", text: ", see the seat" },
    ]);
    expect(commentSegments("plain", [])).toEqual([{ kind: "text", text: "plain" }]);
  });

  it("checks length and says who tagged whom where", () => {
    expect(validateComment("  ")).toMatch(/Write something/);
    expect(validateComment("x".repeat(2001))).toMatch(/under 2,000/);
    expect(validateComment("Fine")).toBeNull();
    expect(mentionTitle("Alex", "Leg Press")).toBe("Alex tagged you on Leg Press");
    expect(mentionTitle(" ", "Leg Press")).toBe("Someone tagged you on Leg Press");
  });

  it("reads a thread oldest first, with a just-posted comment last", () => {
    const c = (id: string, createdAt?: unknown) => ({ id, createdAt }) as StudioComment;
    expect(sortComments([c("new"), c("b", { seconds: 2 }), c("a", { seconds: 1 })]).map((x) => x.id)).toEqual(["a", "b", "new"]);
  });

  it("reads documents defensively", () => {
    expect(commentFromDoc("c", "w", { body: "  " })).toBeNull();
    const c = commentFromDoc("c", "w", { body: "Hi", mentions: [{ id: "u1", name: "J" }, { id: 3 }], authorName: "" });
    expect(c?.mentions).toEqual([{ id: "u1", name: "J" }]);
    expect(c?.authorName).toBe("A trainer");
  });

  it("lets the author or a leader take a comment down", () => {
    expect(canDeleteComment({ authorId: "me" }, "me", false)).toBe(true);
    expect(canDeleteComment({ authorId: "me" }, "you", false)).toBe(false);
    expect(canDeleteComment({ authorId: "me" }, "you", true)).toBe(true);
    expect(canDeleteComment({ authorId: "me" }, null, false)).toBe(false);
  });
});

describe("tags from the independent review", () => {
  const kims = [
    { id: "k1", name: "Sam Kim" },
    { id: "k2", name: "Sam Kimball" },
  ];

  it("counts a tag only when the whole name is tagged", () => {
    expect(hasTag("@Sam Kimball can you look", "Sam Kim")).toBe(false);
    expect(hasTag("@Sam Kim's pad sticks", "Sam Kim")).toBe(true);
    expect(hasTag("ask @Sam Kim, then @Sam Kimball", "Sam Kim")).toBe(true);
    expect(hasTag("ends with @Sam Kim", "Sam Kim")).toBe(true);
    // Picked Sam Kim, deleted it, picked Sam Kimball: only Sam Kimball is tagged.
    expect(mentionsIn("@Sam Kimball can you look", kims).map((m) => m.id)).toEqual(["k2"]);
  });

  it("never draws a shorter name inside a longer one", () => {
    const segs = commentSegments("@Sam Kimball here", [{ id: "k1", name: "Sam Kim" }]);
    expect(segs).toEqual([{ kind: "text", text: "@Sam Kimball here" }]);
  });

  it("finds a name typed without its accents, and takes the iPad's curly apostrophe", () => {
    const list = [{ id: "j", name: "José Ortiz", initials: "JO" }, { id: "p", name: "Pat O’Neil", initials: "PO" }];
    expect(mentionMatches(list, "jose").map((p) => p.id)).toEqual(["j"]);
    expect(mentionMatches(list, "o'n").map((p) => p.id)).toEqual(["p"]);
    expect(activeMention("Ask @Pat O’N", 12)).toEqual({ start: 4, query: "Pat O’N" });
  });

  it("can count every tag, to say when there are more than the ten that count", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, name: `Person ${String.fromCharCode(65 + i)}` }));
    const body = many.map((p) => `@${p.name}`).join(" ");
    expect(mentionsIn(body, many)).toHaveLength(10);
    expect(mentionsIn(body, many, Infinity)).toHaveLength(11);
  });

  it("leaves the author out under either of their ids", () => {
    const list = mentionablePeople(
      [
        { id: "uid-1", fullName: "Alex Trainer", primaryHomeStudioId: "w" },
        { id: "profile-1", fullName: "Alex Trainer (old profile)", primaryHomeStudioId: "w" },
        { id: "b", fullName: "Blair", primaryHomeStudioId: "w" },
      ],
      "w",
      ["uid-1", "profile-1"],
    );
    expect(list.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("a finished tag", () => {
  it("closes the picker once the sentence goes on past a whole name", () => {
    const list = [{ id: "k", name: "Sam Kim", initials: "SK" }, { id: "kb", name: "Sam Kimball", initials: "SB" }];
    expect(tagIsFinished(list, "Sam Kim again")).toBe(true);
    expect(tagIsFinished(list, "Sam Kim, can you")).toBe(true);
    // Still typing a name: "Sam Kim" might become "Sam Kimball".
    expect(tagIsFinished(list, "Sam Kim")).toBe(false);
    expect(tagIsFinished(list, "Sam Kimb")).toBe(false);
    expect(tagIsFinished(list, "sam")).toBe(false);
    // "Jo" is at the studio too, but "Jo Anne" is on its way to Jo Anne Smith.
    const jos = [{ id: "j", name: "Jo", initials: "J" }, { id: "ja", name: "Jo Anne Smith", initials: "JS" }];
    expect(tagIsFinished(jos, "Jo Anne")).toBe(false);
    expect(tagIsFinished(jos, "Jo, come")).toBe(true);
  });
});
