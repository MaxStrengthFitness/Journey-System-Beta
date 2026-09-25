import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { DEFAULT_PACKAGES } from "../renewals/settings";
import type { PackageTier } from "../renewals/types";
import {
  ACADEMY_LINES,
  afterLastPayment,
  dotsCaption,
  GUARANTEE_LINES,
  lede,
  lifeHappensSentence,
  MISSION_QUOTE,
  moneyFallbacks,
  payLines,
  priceSourceLine,
  recommendationNote,
  sheetTitle,
  tableNote,
  tableWarnings,
  timelineMark,
  timesAWeek,
} from "./package-copy";
import { figuresFor, lineup, lowestRateOnShortest, stretch } from "./package-table";

const [trial, committed] = DEFAULT_PACKAGES;
const onceAWeek: PackageTier = {
  ...trial,
  key: "once",
  label: "Once a week",
  sessions: 24,
  ratePerSession: 75,
  paymentAmount: 300,
  prepayRatePerSession: 72,
};

describe("the head", () => {
  it("names the studio when it knows it, and never leaves 'Packages at' hanging", () => {
    expect(sheetTitle("Westlake")).toBe("Packages at Westlake");
    expect(sheetTitle(null)).toBe("Packages");
    expect(sheetTitle("")).toBe("Packages");
  });

  it("says whose prices, without telling the client what the studio hasn't done", () => {
    expect(priceSourceLine("Westlake", true)).toBe("Westlake’s prices");
    expect(priceSourceLine("Westlake", false)).toBe("Max Strength’s standard prices");
    expect(priceSourceLine(null, true)).toBe("This studio’s prices");
  });

  it("only says twice a week of a twice-a-week table", () => {
    expect(lede(lineup({ packages: DEFAULT_PACKAGES })).title).toMatch(/twice a week/);
    expect(lede(lineup({ packages: [onceAWeek] })).title).not.toMatch(/twice/);
  });
});

describe("the selected package", () => {
  it("every 4 weeks, says the bill first, then the whole", () => {
    expect(payLines(figuresFor(committed), "monthly")).toEqual([
      "$480 every 4 weeks, 12 payments. Each one is 8 sessions.",
      "The whole package is $5,760, or $5,472 paid in full.",
    ]);
  });

  it("paid in full, says the one payment and what it saves", () => {
    expect(payLines(figuresFor(committed), "full")).toEqual([
      "$5,472 once, for 96 sessions.",
      "That’s $3 less a session, and $288 less overall, than paying every 4 weeks.",
      "Paying every 4 weeks instead: 12 payments of $480.",
    ]);
  });

  it("leaves off a whole-package figure the table can't stand behind", () => {
    const lines = payLines(figuresFor({ ...committed, paymentAmount: 500 }), "monthly");
    expect(lines).toEqual(["$500 every 4 weeks, 12 payments. Each one is 8 sessions."]);
    const full = payLines(figuresFor({ ...committed, paymentAmount: 500 }), "full");
    expect(full.join(" ")).not.toMatch(/instead/);
  });

  it("says a missing price is missing, never $0", () => {
    const lines = payLines(figuresFor({ ...committed, ratePerSession: 0, paymentAmount: 0 }), "monthly");
    expect(lines).toEqual(["The price for this package isn’t set yet."]);
  });

  it("drops the saving when paying in full saves nothing", () => {
    const lines = payLines(figuresFor({ ...committed, prepayRatePerSession: 60 }), "full");
    expect(lines.join(" ")).not.toMatch(/less/);
  });

  it("captions the dots in words", () => {
    expect(dotsCaption(DEFAULT_PACKAGES[2], 8)).toBe(
      "144 sessions: 18 payments of 8. Each group is four weeks of training.",
    );
  });
});

