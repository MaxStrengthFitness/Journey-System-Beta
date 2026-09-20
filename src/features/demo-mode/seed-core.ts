/**
 * THE SEEDER'S PURE HALF.
 *
 * Everything that decides WHAT the demo studio contains lives here, and
 * nothing here talks to Firestore. `buildDemoSeed()` returns a flat list of
 * `{ path, data }` documents; `seed-write.ts` lays them down with the client
 * SDK from inside the app, and `scripts/seed-demo.ts` lays down the identical
 * list with the Admin SDK. One definition of the data, two ways to write it —
 * so the tests in `seed.test.ts` assert over the very documents that ship.
 *
 * ── Determinism is the whole design ──────────────────────────────────────
 *
 * Every id is derived, never generated, and every number comes from a seeded
 * PRNG keyed on that id. Three things follow from that, and they are the
 * reason it is built this way:
 *
 *  1. **The seeder is its own reset.** Re-running it writes the same document
 *     ids with the same content, so "Set up Demo Mode" and "Reset Demo Mode"
 *     are the same button. Nothing has to be deleted first, and a half-failed
 *     run is fixed by running it again.
 *  2. **The demo is the same everywhere.** AJ's laptop, the Render service and
 *     a trainer's iPad all show the same six people with the same weights, so
 *     "look at Esme's profile" means the same thing in two rooms.
 *  3. **It can be tested.** A generated history that changed every run could
 *     only be eyeballed.
 *
 * ── Timestamps ───────────────────────────────────────────────────────────
 *
 * Firestore Timestamps cannot be built here without importing the SDK, and
 * writing an ISO string where a Timestamp belongs is a documented trap in
 * this repo — it silently removes the document from every `createdAt` range
 * query, which is Insights, Hours, Exports and machine trends. So the core
 * emits a `{ __ts }` sentinel and each writer converts it. A plain ISO string
 * in the output is therefore always deliberate: `date` and `lastSessionDate`
 * really are strings.
 */

import { MACHINE_DEFINITION_LIST } from "../../data/machine-definitions";
import { rollupFromHistory } from "../../lib/client-rollups";
import type { Trainer } from "../../types";
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_FLAG,
  DEMO_SEED_VERSION,
  DEMO_STUDIO_ID,
  DEMO_STUDIO_NAME,
  DEMO_STUDIO_TAGLINE,
  DEMO_STUDIO_TIMEZONE,
} from "./constants";
import {
  DEMO_CLIENTS,
  DEMO_TRAINERS,
  routinesFor,
  type DemoClientSeed,
  type DemoTrainerSeed,
} from "./roster";

/* ── Timestamps ─────────────────────────────────────────────────────────── */

export type TsSentinel = { __ts: string };
export const ts = (iso: string): TsSentinel => ({ __ts: iso });
export function isTsSentinel(value: unknown): value is TsSentinel {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TsSentinel).__ts === "string"
  );
}

/* ── Documents ──────────────────────────────────────────────────────────── */

export interface SeedDoc {
  /** Slash-separated Firestore path, e.g. `clients/demo-client-elanor`. */
  path: string;
  data: Record<string, unknown>;
  /** Merge rather than replace. Roster docs only — see buildRoster. */
  merge?: boolean;
}

export interface DemoSeed {
  docs: SeedDoc[];
  /** What a caller can show the person who pressed the button. */
  summary: {
    studioId: string;
    clients: number;
    trainers: number;
    sessions: number;
    sets: number;
    machines: number;
    /** Catalog documents the roster points at. The writer must check these
     *  exist: resolveMachine() returns null without them and the machine is
     *  silently dropped from the floor. */
    requiresCatalog: string[];
  };
}

/* ── Deterministic randomness ───────────────────────────────────────────── */

