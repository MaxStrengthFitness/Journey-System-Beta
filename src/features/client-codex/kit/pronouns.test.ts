import { describe, expect, it } from "vitest";
import { agree, pronounsOf } from "./pronouns";

describe("pronounsOf", () => {
  it("reads she and her from Mindbody's Female", () => {
    for (const gender of ["Female", "female", " F ", "Woman"]) {
      const p = pronounsOf({ gender });
      expect(p.subject, gender).toBe("she");
      expect(p.object).toBe("her");
      expect(p.possessive).toBe("her");
      expect(p.possessiveAlone).toBe("hers");
      expect(p.known).toBe(true);
      expect(p.plural).toBe(false);
    }
  });

  it("reads he and his from Mindbody's Male", () => {
    const p = pronounsOf({ gender: "Male" });
    expect([p.subject, p.object, p.possessive, p.reflexive]).toEqual(["he", "him", "his", "himself"]);
    expect(p.known).toBe(true);
  });

  it("falls back to they, and says it is a fallback, when the gender is unknown", () => {
    for (const client of [{ gender: "Other" }, { gender: "None" }, { gender: "" }, {}, null, undefined]) {
      const p = pronounsOf(client as { gender?: string } | null | undefined);
      expect(p.subject).toBe("they");
      expect(p.possessive).toBe("their");
      expect(p.known).toBe(false);
      expect(p.plural).toBe(true);
    }
  });

  it("agrees the verb with the pronoun", () => {
    expect(`${pronounsOf({ gender: "Female" }).subject} ${agree(pronounsOf({ gender: "Female" }), "says", "say")}`).toBe("she says");
    expect(`${pronounsOf({}).subject} ${agree(pronounsOf({}), "is", "are")}`).toBe("they are");
  });
});
