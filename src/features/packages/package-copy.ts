/**
 * PACKAGES — every sentence the packages screen says, in one place, so each
 * can be tested for what it claims.
 *
 * Where the words come from:
 *   - The guarantee and "upgrade in the first 30 days": AJ, Sep 24 2026 (the
 *     consultation proposal's comments). The 30-day money-back covers
 *     monthly payers too; upgrading applies however they pay. Whether the
 *     second clause (six months at another gym) covers monthly payers was
 *     not asked, and the website marks the guarantee as a paid-in-full
 *     benefit, so that clause says "when you pay in full" until AJ says
 *     otherwise.
 *   - After the last payment: sessions never expire, anywhere (AJ, Sep 24);
 *     whether a package renews by itself is each studio's answer, per
 *     package (renewals/settings.ts `renewsAutomatically`). Until a studio
 *     answers, the screen says the studio will explain; it never claims
 *     auto-renew where it isn't on. The conversation before the last payment
 *     is AJ's answer to "what happens after the last payment".
 *   - "Only by coming in, or cancelling inside 24 hours": AJ, Sep 24
 *     (proposal: "You only lose a session if you cancel within 24 hours").
 *   - The mission line: docs/msf-academy, Academy 1 - Introduction, Mission.
 *
 * Nothing here calls a package "most popular", counts down, or presses.
 */

import type { PackageTier } from "../renewals/types";
import { figuresFor, formatMoney, type Lineup, type Stretch, type TierFigures } from "./package-table";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "12 months", "1 month": every months figure on the screen goes through here. */
export const monthsText = (n: number): string => plural(n, "month");
/** Just the word, for the length column that draws the number on its own. */
export const monthsWord = (n: number): string => (n === 1 ? "month" : "months");

/** "twice a week", "once a week", "3 times a week". */
export function timesAWeek(visits: number | null): string | null {
  if (visits === null || !Number.isFinite(visits) || visits <= 0) return null;
  if (visits === 1) return "once a week";
  if (visits === 2) return "twice a week";
  return Number.isInteger(visits) ? `${visits} times a week` : null;
}

/* ------------------------------------------------------------------ *
 * The head and the lede
 * ------------------------------------------------------------------ */

export function sheetTitle(studioName: string | null | undefined): string {
  return studioName ? `Packages at ${studioName}` : "Packages";
}

/** Whose prices these are, as the client may read it. */
export function priceSourceLine(studioName: string | null | undefined, ownTable: boolean): string {
  if (!ownTable) return "Max Strength’s standard prices";
  return studioName ? `${studioName}’s prices` : "This studio’s prices";
}

/**
 * The line the client's view opens on. "Twice a week" only while every
 * length on the screen is: once the trainer puts a once-a-week (or other)
 * package beside them, the claim would be false.
 */
export function lede(l: Lineup, extraShown = false): { title: string; sub: string } {
  return l.headlineIsTwiceAWeek && !extraShown
    ? {
        title: "Every package is the same training: one-on-one, twice a week.",
        sub: "What changes is how long you commit.",
      }
    : { title: "Every package is the same training.", sub: "What changes is how long you commit." };
}

/** Max Strength's mission line, quoted. Only said of twice-a-week packages. */
export const MISSION_QUOTE =
  "MaxStrength Fitness helps busy adults be healthy, fit, and strong in only twenty minutes twice a week without breaking a sweat.";
export const MISSION_SOURCE = "Max Strength’s mission (the Academy, Introduction)";

/* ------------------------------------------------------------------ *
 * The selected package
 * ------------------------------------------------------------------ */

/** "96 sessions · 12 payments" under a length's name. */
export function lengthFacts(t: PackageTier): string {
  return `${plural(t.sessions, "session")}`;
}

/**
 * The lines under the big price, in the order they are read. Every-4-weeks
 * first says the bill; paid-in-full says the one payment and what it saves.
 * A whole-package figure the table cannot stand behind is left off.
 */
export function payLines(f: TierFigures, pay: "monthly" | "full"): string[] {
  const t = f.tier;
  if (f.priceMissing) return ["The price for this package isn’t set yet."];
  const out: string[] = [];
  if (pay === "monthly") {
    if (f.payment !== null) {
      out.push(
        Number.isInteger(f.sessionsPerPayment)
          ? `${formatMoney(f.payment)} every 4 weeks, ${plural(t.payments, "payment")}. Each one is ${plural(f.sessionsPerPayment, "session")}.`
          : `${formatMoney(f.payment)} every 4 weeks, ${plural(t.payments, "payment")}.`,
      );
    }
    if (f.wholeMonthly !== null) {
      out.push(
        f.fullSaving !== null && f.wholeFull !== null
          ? `The whole package is ${formatMoney(f.wholeMonthly)}, or ${formatMoney(f.wholeFull)} paid in full.`
          : `The whole package is ${formatMoney(f.wholeMonthly)}.`,
      );
    }
    return out;
  }
  if (f.wholeFull !== null) out.push(`${formatMoney(f.wholeFull)} once, for ${plural(t.sessions, "session")}.`);
  if (f.fullSaving !== null && f.fullSavingPerSession !== null) {
    out.push(
      `That’s ${formatMoney(f.fullSavingPerSession)} less a session, and ${formatMoney(f.fullSaving)} less overall, than paying every 4 weeks.`,
    );
  }
  if (f.payment !== null && f.addsUp) {
    out.push(`Paying every 4 weeks instead: ${plural(t.payments, "payment")} of ${formatMoney(f.payment)}.`);
  }
  return out;
}

