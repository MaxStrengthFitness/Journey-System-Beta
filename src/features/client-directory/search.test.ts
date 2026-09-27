/**
 * The name matcher: tiers, nicknames both ways, typos, punctuation, and the
 * case AJ named — "search Nancy and then sort by last seen and then know
 * which Nancy was here last of all Nancys."
 */
import { describe, expect, it } from "vitest";
import {
  aliasesOf,
  buildNameIndex,
  editDistance,
  nameWords,
  normalizeName,
  searchNames,
  type NameSource,
} from "./search";
import { buildDirectoryRows } from "./row";
import { sectionRows, sortRows } from "./buckets";
import { NOW, TODAY, makeClient, makeContext } from "./fixtures";

const people: NameSource[] = [
  { id: "nk", first: "Nancy", last: "Kowalski" },
  { id: "nb", first: "Nancy", last: "Brown" },
  { id: "af", first: "Anne", nickname: "Nancy", last: "Fisher" },
  { id: "ja", first: "Judith", last: "Alvarez" },
  { id: "jy", first: "Judy", last: "Moore" },
  { id: "ob", first: "Sean", last: "O'Brien" },
  { id: "md", first: "Ellen", last: "McDonald" },
  { id: "ma", first: "Mary-Ann", last: "Reinholt-Vasquez" },
  { id: "zo", first: "Zo\u00eb", last: "Adler" },
  { id: "an", first: "Anne", last: "Ohl" },
  { id: "bn", first: "Brian", last: "Nance" },
];
const index = buildNameIndex(people);
const ids = (q: string) => [...searchNames(index, q).matches.keys()].sort();

describe("normalisation", () => {
  it("ignores case, accents, punctuation and spaces", () => {
    expect(normalizeName("O'Brien")).toBe("obrien");
    expect(normalizeName("Zo\u00eb")).toBe("zoe");
    expect(normalizeName("Mary-Ann")).toBe("maryann");
    expect(nameWords("Mary-Ann")).toEqual(["mary", "ann"]);
    expect(nameWords("O'Brien")).toEqual(["obrien"]);
  });

  it("O'Brien and McDonald, however they are typed", () => {
    for (const q of ["obrien", "o'brien", "O'BRIEN", "o brien"]) expect(ids(q), q).toEqual(["ob"]);
    for (const q of ["mcdonald", "McDonald", "mc donald", "Mcd"]) expect(ids(q), q).toEqual(["md"]);
    expect(ids("zoe")).toEqual(["zo"]);
    expect(ids("maryann")).toEqual(["ma"]);
    // Ann is in the anne/annie/nancy group, so the Nancys come too — labelled.
    const ann = searchNames(index, "ann").matches;
    expect([...ann.keys()].sort()).toEqual(["af", "an", "ma", "nb", "nk"]);
    expect(ann.get("ma")?.tier).toBe("exact");
    expect(ann.get("nk")).toMatchObject({ tier: "alias", why: "matched nickname" });
    expect(ids("vasquez")).toEqual(["ma"]);
  });
});

describe("tiers", () => {
  it("prefix of a first name or nickname, and of a last name", () => {
    const res = searchNames(index, "nan");
    expect([...res.matches.keys()].sort()).toEqual(["af", "bn", "nb", "nk"]);
    expect(res.matches.get("nk")?.tier).toBe("first-prefix");
    expect(res.matches.get("af")?.tier).toBe("first-prefix");
    expect(res.matches.get("af")?.ranges.nickname).toEqual([[0, 3]]);
    expect(res.matches.get("bn")?.tier).toBe("last-prefix");
    expect(res.matches.get("nk")?.ranges.first).toEqual([[0, 3]]);
  });

  it("an exact name beats a prefix", () => {
    expect(searchNames(index, "nancy").matches.get("nk")?.tier).toBe("exact");
  });

  it("Judy finds Judith, and Judith finds Judy \u2014 both ways, labelled", () => {
    const judy = searchNames(index, "judy");
    expect(judy.matches.get("jy")?.tier).toBe("exact");
    expect(judy.matches.get("ja")).toMatchObject({ tier: "alias", why: "matched nickname", alias: "Judy" });
    const judith = searchNames(index, "judith");
    expect(judith.matches.get("ja")?.tier).toBe("exact");
    expect(judith.matches.get("jy")).toMatchObject({ tier: "alias", why: "matched nickname", alias: "Judith" });
  });

  it("the nickname table is read both ways but never chained", () => {
    expect(aliasesOf("nan").has("nancy")).toBe(true);
    expect(aliasesOf("nancy").has("anne")).toBe(true);
    expect(aliasesOf("nan").has("anne")).toBe(false);
    expect(aliasesOf("peggy").has("margaret")).toBe(true);
    expect(aliasesOf("margaret").has("peggy")).toBe(true);
    expect(aliasesOf("dot").has("dorothy")).toBe(true);
    expect(aliasesOf("barb").has("barbara")).toBe(true);
    expect(aliasesOf("bill").has("william")).toBe(true);
    expect(aliasesOf("liz").has("elizabeth")).toBe(true);
  });

  it("two words: first name AND a last-name start, in either order", () => {
    expect(ids("nancy b")).toEqual(["nb"]);
    expect(ids("b nancy")).toEqual(["nb"]);
    expect(ids("nancy k")).toEqual(["nk"]);
  });
});

