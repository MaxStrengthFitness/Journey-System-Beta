import { describe, expect, it } from "vitest";
import type { ScheduleEntry, Trainer } from "../../types";
import { awaySentence, awayThisWeek, checkWeek, findingSentence, isFreeSlot, mondayOf, staffIdsAt, stateSentence, type WeekCheckInput } from "./check";
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
    expect(c).toEqual({ state: "ready", findings: [], slots: 2, awaySlots: 0 });
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

  it("never calls another booking that week her move without proof", () => {
    // Her Tuesday booking may have been there all along (AJ, Sep 26: "rebooked"
    // only for a real rebook). The slot is open; nothing is said about Tuesday.
    const c = checkWeek(input({ bookings: [booking("2026-09-29", "09:30", { createdAt: new Date("2026-09-01T12:00:00Z") }), booking("2026-10-01", "08:00")] }));
    expect(c.findings[0]).toMatchObject({ kind: "open" });
    expect(c.findings[0]).not.toHaveProperty("movedTo");
    expect(findingSentence(c.findings[0], TZ)).toBe("Sam's Mon, Sep 28 at 8:00 AM is open: Judy Smith isn't booked for it.");
  });

  it("names the move when Mindbody moved that very booking", () => {
    const moved = booking("2026-09-29", "09:30", { movedFromDay: "2026-09-28", movedFromStart: new Date("2026-09-28T08:00:00-04:00") });
    const c = checkWeek(input({ bookings: [moved, booking("2026-10-01", "08:00")] }));
    expect(c.findings[0]).toMatchObject({ kind: "moved", movedTo: { dateKey: "2026-09-29", start: "09:30", sameTrainer: true } });
    expect(isFreeSlot(c.findings[0])).toBe(true);
    expect(findingSentence(c.findings[0], TZ)).toBe("Sam's Mon, Sep 28 at 8:00 AM is open: Judy Smith is booked on Tue, Sep 29 at 9:30 AM instead.");
  });

  it("names a rebook after a cancellation only when the new booking came with it", () => {
    const cancelled = booking("2026-09-28", "08:00", { status: "Cancelled", cancelledAt: new Date("2026-09-25T14:00:00Z") });
    const rebook = booking("2026-09-30", "10:00", { createdAt: new Date("2026-09-25T13:30:00Z") });
    const real = checkWeek(input({ bookings: [cancelled, rebook, booking("2026-10-01", "08:00")] }));
    expect(real.findings[0]).toMatchObject({ kind: "moved", movedTo: { dateKey: "2026-09-30", start: "10:00" } });
    // The same booking, made weeks before the cancellation: her standing one, not a rebook.
    const standing = { ...rebook, createdAt: new Date("2026-09-01T12:00:00Z") };
    expect(checkWeek(input({ bookings: [cancelled, standing, booking("2026-10-01", "08:00")] })).findings[0].kind).toBe("open");
    // A cancellation Journey never saw happen (no stamp) proves nothing either.
    const unstamped = { ...cancelled, cancelledAt: null };
    expect(checkWeek(input({ bookings: [unstamped, rebook, booking("2026-10-01", "08:00")] })).findings[0].kind).toBe("open");
    // Nor does a booking that had already happened when she cancelled: nobody rebooks into the past.
    const lateCancel = { ...cancelled, cancelledAt: new Date("2026-09-29T16:00:00Z") };
    const already = booking("2026-09-29", "09:30", { createdAt: new Date("2026-09-29T06:00:00Z") });
    expect(checkWeek(input({ bookings: [lateCancel, already, booking("2026-10-01", "08:00")] })).findings[0].kind).toBe("open");
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

  it("reads a booking the sync matched by name only as the named trainer's", () => {
    // The sync keeps the Mindbody staff name when it matched no Journey trainer.
    const byName = checkWeek(input({ bookings: [booking("2026-09-28", "08:00", { trainerId: undefined, trainerName: "sam lee" }), booking("2026-10-01", "08:00")] }));
    expect(byName.findings).toEqual([]);
  });

  it("never says a booking naming no staff member takes a slot", () => {
    const rotation = { trainerId: undefined, trainerName: "Solon Rotation" };
    expect(checkWeek(input({ bookings: [booking("2026-09-28", "08:00", rotation), booking("2026-10-01", "08:00")] })).findings).toEqual([]);
    const c = checkWeek(input({ bookings: [booking("2026-09-28", "08:00", { ...rotation, clientId: "c-bob", clientName: "Bob Jones" }), booking("2026-10-01", "08:00")] }));
    expect(c.findings.map((f) => f.kind)).toEqual(["open"]);
  });

  it("matches a booking the sync didn't link to a client by the client's name", () => {
    const unlinked = checkWeek(input({ bookings: [booking("2026-09-28", "08:00", { clientId: undefined, clientName: "Judy  Smith " }), booking("2026-10-01", "08:00")] }));
    expect(unlinked.findings).toEqual([]);
  });

  it("uses one booking for one slot only", () => {
    // Thursday's booking cannot also keep Monday's slot as "moved" when it keeps Thursday's own.
    const c = checkWeek(input({ bookings: [booking("2026-10-01", "08:00")] }));
    expect(c.findings.map((f) => f.kind)).toEqual(["open"]);
  });
});

