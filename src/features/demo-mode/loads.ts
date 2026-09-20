/**
 * WHAT A DEMO CLIENT LIFTS, AND HOW IT MOVES.
 *
 * Round: realistic demo loads, Sep 20 2026. AJ, after looking at the first
 * seeded history: *"our machines can only move up in two pound increments.
 * Some of the current weights have 35 pounds, 32.5, 37, 53. And for some
 * machines like the leg press the client only has 53 pounds."*
 *
 * Three separate things were wrong, and they are worth naming separately
 * because only one of them was a rounding bug.
 *
 *  1. **The numbers were not on the machine.** The old model rounded to 2.5 lb
 *     and added 2-to-6 lb steps, which produces 32.5, 35, 37 and 53 — none of
 *     which any MSF machine can actually be set to.
 *  2. **The starting loads were too light**, because they came from the
 *     catalog's `baselineLoad` (leg press: 160 male / 60 female) and were then
 *     scaled DOWN again for age. A 72-year-old on 50 lb of leg press is not a
 *     client, it is a typo.
 *  3. **Reps had nothing to do with weight.** They were a random 6-to-12 on
 *     every set, so the grid showed a weight going up while the rep count
 *     wandered — which is precisely backwards from how this method works.
 *
 * ── The mechanics, from the Academy ──────────────────────────────────────
 *
 * > "Because our machines can be progressed in two pound increments, we can
 * > make very small, precise increases as the client adapts and gets
 * > stronger."
 * > — `Academy 2/Training with pain (arthritis, fibro myalgia, ...).txt`
 *
 * > "Most clients will start with 20 pounds, the lightest increment available
 * > on this exercise."
 * > — `Initial Setups (…)/Comprehensive Equipment Overview/Cervical Extension.txt`
 * > "Even with the minimal load of twenty pounds, some subjects will be unable
 * > to produce enough force to start the exercise."
 * > — `…/Triceps Extension.txt`
 *
 * So every load in the demo is an **even whole number of at least 20**. That
 * one rule is what kills 32.5, 35, 37 and 53 outright.
 *
 * ── The method, from the Academy ─────────────────────────────────────────
 *
 * > "we should be intentionally underestimating the strength of the new
 * > client in an effort to allow them to learn how to control their movement
 * > without being completely overwhelmed. It should still be challenging as
 * > the set progresses, which would most likely land them at a 10 - 12 or
 * > more rep set."
 * > — `Academy 2/Exercise Selection Template.txt`
 *
 * > "< 6 reps → Load may be too heavy. 6–10 reps → Typically appropriate
 * > challenge. > 10 reps → Load may be too light. ~15 reps → Practical upper
 * > limit. … If 15+ reps are possible with proper quality: End the set.
 * > Increase weight next session."
 * > — `Academy 2/How Intensely to Push a Client.txt`
 *
 * > "Repetition count – if a subject has yet to reach muscular fatigue and is
 * > still within an acceptable rep count range, the number of reps should be
 * > progressed in an effort to approach failure, **before resistance is
 * > added**. … Resistance – weight increases are only considered after the
 * > previous four factors are optimized."
 * > — `Academy 6/Academy - Programming and Progression 5 - Workout Progressions.txt`
 *
 * > "we will only record the number of full repetitions completed with
 * > acceptable form … any progressions in load should be based solely on full
 * > repetitions."
 * > — `Academy/Academy - Registering Performance - Use of the Clicker.txt`
 *
 * That is a **double progression**, and it is the model here: the load is a
 * consequence of the rep count, never a schedule. A client starts below what
 * they can do, the reps come out high, the trainer closes the gap; once the
 * reps sit in the 6-to-10 band the load only moves when the client has
 * genuinely got stronger. Weights therefore stand still most of the time
 * without anybody deciding they should, which is what AJ described from the
 * floor and what the old model faked with a 12% coin flip.
 *
 * ── WHERE THESE NUMBERS COME FROM, AND WHERE THEY SHOULD COME FROM ───────
 *
 * `DEMO_LOADS` below is **not** a Max Strength standard and must never be
 * presented as one. The real table is `MSF - Suggested Starting Weights.xlsx`,
 * which is Drive-only and not in this repo — `docs/msf-academy/README.md` says
 * so explicitly, and the Leg Press setup document refers to "the suggested
 * weight" without reproducing it. Nothing in the committed corpus gives a
 * per-machine starting load.
 *
 * So these are considered demo figures: plausible settled working loads for
 * MSF's protocol (one set to failure in 6–10 reps at a 6-second cadence,
 * which is a far lighter load than a rep-max table would suggest), in the
 * catalog's own relative order. They exist so the demo stops embarrassing
 * itself, and they are laid out in the **exact shape of the empty
 * `standardWeights: { Beginner, Intermediate, Advanced }`** slot on the
 * catalog machine, so that when the spreadsheet arrives the real numbers drop
 * into the catalog and this table can be deleted in favour of reading them.
 */

