import { describe, it, expect } from "vitest";
import { chipText, dayLabel, paceLabel, paceSentence, proofSentence, situationSentence } from "./sentences";
import { fitNote, optionsFor, upgradeVerdict } from "./options";
import { DEFAULT_RENEWAL_SETTINGS, DEFAULT_PACKAGES } from "./settings";
import type { RenewalSnapshot } from "./types";

const TODAY = "2026-09-11";

function snap(over: Partial<RenewalSnapshot>): RenewalSnapshot {
  return {
    version: 1,
    cycleKey: "9001",
    clientContractId: "9001",
    packageKey: "committed",
    packageLabel: "Committed · 12 months",
    paymentMode: "monthly",
    billingStart: "2025-12-06",
    chargeDate: "2026-11-14",
    chargeDateSource: "mindbody",
    autoRenews: true,
    sessionsLeft: 9,
    sessionsLeftSource: "mindbody",
    sessionsOnHand: 9,
    paymentsLeft: 0,
    pacePerWeek: 2,
    runOutDate: "2026-10-03",
    bankedAtCharge: 0,
    situation: "on-track",
    conversationDue: true,
    chargeWarning: false,
    focusDate: "2026-10-03",
    flags: [],
    proof: { weeksAttended: 11, weeksObserved: 12, machinesImproved: 12, machinesTracked: 14, bestGain: null, inbody: null },
    awayUntil: null,
    awayReason: null,
    lastVisitDate: "2026-09-10",
    nextBookingDate: "2026-09-14",
    coachIds: ["t1"],
    dataGaps: [],
    ...over,
  };
}

describe("sentences", () => {
  it("writes the proposal's four situations as sentences", () => {
    expect(situationSentence(snap({}), TODAY)).toBe("9 sessions left · auto-renews Nov 14 · on pace");
    expect(situationSentence(snap({ situation: "will-bank", bankedAtCharge: 16 }), TODAY)).toBe(
      "Auto-renews Nov 14 with about 16 sessions still banked",
    );
    expect(situationSentence(snap({ situation: "will-run-out", runOutDate: "2026-10-03" }), TODAY)).toBe(
      "Out of sessions around Oct 3, 6 weeks before billing ends",
    );
    expect(
      situationSentence(snap({ situation: "away", awayReason: "Snowbird", awayUntil: "2027-04-01" }), TODAY),
    ).toBe("Snowbird until Apr 1, 2027 · clocks paused");
  });

  it("says 'billing ends' rather than 'auto-renews' when Mindbody says it won't", () => {
    expect(chipText(snap({ autoRenews: false }), TODAY)).toBe("9 left · billing ends Nov 14");
  });

  it("marks an estimated charge date", () => {
    expect(chipText(snap({ chargeDateSource: "estimate" }), TODAY)).toBe("9 left · auto-renews Nov 14 (estimated)");
  });

  it("gives a paid-in-full client their run-out date", () => {
    expect(chipText(snap({ paymentMode: "prepaid", chargeDate: null }), TODAY)).toBe("9 left · runs out ~Oct 3");
  });

  it("falls back to what is missing", () => {
    expect(situationSentence(snap({ situation: "unknown", dataGaps: ["Nothing has been pulled from Mindbody for this client yet."] }), TODAY)).toBe(
      "Nothing has been pulled from Mindbody for this client yet.",
    );
    expect(chipText(null, TODAY)).toBe("Renewal: not worked out yet");
  });

  it("writes pace and proof plainly", () => {
    expect(paceLabel(1.5)).toBe("1.5×");
    expect(paceLabel(1.75)).toBe("1.75×");
    expect(paceLabel(2)).toBe("2×");
    expect(paceSentence(snap({ pacePerWeek: null }))).toBe("Pace: not enough visits on record yet");
    expect(paceSentence(snap({ pacePerWeek: 1.5 }))).toBe("Comes 1.5× a week");
    expect(proofSentence(snap({}))).toBe("In 11 of the last 12 weeks · stronger on 12 of 14 machines");
  });

  it("adds the year only when it isn't this one", () => {
    expect(dayLabel("2026-11-14", TODAY)).toBe("Nov 14");
    expect(dayLabel("2027-01-05", TODAY)).toBe("Jan 5, 2027");
  });
});

describe("options", () => {
  it("shows a Committed client the website's savings", () => {
    const opts = optionsFor(DEFAULT_RENEWAL_SETTINGS, "committed", 2);
    const lt = opts.find((o) => o.tier.key === "transformed")!;
    expect(lt.perSessionDiff).toBe(-6);
    expect(lt.paymentDiff).toBe(-48);
    // 144 sessions at $60 vs $54.
    expect(lt.savingsVsCurrent).toBe(864);
    expect(lt.totalPrepaid).toBe(7344);
    expect(lt.prepaySavings).toBe(432);
    expect(opts.find((o) => o.tier.key === "committed")!.isCurrent).toBe(true);
  });

  it("is honest about fit at the client's real pace", () => {
    const committed = DEFAULT_PACKAGES[1];
    expect(fitNote(committed, 1.5)).toBe(
      "At 1.5× a week, 96 sessions last about 64 weeks — 16 past its 48 weeks of billing.",
    );
    expect(fitNote(committed, 2)).toBe("At 2× a week, 96 sessions fit its 48 weeks of billing.");
    expect(fitNote(committed, null)).toBeNull();
  });

  it("suggests an upgrade only on consistent attendance and visible progress", () => {
    expect(upgradeVerdict(snap({}), DEFAULT_RENEWAL_SETTINGS)).toEqual({
      candidate: true,
      reasons: ["Trained in 11 of the last 12 weeks.", "Stronger on 12 of 14 machines."],
      blockers: [],
    });
    const patchy = upgradeVerdict(
      snap({ proof: { weeksAttended: 6, weeksObserved: 12, machinesImproved: 12, machinesTracked: 14, bestGain: null, inbody: null } }),
      DEFAULT_RENEWAL_SETTINGS,
    );
    expect(patchy.candidate).toBe(false);
    expect(patchy.blockers[0]).toContain("patchy");
  });

  it("never suggests one through a rough patch or a Red check-in", () => {
    const v = upgradeVerdict(
      snap({ flags: [{ code: "check-in-red", text: "Red on the last 90-day check-in: Pain & Mobility." }] }),
      DEFAULT_RENEWAL_SETTINGS,
    );
    expect(v.candidate).toBe(false);
    expect(v.blockers).toContain("Red on the last 90-day check-in: Pain & Mobility.");
  });

  it("has nothing longer to offer Life Transformed", () => {
    const v = upgradeVerdict(snap({ packageKey: "transformed" }), DEFAULT_RENEWAL_SETTINGS);
    expect(v.blockers[0]).toBe("Life Transformed is already the longest package.");
  });
});
