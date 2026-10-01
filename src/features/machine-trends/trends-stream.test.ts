/**
 * The streaming trends (job memory, Oct 1 2026) against the version that held
 * every set. `referenceBuild` below is `buildMachineTrends` exactly as it was
 * before the accumulator, kept here verbatim so the two can be compared on
 * the same input: several thousand sets of every shape the job meets (label
 * and slug settings, demo rows, sets with no client, machine or load,
 * practice and skipped sets, sessions shared across machines), fed whole and
 * a page at a time. The documents the job writes come from this result, so
 * "the same JSON" here is "the same documents" there.
 */
import { describe, expect, it } from "vitest";
import {
  buildMachineTrends,
  createTrendsAccumulator,
  distributionOf,
  medianOrNull,
  normalizeSnapshot,
  parseHeightInches,
  parseLoad,
  type MachineTrend,
  type MachineTrendsResult,
  type SettingValueTrend,
  type StudioTrend,
  type TrendClientInput,
  type TrendLogInput,
} from "./trends";
import { isDemoRecord } from "../demo-mode/is-demo";
import { isPerformedLog } from "../../lib/set-outcome";

/* ---------------- the version that held every set, verbatim ---------------- */

interface RefClientOnMachine {
  best: number;
  sets: number;
  settings: Record<string, string>;
  heightIn: number | null;
  studioId: string;
}

function referenceBuild(logs: readonly TrendLogInput[], clients: ReadonlyMap<string, TrendClientInput>): MachineTrendsResult {
  const perMachine = new Map<string, Map<string, RefClientOnMachine>>();
  const sessionsPerMachine = new Map<string, Set<string>>();
  const setValuesPerMachine = new Map<string, Map<string, Map<string, number>>>();
  let droppedSets = 0;

  for (const log of logs) {
    if (!isPerformedLog(log)) continue;
    if (isDemoRecord(log)) continue;
    const clientId = log.clientId ?? null;
    const machineId = log.machineId ?? null;
    const load = parseLoad(log.weight);
    if (!clientId || !machineId || load == null) {
      droppedSets += 1;
      continue;
    }

    let byClient = perMachine.get(machineId);
    if (!byClient) {
      byClient = new Map();
      perMachine.set(machineId, byClient);
    }
    const client = clients.get(clientId);
    let row = byClient.get(clientId);
    if (!row) {
      row = {
        best: 0,
        sets: 0,
        settings: {},
        heightIn: parseHeightInches(client?.height),
        studioId: client?.homeStudioId || "unknown",
      };
      byClient.set(clientId, row);
    }
    row.sets += 1;
    if (load > row.best) row.best = load;

    const snapshot = normalizeSnapshot(log.machineSettings);
    if (snapshot) row.settings = snapshot;

    if (log.sessionId) {
      let sessions = sessionsPerMachine.get(machineId);
      if (!sessions) {
        sessions = new Set();
        sessionsPerMachine.set(machineId, sessions);
      }
      sessions.add(log.sessionId);
    }

    if (snapshot) {
      let perKey = setValuesPerMachine.get(machineId);
      if (!perKey) {
        perKey = new Map();
        setValuesPerMachine.set(machineId, perKey);
      }
      for (const [key, value] of Object.entries(snapshot)) {
        let perValue = perKey.get(key);
        if (!perValue) {
          perValue = new Map();
          perKey.set(key, perValue);
        }
        perValue.set(value, (perValue.get(value) ?? 0) + 1);
      }
    }
  }

  const machines: Record<string, MachineTrend> = {};
  for (const [machineId, byClient] of perMachine) {
    const rows = [...byClient.values()];
    const bests = rows.map((r) => r.best);

    const settings: Record<string, Record<string, SettingValueTrend>> = {};
    const setCounts = setValuesPerMachine.get(machineId) ?? new Map<string, Map<string, number>>();
    const clientsByKeyValue = new Map<string, Map<string, RefClientOnMachine[]>>();
    for (const row of rows) {
      for (const [key, value] of Object.entries(row.settings)) {
        let perValue = clientsByKeyValue.get(key);
        if (!perValue) {
          perValue = new Map();
          clientsByKeyValue.set(key, perValue);
        }
        const list = perValue.get(value) ?? [];
        list.push(row);
        perValue.set(value, list);
      }
    }
    for (const [key, perValue] of clientsByKeyValue) {
      const out: Record<string, SettingValueTrend> = {};
      for (const [value, list] of perValue) {
        const byHeight: Record<string, number> = {};
        for (const r of list) {
          if (r.heightIn == null) continue;
          const k = String(r.heightIn);
          byHeight[k] = (byHeight[k] ?? 0) + 1;
        }
        out[value] = {
          clients: list.length,
          sets: setCounts.get(key)?.get(value) ?? 0,
          medianBest: medianOrNull(list.map((r) => r.best)),
          byHeight,
        };
      }
      settings[key] = out;
    }

    const byHeight: Record<string, StudioTrend> = {};
    const heightGroups = new Map<number, RefClientOnMachine[]>();
    for (const r of rows) {
      if (r.heightIn == null) continue;
      const list = heightGroups.get(r.heightIn) ?? [];
      list.push(r);
      heightGroups.set(r.heightIn, list);
    }
    for (const [inches, list] of heightGroups) {
      byHeight[String(inches)] = {
        clients: list.length,
        sets: list.reduce((a, r) => a + r.sets, 0),
        medianBest: medianOrNull(list.map((r) => r.best)),
      };
    }

    const studios: Record<string, StudioTrend> = {};
    const studioGroups = new Map<string, RefClientOnMachine[]>();
    for (const r of rows) {
      const list = studioGroups.get(r.studioId) ?? [];
      list.push(r);
      studioGroups.set(r.studioId, list);
    }
    for (const [studioId, list] of studioGroups) {
      studios[studioId] = {
        clients: list.length,
        sets: list.reduce((a, r) => a + r.sets, 0),
        medianBest: medianOrNull(list.map((r) => r.best)),
      };
    }

    machines[machineId] = {
      machineId,
      clients: rows.length,
      sets: rows.reduce((a, r) => a + r.sets, 0),
      sessions: sessionsPerMachine.get(machineId)?.size ?? 0,
      load: distributionOf(bests),
      settings,
      byHeight,
      studios,
    };
  }

  return { machines, droppedSets };
}

