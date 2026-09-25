import { describe, expect, it } from "vitest";
import { optionsFor } from "../renewals/options";
import { DEFAULT_PACKAGES, DEFAULT_RENEWAL_SETTINGS, normalizeRenewalSettings } from "../renewals/settings";
import type { PackageTier } from "../renewals/types";
import {
  clampWeeksAway,
  defaultRecommendationKey,
  dotGroups,
  figuresFor,
  firstNameOf,
  formatMoney,
  frequencyOf,
  lineup,
  lowersEveryPayment,
  lowestRateOnShortest,
  MAX_WEEKS_AWAY,
  priceAs,
  recommendationLabel,
  showAsLabel,
  steps,
  stretch,
  visitsPerWeek,
  weeksFor,
} from "./package-table";

const [trial, committed, transformed] = DEFAULT_PACKAGES;

const tier = (over: Partial<PackageTier>): PackageTier => ({ ...committed, key: "x", label: "X", ...over });

const onceAWeek = tier({
  key: "once-6",
  label: "Once a week",
  months: 6,
  payments: 6,
  sessions: 24,
  ratePerSession: 75,
  paymentAmount: 300,
  prepayRatePerSession: 72,
});

describe("how often a package is for", () => {
  it("reads the standard three as twice a week", () => {
    for (const t of DEFAULT_PACKAGES) {
      expect(visitsPerWeek(t)).toBe(2);
      expect(frequencyOf(t)).toBe("twice");
    }
  });

  it("reads four sessions a payment as once a week", () => {
    expect(visitsPerWeek(onceAWeek)).toBe(1);
    expect(frequencyOf(onceAWeek)).toBe("once");
  });

  it("calls anything else other, and a broken row unknown", () => {
    expect(frequencyOf(tier({ sessions: 72, payments: 6 }))).toBe("other"); // 12 a payment, 3 a week
    expect(visitsPerWeek(tier({ payments: 0 }))).toBeNull();
    expect(frequencyOf(tier({ sessions: 0 }))).toBe("other");
  });
});

describe("lineup", () => {
  it("leads with the twice-a-week lengths, shortest first, whatever order they were saved in", () => {
    const l = lineup({ packages: [transformed, onceAWeek, trial, committed] });
    expect(l.headline.map((t) => t.key)).toEqual(["trial", "committed", "transformed"]);
    expect(l.once.map((t) => t.key)).toEqual(["once-6"]);
    expect(l.other).toEqual([]);
    expect(l.headlineIsTwiceAWeek).toBe(true);
  });

  it("keeps a once-a-week row out of the headline, where it would sort first", () => {
    const l = lineup({ packages: [...DEFAULT_PACKAGES, onceAWeek] });
    expect(l.headline[0].key).toBe("trial");
  });

  it("keeps a three-a-week row aside rather than lose it", () => {
    const three = tier({ key: "three", label: "Three a week", sessions: 72, payments: 6, months: 6 });
    const l = lineup({ packages: [...DEFAULT_PACKAGES, three] });
    expect(l.other.map((t) => t.key)).toEqual(["three"]);
    expect(l.headline).toHaveLength(3);
  });

  it("shows every row when a studio has no twice-a-week package, and says nothing about how often", () => {
    const l = lineup({ packages: [onceAWeek] });
    expect(l.headline.map((t) => t.key)).toEqual(["once-6"]);
    expect(l.headlineIsTwiceAWeek).toBe(false);
  });

  it("works on whatever the settings cleaner returns for a studio that never saved", () => {
    expect(lineup(normalizeRenewalSettings(undefined)).headline).toHaveLength(3);
  });
});

describe("the recommendation starts on 12 months", () => {
  it("is Committed on the standard table", () => {
    expect(defaultRecommendationKey(DEFAULT_PACKAGES)).toBe("committed");
  });

  it("falls back to the middle of an odd number of lengths", () => {
    const a = tier({ key: "a", months: 3 });
    const b = tier({ key: "b", months: 9 });
    const c = tier({ key: "c", months: 24 });
    expect(defaultRecommendationKey([a, b, c])).toBe("b");
  });

  it("is nobody's when there is no 12 and no middle", () => {
    expect(defaultRecommendationKey([trial, transformed])).toBeNull();
    expect(defaultRecommendationKey([])).toBeNull();
  });
});

