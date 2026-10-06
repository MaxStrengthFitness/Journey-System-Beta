/**
 * The Hub engine's shortcuts say exactly what the long way says (speed
 * round, Oct 5 2026, R6). Run with TZ=America/New_York.
 *
 *   - `indexBookings`: a pass over the index is the pass over every booking;
 *   - `celebratesOn`: the strip's dot is `momentsToday(...).some(celebrate)`;
 *   - `bookingBoundaries` + `clockStep`: between two boundaries every entry
 *     reads the same, so the Hub may skip a minute tick that passes none.
 */
import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry } from "../../types";
import { loggedSessions } from "../../lib/booking-state";
import { studioDayBoundsForKey } from "../../lib/studio-time";
import { addDays } from "../client-history/model";
import { buildDirectoryRows } from "../client-directory/row";
import { STUDIOS, TODAY, eastern, makeBooking, makeClient, makeContext, makeSession } from "../client-directory/fixtures";
import {
  bookingBoundaries,
  celebratesOn,
  clockStep,
  hasFamily,
  indexBookings,
  momentsToday,
  type MomentsTodayInput,
} from "./moments-today";

const TZ = "America/New_York";
const DAYS = Array.from({ length: 9 }, (_, i) => addDays(TODAY, i - 1));

/* A studio with milestones close, birthdays across the week, visitors and Unavailable blocks. */
function studio(): { clients: Client[]; schedules: ScheduleEntry[] } {
  const clients: Client[] = [];
  for (let i = 0; i < 40; i++) {
    const month = 9 + Math.floor(i / 20); // late September and October birthdays
    const day = ((i * 3) % 28) + 1;
    clients.push(
      makeClient({
        id: `c${i}`,
        firstName: `F${i}`,
        lastName: `L${i}`,
        // Around 50 and 100: milestones land on some days and not others.
        sessionCount: [47, 48, 49, 97, 98, 99, 148, 12][i % 8],
        clientsNumberOfVisitsAtSite: i % 5 === 0 ? 300 : 2,
        // A few birthdays, so some days have one and some don't.
        dateOfBirth: i % 9 === 4 ? `19${50 + (i % 40)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : undefined,
      } as Partial<Client> & { id: string }),
    );
  }
  const schedules: ScheduleEntry[] = [];
  DAYS.forEach((day, d) => {
    for (let j = 0; j < 14; j++) {
      const c = clients[(d * 7 + j * 3) % clients.length];
      const hh = String(6 + j).padStart(2, "0");
      schedules.push(makeBooking({ clientId: c.id as string, clientName: `F L`, start: eastern(day, `${hh}:${j % 2 ? "30" : "00"}`), minutes: j % 5 === 0 ? 45 : 30 }));
    }
    schedules.push(makeBooking({ clientId: "", clientName: "Unavailable", start: eastern(day, "12:00") }));
    schedules.push(makeBooking({ clientId: "visitor", clientName: "A Visitor", start: eastern(day, "13:00") }));
    schedules.push(makeBooking({ clientId: clients[d].id as string, start: eastern(day, "19:00"), status: "Cancelled" }));
  });
  return { clients, schedules };
}

function inputAt(now: Date, day: string, withIndex: boolean): MomentsTodayInput {
  const { clients, schedules } = fixture;
  return {
    day,
    today: TODAY,
    now,
    tz: TZ,
    schedules,
    index: withIndex ? index : undefined,
    clientsById,
    rowsById,
    studios: STUDIOS,
    logged: loggedSessions([makeSession({ clientId: "c3", at: eastern(TODAY, "08:05") })]),
    criticalFor: () => [],
    myIds: ["t-me"],
    myName: "Sam Rivera",
  };
}

const fixture = studio();
const index = indexBookings(fixture.schedules, TZ);
const clientsById = new Map(fixture.clients.map((c) => [c.id as string, c]));
const rowsById = new Map(buildDirectoryRows(fixture.clients, makeContext({ schedules: fixture.schedules })).map((r) => [r.id, r]));
/** The entries without the objects they carry, for comparing what they SAY. */
const said = (input: MomentsTodayInput) => JSON.stringify(momentsToday(input).map(({ booking: _b, client: _c, ...rest }) => rest));

describe("indexBookings", () => {
  it("a day's pass over the index says what the pass over every booking says", () => {
    for (const hm of ["07:10", "09:45", "13:00", "18:20"]) {
      const now = eastern(TODAY, hm);
      for (const day of DAYS) expect(said(inputAt(now, day, true))).toBe(said(inputAt(now, day, false)));
    }
  });

  it("leaves out cancelled bookings and Unavailable blocks", () => {
    for (const list of index.byDay.values()) {
      expect(list.some((b) => b.status === "Cancelled" || /unavailab/i.test(b.clientName ?? ""))).toBe(false);
    }
  });
});

describe("celebratesOn", () => {
  it("is the engine's own answer for every day, at every hour", () => {
    let yes = 0;
    let no = 0;
    for (const hm of ["06:00", "08:31", "12:05", "20:00"]) {
      const now = eastern(TODAY, hm);
      for (const day of DAYS) {
        for (const withIndex of [true, false]) {
          const input = inputAt(now, day, withIndex);
          const long = momentsToday(input).some((e) => hasFamily(e, "celebrate"));
          expect(celebratesOn(input, day), `${day} at ${hm}`).toBe(long);
          if (long) yes += 1;
          else no += 1;
        }
      }
    }
    // The fixture really has both kinds of day.
    expect(yes).toBeGreaterThan(0);
    expect(no).toBeGreaterThan(0);
  });
});

describe("the engine's clock", () => {
  it("between two boundaries every day's entries read the same; across one they may not", () => {
    const boundaries = bookingBoundaries(fixture.schedules);
    let checked = 0;
    let moved = 0;
    for (let m = 5 * 60; m < 22 * 60; m += 11) {
      const a = eastern(TODAY, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
      const b = new Date(a.getTime() + 60_000);
      const same = clockStep(boundaries, a.getTime()) === clockStep(boundaries, b.getTime());
      for (const day of [TODAY, DAYS[3]]) {
        const sa = said({ ...inputAt(a, day, true), now: a });
        const sb = said({ ...inputAt(b, day, true), now: a }); // the clock held at a
        const sNow = said({ ...inputAt(b, day, true), now: b });
        if (same) {
          // The held clock and the real one say the same thing.
          expect(sNow).toBe(sb);
          checked += 1;
        } else if (sNow !== sa) moved += 1;
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(moved).toBeGreaterThan(0);
  }, 60_000);

  it("clockStep counts the boundaries at or before now", () => {
    expect(clockStep([], 5)).toBe(0);
    expect(clockStep([1, 2, 5, 9], 5)).toBe(3);
    expect(clockStep([1, 2, 5, 9], 4)).toBe(2);
    expect(clockStep([1, 2, 5, 9], 10)).toBe(4);
  });
});

describe("the directory rows, built once at the start of the studio's day", () => {
  /*
   * use-day-moments builds the rows once per studio day, as of its first
   * instant, so a row's clock fields (`next`, `today`) are the morning's. The
   * engine must read none of them: at any time of day, the morning's rows and
   * rows built at that very moment give the same entries (review of R6).
   */
  const finished = [makeSession({ clientId: "c3", at: eastern(TODAY, "08:05") })];
  const rowsAt = (now: Date) =>
    new Map(
      buildDirectoryRows(
        fixture.clients,
        makeContext({ now, schedules: fixture.schedules, bookingsFresh: false, recentSessions: finished }),
      ).map((r) => [r.id, r]),
    );
  const morning = rowsAt(studioDayBoundsForKey(TODAY).start);

  it("the morning's rows and rows built at the moment say the same, all day, every day of the window", () => {
    let rowsDiffered = 0;
    for (const hm of ["06:10", "08:31", "09:45", "13:00", "16:20", "21:00"]) {
      const now = eastern(TODAY, hm);
      const fresh = rowsAt(now);
      for (const [id, row] of fresh) if (JSON.stringify(row) !== JSON.stringify(morning.get(id))) rowsDiffered += 1;
      for (const day of DAYS) {
        const base = inputAt(now, day, true);
        expect(said({ ...base, rowsById: morning }), `${day} at ${hm}`).toBe(said({ ...base, rowsById: fresh }));
      }
    }
    // The rows really do move with the clock, so the check above means something.
    expect(rowsDiffered).toBeGreaterThan(0);
  }, 60_000);
});
