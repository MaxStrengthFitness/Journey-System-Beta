import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  cap,
  curly,
  dayKeyDate,
  firstSentences,
  inTime,
  joinDots,
  monthDay,
  monthDayYear,
  monthLabel,
  plural,
} from "./text";

describe("curly and cap", () => {
  it("quotes verbatim, trimming only the outside", () => {
    expect(curly("Keep the knees behind the toes.")).toBe("“Keep the knees behind the toes.”");
    expect(curly("  she's fine  ")).toBe("“she's fine”");
  });

  it("capitalises the first letter only", () => {
    expect(cap("her why")).toBe("Her why");
    expect(cap("")).toBe("");
    expect(cap("FORD")).toBe("FORD");
  });
});

describe("plural and joinDots", () => {
  it("pairs a count with the right word", () => {
    expect(plural(0, "note")).toBe("0 notes");
    expect(plural(1, "note")).toBe("1 note");
    expect(plural(3, "watch-out")).toBe("3 watch-outs");
    expect(plural(2, "focus", "focuses")).toBe("2 focuses");
    expect(plural(1, "unsaved change")).toBe("1 unsaved change");
  });

  it("joins only the parts that exist", () => {
    expect(joinDots(["Pulse Sep 20", null, "", "InBody Aug 3", undefined, false])).toBe("Pulse Sep 20 · InBody Aug 3");
    expect(joinDots([])).toBe("");
    expect(joinDots(["  ", "one"])).toBe("one");
  });
});

describe("dates", () => {
  it("reads a day key at local noon, so Eastern never slips a day", () => {
    const d = dayKeyDate("2026-09-20");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(8);
    expect(d!.getDate()).toBe(20);
    expect(d!.getHours()).toBe(12);
  });

  it("refuses a key that is not a real day", () => {
    expect(dayKeyDate("2026-02-30")).toBeNull();
    expect(dayKeyDate("2026-13-01")).toBeNull();
    expect(dayKeyDate("Sep 20")).toBeNull();
    expect(dayKeyDate("")).toBeNull();
    expect(dayKeyDate(null)).toBeNull();
    expect(dayKeyDate("2026-09-20T10:00:00")).toBeNull();
  });

  it("writes month and day the studio way", () => {
    const d = dayKeyDate("2026-09-05")!;
    expect(monthDay(d)).toBe("Sep 5");
    expect(monthDayYear(d, dayKeyDate("2026-12-31")!)).toBe("Sep 5");
    expect(monthDayYear(d, dayKeyDate("2027-01-01")!)).toBe("Sep 5, 2026");
  });

  it("names a month plainly this year and with its year otherwise", () => {
    const today = dayKeyDate("2026-09-24")!;
    expect(monthLabel(dayKeyDate("2026-09-01")!, today)).toBe("September");
    expect(monthLabel(dayKeyDate("2025-09-01")!, today)).toBe("Sep 2025");
  });
});

describe("inTime", () => {
  it("says it the way a trainer would", () => {
    const cases: Array<[number, string]> = [
      [0, "today"],
      [1, "tomorrow"],
      [-1, "yesterday"],
      [5, "in 5 days"],
      [12, "in 12 days"],
      [17, "in 17 days"],
      [30, "in 30 days"],
      [31, "in 4 weeks"],
      [33, "in 5 weeks"],
      [35, "in 5 weeks"],
      [42, "in 6 weeks"],
      [57, "in 8 weeks"],
      [83, "in 12 weeks"],
      [84, "in 3 months"],
      [120, "in 4 months"],
      [200, "in 7 months"],
      [699, "in 23 months"],
      [730, "in 2 years"],
      [-5, "5 days ago"],
      [-21, "21 days ago"],
      [-35, "5 weeks ago"],
      [-90, "3 months ago"],
    ];
    for (const [days, words] of cases) expect(inTime(days), String(days)).toBe(words);
  });

  it("starts a sentence with cap(), the way FORD's Coming up says it", () => {
    expect(cap(inTime(0))).toBe("Today");
    expect(cap(inTime(17))).toBe("In 17 days");
    expect(cap(inTime(35))).toBe("In 5 weeks");
    expect(cap(inTime(120))).toBe("In 4 months");
  });

  it("never prints a number that isn't one", () => {
    expect(inTime(Number.NaN)).toBe("");
    expect(inTime(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("firstSentences through the kit", () => {
  it("is the one from src/lib", () => {
    expect(firstSentences("One. Two.", 0)).toBe("One.");
  });
});

describe("text.ts has no regex lookbehind", () => {
  it("never parses a pattern older iPadOS Safari refuses", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    expect(readFileSync(join(here, "text.ts"), "utf8")).not.toContain("(?<");
  });
});