describe("one package's figures", () => {
  it("matches the standard table", () => {
    const f = figuresFor(committed);
    expect(f).toMatchObject({
      rate: 60,
      fullRate: 57,
      payment: 480,
      wholeMonthly: 5760,
      wholeFull: 5472,
      fullSaving: 288,
      fullSavingPerSession: 3,
      addsUp: true,
      billingWeeks: 48,
      sessionsPerPayment: 8,
      visitsPerWeek: 2,
      priceMissing: false,
    });
  });

  it("the three totals agree with docs/business/packages-and-pricing.md", () => {
    expect(DEFAULT_PACKAGES.map((t) => figuresFor(t).wholeMonthly)).toEqual([3360, 5760, 7776]);
    expect(DEFAULT_PACKAGES.map((t) => figuresFor(t).wholeFull)).toEqual([3216, 5472, 7344]);
    expect(DEFAULT_PACKAGES.map((t) => figuresFor(t).fullSaving)).toEqual([144, 288, 432]);
  });

  it("agrees with the Renewal Brief to the cent, cents included", () => {
    const odd = tier({ key: "odd", ratePerSession: 59.99, paymentAmount: 480 }); // off by $0.96: still adds up
    for (const t of [...DEFAULT_PACKAGES, odd]) {
      const brief = optionsFor({ ...DEFAULT_RENEWAL_SETTINGS, packages: [t] }, null, null)[0];
      const f = figuresFor(t);
      expect(f.wholeMonthly).toBe(brief.totalMonthly);
      expect(f.wholeFull).toBe(brief.totalPrepaid);
    }
  });

  it("says a package with no price has none, never $0", () => {
    const f = figuresFor(tier({ ratePerSession: 0, paymentAmount: 0, prepayRatePerSession: 0 }));
    expect(f.priceMissing).toBe(true);
    expect(f.rate).toBeNull();
    expect(f.fullRate).toBeNull();
    expect(f.payment).toBeNull();
    expect(f.wholeMonthly).toBeNull();
    expect(f.wholeFull).toBeNull();
    for (const showAs of ["session", "week", "payment"] as const) {
      expect(priceAs(f, showAs, "monthly").amount).toBeNull();
      expect(priceAs(f, showAs, "full").amount).toBeNull();
    }
  });

  it("withholds the total when payments and the per-session price don't multiply out", () => {
    // $60 a session × 96 = $5,760, but 12 × $500 = $6,000.
    const f = figuresFor(tier({ paymentAmount: 500 }));
    expect(f.addsUp).toBe(false);
    expect(f.wholeMonthly).toBeNull();
    expect(f.fullSaving).toBeNull();
    // What each payment is, the studio did say.
    expect(f.payment).toBe(500);
  });

  it("never calls a paid-in-full price that isn't lower a saving", () => {
    expect(figuresFor(tier({ prepayRatePerSession: 60 })).fullSaving).toBeNull();
    expect(figuresFor(tier({ prepayRatePerSession: 60 })).fullSavingPerSession).toBeNull();
    expect(figuresFor(tier({ prepayRatePerSession: 65 })).fullSaving).toBeNull();
  });

  it("falls back to the monthly rate when no paid-in-full rate is set", () => {
    const f = figuresFor(tier({ prepayRatePerSession: 0 }));
    expect(f.fullRate).toBe(60);
    expect(f.fullSaving).toBeNull();
  });
});

describe("the big number", () => {
  it("every 4 weeks, speaks in the unit the trainer chose", () => {
    const f = figuresFor(trial);
    expect(priceAs(f, "session", "monthly")).toEqual({ amount: 70, unit: "a session" });
    expect(priceAs(f, "week", "monthly")).toEqual({ amount: 140, unit: "a week" });
    expect(priceAs(f, "payment", "monthly")).toEqual({ amount: 560, unit: "every 4 weeks" });
  });

  it("paid in full, never words a figure as if it were billed every 4 weeks", () => {
    const f = figuresFor(committed);
    expect(priceAs(f, "session", "full")).toEqual({ amount: 57, unit: "a session, paid in full" });
    expect(priceAs(f, "week", "full")).toEqual({ amount: 114, unit: "a week, paid in full" });
    expect(priceAs(f, "payment", "full")).toEqual({ amount: 5472, unit: "once, in full" });
    for (const s of ["session", "week", "payment"] as const) {
      expect(priceAs(f, s, "full").unit).not.toMatch(/4 weeks/);
    }
  });

  it("labels the third pick for how they pay", () => {
    expect(showAsLabel("payment", "monthly")).toBe("Each payment");
    expect(showAsLabel("payment", "full")).toBe("Paid once");
    expect(showAsLabel("session", "full")).toBe("A session");
  });

  it("keeps a studio's cents", () => {
    const f = figuresFor(tier({ paymentAmount: 432.5, ratePerSession: 54.0625, sessions: 144, payments: 18 }));
    expect(formatMoney(priceAs(f, "week", "monthly").amount!)).toBe("$108.13");
  });
});

