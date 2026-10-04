import { describe, expect, it } from "vitest";
import { CLIENT_PRONOUNS, agree } from "./pronouns";

describe("CLIENT_PRONOUNS", () => {
  it("is they for every client: the gender Mindbody holds is never read for a pronoun", () => {
    const p = CLIENT_PRONOUNS;
    expect([p.subject, p.object, p.possessive, p.possessiveAlone, p.reflexive]).toEqual([
      "they",
      "them",
      "their",
      "theirs",
      "themselves",
    ]);
    expect(p.plural).toBe(true);
  });

  it("agrees the verb with the pronoun", () => {
    expect(`${CLIENT_PRONOUNS.subject} ${agree(CLIENT_PRONOUNS, "is", "are")}`).toBe("they are");
    expect(`${CLIENT_PRONOUNS.subject} ${agree(CLIENT_PRONOUNS, "says", "say")}`).toBe("they say");
  });
});
