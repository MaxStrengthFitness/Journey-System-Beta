/**
 * Descriptions become tokens: "female nurses over 60", "5'6", ambiguity, and
 * the honest "not on file" counts.
 */
import { describe, expect, it } from "vitest";
import { buildDirectoryRows } from "./row";
import {
  applyTokens,
  buildNameVocab,
  buildOccupationVocab,
  notOnFileWords,
  parseQuery,
  stemWord,
  type Token,
} from "./tokens";
import { makeClient, makeContext } from "./fixtures";

const rows = buildDirectoryRows(
  [
    makeClient({ id: "1", firstName: "Eileen", lastName: "Rourke", gender: "Female", occupation: "ICU nurse", dateOfBirth: "1959-02-01", height: "5'6\"" }),
    makeClient({ id: "2", firstName: "Nancy", lastName: "Kowalski", gender: "Female", occupation: "Retired nurse", dateOfBirth: "1954-05-05", height: "5'4\"" }),
    makeClient({ id: "3", firstName: "Grace", lastName: "Lee", gender: "Female", occupation: "Nurse", dateOfBirth: "1990-01-01", height: "5 ft 6" }),
    makeClient({ id: "4", firstName: "Tom", lastName: "Reyes", gender: "Male", occupation: "Nurse", dateOfBirth: "1950-01-01" }),
    makeClient({ id: "5", firstName: "Ruth", lastName: "Baker", gender: "Female", dateOfBirth: "1944-01-01" }),
    makeClient({ id: "6", firstName: "Joan", lastName: "Smith", gender: "Female", occupation: "Baker", isRetired: true }),
    makeClient({ id: "7", firstName: "Pat", lastName: "Doe", occupation: "Teacher", dateOfBirth: "1961-03-03" }),
  ],
  makeContext(),
);
const occupations = buildOccupationVocab(rows);
const names = buildNameVocab(rows);
const kinds = (tokens: Token[]) => tokens.map((t) => t.label);

describe("stemming", () => {
  it("nurse, nurses and nursing are one word", () => {
    expect(stemWord("nurses")).toBe(stemWord("nurse"));
    expect(stemWord("nursing")).toBe(stemWord("nurse"));
    expect(stemWord("teachers")).toBe(stemWord("teacher"));
    expect(stemWord("retired")).toBe("retired");
  });
});

describe("the grammar", () => {
  it("female nurses over 60", () => {
    const q = parseQuery("female nurses over 60", occupations, { names });
    expect(kinds(q.tokens)).toEqual(["Age: 60 and over", "Gender: female", "Occupation: nurse"]);
    expect(q.nameText).toBe("");
    const f = applyTokens(rows, q.tokens);
    expect(f.rows.map((r) => r.id).sort()).toEqual(["1", "2"]);
    // Pat has no gender on file, Ruth no occupation, Joan no birth date.
    expect(notOnFileWords(f, q.tokens)).toEqual(["1 has no birth date on file", "1 has no gender on file", "1 has no occupation on file"]);
  });

  it("5'6 however it is typed", () => {
    for (const q of ["5'6", "5'6\"", "5\u20326\u2033", "5 ft 6", "5 foot 6", "5ft6", "66 in", "168 cm"]) {
      const parsed = parseQuery(q, occupations);
      expect(parsed.tokens.map((t) => (t.kind === "height" ? t.inches : null)), q).toEqual([66]);
      expect(parsed.nameText, q).toBe("");
    }
    const f = applyTokens(rows, parseQuery("everyone who's 5'6", occupations).tokens);
    expect(f.rows.map((r) => r.id).sort()).toEqual(["1", "3"]);
  });

  it("ages", () => {
    const age = (q: string) => parseQuery(q, occupations).tokens.find((t) => t.kind === "age");
    expect(age("60+")).toMatchObject({ min: 60, max: null, label: "Age: 60 and over" });
    expect(age("older than 70")).toMatchObject({ min: 70, max: null });
    expect(age("under 50")).toMatchObject({ min: null, max: 49, label: "Age: under 50" });
    expect(age("70s")).toMatchObject({ min: 70, max: 79, label: "Age: 70\u201379" });
    expect(age("in her 60s")).toMatchObject({ min: 60, max: 69 });
    expect(age("seventies")).toMatchObject({ min: 70, max: 79 });
    expect(age("between 60 and 70")).toMatchObject({ min: 60, max: 70 });
    expect(age("60 and up")).toMatchObject({ min: 60 });
  });

  it("words it doesn't know stay a name search", () => {
    const q = parseQuery("nancy over 60", occupations, { names });
    expect(q.nameText).toBe("nancy");
    expect(kinds(q.tokens)).toEqual(["Age: 60 and over"]);
  });

  it("describing words are dropped only when something was described", () => {
    expect(parseQuery("all", occupations).nameText).toBe("all");
    expect(parseQuery("all our nurses", occupations).nameText).toBe("");
  });

  it("a surname that is also an occupation is a name, and reported", () => {
    const q = parseQuery("baker", occupations, { names });
    expect(q.tokens).toEqual([]);
    expect(q.nameText).toBe("baker");
    expect(q.ambiguous).toEqual([{ word: "baker", occupation: "baker", asName: 1, asOccupation: 1 }]);
    const chosen = parseQuery("baker", occupations, { names, asOccupation: new Set(["baker"]) });
    expect(kinds(chosen.tokens)).toEqual(["Occupation: baker"]);
    expect(applyTokens(rows, chosen.tokens).rows.map((r) => r.id)).toEqual(["6"]);
  });

  it("retired matches the flag as well as the words", () => {
    const q = parseQuery("retired", occupations, { names });
    expect(applyTokens(rows, q.tokens).rows.map((r) => r.id).sort()).toEqual(["2", "6"]);
  });

  it("an occupation nobody has on file is not a token", () => {
    const q = parseQuery("pilots", occupations, { names });
    expect(q.tokens).toEqual([]);
    expect(q.nameText).toBe("pilots");
  });
});
