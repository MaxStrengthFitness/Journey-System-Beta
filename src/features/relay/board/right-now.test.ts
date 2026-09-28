import { describe, expect, it } from "vitest";
import { BEREGOND, IORETH, MABLUNG, TODAY, booking } from "./fixtures";
import { DEFAULT_SHIFT_HOURS, nowContext, type NowSession } from "./now-context";
import { QUIET_FLOOR_SESSIONS, floorLoad, isQuiet, laterToday, loadWords, rightNow, type RightNowInput } from "./right-now";

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const session = (id: string, clientName: string, start: string, minutes = 30): NowSession => ({
  id,
  clientId: id,
  clientName,
  startMin: at(start),
  endMin: at(start) + minutes,
  status: "Scheduled",
});

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

  it("calls the floor quiet at the studio's number or fewer (2 until AJ approves a setting per studio)", () => {
    expect(QUIET_FLOOR_SESSIONS).toBe(2);
    expect(isQuiet({ known: true, running: 1, startingSoon: 1 })).toBe(true);
    expect(isQuiet({ known: true, running: 2, startingSoon: 1 })).toBe(false);
  });

  it("says the load in words", () => {
    expect(loadWords({ known: true, running: 2, startingSoon: 1 })).toBe("2 sessions running now, 1 more starting in the next 20 minutes");
    expect(loadWords({ known: true, running: 1, startingSoon: 0 })).toBe("1 session running now");
    expect(loadWords({ known: true, running: 0, startingSoon: 0 })).toBe("No sessions running now");
  });
});

describe("Right now", () => {
  const base = (over: Partial<RightNowInput> = {}): RightNowInput => ({
    now: nowContext([session("x", "Barliman Butterbur", "14:40")], at("14:18"), TODAY),
    load: { known: true, running: 2, startingSoon: 0 },
    studioName: "Westlake",
    coverAsk: null,
    handedFrom: [],
    newInitiative: null,
    ...over,
  });

  it("opens Floor work on a quiet floor, and says why with its proof", () => {
    expect(rightNow(base())).toEqual({
      door: "floor",
      sentence: "The floor is quiet: 2 sessions running now. A good time for floor work.",
    });
  });

  it("opens Desk work on a busy floor", () => {
    expect(rightNow(base({ load: { known: true, running: 5, startingSoon: 1 } }))).toEqual({
      door: "desk",
      sentence: "5 sessions running now, 1 more starting in the next 20 minutes: a good time for desk work.",
    });
  });

  it("puts a teammate's cover ask first, then work handed to you, then a new initiative", () => {
    const all = base({
      coverAsk: { who: "Mablung Ranger", title: "Cover Farmer Maggot at 4:20" },
      handedFrom: ["Beregond Guard"],
      newInitiative: { who: "Glorfindel Elf", title: "5 InBody scans each by Oct 31" },
    });
    expect(rightNow(all)).toEqual({ door: "help", sentence: "Mablung needs cover: Cover Farmer Maggot at 4:20. Nobody has taken it yet." });
    expect(rightNow({ ...all, coverAsk: null })).toEqual({ door: "mine", sentence: "Beregond handed you something." });
    expect(rightNow({ ...all, coverAsk: null, handedFrom: ["Beregond Guard", "Glorfindel Elf", "Beregond Guard"] }).sentence).toBe(
      "Beregond and Glorfindel handed you 3 things.",
    );
    expect(rightNow({ ...all, coverAsk: null, handedFrom: [] })).toEqual({
      door: "lead",
      sentence: "Glorfindel started an initiative today: 5 InBody scans each by Oct 31.",
    });
  });

  it("won't guess when today's bookings can't be counted: no door, and says so", () => {
    const r = rightNow(base({ load: { known: false, running: 0, startingSoon: 0 } }));
    expect(r.door).toBeNull();
    expect(r.sentence).toBe("Today's list shows no sessions at Westlake yet, so Relay isn't saying how busy the floor is. Pick a door.");
  });

  it("with minutes to spare only for a quick one, says so", () => {
    const r = rightNow(base({ now: nowContext([session("x", "Barliman Butterbur", "14:40")], at("14:37"), TODAY) }));
    expect(r).toEqual({ door: "floor", sentence: "3 minutes until Barliman Butterbur. Quick ones only." });
  });

  it("during a session, says who you're with and how busy the floor is", () => {
    const r = rightNow(base({ now: nowContext([session("x", "Barliman Butterbur", "14:10")], at("14:18"), TODAY) }));
    expect(r.sentence).toBe("You're with Barliman Butterbur until 2:40 PM. 2 sessions running now.");
  });

  it("sends a closed studio's trainer to their own list", () => {
    const r = rightNow(base({ now: nowContext([], at("21:30"), TODAY) }));
    expect(r).toEqual({ door: "mine", sentence: "Westlake is closed now. Your own list is under Mine." });
  });
});

describe("later today", () => {
  it("names the next gaps of ten minutes or more, and when Closing opens", () => {
    const now = nowContext(
      [
        session("a", "Barliman Butterbur", "14:40"),
        session("b", "Adelard Took", "15:10"),
        session("c", "Hamfast Gamgee", "16:00"),
        session("d", "Rosie Cotton", "16:40"),
      ],
      at("14:18"),
      TODAY,
      DEFAULT_SHIFT_HOURS,
    );
    expect(laterToday(now)).toEqual([
      { key: "gap-940", time: "3:40 PM", what: "20 min free", sub: "until Hamfast Gamgee at 4:00 PM" },
      { key: "closing", time: "4:00 PM", what: "Closing chores open", sub: "the shift's closing list, for everyone on" },
      { key: "gap-990", time: "4:30 PM", what: "10 min free", sub: "until Rosie Cotton at 4:40 PM" },
    ]);
  });

  it("says nothing about Closing once it has opened, and nothing for a day with no sessions left", () => {
    expect(laterToday(nowContext([], at("17:00"), TODAY))).toEqual([]);
  });

  it("puts a teammate's cover at the time it is needed, and says whether you're free then (the second wave)", () => {
    const now = nowContext([session("x", "Barliman Butterbur", "14:40"), session("y", "Rosie Cotton", "16:40")], at("14:18"), TODAY);
    const rows = laterToday(now, 6, [
      { key: "a", min: at("16:20"), who: MABLUNG.name, title: "Cover Farmer Maggot at 4:20 PM" },
      { key: "b", min: at("16:45"), who: BEREGOND.name, title: "Cover Hamfast Gamgee at 4:45 PM" },
      { key: "gone", min: at("13:00"), who: BEREGOND.name, title: "Cover Odo Proudfoot at 1:00 PM" },
    ]);
    expect(rows.filter((r) => r.key.startsWith("cover-"))).toEqual([
      { key: "cover-a", time: "4:20 PM", what: "Mablung needs cover", sub: "Cover Farmer Maggot at 4:20 PM · you're free then" },
      { key: "cover-b", time: "4:45 PM", what: "Beregond needs cover", sub: "Cover Hamfast Gamgee at 4:45 PM · you have a session then" },
    ]);
  });
});