describe("life happens", () => {
  it("at the package's own pace, the sessions and the payments end together", () => {
    expect(lifeHappensSentence(stretch(committed, 0)!, committed, 2)).toBe(
      "At twice a week, the 96 sessions take 48 weeks, the same 48 weeks the payments run.",
    );
  });

  it("with weeks away, the package stretches and nothing expires; nothing is implied about what follows when the studio hasn't said", () => {
    expect(lifeHappensSentence(stretch(trial, 8)!, trial, 2)).toBe(
      "With 8 weeks away, the 48 sessions take about 32 weeks. This package’s 6 payments finish at week 24, and sessions you haven’t used never expire.",
    );
    expect(lifeHappensSentence(stretch(trial, 1)!, trial, 2)).toMatch(/^With 1 week away/);
  });

  it("where the package renews by itself, says the new payments begin while unused sessions carry on", () => {
    const renews = { ...trial, renewsAutomatically: true };
    expect(lifeHappensSentence(stretch(renews, 8)!, renews, 2)).toBe(
      "With 8 weeks away, the 48 sessions take about 32 weeks. The Trial renews at week 24, when its payments finish, so the new package’s payments begin while your unused sessions carry on. They never expire.",
    );
    expect(timelineMark(renews, 24)).toBe("Renews · week 24");
  });

  it("where it doesn't renew, says the payments finish", () => {
    const stops = { ...trial, renewsAutomatically: false };
    expect(lifeHappensSentence(stretch(stops, 8)!, stops, 2)).toMatch(/The payments still finish at week 24/);
    expect(timelineMark(stops, 24)).toBe("Payments end · week 24");
  });

  it("names how often only in words it can say", () => {
    expect(timesAWeek(1)).toBe("once a week");
    expect(timesAWeek(3)).toBe("3 times a week");
    expect(timesAWeek(2.5)).toBeNull();
    expect(timesAWeek(null)).toBeNull();
  });
});

describe("after the last payment", () => {
  it("says auto-renew only where the studio said so", () => {
    expect(afterLastPayment({ ...committed, renewsAutomatically: true }, "Solon")[0]).toBe(
      "When the payments finish, Committed renews automatically.",
    );
    expect(afterLastPayment({ ...committed, renewsAutomatically: false }, "Solon")[0]).toBe(
      "When the payments finish, nothing more is charged unless you choose another package.",
    );
    expect(afterLastPayment(committed, "Solon")[0]).toBe("Solon will explain what happens when your payments finish.");
    expect(afterLastPayment(committed, null)[0]).toBe("Your studio will explain what happens when your payments finish.");
  });

  it("always says sessions never expire (AJ, Sep 24)", () => {
    for (const renews of [true, false, undefined]) {
      expect(afterLastPayment({ ...committed, renewsAutomatically: renews }, "Solon")).toContain(
        "Sessions you haven’t used never expire.",
      );
    }
  });
});

describe("the guarantee", () => {
  it("covers monthly payers for the money back, and says upgrade, not move", () => {
    expect(GUARANTEE_LINES[0].rest).toMatch(/whether you pay every 4 weeks or in full/);
    expect(GUARANTEE_LINES[2].rest).toMatch(/upgrade to any other package/);
    expect(GUARANTEE_LINES.map((l) => l.rest).join(" ")).not.toMatch(/\bmove\b/);
  });

  it("does not promise the gym clause to monthly payers until AJ says it covers them", () => {
    expect(GUARANTEE_LINES[1].rest).toMatch(/when you pay in full/);
  });
});

describe("the trainer notes", () => {
  it("lists the money fallbacks in AJ's order", () => {
    const notes = moneyFallbacks({ offer: lowestRateOnShortest(DEFAULT_PACKAGES), once: [], studioName: "Westlake" });
    expect(notes.map((n) => n.key)).toEqual(["guarantee", "lowest-rate", "once", "more-sessions"]);
    expect(notes[1].body).toBe(
      "$54 a session, Life Transformed’s rate, on The Trial: 6 payments of $432, $2,592 in all. Only when money is truly the problem.",
    );
    expect(notes[2].body).toBe("Westlake’s table has no once-a-week package, so there’s no price to quote.");
  });

  it("points at a once-a-week row when the table has one, without telling a leader to add one when it hasn't", () => {
    const withOnce = moneyFallbacks({ offer: null, once: [onceAWeek], studioName: "Westlake" });
    expect(withOnce[2].body).toMatch(/has a once-a-week package/);
    const without = moneyFallbacks({ offer: null, once: [], studioName: "Westlake" });
    expect(without[2].body).not.toMatch(/add|My Studio/);
  });

  it("says where the prices come from", () => {
    expect(tableNote("Westlake", true)).toMatch(/Westlake’s own prices/);
    expect(tableNote("Westlake", false)).toMatch(/hasn’t saved a package table of its own/);
  });

  it("warns about a package it could not show honestly", () => {
    const w = tableWarnings([
      figuresFor({ ...committed, paymentAmount: 500 }),
      figuresFor({ ...trial, ratePerSession: 0, paymentAmount: 0 }),
      figuresFor(DEFAULT_PACKAGES[2]),
    ]);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatch(/^Committed: 12 payments of \$500 don’t match 96 sessions at \$60/);
    expect(w[1]).toMatch(/^The Trial has no price/);
  });

  it("explains where the recommendation starts", () => {
    expect(recommendationNote("Committed")).toMatch(/starts on Committed/);
    expect(recommendationNote(null)).toMatch(/if any/);
  });
});

