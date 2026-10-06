/**
 * THE PERF LAB'S DRIVER: the lab build, headless Chrome slowed to an iPad,
 * seven floor scenarios, three times each, medians.
 *
 *   node harness/perf-lab/run.mjs --build <lab build dir> [--out <dir>]
 *        [--profiles ipad10-portrait,desktop] [--reps 3] [--scenarios cold,warm,...]
 *
 * Needs the emulators running and seeded (lab.mjs does all of it). Writes
 * <out>/<run-id>/results.json and report.md. Everything goes to the local
 * emulators: the build can reach nothing else (src/perf-lab-hook.ts).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { connectPage, launchChrome } from "./cdp.mjs";
import { OUT_DIR, labCredentials } from "./lab-config.mjs";
import { SourceMaps, foldProfile } from "./profile.mjs";
import { writeReport } from "./report.mjs";
import { startStaticServer } from "./server.mjs";

/* -- Device classes -- */

const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export const PROFILES = {
  "ipad10-portrait": { label: "iPad 10th gen, portrait (A14 class, CPU 3x)", width: 820, height: 1180, dpr: 2, cpu: 3, ipad: true },
  "ipadmini-portrait": { label: "iPad mini 6, portrait (A15 class, CPU 3x)", width: 744, height: 1133, dpr: 2, cpu: 3, ipad: true },
  "old-ipad-landscape": { label: "iPad 8th/9th gen, landscape (A12/A13 class, CPU 5x)", width: 1180, height: 820, dpr: 2, cpu: 5, ipad: true },
  desktop: { label: "Desktop reference (CPU 1x)", width: 1440, height: 900, dpr: 1, cpu: 1, ipad: false },
};
/** Gym Wi-Fi to Firestore us-west1 from Ohio, roughly; the emulator is local, so the lab adds it. */
const NETWORK = { latencyMs: 60, downMbps: 20, upMbps: 10 };
/** --latency 0 turns the added network off (to tell the app's waits from the network's). */
let network = { ...NETWORK };

export const SCENARIOS = ["cold", "warm", "idle", "client", "session", "ops", "scroll"];

/* -- Args -- */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i += 1;
      } else out[key] = "1";
    }
  }
  return out;
}

/* -- The page's own instruments, installed before the app runs -- */

const INSTRUMENTS = `
(() => {
  const lab = (window.__lab = { lt: [], ev: [], lastMut: 0, errors: 0 });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) lab.lt.push([e.startTime, e.duration]); })
      .observe({ type: "longtask", buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) lab.ev.push([e.startTime, e.duration, e.name, e.interactionId || 0]); })
      .observe({ type: "event", buffered: true, durationThreshold: 16 });
  } catch (e) {}
  const watch = () => {
    try {
      new MutationObserver(() => { lab.lastMut = performance.now(); })
        .observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch (e) {}
  };
  if (document.documentElement) watch(); else document.addEventListener("DOMContentLoaded", watch);
  window.addEventListener("error", () => { lab.errors += 1; });
})();
`;

/* -- One Chrome, one profile, one rep -- */

class Session {
  constructor(page, chrome, profile, baseUrl, maps) {
    this.page = page;
    this.chrome = chrome;
    this.profile = profile;
    this.baseUrl = baseUrl;
    this.maps = maps;
    this.exceptions = 0;
    page.on("Runtime.exceptionThrown", () => (this.exceptions += 1));
  }

  async ev(expression, timeoutMs = 120000) {
    const r = await this.page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
    if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }

  now() {
    return this.ev("performance.now()");
  }

  /** In-page wait: the page's clock when `expr` first held, or -1 after the timeout. */
  waitFor(expr, timeoutMs = 30000) {
    return this.ev(
      `new Promise((res) => { const t0 = performance.now(); const f = () => { let ok = false; try { ok = !!(${expr}); } catch (e) {} if (ok) return res(performance.now()); if (performance.now() - t0 > ${timeoutMs}) return res(-1); setTimeout(f, 20); }; f(); })`,
      timeoutMs + 30000,
    );
  }

