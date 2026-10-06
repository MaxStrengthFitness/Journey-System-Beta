/**
 * results.json -> summary.json and report.md: per build, profile and
 * scenario, the median of the timed reps with its min and max (a spread over
 * 15% is flagged), the calibration and its drift, the headline a trainer
 * feels, the A/B deltas when two builds ran, and where the CPU went (from the
 * one profiled rep, which is kept out of the medians).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** median, min, max and n of the numbers among `values`. */
export function stat(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  const med = v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
  return { med, min: v[0], max: v[v.length - 1], n: v.length };
}

export function median(values) {
  return stat(values)?.med ?? null;
}

const spreadOf = (s) => (s && s.med > 0 && s.n > 1 ? (s.max - s.min) / s.med : 0);

/** CPU lists from runs, averaged over them BEFORE the top 15 is taken. */
function foldCpu(runs, key) {
  const sum = new Map();
  for (const m of runs) for (const f of m.cpu?.[key] ?? []) sum.set(f.name, (sum.get(f.name) ?? 0) + f.ms);
  return [...sum.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, ms]) => ({ name, ms: Math.round((ms / Math.max(1, runs.length)) * 10) / 10 }));
}

function summariseRuns(runs, profiledRuns) {
  const out = {};
  const names = new Set([...runs, ...profiledRuns].flatMap((r) => Object.keys(r.scenarios || {})));
  for (const sc of names) {
    const ok = runs.map((r) => r.scenarios?.[sc]).filter((m) => m && !m.error);
    const failed = runs.map((r) => r.scenarios?.[sc]).filter((m) => m && m.error).map((m) => m.error);
    const prof = profiledRuns.map((r) => r.scenarios?.[sc]).filter((m) => m && !m.error && m.cpu);
    const steps = {};
    for (const k of new Set(ok.flatMap((m) => Object.keys(m.steps || {})))) steps[k] = stat(ok.map((m) => m.steps?.[k]));
    const metrics = {};
    for (const k of new Set(ok.flatMap((m) => Object.keys(m.metrics || {})))) metrics[k] = stat(ok.map((m) => m.metrics?.[k]));
    out[sc] = {
      runs: ok.length,
      failures: failed,
      client: ok.find((m) => m.client)?.client ?? null,
      wallMs: stat(ok.map((m) => m.wallMs)),
      waitingMs: stat(ok.map((m) => m.waitingMs)),
      steps,
      longTaskCount: stat(ok.map((m) => m.longTasks?.count)),
      longTaskTotalMs: stat(ok.map((m) => m.longTasks?.totalMs)),
      longTaskWorstMs: stat(ok.map((m) => m.longTasks?.worstMs)),
      worstInteractionMs: stat(ok.map((m) => m.interactions?.worstMs)),
      requests: stat(ok.map((m) => m.network?.requests)),
      kb: stat(ok.map((m) => m.network?.kb)),
      domNodes: stat(ok.map((m) => m.domNodes)),
      exceptions: stat(ok.map((m) => m.exceptions)),
      metrics,
      cpuTotalMs: median(prof.map((m) => m.cpu?.totalMs)),
      cpuFiles: foldCpu(prof, "files"),
      cpuFunctions: foldCpu(prof, "functions"),
    };
  }
  return out;
}

/** { variant: { profile: { scenario: summary } } } */
export function summarise(results) {
  const out = {};
  for (const [v, variant] of Object.entries(results.variants)) {
    out[v] = {};
    for (const [p, prof] of Object.entries(variant.profiles)) out[v][p] = summariseRuns(prof.runs, prof.profiledRuns ?? []);
  }
  return out;
}

const SCENARIO_WORDS = {
  cold: "(a) Cold: first sign-in on an empty iPad -> Start -> the Hub's bookings (ms from navigation)",
  warm: "(b) Warm reload: same renderer, every cache kept -> the Hub (ms from navigation)",
  relaunch: "(b2) Relaunch, THE HEADLINE OPEN: Chrome closed and started again, disk caches kept -> the Hub (ms from navigation)",
  afterdeploy: "(b3) After a deploy: relaunched with the HTTP and code caches emptied, the Firestore cache kept -> the Hub (ms from navigation)",
  idle: "(c) The Hub left open 70 s across a minute tick (long tasks only)",
  client: "(d) The focus client's card -> peek -> Open profile -> Journey tab drawn (ms from the tap)",
  session: "(e) Session: start -> briefing -> Now Bar -> 5 sets -> machine menu (wall = the sum of those steps; Finish apart)",
  ops: "(f) Operations Today settled (ms from Open Operations), then the Client Directory and a search",
  scroll: "(g) Scrolling the Hub grid (3 times down and up) and the Directory (once down)",
};

