/**
 * results.json -> medians -> report.md. Medians across the reps of each
 * profile; a scenario that failed in a rep is left out of that rep's median
 * and counted as a failure.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export function median(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

/** Per profile, per scenario: the medians, the failures, and the CPU lists averaged over the reps. */
export function summarise(results) {
  const out = {};
  for (const [name, p] of Object.entries(results.profiles)) {
    out[name] = {};
    const scenarioNames = new Set(p.runs.flatMap((r) => Object.keys(r.scenarios)));
    for (const sc of scenarioNames) {
      const ok = p.runs.map((r) => r.scenarios[sc]).filter((m) => m && !m.error);
      const failed = p.runs.map((r) => r.scenarios[sc]).filter((m) => m && m.error).map((m) => m.error);
      const stepKeys = new Set(ok.flatMap((m) => Object.keys(m.steps || {})));
      const steps = {};
      for (const k of stepKeys) steps[k] = median(ok.map((m) => m.steps?.[k]));
      const metricKeys = new Set(ok.flatMap((m) => Object.keys(m.metrics || {})));
      const metrics = {};
      for (const k of metricKeys) metrics[k] = median(ok.map((m) => m.metrics?.[k]));
      const fold = (key) => {
        const sum = new Map();
        for (const m of ok) for (const f of m.cpu?.[key] ?? []) sum.set(f.name, (sum.get(f.name) ?? 0) + f.ms);
        return [...sum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, ms]) => ({ name, ms: Math.round(ms / Math.max(1, ok.length)) }));
      };
      out[name][sc] = {
        runs: ok.length,
        failures: failed,
        wallMs: median(ok.map((m) => m.wallMs)),
        steps,
        longTaskCount: median(ok.map((m) => m.longTasks?.count)),
        longTaskTotalMs: median(ok.map((m) => m.longTasks?.totalMs)),
        longTaskWorstMs: median(ok.map((m) => m.longTasks?.worstMs)),
        worstInteractionMs: median(ok.map((m) => m.interactions?.worstMs)),
        domNodes: median(ok.map((m) => m.domNodes)),
        exceptions: median(ok.map((m) => m.exceptions)),
        metrics,
        cpuTotalMs: median(ok.map((m) => m.cpu?.totalMs)),
        cpuFiles: fold("files"),
        cpuFunctions: fold("functions"),
      };
    }
  }
  return out;
}

const SCENARIO_WORDS = {
  cold: "(a) Cold open: empty cache -> sign in -> Start -> Hub bookings drawn (ms from navigation)",
  warm: "(b) Warm reload: HTTP and Firestore caches kept -> Hub bookings drawn (ms from navigation)",
  idle: "(c) Hub idle 70 s across a minute tick",
  client: "(d) Tap a card -> peek -> Open profile -> Journey tab drawn (ms from the tap)",
  session: "(e) Start from the briefing, 5 sets, machine menu, Finish -> Wrap-up (ms from the card tap)",
  ops: "(f) Operations Today (ms from Open Operations), then the Client Directory and a search",
  scroll: "(g) Scrolling the Hub grid and the Directory (frames the main thread missed)",
};

const fmt = (v, unit = "") => (v === null || v === undefined ? "-" : `${typeof v === "number" ? v.toLocaleString("en-US") : v}${unit}`);

