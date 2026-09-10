import { describe, expect, it, vi } from "vitest";
import { buildGlossaryMatcher, linkGlossary } from "./glossary-links";

/**
 * Auto-linking is the feature most likely to become noise, so the tests are
 * mostly about what it must NOT do. No DOM is needed: linkGlossary returns
 * either the original string or an array of strings and elements, and counting
 * the elements is enough to assert every rule.
 */

const GLOSSARY = [
  { term: "Turnaround", definition: "The change of direction at either end." },
  { term: "Continuous tension", definition: "Never unloading the muscle." },
  { term: "Tension", definition: "Load held by the muscle." },
  { term: "Rep", definition: "One repetition." },
];

function elements(node: unknown): unknown[] {
  return Array.isArray(node) ? node.filter((n) => typeof n !== "string") : [];
}

describe("buildGlossaryMatcher", () => {
  it("returns a null pattern for an empty or missing glossary", () => {
    expect(buildGlossaryMatcher([]).pattern).toBeNull();
    expect(buildGlossaryMatcher(null).pattern).toBeNull();
    expect(buildGlossaryMatcher(undefined).pattern).toBeNull();
  });

  it("skips terms too short to be worth linking", () => {
    // "Rep" is three characters: it would match constantly and mean nothing.
    const m = buildGlossaryMatcher(GLOSSARY);
    expect(m.byTerm.has("rep")).toBe(false);
    expect(m.byTerm.has("turnaround")).toBe(true);
  });

  it("indexes the bare word of a parenthesised term", () => {
    const m = buildGlossaryMatcher([
      { term: "Turnaround (bottom)", definition: "At the bottom." },
    ]);
    expect(m.byTerm.has("turnaround")).toBe(true);
  });
});

describe("linkGlossary", () => {
  const matcher = buildGlossaryMatcher(GLOSSARY);
  const noop = () => {};

  it("returns the plain string when nothing matches, allocating no array", () => {
    expect(linkGlossary("Nothing here matches.", matcher, noop)).toBe(
      "Nothing here matches.",
    );
  });

  it("returns the plain string when the glossary is empty", () => {
    const empty = buildGlossaryMatcher([]);
    expect(linkGlossary("Hold the turnaround.", empty, noop)).toBe(
      "Hold the turnaround.",
    );
  });

  it("links a term it finds", () => {
    expect(elements(linkGlossary("Hold the turnaround.", matcher, noop))).toHaveLength(1);
  });

  it("matches whole words only", () => {
    // "tension" must not fire inside "tensioner", and "rep" is not indexed at
    // all -- but "reported" must not match anything either way.
    expect(linkGlossary("The tensioner is worn.", matcher, noop)).toBe(
      "The tensioner is worn.",
    );
    expect(linkGlossary("She reported it.", matcher, noop)).toBe("She reported it.");
  });

  it("is case insensitive but preserves the prose's own casing", () => {
    const out = linkGlossary("TURNAROUND matters.", matcher, noop);
    expect(elements(out)).toHaveLength(1);
    expect(JSON.stringify(out)).toContain("TURNAROUND");
  });

  it("prefers the longest term, so the specific definition wins", () => {
    const out = linkGlossary("Continuous tension is the point.", matcher, noop);
    const els = elements(out) as { props: { children: string } }[];
    expect(els).toHaveLength(1);
    expect(els[0].props.children).toBe("Continuous tension");
  });

  it("links each term once per passage, not every time it appears", () => {
    const out = linkGlossary(
      "Turnaround, then another turnaround, then a third turnaround.",
      matcher,
      noop,
    );
    expect(elements(out)).toHaveLength(1);
  });

  it("caps the links in one passage so prose does not become a link farm", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      term: `Concept${i}aaa`,
      definition: `Definition ${i}`,
    }));
    const m = buildGlossaryMatcher(many);
    const text = many.map((t) => `${t.term} appears here.`).join(" ");
    expect(elements(linkGlossary(text, m, noop)).length).toBeLessThanOrEqual(6);
  });

  it("keeps every character of the original text", () => {
    const text = "Hold the turnaround, then release the tension slowly.";
    const out = linkGlossary(text, matcher, noop);
    const flat = (Array.isArray(out) ? out : [out])
      .map((n) =>
        typeof n === "string"
          ? n
          : ((n as { props: { children: string } }).props.children ?? ""),
      )
      .join("");
    expect(flat).toBe(text);
  });

  /*
   * The bug this exists to catch: a /g regex carries lastIndex between calls,
   * and the same compiled matcher is reused for every paragraph on the page.
   * Without a reset, matches are silently skipped in alternating paragraphs.
   */
  it("finds the same term again on a second passage", () => {
    const first = linkGlossary("Hold the turnaround.", matcher, noop);
    const second = linkGlossary("Hold the turnaround.", matcher, noop);
    expect(elements(first)).toHaveLength(1);
    expect(elements(second)).toHaveLength(1);
  });

  it("hands the caller the matched entry when a link is used", () => {
    const onOpen = vi.fn();
    const out = linkGlossary("Hold the turnaround.", matcher, onOpen);
    const el = elements(out)[0] as { props: { onClick: () => void } };
    el.props.onClick();
    expect(onOpen).toHaveBeenCalledWith(GLOSSARY[0]);
  });
});
