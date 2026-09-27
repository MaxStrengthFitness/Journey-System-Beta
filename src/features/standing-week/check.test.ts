import { describe, expect, it } from "vitest";
import type { ScheduleEntry } from "../../types";
import { checkWeek, findingSentence, isFreeSlot, mondayOf, stateSentence, type WeekCheckInput } from "./check";
import type { StandingWeek, StandingWeekDoc } from "./week";

/**
 * The week check (voice-review round, Sep 27 2026): the coming seven days'
 * bookings against each trainer's AGREED standing week. Today is Monday
 * Sep 28 2026, so the window is Monday to Sunday Oct 4.
 */

const TZ = "America/New_York";
const TODAY = "2026-09-28";

const judyMon = { id: "r1", weekday: 1, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" };
const judyThu = { id: "r2", weekday: 4, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" };
const agreed: StandingWeek = { hours: [{ weekday: 1, from: "07:00", to: "13:00" }], regulars: [judyMon, judyThu] };

const sam = (over: Partial<StandingWeekDoc> = {}): StandingWeekDoc => ({
  id: "uid-sam",
  studioId: "solon",
  trainerUid: "uid-sam",
  trainerId: "t-sam",
  trainerName: "Sam Lee",
  proposed: agreed,
  final: agreed,
  ...over,
});

let n = 0;
/** A booking at the studio's wall clock: "2026-09-28 08:00" in EDT. */
const booking = (day: string, clock: string, over: Partial<ScheduleEntry> = {}): ScheduleEntry =>
  ({
    id: `b${++n}`,
    clientId: "c-judy",
    clientName: "Judy Smith",
    trainerId: "t-sam",
    trainerName: "Sam Lee",
    studioId: "solon",
    startTime: new Date(`${day}T${clock}:00-04:00`),
    endTime: null,
    status: "Scheduled",
    serviceName: "Training Session",
    source: "MindBody",
    createdAt: null,
    ...over,
  }) as ScheduleEntry;

const input = (over: Partial<WeekCheckInput> = {}): WeekCheckInput => ({
  docs: [sam()],
  bookings: [booking("2026-09-28", "08:00"), booking("2026-10-01", "08:00")],
  today: TODAY,
  tz: TZ,
  read: "ready",
  connected: true,
  ...over,
});

describe("checkWeek — as usual", () => {
  it("says nothing when every agreed slot is booked as usual", () => {
    const c = checkWeek(input());
    expect(c).toEqual({ state: "ready", findings: [], slots: 2 });
    expect(stateSentence(c)).toBe("All 2 agreed slots are booked as usual for the next seven days.");
  });

  it("keeps a slot for a booking within 15 minutes, or one no trainer was matched to", () => {
    expect(checkWeek(input({ bookings: [booking("2026-09-28", "08:10"), booking("2026-10-01", "07:50")] })).findings).toEqual([]);
    expect(checkWeek(input({ bookings: [booking("2026-09-28", "08:00", { trainerId: undefined }), booking("2026-10-01", "08:00")] })).findings).toEqual([]);
  });

  it("is the same week on the day the clocks change", () => {
    // DST ends Sunday Nov 1 2026: the Monday after, 8:00 is 8:00 EST.
    const c = checkWeek(
      input({
        today: "2026-10-30",
        bookings: [
          { ...booking("2026-11-02", "08:00"), startTime: new Date("2026-11-02T08:00:00-05:00") },
          { ...booking("2026-11-05", "08:00"), startTime: new Date("2026-11-05T08:00:00-05:00") },
        ],
      }),
    );
    expect(c.findings).toEqual([]);
    expect(c.slots).toBe(2);
  });
});

describe("checkWeek — what differs", () => {
  it("names an open slot: the regular isn't booked for it", () => {
    const c = checkWeek(input({ bookings: [booking("2026-10-01", "08:00")] }));
    expect(c.findings).toHaveLength(1);
    expect(c.findings[0]).toMatchObject({ kind: "open", dateKey: "2026-09-28", start: "08:00", clientId: "c-judy", trainerId: "t-sam" });
    expect(isFreeSlot(c.findings[0])).toBe(true);
    expect(findingSentence(c.findings[0], TZ)).toBe("Sam's Mon, Sep 28 at 8:00 AM is open: Judy Smith isn't booked for it.");
  });

  it("counts a cancelled booking as no booking", () => {
    const c = checkWeek(input({ bookings: [booking("2026-09-28", "08:00", { status: "Cancelled" }), booking("2026-10-01", "08:00")] }));
    expect(c.findings.map((f) => f.kind)).toEqual(["open"]);
  });

  it("names a move within the Monday–Sunday week, and the trainer's slot is free", () => {
    const c = checkWeek(input({ bookings: [booking("2026-09-29", "09:30"), booking("2026-10-01", "08:00")] }));
    expect(c.findings[0]).toMatchObject({ kind: "moved", movedTo: { dateKey: "2026-09-29", start: "09:30", sameTrainer: true } });
    expect(isFreeSlot(c.findings[0])).toBe(true);
    expect(findingSentence(c.findings[0], TZ)).toBe("Sam's Mon, Sep 28 at 8:00 AM is open: Judy Smith is booked on Tue, Sep 29 at 9:30 AM instead.");
  });

  it("says who she is booked with when the move is to another trainer", () => {
    const c = checkWeek(input({ bookings: [booking("2026-09-28", "08:00", { trainerId: "t-pat", trainerName: "Pat Doe" }), booking("2026-10-01", "08:00")] }));
    expect(c.findings[0].kind).toBe("moved");
    expect(findingSentence(c.findings[0], TZ)).toBe("Sam's Mon, Sep 28 at 8:00 AM is open: Judy Smith is booked with Pat on Mon, Sep 28 at 8:00 AM instead.");
  });

  it("names someone else booked in the slot, which is then not free", () => {
    const c = checkWeek(
      input({ bookings: [booking("2026-09-28", "08:00", { clientId: "c-bob", clientName: "Bob Jones" }), booking("2026-10-01", "08:00")] }),
    );
    expect(c.findings[0]).toMatchObject({ kind: "taken", takenBy: { clientName: "Bob Jones" } });
    expect(isFreeSlot(c.findings[0])).toBe(false);
    expect(findingSentence(c.findings[0], TZ)).toBe("Bob Jones is booked in Judy Smith's Mon, Sep 28 at 8:00 AM slot with Sam. Judy Smith isn't booked for it.");
  });

  it("uses one booking for one slot only", () => {
    // Thursday's booking cannot also keep Monday's slot as "moved" when it keeps Thursday's own.
    const c = checkWeek(input({ bookings: [booking("2026-10-01", "08:00")] }));
    expect(c.findings.map((f) => f.kind)).toEqual(["open"]);
  });
});

describe("checkWeek — when it says nothing", () => {
  it("never calls a slot open on a read that failed or hasn't finished", () => {
    expect(checkWeek(input({ read: "failed", bookings: [] }))).toMatchObject({ state: "failed", findings: [] });
    expect(checkWeek(input({ read: "loading", bookings: [] }))).toMatchObject({ state: "loading", findings: [] });
  });

  it("says the week can't be checked where Mindbody isn't connected", () => {
    const c = checkWeek(input({ connected: false, bookings: [] }));
    expect(c).toMatchObject({ state: "unconnected", findings: [] });
    expect(stateSentence(c)).toBe("Mindbody isn't connected for this studio, so the week can't be checked against bookings.");
  });

  it("checks only an AGREED week: a proposal alone is not checked", () => {
    expect(checkWeek(input({ docs: [sam({ final: null })], bookings: [] })).state).toBe("nothing-agreed");
  });
});

describe("mondayOf", () => {
  it("is the Monday that starts the day's week", () => {
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
    expect(mondayOf("2026-10-04")).toBe("2026-09-28");
    expect(mondayOf("2026-10-01")).toBe("2026-09-28");
  });
});