export function writeReport(results, outDir) {
  const summary = summarise(results);
  const profiles = Object.keys(results.profiles);
  const lines = [];
  lines.push(`# Journey perf lab: ${results.runId}`);
  lines.push("");
  lines.push(`Started ${results.startedAt}${results.finishedAt ? `, finished ${results.finishedAt}` : ""}. ${results.reps} reps per profile; medians below. Network: ${results.network.latencyMs} ms added latency, ${results.network.downMbps} Mbps down, ${results.network.upMbps} up, to local emulators.`);
  if (results.seed) {
    const sd = results.seed;
    lines.push("");
    lines.push(`Seeded studio (${sd.today}): ${fmt(sd.clients)} clients, ${fmt(sd.trainers)} trainers, ${fmt(sd.bookings)} bookings (${fmt(sd.bookingsToday)} today, ${fmt(sd.bookingsTomorrow)} tomorrow), ${fmt(sd.sessions)} sessions, ${fmt(sd.exerciseLogs)} exercise logs, ${fmt(sd.journalEntries)} notes (${fmt(sd.criticalNotes)} Critical), ${fmt(sd.ford)} FORD details, ${fmt(sd.documents)} documents in all.`);
  }
  lines.push("");
  lines.push("Profiles: " + profiles.map((p) => `**${p}** = ${results.profiles[p].label}, ${results.profiles[p].width}x${results.profiles[p].height} @${results.profiles[p].dpr}x`).join("; ") + ".");
  lines.push("");
  lines.push("Columns: **wall** the scenario's own clock (see each heading); **LT** long tasks (count / total ms / worst ms); **INP~** the slowest interaction (event timing, the longest event of one tap or key); **script / layout / style** ms of main-thread work (Performance.getMetrics); **nodes** DOM elements at the end; **fail** runs that failed.");
  for (const sc of Object.keys(SCENARIO_WORDS)) {
    if (!profiles.some((p) => summary[p][sc])) continue;
    lines.push("");
    lines.push(`## ${SCENARIO_WORDS[sc]}`);
    lines.push("");
    lines.push("| profile | wall | LT | INP~ | script | layout | style | heap MB | nodes | fail |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const p of profiles) {
      const m = summary[p][sc];
      if (!m) continue;
      lines.push(
        `| ${p} | ${fmt(m.wallMs)} | ${fmt(m.longTaskCount)} / ${fmt(m.longTaskTotalMs)} / ${fmt(m.longTaskWorstMs)} | ${fmt(m.worstInteractionMs)} | ${fmt(m.metrics.ScriptDuration)} | ${fmt(m.metrics.LayoutDuration)} | ${fmt(m.metrics.RecalcStyleDuration)} | ${fmt(m.metrics.JSHeapUsedMB)} | ${fmt(m.domNodes)} | ${m.failures.length} |`,
      );
    }
    const stepKeys = [...new Set(profiles.flatMap((p) => Object.keys(summary[p][sc]?.steps ?? {})))];
    if (stepKeys.length) {
      lines.push("");
      lines.push(`| step | ${profiles.join(" | ")} |`);
      lines.push(`| --- | ${profiles.map(() => "---:").join(" | ")} |`);
      for (const k of stepKeys) lines.push(`| ${k} | ${profiles.map((p) => fmt(summary[p][sc]?.steps?.[k])).join(" | ")} |`);
    }
    const failures = profiles.flatMap((p) => (summary[p][sc]?.failures ?? []).map((f) => `${p}: ${f}`));
    if (failures.length) {
      lines.push("");
      for (const f of failures) lines.push(`- failed: ${f}`);
    }
  }
  // Where the main thread went: the slowest iPad profile's heaviest scenarios.
  const slow = profiles.find((p) => p.startsWith("old-ipad")) || profiles[0];
  lines.push("");
  lines.push(`## Where the time went (${slow}, self time per run, through the source maps)`);
  for (const sc of ["cold", "warm", "idle", "client", "session", "ops"]) {
    const m = summary[slow]?.[sc];
    if (!m || !m.cpuFiles.length) continue;
    lines.push("");
    lines.push(`### ${sc} (CPU ${fmt(m.cpuTotalMs)} ms sampled, idle excluded)`);
    lines.push("");
    lines.push("| top files | ms | top functions | ms |");
    lines.push("| --- | ---: | --- | ---: |");
    for (let i = 0; i < 15; i += 1) {
      const f = m.cpuFiles[i];
      const fn = m.cpuFunctions[i];
      if (!f && !fn) break;
      lines.push(`| ${f ? f.name : ""} | ${f ? f.ms : ""} | ${fn ? fn.name.replace(/\|/g, "/") : ""} | ${fn ? fn.ms : ""} |`);
    }
  }
  lines.push("");
  lines.push("## What this lab cannot tell you");
  lines.push("");
  lines.push("- It is Chrome (Blink and V8) slowed down, not Safari (WebKit and JavaScriptCore) on an A14: the CPU multiplier is a class estimate, and WebKit's style, layout and GC costs differ. Read the numbers as relative (before vs after a change), not as an iPad's absolute.");
  lines.push("- The database is the local emulator with the real rules: no real network, no real Firestore latency beyond the added 60 ms, no Firestore's own server time, and the emulator's locking is not production's.");
  lines.push("- No GPU, thermal throttling, memory pressure or tab eviction of a 3 GB iPad; no Mindbody or Gemini calls (the studio is offline); the sign-in is the emulator's, not Google's or Microsoft's popup.");
  const path = join(outDir, "report.md");
  writeFileSync(path, `${lines.join("\n")}\n`);
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  return path;
}
