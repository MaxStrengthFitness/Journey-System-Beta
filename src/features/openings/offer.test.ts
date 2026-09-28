import { describe, expect, it } from "vitest";
import type { ScheduleEntry } from "../../types";
import { normalizeMark } from "./marks";
import { OFFER_AHEAD_WEEKS, comingRange, offers, type OfferInput } from "./offer";
import type { UsualTime, UsualWord } from "./usual";
import { TRAINERS, TZ, at, booking, pat, standingWeek } from "./fixtures";

/**
 * Today is Monday Nov 9 2026, 6:00 AM. Tuesday 10:30 AM usually has room.
 * Sam and Pat both take clients Tuesdays 9:00 - 12:00; Judy is Sam's Tuesday
 * 10:30 regular, so only Pat can offer it for good. This Tuesday is Nov 10;
 * the coming Tuesdays on file are Nov 17, Nov 24 and Dec 1.
 */
const TODAY = "2026-11-09";
const NOW = at(TODAY, "06:00");
const tuesday = [{ weekday: 2, from: "09:00", to: "12:00" }];
const judy = { id: "r1", weekday: 2, start: "10:30", clientId: "c-judy", clientName: "Judy Smith" };
const SAM = standingWeek({ final: { hours: tuesday, regulars: [judy] } });
const PAT = standingWeek({ id: "uid-pat", trainerUid: "uid-pat", trainerId: "t-pat", trainerName: "Pat Moss", final: { hours: tuesday, regulars: [] } });

const usualOf = (entries: [string, UsualWord][]) => new Map(entries.map(([key, word]) => [key, { key, word, room: 6, judged: 8 } as UsualTime]));
const USUAL = usualOf([["2-1030", "usually-room"], ["2-0900", "mixed"], ["2-1100", "always-full"]]);

const input = (over: Partial<OfferInput> = {}): OfferInput => ({
  today: TODAY,
  now: NOW,
  tz: TZ,
  usual: USUAL,
  marks: null,
  docs: [SAM, PAT],
  trainers: TRAINERS,
  forTrainer: null,
  thisWeek: { read: "ready", bookings: [] },
  coming: { read: "ready", bookings: [] },
  monthRead: true,
  ...over,
});
const keys = (i: OfferInput) => offers(i).map((o) => o.key);

describe("the numbers", () => {
  it("free on the next 3 weeks on file, read as days 7 to 27", () => {
    expect(OFFER_AHEAD_WEEKS).toBe(3);
    expect(comingRange(TODAY)).toEqual({ from: "2026-11-16", to: "2026-12-06" });
  });
});

describe("offers", () => {
  it("a time that usually has room, free on the coming weeks, with who could take it for good", () => {
    const [o] = offers(input());
    expect(o).toMatchObject({ key: "2-1030", weekday: 2, row: 630, who: ["t-pat"], coming: { state: "free", days: ["2026-11-17", "2026-11-24", "2026-12-01"] }, thisWeek: { day: "2026-11-10", state: "room" } });
    expect(keys(input())).toEqual(["2-1030"]);
  });

  it("an agreed regular at the time: not the trainer's to offer; under Anyone, left out when every trainer in has one", () => {
    expect(keys(input({ forTrainer: "t-sam" }))).toEqual([]);
    expect(keys(input({ forTrainer: "t-pat" }))).toEqual(["2-1030"]);
    const patToo = standingWeek({ ...PAT, final: { hours: tuesday, regulars: [{ ...judy, id: "r2", start: "10:40", clientId: "c-ann" }] } });
    expect(keys(input({ docs: [SAM, patToo] }))).toEqual([]);
    // Nobody usually takes clients then any more: nothing to offer.
    expect(keys(input({ docs: [] }))).toEqual([]);
  });

  it("a time booked on one of the coming weeks is left out", () => {
    expect(keys(input({ coming: { read: "ready", bookings: [pat("2026-11-24", "10:30")] } }))).toEqual([]);
    // A booking of Sam's there doesn't take Pat's time.
    expect(keys(input({ coming: { read: "ready", bookings: [booking("2026-11-24", "10:30")] } }))).toEqual(["2-1030"]);
    // A rotation booking or one Journey can't place might be Pat's.
    const rota = booking("2026-11-24", "10:30", { trainerId: undefined, trainerName: "Westlake Rotation" });
    const unplaced = booking("2026-11-24", "10:30", { trainerId: undefined, trainerName: "P. Moss" });
    expect(keys(input({ coming: { read: "ready", bookings: [rota] } }))).toEqual([]);
    expect(keys(input({ coming: { read: "ready", bookings: [unplaced] } }))).toEqual([]);
  });

  it("away on one of the coming weeks: not free for good", () => {
    const away = standingWeek({ ...PAT, away: [{ id: "a1", from: "2026-11-24", to: "2026-11-24" }] });
    expect(keys(input({ docs: [SAM, away] }))).toEqual([]);
  });

  it("an Unavailable block of Pat's on one coming Tuesday: not free for good; a cancelled one blocks nothing", () => {
    const block = pat("2026-11-24", "10:30", { clientName: "Unavailable", clientId: undefined });
    expect(keys(input({ coming: { read: "ready", bookings: [block] } }))).toEqual([]);
    expect(keys(input({ coming: { read: "ready", bookings: [{ ...block, status: "Cancelled" }] } }))).toEqual(["2-1030"]);
    // This Tuesday's block: the time is still offered for good, and this week reads full.
    const thisTuesday = pat("2026-11-10", "10:30", { clientName: "Unavailable", clientId: undefined });
    expect(offers(input({ thisWeek: { read: "ready", bookings: [thisTuesday] } }))[0].thisWeek).toEqual({ day: "2026-11-10", state: "full" });
  });

  it("can't check the coming weeks until the month is read, and says it is checking while they are read", () => {
    expect(offers(input({ monthRead: false }))[0].coming.state).toBe("cant-check");
    expect(offers(input({ coming: null }))[0].coming.state).toBe("checking");
    expect(offers(input({ coming: { read: "loading", bookings: [] } }))[0].coming.state).toBe("checking");
    expect(offers(input({ coming: { read: "offline", bookings: [] } }))[0].coming.state).toBe("cant-check");
  });

  it("this week beside it: room, full, can't tell, or gone once it has passed", () => {
    const full = (b: ScheduleEntry[]) => offers(input({ thisWeek: { read: "ready", bookings: b } }))[0].thisWeek;
    expect(full([pat("2026-11-10", "10:30")])).toEqual({ day: "2026-11-10", state: "full" });
    expect(offers(input({ thisWeek: { read: "offline", bookings: [] } }))[0].thisWeek?.state).toBe("cant-tell");
    expect(offers(input({ today: "2026-11-10", now: at("2026-11-10", "11:00") }))[0].thisWeek).toBeNull();
  });

  it("marks: Always full is never offered; Usually has room is", () => {
    const mark = (key: string, time: string, word: "full" | "room") => normalizeMark(key, { weekday: 2, time, mark: word, by: { id: "uid-jo", name: "Jo" }, at: new Date() })!;
    expect(keys(input({ marks: new Map([["2-1030", mark("2-1030", "10:30", "full")]]) }))).toEqual([]);
    expect(keys(input({ marks: new Map([["2-0900", mark("2-0900", "09:00", "room")]]) }))).toEqual(["2-0900", "2-1030"]);
    // A time that reads Always full is never offered, marked or not.
    expect(keys(input({ marks: new Map([["2-1100", mark("2-1100", "11:00", "room")]]) }))).toEqual(["2-1030"]);
  });
});
