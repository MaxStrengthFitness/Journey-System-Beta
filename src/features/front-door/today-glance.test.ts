import { describe, expect, it } from "vitest";
import { glanceLines, todayGlance, type GlanceBooking } from "./today-glance";

const at = (hhmm: string) => new Date(`2026-10-03T${hhmm}:00-04:00`);
const me = { trainerId: "aj", trainerIds: new Set(["aj", "sam"]), staffIds: { sam: "77" } };
const row = (hhmm: string, extra: Partial<GlanceBooking> = {}): GlanceBooking => ({
  clientName: "Jane Doe",
  trainerId: "sam",
  startTime: at(hhmm),
  status: "Scheduled",
  ...extra,
});

describe("todayGlance", () => {
  it("counts the studio's bookings, leaving out cancellations and staff blocks", () => {
    const g = todayGlance(
      [row("09:00"), row("10:00", { status: "Cancelled" }), row("11:00", { clientName: "Unavailable" }), row("12:00")],
      me,
      at("08:00"),
    );
    expect(g.booked).toBe(2);
  });

  it("finds yours by the Hub's rule, and your next one from now", () => {
    const g = todayGlance(
      [row("09:00", { trainerId: "aj", clientName: "Ann Early" }), row("10:30", { trainerId: "aj", clientName: "Bea Next" }), row("11:00")],
      me,
      at("10:05"),
    );
    expect(g.mine).toBe(2);
    expect(g.next?.clientName).toBe("Bea Next");
  });

  it("keeps a session as next for ten minutes after it began", () => {
    const g = todayGlance([row("10:00", { trainerId: "aj", clientName: "Cy Now" })], me, at("10:08"));
    expect(g.next?.clientName).toBe("Cy Now");
    expect(todayGlance([row("10:00", { trainerId: "aj" })], me, at("10:20")).allStarted).toBe(true);
  });

  it("never counts a booking for an unknown trainer as yours", () => {
    expect(todayGlance([row("10:00", { trainerId: "someone-else" })], me, at("08:00")).mine).toBe(0);
  });
});

describe("glanceLines", () => {
  it("says your next client first, with the time, then the studio's count", () => {
    const lines = glanceLines(
      { booked: 22, mine: 5, next: { at: at("09:40"), clientName: "Jane Doe" }, allStarted: false },
      3,
      "America/New_York",
    );
    expect(lines.map((l) => l.figure)).toEqual(["9:40 AM", "22", "3"]);
    expect(lines[0].words).toBe("Your next client, Jane Doe · 5 yours today");
    expect(lines[0].yours).toBe(true);
  });

  it("says a clear day plainly", () => {
    const lines = glanceLines({ booked: 1, mine: 0, next: null, allStarted: false }, 0);
    expect(lines.map((l) => l.words)).toEqual(["clients booked with you today", "session booked at the studio today"]);
  });

  it("leaves out what wasn't read, never drawing it as a zero", () => {
    expect(glanceLines(null, null)).toEqual([]);
    expect(glanceLines(null, 2).map((l) => l.figure)).toEqual(["2"]);
  });
});
