import { describe, it, expect } from "vitest";
import { buildDemoSeed, isTsSentinel, addDays, DEMO_MACHINES } from "./seed-core";
import { DEMO_STUDIO_ID } from "./constants";
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

  it("weights climb over a client's history rather than wandering", () => {
    const elanor = logs.filter(
      (l) => String(l.data.sessionId).includes("elanor") && l.data.machineId === "m-leg-press",
    );
    const performed = elanor.filter((l) => l.data.outcome === "performed");
    expect(performed.length).toBeGreaterThan(5);
    const first = Number(performed[0].data.weight);
    const last = Number(performed[performed.length - 1].data.weight);
    expect(last).toBeGreaterThan(first);
    // Monotone: this protocol never steps a client backwards on purpose.
    let previous = 0;
    for (const l of performed) {
      expect(Number(l.data.weight)).toBeGreaterThanOrEqual(previous);
      previous = Number(l.data.weight);
    }
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

  it("Esme reads 312 sessions, not 'new client' — by the app's own arithmetic", () => {
    const esme = at("clients/demo-client-esme")!;
    const prior = priorHistoryOf(esme as never);
    expect(prior).not.toBeNull();
    expect(prior!.sessions).toBe(304);
    // importedCount 0: none of the 304 were brought over as session docs, so
    // they are all still uncounted by Journey and must all be added.
    expect(prior!.importedCount).toBe(0);
    expect(totalSessions(8, prior)).toBe(312);
    expect(esme.sessionCount).toBe(totalSessionsFor(DEMO_CLIENTS.find((c) => c.key === "esme")!));
    // Her prior record has to stop before Journey starts, or the two
    // histories overlap and the total double-counts.
    expect(String(prior!.through) < String(esme.firstSessionDate)).toBe(true);
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

  it("Andy has been away long enough for the attendance watch to find him", () => {
    const andy = at("clients/demo-client-andy")!;
    expect(String(andy.lastSessionDate) < addDays(TODAY, -28)).toBe(true);
  });

  it("Milo's profile is nearly empty, and honestly so", () => {
    const milo = at("clients/demo-client-milo")!;
    expect(milo.completedSessions).toBe(2);
    expect(milo.priorHistory).toBeUndefined(); // genuinely new, not migrated
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
