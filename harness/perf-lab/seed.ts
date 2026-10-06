/**
 * THE PERF LAB'S SEEDER: one big studio, the way production data looks.
 *
 *   npx tsx harness/perf-lab/seed.ts            (lab.mjs runs it for you)
 *
 * Refuses to run unless FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST
 * point at 127.0.0.1 and the project is demo-* (lab-config.mjs). It clears the
 * emulator's lab database and accounts, then writes:
 *
 *   - the studio (America/New_York, a Journey cutover 400 days back, Mindbody
 *     "offline" so no /api sync ever runs), its network, its settings
 *   - 6 trainers, one of them the lab's user: a Studio Leader (trainers/{uid},
 *     role claim StudioLeader) so Operations opens
 *   - the machine catalog (machines/*, the twenty) and the studio's floor
 *   - 300 clients with packages, rollups, last-set metrics, routines A/B and
 *     machine settings; a mix of brand-new clients, clients with a confirmed
 *     prior history (some 300+ sessions before Journey) and unconfirmed ones
 *   - 8 weeks of bookings (5 back, this one, 2 ahead; about 1.6 a client a
 *     week, today and tomorrow fully booked across the 6 trainers)
 *   - 26 weeks of sessions, with exercise logs written for the last 4 weeks
 *     (PERF_LAB_LOG_WEEKS); a few past bookings left unlogged and some of
 *     those marked late cancels (bookingMarks)
 *   - two FOCUS clients the scenarios open by name (FOCUS below): 600
 *     sessions before Journey, a year of twice-weekly Journey sessions with
 *     every exercise log written, one booked at 10:00 today and one at 09:00
 *     tomorrow, both with the lab user. The client and session scenarios
 *     open these two every rep and on every profile.
 *   - the nightly job's documents, worked out by its own pure core over the
 *     seeded data: each client's renewal snapshot (clients/{id}.renewal),
 *     studios/{s}/clientStates, watch/journey and watch/hubMarks
 *   - client notes (journalEntries) with Critical ones on today's clients,
 *     FORD details, standing weeks, announcements and the lab user's bell
 *
 * THE STUDIO'S CLOCK IS HELD. The seed's "now" is 09:40 Eastern on the day it
 * runs (whatever the wall clock says), and the driver holds every page's
 * clock at that same moment (run.mjs, the Date shim), so a run at 2 AM and a
 * run at 3 PM see the same mid-morning Hub. seed-summary.json records the day
 * and the anchor; lab.mjs reseeds when the Eastern day has moved on.
 *
 * Deterministic: every id and number comes from a seeded PRNG, so two runs on
 * the same day lay down the same studio. Uses only pure modules from src/
 * (never src/firebase.ts).
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import { MACHINE_DEFINITION_LIST } from "../../src/data/machine-definitions";
import { rollupFromHistory } from "../../src/lib/client-rollups";
import type { Client, ScheduleEntry, Trainer, WorkoutSession } from "../../src/types";
import { buildRenewalSnapshot } from "../../src/features/renewals/engine";
import { attendanceFromSchedules, attendanceFromSessions, attendanceSinceOf, feelFromSessions } from "../../src/features/renewals/attendance";
import { buildPackageNameIndex, normalizeRenewalSettings } from "../../src/features/renewals/settings";
import { bookingMarks, loggedSessions } from "../../src/lib/booking-state";
import { cutoverOf } from "../../src/lib/client-coverage";
import { sessionDayKey } from "../../src/features/client-history/model";
import { resolveAll } from "../../src/features/studio-settings/resolve";
import { linesOf } from "../../src/features/admin/journey/states";
import { ALL_STARS_READ_DAYS, CLIENT_STATES, HUB_MARKS_ID, JOURNEY_WATCH_ID, nightStudio } from "../../src/features/admin/journey/nightly";
import {
  DATABASE_ID,
  FIRESTORE_PORT,
  HOST,
  LAB_UID,
  PROJECT_ID,
  STUDIO_ID,
  assertEmulatorsOnly,
  labCredentials,
} from "./lab-config.mjs";

assertEmulatorsOnly();

/* ── Sizes ─────────────────────────────────────────────────────────────── */

const CLIENTS = Number(process.env.PERF_LAB_CLIENTS || 300);
const BOOKING_DAYS_BACK = 35; // 5 weeks back...
const BOOKING_DAYS_AHEAD = 20; // ...this week and about 2 ahead: 8 weeks
const SESSION_DAYS_BACK = 182; // 26 weeks: the All-stars read, and what a Journey grid pages back through
const FOCUS_DAYS_BACK = 365; // the focus clients: a year of Journey sessions
const MAX_LOGS = Number(process.env.PERF_LAB_MAX_LOGS || 250000);
/*
 * Exercise logs are WRITTEN only for the last LOG_WEEKS weeks of sessions
 * (every client's last eight or so, which is what the grids draw first); the
 * rollups, last-set metrics and session numbers still come from all three
 * months. The Firestore emulator's write time grows with the size of a
 * collection (an exerciseLogs write took 4.3 s with 39,000 logs, rules or no
 * rules, against 35 ms for a 4,000-document collection), which made every
 * set and Finish wait on the emulator rather than the app. Production has no
 * such cost. PERF_LAB_LOG_WEEKS=13 writes them all.
 */
const LOG_WEEKS = Number(process.env.PERF_LAB_LOG_WEEKS || 4);

/* ── Deterministic randomness (the demo seeder's) ──────────────────────── */

function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function rngFor(key: string): () => number {
  let a = hashOf(key);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)];

/* ── The studio's day ──────────────────────────────────────────────────── */

