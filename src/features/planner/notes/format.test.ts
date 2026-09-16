import { describe, expect, it } from "vitest";
import { applyFormat, checklistCount, parseInline, parseNote, plainText, safeHref, toggleCheck } from "./format";

describe("safeHref", () => {
  it("allows http and https only", () => {
    expect(safeHref("https://pubmed.ncbi.nlm.nih.gov/123")).toBe("https://pubmed.ncbi.nlm.nih.gov/123");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("ftp://x.org")).toBeNull();
    expect(safeHref("https://has space.com")).toBeNull();
  });
});

describe("parseInline", () => {
  it("reads bold, italic and links", () => {
    expect(parseInline("a **b** *c* _d_ [e](https://x.org)")).toEqual([
      { t: "text", v: "a " },
      { t: "b", c: [{ t: "text", v: "b" }] },
      { t: "text", v: " " },
      { t: "i", c: [{ t: "text", v: "c" }] },
      { t: "text", v: " " },
      { t: "i", c: [{ t: "text", v: "d" }] },
      { t: "text", v: " " },
      { t: "link", href: "https://x.org/", c: [{ t: "text", v: "e" }] },
    ]);
  });

  it("links a bare address, leaving trailing punctuation outside", () => {
    expect(parseInline("See https://x.org/a.")).toEqual([
      { t: "text", v: "See " },
      { t: "link", href: "https://x.org/a", c: [{ t: "text", v: "https://x.org/a" }] },
      { t: "text", v: "." },
    ]);
  });

  it("never makes an unsafe link clickable", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ t: "text", v: "[x](javascript:alert(1))" }]);
  });

  it("leaves an unclosed or mid-word mark as typed", () => {
    expect(parseInline("**not closed")).toEqual([{ t: "text", v: "**not closed" }]);
    expect(parseInline("snake_case_name and 2*3*4")).toEqual([{ t: "text", v: "snake_case_name and 2*3*4" }]);
  });

  it("keeps HTML as text", () => {
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([{ t: "text", v: "<img src=x onerror=alert(1)>" }]);
  });
});

describe("parseNote", () => {
  it("reads a plain old note as paragraphs, exactly", () => {
    expect(parseNote("Line one\nLine two\n\nNew para")).toEqual([
      { t: "p", c: [{ t: "text", v: "Line one\nLine two" }] },
      { t: "p", c: [{ t: "text", v: "New para" }] },
    ]);
  });

  it("reads headings, lists, checklists, quotes and dividers", () => {
    const blocks = parseNote(
      ["# Plan", "## Week 1", "- leg press 60%", "- [ ] check knee", "- [x] call physio", "1. warm up", "2. lumbar", "> client said it pinches", "---"].join("\n"),
    );
    expect(blocks.map((b) => b.t)).toEqual(["h", "h", "ul", "ol", "quote", "hr"]);
    const ul = blocks[2] as Extract<(typeof blocks)[number], { t: "ul" }>;
    expect(ul.items.map((i) => [i.check, i.line])).toEqual([
      [null, 2],
      [false, 3],
      [true, 4],
    ]);
    expect((blocks[0] as { level: number }).level).toBe(1);
    expect((blocks[1] as { level: number }).level).toBe(2);
  });
});

describe("toggleCheck and checklistCount", () => {
  const body = "Plan\n- [ ] one\n- [x] two\n- three";
  it("ticks and unticks one line only", () => {
    expect(toggleCheck(body, 1)).toBe("Plan\n- [x] one\n- [x] two\n- three");
    expect(toggleCheck(body, 2)).toBe("Plan\n- [ ] one\n- [ ] two\n- three");
    expect(toggleCheck(body, 3)).toBe(body);
    expect(toggleCheck(body, 99)).toBe(body);
  });

  it("counts checklist items", () => {
    expect(checklistCount(body)).toEqual({ done: 1, total: 2 });
  });
});

describe("plainText", () => {
  it("drops the marks for excerpts and search", () => {
    expect(plainText("## Week 1\n- [ ] **check** the [knee](https://x.org)\n> said _ouch_")).toBe(
      "Week 1\ncheck the knee\nsaid ouch",
    );
  });
});

describe("applyFormat", () => {
  it("wraps a selection in bold, or inserts a placeholder", () => {
    expect(applyFormat("hello world", 6, 11, "bold")).toEqual({ text: "hello **world**", selStart: 8, selEnd: 13 });
    expect(applyFormat("hi ", 3, 3, "italic")).toEqual({ text: "hi *italic*", selStart: 4, selEnd: 10 });
  });

  it("inserts a link with the cursor where the address goes", () => {
    const e = applyFormat("read this", 5, 9, "link");
    expect(e.text).toBe("read [this](https://)");
    expect(e.selStart).toBe("read [this](https://".length);
  });

  it("turns the current line into a checklist item, and back", () => {
    const once = applyFormat("a\nbuy towels\nc", 4, 4, "check");
    expect(once.text).toBe("a\n- [ ] buy towels\nc");
    const twice = applyFormat(once.text, 5, 5, "check");
    expect(twice.text).toBe("a\nbuy towels\nc");
  });

  it("numbers every selected line, replacing bullets", () => {
    expect(applyFormat("- one\n- two\nthree", 0, 17, "ol").text).toBe("1. one\n2. two\n3. three");
  });

  it("makes a heading of an empty line", () => {
    expect(applyFormat("", 0, 0, "h")).toEqual({ text: "## ", selStart: 3, selEnd: 3 });
  });
});
