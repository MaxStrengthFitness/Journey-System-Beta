import { describe, it, expect } from "vitest";
import {
  DEMO_SCHEDULE_DAYS,
  DEMO_SCHEDULE_WEEKS,
  DEMO_WEEK,
  buildDemoWeek,
  demoScheduleRunsThrough,
} from "./week";
import { buildDemoSeed } from "./seed-core";
import { DEMO_CLIENTS, DEMO_TRAINERS } from "./roster";
import { DEMO_STUDIO_ID } from "./constants";
import { addDays, weekdayOf } from "../client-history/model";
import { studioDateKey, zonedHM } from "../../lib/studio-time";
import { changesForDay } from "../admin/changes/changes";
import type { ScheduleEntry } from "../../types";

const TZ = "America/New_York";
/* A Sunday, on purpose: the run starts on the lightest day of the pattern,
   which is where an off-by-one in the occurrence numbering would show. */
const TODAY = "2026-09-20";

describe("the standing week", () => {
  it("gives every client a place on it", () => {
    const booked = new Set(DEMO_WEEK.map((s) => s.clientKey));
    for (const client of DEMO_CLIENTS) expect(booked).toContain(client.key);
  });

  it("names only trainers who have a document", () => {
    const keys = new Set(DEMO_TRAINERS.map((t) => t.key));
    for (const slot of DEMO_WEEK) expect(keys).toContain(slot.trainerKey);
  });

  it("books a standing pair three or four days apart, the way a package is sold", () => {
    for (const client of DEMO_CLIENTS) {
      const days = DEMO_WEEK.filter((s) => s.clientKey === client.key)
        .map((s) => s.weekday)
        .sort();
      /* Merry is the deliberate exception: forty-three days away is what he
         is in the roster to teach, so he has one appointment, not a pair. */
      if (client.key === "merry") {
        expect(days).toHaveLength(1);
        continue;
      }
      expect(days).toHaveLength(2);
      const gap = days[1] - days[0];
      expect(gap).toBeGreaterThanOrEqual(3);
      expect(gap).toBeLessThanOrEqual(4);
    }
  });

  it("never double-books a trainer", () => {
    const seen = new Set<string>();
    for (const slot of DEMO_WEEK) {
      const at = `${slot.weekday}@${slot.time}:${slot.trainerKey}`;
      expect(seen.has(at)).toBe(false);
      seen.add(at);
    }
  });
});

describe("laying the week down", () => {
  const bookings = buildDemoWeek(TODAY);

  it("is its own reset: the same ids, every run, whatever the day", () => {
    /*
     * The seeder has no wipe, so an id it writes today and not tomorrow is a
     * document nobody will ever clean up. Any 56-day window holds exactly
     * eight of every weekday, so the run is the same size and the same set of
     * ids no matter which day somebody presses the button.
     */
    const ids = (day: string) => buildDemoWeek(day).map((b) => b.id).sort();
    const sunday = ids(TODAY);
    for (let i = 1; i <= 6; i += 1) {
      expect(ids(addDays(TODAY, i))).toEqual(sunday);
    }
    expect(new Set(sunday).size).toBe(sunday.length);
    expect(sunday).toHaveLength(DEMO_WEEK.length * DEMO_SCHEDULE_WEEKS);
  });

  it("starts today and never lays a booking in the past", () => {
    // A past booking with no session behind it reads as a VISIT in
    // renewals/attendance.ts — the seeder would be telling the engine a
    // client came in when they did not.
    for (const b of bookings) expect(b.day >= TODAY).toBe(true);
    expect(bookings[0].day).toBe(TODAY);
    expect(demoScheduleRunsThrough(TODAY)).toBe(addDays(TODAY, DEMO_SCHEDULE_DAYS - 1));
    for (const b of bookings) expect(b.day <= demoScheduleRunsThrough(TODAY)).toBe(true);
  });

  it("covers every day the Hub's carousel can reach", () => {
    /*
     * The Hub opens on today and offers the next six days. A trainer who
     * lands on an empty grid concludes the demo is broken, not that the
     * studio is shut — so every weekday, Sunday included, carries at least
     * one booking, and this test is what keeps it that way.
     */
    for (let weekday = 0; weekday < 7; weekday += 1) {
      expect(DEMO_WEEK.some((s) => s.weekday === weekday)).toBe(true);
    }
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(TODAY, i);
      const onThatDay = bookings.filter((b) => b.day === day);
      expect(onThatDay.length).toBe(
        DEMO_WEEK.filter((s) => s.weekday === weekdayOf(day)).length,
      );
      expect(onThatDay.length).toBeGreaterThan(0);
    }
  });

  it("puts each booking on its own weekday at its own wall clock", () => {
    for (const b of bookings) {
      const start = new Date(b.startIso);
      expect(studioDateKey(start, TZ)).toBe(b.day);
      const slot = DEMO_WEEK.find(
        (s) => s.weekday === weekdayOf(b.day) && s.clientKey === b.clientKey,
      )!;
      const hm = zonedHM(start, TZ)!;
      expect(`${String(hm.hour).padStart(2, "0")}:${String(hm.minute).padStart(2, "0")}`).toBe(
        slot.time,
      );
    }
  });

  it("holds the wall clock across the change to standard time", () => {
    /*
     * The session history sidesteps timezones by only ever using UTC hours
     * 13–21. Bookings cannot: a 7 AM standing appointment has to read as 7 AM
     * in November as well as in September, and this run crosses the change.
     */
    const autumn = buildDemoWeek("2026-10-25");
    const sevens = autumn.filter((b) => b.clientKey === "sam");
    expect(sevens.length).toBeGreaterThan(4);
    for (const b of sevens) expect(zonedHM(new Date(b.startIso), TZ)!.hour).toBe(7);
    // …and the run really did cross it, or the test proves nothing.
    const offsets = new Set(
      sevens.map((b) => new Date(b.startIso).getUTCHours()),
    );
    expect(offsets.size).toBe(2);
  });

  it("is thirty minutes long, matching the studio's slot", () => {
    for (const b of bookings) {
      expect(new Date(b.endIso).getTime() - new Date(b.startIso).getTime()).toBe(30 * 60_000);
    }
  });

  it("cancels exactly one, far enough out to be worth knowing about", () => {
    const cancelled = bookings.filter((b) => b.cancelled);
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].day >= addDays(TODAY, 2)).toBe(true);
  });
});