describe("close matches", () => {
  it("a typo finds her, labelled, only when nothing else matched", () => {
    const res = searchNames(index, "nancey");
    expect(res.closeOnly).toBe(true);
    // Brian Nance is one letter from "nancey" too.
    expect([...res.matches.keys()].sort()).toEqual(["af", "bn", "nb", "nk"]);
    expect(res.matches.get("nk")).toMatchObject({ tier: "close", why: "close match" });
  });

  it("never mixes close matches in with real ones", () => {
    const res = searchNames(index, "nancy");
    expect(res.closeOnly).toBe(false);
    for (const m of res.matches.values()) expect(m.tier).not.toBe("close");
  });

  it("allows one letter for short words and two for long ones", () => {
    expect(editDistance("nancey", "nancy")).toBe(1);
    expect(editDistance("nacny", "nancy")).toBe(1);
    expect(ids("kowalksy")).toEqual(["nk"]);
    expect(ids("xyzzy")).toEqual([]);
  });

  it("an empty query finds nobody (the screen shows everyone)", () => {
    expect(searchNames(index, "   ").matches.size).toBe(0);
  });
});

describe("the Nancy case", () => {
  it("type nan, sort by Last in: the most recent Nancy is first", () => {
    const clients = [
      makeClient({ id: "nk", firstName: "Nancy", lastName: "Kowalski", lastSessionDate: "2026-09-22" }),
      makeClient({ id: "nr", firstName: "Nancy", lastName: "Ruiz", lastSessionDate: "2026-09-08" }),
      makeClient({ id: "na", firstName: "Nancy", lastName: "Adler", lastSessionDate: "2026-06-02" }),
      makeClient({ id: "af", firstName: "Anne", nickname: "Nancy", lastName: "Fisher", lastSessionDate: "2026-05-30" }),
      makeClient({ id: "no", firstName: "Nancy", lastName: "Ohl", priorHistory: { sessions: 304, through: "2026-08-31", source: "filemaker" } }),
      makeClient({ id: "zz", firstName: "Zelda", lastName: "Price", lastSessionDate: "2026-09-26" }),
    ];
    const rows = buildDirectoryRows(clients, makeContext());
    const idx = buildNameIndex(rows.map((r) => ({ id: r.id, first: r.name.first, nickname: r.name.nickname, last: r.name.last })));
    const found = searchNames(idx, "nan").matches;
    const hits = rows.filter((r) => found.has(r.id));
    expect(hits.map((r) => r.id).sort()).toEqual(["af", "na", "nk", "no", "nr"]);

    const ordered = sortRows(hits, { key: "lastIn", dir: "desc" }, { today: TODAY, now: NOW });
    expect(ordered[0].name.display).toBe("Nancy Kowalski");
    expect(ordered.map((r) => r.id)).toEqual(["nk", "nr", "na", "af", "no"]);
    const sections = sectionRows(hits, { key: "lastIn", dir: "desc" }, { today: TODAY, now: NOW });
    expect(sections.map((s) => [s.label, s.rows.length])).toEqual([
      ["Last 7 days", 1],
      ["15\u201328 days ago", 1],
      ["More than 3 months ago", 2],
      ["Before Journey", 1],
    ]);
  });
});