const n = (v) => (typeof v === "number" ? v.toLocaleString("en-US") : "-");
/** "1,234 [1,100-1,300]" with "!" when the spread is over 15%. */
const fs = (s) => {
  if (!s) return "-";
  if (s.n < 2 || s.min === s.max) return n(s.med);
  return `${n(s.med)} [${n(s.min)}-${n(s.max)}]${spreadOf(s) > 0.15 ? " !" : ""}`;
};
const med = (s) => (s ? n(s.med) : "-");

const HEADLINE = [
  ["Relaunch open", "relaunch", null],
  ["After-deploy open", "afterdeploy", null],
  ["Cold: Start tap -> Hub", "cold", "tapToHubMs"],
  ["Warm reload", "warm", null],
  ["Card -> Journey tab", "client", null],
  ["Start -> briefing", "session", "startToBriefingMs"],
  ["Briefing -> Now Bar", "session", "briefingToNowBarMs"],
  ["A set (median)", "session", "setMedianMs"],
  ["Machine menu", "session", "menuOpenMs"],
  ["Ops Today settled", "ops", null],
  ["Directory drawn", "ops", "tabToDirectoryMs"],
  ["Search results", "ops", "lastKeyToResultsMs"],
];
const pick = (sum, sc, step) => (step ? sum?.[sc]?.steps?.[step] : sum?.[sc]?.wallMs) ?? null;

function headlineTable(lines, summary, profiles) {
  lines.push(`| profile | ${HEADLINE.map((h) => h[0]).join(" | ")} |`);
  lines.push(`| --- | ${HEADLINE.map(() => "---:").join(" | ")} |`);
  for (const p of profiles) lines.push(`| ${p} | ${HEADLINE.map(([, sc, step]) => fs(pick(summary[p], sc, step))).join(" | ")} |`);
}

