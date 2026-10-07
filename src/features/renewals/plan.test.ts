import { describe, it, expect } from "vitest";
import * as fs from "fs";
import {
  defaultPlanPackage,
  EMPTY_PLAN_DRAFT,
  PLAN_CHOICES,
  planChoicesFor,
  planExpectation,
  planLeaning,
  planModeOf,
  planNextStep,
  planPackageOptions,
  planProblem,
  planSentence,
  planWrites,
} from "./plan";
import { lastTalkOf, lastTalkSentence } from "./conversation";
import { nextStep } from "./pipeline";
import { DEFAULT_RENEWAL_SETTINGS } from "./settings";
import type { RenewalCycle, RenewalSnapshot } from "./types";

const TODAY = "2026-10-07";

const snap = (over: Partial<RenewalSnapshot> = {}): RenewalSnapshot =>
  ({
    version: 3,
    cycleKey: "9001",
    renewalOnBooks: null,
    clientContractId: "9001",
    packageKey: "committed",
    packageLabel: "Committed · 12 months",
    paymentMode: "monthly",
    billingStart: "2026-01-01",
    chargeDate: "2026-11-14",
    chargeDateSource: "mindbody",
    autoRenews: true,
    sessionsLeft: 30,
    sessionsLeftSource: "mindbody",
    sessionsOnHand: 22,
    paymentsLeft: 1,
    pacePerWeek: 1.5,
    runOutDate: null,
    bankedAtCharge: 20,
    situation: "will-bank",
    conversationDue: false,
    chargeWarning: true,
    focusDate: "2026-11-14",
    flags: [],
    proof: { weeksAttended: null, weeksObserved: null, machinesImproved: null, machinesTracked: null, bestGain: null, inbody: null },
    awayUntil: null,
    awayReason: null,
    lastVisitDate: null,
    nextBookingDate: null,
    coachIds: [],
    primaryTrainerId: null,
    dataGaps: [],
    ...over,
  }) as RenewalSnapshot;

describe("the choices, by the decided auto-renew answer", () => {
  it("offers letting it renew or pausing billing when it renews by itself and will bank sessions", () => {
    expect(planModeOf(snap())).toBe("auto-renew");
    expect(planChoicesFor(snap())).toEqual(["let-renew", "pause-billing", "not-renewing", "undecided"]);
  });

  it("leaves out pausing billing when nothing will be banked", () => {
    expect(planChoicesFor(snap({ bankedAtCharge: 0, projection: null }))).toEqual(["let-renew", "not-renewing", "undecided"]);
  });

  it("asks a studio without auto-renew (Strongsville) whether the client is renewing, and on what", () => {
    const s = snap({ autoRenews: false, autoRenewsFrom: "studio" });
    expect(planModeOf(s)).toBe("manual");
    expect(planChoicesFor(s)).toEqual(["renew-same", "upgrade", "downgrade", "pay-as-you-go", "not-renewing", "undecided"]);
    // Paid in full and unknown answers are asked the same way.
    expect(planModeOf(snap({ paymentMode: "prepaid", autoRenews: null }))).toBe("manual");
    expect(planModeOf(snap({ autoRenews: null }))).toBe("manual");
  });

  it("keeps a saved choice on the list after the answer changes", () => {
    expect(planChoicesFor(snap({ autoRenews: false }), "pause-billing")).toEqual([
      "renew-same", "upgrade", "downgrade", "pay-as-you-go", "not-renewing", "pause-billing", "undecided",
    ]);
  });

  it("lists the same choices as firestore.rules", () => {
    const rules = fs.readFileSync("firestore.rules", "utf8");
    const listed = rules.match(/function renewalPlanChoices\(\) \{\s*return \[([^\]]+)\]/)?.[1] ?? "";
    expect(listed.match(/'([a-z-]+)'/g)?.map((x) => x.slice(1, -1))).toEqual(PLAN_CHOICES);
  });
});

describe("the package a plan names", () => {
  const settings = DEFAULT_RENEWAL_SETTINGS;
  it("is the same, a longer or a shorter package", () => {
    expect(planPackageOptions("renew-same", settings, "committed").map((p) => p.key)).toEqual(["committed"]);
    expect(planPackageOptions("upgrade", settings, "committed").map((p) => p.key)).toEqual(["transformed"]);
    expect(planPackageOptions("downgrade", settings, "committed").map((p) => p.key)).toEqual(["trial"]);
    expect(planPackageOptions("upgrade", settings, "transformed")).toEqual([]);
    expect(planPackageOptions("not-renewing", settings, "committed")).toEqual([]);
    // Unknown current package: every package.
    expect(planPackageOptions("upgrade", settings, null)).toHaveLength(3);
  });
  it("starts on the next one along", () => {
    expect(defaultPlanPackage("renew-same", settings, "committed")).toBe("committed");
    expect(defaultPlanPackage("upgrade", settings, "trial")).toBe("committed");
    expect(defaultPlanPackage("downgrade", settings, "transformed")).toBe("committed");
    expect(defaultPlanPackage("upgrade", settings, null)).toBeNull();
  });
  it("is checked, but never required", () => {
    expect(planProblem(EMPTY_PLAN_DRAFT, settings, "committed")).toBe("Pick what was decided.");
    expect(planProblem({ choice: "upgrade", packageKey: null, note: "" }, settings, "committed")).toBeNull();
    expect(planProblem({ choice: "upgrade", packageKey: "trial", note: "" }, settings, "committed")).toBe(
      "That package doesn't fit this choice.",
    );
    expect(planProblem({ choice: "undecided", packageKey: null, note: "x".repeat(501) }, settings, null)).toContain("500");
  });
});