  async must(expr, what, timeoutMs = 30000) {
    const at = await this.waitFor(expr, timeoutMs);
    if (at < 0) throw new Error(`timed out waiting for ${what}`);
    return at;
  }

  /** The page's clock when the DOM had been still for `quietMs` (or the cap). */
  settle(quietMs = 600, capMs = 15000) {
    return this.ev(
      `new Promise((res) => { const t0 = performance.now(); const f = () => { const n = performance.now(); if (n - window.__lab.lastMut >= ${quietMs}) return res(window.__lab.lastMut); if (n - t0 > ${capMs}) return res(-1); setTimeout(f, 50); }; f(); })`,
      capMs + 30000,
    );
  }

  /** A real tap (mouse events the browser treats as trusted), at an element's centre. Returns the page clock at dispatch. */
  async tap(finder, what) {
    const rect = await this.ev(
      `(() => { const el = ${finder}; if (!el) return null; el.scrollIntoView({ block: "center", inline: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: performance.now() }; })()`,
    );
    if (!rect) throw new Error(`nothing to tap: ${what}`);
    const at = await this.now();
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await this.page.send("Input.dispatchMouseEvent", { type, x: rect.x, y: rect.y, button: "left", clickCount: type === "mouseMoved" ? 0 : 1 });
    }
    return at;
  }

  async key(key, code, keyCode) {
    await this.page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode });
    await this.page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
  }

  async typeText(text) {
    for (const ch of text) {
      await this.page.send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch, unmodifiedText: ch });
      await this.page.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
    }
  }

  async metrics() {
    const { metrics } = await this.page.send("Performance.getMetrics");
    return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  }

  async screenshot(file) {
    try {
      const r = await this.page.send("Page.captureScreenshot", { format: "png" }, 30000);
      writeFileSync(file, Buffer.from(r.data, "base64"));
    } catch {
      /* best effort */
    }
  }
}

/** Finders, as page-side expressions. */
const css = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const byText = (sel, text, { exact = false } = {}) =>
  `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => { const t = (e.textContent || "").trim().replace(/\\s+/g, " "); return ${exact ? "t === " + JSON.stringify(text) : "t.startsWith(" + JSON.stringify(text) + ")"}; })`;
const hubReady = `document.querySelectorAll(".hs-card[role=button]").length > 0`;

async function openSession(profile, profileDir, baseUrl, maps) {
  const chrome = await launchChrome(profileDir, { fresh: true });
  const page = await connectPage(chrome.port);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Performance.enable", { timeDomain: "threadTicks" }).catch(() => page.send("Performance.enable"));
  await page.send("Profiler.enable");
  await page.send("Profiler.setSamplingInterval", { interval: 500 });
  await page.send("Network.enable");
  await page.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: network.latencyMs,
    downloadThroughput: network.latencyMs > 0 ? (network.downMbps * 1e6) / 8 : -1,
    uploadThroughput: network.latencyMs > 0 ? (network.upMbps * 1e6) / 8 : -1,
  });
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.dpr,
    mobile: profile.ipad,
    screenWidth: profile.width,
    screenHeight: profile.height,
    screenOrientation: profile.width > profile.height ? { type: "landscapePrimary", angle: 90 } : { type: "portraitPrimary", angle: 0 },
  });
  if (profile.ipad) {
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page.send("Emulation.setUserAgentOverride", { userAgent: IPAD_UA, platform: "MacIntel" });
  }
  await page.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENTS });
  const s = new Session(page, chrome, profile, baseUrl, maps);
  // The same-origin blank page: the cold open navigates from here.
  await page.send("Page.navigate", { url: `${baseUrl}/__lab_blank` });
  await sleep(500);
  return s;
}

/* -- Measuring one scenario -- */