/** FNV-1a. Small, stable across engines, good enough to seed mulberry32. */
function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — 32 bits of state, uniform enough for weights and reps. */
function rngFor(key: string): () => number {
  let a = hashOf(key);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [lo, hi], inclusive. */
function between(rand: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/* ── Dates, as the studio's own day ─────────────────────────────────────── */

const DAY_MS = 86400000;

/** `YYYY-MM-DD` arithmetic that never touches a local timezone. */
export function addDays(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d) + delta * DAY_MS);
  return at.toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * An instant on this studio day that reads as a real session time.
 *
 * Eastern is UTC-4 or UTC-5 depending on the season, so a UTC hour between 13
 * and 21 is always the SAME calendar day in Eastern — 8am to 5pm in summer,
 * 7am to 4pm in winter. That sidesteps DST entirely without a timezone
 * library, and it deliberately never lands on `T12:00:00.000Z`, which the
 * History screen reads as the "logged after the fact" sentinel.
 */
function instantOn(dayKey: string, rand: () => number): string {
  return `${dayKey}T${pad(between(rand, 13, 21))}:${pad(between(rand, 0, 11) * 5)}:00.000Z`;
}

/* ── Ids ────────────────────────────────────────────────────────────────── */

export const demoTrainerId = (key: string) => `demo-trainer-${key}`;
export const demoClientId = (key: string) => `demo-client-${key}`;
/** Zero-padded to three, so ids sort the way the sessions happened. */
export const demoSessionId = (clientKey: string, index: number) =>
  `demo-session-${clientKey}-${String(index + 1).padStart(3, "0")}`;
export const demoRoutineId = (clientKey: string, slot: "a" | "b") =>
  `demo-routine-${clientKey}-${slot}`;

/** The app's own derived exercise-log id, so a live set overwrites a seeded
 *  one instead of doubling it (`src/lib/exercise-log-id.ts`). */
export const demoLogId = (sessionId: string, machineId: string) =>
  `${sessionId}_${machineId}`;

/* ── The floor ──────────────────────────────────────────────────────────── */

/** The standard set, in the catalog's own order. */
export const DEMO_MACHINES = MACHINE_DEFINITION_LIST.filter(
  (m) => m.inStandardSet !== false,
).sort((a, b) => (a.defaultOrder ?? 999) - (b.defaultOrder ?? 999));

const MACHINE_BY_ID = new Map(DEMO_MACHINES.map((m) => [m.id, m]));

/** Dial labels for a machine — what `clientMachineSettings.settings` is keyed
 *  by, because that is what the app's own writers produce. */
function dialLabels(machineId: string): string[] {
  const def = MACHINE_BY_ID.get(machineId);
  return (def?.settingFields ?? [])
    .map((f) => (f.label || f.key || "").trim())
    .filter(Boolean);
}

/** The starting load for this client on this machine, from the catalog. */
function baselineFor(machineId: string, seed: DemoClientSeed): number {
  const load = MACHINE_BY_ID.get(machineId)?.baselineLoad;
  const base =
    (seed.gender === "Female" ? load?.female : load?.male) ??
    load?.male ??
    load?.female ??
    40;
  /* Older and lighter clients start lower; this is a demo, not a model. */
  const scale = seed.age >= 75 ? 0.6 : seed.age >= 65 ? 0.8 : 1;
  return Math.max(5, Math.round((base * scale) / 5) * 5);
}

/* ── The studio, its team and its floor ─────────────────────────────────── */

interface SeedContext {
  /** The studio day the seed is laid down on — `YYYY-MM-DD`. */
  today: string;
  /** Who pressed the button. Stamped as the author of everything. */
  seededBy: { id: string; name: string };
}

function buildStudio(ctx: SeedContext): SeedDoc {
  return {
    path: `studios/${DEMO_STUDIO_ID}`,
    data: {
      name: DEMO_STUDIO_NAME,
      address: DEMO_STUDIO_TAGLINE,
      timezone: DEMO_STUDIO_TIMEZONE,
      /*
       * "offline" is the difference between a studio deliberately not on
       * Mindbody and one whose Site ID somebody forgot. It also means the
       * nightly renewals job never queues a pull for this studio, so the
       * seeded package data below is never overwritten.
       */
      mindbodyMode: "offline",
      locationType: "corporate",
      /*
       * Before every seeded session, so `historyCoverage()` reads this
       * studio's records as complete and the Journey grid speaks with
       * confidence instead of hedging every number.
       */
      journeyCutoverDate: addDays(ctx.today, -400),
      sessionMinutes: 30,
      ownerId: ctx.seededBy.id,
      [DEMO_FLAG]: true,
      demoSeedVersion: DEMO_SEED_VERSION,
      demoSeededAt: ts(`${ctx.today}T12:00:00.000Z`),
      demoSeededBy: ctx.seededBy.name,
      createdAt: ts(`${addDays(ctx.today, -400)}T12:00:00.000Z`),
    },
  };
}

function buildTrainer(seed: DemoTrainerSeed): SeedDoc {
  return {
    path: `trainers/${demoTrainerId(seed.key)}`,
    data: {
      fullName: `${seed.firstName} ${seed.lastName}`,
      initials: seed.initials,
      role: seed.role,
      primaryHomeStudioId: DEMO_STUDIO_ID,
      accessibleStudioIds: [DEMO_STUDIO_ID],
      activeGuestStudioIds: [],
      email: `${seed.key}@${DEMO_EMAIL_DOMAIN}`,
      photoUrl: null,
      isVisibleOnCalendar: true,
      mindbodyLinked: false,
      /*
       * No Auth account stands behind these three, which is exactly what
       * `pendingClaim` means. It is NOT `provisional` — that would put them
       * in the "waiting to reconcile" queue on a real Operations screen,
       * which is a queue about real people.
       */
      pendingClaim: true,
      [DEMO_FLAG]: true,
    },
  };
}

/**
 * The studio's roster: the standard set, adopted from the catalog.
 *
 * Merged rather than replaced, because this is the one collection a person
 * may legitimately have edited between runs — renaming a unit or changing a
 * dial default inside Demo Mode is a thing worth practising, and a reset that
 * silently threw that away would teach the wrong lesson about the app.
 */
function buildRoster(ctx: SeedContext): SeedDoc[] {
  return DEMO_MACHINES.map((machine) => ({
    path: `studios/${DEMO_STUDIO_ID}/roster/${machine.id}`,
    merge: true,
    data: {
      machineId: machine.id,
      studioId: DEMO_STUDIO_ID,
      source: "catalog",
      basedOn: machine.id,
      status: "active",
      order: machine.defaultOrder,
      updatedAt: ts(`${ctx.today}T12:00:00.000Z`),
      updatedBy: ctx.seededBy.id,
      [DEMO_FLAG]: true,
    },
  }));
}

/* ── A client's history ─────────────────────────────────────────────────── */

/**
 * Machines run as a timed static hold rather than counted reps, so the grid
 * shows both kinds of cell and a trainer practising meets both controls.
 */
const HOLD_MACHINES = new Set(["m-lumbar", "m-abs"]);

/** Sessions land twice a week — the shape of every package the studios sell. */
const GAP_DAYS = [3, 4];

/** The weight step this machine moves in, from how heavy it starts. */
function stepFor(base: number): number {
  return base >= 100 ? 10 : base >= 50 ? 5 : 2.5;
}

/** A dial value that looks like somebody set it, and never moves after. */
function dialValue(rand: () => number, label: string): string {
  if (/angle/i.test(label)) return String(between(rand, 1, 4));
  if (/handle|arm/i.test(label)) return String(between(rand, 1, 5));
  return String(between(rand, 1, 10));
}

/** The trainer for session `i`, allocated by each trainer's stated share. */
function trainerForSession(index: number, total: number): DemoTrainerSeed {
  /* Deterministic round-robin weighted by `share`: walk the cumulative
     shares and take whichever band this session's position falls in. Uses
     the session's position rather than the PRNG so the split is exact
     rather than approximately right. */
  const position = ((index * 7) % Math.max(total, 1)) / Math.max(total, 1);
  let running = 0;
  for (const trainer of DEMO_TRAINERS) {
    running += trainer.share;
    if (position < running) return trainer;
  }
  return DEMO_TRAINERS[DEMO_TRAINERS.length - 1];
}

interface BuiltSession {
  id: string;
  date: string;
  index: number;
  trainer: DemoTrainerSeed;
  routineSlot: "a" | "b";
  machineIds: string[];
  startIso: string;
  endIso: string;
}

interface BuiltLog {
  sessionId: string;
  machineId: string;
  weight: string;
  reps: string;
  seconds: string;
  hold: boolean;
  outcome: "performed" | "practice" | "skipped" | "not_reached";
  repQuality?: 1 | 2 | 3;
  skipReason?: string;
}

/**
 * Lay out one client's sessions backwards from their last visit, then walk
 * FORWARDS through them so each machine's weight can climb from its baseline.
 */
function buildHistory(
  seed: DemoClientSeed,
  ctx: SeedContext,
): { sessions: BuiltSession[]; logs: BuiltLog[] } {
  const rand = rngFor(`history:${seed.key}`);
  const routines = routinesFor(seed);
  const lastDay = addDays(ctx.today, -seed.daysSinceLastSession);

  const sessions: BuiltSession[] = [];
  let day = lastDay;
  for (let back = 0; back < seed.sessions; back += 1) {
    const index = seed.sessions - 1 - back;
    const slot: "a" | "b" = index % 2 === 0 ? "a" : "b";
    const start = instantOn(day, rand);
    sessions.push({
      id: demoSessionId(seed.key, index),
      date: day,
      index,
      trainer: trainerForSession(index, seed.sessions),
      routineSlot: slot,
      machineIds: routines[slot],
      startIso: start,
      /* Twenty minutes of work, plus set-up and the wrap-up. */
      endIso: new Date(
        new Date(start).getTime() + between(rand, 26, 34) * 60000,
      ).toISOString(),
    });
    day = addDays(day, -GAP_DAYS[back % GAP_DAYS.length]);
  }
  sessions.reverse();

  /* Forwards, so the weights progress. */
  const logs: BuiltLog[] = [];
  const current = new Map<string, number>();
  let setCounter = 0;

  for (const session of sessions) {
    session.machineIds.forEach((machineId, position) => {
      setCounter += 1;
      const hold = HOLD_MACHINES.has(machineId);
      const base = baselineFor(machineId, seed);
      const step = stepFor(base);

      let weight = current.get(machineId);
      if (weight === undefined) weight = base;
      else if (rand() < 0.34) weight += step; // climbs about every third time

      /*
       * The last machine of roughly one session in nine is never reached —
       * the twenty minutes ran out. `not_reached` is the outcome no trainer
       * ever types; the app derives it, and it is the difference between
       * "we chose to leave it" and "we did not get there".
       */
      const ranOut =
        position === session.machineIds.length - 1 && rand() < 0.11;
      /* Rough clients skip a set now and then — a tender knee, a busy floor. */
      const skipped = !ranOut && seed.hasRoughSets && rand() < 0.045;

      const outcome: BuiltLog["outcome"] = ranOut
        ? "not_reached"
        : skipped
          ? "skipped"
          : "performed";

      if (outcome === "performed") current.set(machineId, weight);

      let repQuality: 1 | 2 | 3 | undefined;
      if (outcome === "performed") {
        if (seed.hasRoughSets && setCounter % 4 === 0) repQuality = 1;
        else if (setCounter % 13 === 0) repQuality = 3;
        else repQuality = 2;
      }

      logs.push({
        sessionId: session.id,
        machineId,
        weight: outcome === "performed" ? String(weight) : "0",
        reps: outcome === "performed" && !hold ? String(between(rand, 6, 12)) : "0",
        seconds:
          outcome === "performed" && hold ? String(between(rand, 9, 18) * 5) : "0",
        hold,
        outcome,
        ...(repQuality ? { repQuality } : {}),
        ...(skipped
          ? { skipReason: rand() < 0.5 ? "pain_injury" : "machine_occupied" }
          : {}),
      });
    });
  }

  return { sessions, logs };
}

/* ── The documents a client's history becomes ───────────────────────────── */

function sessionDoc(
  seed: DemoClientSeed,
  session: BuiltSession,
  clientId: string,
): SeedDoc {
  return {
    path: `sessions/${session.id}`,
    data: {
      clientId,
      clientName: `${seed.firstName} ${seed.lastName}`,
      mindbodyClientId: null,
      /* The studio's own day, as a string. Every history read orders by it. */
      date: session.date,
      startTime: ts(session.startIso),
      endTime: ts(session.endIso),
      clientStartTime: session.startIso,
      /* MUST be a Timestamp: every admin range query filters createdAt, and
         an ISO string here removes the session from all of them. */
      createdAt: ts(session.startIso),
      hostedAtStudioId: DEMO_STUDIO_ID,
      clientHomeStudioId: DEMO_STUDIO_ID,
      /* Written by both the live start and the finish, though it is not on
         the WorkoutSession interface. HistoryCalendar reads it. */
      homeStudioId: DEMO_STUDIO_ID,
      isCrossTrain: false,
      sessionType: "Standard",
      sessionNumber: session.index + 1 + seed.priorSessions,
      status: "Completed",
      trainerId: demoTrainerId(session.trainer.key),
      startedByTrainerId: demoTrainerId(session.trainer.key),
      trainerName: `${session.trainer.firstName} ${session.trainer.lastName}`,
      trainerInitials: session.trainer.initials,
      routineId: demoRoutineId(seed.key, session.routineSlot),
      routineName: session.routineSlot === "a" ? "Routine A" : "Routine B",
      sessionMachineIds: session.machineIds,
      pausedAt: null,
      totalPausedMs: 0,
      /* The client snapshot the cohort analytics are built on — a snapshot
         precisely because these facts change. */
      clientAge: seed.age,
      clientIsRetired: seed.age >= 67,
      [DEMO_FLAG]: true,
    },
  };
}

function logDoc(
  log: BuiltLog,
  clientId: string,
  settings: Record<string, string>,
  createdIso: string,
): SeedDoc {
  const data: Record<string, unknown> = {
    sessionId: log.sessionId,
    clientId,
    machineId: log.machineId,
    studioId: DEMO_STUDIO_ID,
    homeStudioId: DEMO_STUDIO_ID,
    clientHomeStudioId: DEMO_STUDIO_ID,
    /* Strings, everywhere in this app. The adapters parse them. */
    weight: log.weight,
    reps: log.reps,
    seconds: log.seconds,
    isStaticHold: log.hold,
    isTSC: log.hold,
    outcome: log.outcome,
    /* Copied verbatim from the client's settings at write time, exactly as
       the live tracker does — so the grid's settings rail and the log agree. */
    machineSettings: settings,
    createdAt: ts(createdIso),
    updatedAt: ts(createdIso),
    [DEMO_FLAG]: true,
  };
  if (log.repQuality) data.repQuality = log.repQuality;
  if (log.skipReason) data.skipReason = log.skipReason;
  return { path: `exerciseLogs/${demoLogId(log.sessionId, log.machineId)}`, data };
}

/* ── A client ───────────────────────────────────────────────────────────── */

/** The dial values this client uses on every machine the roster carries. */
function settingsFor(seed: DemoClientSeed): Record<string, Record<string, string>> {
  const rand = rngFor(`settings:${seed.key}`);
  const out: Record<string, Record<string, string>> = {};
  for (const machine of DEMO_MACHINES) {
    const map: Record<string, string> = {};
    for (const label of dialLabels(machine.id)) map[label] = dialValue(rand, label);
    out[machine.id] = map;
  }
  return out;
}

/**
 * Rosie is three sessions from the end of a package, and that is the single
 * most valuable thing in the demo after Esme: it is the renewal conversation,
 * and the Operations pipeline with a real row in it.
 *
 * The package is written as the INPUT the renewals engine reads rather than
 * as a finished `renewal` snapshot. The nightly job rebuilds that snapshot
 * from these fields every night and replaces whatever is there, so seeding
 * the answer would be seeding something that gets overwritten; seeding the
 * question means the job keeps producing the same answer. The demo studio has
 * no Mindbody site, so nothing ever re-pulls and overwrites these.
 */
function packageFor(
  seed: DemoClientSeed,
  ctx: SeedContext,
): Record<string, unknown> {
  /*
   * `count` is the package they bought and `remaining` what is left of it,
   * so `count - remaining` is how many they have used — and the roster is
   * built so that number IS their Journey session count. The two screens
   * agree, which is the only reason this is worth computing rather than
   * writing down.
   *
   * The name has to match one of the studio's package names for the engine
   * to find a tier at all (DEFAULT_PACKAGES in features/renewals/settings.ts).
   */
  const count = seed.sessions + seed.remainingSessions;
  const tier = { name: `${count} Sessions - 2X Week`, count };
  return {
    mindbodyServicesSyncedAt: ts(`${ctx.today}T12:00:00.000Z`),
    mindbodyServices: {
      [`demo-svc-${seed.key}`]: {
        serviceId: `demo-svc-${seed.key}`,
        name: tier.name,
        count: tier.count,
        remaining: seed.remainingSessions,
        activeDate: ts(`${addDays(ctx.today, -(seed.sessions * 4 + 14))}T12:00:00.000Z`),
        expirationDate: ts(`${addDays(ctx.today, 240)}T12:00:00.000Z`),
        current: true,
        siteId: null,
        lastPullSyncAt: ts(`${ctx.today}T12:00:00.000Z`),
      },
    },
  };
}

/* ── Everything for one client ──────────────────────────────────────────── */

function buildClient(
  seed: DemoClientSeed,
  ctx: SeedContext,
): { docs: SeedDoc[]; sessions: number; sets: number } {
  const clientId = demoClientId(seed.key);
  const { sessions, logs } = buildHistory(seed, ctx);
  const settings = settingsFor(seed);
  const routines = routinesFor(seed);
  const startedOn = sessions[0]?.date ?? ctx.today;
  const lastDay = sessions[sessions.length - 1]?.date ?? ctx.today;
  const docs: SeedDoc[] = [];

  /* --- the history ---------------------------------------------------- */
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  for (const session of sessions) docs.push(sessionDoc(seed, session, clientId));
  for (const log of logs) {
    const session = sessionById.get(log.sessionId);
    docs.push(
      logDoc(log, clientId, settings[log.machineId] ?? {}, session?.startIso ?? `${lastDay}T13:00:00.000Z`),
    );
  }

  /* --- the rollups, from the app's own pure function ------------------- */
  const rollup = rollupFromHistory(
    sessions.map((s) => ({
      id: s.id,
      status: "Completed",
      date: s.date,
      trainerId: demoTrainerId(s.trainer.key),
      trainerInitials: s.trainer.initials,
      trainerName: `${s.trainer.firstName} ${s.trainer.lastName}`,
    })),
    logs.map((l) => ({
      sessionId: l.sessionId,
      machineId: l.machineId,
      weight: l.weight,
      reps: l.reps,
      seconds: l.seconds,
      isStaticHold: l.hold,
      isTSC: l.hold,
      outcome: l.outcome,
    })),
    DEMO_TRAINERS.map(
      (t) =>
        ({
          id: demoTrainerId(t.key),
          fullName: `${t.firstName} ${t.lastName}`,
          initials: t.initials,
          role: t.role,
          primaryHomeStudioId: DEMO_STUDIO_ID,
          accessibleStudioIds: [DEMO_STUDIO_ID],
          activeGuestStudioIds: [],
        }) as unknown as Trainer,
    ),
  );

  /* What the next session pre-fills from: the last performed set on each
     machine, exactly as `completeWorkoutSession` leaves it. */
  const metrics: Record<string, unknown> = {};
  for (const log of logs) {
    if (log.outcome !== "performed") continue;
    const session = sessionById.get(log.sessionId);
    metrics[log.machineId] = {
      weight: log.weight,
      reps: log.reps,
      seconds: log.seconds,
      isStaticHold: log.hold,
      isTSC: log.hold,
      settings: settings[log.machineId] ?? {},
      lastPerformedDate: ts(session?.startIso ?? `${lastDay}T13:00:00.000Z`),
      lastPerformedSessionNumber: (session?.index ?? 0) + 1,
      lastSessionId: log.sessionId,
    };
  }

  const performed = logs.filter((l) => l.outcome === "performed");
  const lifetimeReps = performed.reduce((n, l) => n + (Number(l.reps) || 0), 0);
  const lifetimeWeight = performed.reduce(
    (n, l) => n + (Number(l.weight) || 0) * (Number(l.reps) || 0),
    0,
  );

  /* --- the client ------------------------------------------------------ */
  const packageFields = packageFor(seed, ctx);
  docs.push({
    path: `clients/${clientId}`,
    data: {
      firstName: seed.firstName,
      lastName: seed.lastName,
      email: `${seed.key}@${DEMO_EMAIL_DOMAIN}`,
      phone: null,
      isActive: true,
      homeStudioId: DEMO_STUDIO_ID,
      gender: seed.gender,
      age: seed.age,
      height: seed.height,
      weight: seed.weight,
      isRetired: seed.age >= 67,
      remainingSessions: seed.remainingSessions,
      completedSessions: seed.sessions,
      /*
       * The reconciled total: what Journey can see PLUS what came before it.
       * The profile recomputes this on every open from the same arithmetic,
       * so seeding it only means the directory reads correctly before anyone
       * has opened the profile once.
       */
      sessionCount: seed.sessions + seed.priorSessions,
      firstSessionDate: startedOn,
      lastSessionDate: lastDay,
      lifetimeReps,
      lifetimeWeight: Math.round(lifetimeWeight),
      currentMachineMetrics: metrics,
      consultationCompleted: true,
      requiresConsultation: false,
      isRoutineBActive: true,
      preferredTodayRoutineId: demoRoutineId(seed.key, "a"),
      ...rollup,
      ...packageFields,
      ...(seed.priorSessions > 0
        ? {
            /*
             * Esme. 304 sessions before Journey ever saw her, and
             * `importedCount: 0` because none of those 304 were brought over
             * as session documents — so her total is 8 + 304 and her profile
             * says "312 sessions", never "new client".
             */
            priorHistory: {
              sessions: seed.priorSessions,
              importedCount: 0,
              from: null,
              through: addDays(startedOn, -1),
              source: "filemaker",
              note: "Twelve years of charts, carried over at the cutover.",
              recordedAt: ts(`${ctx.today}T12:00:00.000Z`),
              recordedById: ctx.seededBy.id,
              recordedByName: ctx.seededBy.name,
            },
          }
        : {}),
      createdAt: ts(`${startedOn}T12:00:00.000Z`),
      updatedAt: ts(`${ctx.today}T12:00:00.000Z`),
      [DEMO_FLAG]: true,
    },
  });

  /* --- the client's machine settings ----------------------------------- */
  for (const machine of DEMO_MACHINES) {
    const map = settings[machine.id] ?? {};
    const last = [...performed].reverse().find((l) => l.machineId === machine.id);
    const first = performed.find((l) => l.machineId === machine.id);
    docs.push({
      path: `clientMachineSettings/${clientId}_${machine.id}`,
      data: {
        clientId,
        machineId: machine.id,
        homeStudioId: DEMO_STUDIO_ID,
        clientHomeStudioId: DEMO_STUDIO_ID,
        settings: map,
        ...(first ? { startingWeight: Number(first.weight) } : {}),
        ...(first ? { startingWeightDate: `${startedOn}T12:00:00.000Z` } : {}),
        ...(last ? { currentWeight: Number(last.weight) } : {}),
        updatedBy: ctx.seededBy.id,
        updatedAt: ts(`${ctx.today}T12:00:00.000Z`),
        [DEMO_FLAG]: true,
      },
    });
  }

  /* --- the A/B pair ---------------------------------------------------- */
  (["a", "b"] as const).forEach((slot) => {
    docs.push({
      path: `routines/${demoRoutineId(seed.key, slot)}`,
      data: {
        clientId,
        studioId: DEMO_STUDIO_ID,
        /* The names are load-bearing exact strings — five screens find a
           routine with `r.name === "Routine A"`. */
        name: slot === "a" ? "Routine A" : "Routine B",
        machineIds: routines[slot],
        createdAt: ts(`${startedOn}T12:00:00.000Z`),
        [DEMO_FLAG]: true,
      },
    });
  });

  return { docs, sessions: sessions.length, sets: logs.length };
}

/* ── The whole seed ─────────────────────────────────────────────────────── */

/**
 * Every document the demo studio is made of, in the order it should be
 * written: the studio first, then the team and the floor, then the people.
 *
 * Nothing here writes anything. Give the result to `seed-write.ts` (inside
 * the app) or `scripts/seed-demo.ts` (Admin SDK) — both lay down the same
 * list, which is why a test over this function is a test of the real thing.
 */
export function buildDemoSeed(options: {
  /** The studio's own day, `YYYY-MM-DD`. */
  today: string;
  seededBy: { id: string; name: string };
}): DemoSeed {
  const ctx: SeedContext = options;
  const docs: SeedDoc[] = [buildStudio(ctx)];
  for (const trainer of DEMO_TRAINERS) docs.push(buildTrainer(trainer));
  docs.push(...buildRoster(ctx));

  let sessions = 0;
  let sets = 0;
  for (const client of DEMO_CLIENTS) {
    const built = buildClient(client, ctx);
    docs.push(...built.docs);
    sessions += built.sessions;
    sets += built.sets;
  }

  return {
    docs,
    summary: {
      studioId: DEMO_STUDIO_ID,
      clients: DEMO_CLIENTS.length,
      trainers: DEMO_TRAINERS.length,
      sessions,
      sets,
      machines: DEMO_MACHINES.length,
      requiresCatalog: DEMO_MACHINES.map((m) => m.id),
    },
  };
}