describe("planWrites", () => {
  it("writes the cycle's plan with every key and one touch of kind plan, signed by the writer", () => {
    const { touch, cycle } = planWrites({
      draft: { choice: "upgrade", packageKey: "transformed", note: "  Wants 18 months  " },
      clientId: "c1",
      clientName: "Client One",
      cycleKey: "9001",
      snapshot: { packageKey: "committed", chargeDate: "2026-11-14" },
      authorId: "uid-jen",
      authorName: "Jen Smith",
    });
    expect(cycle).toEqual({
      clientId: "c1",
      clientName: "Client One",
      cycleKey: "9001",
      packageKey: "committed",
      chargeDate: "2026-11-14",
      plan: { choice: "upgrade", packageKey: "transformed", note: "Wants 18 months", byUid: "uid-jen", byName: "Jen Smith" },
    });
    expect(touch).toMatchObject({
      authorId: "uid-jen",
      leaning: "renewing",
      interestedIn: "longer",
      note: "Wants 18 months",
      needsLeader: false,
      kind: "plan",
      plan: { choice: "upgrade", packageKey: "transformed" },
    });
  });
  it("drops a package from a choice that names none", () => {
    const { cycle } = planWrites({
      draft: { choice: "not-renewing", packageKey: "trial", note: "" },
      clientId: "c1",
      clientName: "C",
      cycleKey: "9001",
      snapshot: null,
      authorId: "u",
      authorName: "A",
    });
    expect(cycle.plan).toEqual({ choice: "not-renewing", packageKey: null, note: "", byUid: "u", byName: "A" });
  });
});

describe("the plan in words", () => {
  const at = { toDate: () => new Date("2026-10-06T15:00:00Z") };
  it("says what was decided, by whom and when", () => {
    expect(
      planSentence({ choice: "upgrade", packageKey: "transformed", byUid: "u", byName: "Jen Smith", at }, DEFAULT_RENEWAL_SETTINGS, TODAY),
    ).toBe("Upgrading to Life Transformed · Jen, Oct 6");
    expect(
      planSentence({ choice: "renew-same", packageKey: "committed", byUid: "u", byName: "AJ", at }, DEFAULT_RENEWAL_SETTINGS, TODAY),
    ).toBe("Renewing — same package (Committed) · AJ, Oct 6");
    expect(planSentence(null, DEFAULT_RENEWAL_SETTINGS, TODAY)).toBeNull();
  });
  it("leans and expects as the choice says", () => {
    expect(planLeaning("pause-billing")).toBe("renewing");
    expect(planLeaning("pay-as-you-go")).toBe("not-renewing");
    expect(planLeaning("undecided")).toBe("unsure");
    expect(planExpectation({ choice: "not-renewing" })).toBe("not-renewing");
    expect(planExpectation({ choice: "let-renew" })).toBe("renewing");
    expect(planExpectation(null)).toBeNull();
  });
});

describe("the pipeline's next step reads the plan", () => {
  const cycle = (over: Partial<RenewalCycle>): RenewalCycle =>
    ({ clientId: "c1", clientName: "C", cycleKey: "9001", packageKey: "committed", chargeDate: null, latestLeaning: null, latestConcerns: [], latestInterestedIn: null, needsLeader: false, lastTouchAt: null, lastTouchBy: null, lastTouchByName: null, ...over }) as RenewalCycle;
  const plan = (choice: any) => ({ choice, byUid: "u", byName: "Jen", at: null });

  it("before the charge: pause billing by its day, or let it renew", () => {
    expect(nextStep(snap(), cycle({ plan: plan("pause-billing") }), DEFAULT_RENEWAL_SETTINGS, TODAY)).toBe("Pause billing in Mindbody before Nov 14");
    expect(nextStep(snap(), cycle({ plan: plan("let-renew") }), DEFAULT_RENEWAL_SETTINGS, TODAY)).toBe("Letting it renew Nov 14 — sessions carry over");
  });
  it("a leader's outcome and a leader's ask still come first; not decided yet changes nothing", () => {
    expect(nextStep(snap(), cycle({ plan: plan("let-renew"), needsLeader: true }), DEFAULT_RENEWAL_SETTINGS, TODAY)).toBe("A leader was asked to follow up");
    expect(nextStep(snap(), cycle({ plan: plan("let-renew"), outcome: "lost" }), DEFAULT_RENEWAL_SETTINGS, TODAY)).toContain("Recorded as lost");
    expect(nextStep(snap(), cycle({ plan: plan("undecided") }), DEFAULT_RENEWAL_SETTINGS, TODAY)).toBe(nextStep(snap(), cycle({}), DEFAULT_RENEWAL_SETTINGS, TODAY));
  });
  it("an ended package that said it wasn't renewing asks for the outcome", () => {
    expect(planNextStep({ choice: "not-renewing" }, { situation: "ended", chargeDate: null }, TODAY)).toBe(
      "Said they weren't renewing — record the outcome",
    );
  });
});

describe("who last talked to them", () => {
  it("reads the cycle, and never says nobody off a failed read", () => {
    const at = { toDate: () => new Date("2026-10-03T15:00:00Z") };
    expect(lastTalkOf({ lastTouchAt: at, lastTouchByName: "Jen Smith" })).toEqual({ day: "2026-10-03", byName: "Jen Smith" });
    expect(lastTalkSentence({ lastTouchAt: at, lastTouchByName: "Jen Smith" }, TODAY)).toBe("Talked Oct 3 · Jen");
    expect(lastTalkSentence(null, TODAY)).toBe("Nobody has talked to them yet");
    expect(lastTalkSentence(null, TODAY, { readFailed: true })).toBe("Couldn't check");
  });
});
