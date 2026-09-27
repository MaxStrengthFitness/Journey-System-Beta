/**
 * Test fixtures for the directory and the Hub's Opportunities layer: a
 * client, a booking, a session and a context, on a fixed Sunday afternoon in
 * Ohio (Sep 27 2026, 2 PM Eastern). Imported only by tests.
 */
import type { Client, ScheduleEntry, WorkoutSession } from "../../types";
import { DEFAULT_RENEWAL_SETTINGS, buildPackageNameIndex } from "../renewals/settings";
import { prepareDirectory, type DirectoryContext, type DirectoryInput } from "./row";

export const TZ = "America/New_York";
/** Sunday Sep 27 2026, 2:00 PM Eastern (EDT, UTC-4). */
export const NOW = new Date("2026-09-27T18:00:00Z");
export const TODAY = "2026-09-27";

/** An instant from Eastern wall-clock digits in late Sep / early Oct 2026 (EDT). */
export function eastern(day: string, hhmm: string): Date {
  return new Date(`${day}T${hhmm}:00-04:00`);
}

export function makeClient(over: Partial<Client> & { id: string }): Client {
  return {
    homeStudioId: "westlake",
    firstName: "Test",
    lastName: "Client",
    height: "",
    isActive: true,
    remainingSessions: 0,
    ...over,
  } as Client;
}

let bookingSeq = 0;
export function makeBooking(over: Partial<ScheduleEntry> & { clientId: string; start: Date; minutes?: number }): ScheduleEntry {
  const { start, minutes = 30, ...rest } = over;
  bookingSeq += 1;
  return {
    id: `b${bookingSeq}`,
    clientName: "",
    trainerName: "",
    studioId: "westlake",
    startTime: start,
    endTime: new Date(start.getTime() + minutes * 60_000),
    status: "Scheduled",
    serviceName: "Training Session",
    source: "MindBody",
    createdAt: null,
    ...rest,
  } as ScheduleEntry;
}

export function makeSession(over: Partial<WorkoutSession> & { clientId: string; at: Date }): WorkoutSession {
  const { at, ...rest } = over;
  return {
    id: `s-${over.clientId}`,
    hostedAtStudioId: "westlake",
    clientHomeStudioId: "westlake",
    isCrossTrain: false,
    sessionType: "Standard",
    sessionNumber: 1,
    date: at.toISOString(),
    trainerInitials: "MB",
    status: "Completed",
    createdAt: at,
    ...rest,
  } as unknown as WorkoutSession;
}

export const STUDIOS = [
  { id: "westlake", name: "Westlake", journeyCutoverDate: "2026-09-01" },
  { id: "solon", name: "Solon", journeyCutoverDate: null },
];

const TRAINERS: Record<string, string> = { "t-mike": "Mike Brandt", "t-ana": "Ana Lopez", "t-me": "Sam Rivera" };

export function makeContext(over: Partial<DirectoryInput> = {}): DirectoryContext {
  return prepareDirectory({
    today: TODAY,
    now: NOW,
    tz: TZ,
    studios: STUDIOS,
    activeStudioId: "westlake",
    schedules: [],
    bookingsFresh: true,
    bookingsAsOf: "1:05 PM",
    recentSessions: [],
    packageIndex: buildPackageNameIndex(DEFAULT_RENEWAL_SETTINGS),
    myIds: ["t-me", "uid-me"],
    myName: "Sam Rivera",
    trainerNameOf: (id) => TRAINERS[id] ?? null,
    ...over,
  });
}
