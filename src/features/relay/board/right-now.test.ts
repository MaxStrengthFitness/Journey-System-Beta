import { describe, expect, it } from "vitest";
import { BEREGOND, IORETH, MABLUNG, TODAY, booking } from "./fixtures";
import { floorLoad, isQuiet, loadWords, quietLine } from "./right-now";
import { SETTING_BY_KEY } from "../../studio-settings/registry";

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

describe("the floor's load", () => {
  it("counts sessions running now and starting in the next twenty minutes, at the studio, today", () => {
    const rows = [
      booking("a", BEREGOND, "Odo Proudfoot", "14:00"),
      booking("b", MABLUNG, "Belladonna Took", "14:10"),
      booking("c", IORETH, "Barliman Butterbur", "14:30"),
      booking("d", BEREGOND, "Rosie Cotton", "15:00"),
      // A staff block is never a booking (lib/booking-state).
      { ...booking("e", MABLUNG, "Unavailable", "14:00"), clientName: "Unavailable" },
      { ...booking("f", MABLUNG, "Farmer Maggot", "14:00"), status: "Cancelled" },
    ];
    expect(floorLoad(rows as never, TODAY, at("14:18"))).toEqual({ known: true, running: 2, startingSoon: 1 });
  });

  it("is unknown, never quiet, when today's list holds nothing it can count", () => {
    expect(floorLoad([], TODAY, at("14:18"))).toEqual({ known: false, running: 0, startingSoon: 0 });
    expect(isQuiet({ known: false, running: 0, startingSoon: 0 })).toBe(false);
    // Another day's bookings don't count toward today's floor.
    const tomorrow = { ...booking("a", BEREGOND, "Odo Proudfoot", "14:00"), startTime: "2026-09-29T18:00:00.000Z" };
    expect(floorLoad([tomorrow] as never, TODAY, at("14:18")).known).toBe(false);
  });

  it("calls the floor quiet at the studio's number or fewer: the setting, else the app's default of 2", () => {
    // The number lives in the studio settings' registry, not here (Sep 28 2026).
    expect(SETTING_BY_KEY.quietFloorSessions.appDefault).toBe(2);
    expect(isQuiet({ known: true, running: 1, startingSoon: 1 })).toBe(true);
    expect(isQuiet({ known: true, running: 2, startingSoon: 1 })).toBe(false);
    // A studio that set 4: three sessions is still a quiet floor there.
    expect(isQuiet({ known: true, running: 2, startingSoon: 1 }, 4)).toBe(true);
    // A studio that set 0: only an empty floor is quiet.
    expect(isQuiet({ known: true, running: 0, startingSoon: 1 }, 0)).toBe(false);
    expect(isQuiet({ known: false, running: 0, startingSoon: 0 }, 12)).toBe(false);
  });

  it("says the load in words", () => {
    expect(loadWords({ known: true, running: 2, startingSoon: 1 })).toBe("2 sessions running now, 1 more starting in the next 20 minutes");
    expect(loadWords({ known: true, running: 1, startingSoon: 0 })).toBe("1 session running now");
    expect(loadWords({ known: true, running: 0, startingSoon: 0 })).toBe("No sessions running now");
  });
});

describe("the quiet floor line", () => {
  it("says a quiet floor is a good time for floor work, by the studio's own number", () => {
    const load = { known: true, running: 1, startingSoon: 0 };
    expect(quietLine(load)).toBe("Quiet floor right now (1 session running now): a good time for floor work.");
    expect(quietLine(load, 0)).toBeNull();
  });

  it("says nothing on a busy floor, or one it can't count", () => {
    expect(quietLine({ known: true, running: 4, startingSoon: 1 })).toBeNull();
    expect(quietLine({ known: false, running: 0, startingSoon: 0 })).toBeNull();
  });
});