const TZ = "America/New_York";
const DAY_MS = 86400000;
function easternDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function addDays(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + delta * DAY_MS).toISOString().slice(0, 10);
}
function weekdayOf(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
/** The UTC instant of a wall-clock time on a studio day (Eastern, DST-aware). */
function easternInstant(dayKey: string, hh: number, mm: number): Date {
  const guess = new Date(`${dayKey}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000Z`);
  for (const offsetHours of [4, 5]) {
    const at = new Date(guess.getTime() + offsetHours * 3600000);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
    if (parts === `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`) return at;
  }
  return new Date(guess.getTime() + 5 * 3600000);
}
const ts = (d: Date) => Timestamp.fromDate(d);
const tsDay = (dayKey: string) => Timestamp.fromDate(new Date(`${dayKey}T12:00:00.000Z`));

/** The studio day the seed is for (Eastern), and the held "now": 09:40 that morning. */
const TODAY = easternDayKey(new Date());
const NOW = easternInstant(TODAY, 9, 40);

/* ── Names ─────────────────────────────────────────────────────────────── */

const FIRST = ["Margaret", "Linda", "Barbara", "Susan", "Karen", "Nancy", "Donna", "Carol", "Sandra", "Sharon", "Patricia", "Deborah", "Janet", "Diane", "Joyce", "Kathleen", "Cheryl", "Teresa", "Judith", "Christine", "Robert", "James", "John", "Michael", "William", "David", "Richard", "Thomas", "Charles", "Gary", "Larry", "Dennis", "Steven", "Kenneth", "Mark", "Paul", "Donald", "Jerry", "Ronald", "Frank", "Elena", "Priya", "Aisha", "Mei", "Sofia", "Hiroshi", "Mateo", "Omar", "Anika", "Tomasz"];
const LAST = ["Anderson", "Baker", "Carter", "Dawson", "Evans", "Fischer", "Garcia", "Hughes", "Iverson", "Jenkins", "Kowalski", "Lambert", "Morrison", "Novak", "O'Brien", "Patel", "Quinn", "Romano", "Sullivan", "Thompson", "Underwood", "Vasquez", "Whitfield", "Young", "Zimmerman", "Brennan", "Castellano", "Delaney", "Ellison", "Fitzgerald", "Gallagher", "Hollister", "Kaczmarek", "Lindqvist", "McAllister", "Nakamura", "Ostrowski", "Petrakis", "Reinholt", "Szymanski"];

/* ── The team ──────────────────────────────────────────────────────────── */

interface LabTrainer {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  role: string;
  email: string;
}
const creds = labCredentials();
const TRAINERS: LabTrainer[] = [
  { id: LAB_UID, firstName: "Lena", lastName: "Labrador", initials: "LL", role: "StudioLeader", email: creds.email.toLowerCase() },
  { id: "lab-trainer-marcus", firstName: "Marcus", lastName: "Bell", initials: "MB", role: "HeadTrainer", email: "marcus@perf-lab.test" },
  { id: "lab-trainer-jo", firstName: "Jo", lastName: "Whitaker", initials: "JW", role: "LifeTransformer", email: "jo@perf-lab.test" },
  { id: "lab-trainer-sam", firstName: "Sam", lastName: "Okafor", initials: "SO", role: "LifeTransformer", email: "sam@perf-lab.test" },
  { id: "lab-trainer-riley", firstName: "Riley", lastName: "Grant", initials: "RG", role: "LifeTransformer", email: "riley@perf-lab.test" },
  { id: "lab-trainer-dana", firstName: "Dana", lastName: "Kim", initials: "DK", role: "LifeTransformer", email: "dana@perf-lab.test" },
];
const fullName = (t: LabTrainer) => `${t.firstName} ${t.lastName}`;

/*
 * THE FOCUS CLIENTS: the two people the client and session scenarios open,
 * found on the Hub BY NAME (no other seeded client has these surnames), so
 * every rep and every profile opens the same long-tenured client however the
 * cards are laid out. Both are the lab user's, 600 sessions before Journey
 * (confirmed), a year of twice-weekly Journey sessions with every exercise
 * log written, routines of eight machines.
 */
const FOCUS = [
  { role: "client", firstName: "Winifred", lastName: "Ashcombe", weekdays: [1, 4], slotIndex: 0, bookDelta: 0, bookHour: 10 },
  { role: "session", firstName: "Theodora", lastName: "Pemberton", weekdays: [2, 5], slotIndex: 1, bookDelta: 1, bookHour: 9 },
] as const;
const FOCUS_PRIOR_SESSIONS = 600;

/* ── The floor ─────────────────────────────────────────────────────────── */

const MACHINES = MACHINE_DEFINITION_LIST.filter((m) => m.inStandardSet !== false).sort(
  (a, b) => (a.defaultOrder ?? 999) - (b.defaultOrder ?? 999),
);
const HOLD = new Set(["m-lumbar", "m-abs"]);
function dialLabels(m: (typeof MACHINES)[number]): string[] {
  return (m.settingFields ?? []).map((f) => (f.label || f.key || "").trim()).filter(Boolean);
}

/* ── Writing ───────────────────────────────────────────────────────────── */

interface Doc {
  path: string;
  data: Record<string, unknown>;
}
const docs: Doc[] = [];
const put = (path: string, data: Record<string, unknown>) => docs.push({ path, data });
const counts: Record<string, number> = {};
const count = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

async function clearEmulators(): Promise<void> {
  const fsUrl = `http://${HOST}:${FIRESTORE_PORT}/emulator/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
  const r1 = await fetch(fsUrl, { method: "DELETE" });
  if (!r1.ok) throw new Error(`Could not clear the Firestore emulator: ${r1.status}`);
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const r2 = await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  if (!r2.ok) throw new Error(`Could not clear the Auth emulator: ${r2.status}`);
}

async function writeAll(db: Firestore): Promise<void> {
  const writer = db.bulkWriter();
  writer.onWriteError((err) => err.failedAttempts < 5);
  let n = 0;
  const started = Date.now();
  for (const d of docs) {
    void writer.set(db.doc(d.path), d.data);
    n += 1;
    if (n % 10000 === 0) {
      await writer.flush();
      console.log(`  ${n} / ${docs.length} written (${Math.round((Date.now() - started) / 1000)} s)`);
    }
  }
  await writer.close();
}

/* ── Build ─────────────────────────────────────────────────────────────── */

function buildStudio(): void {
  put(`studios/${STUDIO_ID}`, {
    name: "Lakeside",
    address: "1200 Lakeside Ave (perf lab)",
    timezone: TZ,
    mindbodyMode: "offline",
    locationType: "franchise",
    journeyCutoverDate: addDays(TODAY, -400),
    sessionMinutes: 30,
    ownerId: LAB_UID,
    stage: "running",
    createdAt: tsDay(addDays(TODAY, -400)),
  });
  put(`networks/lab-network`, {
    name: "Lab Franchise Group",
    ownerIds: [LAB_UID],
    state: "Ohio",
    studioIds: [STUDIO_ID],
    createdAt: tsDay(addDays(TODAY, -400)),
  });
  for (const t of TRAINERS) {
    put(`trainers/${t.id}`, {
      fullName: fullName(t),
      initials: t.initials,
      role: t.role,
      email: t.email,
      primaryHomeStudioId: STUDIO_ID,
      accessibleStudioIds: [STUDIO_ID],
      activeGuestStudioIds: [],
      photoUrl: null,
      isVisibleOnCalendar: true,
      mindbodyLinked: false,
      ...(t.id === LAB_UID ? { uid: LAB_UID } : { pendingClaim: true }),
      createdAt: tsDay(addDays(TODAY, -380)),
    });
    count("trainers");
    // The agreed standing week: Mon-Fri 7-11, 12-16; Saturday 8-12.
    const hours = [1, 2, 3, 4, 5].flatMap((weekday) => [
      { weekday, from: "07:00", to: "11:00" },
      { weekday, from: "12:00", to: "16:00" },
    ]);
    hours.push({ weekday: 6, from: "08:00", to: "12:00" });
    const week = { hours, regulars: [] };
    put(`studios/${STUDIO_ID}/standingWeeks/${t.id}`, {
      studioId: STUDIO_ID,
      trainerUid: t.id,
      trainerId: t.id,
      trainerName: fullName(t),
      proposed: week,
      proposedAt: tsDay(addDays(TODAY, -60)),
      proposedBy: { id: t.id, name: fullName(t) },
      final: week,
      finalAt: tsDay(addDays(TODAY, -59)),
      finalBy: { id: LAB_UID, name: "Lena Labrador" },
      away: [],
    });
  }
  for (const m of MACHINES) {
    put(`machines/${m.id}`, JSON.parse(JSON.stringify({ ...m, order: m.defaultOrder ?? 999 })));
    put(`studios/${STUDIO_ID}/roster/${m.id}`, {
      machineId: m.id,
      studioId: STUDIO_ID,
      source: "catalog",
      basedOn: m.id,
      status: "active",
      order: m.defaultOrder ?? 999,
      updatedAt: tsDay(TODAY),
      updatedBy: LAB_UID,
    });
    count("machines");
  }
}

interface LabClient {
  id: string;
  key: number;
  firstName: string;
  lastName: string;
  gender: "female" | "male";
  age: number;
  trainer: LabTrainer;
  /** "new" started on Journey; "prior" has a confirmed history before it; "unconfirmed" has neither. */
  history: "new" | "prior" | "unconfirmed";
  priorSessions: number;
  routineA: string[];
  routineB: string[];
  packageSize: number;
  /** One of the FOCUS clients (the scenario that opens her), else null. */
  focus: "client" | "session" | null;
  /** The last day she came (she stopped after it), else null. */
  stoppedOn: string | null;
}

function buildClients(): LabClient[] {
  const out: LabClient[] = [];
  for (let i = 0; i < CLIENTS; i += 1) {
    const r = rngFor(`client:${i}`);
    const firstName = FIRST[(i * 7 + between(r, 0, 3)) % FIRST.length];
    const lastName = LAST[(i * 11 + between(r, 0, 5)) % LAST.length];
    const gender = FIRST.indexOf(firstName) < 20 || ["Elena", "Priya", "Aisha", "Mei", "Sofia", "Anika"].includes(firstName) ? "female" : "male";
    const roll = r();
    const history: LabClient["history"] = roll < 0.45 ? "prior" : roll < 0.6 ? "unconfirmed" : "new";
    const priorSessions = history === "prior" ? (r() < 0.35 ? between(r, 300, 720) : between(r, 20, 299)) : 0;
    const shuffled = [...MACHINES.map((m) => m.id)].sort((a, b) => hashOf(`${i}:${a}`) - hashOf(`${i}:${b}`));
    const perRoutine = between(r, 5, 8);
    out.push({
      id: String(100000001 + i * 37),
      key: i,
      firstName,
      lastName,
      gender,
      age: between(r, 34, 82),
      trainer: TRAINERS[i % TRAINERS.length],
      history,
      priorSessions,
      routineA: shuffled.slice(0, perRoutine),
      routineB: shuffled.slice(perRoutine, perRoutine * 2),
      packageSize: pick(r, [24, 36, 48, 72]),
      // About one client in ten stopped coming: some a few weeks ago (drifting, at risk), some past the lapse line.
      stoppedOn: (() => { const x = r(); return x < 0.06 ? addDays(TODAY, -between(r, 12, 35)) : x < 0.1 ? addDays(TODAY, -between(r, 46, 85)) : null; })(),
      focus: null,
    });
  }
  FOCUS.forEach((f, k) => {
    const i = CLIENTS + k;
    const shuffled = [...MACHINES.map((m) => m.id)].sort((a, b) => hashOf(`${i}:${a}`) - hashOf(`${i}:${b}`));
    out.push({
      id: String(100000001 + i * 37),
      key: i,
      firstName: f.firstName,
      lastName: f.lastName,
      gender: "female",
      age: 66 + k * 5,
      trainer: TRAINERS[0],
      history: "prior",
      priorSessions: FOCUS_PRIOR_SESSIONS,
      routineA: shuffled.slice(0, 8),
      routineB: shuffled.slice(8, 16),
      packageSize: 48,
      stoppedOn: null,
      focus: f.role,
    });
  });
  return out;
}

interface Appointment {
  id: string;
  day: string;
  start: Date;
  end: Date;
  client: LabClient;
  trainer: LabTrainer;
  cancelled: boolean;
}

/** Every appointment from SESSION_DAYS_BACK ago to BOOKING_DAYS_AHEAD from now. */
function buildAppointments(allClients: LabClient[]): Appointment[] {
  const out: Appointment[] = [];
  const clients = allClients.filter((c) => !c.focus);
  // Slots: 6:00 to 19:00, every 30 minutes (26 a trainer a day).
  const slots: Array<[number, number]> = [];
  for (let h = 6; h < 19; h += 1) slots.push([h, 0], [h, 30]);
  const slotOf = (h: number) => (h - 6) * 2;
  /** The lab user's slots the focus clients hold: 6:00 and 6:30 every day, and their own booking today / tomorrow. */
  const focusHolds = (delta: number, trainerId: string, slotIndex: number) =>
    trainerId === LAB_UID && (slotIndex <= 1 || FOCUS.some((f) => f.bookDelta === delta && slotOf(f.bookHour) === slotIndex));
  const appt = (day: string, trainer: LabTrainer, slotIndex: number, client: LabClient, cancelled: boolean): Appointment => {
    const [h, m] = slots[slotIndex];
    const start = easternInstant(day, h, m);
    return {
      id: `lab-appt-${day.replace(/-/g, "")}-${trainer.id.slice(-5)}-${slotIndex}`,
      day,
      start,
      end: new Date(start.getTime() + 30 * 60000),
      client,
      trainer,
      cancelled,
    };
  };
  // The focus clients: twice a week for a year (6:00 / 6:30), and their own booking today or tomorrow.
  for (const c of allClients.filter((x) => x.focus)) {
    const f = FOCUS.find((x) => x.role === c.focus)!;
    for (let delta = -FOCUS_DAYS_BACK; delta <= BOOKING_DAYS_AHEAD; delta += 1) {
      const day = addDays(TODAY, delta);
      if (delta === 0 || delta === 1) continue;
      if (!(f.weekdays as readonly number[]).includes(weekdayOf(day))) continue;
      out.push(appt(day, c.trainer, f.slotIndex, c, false));
    }
    out.push(appt(addDays(TODAY, f.bookDelta), c.trainer, slotOf(f.bookHour), c, false));
  }
  for (let delta = -SESSION_DAYS_BACK; delta <= BOOKING_DAYS_AHEAD; delta += 1) {
    const day = addDays(TODAY, delta);
    const weekday = weekdayOf(day);
    if (weekday === 0) continue; // closed Sundays
    const full = delta === 0 || delta === 1;
    // About 1.6 sessions a client a week over 6 days: 300 * 1.6 / 6 = 80 a day of 156 slots.
    const fill = full ? 1 : weekday === 6 ? 0.25 : (CLIENTS * 1.6) / 5.25 / (TRAINERS.length * slots.length);
    const seenToday = new Set<string>();
    for (const trainer of TRAINERS) {
      const theirs = clients.filter((c) => c.trainer.id === trainer.id);
      const others = clients.filter((c) => c.trainer.id !== trainer.id);
      slots.forEach(([h], slotIndex) => {
        if (focusHolds(delta, trainer.id, slotIndex)) return;
        const r = rngFor(`slot:${day}:${trainer.id}:${slotIndex}`);
        // Fully booked days fill 7:00 to 17:30; other days by chance.
        const inCore = h >= 7 && h < 18;
        if (full ? !inCore : r() > fill) return;
        let client: LabClient | null = null;
        for (let tries = 0; tries < 12 && !client; tries += 1) {
          const pool = r() < 0.85 ? theirs : others;
          const c = pick(r, pool);
          if (!seenToday.has(c.id) && !(c.stoppedOn && day > c.stoppedOn)) client = c;
        }
        if (!client) return;
        seenToday.add(client.id);
        out.push(appt(day, trainer, slotIndex, client, delta !== 0 && delta !== 1 && r() < 0.04));
      });
    }
  }
  return out;
}

/** What the nightly core is handed, as the job would read it: bookings, sessions and marks by client. */
const bookingsByClient = new Map<string, ScheduleEntry[]>();
const sessionsByClient = new Map<string, WorkoutSession[]>();
const markRows: Array<{ id: string; noShow: boolean }> = [];
const clientDocs = new Map<string, Record<string, unknown>>();

function buildBookings(appts: Appointment[]): void {
  for (const a of appts) {
    const delta = Math.round((Date.parse(`${a.day}T12:00:00Z`) - Date.parse(`${TODAY}T12:00:00Z`)) / DAY_MS);
    if (delta < -BOOKING_DAYS_BACK) continue;
    const data: Record<string, unknown> = {
      clientId: a.client.id,
      mindbodyClientId: a.client.id,
      clientName: `${a.client.firstName} ${a.client.lastName}`,
      trainerId: a.trainer.id,
      trainerName: fullName(a.trainer),
      studioId: STUDIO_ID,
      startTime: ts(a.start),
      endTime: ts(a.end),
      status: a.cancelled ? "Cancelled" : "Scheduled",
      serviceName: "Max Strength Session",
      source: "MindBody",
      createdAt: ts(new Date(a.start.getTime() - 14 * DAY_MS)),
      ...(a.cancelled ? { cancelledAt: ts(new Date(a.start.getTime() - DAY_MS)) } : {}),
    };
    put(`schedules/${a.id}`, data);
    const list = bookingsByClient.get(a.client.id) ?? [];
    list.push({ id: a.id, ...data } as unknown as ScheduleEntry);
    bookingsByClient.set(a.client.id, list);
    count("bookings");
  }
}

interface ClientHistory {
  sessions: Array<{ id: string; day: string; start: Date; trainer: LabTrainer; slot: "a" | "b"; machines: string[]; number: number }>;
  logs: Array<{ sessionId: string; machineId: string; weight: string; reps: string; seconds: string; hold: boolean; outcome: string; repQuality?: number; at: Date }>;
}

function buildHistories(clients: LabClient[], appts: Appointment[]): Map<string, ClientHistory> {
  const byClient = new Map<string, ClientHistory>();
  for (const c of clients) byClient.set(c.id, { sessions: [], logs: [] });
  const past = appts
    .filter((a) => !a.cancelled && a.end.getTime() < NOW.getTime() - 15 * 60000)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  let logs = 0;
  const marks: Appointment[] = [];
  for (const a of past) {
    const r = rngFor(`done:${a.id}`);
    // About 3% of past bookings were never logged; a third of those were late cancels.
    if (r() < 0.03) {
      if (r() < 0.35 && a.day >= addDays(TODAY, -BOOKING_DAYS_BACK)) marks.push(a);
      continue;
    }
    const h = byClient.get(a.client.id)!;
    const slot: "a" | "b" = h.sessions.length % 2 === 0 ? "a" : "b";
    const machines = slot === "a" ? a.client.routineA : a.client.routineB;
    if (logs + machines.length > MAX_LOGS) break;
    const id = `lab-session-${a.id.slice(9)}`;
    h.sessions.push({ id, day: a.day, start: a.start, trainer: a.trainer, slot, machines, number: h.sessions.length + 1 });
    for (const machineId of machines) {
      const hold = HOLD.has(machineId);
      const mr = rngFor(`load:${a.client.id}:${machineId}`);
      const base = 20 + 2 * between(mr, 5, 70);
      const done = h.logs.filter((l) => l.machineId === machineId).length;
      const weight = base + 2 * Math.floor(done / 3);
      const ran = r() < 0.02 ? "skipped" : "performed";
      h.logs.push({
        sessionId: id,
        machineId,
        weight: ran === "performed" ? String(weight) : "0",
        reps: ran === "performed" && !hold ? String(between(r, 4, 12)) : "0",
        seconds: ran === "performed" && hold ? String(between(r, 45, 120)) : "0",
        hold,
        outcome: ran,
        ...(ran === "performed" ? { repQuality: r() < 0.08 ? 1 : r() < 0.1 ? 3 : 2 } : {}),
        at: a.start,
      });
      logs += 1;
    }
  }
  for (const a of marks) {
    markRows.push({ id: a.id, noShow: true });
    put(`studios/${STUDIO_ID}/bookingMarks/${a.id}`, {
      noShow: true,
      clientId: a.client.id,
      day: a.day,
      markedBy: { id: LAB_UID, name: "Lena Labrador" },
      markedAt: ts(new Date(a.end.getTime() + 3600000)),
    });
    count("bookingMarks");
  }
  return byClient;
}

function buildClientDocs(c: LabClient, h: ClientHistory): void {
  const name = `${c.firstName} ${c.lastName}`;
  const r = rngFor(`docs:${c.id}`);
  const sessionById = new Map(h.sessions.map((s) => [s.id, s]));
  for (const s of h.sessions) {
    const end = new Date(s.start.getTime() + between(r, 24, 32) * 60000);
    const sessionData: Record<string, unknown> = {
      clientId: c.id,
      clientName: name,
      mindbodyClientId: c.id,
      date: s.day,
      startTime: ts(s.start),
      endTime: ts(end),
      clientStartTime: s.start.toISOString(),
      createdAt: ts(s.start),
      hostedAtStudioId: STUDIO_ID,
      clientHomeStudioId: STUDIO_ID,
      homeStudioId: STUDIO_ID,
      isCrossTrain: false,
      sessionType: "Standard",
      sessionNumber: s.number + c.priorSessions,
      status: "Completed",
      trainerId: s.trainer.id,
      startedByTrainerId: s.trainer.id,
      trainerName: fullName(s.trainer),
      trainerInitials: s.trainer.initials,
      routineId: `lab-routine-${c.id}-${s.slot}`,
      routineName: s.slot === "a" ? "Routine A" : "Routine B",
      sessionMachineIds: s.machines,
      pausedAt: null,
      totalPausedMs: 0,
      clientAge: c.age,
      clientIsRetired: c.age >= 67,
    };
    put(`sessions/${s.id}`, sessionData);
    const mine = sessionsByClient.get(c.id) ?? [];
    mine.push({ id: s.id, ...sessionData } as unknown as WorkoutSession);
    sessionsByClient.set(c.id, mine);
    count("sessions");
  }
  const settings: Record<string, Record<string, string>> = {};
  for (const m of MACHINES) {
    const map: Record<string, string> = {};
    for (const label of dialLabels(m)) map[label] = String(between(r, 1, /angle/i.test(label) ? 4 : 10));
    settings[m.id] = map;
  }
  const logsFrom = addDays(TODAY, -LOG_WEEKS * 7);
  for (const l of h.logs) {
    // Every log of a focus client is written: the grids the scenarios open page through all of them.
    if (!c.focus && sessionById.get(l.sessionId)!.day < logsFrom) {
      count("exerciseLogsNotWritten");
      continue;
    }
    put(`exerciseLogs/${l.sessionId}_${l.machineId}`, {
      sessionId: l.sessionId,
      clientId: c.id,
      machineId: l.machineId,
      studioId: STUDIO_ID,
      homeStudioId: STUDIO_ID,
      clientHomeStudioId: STUDIO_ID,
      weight: l.weight,
      reps: l.reps,
      seconds: l.seconds,
      isStaticHold: l.hold,
      isTSC: l.hold,
      outcome: l.outcome,
      machineSettings: settings[l.machineId] ?? {},
      createdAt: ts(l.at),
      updatedAt: ts(l.at),
      ...(l.repQuality ? { repQuality: l.repQuality } : {}),
    });
    count("exerciseLogs");
  }

  const trainerDocs = TRAINERS.map(
    (t) =>
      ({
        id: t.id,
        fullName: fullName(t),
        initials: t.initials,
        role: t.role,
        primaryHomeStudioId: STUDIO_ID,
        accessibleStudioIds: [STUDIO_ID],
        activeGuestStudioIds: [],
      }) as unknown as Trainer,
  );
  const rollup = rollupFromHistory(
    h.sessions.map((s) => ({ id: s.id, status: "Completed", date: s.day, trainerId: s.trainer.id, trainerInitials: s.trainer.initials, trainerName: fullName(s.trainer) })),
    h.logs.map((l) => ({ sessionId: l.sessionId, machineId: l.machineId, weight: l.weight, reps: l.reps, seconds: l.seconds, isStaticHold: l.hold, isTSC: l.hold, outcome: l.outcome as never })),
    trainerDocs,
  );
  const metrics: Record<string, unknown> = {};
  let lifetimeReps = 0;
  let lifetimeWeight = 0;
  for (const l of h.logs) {
    if (l.outcome !== "performed") continue;
    lifetimeReps += Number(l.reps) || 0;
    lifetimeWeight += (Number(l.weight) || 0) * (Number(l.reps) || 0);
    const s = sessionById.get(l.sessionId)!;
    metrics[l.machineId] = {
      weight: l.weight,
      reps: l.reps,
      seconds: l.seconds,
      isStaticHold: l.hold,
      isTSC: l.hold,
      settings: settings[l.machineId] ?? {},
      lastPerformedDate: ts(s.start),
      lastPerformedSessionNumber: s.number + c.priorSessions,
      lastSessionId: s.id,
    };
  }
  const journeyCount = h.sessions.length;
  const used = journeyCount % c.packageSize;
  const remaining = Math.max(0, c.packageSize - used - between(r, 0, 4));
  const first = h.sessions[0]?.day ?? addDays(TODAY, -between(r, 1, 30));
  const last = h.sessions[h.sessions.length - 1]?.day ?? null;
  const priorFields =
    c.history === "prior"
      ? {
          priorHistory: {
            sessions: c.priorSessions,
            importedCount: 0,
            from: null,
            through: addDays(first, -1),
            source: "mindbody",
            note: null,
            recordedAt: tsDay(addDays(TODAY, -20)),
            recordedById: LAB_UID,
            recordedByName: "Lena Labrador",
          },
          firstStudioDay: addDays(first, -Math.round(c.priorSessions * 3.6)),
        }
      : c.history === "new"
        ? { historyIsComplete: true }
        : {};
  const clientData: Record<string, unknown> = {
    firstName: c.firstName,
    lastName: c.lastName,
    email: `client${c.key}@perf-lab.test`,
    phone: null,
    mindbodyClientId: c.id,
    isActive: true,
    homeStudioId: STUDIO_ID,
    gender: c.gender,
    age: c.age,
    height: between(r, 60, 75),
    weight: between(r, 120, 240),
    isRetired: c.age >= 67,
    remainingSessions: remaining,
    completedSessions: journeyCount,
    sessionCount: journeyCount + c.priorSessions,
    firstSessionDate: first,
    lastSessionDate: last,
    lifetimeReps,
    lifetimeWeight: Math.round(lifetimeWeight),
    currentMachineMetrics: metrics,
    consultationCompleted: true,
    requiresConsultation: false,
    isRoutineBActive: true,
    primaryTrainerId: c.trainer.id,
    ...rollup,
    mindbodyServicesSyncedAt: tsDay(TODAY),
    mindbodyServices: {
      [`svc-${c.id}`]: {
        serviceId: `svc-${c.id}`,
        name: `${c.packageSize} Sessions - 2X Week`,
        count: c.packageSize,
        remaining,
        activeDate: tsDay(addDays(TODAY, -between(r, 20, 200))),
        expirationDate: tsDay(addDays(TODAY, 240)),
        current: true,
        siteId: null,
        lastPullSyncAt: tsDay(TODAY),
      },
    },
    ...priorFields,
    createdAt: tsDay(first),
    updatedAt: tsDay(TODAY),
  };
  put(`clients/${c.id}`, clientData);
  clientDocs.set(c.id, clientData);
  count("clients");

  for (const machineId of [...c.routineA, ...c.routineB]) {
    const performed = h.logs.filter((l) => l.machineId === machineId && l.outcome === "performed");
    put(`clientMachineSettings/${c.id}_${machineId}`, {
      clientId: c.id,
      machineId,
      homeStudioId: STUDIO_ID,
      clientHomeStudioId: STUDIO_ID,
      settings: settings[machineId] ?? {},
      ...(performed[0] ? { startingWeight: Number(performed[0].weight), startingWeightDate: `${first}T12:00:00.000Z` } : {}),
      ...(performed.length ? { currentWeight: Number(performed[performed.length - 1].weight) } : {}),
      updatedBy: LAB_UID,
      updatedAt: tsDay(TODAY),
    });
    count("clientMachineSettings");
  }
  (["a", "b"] as const).forEach((slot) => {
    put(`routines/lab-routine-${c.id}-${slot}`, {
      clientId: c.id,
      studioId: STUDIO_ID,
      name: slot === "a" ? "Routine A" : "Routine B",
      machineIds: slot === "a" ? c.routineA : c.routineB,
      createdAt: tsDay(first),
    });
    count("routines");
  });
}

const NOTE_BODIES: Array<{ kind: string; category: string | null; body: string; importance: string }> = [
  { kind: "injury", category: "injury", body: "Left shoulder impingement: keep the overhead press below shoulder height.", importance: "elevated" },
  { kind: "injury", category: "surgery", body: "Right knee replacement two years ago; full range now but go slow on the leg press turnaround.", importance: "standard" },
  { kind: "injury", category: "medication", body: "Started a blood pressure medication; watch for dizziness standing up from the machines.", importance: "elevated" },
  { kind: "coaching", category: "set-up", body: "Seat at 4 on the leg press, she slides forward otherwise.", importance: "standard" },
  { kind: "coaching", category: null, body: "Rushes the lowering on the pulldown: cue the slow turnaround.", importance: "standard" },
  { kind: "preference", category: null, body: "Prefers a quiet session, no music near the chest press.", importance: "standard" },
  { kind: "retention", category: null, body: "Mentioned money is tight this quarter; talk about the package before it runs out.", importance: "elevated" },
  { kind: "incident", category: null, body: "Felt light-headed after the leg press; sat for five minutes and was fine.", importance: "elevated" },
];

function buildNotes(clients: LabClient[], appts: Appointment[]): void {
  const todaysClients = new Set(appts.filter((a) => a.day === TODAY || a.day === addDays(TODAY, 1)).map((a) => a.client.id));
  let critical = 0;
  for (const c of clients) {
    const r = rngFor(`notes:${c.id}`);
    const n = between(r, 0, 4);
    for (let i = 0; i < n; i += 1) {
      const t = pick(r, NOTE_BODIES);
      const author = pick(r, TRAINERS);
      const at = new Date(NOW.getTime() - between(r, 1, 80) * DAY_MS - between(r, 0, 600) * 60000);
      const makeCritical = todaysClients.has(c.id) && critical < 14 && i === 0 && r() < 0.15;
      if (makeCritical) critical += 1;
      put(`journalEntries/lab-note-${c.id}-${i}`, {
        clientId: c.id,
        studioId: STUDIO_ID,
        kind: makeCritical ? "injury" : t.kind,
        category: makeCritical ? "injury" : t.category,
        body: makeCritical ? "Acute lower back flare-up this week: no lumbar extension, ask before the leg press." : t.body,
        importance: makeCritical ? "critical" : t.importance,
        machineId: null,
        focusId: null,
        threadId: null,
        sessionId: null,
        origin: "profile",
        authorId: author.id,
        authorInitials: author.initials,
        authorName: fullName(author),
        occurredAt: ts(at),
        createdAt: ts(at),
        updatedAt: ts(at),
        effectiveFrom: null,
        effectiveUntil: null,
        repeat: null,
        reviewedAt: null,
        resolvedAt: null,
        isArchived: false,
        searchTags: [`kind:${t.kind}`, `importance:${makeCritical ? "critical" : t.importance}`, `author:${author.id}`],
      });
      count("journalEntries");
      if (makeCritical) count("criticalNotes");
    }
    // FORD: about half the clients have a detail or two.
    if (r() < 0.5) {
      const m = between(r, 1, 2);
      for (let i = 0; i < m; i += 1) {
        const pillar = pick(r, ["family", "occupation", "recreation", "dreams"] as const);
        const author = pick(r, TRAINERS);
        const at = new Date(NOW.getTime() - between(r, 1, 120) * DAY_MS);
        const dated = r() < 0.25;
        put(`clients/${c.id}/ford/lab-ford-${i}`, {
          clientId: c.id,
          studioId: STUDIO_ID,
          pillar,
          body: pick(r, [
            "Granddaughter's wedding in the spring; wants to dance the whole night.",
            "Retiring from teaching at the end of the school year.",
            "Training for a charity 5K walk with her sister.",
            "Daughter just started college in Columbus.",
            "Wants to carry the groceries up the stairs without stopping.",
            "Plays pickleball three mornings a week.",
          ]),
          subject: null,
          isPinned: r() < 0.1,
          eventDate: dated ? ts(new Date(NOW.getTime() + between(r, -3, 14) * DAY_MS)) : null,
          recurrence: dated && r() < 0.5 ? "annual" : "none",
          effectiveFrom: null,
          effectiveUntil: null,
          repeat: null,
          reviewedAt: null,
          opportunity: null,
          followUp: null,
          followUpAt: null,
          followUpBy: null,
          occurredAt: ts(at),
          createdAt: ts(at),
          updatedAt: ts(at),
          authorId: author.id,
          authorName: fullName(author),
          authorInitials: author.initials,
          origin: "profile",
          sessionId: null,
          isArchived: false,
        });
        count("ford");
      }
    }
  }
}

function buildBoard(): void {
  const titles = [
    "Leg press seat pin replaced",
    "New package pricing from the 1st",
    "Huddle moved to 7:15 on Fridays",
    "Clean the pads on the chest press between clients",
    "Holiday hours: closed Thanksgiving Day",
  ];
  titles.forEach((title, i) => {
    put(`hub_announcements/lab-announcement-${i}`, {
      title,
      shortContent: `${title}.`,
      longContent: `${title}. Ask Lena if anything is unclear.`,
      type: i === 1 ? "policy" : "general",
      priority: i === 0 ? "high" : "normal",
      authorId: LAB_UID,
      authorName: "Lena Labrador",
      scope: "studio",
      studioId: STUDIO_ID,
      targetStudioIds: [STUDIO_ID],
      expiresAt: ts(new Date(NOW.getTime() + 20 * DAY_MS)),
      isActive: true,
      readBy: [],
      createdAt: ts(new Date(NOW.getTime() - (i + 1) * DAY_MS)),
    });
    count("announcements");
  });
  for (let i = 0; i < 25; i += 1) {
    const actor = TRAINERS[1 + (i % 5)];
    put(`trainers/${LAB_UID}/notifications/lab-notification-${i}`, {
      kind: i % 3 === 0 ? "kudos" : "task_assigned",
      title: i % 3 === 0 ? `${actor.firstName} sent you kudos` : `${actor.firstName} handed you a job`,
      body: "From the perf lab seed.",
      studioId: STUDIO_ID,
      actor: { id: actor.id, name: fullName(actor) },
      createdAt: ts(new Date(NOW.getTime() - i * 5 * 3600000)),
      readAt: i < 6 ? null : ts(new Date(NOW.getTime() - i * 4 * 3600000)),
    });
    count("notifications");
  }
}

/*
 * THE NIGHTLY JOB'S DOCUMENTS, by its own pure core: what server/renewals-job.ts
 * and server/journey-step.ts would write tonight over this data, so
 * Operations, the Directory and the Hub's All stars do the work they do in
 * production. Each client's renewal snapshot (buildRenewalSnapshot over the
 * attendance the job reads), then nightStudio for the states, the summary
 * and All stars. The studio's settings and Max Strength's defaults are
 * unset, so the lines are the app's, as a screen resolves them.
 */
function buildNightly(clients: LabClient[]): { states: number; allStars: number; counts: Record<string, number> } {
  const settings = normalizeRenewalSettings(undefined);
  const nameIndex = buildPackageNameIndex(settings);
  const cutovers = [{ id: STUDIO_ID, journeyCutoverDate: addDays(TODAY, -400) }];
  const marks = bookingMarks(markRows);
  const machineNames = Object.fromEntries(MACHINES.map((m) => [m.id, m.name]));
  let earliest: unknown = null;
  for (const list of bookingsByClient.values()) {
    for (const b of list) {
      const at = (b.startTime as unknown as Timestamp).toMillis();
      if (!earliest || at < (earliest as Timestamp).toMillis()) earliest = b.startTime;
    }
  }
  const attendanceSince = attendanceSinceOf(earliest, TZ);
  const visitDaysByClient = new Map<string, string[]>();
  const loggedDaysByClient = new Map<string, string[]>();
  const snapshots = new Map<string, NonNullable<Client["renewal"]>>();
  const withIds: Client[] = [];
  const loggedFrom = addDays(TODAY, -ALL_STARS_READ_DAYS);
  for (const c of clients) {
    const data = clientDocs.get(c.id)!;
    const client = { id: c.id, ...data } as unknown as Client;
    const schedules = bookingsByClient.get(c.id) ?? [];
    const sessions = sessionsByClient.get(c.id) ?? [];
    const attendance = [
      ...attendanceFromSchedules(schedules as never, NOW, TZ, {
        logged: loggedSessions(sessions as never, TZ),
        cutoverOf: (studioId: string) => cutoverOf(cutovers, studioId),
        marks,
      } as never),
      ...attendanceFromSessions(sessions, TZ, TODAY),
    ];
    const snapshot = buildRenewalSnapshot({
      client,
      settings,
      today: TODAY,
      attendance,
      sessionFeel: feelFromSessions(sessions, TZ),
      machineNames,
      attendanceSince,
      nameIndex,
      lastVisitHint: null,
    } as never);
    snapshots.set(c.id, snapshot as never);
    // The job writes the snapshot onto the client (the rules keep it the job's alone).
    data.renewal = { ...snapshot, computedAt: ts(NOW) };
    withIds.push({ ...client, renewal: snapshot } as Client);
    visitDaysByClient.set(c.id, attendance.filter((a) => a.kind === "visit").map((a) => a.day));
    const days = new Set<string>();
    for (const s of sessions) {
      const day = sessionDayKey(s as never, TZ);
      if (day && day >= loggedFrom) days.add(day);
    }
    loggedDaysByClient.set(c.id, [...days].sort());
  }
  const night = nightStudio({
    studioId: STUDIO_ID,
    today: TODAY,
    now: NOW,
    tz: TZ,
    studios: [{ id: STUDIO_ID, name: "Lakeside", journeyCutoverDate: addDays(TODAY, -400) }],
    clients: withIds,
    snapshots: snapshots as never,
    bookingsByClient,
    visitDaysByClient,
    loggedDaysByClient,
    loggedFrom,
    packageIndex: nameIndex,
    breakDays: settings.breakDays,
    lines: linesOf(resolveAll({ studio: null, company: null, studioDoc: null } as never)),
    previous: new Map(),
    marks: new Map(),
  });
  const computedAt = ts(NOW);
  for (const [clientId, doc] of night.states) {
    put(`studios/${STUDIO_ID}/${CLIENT_STATES}/${clientId}`, { ...doc, computedAt });
    count("clientStates");
  }
  if (night.allStars) put(`studios/${STUDIO_ID}/watch/${HUB_MARKS_ID}`, { allStars: night.allStars, computedAt });
  put(`studios/${STUDIO_ID}/watch/${JOURNEY_WATCH_ID}`, { ...night.summary, computedAt });
  return { states: night.states.size, allStars: night.allStars?.length ?? 0, counts: night.summary.counts as Record<string, number> };
}

/* ── Main ──────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const started = Date.now();
  console.log(`Perf lab seed: studio day ${TODAY}, ${CLIENTS} clients, project ${PROJECT_ID}, database ${DATABASE_ID}.`);
  await clearEmulators();

  const app = initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(app, DATABASE_ID);
  db.settings({ ignoreUndefinedProperties: true });

  // The lab's user: an Auth emulator account and the role claim the rules read first.
  await getAuth(app).createUser({ uid: LAB_UID, email: creds.email, password: creds.password, displayName: "Lena Labrador", emailVerified: true });
  await getAuth(app).setCustomUserClaims(LAB_UID, { role: "StudioLeader" });

  buildStudio();
  const clients = buildClients();
  const appts = buildAppointments(clients);
  buildBookings(appts);
  const histories = buildHistories(clients, appts);
  for (const c of clients) buildClientDocs(c, histories.get(c.id)!);
  buildNotes(clients, appts);
  buildBoard();
  const nightly = buildNightly(clients);

  const today = appts.filter((a) => a.day === TODAY && !a.cancelled).length;
  const tomorrow = appts.filter((a) => a.day === addDays(TODAY, 1) && !a.cancelled).length;
  const priorCounts = { prior: 0, prior300: 0, unconfirmed: 0, new: 0 };
  for (const c of clients) {
    priorCounts[c.history] += 1;
    if (c.priorSessions >= 300) priorCounts.prior300 += 1;
  }
  // The focus clients, by the scenario that opens each: who, and how deep her record is.
  const focus: Record<string, unknown> = {};
  for (const c of clients.filter((x) => x.focus)) {
    const h = histories.get(c.id)!;
    focus[c.focus!] = {
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      lastName: c.lastName,
      priorSessions: c.priorSessions,
      journeySessions: h.sessions.length,
      exerciseLogs: h.logs.length,
      machinesPerSession: c.routineA.length,
      booked: `${addDays(TODAY, FOCUS.find((f) => f.role === c.focus)!.bookDelta)} ${String(FOCUS.find((f) => f.role === c.focus)!.bookHour).padStart(2, "0")}:00`,
    };
  }
  console.log(`Writing ${docs.length} documents...`);
  await writeAll(db);
  const summary = {
    today: TODAY,
    /** The held "now" (09:40 Eastern on the seed's day): the driver's Date shim starts every page here. */
    anchorMs: NOW.getTime(),
    anchorIso: NOW.toISOString(),
    documents: docs.length,
    ...counts,
    bookingsToday: today,
    bookingsTomorrow: tomorrow,
    clientsByHistory: priorCounts,
    focus,
    nightly,
    seconds: Math.round((Date.now() - started) / 1000),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (process.env.PERF_LAB_SEED_SUMMARY) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(process.env.PERF_LAB_SEED_SUMMARY, JSON.stringify(summary, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