export function writeReport(results, outDir) {
  const summary = summarise(results);
  const variantNames = Object.keys(results.variants);
  const first = variantNames[0];
  const profiles = Object.keys(results.variants[first].profiles);
  const lines = [];
  const L = (s = "") => lines.push(s);
  L(`# Journey perf lab: ${results.runId}`);
  L();
  L(
    `Started ${results.startedAt}${results.finishedAt ? `, finished ${results.finishedAt}` : ""}. ${results.reps} timed reps per profile${variantNames.length > 1 ? " and build" : ""}, ${results.order}; ${results.profileRep ? "one more rep per profile with the CPU profiler, kept out of the medians" : "no profiled rep"}. Network: ${results.network.latencyMs} ms added latency, ${results.network.downMbps} Mbps down, ${results.network.upMbps} up, to local emulators; Google's hosts refused.${results.bare ? " **--bare: no page instruments** (no long tasks, interactions or settle times)." : ""}`,
  );
  L();
  L("Every cell is the median of the timed reps, then [min-max]; **!** marks a spread over 15% of the median. Times are ms.");

  // Calibration
  const cal = results.calibration?.reps ?? [];
  if (cal.length) {
    const hosts = stat(cal.map((c) => c.hostMs));
    L();
    L("## The slowdown, calibrated to this PC");
    L();
    L(
      `Before each rep the page times a fixed piece of JavaScript unthrottled (the reference PC, AJ's, takes ${results.calibration.referenceMs} ms), then sets Chrome's throttle so it runs the class's multiple of the reference (calibrate.mjs). This PC: ${fs(hosts)} ms.`,
    );
    if (spreadOf(hosts) > 0.1) L(`\n**Warning: this PC's speed moved ${Math.round(spreadOf(hosts) * 100)}% during the run** (another program, heat, power saving). Compare these numbers with care, or run again on a quiet PC.`);
    if (hosts && hosts.med > results.calibration.referenceMs * 1.1) L(`\n**This PC is slower than the reference**: the desktop profile can't be brought up to 1x, so its numbers are this PC's.`);
    L();
    L("| profile | class | rate used (median) | class reached (median) |");
    L("| --- | ---: | ---: | ---: |");
    for (const p of profiles) {
      const mine = cal.filter((c) => c.profile === p);
      L(`| ${p} | ${results.variants[first].profiles[p].cpu}x | ${med(stat(mine.map((c) => c.rate)))} | ${med(stat(mine.map((c) => c.effective)))}x |`);
    }
  }

  // Seed
  if (results.seed) {
    const sd = results.seed;
    L();
    L("## The seeded studio");
    L();
    L(
      `Studio day ${sd.today}, page clock held at ${sd.anchorIso ?? "(not held)"} (09:40 Eastern). ${n(sd.clients)} clients, ${n(sd.trainers)} trainers, ${n(sd.bookings)} bookings (${n(sd.bookingsToday)} today, ${n(sd.bookingsTomorrow)} tomorrow), ${n(sd.sessions)} sessions, ${n(sd.exerciseLogs)} exercise logs, ${n(sd.journalEntries)} notes (${n(sd.criticalNotes)} Critical), ${n(sd.ford)} FORD details, ${n(sd.clientStates)} client states (${sd.nightly ? `${n(sd.nightly.allStars)} All stars` : "no nightly record"}), ${n(sd.documents)} documents in all.`,
    );
    for (const [role, f] of Object.entries(sd.focus ?? {})) {
      L(`- The ${role} scenario opens **${f.name}** (${f.id}): ${n(f.priorSessions)} sessions before Journey, ${n(f.journeySessions)} Journey sessions, ${n(f.exerciseLogs)} exercise logs, ${f.machinesPerSession} machines a session; booked ${f.booked}.`);
    }
  }

  L();
  L("Profiles: " + profiles.map((p) => `**${p}** = ${results.variants[first].profiles[p].label}, ${results.variants[first].profiles[p].width}x${results.variants[first].profiles[p].height} @${results.variants[first].profiles[p].dpr}x`).join("; ") + ".");

  for (const v of variantNames) {
    L();
    L(`## What a trainer feels${variantNames.length > 1 ? ` (build ${v})` : ""}`);
    L();
    headlineTable(lines, summary[v], profiles);
  }

  // Sanity: the throttle must show in the main-thread columns.
  const ip = summary[first]["ipad10-portrait"]?.cold?.metrics?.TaskDuration?.med;
  const dk = (summary[first].desktop ?? summary[first].floor)?.cold?.metrics?.TaskDuration?.med;
  if (ip && dk) {
    L();
    L(
      ip >= 2 * dk
        ? `Check: the iPad 10th gen cold open's main-thread time (${n(ip)} ms) is ${Math.round((ip / dk) * 10) / 10}x the 1x profile's (${n(dk)} ms), so the slowdown shows in the main-thread column.`
        : `**Check FAILED: the iPad 10th gen cold open's main-thread time (${n(ip)} ms) is under 2x the 1x profile's (${n(dk)} ms).** The main-thread column is not showing the slowdown; don't trust it in this run.`,
    );
  }

  // A/B
  if (variantNames.length > 1) {
    const [a, b] = variantNames;
    L();
    L(`## ${b} against ${a}`);
    L();
    L("A change is only called real when it is bigger than both builds' spread (min to max).");
    L();
    L(`| profile | measure | ${a} | ${b} | change | % | verdict |`);
    L("| --- | --- | ---: | ---: | ---: | ---: | --- |");
    for (const p of profiles) {
      for (const [label, sc, step] of HEADLINE) {
        const x = pick(summary[a][p], sc, step);
        const y = pick(summary[b][p], sc, step);
        if (!x || !y) continue;
        const d = y.med - x.med;
        const noise = Math.max(x.max - x.min, y.max - y.min);
        L(`| ${p} | ${label} | ${fs(x)} | ${fs(y)} | ${d > 0 ? "+" : ""}${n(d)} | ${x.med ? `${d > 0 ? "+" : ""}${Math.round((d / x.med) * 100)}%` : "-"} | ${Math.abs(d) > noise ? (d < 0 ? "faster" : "slower") : "within the noise"} |`);
      }
    }
  }

  // Per scenario
  for (const v of variantNames) {
    for (const sc of Object.keys(SCENARIO_WORDS)) {
      if (!profiles.some((p) => summary[v][p]?.[sc])) continue;
      L();
      L(`## ${SCENARIO_WORDS[sc]}${variantNames.length > 1 ? ` (build ${v})` : ""}`);
      L();
      L("| profile | wall | waiting | long tasks n / ms / worst | INP~ | main thread | layout | style | requests / KB | heap MB | nodes | fail |");
      L("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
      for (const p of profiles) {
        const m = summary[v][p]?.[sc];
        if (!m) continue;
        L(
          `| ${p} | ${fs(m.wallMs)} | ${med(m.waitingMs)} | ${med(m.longTaskCount)} / ${fs(m.longTaskTotalMs)} / ${med(m.longTaskWorstMs)} | ${fs(m.worstInteractionMs)} | ${med(m.metrics.TaskDuration)} | ${med(m.metrics.LayoutDuration)} | ${med(m.metrics.RecalcStyleDuration)} | ${med(m.requests)} / ${med(m.kb)} | ${med(m.metrics.JSHeapUsedMB)} | ${med(m.domNodes)} | ${m.failures.length} |`,
        );
      }
      const stepKeys = [...new Set(profiles.flatMap((p) => Object.keys(summary[v][p]?.[sc]?.steps ?? {})))];
      if (stepKeys.length) {
        L();
        L(`| step | ${profiles.join(" | ")} |`);
        L(`| --- | ${profiles.map(() => "---:").join(" | ")} |`);
        for (const k of stepKeys) L(`| ${k} | ${profiles.map((p) => fs(summary[v][p]?.[sc]?.steps?.[k])).join(" | ")} |`);
      }
      const failures = profiles.flatMap((p) => (summary[v][p]?.[sc]?.failures ?? []).map((f) => `${p}: ${f}`));
      for (const f of failures) L(`- failed: ${f}`);
      if (sc === "session") {
        L();
        L("Finish is the emulator's, not the iPad's: the emulator answers the Finish batch in seconds, so the app's 2 s and 3 s waits run out (finishWaitsRanOut = 1). Judge Finish by its long tasks, not by finishToWrapUpMs or databaseAckMs.");
      }
    }
  }

  // Where the time went
  const slow = profiles.find((p) => p.startsWith("old-ipad")) || profiles.find((p) => p !== "floor") || profiles[0];
  const sm = summary[first][slow] ?? {};
  if (Object.values(sm).some((m) => m.cpuFiles?.length)) {
    L();
    L(`## Where the time went (${slow}, the profiled rep, self time through the source maps)`);
    L();
    L("A function's line is where it is DEFINED, not the line that was hot. Forced layout and style (a read of a size after a change) is counted as the calling function's own time, so a function that only measures (scrollToEnd, measureScroll) may be paying for layout, not JavaScript.");
    for (const sc of ["cold", "warm", "relaunch", "afterdeploy", "idle", "client", "session", "ops"]) {
      const m = sm[sc];
      if (!m || !m.cpuFiles.length) continue;
      L();
      L(`### ${sc} (CPU ${n(m.cpuTotalMs)} ms sampled, idle excluded)`);
      L();
      L("| top files | ms | top functions | ms |");
      L("| --- | ---: | --- | ---: |");
      for (let i = 0; i < 15; i += 1) {
        const f = m.cpuFiles[i];
        const fn = m.cpuFunctions[i];
        if (!f && !fn) break;
        L(`| ${f ? f.name : ""} | ${f ? f.ms : ""} | ${fn ? fn.name.replace(/\|/g, "/") : ""} | ${fn ? fn.ms : ""} |`);
      }
    }
  }

  L();
  L("## What this lab cannot tell you");
  L();
  L("- It is Chrome (Blink and V8) slowed down, not Safari (WebKit and JavaScriptCore) on an A14 or A12. The class multipliers are Speedometer-class estimates, calibrated on one JavaScript benchmark; WebKit's style, layout, GC and IndexedDB costs differ (IndexedDB matters: Firestore's cache is the top CPU item). Read the numbers as before against after on the same PC, not as an iPad's absolute.");
  L("- No GPU, compositor or raster realism (software raster at 2x), no memory pressure, no thermal throttling, no 3 GB ceiling or tab eviction. The scroll test is script-driven per frame: main-thread jank, not Safari's async scrolling.");
  L("- The database is the local emulator with the real rules: plain HTTP/1.1 to 127.0.0.1 where production is TLS and HTTP/2 to Google; it scans collections without indexes, so its query time grows with a collection's size; Chrome's IndexedDB runs in another process and is not throttled. The **floor** profile (desktop, 1x, no added network) is what is left of each open when the iPad and the network are taken away: mostly the emulator's own waiting.");
  L("- Finish (finishToWrapUpMs, databaseAckMs) is the emulator's: its answer to the Finish batch is slow, so the app's two waits run out on every profile, the floor included.");
  L("- Google's sign-in helper (apis.google.com) is refused, so the cold sign-in skips the helper iframe a real iPad loads; sign-in is the emulator's email and password, not the Google or Microsoft popup. No Mindbody, Gemini or Render (the studio is offline, /api answers 204/404).");
  L("- Safari-only behaviour is not exercised: Home Screen standalone mode, the iOS keyboard and viewport, touch inertia, Safari's own storage quirks. The iPad user agent only switches the app's own UA paths.");
  const path = join(outDir, "report.md");
  writeFileSync(path, `${lines.join("\n")}\n`);
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  return path;
}
