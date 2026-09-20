import { describe, it, expect } from "vitest";
import { buildDemoSeed, isTsSentinel, addDays, DEMO_MACHINES } from "./seed-core";
import { DEMO_STUDIO_ID } from "./constants";
import {
  LEARNING_CURVE_PERFORMANCES,
  LOAD_STEP,
  MAX_REPS,
  MIN_REPS,
  onTheStack,
} from "./loads";
import { DEMO_CLIENTS, DEMO_TRAINERS, totalSessionsFor } from "./roster";
import { outcomeOf, isPerformedLog } from "../../lib/set-outcome";
import { totalSessions, priorHistoryOf } from "../../lib/prior-history";

const TODAY = "2026-09-20";
const seed = buildDemoSeed({ today: TODAY, seededBy: { id: "u1", name: "AJ Jurgens" } });

const at = (path: string) => seed.docs.find((d) => d.path === path)?.data;
const inCollection = (name: string) =>
  seed.docs.filter((d) => d.path.startsWith(`${name}/`) && d.path.split("/").length === 2);

describe("the seed is its own reset", () => {
  it("builds the same documents every time, byte for byte", () => {
    // The whole design rests on this: if two runs differ, "Set up" and
    // "Reset" cannot be the same button, and a half-failed run cannot be
    // fixed by pressing it again.
    const again = buildDemoSeed({ today: TODAY, seededBy: { id: "u1", name: "AJ Jurgens" } });
    expect(JSON.stringify(again)).toEqual(JSON.stringify(seed));
  });

  it("gives every document a derived id, so nothing is ever created twice", () => {
    const ids = seed.docs.map((d) => d.path);
    expect(new Set(ids).size).toBe(ids.length);
    for (const path of ids) {
      expect(path).not.toMatch(/undefined|NaN|null/);
    }
  });
});

describe("what it lays down", () => {
  it("one studio, flagged, offline, and older than its own history", () => {
    const studio = at(`studios/${DEMO_STUDIO_ID}`)!;
    expect(studio.isDemo).toBe(true);
    // No Mindbody site: the nightly job never queues a pull for this studio,
    // so the seeded package data is never overwritten from outside.
    expect(studio.mindbodyMode).toBe("offline");
    expect(studio.mindbodySiteId).toBeUndefined();
    // The cutover has to predate every session, or every client reads as
    // "coverage unknown" and the grid hedges every number it says.
    const firstSession = Math.min(
      ...inCollection("sessions").map((d) => Date.parse(String(d.data.date))),
    );
    expect(Date.parse(String(studio.journeyCutoverDate))).toBeLessThan(firstSession);
  });

  it("three trainers who belong to the demo studio for real", () => {
    for (const t of DEMO_TRAINERS) {
      const doc = at(`trainers/demo-trainer-${t.key}`)!;
      expect(doc.primaryHomeStudioId).toBe(DEMO_STUDIO_ID);
      expect(doc.accessibleStudioIds).toEqual([DEMO_STUDIO_ID]);
      // Membership is genuine, so the team screens show these three and not
      // the company's staff directory — see access.ts.
      expect(doc.pendingClaim).toBe(true);
      // NOT provisional: that queue is about real people waiting to be
      // reconciled, and these three never will be.
      expect(doc.provisional).toBeUndefined();
      expect(String(doc.email)).toContain("@demo.invalid");
    }
  });

  it("a full floor, every machine active and pointing at the catalog", () => {
    const roster = seed.docs.filter((d) => d.path.includes("/roster/"));
    expect(roster).toHaveLength(DEMO_MACHINES.length);
    for (const entry of roster) {
      expect(entry.merge).toBe(true); // a reset must not undo a studio's edit
      expect(entry.data.status).toBe("active");
      expect(entry.data.source).toBe("catalog");
      // resolveMachine() returns null without this, and the machine vanishes
      // from the floor with no error anywhere.
      expect(entry.data.basedOn).toBe(entry.data.machineId);
    }
  });

  it("an A and a B for every client, named the exact strings five screens look for", () => {
    const routines = inCollection("routines");
    expect(routines).toHaveLength(DEMO_CLIENTS.length * 2);
    const names = new Set(routines.map((r) => r.data.name));
    expect(names).toEqual(new Set(["Routine A", "Routine B"]));
    for (const r of routines) {
      expect((r.data.machineIds as string[]).length).toBeGreaterThan(0);
    }
  });
});