const METRIC_KEYS = ["ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "TaskDuration", "LayoutCount", "RecalcStyleCount"];

async function measured(s, run, { navigates = false } = {}) {
  const before = await s.metrics();
  const exceptionsBefore = s.exceptions;
  await s.page.send("Profiler.start");
  const t0 = navigates ? 0 : await s.now();
  const result = await run();
  const { profile } = await s.page.send("Profiler.stop");
  const after = await s.metrics();
  const lab = await s.ev(
    `({ lt: window.__lab.lt.filter((e) => e[0] >= ${t0}), ev: window.__lab.ev.filter((e) => e[0] >= ${t0}), nodes: document.getElementsByTagName("*").length })`,
  );
  const tasks = lab.lt.map((e) => e[1]);
  // INP-like: the longest event of each interaction, then the worst interaction.
  const byInteraction = new Map();
  for (const [, dur, name, id] of lab.ev) {
    if (!id) continue;
    const prev = byInteraction.get(id);
    if (!prev || dur > prev.dur) byInteraction.set(id, { dur, name });
  }
  const interactions = [...byInteraction.values()];
  const worst = interactions.reduce((m, x) => (x.dur > m.dur ? x : m), { dur: 0, name: null });
  const deltas = {};
  for (const k of METRIC_KEYS) {
    // Cumulative counters; a navigation may start them again, so a negative delta means "since the new document".
    let v = (after[k] ?? 0) - (before[k] ?? 0);
    if (v < 0) v = after[k] ?? 0;
    deltas[k] = k.endsWith("Duration") ? Math.round(v * 1000) : Math.round(v);
  }
  return {
    ...result,
    longTasks: {
      count: tasks.length,
      totalMs: Math.round(tasks.reduce((a, b) => a + b, 0)),
      worstMs: Math.round(tasks.reduce((a, b) => Math.max(a, b), 0)),
    },
    interactions: { count: interactions.length, worstMs: Math.round(worst.dur), worstEvent: worst.name },
    metrics: { ...deltas, JSHeapUsedMB: Math.round(((after.JSHeapUsedSize ?? 0) / 1048576) * 10) / 10, Nodes: after.Nodes ?? null },
    domNodes: lab.nodes,
    exceptions: s.exceptions - exceptionsBefore,
    cpu: foldProfile(profile, s.maps),
  };
}

const round = (n) => (typeof n === "number" && n >= 0 ? Math.round(n) : null);

/* -- The scenarios -- */

const SCENARIO_RUNS = {
  /** (a) Empty cache: load, sign in, Start at the studio, the Hub's bookings drawn. */
  async cold(s, ctx) {
    return measured(
      s,
      async () => {
        await s.page.send("Page.navigate", { url: `${s.baseUrl}/` });
        let signInScreen = -1;
        for (let i = 0; i < 600 && signInScreen < 0; i += 1) {
          await sleep(100);
          try {
            signInScreen = await s.waitFor(`window.__perfLab && ${byText("button", "Continue with Google")}`, 100);
          } catch {
            /* the document is still being replaced */
          }
        }
        if (signInScreen < 0) throw new Error("the sign-in screen never came");
        const signInAt = await s.now();
        await s.ev(`window.__perfLab.signIn(${JSON.stringify(ctx.creds.email)}, ${JSON.stringify(ctx.creds.password)})`);
        const greeting = await s.must(byText("button", "Start at"), "the studio greeting", 60000);
        const tapAt = await s.tap(byText("button", "Start at"), "Start at the studio");
        const hub = await s.must(`${hubReady} && performance.getEntriesByName("journey:hub-data").length > 0`, "the Hub's bookings", 60000);
        const settled = await s.settle();
        const marks = await s.ev(
          `Object.fromEntries(["auth-ready", "trainer-ready", "hub-data"].map((m) => [m, (performance.getEntriesByName("journey:" + m)[0] || {}).startTime ?? null]))`,
        );
        const nav = await s.ev(`(() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd } : {}; })()`);
        return {
          wallMs: round(hub),
          steps: {
            signInScreenMs: round(signInScreen),
            domContentLoadedMs: round(nav.dcl),
            signInToGreetingMs: round(greeting - signInAt),
            tapToHubMs: round(hub - tapAt),
            hubSettledMs: round(settled),
            authReadyMark: round(marks["auth-ready"]),
            trainerReadyMark: round(marks["trainer-ready"]),
            hubDataMark: round(marks["hub-data"]),
          },
        };
      },
      { navigates: true },
    );
  },

  /** (b) Reload with the HTTP cache and the Firestore cache kept: straight back to the Hub. */
  async warm(s) {
    return measured(
      s,
      async () => {
        await s.page.send("Page.reload", {});
        let hub = -1;
        for (let i = 0; i < 600 && hub < 0; i += 1) {
          await sleep(100);
          try {
            const greeting = await s.ev(`!!(${byText("button", "Start at")})`);
            if (greeting) await s.tap(byText("button", "Start at"), "Start at the studio");
            hub = await s.waitFor(`${hubReady} && performance.getEntriesByName("journey:hub-data").length > 0`, 200);
          } catch {
            /* reloading */
          }
        }
        if (hub < 0) throw new Error("the Hub never came back after the reload");
        const settled = await s.settle();
        const marks = await s.ev(
          `Object.fromEntries(["auth-ready", "trainer-ready", "hub-data"].map((m) => [m, (performance.getEntriesByName("journey:" + m)[0] || {}).startTime ?? null]))`,
        );
        return {
          wallMs: round(hub),
          steps: { hubSettledMs: round(settled), authReadyMark: round(marks["auth-ready"]), trainerReadyMark: round(marks["trainer-ready"]), hubDataMark: round(marks["hub-data"]) },
        };
      },
      { navigates: true },
    );
  },

  /** (c) The Hub left open across a minute tick. */
  async idle(s, ctx) {
    await s.must(hubReady, "the Hub");
    return measured(s, async () => {
      await sleep(ctx.idleMs);
      return { wallMs: ctx.idleMs, steps: {} };
    });
  },

  /** (d) A client card -> the peek -> Open profile -> the Journey tab drawn. */
  async client(s) {
    await s.must(hubReady, "the Hub");
    const r = await measured(s, async () => {
      const t0 = await s.tap(`document.querySelectorAll(".hs-card[role=button]")[2]`, "a client card");
      const peek = await s.must(css(".hp .hp-btn"), "the peek");
      const t1 = await s.tap(byText(".hp .hp-btn", "Open profile"), "Open profile");
      const journey = await s.must(`document.querySelectorAll(".jg-row").length > 0`, "the Journey tab", 45000);
      const settled = await s.settle();
      return {
        wallMs: round(journey - t0),
        steps: { tapToPeekMs: round(peek - t0), openToJourneyMs: round(journey - t1), journeySettledMs: settled > 0 ? round(settled - t1) : null },
      };
    });
    await s.tap(byText("button", "Hub", { exact: true }), "the Hub tab");
    await s.must(hubReady, "the Hub again");
    return r;
  },

  /** (e) Start a session from the briefing, 5 sets, the machine menu, Finish -> the Wrap-up. */
  async session(s, ctx) {
    await s.must(hubReady, "the Hub");
    // Tomorrow's bookings are all still to come; a different card each run.
    await s.tap(`document.querySelectorAll(".hd-week .hd-day")[1]`, "tomorrow");
    await s.must(hubReady, "tomorrow's cards");
    await sleep(500);
    const r = await measured(s, async () => {
      let t0 = -1;
      let peek = -1;
      for (let k = ctx.cardIndex; k < ctx.cardIndex + 12 && t0 < 0; k += 1) {
        const at = await s.tap(`document.querySelectorAll(".hs-card[role=button]")[${k}]`, "a client card");
        peek = await s.waitFor(css(".hp .hp-btn"), 15000);
        if (await s.ev(`!!document.querySelector('.hp [data-primary=true][data-go=true]')`)) t0 = at;
        else await s.key("Escape", "Escape", 27);
      }
      if (t0 < 0) throw new Error("no card offered Start session");
      const tStart = await s.tap(css(".hp [data-primary=true][data-go=true]"), "Start session");
      const briefing = await s.must(css(".br__cta"), "the briefing", 45000);
      const tGo = await s.tap(css(".br__cta"), "the briefing's Start session");
      const nowBar = await s.must(css(".jg-nb__outin"), "the Now Bar", 45000);
      const sets = [];
      for (let i = 0; i < 5; i += 1) {
        await s.tap(css(".jg-nb__outin"), "the reps box");
        await s.ev(`(() => { const el = document.querySelector(".jg-nb__outin"); el && el.select && el.select(); })()`);
        await s.typeText(String(6 + (i % 4)));
        // The last machine of a short routine has no Next: the set is kept as typed, so leave the box.
        const hasNext = await s.ev(`!!(${byText("button", "Next")})`);
        const tNext = hasNext ? await s.tap(byText("button", "Next"), "Next") : await s.now();
        if (!hasNext) await s.key("Tab", "Tab", 9);
        const done = await s.settle(300, 8000);
        sets.push(done > 0 ? done - tNext : null);
      }
      const tMenu = await s.tap(css(".jg-machine__btn"), "a machine's name");
      const menu = await s.must(css(".mm-dialog"), "the machine menu");
      const menuSettled = await s.settle(400, 8000);
      await s.key("Escape", "Escape", 27);
      await s.waitFor(`!document.querySelector(".mm-dialog")`, 5000);
      const tFinish = await s.tap(byText("button", "Finish", { exact: true }), "Finish");
      await s.must(byText("button", "Finish session", { exact: true }), "the end-session question");
      const tConfirm = await s.tap(byText("button", "Finish session", { exact: true }), "Finish session");
      const wrap = await s.must(`/Wrap-up\\W+session saved/i.test(document.body.textContent)`, "the Wrap-up", 45000);
      const ack = await s.waitFor(`/Wrap-up\\W+session saved/i.test(document.body.textContent) && !/session saved on this iPad/i.test(document.body.textContent)`, 20000);
      return {
        wallMs: round(wrap - t0),
        steps: {
          tapToPeekMs: round(peek - t0),
          startToBriefingMs: round(briefing - tStart),
          briefingToNowBarMs: round(nowBar - tGo),
          setMedianMs: round([...sets].filter((x) => x != null).sort((a, b) => a - b)[2] ?? null),
          setWorstMs: round(Math.max(...sets.filter((x) => x != null), 0)),
          menuOpenMs: round(menu - tMenu),
          menuSettledMs: menuSettled > 0 ? round(menuSettled - tMenu) : null,
          finishToWrapUpMs: round(wrap - tConfirm),
          finishTapToWrapUpMs: round(wrap - tFinish),
          databaseAckMs: ack > 0 ? round(ack - tConfirm) : null,
        },
      };
    });
    try {
      await s.ev(`Promise.race([window.__perfLab.waitForWrites().then(() => true), new Promise((r) => setTimeout(() => r(false), 30000))])`, 60000);
    } catch {
      /* reported by databaseAckMs */
    }
    await s.tap(byText("button", "Back to Hub", { exact: true }), "Back to Hub");
    await s.must(hubReady, "the Hub again");
    return r;
  },

  /** (f) Operations -> Today, then the Client Directory with a search typed. */
  async ops(s) {
    await s.must(hubReady, "the Hub");
    const r = await measured(s, async () => {
      const t0 = await s.tap(css('button[aria-label="Trainer Settings"]'), "the trainer menu");
      await s.must(byText("button", "Open Operations"), "the menu");
      const tOps = await s.tap(byText("button", "Open Operations"), "Open Operations");
      const brief = await s.must(css(".ops-brief"), "Operations Today", 45000);
      // Settled: no section still "Reading..." (or the cap).
      const briefSettled = await s.waitFor(`!/Reading(\\u2026|\\.\\.\\.)/.test(document.querySelector(".ops-brief").textContent)`, 30000);
      await s.tap(css('button[aria-label="Back to the Hub"]'), "Back to the Hub");
      await s.must(hubReady, "the Hub");
      const tDir = await s.tap(byText("button", "Client", { exact: true }), "the Client tab");
      const dir = await s.must(`document.querySelector(".cd-search-input") && document.querySelector(".cd-scroll") && document.querySelector(".cd-scroll").textContent.length > 200`, "the Client Directory", 45000);
      const dirSettled = await s.settle(600, 15000);
      await s.tap(css(".cd-search-input"), "the search box");
      const tType = await s.now();
      await s.typeText("Pat");
      const typed = await s.now();
      const searchSettled = await s.settle(500, 10000);
      return {
        wallMs: round(brief - tOps),
        steps: {
          menuToTodayMs: round(brief - tOps),
          todaySettledMs: briefSettled > 0 ? round(briefSettled - tOps) : null,
          tabToDirectoryMs: round(dir - tDir),
          directorySettledMs: dirSettled > 0 ? round(dirSettled - tDir) : null,
          typingMs: round(typed - tType),
          lastKeyToResultsMs: searchSettled > 0 ? round(Math.max(0, searchSettled - typed)) : null,
          fromMenuTapMs: round(brief - t0),
        },
      };
    });
    await s.tap(css(".cd-search-clear"), "clear the search").catch(() => {});
    return r;
  },

  /** (g) Scroll the Hub's grid and the Directory: frames the main thread missed. */
  async scroll(s) {
    const scrollIn = (sel) =>
      s.ev(
        `new Promise((res) => {
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) return res(null);
          el.scrollTop = 0;
          const max = Math.max(0, el.scrollHeight - el.clientHeight);
          const step = 36; const frames = []; let last = performance.now(); let dir = 1; let passes = 0;
          const tick = (now) => {
            frames.push(now - last); last = now;
            el.scrollTop = Math.min(max, Math.max(0, el.scrollTop + dir * step));
            if ((dir > 0 && el.scrollTop >= max) || (dir < 0 && el.scrollTop <= 0)) { dir = -dir; passes += 1; }
            if (passes >= 2 || frames.length > 900) {
              const ft = frames.slice(1); const budget = 1000 / 60;
              const missed = ft.reduce((a, d) => a + Math.max(0, Math.round(d / budget) - 1), 0);
              const sorted = [...ft].sort((a, b) => a - b);
              return res({ frames: ft.length, missedFrames: missed, worstFrameMs: Math.round(sorted[sorted.length - 1] || 0), p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0), scrollable: max });
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame((n) => { last = n; requestAnimationFrame(tick); });
        })`,
        120000,
      );
    await s.tap(byText("button", "Hub", { exact: true }), "the Hub tab").catch(() => {});
    await s.must(hubReady, "the Hub");
    return measured(s, async () => {
      const hub = await scrollIn(".hs-scroll");
      await s.tap(byText("button", "Client", { exact: true }), "the Client tab");
      await s.must(`document.querySelector(".cd-scroll") && document.querySelector(".cd-scroll").textContent.length > 200`, "the Client Directory", 45000);
      await s.settle(500, 10000);
      const dir = await scrollIn(".cd-scroll");
      return {
        wallMs: null,
        steps: {
          hubScrollablePx: hub?.scrollable ?? null,
          directoryScrollablePx: dir?.scrollable ?? null,
          hubFrames: hub?.frames ?? null,
          hubMissedFrames: hub?.missedFrames ?? null,
          hubWorstFrameMs: hub?.worstFrameMs ?? null,
          hubP95FrameMs: hub?.p95FrameMs ?? null,
          directoryFrames: dir?.frames ?? null,
          directoryMissedFrames: dir?.missedFrames ?? null,
          directoryWorstFrameMs: dir?.worstFrameMs ?? null,
          directoryP95FrameMs: dir?.p95FrameMs ?? null,
        },
      };
    });
  },
};

/* -- Main -- */

export async function runLab(options) {
  const build = resolve(options.build);
  if (!existsSync(join(build, "index.html"))) throw new Error(`No lab build at ${build}.`);
  const profiles = (options.profiles ? options.profiles.split(",") : Object.keys(PROFILES)).map((p) => {
    if (!PROFILES[p]) throw new Error(`Unknown profile ${p}.`);
    return p;
  });
  const scenarios = options.scenarios ? options.scenarios.split(",") : SCENARIOS;
  const reps = Number(options.reps || 3);
  network = { ...NETWORK, ...(options.latency !== undefined ? { latencyMs: Number(options.latency) } : {}) };
  const idleMs = Number(options.idleMs || 70000);
  const outRoot = resolve(options.out || OUT_DIR);
  const runId = options.runId || new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = join(outRoot, runId);
  mkdirSync(outDir, { recursive: true });
  const creds = labCredentials();
  const maps = new SourceMaps(build);
  const srv = await startStaticServer(build);
  const results = {
    runId,
    startedAt: new Date().toISOString(),
    network,
    reps,
    idleMs,
    seed: options.seedSummary ? JSON.parse(readFileSync(options.seedSummary, "utf8")) : null,
    profiles: {},
  };
  let runCounter = 0;
  try {
    for (const name of profiles) {
      const profile = PROFILES[name];
      results.profiles[name] = { ...profile, runs: [] };
      for (let rep = 1; rep <= reps; rep += 1) {
        const tag = `${name} #${rep}`;
        console.log(`[${new Date().toLocaleTimeString()}] ${tag}`);
        // lab.mjs restarts the emulators from the seeded export here, so every rep starts from the same data.
        if (options.beforeRep) await options.beforeRep(name, rep);
        const s = await openSession(profile, join(outRoot, "chrome-profiles", `${name}-${rep}`), srv.url, maps);
        const run = { rep, scenarios: {} };
        let broken = false;
        for (const scenario of scenarios) {
          if (broken) {
            run.scenarios[scenario] = { error: "skipped: an earlier scenario left the app in an unknown place" };
            continue;
          }
          const started = Date.now();
          try {
            // Fresh data each rep: the same client every time. Shared data: a different one each rep.
            const ctx = { creds, idleMs, cardIndex: options.beforeRep ? 0 : (runCounter * 3) % 60 };
            run.scenarios[scenario] = await SCENARIO_RUNS[scenario](s, ctx);
            const m = run.scenarios[scenario];
            console.log(`  ${scenario}: ${m.wallMs ?? "-"} ms, long tasks ${m.longTasks.count} (${m.longTasks.totalMs} ms, worst ${m.longTasks.worstMs}), worst interaction ${m.interactions.worstMs} ms  [${Math.round((Date.now() - started) / 1000)} s]`);
          } catch (err) {
            run.scenarios[scenario] = { error: String(err.message || err) };
            console.log(`  ${scenario}: FAILED ${err.message || err}`);
            await s.screenshot(join(outDir, `fail-${name}-${rep}-${scenario}.png`));
            if (scenario === "cold" || scenario === "warm") broken = true;
            else {
              // Back to a known place for the next scenario: a reload lands on the Hub.
              try {
                await s.key("Escape", "Escape", 27);
                await s.page.send("Page.reload", {});
                await sleep(1500);
                await s.must(hubReady, "the Hub after a failure", 60000);
              } catch {
                broken = true;
              }
            }
          }
        }
        runCounter += 1;
        try {
          await s.ev(`window.__perfLab && Promise.race([window.__perfLab.waitForWrites(), new Promise((r) => setTimeout(r, 15000))])`, 30000);
        } catch {
          /* closing anyway */
        }
        await s.screenshot(join(outDir, `last-${name}-${rep}.png`));
        s.page.close();
        await s.chrome.close();
        if (options.afterRep) await options.afterRep(name, rep);
        results.profiles[name].runs.push(run);
        writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
      }
    }
  } finally {
    await srv.close();
  }
  results.finishedAt = new Date().toISOString();
  writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
  const reportPath = writeReport(results, outDir);
  console.log(`Results: ${join(outDir, "results.json")}`);
  console.log(`Report:  ${reportPath}`);
  return { outDir, results };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.build) {
    console.error("Usage: node harness/perf-lab/run.mjs --build <lab build dir> [--out dir] [--profiles a,b] [--reps 3] [--scenarios cold,warm,...]");
    process.exit(2);
  }
  runLab(args).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
