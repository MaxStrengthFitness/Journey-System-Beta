/**
 * A 300-client studio in memory, the lab's shape (seed.ts), for the benches
 * and a profile: clients with last night's record and machine settings, eight
 * days of bookings (60 a day) and the sessions logged so far today.
 */
import { addDays } from "../../../src/features/client-history/model";
import type { Client, ScheduleEntry, Trainer, WorkoutSession } from "../../../src/types";

export const TODAY = "2026-10-06";
export const NOW = new Date("2026-10-06T13:40:00Z"); // 9:40 AM Eastern
const eastern = (day: string, h: number, m: number) => new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-04:00`);

export function labStudio(size = 300) {
  const trainers = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, authUid: `u${i}`, fullName: `Trainer ${i} Name`, primaryHomeStudioId: "lab" })) as unknown as Trainer[];
  const clients: Client[] = Array.from({ length: size }, (_, i) => {
    const metrics: Record<string, unknown> = {};
    for (let m = 0; m < 20; m++) metrics[`m${m}`] = { lastPerformedDate: { seconds: NOW.getTime() / 1000 - (i % 40) * 86_400 - m * 3600, nanoseconds: 0 } };
    return {
      id: `c${i}`,
      firstName: `First${i}`,
      lastName: `Last${i}`,
      homeStudioId: "lab",
      isActive: true,
      lastSessionDate: addDays(TODAY, -(i % 40)),
      sessionCount: 20 + (i % 300),
      currentMachineMetrics: metrics,
      renewal: {
        version: 1,
        situation: "on-track",
        pacePerWeek: 1 + (i % 3),
        proof: { weeksObserved: 12, weeksAttended: 10 },
        flags: [],
        lastVisitDate: addDays(TODAY, -(i % 40)),
        nextBookingDate: null,
        primaryTrainerId: `t${i % 10}`,
        focusDate: addDays(TODAY, 30 + (i % 200)),
        conversationDue: i % 17 === 0,
        chargeWarning: false,
        renewalOnBooks: null,
        computedAt: new Date("2026-10-06T06:30:00Z"),
      },
    } as unknown as Client;
  });
  const week: ScheduleEntry[] = [];
  let n = 0;
  for (let d = -1; d < 7; d++) {
    const day = addDays(TODAY, d);
    for (let slot = 0; slot < 60; slot++) {
      const c = clients[(slot * 7 + d * 13 + 300) % size];
      const start = eastern(day, 6 + Math.floor(slot / 5), (slot % 2) * 30);
      week.push({ id: `b${n++}`, clientId: c.id, clientName: `${c.firstName} ${c.lastName}`, trainerId: `t${slot % 10}`, trainerName: `Trainer ${slot % 10} Name`, studioId: "lab", startTime: start, endTime: new Date(start.getTime() + 30 * 60_000), status: "Scheduled" } as unknown as ScheduleEntry);
    }
  }
  const sessions = week
    .filter((b) => (b.startTime as Date).getTime() < NOW.getTime())
    .map((b, i) => ({ id: `s${i}`, clientId: b.clientId, status: "Completed", date: TODAY, trainerId: b.trainerId, createdAt: b.startTime, hostedAtStudioId: "lab" }) as unknown as WorkoutSession);
  return { trainers, clients, week, sessions };
}