import { MACHINE_DEFINITION_LIST } from "../../data/machine-definitions";
import type { DemoClientSeed } from "./roster";

/* ── The mechanics ──────────────────────────────────────────────────────── */

/** The lightest anything can be set to. Academy: Cx, Bi, Tri, LE/LC main. */
export const MIN_LOAD = 20;

/** Every machine progresses in two-pound increments (AJ, and the Academy). */
export const LOAD_STEP = 2;

/**
 * A load the machine can actually be set to: an even whole number, at least
 * `MIN_LOAD`. Every weight in the demo passes through here, which is the
 * single reason 32.5 and 53 cannot come back.
 */
export function onTheStack(pounds: number): number {
  const stepped = Math.round(pounds / LOAD_STEP) * LOAD_STEP;
  return Math.max(MIN_LOAD, stepped);
}

/* ── The rep bands ──────────────────────────────────────────────────────── */

/** Where a settled client's set lands. "6–10 reps → typically appropriate." */
export const SETTLED_REPS = 8;

/** "~15 reps → Practical upper limit due to duration and focus." */
export const MAX_REPS = 15;

/** "< 6 reps → Load may be too heavy." Nothing in the demo goes below this. */
export const MIN_REPS = 5;

/**
 * Above this, the load was too light and goes up before the next session.
 * The Academy's explicit trigger is 15+; eleven is the "> 10 reps → load may
 * be too light" line, and a trainer who waits for fifteen every time is not
 * doing the client any favours.
 */
export const ADD_WEIGHT_ABOVE = 10;

/**
 * How many reps one percent of "too light" buys.
 *
 * Calibrated so a client at their settled capability does 8, and a novice
 * deliberately started a quarter under it does about 13–14 — "10 - 12 or
 * more", which is what the Academy says a first session should look like.
 */
const REPS_PER_UNIT_LIGHT = 22;

/* ── The table ──────────────────────────────────────────────────────────── */

export interface DemoLoadEntry {
  /** What a new client is started on, before any client scaling. */
  novice: number;
  /** The settled working load a client of this sex works up to. */
  intermediate: number;
}

/**
 * Per machine, per sex. Reference client: 55 years old, 180 lb male or 145 lb
 * female, training consistently. Every number is even and at least 20, so it
 * is a load the machine can be set to before any scaling happens.
 *
 * `novice` is three quarters of `intermediate` — the Academy's "intentionally
 * underestimating", which lands a first set at 13 or 14 reps rather than 8.
 * ADVANCED IS DELIBERATELY ABSENT: no client in the demo roster is advanced,
 * and inventing a third column would be inventing more of somebody else's
 * standard than this file already does.
 */
