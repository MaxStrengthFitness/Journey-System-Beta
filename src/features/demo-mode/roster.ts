import { MODEL_AB_ROUTINE } from "../routine-builder/academy";

/**
 * THE DEMO ROSTER — six clients and three trainers.
 *
 * Every one of them exists to teach something. A demo studio full of
 * interchangeable people proves nothing; these six between them cover the
 * whole app — the floor, the renewal conversation, an empty profile, and the
 * migration off FileMaker.
 *
 * ── The names ────────────────────────────────────────────────────────────
 *
 * AJ's easter egg (Sep 16 2026): every demo person is a Lord of the Rings
 * nod. His refinement (Sep 20): it has to be SUBTLE. Barliman Butterbur and
 * Lobelia Sackville-Baggins read as comedy; Mablung, Damrod and Ioreth read
 * as random foreign strings to anyone who has not read the appendices. Both
 * fail the same test — they announce themselves.
 *
 * The rule that works: Tolkien built the Shire's surnames out of real English
 * rural naming, so a lot of them ARE ordinary surnames. Cotton, Bolger,
 * Burrows, Chubb, Gardner, Underhill, Roper, Hayward, Appledore and Fairbairn
 * all pass as real people. Pair them with plain first names and the name reads
 * as a normal client to a stranger while a reader quietly notices.
 *
 * No Fellowship, no Gandalf, nothing anyone would call obvious.
 *
 * ── The addresses ────────────────────────────────────────────────────────
 *
 * Every email is @demo.invalid — a reserved TLD (RFC 2606) that can never
 * route anywhere. The app contacts nobody by design; this is the second lock.
 */

export interface DemoClientSeed {
  key: string;
  firstName: string;
  lastName: string;
  gender: "Male" | "Female";
  age: number;
  height: string;
  weight: string;
  /**
   * Completed sessions to lay down IN JOURNEY.
   *
   * `sessions + remainingSessions` is always a real package size (48, 96 or
   * 144) on purpose, so the package the seeder writes reconciles exactly:
   * what Mindbody says has been used is what Journey has recorded. A demo
   * where two screens disagree about the same client by twenty sessions is a
   * demo that invites the one question you cannot answer.
   */
  sessions: number;
  remainingSessions: number;
  /**
   * Sessions this client did before the cutover, which Journey never saw.
   * Non-zero on exactly one client on purpose — see `esme` below.
   */
  priorSessions: number;
  /** Which model A/B pair to program, straight from the Academy documents. */
  preference: keyof typeof MODEL_AB_ROUTINE;
  /** Every fourth set is marked poor for these, so quality marks vary. */
  hasRoughSets: boolean;
  /** Days since the last session. Drives the attendance watch. */
  daysSinceLastSession: number;
  /** One line explaining what this client is here to teach. */
  teaches: string;
}