describe("the history is the shape the app's own readers expect", () => {
  const sessions = inCollection("sessions");
  const logs = inCollection("exerciseLogs");

  it("every session is a completed session at the demo studio", () => {
    expect(sessions.length).toBeGreaterThan(100);
    for (const s of sessions) {
      expect(s.data.status).toBe("Completed");
      expect(s.data.hostedAtStudioId).toBe(DEMO_STUDIO_ID);
      expect(s.data.clientHomeStudioId).toBe(DEMO_STUDIO_ID);
      // Written by the live flow but absent from the WorkoutSession type;
      // HistoryCalendar reads it.
      expect(s.data.homeStudioId).toBe(DEMO_STUDIO_ID);
      expect(s.data.isDemo).toBe(true);
    }
  });

  it("dates are the studio's own day as a plain string, never a timestamp", () => {
    for (const s of sessions) {
      expect(String(s.data.date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isTsSentinel(s.data.date)).toBe(false);
    }
  });

  it("createdAt is a real timestamp on every session and every set", () => {
    // The documented trap: an ISO string here silently removes the document
    // from every createdAt range query — Insights, Hours, Exports, trends.
    for (const d of [...sessions, ...logs]) {
      expect(isTsSentinel(d.data.createdAt)).toBe(true);
    }
  });

  it("no session is ever stamped at the backfill sentinel time", () => {
    // `<date>T12:00:00.000Z` is what History reads as "logged after the
    // fact". Seeded sessions happened; they should not wear that mark.
    for (const s of sessions) {
      const start = s.data.startTime as { __ts: string };
      expect(start.__ts).not.toContain("T12:00:00.000Z");
    }
  });

  it("gives each set an id the live tracker would overwrite, not duplicate", () => {
    for (const l of logs) {
      const id = l.path.split("/")[1];
      expect(id).toBe(`${l.data.sessionId}_${l.data.machineId}`);
    }
  });

  it("writes weights, reps and seconds as strings, as every reader parses them", () => {
    for (const l of logs) {
      expect(typeof l.data.weight).toBe("string");
      expect(typeof l.data.reps).toBe("string");
      expect(typeof l.data.seconds).toBe("string");
    }
  });

  it("never leaves a performed set without a weight the grid can draw", () => {
    // toJourneySet returns null for a performed set with no parseable
    // weight — the cell simply does not appear, with nothing to explain it.
    for (const l of logs) {
      if (!isPerformedLog(l.data as never)) continue;
      expect(Number(l.data.weight)).toBeGreaterThan(0);
    }
  });

  it("covers all four outcomes, because a demo that only ever succeeds teaches nothing", () => {
    const seen = new Set(logs.map((l) => outcomeOf(l.data as never)));
    expect(seen.has("performed")).toBe(true);
    expect(seen.has("skipped")).toBe(true);
    expect(seen.has("not_reached")).toBe(true);
  });

  it("shows both kinds of set — counted reps and a timed hold", () => {
    expect(logs.some((l) => l.data.isTSC === true && Number(l.data.seconds) > 0)).toBe(true);
    expect(logs.some((l) => l.data.isTSC === false && Number(l.data.reps) > 0)).toBe(true);
  });

  it("carries the machine's settings onto the set, as the live tracker does", () => {
    const withSettings = logs.filter(
      (l) => Object.keys(l.data.machineSettings as object).length > 0,
    );
    expect(withSettings.length).toBe(logs.length);
  });

  /*
   * HOW A WEIGHT MOVES — AJ, Sep 20 2026, and the reason these assertions
   * exist rather than one.
   *
   * Clients train twice a week for twenty minutes and are typically over
   * forty. The weight usually does not move; the only big corrections are
   * early, while the trainer is still finding the working weight. A generated
   * history that climbed steadily would have a 72-year-old more than doubling
   * her leg press inside a year, which is the kind of number a boss asks
   * about.
   *
   * The model that produces this is `loads.ts`, and none of it is a schedule:
   * the load is a consequence of the rep count. These tests are the outcome
   * of that model, not its definition — `loads.test.ts` tests the rules
   * themselves.
   */
  const performedRunsByMachine = () => {
    const runs = new Map<string, number[]>();
    for (const l of logs) {
      if (l.data.outcome !== "performed") continue;
      const key = `${l.data.clientId}:${l.data.machineId}`;
      const list = runs.get(key) ?? [];
      list.push(Number(l.data.weight));
      runs.set(key, list);
    }
    return runs;
  };

  it("never steps a client backwards", () => {
    for (const run of performedRunsByMachine().values()) {
      let previous = 0;
      for (const w of run) {
        expect(w).toBeGreaterThanOrEqual(previous);
        previous = w;
      }
    }
  });

  it("leaves the weight alone most of the time", () => {
    // The single most important one. If this ever flips, the history has
    // started reading like a beginner's first six months at a gym.
    let moves = 0;
    let steps = 0;
    for (const run of performedRunsByMachine().values()) {
      for (let i = 1; i < run.length; i += 1) {
        steps += 1;
        if (run[i] > run[i - 1]) moves += 1;
      }
    }
    expect(steps).toBeGreaterThan(200);
    expect(moves / steps).toBeLessThan(0.3);
  });

  it("never adds more than 20 lb at once, even while finding the weight", () => {
    for (const run of performedRunsByMachine().values()) {
      for (let i = 1; i < run.length; i += 1) {
        expect(run[i] - run[i - 1]).toBeLessThanOrEqual(20);
      }
    }
  });

  it("adds one step, or two after a runaway set, once the weight is settled", () => {
    /*
     * The step INTO performance `i` was decided after performance `i - 1`,
     * so the finding phase covers i < LEARNING_CURVE_PERFORMANCES + 1. After
     * that the machine's own two pounds is the answer, and four only for a
     * set that ran past the Academy's practical upper limit of fifteen.
     */
    for (const run of performedRunsByMachine().values()) {
      for (let i = LEARNING_CURVE_PERFORMANCES + 1; i < run.length; i += 1) {
        expect(run[i] - run[i - 1]).toBeLessThanOrEqual(LOAD_STEP * 2);
      }
    }
  });

  it("only ever sets a weight the machine can actually be set to", () => {
    /*
     * AJ, Sep 20 2026: "our machines can only move up in two pound
     * increments. As some of the current weights have 35 pounds, 32.5, 37,
     * 53." Every load in the demo is an even whole number of at least twenty
     * — the Academy's two-pound increments and its "20 pounds, the lightest
     * increment available on this exercise".
     */
    const offTheStack = new Set<number>();
    for (const l of logs) {
      if (l.data.outcome !== "performed") continue;
      const w = Number(l.data.weight);
      if (w !== onTheStack(w)) offTheStack.add(w);
    }
    expect([...offTheStack]).toEqual([]);
  });

  it("starts nobody on a weight that embarrasses the demo", () => {
    /*
     * The other half of AJ's report: "for some machines like the leg press,
     * the client only has 53 pounds." The old model took the catalog's
     * `baselineLoad` and scaled it DOWN again for age. Nobody in the demo
     * leg-presses less than three figures.
     */
    const legPress = [...performedRunsByMachine().entries()].filter(([key]) =>
      key.endsWith(":m-leg-press"),
    );
    expect(legPress.length).toBe(DEMO_CLIENTS.length);
    for (const [key, run] of legPress) {
      // The key is in the message so a failure names the client.
      expect(`${key} opened on ${run[0]}`).toBe(`${key} opened on ${Math.max(90, run[0])}`);
    }
  });

  it("makes the rep count mean something: it falls as the weight rises", () => {
    /*
     * The realism that matters most on the grid. The old model drew reps
     * from a random 6-to-12 with no relationship to the load, so a weight
     * could go up while the rep count went up too — backwards from how this
     * method works, and the first thing a trainer would notice.
     */
    const runs = new Map<string, Array<{ weight: number; reps: number }>>();
    for (const l of logs) {
      if (l.data.outcome !== "performed" || l.data.isStaticHold === true) continue;
      const key = `${l.data.clientId}:${l.data.machineId}`;
      const list = runs.get(key) ?? [];
      list.push({ weight: Number(l.data.weight), reps: Number(l.data.reps) });
      runs.set(key, list);
    }
    let rose = 0;
    let fellOrHeld = 0;
    for (const run of runs.values()) {
      for (let i = 1; i < run.length; i += 1) {
        if (run[i].weight <= run[i - 1].weight) continue;
        if (run[i].reps > run[i - 1].reps) rose += 1;
        else fellOrHeld += 1;
      }
    }
    expect(fellOrHeld).toBeGreaterThan(50);
    // A heavier weight that bought MORE reps should be vanishingly rare —
    // only the ±1 wobble on a set that was already near the band's edge.
    expect(rose / (rose + fellOrHeld)).toBeLessThan(0.1);
  });

  it("keeps every set inside the Academy's rep bands", () => {
    // "< 6 reps → load may be too heavy … ~15 reps → practical upper limit."
    for (const l of logs) {
      if (l.data.outcome !== "performed" || l.data.isStaticHold === true) continue;
      expect(Number(l.data.reps)).toBeGreaterThanOrEqual(MIN_REPS);
      expect(Number(l.data.reps)).toBeLessThanOrEqual(MAX_REPS);
    }
  });

  it("gives a true novice a long set and a veteran a short one", () => {
    /*
     * "we should be intentionally underestimating the strength of the new
     * client … which would most likely land them at a 10 - 12 or more rep
     * set." Frodo has two sessions; Arwen has 304 behind her and is not
     * learning anything, so she starts where she left off.
     */
    const firstReps = (clientKey: string) =>
      logs
        .filter(
          (l) =>
            l.data.clientId === `demo-client-${clientKey}` &&
            l.data.outcome === "performed" &&
            l.data.isStaticHold !== true,
        )
        .map((l) => Number(l.data.reps));
    const frodo = firstReps("frodo");
    const arwen = firstReps("arwen");
    expect(Math.min(...frodo)).toBeGreaterThanOrEqual(12);
    expect(Math.max(...arwen)).toBeLessThanOrEqual(10);
  });

  it("does not have anybody doubling their weight on a machine", () => {
    const doubled = [...performedRunsByMachine().entries()]
      .filter(([, run]) => run.length >= 4 && run[run.length - 1] / run[0] >= 2)
      .map(([key, run]) => `${key} ${run[0]} → ${run[run.length - 1]}`);
    expect(doubled).toEqual([]);
  });

  it("still shows real progress over a long history", () => {
    // The other direction: a demo where nobody ever gets stronger is not a
    // demo of a strength programme.
    const runs = [...performedRunsByMachine().entries()].filter(
      ([key, run]) => key.startsWith("demo-client-eowyn") && run.length > 10,
    );
    expect(runs.length).toBeGreaterThan(3);
    const gained = runs.filter(([, run]) => run[run.length - 1] > run[0]);
    expect(gained.length).toBe(runs.length);
  });
});

describe("the six clients each still teach their one thing", () => {
  it("every client is active, at the demo studio, and flagged", () => {
    const clients = inCollection("clients");
    expect(clients).toHaveLength(6);
    for (const c of clients) {
      expect(c.data.isActive).toBe(true);
      expect(c.data.homeStudioId).toBe(DEMO_STUDIO_ID);
      expect(c.data.isDemo).toBe(true);
      // The rules' isValidClient minimum.
      expect(typeof c.data.firstName).toBe("string");
      expect(typeof c.data.lastName).toBe("string");
      expect(typeof c.data.remainingSessions).toBe("number");
    }
  });

  it("Arwen reads 312 sessions, not 'new client' — by the app's own arithmetic", () => {
    const arwen = at("clients/demo-client-arwen")!;
    const prior = priorHistoryOf(arwen as never);
    expect(prior).not.toBeNull();
    expect(prior!.sessions).toBe(304);
    // importedCount 0: none of the 304 were brought over as session docs, so
    // they are all still uncounted by Journey and must all be added.
    expect(prior!.importedCount).toBe(0);
    expect(totalSessions(8, prior)).toBe(312);
    expect(arwen.sessionCount).toBe(totalSessionsFor(DEMO_CLIENTS.find((c) => c.key === "arwen")!));
    // Her prior record has to stop before Journey starts, or the two
    // histories overlap and the total double-counts.
    expect(String(prior!.through) < String(arwen.firstSessionDate)).toBe(true);
  });

  it("Rosie has three sessions left, and the package agrees with her history", () => {
    const rosie = at("clients/demo-client-rosie")!;
    const services = rosie.mindbodyServices as Record<string, Record<string, unknown>>;
    const service = Object.values(services)[0];
    expect(service.remaining).toBe(3);
    // count - remaining is how many she has used, and that IS what Journey
    // has recorded. Two screens, one number.
    expect(Number(service.count) - Number(service.remaining)).toBe(rosie.completedSessions);
    expect(rosie.mindbodyServicesSyncedAt).toBeDefined();
  });

  it("is the only client near the end of a package, so the pipeline has one story", () => {
    const near = DEMO_CLIENTS.filter((c) => c.remainingSessions <= 10);
    expect(near.map((c) => c.key)).toEqual(["rosie"]);
  });

  it("Merry has been away long enough for the attendance watch to find him", () => {
    const merry = at("clients/demo-client-merry")!;
    expect(String(merry.lastSessionDate) < addDays(TODAY, -28)).toBe(true);
  });

  it("Frodo's profile is nearly empty, and honestly so", () => {
    const frodo = at("clients/demo-client-frodo")!;
    expect(frodo.completedSessions).toBe(2);
    expect(frodo.priorHistory).toBeUndefined(); // genuinely new, not migrated
  });

  it("every client's counters agree with the sessions actually written", () => {
    for (const c of DEMO_CLIENTS) {
      const doc = at(`clients/demo-client-${c.key}`)!;
      const theirs = inCollection("sessions").filter(
        (s) => s.data.clientId === `demo-client-${c.key}`,
      );
      expect(theirs).toHaveLength(Number(doc.completedSessions));
      expect(doc.sessionCount).toBe(c.sessions + c.priorSessions);
    }
  });

  it("carries a rollup so the profile header is right before anyone opens it", () => {
    for (const c of DEMO_CLIENTS) {
      const doc = at(`clients/demo-client-${c.key}`)!;
      const tally = doc.trainerTally as Record<string, number>;
      expect(Object.keys(tally).length).toBeGreaterThan(0);
      const counted = Object.values(tally).reduce((a, b) => a + b, 0);
      expect(counted).toBe(c.sessions);
      expect(String(doc.topTrainerId)).toContain("demo-trainer-");
      expect(Object.keys(doc.machineStats as object).length).toBeGreaterThan(0);
      // What the next session pre-fills its weights and dials from.
      expect(Object.keys(doc.currentMachineMetrics as object).length).toBeGreaterThan(0);
    }
  });

  it("gives every client settings for every machine on the floor", () => {
    for (const c of DEMO_CLIENTS) {
      const theirs = seed.docs.filter((d) =>
        d.path.startsWith(`clientMachineSettings/demo-client-${c.key}_`),
      );
      expect(theirs).toHaveLength(DEMO_MACHINES.length);
      for (const s of theirs) {
        expect(Object.keys(s.data.settings as object).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("nothing in the seed can reach the real world", () => {
  it("flags every single document", () => {
    for (const d of seed.docs) {
      expect(d.data.isDemo).toBe(true);
    }
  });

  it("names no studio but the demo studio, anywhere", () => {
    const text = JSON.stringify(seed.docs);
    for (const real of ["solon", "westlake", "strongsville", "willoughby"]) {
      expect(text.toLowerCase()).not.toContain(`"${real}"`);
    }
  });

  it("carries no email that could route and no Mindbody id", () => {
    const text = JSON.stringify(seed.docs);
    const emails = text.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    for (const email of emails) expect(email.endsWith("@demo.invalid")).toBe(true);
    for (const c of inCollection("clients")) {
      expect(c.data.mindbodyClientId ?? null).toBeNull();
    }
  });
});