export const DEMO_LOADS: Record<string, { male: DemoLoadEntry; female: DemoLoadEntry }> = {
  "m-neck": { male: { novice: 30, intermediate: 40 }, female: { novice: 20, intermediate: 26 } },
  "m-overhead-press": { male: { novice: 52, intermediate: 70 }, female: { novice: 26, intermediate: 34 } },
  "m-lateral-raise": { male: { novice: 38, intermediate: 50 }, female: { novice: 22, intermediate: 30 } },
  "m-pulldown": { male: { novice: 90, intermediate: 120 }, female: { novice: 52, intermediate: 70 } },
  "m-pullover": { male: { novice: 76, intermediate: 100 }, female: { novice: 46, intermediate: 60 } },
  "m-compound-row": { male: { novice: 104, intermediate: 140 }, female: { novice: 60, intermediate: 80 } },
  "m-simple-row": { male: { novice: 76, intermediate: 100 }, female: { novice: 46, intermediate: 60 } },
  "m-chest-press": { male: { novice: 90, intermediate: 120 }, female: { novice: 46, intermediate: 60 } },
  "m-chest-fly": { male: { novice: 60, intermediate: 80 }, female: { novice: 34, intermediate: 46 } },
  "m-bicep": { male: { novice: 46, intermediate: 60 }, female: { novice: 26, intermediate: 34 } },
  "m-tricep-ext": { male: { novice: 46, intermediate: 60 }, female: { novice: 26, intermediate: 34 } },
  "m-dip": { male: { novice: 82, intermediate: 110 }, female: { novice: 46, intermediate: 60 } },
  "m-abs": { male: { novice: 68, intermediate: 90 }, female: { novice: 46, intermediate: 60 } },
  "m-lumbar": { male: { novice: 82, intermediate: 110 }, female: { novice: 52, intermediate: 70 } },
  "m-torso-rotation": { male: { novice: 60, intermediate: 80 }, female: { novice: 42, intermediate: 56 } },
  "m-hip-abd": { male: { novice: 98, intermediate: 130 }, female: { novice: 68, intermediate: 90 } },
  "m-hip-add": { male: { novice: 98, intermediate: 130 }, female: { novice: 68, intermediate: 90 } },
  /* The one AJ named. A compound leg press carries far more than any other
     machine on the floor, and the old catalog number (160 male / 60 female)
     was the single worst thing in the seeded history. */
  "m-leg-press": { male: { novice: 224, intermediate: 300 }, female: { novice: 142, intermediate: 190 } },
  "m-ext": { male: { novice: 82, intermediate: 110 }, female: { novice: 50, intermediate: 66 } },
  "m-leg-curl": { male: { novice: 76, intermediate: 100 }, female: { novice: 46, intermediate: 60 } },
};

/**
 * The fallback for a machine the table does not name — a custom machine a
 * studio added, or a catalog machine added after this was written. Twice the
 * catalog's `baselineLoad`, because that field is the old under-estimate this
 * round exists to correct, and a made-up number in the right ballpark beats a
 * client leg-pressing fifty pounds. A test fails if any STANDARD machine has
 * to come through here.
 */
const CATALOG_BY_ID = new Map(MACHINE_DEFINITION_LIST.map((m) => [m.id, m]));

function fallbackFor(machineId: string, female: boolean): DemoLoadEntry {
  const load = CATALOG_BY_ID.get(machineId)?.baselineLoad;
  const base = (female ? load?.female : load?.male) ?? load?.male ?? load?.female ?? 40;
  const intermediate = onTheStack(base * 2);
  return { novice: onTheStack(intermediate * 0.75), intermediate };
}

/* ── Scaling the table to one person ────────────────────────────────────── */

/**
 * Age. Strength falls away after the middle fifties, and the older client
 * walking through the door for the first time is usually more deconditioned
 * as well — the two compound, which is why the steps widen with age rather
 * than staying linear.
 */
function ageFactor(age: number): number {
  if (age <= 50) return 1.05;
  if (age <= 60) return 1.0;
  if (age <= 70) return 0.88;
  if (age <= 80) return 0.76;
  return 0.66;
}

/**
 * Build. A 196 lb man presses more than a 168 lb man, but nothing like
 * proportionally — the exponent flattens it and the clamp stops a very light
 * or very heavy client from leaving the believable range altogether.
 */