export const DEMO_CLIENTS: DemoClientSeed[] = [
  {
    key: "elanor",
    firstName: "Elanor",
    lastName: "Gardner",
    gender: "Female",
    age: 72,
    height: "5' 4\"",
    weight: "148",
    sessions: 42,
    remainingSessions: 54,
    priorSessions: 0,
    preference: "female",
    hasRoughSets: false,
    daysSinceLastSession: 3,
    teaches:
      "A long, clean journey — the Journey grid at its best, and the client to run a check-in on.",
  },
  {
    key: "hal",
    firstName: "Hal",
    lastName: "Underhill",
    gender: "Male",
    age: 58,
    height: "5' 11\"",
    weight: "203",
    sessions: 14,
    remainingSessions: 34,
    priorSessions: 0,
    preference: "male",
    hasRoughSets: true,
    daysSinceLastSession: 4,
    teaches:
      "Mixed rep quality — the red kaizen mark, the machine note, and why the next trainer needs both.",
  },
  {
    key: "rosie",
    firstName: "Rosie",
    lastName: "Cotton",
    gender: "Female",
    age: 68,
    height: "5' 3\"",
    weight: "141",
    sessions: 45,
    remainingSessions: 3,
    priorSessions: 0,
    preference: "female",
    hasRoughSets: false,
    daysSinceLastSession: 2,
    teaches:
      "Three sessions left — the renewal conversation, and the pipeline on Operations.",
  },
  {
    key: "milo",
    firstName: "Milo",
    lastName: "Burrows",
    gender: "Male",
    age: 45,
    height: "6' 0\"",
    weight: "196",
    sessions: 2,
    remainingSessions: 46,
    priorSessions: 0,
    preference: "male",
    hasRoughSets: false,
    daysSinceLastSession: 5,
    teaches:
      "Brand new — first-time machine set-up, and the honest empty states on a profile with almost nothing in it.",
  },
  {
    key: "esme",
    firstName: "Esme",
    lastName: "Bolger",
    gender: "Female",
    age: 81,
    height: "5' 2\"",
    weight: "133",
    sessions: 8,
    /*
     * The migration case, and the most important client in the demo.
     *
     * 304 sessions in FileMaker, 8 in Journey. Her profile has to read
     * "312 sessions, 8 of them here" and NOT "new client" — which is the
     * whole of `docs/business/migration-and-prior-history.md` in one screen,
     * and the answer to "did we lose twelve years of records".
     */
    priorSessions: 304,
    remainingSessions: 40,
    preference: "neutral",
    hasRoughSets: false,
    daysSinceLastSession: 6,
    teaches:
      "Twelve years before Journey — prior history is real history, and an empty grid means 'no detail here', never 'this never happened'.",
  },
  {
    key: "andy",
    firstName: "Andy",
    lastName: "Roper",
    gender: "Male",
    age: 54,
    height: "5' 9\"",
    weight: "178",
    sessions: 19,
    remainingSessions: 29,
    priorSessions: 0,
    preference: "male",
    hasRoughSets: true,
    /* Six weeks away — the attendance watch on the Overview has something real to find. */
    daysSinceLastSession: 43,
    teaches:
      "Back after a break — the attendance anomaly a studio leader is supposed to catch on a Monday.",
  },
];

/**
 * THE DEMO TEAM.
 *
 * AJ's call (Sep 20 2026): demo trainers get their OWN records rather than
 * demo sessions being coached by the real team. Two reasons it is the better
 * answer:
 *
 *  - `trainers` is shared across every studio and is not studio-scoped, so a
 *    demo session coached by a real trainer would land on that person's real
 *    career totals. With demo trainers, the rollups write to demo trainer
 *    documents and the leak closes itself — no Cloud Functions change needed.
 *  - The studio-leader half of the app (Team, Staff & Roles, the Overview's
 *    "Team this week") has nobody on it otherwise, and that is exactly the
 *    half a studio leader is being shown.
 *
 * Initials are distinct, because they are what appears in the Journey grid's
 * header and a trainer reads them at a glance.
 */
export interface DemoTrainerSeed {
  key: string;
  firstName: string;
  lastName: string;
  initials: string;
  role: "StudioLeader" | "LifeTransformer";
  /** Roughly how much of the seeded history this trainer coached. */
  share: number;
}

export const DEMO_TRAINERS: DemoTrainerSeed[] = [
  {
    key: "hob",
    firstName: "Hob",
    lastName: "Hayward",
    initials: "HH",
    role: "StudioLeader",
    share: 0.3,
  },
  {
    key: "tom",
    firstName: "Tom",
    lastName: "Appledore",
    initials: "TA",
    role: "LifeTransformer",
    share: 0.4,
  },
  {
    key: "robin",
    firstName: "Robin",
    lastName: "Fairbairn",
    initials: "RF",
    role: "LifeTransformer",
    share: 0.3,
  },
];

/** The A/B pair for a demo client, taken from the Academy's model routine. */
export function routinesFor(seed: DemoClientSeed): {
  a: string[];
  b: string[];
} {
  return MODEL_AB_ROUTINE[seed.preference];
}

/**
 * What a client's profile should say in total — Journey's own count plus what
 * came before it. Mirrors `src/lib/prior-history.ts`; the seeder writes the
 * prior record so the app's own arithmetic produces this number rather than
 * the seeder asserting it.
 */
export function totalSessionsFor(seed: DemoClientSeed): number {
  return seed.sessions + seed.priorSessions;
}