describe("checkWeek — only what it knows (voice review follow-up)", () => {
  it("names one rebook for one slot only", () => {
    // Monday's and Thursday's 8:00 are both cancelled on Sunday afternoon, and
    // the desk books ONE session for Wednesday with them: it is Monday's move;
    // Thursday is simply open.
    const stamp = new Date("2026-09-27T18:00:00Z");
    const c = checkWeek(
      input({
        bookings: [
          booking("2026-09-28", "08:00", { status: "Cancelled", cancelledAt: stamp }),
          booking("2026-10-01", "08:00", { status: "Cancelled", cancelledAt: stamp }),
          booking("2026-09-30", "10:00", { createdAt: new Date("2026-09-27T17:45:00Z") }),
        ],
      }),
    );
    expect(c.findings.map((f) => [f.dateKey, f.kind, f.movedTo?.dateKey ?? null])).toEqual([
      ["2026-09-28", "moved", "2026-09-30"],
      ["2026-10-01", "open", null],
    ]);
    expect(findingSentence(c.findings[1], TZ)).toBe("Sam's Thu, Oct 1 at 8:00 AM is open: Judy Smith isn't booked for it.");
  });

  it("keeps the slot for a staff member Journey couldn't link, whose name differs", () => {
    // Journey says Sam Lee; Mindbody says Samuel Lee, so the sync kept the
    // Mindbody name and no trainer id. That proves nothing: the slot is kept.
    const samuel = { trainerId: undefined, trainerName: "Samuel Lee" };
    const c = checkWeek(input({ bookings: [booking("2026-09-28", "08:00", samuel), booking("2026-10-01", "08:00", samuel)] }));
    expect(c.findings).toEqual([]);
    // Elsewhere, named as a proven move, the name is said as Mindbody has it.
    const moved = booking("2026-09-29", "09:30", { ...samuel, movedFromDay: "2026-09-28", movedFromStart: new Date("2026-09-28T08:00:00-04:00") });
    const m = checkWeek(input({ bookings: [moved, booking("2026-10-01", "08:00")] }));
    expect(findingSentence(m.findings[0], TZ)).toBe("Sam's Mon, Sep 28 at 8:00 AM is open: Judy Smith is booked with Samuel on Tue, Sep 29 at 9:30 AM instead.");
  });

  it("takes a Mindbody staff id as proof it IS the trainer's, never that it isn't", () => {
    const staffIds = { "t-sam": "100000042" };
    // A guest's booking the sync couldn't link, under another name: the staff id says it is Sam's,
    // so another client booked with him in Judy's slot takes it.
    const same = { trainerId: undefined, trainerName: "Samuel Lee", mindbodyStaffId: "100000042" } as Partial<ScheduleEntry>;
    expect(checkWeek(input({ staffIds, bookings: [booking("2026-09-28", "08:00", same), booking("2026-10-01", "08:00")] })).findings).toEqual([]);
    const bob = checkWeek(
      input({ staffIds, bookings: [booking("2026-09-28", "08:00", { ...same, clientId: "c-bob", clientName: "Bob Jones" }), booking("2026-10-01", "08:00")] }),
    );
    expect(bob.findings.map((f) => f.kind)).toEqual(["taken"]);
    // Another staff id proves nothing: staff ids are numbered per site, and Sam's one id may be
    // the other site's. With no trainer id on the booking, it keeps the slot at her time.
    const other = { trainerId: undefined, trainerName: "Samuel Lee", mindbodyStaffId: "100000077" } as Partial<ScheduleEntry>;
    expect(checkWeek(input({ staffIds, bookings: [booking("2026-09-28", "08:00", other), booking("2026-10-01", "08:00")] })).findings).toEqual([]);
    const named = { ...other, trainerName: "Sam Lee" } as Partial<ScheduleEntry>;
    expect(checkWeek(input({ staffIds, bookings: [booking("2026-09-28", "08:00", named), booking("2026-10-01", "08:00")] })).findings).toEqual([]);
  });

  it("lets the booking's trainer id decide over any staff id (a trainer on both Mindbody sites)", () => {
    // Sam works at a studio on the other Mindbody site too. The sync matched him there (trainer
    // id), and the webhook kept that site's staff id, which isn't the one on his profile.
    const staffIds = { "t-sam": "100000042" };
    const otherSite = { trainerId: "t-sam", trainerName: "Sam Lee", mindbodyStaffId: "7" } as Partial<ScheduleEntry>;
    expect(checkWeek(input({ staffIds, bookings: [booking("2026-09-28", "08:00", otherSite), booking("2026-10-01", "08:00")] })).findings).toEqual([]);
    // Bob booked with him in Judy's slot there takes it, as it would anywhere.
    const bob = checkWeek(
      input({ staffIds, bookings: [booking("2026-09-28", "08:00", { ...otherSite, clientId: "c-bob", clientName: "Bob Jones" }), booking("2026-10-01", "08:00")] }),
    );
    expect(bob.findings.map((f) => f.kind)).toEqual(["taken"]);
    // And another trainer id is someone else's, whatever staff id the row carries.
    const pat = { trainerId: "t-pat", trainerName: "Pat Doe", mindbodyStaffId: "100000042" } as Partial<ScheduleEntry>;
    const moved = checkWeek(input({ staffIds, bookings: [booking("2026-09-28", "08:00", pat), booking("2026-10-01", "08:00")] }));
    expect(moved.findings.map((f) => f.kind)).toEqual(["moved"]);
  });

  it("reads the rotation as usual when the webhook wrote it, with the rotation's own staff id", () => {
    // The webhook keeps the rotation's Mindbody staff id beside its name; Sam has an id of his own.
    const judyWed = { id: "r3", weekday: 3, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" };
    const wednesdays = sam({ final: { hours: [{ weekday: 3, from: "07:00", to: "13:00" }], regulars: [judyWed] } });
    const staffIds = { "t-sam": "100000042" };
    for (const trainerName of ["Solon Rotation", "Rotation", "Studio  rotation"]) {
      const rotation = { trainerId: null, trainerName, mindbodyStaffId: "100000099" } as unknown as Partial<ScheduleEntry>;
      const c = checkWeek(
        input({
          docs: [wednesdays],
          staffIds,
          bookings: [booking("2026-09-30", "08:00", rotation), booking("2026-09-30", "08:00", { ...rotation, clientId: "c-bob", clientName: "Bob Jones" })],
        }),
      );
      expect(c).toEqual({ state: "ready", findings: [], slots: 1, awaySlots: 0 });
    }
    // A rotation under a name Journey doesn't recognise still keeps her slot: an unlinked staff
    // member at her time proves nothing, and takes nothing.
    const unnamed = { trainerId: null, trainerName: "Wednesday Team", mindbodyStaffId: "100000099" } as unknown as Partial<ScheduleEntry>;
    expect(checkWeek(input({ docs: [wednesdays], staffIds, bookings: [booking("2026-09-30", "08:00", unnamed)] })).findings).toEqual([]);
    const bobOnly = checkWeek(
      input({ docs: [wednesdays], staffIds, bookings: [booking("2026-09-30", "08:00", { ...unnamed, clientId: "c-bob", clientName: "Bob Jones" })] }),
    );
    expect(bobOnly.findings.map((f) => f.kind)).toEqual(["open"]);
  });

  it("reads the studio rotation as usual: never moved, never taken, never a Free slot", () => {
    // AJ: on rotation days a client books "{studio} Rotation", and whoever
    // works that day moves the session to themselves in Mindbody later.
    const judyWed = { id: "r3", weekday: 3, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" };
    const wednesdays = sam({ final: { hours: [{ weekday: 3, from: "07:00", to: "13:00" }], regulars: [judyWed] } });
    const rotation = { trainerId: undefined, trainerName: "Solon Rotation" };
    const c = checkWeek(
      input({
        docs: [wednesdays],
        bookings: [
          booking("2026-09-30", "08:00", rotation),
          // Another client on the rotation at the same time takes nothing either.
          booking("2026-09-30", "08:00", { ...rotation, clientId: "c-bob", clientName: "Bob Jones" }),
        ],
      }),
    );
    expect(c).toEqual({ state: "ready", findings: [], slots: 1, awaySlots: 0 });
    expect(stateSentence(c)).toBe("All 1 agreed slot is booked as usual for the next seven days.");
  });

  it("never says another regular in their own slot at a shared time takes it", () => {
    // Judy and Bob both train with Sam on Mondays at 8:00. Bob is booked; Judy isn't.
    const bobMon = { id: "r9", weekday: 1, start: "08:00", clientId: "c-bob", clientName: "Bob Jones" };
    const shared = sam({ final: { hours: agreed.hours, regulars: [judyMon, bobMon] } });
    const c = checkWeek(input({ docs: [shared], bookings: [booking("2026-09-28", "08:00", { clientId: "c-bob", clientName: "Bob Jones" })] }));
    expect(c.findings).toHaveLength(1);
    expect(c.findings[0]).toMatchObject({ kind: "open", clientId: "c-judy" });
    expect(c.findings[0]).not.toHaveProperty("takenBy");
  });

  it("leaves a slot earlier today simply open", () => {
    // AJ: "Unbooked slots are just open." Nothing special for a slot already past.
    const c = checkWeek(input({ bookings: [booking("2026-10-01", "08:00")] }));
    expect(c.findings[0]).toMatchObject({ kind: "open", dateKey: TODAY });
    expect(isFreeSlot(c.findings[0])).toBe(true);
  });
});

describe("checkWeek — away (voice review follow-up)", () => {
  // AJ: "if someone has a vacation then it should block it out."
  const vacation = { id: "a1", from: "2026-09-28", to: "2026-09-30" };

  it("never checks a trainer's slots on the days they are away", () => {
    // Monday is inside the vacation: Judy's missing Monday is not an open slot,
    // and Pat covering her is not a move. Thursday is checked as usual.
    const c = checkWeek(
      input({
        docs: [sam({ away: [vacation] })],
        bookings: [booking("2026-09-28", "08:00", { trainerId: "t-pat", trainerName: "Pat Doe" }), booking("2026-10-01", "08:00")],
      }),
    );
    expect(c).toEqual({ state: "ready", findings: [], slots: 1, awaySlots: 1 });
    expect(stateSentence(c)).toBe("All 1 agreed slot is booked as usual for the next seven days.");
    // Nor is anyone "taking" a slot of theirs while they are away.
    const taken = checkWeek(input({ docs: [sam({ away: [vacation] })], bookings: [booking("2026-09-28", "08:00", { clientId: "c-bob", clientName: "Bob Jones" })] }));
    expect(taken.findings.map((f) => f.dateKey)).toEqual(["2026-10-01"]);
  });

  it("says there is nothing else to check when every agreed slot falls on days away", () => {
    // Monday and Thursday both inside the vacation: the regulars fall in the window, unchecked.
    const c = checkWeek(input({ docs: [sam({ away: [{ id: "a1", from: "2026-09-28", to: "2026-10-02" }] })], bookings: [] }));
    expect(c).toEqual({ state: "ready", findings: [], slots: 0, awaySlots: 2 });
    expect(stateSentence(c)).toBe("Nothing else to check: the agreed slots in the next seven days fall on days away.");
    // With no regular in the window at all, it says so.
    const none = checkWeek(input({ docs: [sam({ final: { hours: agreed.hours, regulars: [] } })], bookings: [] }));
    expect(stateSentence(none)).toBe("No agreed regular falls in the next seven days.");
  });

  it("says once who is away in the window, agreed or not", () => {
    const ann = { ...sam(), id: "uid-ann", trainerId: "t-ann", trainerName: "Ann Park", final: null, away: [{ id: "a9", from: "2026-10-03", to: "2026-10-03" }] };
    const later = { id: "a2", from: "2026-10-12", to: "2026-10-16" };
    const earlier = { id: "a0", from: "2026-09-21", to: "2026-09-25" };
    const notes = awayThisWeek([sam({ away: [earlier, vacation, later] }), ann], TODAY);
    expect(notes).toEqual([
      { trainerId: "t-ann", trainerName: "Ann Park", from: "2026-10-03", to: "2026-10-03" },
      { trainerId: "t-sam", trainerName: "Sam Lee", from: "2026-09-28", to: "2026-09-30" },
    ]);
    expect(notes.map((n) => awaySentence(n, TODAY, TZ))).toEqual(["Ann is away on Sat, Oct 3.", "Sam is away Mon, Sep 28 – Wed, Sep 30."]);
    // A vacation that began last week reads "until".
    expect(awaySentence({ trainerId: "t-sam", trainerName: "Sam Lee", from: "2026-09-21", to: "2026-10-02" }, TODAY, TZ)).toBe("Sam is away until Fri, Oct 2.");
  });
});

describe("checkWeek — when it says nothing", () => {
  it("never calls a slot open on a read that failed or hasn't finished", () => {
    expect(checkWeek(input({ read: "failed", bookings: [] }))).toMatchObject({ state: "failed", findings: [] });
    expect(checkWeek(input({ read: "loading", bookings: [] }))).toMatchObject({ state: "loading", findings: [] });
  });

  it("says it can't tell when the iPad is offline", () => {
    const c = checkWeek(input({ read: "offline", bookings: [] }));
    expect(c).toMatchObject({ state: "offline", findings: [] });
    expect(stateSentence(c)).toBe(
      "Can't tell: this iPad can't reach the week's bookings just now, so nothing here says a slot is open. It checks again once it's back online.",
    );
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

describe("staffIdsAt", () => {
  const t = (id: string, staffId: string | undefined, siteId: string | undefined) =>
    ({ id, mindbodyStaffId: staffId, mindbody: siteId === undefined ? undefined : { staffId: staffId ?? "", siteId } }) as Pick<
      Trainer,
      "id" | "mindbodyStaffId" | "mindbody"
    >;

  it("keeps a trainer's staff id only where their Mindbody record names this studio's site", () => {
    const trainers = [t("t-sam", " 100000042 ", "29068"), t("t-ann", "5", "5746957"), t("t-pat", "9", undefined), t("t-kim", undefined, "29068")];
    // Westlake, Strongsville and Willoughby share site 29068; Solon is 5746957.
    expect(staffIdsAt(trainers, "29068")).toEqual({ "t-sam": "100000042" });
    expect(staffIdsAt(trainers, 5746957)).toEqual({ "t-ann": "5" });
    // A studio with no site (the Demo studio, an unlinked one) matches on nobody's staff id.
    expect(staffIdsAt(trainers, undefined)).toEqual({});
    expect(staffIdsAt(trainers, "")).toEqual({});
  });
});

describe("mondayOf", () => {
  it("is the Monday that starts the day's week", () => {
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
    expect(mondayOf("2026-10-04")).toBe("2026-09-28");
    expect(mondayOf("2026-10-01")).toBe("2026-09-28");
  });
});