function buildFactor(seed: DemoClientSeed): number {
  const reference = seed.gender === "Female" ? 145 : 180;
  const pounds = Number(seed.weight) || reference;
  const raw = (pounds / reference) ** 0.4;
  return Math.min(1.15, Math.max(0.85, raw));
}

/**
 * Training history. Arwen is 81 and has 304 sessions behind her, and a table
 * that only knew her age would have her lifting less than a sedentary
 * 81-year-old who had never trained — which is the opposite of the point she
 * is in the roster to make. Twelve years of training is worth a quarter, and
 * no more: she is still 81.
 */
function veteranFactor(priorSessions: number): number {
  return 1 + Math.min(0.25, priorSessions / 1200);
}

/**
 * At or above this many sessions behind them, a client is NOT started on the
 * novice load. They are not learning the movement, they are continuing.
 */
export const VETERAN_SESSIONS = 100;

/**
 * This client, on this machine: the load they started on and the load they
 * are working towards, both on the stack.
 *
 * `jitter` is the client's own body rather than noise — people are not
 * uniformly strong across twenty machines, and a demo where every client's
 * profile is the same curve twenty times is a demo of a spreadsheet.
 */
export function loadsFor(
  seed: DemoClientSeed,
  machineId: string,
  jitter: number,
): { start: number; capability: number } {
  const female = seed.gender === "Female";
  const entry = DEMO_LOADS[machineId]?.[female ? "female" : "male"] ?? fallbackFor(machineId, female);

  const scale =
    ageFactor(seed.age) *
    buildFactor(seed) *
    veteranFactor(seed.priorSessions) *
    jitter;

  const capability = onTheStack(entry.intermediate * scale);
  const startFrom = seed.priorSessions >= VETERAN_SESSIONS ? entry.intermediate : entry.novice;
  const start = Math.min(capability, onTheStack(startFrom * scale));
  return { start, capability };
}

/* ── How the load moves ─────────────────────────────────────────────────── */

/**
 * How many performances the trainer spends finding this client's working
 * weight. "We find the learning curve is about 5 to 7 sessions regarding
 * breathing, speed, and form" (the initial consultation script), and the Leg
 * Press document allows a faster climb once control is demonstrated — so the
 * corrections in this window are proportional rather than two pounds.
 */
export const LEARNING_CURVE_PERFORMANCES = 5;

/**
 * While the working weight is still being found, a correction closes this
 * share of the REMAINING GAP to capability rather than taking a flat
 * percentage of it. That one choice is what stops the opening reading like a
 * machine: a flat percentage put four identical twenty-pound jumps on the
 * front of every male client's leg press. Closing the gap decelerates on its
 * own — twenty, then eighteen, then ten, then four — which is what homing in
 * looks like when a trainer is watching the rep count come down.
 */
const FINDING_CLOSES_GAP = 0.4;

/** The most one correction may ever add. AJ: "up to even 20 lb", early only. */
const MAX_FINDING_STEP = 20;

/**
 * How much the load goes up after a set that was too light.
 *
 * Two pounds is the machine, and it is the answer nearly every time. Four is
 * for the set that ran past the Academy's practical upper limit of fifteen —
 * at that point the load is not slightly light, it is wrong.
 */
export function increaseAfter(
  reps: number,
  performances: number,
  capability: number,
  load: number,
): number {
  if (reps <= ADD_WEIGHT_ABOVE) return 0;
  if (performances < LEARNING_CURVE_PERFORMANCES) return findingStep(capability, load);
  return reps >= MAX_REPS ? LOAD_STEP * 2 : LOAD_STEP;
}

/** A correction during the learning curve: part of the gap, on the stack. */
function findingStep(capability: number, load: number): number {
  const gap = Math.max(0, capability - load) * FINDING_CLOSES_GAP;
  const stepped = Math.round(gap / LOAD_STEP) * LOAD_STEP;
  return Math.max(LOAD_STEP, Math.min(MAX_FINDING_STEP, stepped));
}


