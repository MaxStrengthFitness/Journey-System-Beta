import { describe, expect, it } from "vitest";
import { ageFromDob, masterSyncLabel } from "./sync-label";

const now = new Date(2026, 8, 15, 15, 0, 0); // Sep 15 2026, 3pm local

describe("masterSyncLabel", () => {
  it("says never when there is no stamp", () => {
    expect(masterSyncLabel(undefined, now)).toBe("Never synced");
    expect(masterSyncLabel("not a date", now)).toBe("Never synced");
  });
  it("reads minutes, today, yesterday and days", () => {
    expect(masterSyncLabel(new Date(2026, 8, 15, 14, 59, 30), now)).toBe("Synced just now");
    expect(masterSyncLabel(new Date(2026, 8, 15, 14, 20), now)).toBe("Synced 40 min ago");
    expect(masterSyncLabel(new Date(2026, 8, 15, 6, 0), now)).toBe("Synced today");
    expect(masterSyncLabel(new Date(2026, 8, 14, 23, 0).toISOString(), now)).toBe("Synced yesterday");
    expect(masterSyncLabel(new Date(2026, 8, 10, 9, 0), now)).toBe("Synced 5 days ago");
    expect(masterSyncLabel({ toDate: () => new Date(2026, 6, 1) }, now)).toMatch(/^Synced Jul/);
  });
});

describe("ageFromDob", () => {
  it("counts whole years on the local calendar", () => {
    expect(ageFromDob("1950-09-15", now)).toBe(76);
    expect(ageFromDob("1950-09-16", now)).toBe(75);
    expect(ageFromDob("1950-09-16T00:00:00.000Z", now)).toBe(75);
  });
  it("is null for anything it can't read", () => {
    expect(ageFromDob("", now)).toBeNull();
    expect(ageFromDob("09/16/1950", now)).toBeNull();
    expect(ageFromDob("0001-01-01", now)).toBeNull();
  });
});
