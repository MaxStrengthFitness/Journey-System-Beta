/**
 * Micro-benchmark: what Operations -> Today works out on the iPad itself, for
 * a 300-client studio (the lab's size) with a week of bookings: every
 * client's journey (studioJourneys) and the day's run-sheet (directory rows
 * for everyone booked, then the Hub's moments). Firestore's own ingest is not
 * here; it is the data group's.
 *   TZ=America/New_York npx vitest run harness/perf-lab/bench/ops-today
 */
import { describe, it, expect } from "vitest";
import { studioJourneys } from "../../../src/features/admin/journey/journey-list";
import { linesOf } from "../../../src/features/admin/journey/states";
import { resolveAll } from "../../../src/features/studio-settings/resolve";
import { DEFAULT_RENEWAL_SETTINGS, buildPackageNameIndex } from "../../../src/features/renewals/settings";
import { buildDirectoryRows, prepareDirectory } from "../../../src/features/client-directory/row";
import { momentsToday } from "../../../src/features/hub-opportunities/moments-today";
import { loggedSessions } from "../../../src/lib/booking-state";
import { NOW, TODAY, labStudio } from "./lab-studio";

function time<T>(label: string, fn: () => T, reps = 5): T {
  let out = fn();
  const t0 = performance.now();
  for (let r = 0; r < reps; r++) out = fn();
  // eslint-disable-next-line no-console
  console.log(`${label}: ${((performance.now() - t0) / reps).toFixed(1)} ms`);
  return out;
}

describe("Operations -> Today, the app's own work", () => {
  it("300 clients", () => {
    const { trainers, clients, week, sessions } = labStudio(300);
    const lines = linesOf(resolveAll({ studio: null, company: null }));
    const packageIndex = buildPackageNameIndex(DEFAULT_RENEWAL_SETTINGS);
    const journeys = time("studioJourneys (every client)", () =>
      studioJourneys({
        clients,
        studioId: "lab",
        today: TODAY,
        now: NOW,
        tz: "America/New_York",
        studios: [{ id: "lab", name: "Lab" }],
        weekEntries: week,
        weekReady: true,
        packageIndex,
        trainers,
        myIds: ["t0"],
        settings: DEFAULT_RENEWAL_SETTINGS,
        nightlyStale: false,
        lines,
        watchlist: new Map(),
        cases: new Map(),
        stored: null,
      }),
    );
    expect(journeys.length).toBe(300);
    const logged = loggedSessions(sessions, "America/New_York");
    const run = time("the day's run-sheet (rows + moments)", () => {
      const bookedIds = new Set(week.map((b) => b.clientId as string));
      const booked = clients.filter((c) => bookedIds.has(c.id as string));
      const ctx = prepareDirectory({ today: TODAY, now: NOW, tz: "America/New_York", studios: [{ id: "lab" }], activeStudioId: "lab", schedules: week, bookingsFresh: true, horizonDays: 6, recentSessions: null, packageIndex, packageStudioId: "lab", myIds: ["t0"] });
      const rows = buildDirectoryRows(booked, ctx);
      return momentsToday({ day: TODAY, today: TODAY, now: NOW, tz: "America/New_York", schedules: week, clientsById: new Map(clients.map((c) => [c.id as string, c])), rowsById: new Map(rows.map((r) => [r.id, r])), studios: [{ id: "lab" }], logged, criticalFor: () => [], myIds: ["t0"] });
    });
    expect(run.entries?.length ?? 0).toBeGreaterThanOrEqual(0);
  });
});