/** The words that go with the dots, and their label for a screen reader. */
export function dotsCaption(t: PackageTier, perGroup: number): string {
  return `${plural(t.sessions, "session")}: ${plural(t.payments, "payment")} of ${perGroup}. Each group is four weeks of training.`;
}

/* ------------------------------------------------------------------ *
 * Across the lengths
 * ------------------------------------------------------------------ */

export const LOWERS_EVERY_PAYMENT = "A longer commitment lowers every payment.";

/* ------------------------------------------------------------------ *
 * Your week
 * ------------------------------------------------------------------ */

export function weekPrompt(firstName: string | null | undefined): string {
  return firstName ? `Pick the two days that suit ${firstName}.` : "Pick the two days that suit you.";
}

/* ------------------------------------------------------------------ *
 * Life happens
 * ------------------------------------------------------------------ */

export const SESSION_USE_RULE =
  "A session is only used by coming in, or by cancelling with less than 24 hours’ notice.";

/**
 * What time away does to this package. Where the studio said the package
 * renews by itself, the renewal at the last payment is said out loud: the
 * new package's payments begin while unused sessions carry on (the
 * "charged while sessions are banked" case in docs/business/renewals.md).
 * Where it doesn't, the payments simply finish. Where the studio hasn't
 * said, nothing is implied about what follows: the after-the-last-payment
 * card says the studio will explain.
 */
export function lifeHappensSentence(s: Stretch, t: PackageTier, visits: number | null): string {
  const pace = timesAWeek(visits);
  const sessions = plural(t.sessions, "session");
  if (s.weeksAway === 0) {
    return `${pace ? `At ${pace}, the` : "The"} ${sessions} take ${s.trainingWeeks} weeks, the same ${s.billingWeeks} weeks the payments run.`;
  }
  const stretchLine = `With ${plural(s.weeksAway, "week")} away, the ${sessions} take about ${s.totalWeeks} weeks.`;
  if (t.renewsAutomatically === true && s.totalWeeks > s.billingWeeks) {
    return `${stretchLine} ${t.label} renews at week ${s.billingWeeks}, when its payments finish, so the new package’s payments begin while your unused sessions carry on. They never expire.`;
  }
  if (t.renewsAutomatically === false) {
    return `${stretchLine} The payments still finish at week ${s.billingWeeks}, and sessions you haven’t used never expire.`;
  }
  return `${stretchLine} This package’s ${plural(t.payments, "payment")} finish at week ${s.billingWeeks}, and sessions you haven’t used never expire.`;
}

/** The label on the timeline's mark. */
export function timelineMark(t: PackageTier, billingWeeks: number): string {
  return t.renewsAutomatically === true ? `Renews · week ${billingWeeks}` : `Payments end · week ${billingWeeks}`;
}

/* ------------------------------------------------------------------ *
 * After the last payment
 * ------------------------------------------------------------------ */

export function afterLastPayment(t: PackageTier, studioName: string | null | undefined): string[] {
  const studio = studioName || "Your studio";
  const renew =
    t.renewsAutomatically === true
      ? `When the payments finish, ${t.label} renews automatically.`
      : t.renewsAutomatically === false
        ? `When the payments finish, nothing more is charged unless you choose another package.`
        : `${studio} will explain what happens when your payments finish.`;
  return [
    renew,
    "Sessions you haven’t used never expire.",
    "Before your last payment, your trainer will talk with you about what comes next.",
  ];
}

/* ------------------------------------------------------------------ *
 * The guarantee
 * ------------------------------------------------------------------ */

export const GUARANTEE_TITLE = "The Double Transformation Guarantee";

export const GUARANTEE_LINES: ReadonlyArray<{ lead: string; rest: string }> = [
  { lead: "30 days, 100% money back.", rest: "No questions asked, whether you pay every 4 weeks or in full." },
  {
    lead: "Show up twice a week and give 100%.",
    rest: "If you’re not happy with your progress, we’ll buy you 6 months at any other gym, when you pay in full.",
  },
  {
    lead: "Change your mind about the length?",
    rest: "Within your first 30 days, or when you renew, you can upgrade to any other package, however you pay.",
  },
];

/* ------------------------------------------------------------------ *
 * The trainer notes (never on the client's view)
 * ------------------------------------------------------------------ */