describe("the bookings the seeder writes", () => {
  const seed = buildDemoSeed({ today: TODAY, seededBy: { id: "u1", name: "AJ Jurgens" } });
  const rows = seed.docs.filter((d) => d.path.startsWith("schedules/"));

  it("is reported to whoever pressed the button", () => {
    expect(seed.summary.bookings).toBe(rows.length);
    expect(seed.summary.scheduleThrough).toBe(demoScheduleRunsThrough(TODAY));
  });

  it("carries every field the Firestore rules require", () => {
    // isValidSchedule() in firestore.rules. A missing one is a write that is
    // refused halfway through the seed, in a batch, in front of the boss.
    for (const row of rows) {
      for (const field of [
        "clientName",
        "trainerName",
        "startTime",
        "endTime",
        "status",
        "serviceName",
        "source",
      ]) {
        expect(row.data[field]).toBeDefined();
      }
    }
  });

  it("resolves to a seeded client, because the Hub matches on id and nothing else", () => {
    /*
     * The Hub's resolution is STRICT: `clients/{clientId}` or the block draws
     * as "Not synced" and opens nobody. That one field is the difference
     * between a schedule a trainer can practise on and a picture of one.
     */
    const clientIds = new Set(
      seed.docs.filter((d) => /^clients\/[^/]+$/.test(d.path)).map((d) => d.path.slice(8)),
    );
    expect(clientIds.size).toBe(DEMO_CLIENTS.length);
    for (const row of rows) expect(clientIds.has(String(row.data.clientId))).toBe(true);
  });

  it("names a trainer the Hub can find a column for", () => {
    // ClientsView matches trainerName against trainer.fullName, case
    // insensitively; a name it cannot place conjures a "virtual" column.
    const names = new Set(
      DEMO_TRAINERS.map((t) => `${t.firstName} ${t.lastName}`.toLowerCase()),
    );
    for (const row of rows) {
      expect(names.has(String(row.data.trainerName).toLowerCase())).toBe(true);
      expect(String(row.data.trainerId)).toMatch(/^demo-trainer-/);
    }
  });

  it("belongs to the demo studio, flagged, and claims no Mindbody it does not have", () => {
    for (const row of rows) {
      expect(row.data.studioId).toBe(DEMO_STUDIO_ID);
      expect(row.data.isDemo).toBe(true);
      // The studio is mindbodyMode "offline" with no site id; saying Mindbody
      // sent these would be the one lie in the seed a trainer could catch.
      expect(row.data.source).toBe("Manual");
      expect(row.data.mindbodyClientId).toBeNull();
    }
  });

  it("writes Timestamps, not strings, for everything a query ranges over", () => {
    for (const row of rows) {
      for (const field of ["startTime", "endTime", "createdAt"]) {
        expect(row.data[field]).toHaveProperty("__ts");
      }
    }
  });

  it("gives Operations one change to find", () => {
    /*
     * The cancellation is the whole reason Overview → Changes has anything in
     * it inside Demo Mode. It should read as a RESCHEDULE, because the client
     * it lands on holds another booking the same week — which is the more
     * useful of the two readings and the one that needs a second booking to
     * demonstrate at all.
     */
    const entries = rows.map((row) => ({
      ...(row.data as unknown as ScheduleEntry),
      id: row.path.slice("schedules/".length),
      startTime: new Date(String((row.data.startTime as { __ts: string }).__ts)),
      cancelledAt: row.data.cancelledAt
        ? new Date(String((row.data.cancelledAt as { __ts: string }).__ts))
        : null,
    })) as ScheduleEntry[];

    const cancelled = rows.find((r) => r.data.status === "Cancelled")!;
    const day = studioDateKey(
      new Date(String((cancelled.data.startTime as { __ts: string }).__ts)),
      TZ,
    )!;
    const changes = changesForDay(entries, day, TZ);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("cancelled");
    expect(changes[0].reading).toBe("reschedule");
    expect(changes[0].movedTo).not.toBeNull();
  });
});