/* ---------------- a seeded world ---------------- */

/** A small seeded generator, so a failure can be replayed. */
function seeded(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)];
  return { next, pick, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)) };
}

function world(seed: number, sets: number) {
  const r = seeded(seed);
  const clients = new Map<string, TrendClientInput>();
  const heights = ["5'4\"", "5'10\"", "5' 6", "70", "tall", "", "6'1\""];
  for (let i = 0; i < 60; i += 1) {
    if (r.next() < 0.85) clients.set(`c${i}`, { id: `c${i}`, height: r.pick(heights), homeStudioId: r.pick(["solon", "westlake", null, ""]), isActive: true });
  }
  const machines = ["m-leg-press", "m-row", "m-abs", "m-chest", "m-hip"];
  const settings = [
    () => ({ Seat: String(r.int(1, 9)) }),
    () => ({ seat: `Seat ${r.int(1, 9)}`, "Chest Pad": r.pick(["2.", "2.0", "02", "3.50", "B", "-", ""]) }),
    () => ({ "chest-pad": r.int(1, 6), gap: r.pick(["0", "1", "none"]) }),
    () => null,
    () => ({}),
  ];
  const logs: TrendLogInput[] = [];
  for (let i = 0; i < sets; i += 1) {
    const outcome = r.pick(["performed", "performed", "performed", "practice", "skipped", undefined] as const);
    logs.push({
      clientId: r.next() < 0.03 ? null : r.next() < 0.05 ? `gone${r.int(1, 3)}` : `c${r.int(0, 59)}`,
      machineId: r.next() < 0.02 ? undefined : r.pick(machines),
      sessionId: r.next() < 0.05 ? null : `s${r.int(0, 400)}`,
      weight: r.pick([r.int(20, 300), String(r.int(20, 300)), `${r.int(20, 300)} lb`, "", null, 0, -5]),
      reps: r.pick([r.int(0, 15), String(r.int(1, 15)), null]),
      outcome: outcome ?? null,
      machineSettings: r.pick(settings)(),
      studioId: r.pick(["solon", "westlake", "demo-studio", null, undefined]) ?? undefined,
      isDemo: r.next() < 0.02 ? true : undefined,
    });
  }
  return { clients, logs };
}

const same = (a: MachineTrendsResult, b: MachineTrendsResult) => expect(JSON.stringify(a)).toBe(JSON.stringify(b));

describe("the streaming trends give exactly what the version that held every set gave", () => {
  for (const seed of [1, 7, 42, 2026, 90210]) {
    it(`seed ${seed}: whole, a page at a time, and through buildMachineTrends`, () => {
      const { clients, logs } = world(seed, 4000);
      const reference = referenceBuild(logs, clients);
      expect(Object.keys(reference.machines).length).toBeGreaterThan(0);

      same(buildMachineTrends(logs, clients), reference);

      const acc = createTrendsAccumulator(clients);
      for (let at = 0; at < logs.length; at += 97) for (const log of logs.slice(at, at + 97)) acc.add(log);
      same(acc.result(), reference);
    });
  }

  it("counts a session once per machine whatever its id looks like", () => {
    const clients = new Map<string, TrendClientInput>([["c1", { id: "c1", height: "5'8\"", homeStudioId: "solon", isActive: true }]]);
    const log = (sessionId: string, machineId: string): TrendLogInput => ({ clientId: "c1", machineId, sessionId, weight: 100, reps: 8, outcome: "performed" });
    const logs = [log("a", "m1"), log("a", "m1"), log("b", "m1"), log("a", "m2"), log("constructor", "m2"), log("__proto__", "m2")];
    same(buildMachineTrends(logs, clients), referenceBuild(logs, clients));
    expect(buildMachineTrends(logs, clients).machines.m2.sessions).toBe(3);
  });
});