/** The Academy's price lines, quoted (consultation script, price commitments). */
export const ACADEMY_LINES: ReadonlyArray<string> = [
  "This is based on coming twice a week which is what I would prescribe.",
  "Just like a doctor prescribes medication, we prescribe exercise. So based on the goals we discussed today, I would prescribe the middle option as it gives you time to get to those results and a cost savings off the top.",
  "So which do you think is best for you?",
];
export const ACADEMY_SOURCE = "The Academy’s consultation script, price commitments";
export const ACADEMY_AFTER = "Then let them speak first.";

export interface FallbackNote {
  key: "guarantee" | "lowest-rate" | "once" | "more-sessions";
  title: string;
  body: string;
}

/**
 * When money is truly the problem, in AJ's order (Sep 24 2026, the
 * proposal's comments): the guarantee, the lowest rate on the shortest
 * commitment, once a week, a few more sessions.
 */
export function moneyFallbacks(args: {
  offer: { rateFrom: PackageTier; on: PackageTier; rate: number; payment: number; total: number } | null;
  once: PackageTier[];
  studioName: string | null | undefined;
}): FallbackNote[] {
  const studio = args.studioName || "This studio";
  const notes: FallbackNote[] = [
    {
      key: "guarantee",
      title: "The guarantee",
      body: "It’s the big one: 30 days money back whether they pay every 4 weeks or in full, and, when they pay in full, 6 months at another gym if they show up twice a week and aren’t happy. It’s on their screen.",
    },
  ];
  notes.push(
    args.offer
      ? {
          key: "lowest-rate",
          title: "The lowest rate on the shortest commitment",
          body: `${formatMoney(args.offer.rate)} a session, ${args.offer.rateFrom.label}’s rate, on ${args.offer.on.label}: ${plural(args.offer.on.payments, "payment")} of ${formatMoney(args.offer.payment)}, ${formatMoney(args.offer.total)} in all. Only when money is truly the problem.`,
        }
      : {
          key: "lowest-rate",
          title: "The lowest rate on the shortest commitment",
          body: `${studio}’s table gives no lower rate to offer on its shortest package.`,
        },
  );
  notes.push({
    key: "once",
    title: "Once a week",
    body:
      args.once.length > 0
        ? `${studio}’s table has ${args.once.length === 1 ? "a once-a-week package" : "once-a-week packages"}. You can put ${args.once.length === 1 ? "it" : "them"} on their screen below.`
        : `${studio}’s table has no once-a-week package, so there’s no price to quote.`,
  });
  notes.push({
    key: "more-sessions",
    title: "A few more sessions",
    body: "Extra free workouts before they decide, or bonus sessions added to the package they choose. In Mindbody they’re the Session Comp pricing option.",
  });
  return notes;
}

/** Whose prices, and where a leader changes them. */
export function tableNote(studioName: string | null | undefined, ownTable: boolean): string {
  const studio = studioName || "This studio";
  return ownTable
    ? `These are ${studio}’s own prices, set in My Studio → Studio → Renewals. Another location’s may differ.`
    : `These are Max Strength’s standard prices: ${studio} hasn’t saved a package table of its own. A studio leader sets it in My Studio → Studio → Renewals.`;
}

/** Anything in the table the screen could not show honestly. */
export function tableWarnings(figures: TierFigures[]): string[] {
  const out: string[] = [];
  for (const f of figures) {
    const t = f.tier;
    if (f.priceMissing) {
      out.push(`${t.label} has no price per session in the table, so its price isn’t shown.`);
    } else if (!f.addsUp && f.payment !== null && f.rate !== null) {
      out.push(
        `${t.label}: ${plural(t.payments, "payment")} of ${formatMoney(f.payment)} don’t match ${plural(t.sessions, "session")} at ${formatMoney(f.rate)}, so the whole-package price is left off. Check it in My Studio → Studio → Renewals.`,
      );
    }
  }
  return out;
}

export const NOTHING_SAVED = "Nothing on this screen is saved. The contract itself is done in Mindbody.";

export function recommendationNote(defaultLabel: string | null): string {
  return defaultLabel
    ? `It starts on ${defaultLabel}, the Academy’s middle option. Move it if their goals and history call for another length.`
    : "Mark the length you’d prescribe for them, if any.";
}

/* ------------------------------------------------------------------ *
 * The post-session card
 * ------------------------------------------------------------------ */

export interface DoorRow {
  key: string;
  /** "Committed · 12 months" */
  name: string;
  /** "$60 a session · $480 every 4 weeks", or "Price not set yet". */
  price: string;
}

/** One line per length, for the post-session card's short list. */
export function doorRows(headline: PackageTier[]): DoorRow[] {
  return headline.map((t) => {
    const f = figuresFor(t);
    const price =
      f.rate === null
        ? "Price not set yet"
        : [`${formatMoney(f.rate)} a session`, f.payment !== null ? `${formatMoney(f.payment)} every 4 weeks` : null]
            .filter(Boolean)
            .join(" · ");
    return { key: t.key, name: `${t.label} · ${monthsText(t.months)}`, price };
  });
}

export const DOOR_BUTTON = "Walk through the packages";