describe("a longer commitment lowers every payment", () => {
  it("is true of the standard table", () => {
    expect(lowersEveryPayment(DEFAULT_PACKAGES)).toBe(true);
  });

  it("is not claimed when a studio's longer package costs the same or more", () => {
    expect(lowersEveryPayment([trial, { ...committed, paymentAmount: 560, ratePerSession: 70 }])).toBe(false);
    expect(lowersEveryPayment([trial, { ...committed, paymentAmount: 600, ratePerSession: 75 }])).toBe(false);
  });

  it("is not claimed with one length, a missing price, a table that doesn't add up, or two of the same length", () => {
    expect(lowersEveryPayment([committed])).toBe(false);
    expect(lowersEveryPayment([trial, { ...committed, ratePerSession: 0, paymentAmount: 0 }])).toBe(false);
    expect(lowersEveryPayment([trial, { ...committed, paymentAmount: 400 }])).toBe(false);
    expect(lowersEveryPayment([trial, { ...trial, key: "t2", paymentAmount: 500, ratePerSession: 62.5 }])).toBe(false);
  });

  it("is not claimed across different visits a week", () => {
    // Once a week costs less every 4 weeks, and is half the sessions.
    const longerOnce = tier({ key: "once-12", months: 12, payments: 12, sessions: 48, ratePerSession: 65, paymentAmount: 260 });
    expect(lowersEveryPayment([trial, longerOnce])).toBe(false);
  });

  it("draws the steps from the data whatever the claim", () => {
    const s = steps(DEFAULT_PACKAGES);
    expect(s.map((r) => r.amount)).toEqual([560, 480, 432]);
    expect(s[0].share).toBe(1);
    expect(s[2].share).toBeCloseTo(432 / 560, 6);
    const missing = steps([trial, { ...committed, ratePerSession: 0, paymentAmount: 0 }]);
    expect(missing[1]).toMatchObject({ amount: null, share: 0 });
  });
});

describe("the Academy's lowest rate on the shortest commitment", () => {
  it("is $432 every 4 weeks on The Trial, on the standard table", () => {
    const o = lowestRateOnShortest(DEFAULT_PACKAGES)!;
    expect(o.rateFrom.key).toBe("transformed");
    expect(o.on.key).toBe("trial");
    expect(o.rate).toBe(54);
    expect(o.payment).toBe(432);
    expect(o.total).toBe(2592);
  });

  it("is nothing to offer when the shortest already has the lowest rate, or a price is missing", () => {
    expect(lowestRateOnShortest([{ ...trial, ratePerSession: 50 }, committed])).toBeNull();
    expect(lowestRateOnShortest([trial])).toBeNull();
    expect(lowestRateOnShortest([trial, { ...committed, ratePerSession: 0 }])).toBeNull();
  });
});

describe("life happens", () => {
  it("at twice a week, the sessions take as long as the payments", () => {
    const s = stretch(committed, 0)!;
    expect(s).toMatchObject({ trainingWeeks: 48, totalWeeks: 48, billingWeeks: 48, weeksAway: 0 });
    expect(s.awayWeeks).toEqual([]);
  });

  it("a week away moves the last session a week later", () => {
    const s = stretch(trial, 8)!;
    expect(s.trainingWeeks).toBe(24);
    expect(s.totalWeeks).toBe(32);
    expect(s.billingWeeks).toBe(24);
    expect(s.awayWeeks).toHaveLength(8);
    expect(new Set(s.awayWeeks).size).toBe(8);
    expect(Math.max(...s.awayWeeks)).toBeLessThan(32);
  });

  it("clamps the stepper to 0–16 whole weeks", () => {
    expect(clampWeeksAway(-3)).toBe(0);
    expect(clampWeeksAway(99)).toBe(MAX_WEEKS_AWAY);
    expect(clampWeeksAway(2.6)).toBe(3);
    expect(clampWeeksAway(Number.NaN)).toBe(0);
    expect(stretch(committed, 40)!.weeksAway).toBe(16);
  });

  it("says nothing when the pace can't be worked out", () => {
    expect(stretch(tier({ payments: 0 }), 4)).toBeNull();
  });

  it("counts a part week as a week, and floating-point noise as nothing", () => {
    expect(weeksFor(48, 2)).toBe(24);
    expect(weeksFor(49, 2)).toBe(25);
    expect(weeksFor(70, 70 / 6 / 4)).toBe(24); // 24.000000000000004 in floating point
    expect(stretch(tier({ sessions: 70, payments: 6 }), 0)!.trainingWeeks).toBe(24);
  });
});

describe("the dots", () => {
  it("is one small grid per payment: four weeks across, two visits down", () => {
    expect(dotGroups(trial)).toEqual({ groups: 6, perGroup: 8, rows: 2 });
    expect(dotGroups(transformed)).toEqual({ groups: 18, perGroup: 8, rows: 2 });
  });

  it("is one row once a week", () => {
    expect(dotGroups(onceAWeek)).toEqual({ groups: 6, perGroup: 4, rows: 1 });
  });

  it("gives up rather than draw an uncountable or uneven grid", () => {
    expect(dotGroups(tier({ sessions: 100, payments: 12 }))).toBeNull(); // 8⅓ a payment
    expect(dotGroups(tier({ sessions: 300, payments: 25 }))).toBeNull();
    expect(dotGroups(tier({ sessions: 96, payments: 6 }))).toBeNull(); // 16 a payment
  });
});

describe("names", () => {
  it("names the trainer's recommendation by first name, whole", () => {
    expect(firstNameOf("Samantha Rivera-Oakes")).toBe("Samantha");
    expect(firstNameOf("  ")).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
    expect(recommendationLabel("Sam Rivera")).toBe("Sam’s recommendation");
    expect(recommendationLabel(null)).toBe("Your trainer’s recommendation");
  });
});