/**
 * Capability does not stand still: the client gets stronger, which is the
 * whole point of them being here. Fast at first and then flattening, because
 * that is how a novice's curve actually looks and because a straight line
 * would have an 81-year-old still climbing in year twelve.
 *
 * Fifteen per cent over a full history, most of it inside the first three
 * months. Arwen's is a twentieth of that — she is not a novice.
 */
const TOTAL_GAIN = 0.15;
const VETERAN_GAIN = 0.03;
const GAIN_TAU = 15;

export function capabilityAfter(
  base: number,
  performances: number,
  priorSessions: number,
): number {
  const ceiling = priorSessions >= VETERAN_SESSIONS ? VETERAN_GAIN : TOTAL_GAIN;
  const grown = base * (1 + ceiling * (1 - Math.exp(-performances / GAIN_TAU)));
  return onTheStack(grown);
}

/**
 * The reps this load produces for this client.
 *
 * The one number everything else follows from, and the thing the old model
 * did not have at all: reps are what the load MEANS. A client at capability
 * fails around eight; a client a quarter under it keeps going into the
 * thirteens, which is the set the Academy describes a novice having and the
 * reason their weight then goes up.
 */
export function repsFor(load: number, capability: number, jitter: number): number {
  const light = Math.max(0, 1 - load / Math.max(capability, 1));
  const raw = SETTLED_REPS + light * REPS_PER_UNIT_LIGHT + jitter;
  return Math.max(MIN_REPS, Math.min(MAX_REPS, Math.round(raw)));
}

/* ── Static holds ──────────────────────────────────────────────── */

/**
 * Two machines in the demo are held rather than counted, so the grid shows
 * both kinds of cell and a trainer practising meets both controls. They
 * progress on TIME first and load second, which is the Academy's own rule
 * and the same double progression in a different unit:
 *
 * > "SH's are typically introduced at a time interval of 30 to 45 seconds
 * > maximum to assess tolerance. With continued use, the client can progress
 * > up to a time [of] 120 seconds. … Once a client can sustain an effort for
 * > 120 seconds, it may be advisable to increase the load, decrease the time,
 * > and begin to progress 10 seconds or so at a time."
 * > — `Initial Setups (…)/Comprehensive Equipment Overview/Leg Extension.txt`
 */
export const HOLD_MIN_SECONDS = 45;
export const HOLD_MAX_SECONDS = 120;

/** Past this the hold is long enough that the load goes up instead. */
export const HOLD_ADD_WEIGHT_ABOVE = 105;

/**
 * Where a SETTLED client's hold lands — the equivalent of eight reps. The
 * forty-five-second floor is the interval a hold is INTRODUCED at to assess
 * tolerance, not where anybody stays, so a settled client sitting on it (as
 * the first cut of this had Arwen doing) reads as one who never progressed.
 */
const SETTLED_HOLD_SECONDS = 75;

/** A held set, in seconds, rounded to five the way a trainer reads a clock. */
export function secondsFor(load: number, capability: number, jitter: number): number {
  const light = Math.max(0, 1 - load / Math.max(capability, 1));
  const raw = SETTLED_HOLD_SECONDS + light * 180 + jitter * 5;
  const rounded = Math.round(raw / 5) * 5;
  return Math.max(HOLD_MIN_SECONDS, Math.min(HOLD_MAX_SECONDS, rounded));
}

/**
 * The load a held set earns. Same shape as `increaseAfter`, triggered by
 * duration rather than reps — and the Academy's "decrease the time" happens
 * for free, because a heavier load produces a shorter hold next time.
 */
export function increaseAfterHold(
  seconds: number,
  performances: number,
  capability: number,
  load: number,
): number {
  if (seconds <= HOLD_ADD_WEIGHT_ABOVE) return 0;
  if (performances < LEARNING_CURVE_PERFORMANCES) return findingStep(capability, load);
  return LOAD_STEP;
}