describe("quotes are the Academy's own words", () => {
  const academy = (rel: string) => fs.readFileSync(path.join(process.cwd(), "docs", "msf-academy", "Academy", rel), "utf8");

  it("the mission line", () => {
    expect(academy("Academy 1 - Introduction/Academy - Intro 4 - Mission.txt")).toContain(MISSION_QUOTE);
  });

  it("the price-commitment lines", () => {
    const dir = path.join(process.cwd(), "docs", "msf-academy", "Academy", "Academy - Initial Consultation and Articles");
    const script = fs.readdirSync(dir).find((f) => /Script/.test(f))!;
    const text = fs.readFileSync(path.join(dir, script), "utf8");
    for (const line of ACADEMY_LINES) expect(text).toContain(line);
  });
});

describe("no pressure copy", () => {
  it("never says most popular, hurry, today only or limited", () => {
    const src = fs.readFileSync(path.join(__dirname, "package-copy.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/most popular|hurry|today only|limited time|don't miss/i);
  });
});

describe("the post-session card's short list", () => {
  it("is one line per length: the rate and the payment", async () => {
    const { doorRows } = await import("./package-copy");
    expect(doorRows(DEFAULT_PACKAGES)).toEqual([
      { key: "trial", name: "The Trial · 6 months", price: "$70 a session · $560 every 4 weeks" },
      { key: "committed", name: "Committed · 12 months", price: "$60 a session · $480 every 4 weeks" },
      { key: "transformed", name: "Life Transformed · 18 months", price: "$54 a session · $432 every 4 weeks" },
    ]);
  });

  it("says a missing price is missing", async () => {
    const { doorRows } = await import("./package-copy");
    expect(doorRows([{ ...committed, ratePerSession: 0, paymentAmount: 0 }])[0].price).toBe("Price not set yet");
  });
});

describe("the review's cases (Sep 24)", () => {
  it("never prints a fraction of a session", () => {
    const uneven = { ...committed, sessions: 50, payments: 6, ratePerSession: 60, paymentAmount: 500 };
    const lines = payLines(figuresFor(uneven), "monthly");
    expect(lines[0]).toBe("$500 every 4 weeks, 6 payments.");
    expect(lines.join(" ")).not.toMatch(/\d\.\d+ session/);
  });

  it("says 1 month, not 1 months", async () => {
    const { monthsText, monthsWord, doorRows } = await import("./package-copy");
    expect(monthsText(1)).toBe("1 month");
    expect(monthsText(12)).toBe("12 months");
    expect(monthsWord(1)).toBe("month");
    expect(doorRows([{ ...committed, months: 1, label: "Month to month" }])[0].name).toBe("Month to month · 1 month");
  });

  it("gives the trainer note the same condition on the gym clause as the client's card", () => {
    const g = moneyFallbacks({ offer: null, once: [], studioName: "Westlake" })[0];
    expect(g.body).toMatch(/when they pay in full, 6 months at another gym/);
    expect(g.body).toMatch(/whether they pay every 4 weeks or in full/);
  });

  it("drops 'twice a week' from the lede once another frequency is on the screen", () => {
    const l = lineup({ packages: [...DEFAULT_PACKAGES, onceAWeek] });
    expect(lede(l).title).toMatch(/twice a week/);
    expect(lede(l, true).title).not.toMatch(/twice/);
  });
});
