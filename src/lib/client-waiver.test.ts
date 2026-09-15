import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { waiverState } from "./client-waiver";

describe("waiverState", () => {
  it("is unknown — not 'not on file' — when the waiver was never synced", () => {
    for (const client of [{}, { isLiabilityReleased: undefined }, { isLiabilityReleased: null }, null, undefined]) {
      const w = waiverState(client);
      expect(w.state).toBe("unknown");
      expect(w.tone).toBe("neutral");
      expect(w.date).toBeNull();
      expect(w.label).toBe("Not synced yet");
    }
  });

  it("is not-signed only when Mindbody said so", () => {
    const w = waiverState({ isLiabilityReleased: false, liabilityAgreementDate: "2019-03-20" });
    expect(w).toMatchObject({ state: "not-signed", tone: "warn", date: null, label: "Not signed" });
  });

  it("is signed, with the Mindbody day, from a Firestore Timestamp", () => {
    // The webhook and Master Sync store Mindbody's zoneless time read as UTC.
    const stored = Timestamp.fromDate(new Date("2019-03-20T00:30:00Z"));
    const w = waiverState({ isLiabilityReleased: true, liabilityAgreementDate: stored });
    expect(w.state).toBe("signed");
    expect(w.tone).toBe("ok");
    expect(w.date?.toISOString()).toBe("2019-03-20T00:30:00.000Z");
    // Formatted in UTC: 00:30 UTC is still Mar 19 in Ohio, but the day
    // Mindbody showed was the 20th.
    expect(w.label).toBe("Signed Mar 20, 2019");
  });

  it("keeps the calendar day of a date-only string in any time zone", () => {
    // new Date("2019-03-20") is UTC midnight — Mar 19 on an Eastern clock.
    const w = waiverState({ isLiabilityReleased: true, liabilityAgreementDate: "2019-03-20" });
    expect(w.label).toBe("Signed Mar 20, 2019");
  });

  it("says just 'Signed' when there is no usable date", () => {
    expect(waiverState({ isLiabilityReleased: true }).label).toBe("Signed");
    expect(waiverState({ isLiabilityReleased: true, liabilityAgreementDate: "not a date" })).toMatchObject({
      label: "Signed",
      date: null,
    });
    expect(waiverState({ isLiabilityReleased: true, liabilityAgreementDate: { seconds: 1553040000 } }).label).toBe(
      "Signed Mar 20, 2019",
    );
  });
});
