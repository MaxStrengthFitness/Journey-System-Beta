/**
 * THE PERF LAB'S DRIVER: the lab build, headless Chrome slowed to an iPad
 * (calibrated to the PC that runs it), the floor's scenarios, reps
 * interleaved across the profiles, medians with their spread.
 *
 *   node harness/perf-lab/run.mjs --build <lab build dir> [--build-b <second build>]
 *        [--out <dir>] [--profiles ipad10-portrait,desktop] [--reps 3]
 *        [--scenarios cold,warm,...] [--no-profile-rep] [--bare]
 *
 * Needs the emulators running and seeded (lab.mjs does all of it). Writes
 * <out>/<run-id>/results.json, summary.json and report.md. Everything goes to
 * the local emulators: the build can reach nothing else (src/perf-lab-hook.ts),
 * and Chrome is told to refuse Google's hosts.
 *
 * HOW A NUMBER IS TAKEN (the review of Oct 6 2026 changed most of these):
 *   - Timed reps run with NO profiler. One extra rep per profile runs with the
 *     profiler for "Where the time went"; its numbers stay out of the medians.
 *   - The page's instruments are small: long tasks, event timing, and a
 *     childList-only mutation watch (no attributes, no text), so animations
 *     and ticking clocks don't count as work. --bare drops them all, to
 *     measure what they cost.
 *   - "Drawn" is the next paint after the thing appeared (found by a watch on
 *     the DOM, with a 100 ms poll behind it), not a 20 ms poll.
 *   - "Settled" is the moment the page went quiet: no element added or
 *     removed and no long task for a while.
 *   - A set's time is the Next tap's own interaction (event timing:
 *     input to the next paint after its handlers), floored at 16 ms.
 *   - "Main thread" is Performance.getMetrics TaskDuration in wall time, so it
 *     includes the slowdown (ScriptDuration does not follow the throttle, so it
 *     is kept in results.json only).
 *   - The page's clock is held at the seed's anchor (09:40 Eastern on the
 *     seed's day) by a Date shim, so every run sees the same Hub.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { calibrate, REFERENCE_BENCH_MS } from "./calibrate.mjs";
import { connectPage, launchChrome } from "./cdp.mjs";
import { DATABASE_ID, FIRESTORE_PORT, HOST, OUT_DIR, PROJECT_ID, labCredentials } from "./lab-config.mjs";
import { SourceMaps, foldProfile } from "./profile.mjs";
import { writeReport } from "./report.mjs";
import { startStaticServer } from "./server.mjs";

/* -- Device classes -- */

const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

/**
 * `cpu` is the class's JavaScript speed as a multiple of the reference PC's
 * (calibrate.mjs turns it into a throttling rate for the PC running the lab).
 */
export const PROFILES = {
  "ipad10-portrait": { label: "iPad 10th gen, portrait (A14 class, 3x the reference)", width: 820, height: 1180, dpr: 2, cpu: 3, ipad: true },
  "ipadmini-portrait": { label: "iPad mini 6, portrait (A15 class, 3x)", width: 744, height: 1133, dpr: 2, cpu: 3, ipad: true },
  "old-ipad-landscape": { label: "iPad 8th/9th gen, landscape (A12/A13 class, 5x)", width: 1180, height: 820, dpr: 2, cpu: 5, ipad: true },
  desktop: { label: "Desktop reference (1x)", width: 1440, height: 900, dpr: 1, cpu: 1, ipad: false },
  floor: {
    label: "The emulator floor: desktop, 1x, no added network (what is left is the lab's own waiting)",
    width: 1440,
    height: 900,
    dpr: 1,
    cpu: 1,
    ipad: false,
    latencyMs: 0,
    scenarios: ["cold", "warm", "relaunch", "afterdeploy", "client", "session", "ops"],
    profiled: false,
  },
};
/** Gym Wi-Fi to Firestore us-west1 from Ohio, roughly; the emulator is local, so the lab adds it. */
const NETWORK = { latencyMs: 60, downMbps: 20, upMbps: 10 };
/** A lab page reaches 127.0.0.1 over plain HTTP only: every https URL (Google's sign-in helper, the production project's domains) is refused. A pattern naming googleapis.com would also match the Auth emulator's own path (127.0.0.1:9099/identitytoolkit.googleapis.com/...). */
const BLOCKED_URLS = ["https://*"];

export const SCENARIOS = ["cold", "warm", "relaunch", "afterdeploy", "idle", "client", "session", "ops", "scroll"];

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

/**
 * offsetMs: the Date shim's offset (the page's clock = the PC's + offset).
 * bare: no observers at all (to measure what they cost).
 */
function instruments(offsetMs, bare) {
  return `
(() => {
  const OFFSET = ${Math.round(offsetMs) || 0};
  if (OFFSET) {
    const RealDate = Date;
    const realNow = RealDate.now.bind(RealDate);
    function LabDate(...a) {
      if (!new.target) return new RealDate(realNow() + OFFSET).toString();
      if (a.length === 0) return new RealDate(realNow() + OFFSET);
      return a.length === 1 ? new RealDate(a[0]) : new RealDate(...a);
    }
    LabDate.prototype = RealDate.prototype;
    LabDate.now = () => realNow() + OFFSET;
    LabDate.parse = RealDate.parse;
    LabDate.UTC = RealDate.UTC;
    Object.defineProperty(LabDate, "name", { value: "Date" });
    window.Date = LabDate;
  }
  const lab = (window.__lab = { lt: [], ev: [], lastMut: 0, lastLT: 0, errors: 0, bare: ${bare ? "true" : "false"} });
  if (lab.bare) return;
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { lab.lt.push([e.startTime, e.duration]); lab.lastLT = Math.max(lab.lastLT, e.startTime + e.duration); } })
      .observe({ type: "longtask", buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) lab.ev.push([e.startTime, e.duration, e.name, e.interactionId || 0]); })
      .observe({ type: "event", buffered: true, durationThreshold: 16 });
  } catch (e) {}
  // Elements added or removed only: style and text changes (animations, a ticking clock) are not work arriving.
  const watch = () => {
    try {
      new MutationObserver(() => { lab.lastMut = performance.now(); })
        .observe(document.documentElement, { subtree: true, childList: true });
    } catch (e) {}
  };
  if (document.documentElement) watch(); else document.addEventListener("DOMContentLoaded", watch);
  window.addEventListener("error", () => { lab.errors += 1; });
})();
`;
}

/* -- PERF_LAB_TRACE helpers -- */

/** A line in the trace at this moment (the scenarios mark their phases with it). */
export function traceMark(label) {
  if (!process.env.PERF_LAB_TRACE) return;
  try {
    writeFileSync(process.env.PERF_LAB_TRACE, `${Date.now()}\tmark\t${label}\n`, { flag: "a" });
  } catch {
    /* a trace line is never worth a failed run */
  }
}

/**
 * The listen stream's WebChannel frames ("<length>\n<json>"), decoded into one
 * summary line per frame: documents by collection with the targets they came
 * for, deletes and removes, target changes (CURRENT, RESET, ...) and existence
 * filters. What the iPad has to take in, and for which listener.
 */
function listenDecoder() {
  const dec = new TextDecoder();
  let buf = "";
  const summarize = (frame) => {
    let arr;
    try {
      arr = JSON.parse(frame);
    } catch {
      return `(frame ${frame.length} chars, unparsed)`;
    }
    const docs = new Map();
    const parts = [];
    let bytes = 0;
    for (const item of Array.isArray(arr) ? arr : []) {
      for (const m of Array.isArray(item?.[1]) ? item[1] : []) {
        if (!m || typeof m !== "object") continue;
        if (m.documentChange) {
          const name = m.documentChange.document?.name?.split("/documents/")[1] ?? "?";
          const coll = name.replace(/\/[^/]+$/, "").replace(/\/[^/]+\//g, "/*/");
          const key = `${coll} T${(m.documentChange.targetIds || []).join(",")}${m.documentChange.removedTargetIds ? " -T" + m.documentChange.removedTargetIds.join(",") : ""}`;
          const len = JSON.stringify(m.documentChange.document).length;
          bytes += len;
          const d = docs.get(key) || { n: 0, len: 0, one: name };
          d.n += 1;
          d.len += len;
          docs.set(key, d);
        } else if (m.documentDelete || m.documentRemove) {
          const x = m.documentDelete || m.documentRemove;
          parts.push(`${m.documentDelete ? "delete" : "remove"} ${(x.document || "").split("/documents/")[1]} T${(x.removedTargetIds || []).join(",")}`);
        } else if (m.targetChange) {
          const t = m.targetChange;
          parts.push(`target ${t.targetChangeType || "NO_CHANGE"} T${(t.targetIds || []).join(",") || "*"}${t.cause ? " cause" : ""}`);
        } else if (m.filter) parts.push(`filter T${m.filter.targetId} count=${m.filter.count}`);
      }
    }
    for (const [key, d] of docs) parts.unshift(`docs ${key} x${d.n} ${Math.round(d.len / 1024)}KB${d.n === 1 ? " " + d.one : ""}`);
    return parts.join(" | ") || null;
  };
  return {
    push(bytes) {
      buf += dec.decode(bytes, { stream: true });
      const lines = [];
      for (;;) {
        const nl = buf.indexOf("\n");
        if (nl < 0) break;
        const len = Number(buf.slice(0, nl));
        if (!Number.isFinite(len) || buf.length < nl + 1 + len) break;
        const frame = buf.slice(nl + 1, nl + 1 + len);
        buf = buf.slice(nl + 1 + len);
        const s = summarize(frame);
        if (s) lines.push(s);
      }
      return lines;
    },
  };
}

/* -- One Chrome, one profile, one rep -- */

class Session {
  constructor({ profile, profileDir, baseUrl, maps, offsetMs, bare, profiled, network }) {
    Object.assign(this, { profile, profileDir, baseUrl, maps, offsetMs, bare, profiled, network });
    this.exceptions = 0;
    /** Firestore saying its disk cache could not start (it then runs on memory and downloads everything again). */
    this.cacheFallbacks = 0;
    this.net = { requests: 0, bytes: 0 };
    this.calibration = null;
  }

  /** Chrome on this rep's profile folder, set up as the profile, on the same-origin blank page, calibrated. */
  async open({ fresh }) {
    this.chrome = await launchChrome(this.profileDir, { fresh });
    const page = await connectPage(this.chrome.port);
    this.page = page;
    page.on("Runtime.exceptionThrown", () => (this.exceptions += 1));
    page.on("Runtime.consoleAPICalled", (p) => {
      if (p.type !== "warning" && p.type !== "error") return;
      const text = (p.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
      if (/memory cache|exclusive access|IndexedDb|IndexedDB|persistence/i.test(text)) {
        this.cacheFallbacks += 1;
        if (process.env.PERF_LAB_TRACE) traceMark(`console ${p.type}: ${text.slice(0, 300)}`);
      }
    });
    // The report's network line, on every run (the trace below adds its own
    // listeners beside these, never in their place).
    page.on("Network.requestWillBeSent", (p) => {
      if (!/^data:|^blob:/.test(p.request?.url || "")) this.net.requests += 1;
    });
    page.on("Network.dataReceived", (p) => {
      this.net.bytes += p.encodedDataLength || 0;
      this.lastDataAt = Date.now();
    });
    if (process.env.PERF_LAB_TRACE) {
      const fsT = await import("node:fs");
      const out = (line) => fsT.appendFileSync(process.env.PERF_LAB_TRACE, line + "\n");
      let off = null;
      const reqs = new Map();
      page.on("Runtime.consoleAPICalled", (p) => {
        const a = p.args || [];
        if (a[0]?.value !== "[trace]") return;
        out(`${Math.round(p.timestamp)}\tconsole\t${a.slice(1).map((x) => x.value).join("\t")}`);
      });
      page.on("Network.requestWillBeSent", (p) => {
        const u = p.request?.url || "";
        if (p.wallTime) off = p.wallTime * 1000 - p.timestamp * 1000;
        if (!/8085|9099/.test(u)) return;
        const kind = (u.match(/Firestore\/(\w+)\/channel/) || [])[1] || u.slice(22, 60);
        const rid = (u.match(/[?&]RID=(\w+)/) || [])[1] || "";
        reqs.set(p.requestId, { kind, method: p.request.method, rid, t: p.wallTime * 1000 });
        if ((p.request.postData || "").length > 500) {
          let body = p.request.postData;
          try { body = decodeURIComponent(body.replace(/\+/g, " ")); } catch {}
          fsT.appendFileSync(process.env.PERF_LAB_TRACE + ".bodies", `==== ${Math.round(p.wallTime * 1000)} ${kind} RID=${rid}\n${body}\n`);
        }
        out(`${Math.round(p.wallTime * 1000)}\tsend\t${p.request.method} ${kind} RID=${rid} ${p.requestId} body=${(p.request.postData || "").length}`);
        // What arrives on the listen stream, decoded (`recv` lines): which targets the documents came for.
        if (p.request.method === "GET" && kind === "Listen") {
          const r = reqs.get(p.requestId);
          r.stream = listenDecoder();
          page.send("Network.streamResourceContent", { requestId: p.requestId }).then((res) => {
            if (res?.bufferedData) for (const line of r.stream.push(Buffer.from(res.bufferedData, "base64"))) out(`${Math.round(Date.now())}\trecv\t${kind}\t${line}`);
          }).catch(() => {});
        }
      });
      page.on("Network.dataReceived", (p) => {
        const r = reqs.get(p.requestId);
        if (!r || off == null || r.method !== "GET") return;
        const at = Math.round(p.timestamp * 1000 + off);
        out(`${at}\tdata\t${r.kind} ${p.requestId} +${p.dataLength}`);
        if (p.data && r.stream) for (const line of r.stream.push(Buffer.from(p.data, "base64"))) out(`${at}\trecv\t${r.kind}\t${line}`);
      });
      page.on("Network.loadingFinished", (p) => {
        const r = reqs.get(p.requestId);
        if (!r || off == null) return;
        out(`${Math.round(p.timestamp * 1000 + off)}\tdone\t${r.method} ${r.kind} RID=${r.rid} ${p.requestId} took=${Math.round(p.timestamp * 1000 + off - r.t)} bytes=${p.encodedDataLength}`);
      });
    }
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    // Wall time (the default time domain), so the durations include the slowdown.
    await page.send("Performance.enable");
    if (this.profiled) {
      await page.send("Profiler.enable");
      await page.send("Profiler.setSamplingInterval", { interval: 500 });
    }
    await page.send("Network.enable");
    await page.send("Network.setBlockedURLs", { urls: BLOCKED_URLS });
    const latency = this.network.latencyMs;
    await page.send("Network.emulateNetworkConditions", {
      offline: false,
      latency,
      downloadThroughput: latency > 0 ? (this.network.downMbps * 1e6) / 8 : -1,
      uploadThroughput: latency > 0 ? (this.network.upMbps * 1e6) / 8 : -1,
    });
    const profile = this.profile;
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
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: instruments(this.offsetMs, this.bare) });
    // The same-origin blank page: the opens navigate from here.
    await page.send("Page.navigate", { url: `${this.baseUrl}/__lab_blank` });
    await sleep(500);
    const setRate = (rate) => page.send("Emulation.setCPUThrottlingRate", { rate });
    this.calibration = await calibrate((expr) => this.ev(expr, 60000), setRate, profile.cpu);
    return this;
  }

  /** Waits for this page's writes, closes Chrome (the profile folder is kept). */
  async close() {
    await this.flushWrites();
    try {
      this.page.close();
    } catch {
      /* gone */
    }
    await this.chrome.close();
  }

  async flushWrites(ms = 15000) {
    try {
      await this.ev(`window.__perfLab ? Promise.race([window.__perfLab.waitForWrites().then(() => true), new Promise((r) => setTimeout(() => r(false), ${ms}))]) : null`, ms + 15000);
    } catch {
      /* closing anyway */
    }
  }

  /**
   * Chrome closed and started again on the same profile folder: an iPad's
   * Home Screen app that iOS put away. With clearCache, the HTTP cache and
   * V8's code cache go too (IndexedDB, the Firestore cache, stays): the first
   * open after a deploy, when every file has a new name.
   */
  /**
   * Waits until nothing has arrived from the database for `quietMs` and the page has gone quiet, so what it
   * downloaded has had the time to reach its disk cache (IndexedDB) before Chrome is closed or the page
   * reloaded. Without it a slowed iPad profile was sometimes closed while Firestore was still writing the
   * last download, and the next open downloaded everything again (the "old-iPad evening anomaly" of Oct 6
   * 2026: harness/perf-lab/README.md).
   */
  async cacheQuiet(quietMs = 2000, capMs = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < capMs && Date.now() - (this.lastDataAt || 0) < quietMs) await sleep(200);
    await this.settle(1000, 10000);
  }

  async reopen({ clearCache = false } = {}) {
    await this.cacheQuiet();
    if (clearCache) await this.page.send("Network.clearBrowserCache").catch(() => {});
    await this.close();
    if (clearCache) {
      for (const dir of ["Cache", "Code Cache", "GPUCache"]) rmSync(join(this.profileDir, "Default", dir), { recursive: true, force: true });
    }
    await this.open({ fresh: false });
  }

  async ev(expression, timeoutMs = 120000) {
    const r = await this.page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
    if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }

  now() {
    return this.ev("performance.now()");
  }

  /**
   * In-page wait: the page's clock at the paint after `expr` first held (or,
   * with paint false, when it held), or -1 after the timeout. Checked when
   * elements are added or removed (at most once a frame) and every 100 ms.
   */
  waitFor(expr, timeoutMs = 30000, { paint = true } = {}) {
    return this.ev(
      `new Promise((res) => {
        const check = () => { try { return !!(${expr}); } catch (e) { return false; } };
        let done = false, hit = false, queued = false, mo = null, iv = null, to = null;
        const finish = (v) => { if (done) return; done = true; if (mo) mo.disconnect(); clearInterval(iv); clearTimeout(to); res(v); };
        const found = () => {
          if (hit) return; hit = true;
          if (!${paint ? "true" : "false"}) return finish(performance.now());
          requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => finish(performance.now()); ch.port2.postMessage(0); });
        };
        if (check()) return found();
        mo = new MutationObserver(() => {
          if (queued || hit) return; queued = true;
          requestAnimationFrame(() => { queued = false; if (!hit && check()) found(); });
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
        iv = setInterval(() => { if (!hit && check()) found(); }, 100);
        to = setTimeout(() => finish(-1), ${timeoutMs});
      })`,
      timeoutMs + 30000,
    );
  }

  async must(expr, what, timeoutMs = 30000, opts) {
    const at = await this.waitFor(expr, timeoutMs, opts);
    if (at < 0) throw new Error(`timed out waiting for ${what}`);
    return at;
  }

  /**
   * The page's clock when it went quiet: no element added or removed and no
   * long task for `quietMs` (or -1 at the cap, or with --bare).
   */
  settle(quietMs = 600, capMs = 15000) {
    if (this.bare) return Promise.resolve(-1);
    return this.ev(
      `new Promise((res) => { const t0 = performance.now(); const f = () => { const n = performance.now(); const last = Math.max(window.__lab.lastMut, window.__lab.lastLT); if (n - last >= ${quietMs}) return res(last); if (n - t0 > ${capMs}) return res(-1); setTimeout(f, 100); }; f(); })`,
      capMs + 30000,
    );
  }

  /** The interaction that started at or after `t` (event timing: input to the next paint), in ms; 16 when it was under the 16 ms threshold. */
  async interactionAfter(t) {
    if (this.bare) return null;
    await sleep(150);
    return this.ev(
      `(() => { const by = new Map(); for (const [s, d, , id] of window.__lab.ev) { if (!id || s < ${t} - 5) continue; const p = by.get(id); if (!p || d > p.d) by.set(id, { s, d }); } const first = [...by.values()].sort((a, b) => a.s - b.s)[0]; return first ? Math.round(first.d) : 16; })()`,
    );
  }

  /** A real tap (mouse events the browser treats as trusted), at an element's centre. Returns the page clock at dispatch. */
  async tap(finder, what) {
    const rect = await this.ev(
      `(() => { const el = ${finder}; if (!el) return null; el.scrollIntoView({ block: "center", inline: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    if (!rect) throw new Error(`nothing to tap: ${what}`);
    const at = await this.now();
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await this.page.send("Input.dispatchMouseEvent", { type, x: rect.x, y: rect.y, button: "left", clickCount: type === "mouseMoved" ? 0 : 1 });
    }
    return at;
  }

  /**
   * Two animation frames: whatever just appeared (the peek's buttons, the day header) has been laid out and
   * drawn, and its handlers are attached, before the lab taps it. A tap in the same frame as the element
   * arriving sometimes landed on the layer under it (Oct 6 2026: two client reps timed out with the peek open,
   * and one session rep never left today). Returns how long the wait took on the page's clock, so a scenario
   * can leave it out of its wall.
   */
  frames() {
    return this.ev(
      `new Promise((r) => { const a = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now() - a))); })`,
    );
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
const hubDataMark = `performance.getEntriesByName("journey:hub-data").length > 0`;
/** A client's card on the Hub, by surname (the focus clients' are unique in the seed); else the nth card. */
const cardOf = (focus, fallbackIndex) =>
  focus
    ? `[...document.querySelectorAll(".hs-card[role=button]")].find((c) => (c.textContent || "").includes(${JSON.stringify(focus.lastName)}))`
    : `document.querySelectorAll(".hs-card[role=button]")[${fallbackIndex}]`;
const tomorrowTab = `(() => { const d = [...document.querySelectorAll(".hd-week .hd-day")]; const i = d.findIndex((x) => x.dataset.today === "true"); return i >= 0 ? d[i + 1] : null; })()`;
const wrapUpTitle = `(() => { const h = document.querySelector("h1.font-display"); const t = (h && h.previousElementSibling && h.previousElementSibling.textContent) || ""; return /^Wrap-up/.test(t) ? t : null; })()`;
const opsSettled = `(() => { const sh = document.querySelector(".ops-shell"); if (!sh || !sh.querySelector(".ops-brief")) return false; const page = sh.querySelector(".ops-page") || sh; if (/Reading(\\u2026|\\.\\.\\.)/.test(page.textContent)) return false; return !sh.querySelector('[aria-busy="true"], .animate-spin'); })()`;

const BOOT_MARKS = `Object.fromEntries(["auth-ready", "trainer-ready", "hub-data"].map((m) => [m, (performance.getEntriesByName("journey:" + m)[0] || {}).startTime ?? null]))`;

/* -- Measuring one scenario -- */

const METRIC_KEYS = ["ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "TaskDuration", "LayoutCount", "RecalcStyleCount"];

async function measured(s, run, { navigates = false, span = navigates } = {}) {
  const before = await s.metrics();
  const exceptionsBefore = s.exceptions;
  const fallbacksBefore = s.cacheFallbacks;
  const netBefore = { ...s.net };
  if (s.profiled) await s.page.send("Profiler.start");
  // The page's clock when the profiler started, so a phase's page times can be found in the profile's own clock.
  const profPageT0 = s.profiled ? await s.now() : null;
  const t0 = navigates ? 0 : await s.now();
  const result = await run();
  const tEnd = await s.now();
  const cpuProfile = s.profiled ? (await s.page.send("Profiler.stop")).profile : null;
  const after = await s.metrics();
  const lab = await s.ev(
    `({ lt: window.__lab.lt.filter((e) => e[0] >= ${t0}), ev: window.__lab.ev.filter((e) => e[0] >= ${t0}), nodes: document.getElementsByTagName("*").length })`,
  );
  const tasks = lab.lt.map((e) => e[1]);
  if (process.env.PERF_LAB_SAVE_PROFILE && cpuProfile) {
    // Diagnostic: the raw profile with the page's clock at its start, the phases and the long tasks, for
    // looking inside one long task (which code was on the stack), not just a phase's totals.
    writeFileSync(
      `${process.env.PERF_LAB_SAVE_PROFILE}-${Date.now()}.json`,
      JSON.stringify({ profPageT0, phases: result.phases ?? null, lt: lab.lt, profile: cpuProfile }),
    );
  }
  if (process.env.PERF_LAB_TRACE) {
    // The long tasks and the slow interactions on the trace's clock, beside the data that caused them.
    const origin = await s.ev("performance.timeOrigin");
    const lines = [
      ...lab.lt.map(([t, d]) => `${Math.round(origin + t)}\tlongtask\t${Math.round(d)} ms`),
      ...lab.ev.filter((e) => e[3] && e[1] >= 100).map(([t, d, name]) => `${Math.round(origin + t)}\tinteraction\t${name} ${Math.round(d)} ms`),
      `${Math.round(origin + tEnd)}\tmark\tthe scenario's measured span ends`,
    ];
    writeFileSync(process.env.PERF_LAB_TRACE, lines.join("\n") + "\n", { flag: "a" });
  }
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
    // Chrome starts these counters again with every new document, so an open (which navigates) reads the
    // new document's own count, from its navigation on; anything else is the difference over the scenario.
    const v = navigates ? (after[k] ?? 0) : Math.max(0, (after[k] ?? 0) - (before[k] ?? 0));
    deltas[k] = k.endsWith("Duration") ? Math.round(v * 1000) : Math.round(v);
  }
  const longTotal = Math.round(tasks.reduce((a, b) => a + b, 0));
  // Phases ([name, page ms the phase began], in order; the last runs to the end of the scenario): the long
  // tasks that began in each, as steps (lt.<name>), and in the profiled rep the CPU of each (cpuPhases).
  const { phases, ...rest } = result;
  let cpuPhases = null;
  if (Array.isArray(phases) && phases.length) {
    rest.steps = { ...(rest.steps || {}) };
    phases.forEach(([name, from], i) => {
      const to = phases[i + 1]?.[1] ?? tEnd;
      if (typeof from !== "number" || typeof to !== "number") return;
      const inPhase = lab.lt.filter((e) => e[0] >= from && e[0] < to).map((e) => e[1]);
      rest.steps[`lt.${name}`] = Math.round(inPhase.reduce((a, b) => a + b, 0));
      if (cpuProfile && typeof profPageT0 === "number") {
        cpuPhases ??= {};
        const us = (ms) => cpuProfile.startTime + (ms - profPageT0) * 1000;
        cpuPhases[name] = foldProfile(cpuProfile, s.maps, { top: 40, fromUs: us(from), toUs: us(to) });
      }
    });
  }
  return {
    ...rest,
    // A continuous span's time NOT spent in long tasks: mostly waiting (network, the emulator, timers).
    waitingMs: span && typeof result.wallMs === "number" ? Math.max(0, result.wallMs - longTotal) : null,
    longTasks: {
      count: tasks.length,
      totalMs: longTotal,
      worstMs: Math.round(tasks.reduce((a, b) => Math.max(a, b), 0)),
    },
    interactions: { count: interactions.length, worstMs: Math.round(worst.dur), worstEvent: worst.name },
    metrics: { ...deltas, JSHeapUsedMB: Math.round(((after.JSHeapUsedSize ?? 0) / 1048576) * 10) / 10, Nodes: after.Nodes ?? null },
    network: { requests: s.net.requests - netBefore.requests, kb: Math.round((s.net.bytes - netBefore.bytes) / 1024) },
    domNodes: lab.nodes,
    exceptions: s.exceptions - exceptionsBefore,
    // Firestore warned that its disk cache could not start (see the README: the old-iPad evening anomaly).
    cacheFallbacks: s.cacheFallbacks - fallbacksBefore,
    ...(cpuProfile ? { cpu: foldProfile(cpuProfile, s.maps) } : {}),
    ...(cpuPhases ? { cpuPhases } : {}),
  };
}

const round = (n) => (typeof n === "number" && n >= 0 ? Math.round(n) : null);
const median = (xs) => {
  const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};

/** The Hub after an open: the cards painted and the app's hub-data mark, whichever is later; the greeting tapped if it came. */
async function openToHub(s, navigate) {
  await navigate();
  let cards = -1;
  let greeting = false;
  for (let i = 0; i < 600 && cards < 0; i += 1) {
    await sleep(100);
    try {
      if (await s.ev(`!!(${byText("button", "Start at")})`)) {
        greeting = true;
        await s.tap(byText("button", "Start at"), "Start at the studio");
      }
      cards = await s.waitFor(hubReady, 200);
    } catch {
      /* the document is still being replaced */
    }
  }
  if (cards < 0) throw new Error("the Hub never came");
  const markAt = await s.must(hubDataMark, "the Hub's bookings", 60000, { paint: false });
  const marks = await s.ev(BOOT_MARKS);
  const hub = Math.max(cards, marks["hub-data"] ?? markAt);
  const settled = await s.settle();
  return {
    wallMs: round(hub),
    steps: {
      cardsPaintedMs: round(cards),
      hubSettledMs: round(settled),
      authReadyMark: round(marks["auth-ready"]),
      trainerReadyMark: round(marks["trainer-ready"]),
      hubDataMark: round(marks["hub-data"]),
      greetingTapped: greeting ? 1 : 0,
    },
  };
}

/** Signs in without measuring: for a run whose scenarios leave out cold. */
async function signInUnmeasured(s, ctx) {
  await s.page.send("Page.navigate", { url: `${s.baseUrl}/` });
  for (let i = 0; i < 600; i += 1) {
    await sleep(100);
    try {
      if (await s.ev(hubReady)) return;
      if (await s.ev(`!!(window.__perfLab && ${byText("button", "Continue with Google")})`)) break;
    } catch {
      /* loading */
    }
  }
  await s.ev(`window.__perfLab.signIn(${JSON.stringify(ctx.creds.email)}, ${JSON.stringify(ctx.creds.password)})`);
  await s.must(byText("button", "Start at"), "the studio greeting", 60000);
  await s.tap(byText("button", "Start at"), "Start at the studio");
  await s.must(`${hubReady} && ${hubDataMark}`, "the Hub", 60000);
  await s.settle();
}

/* -- The scenarios -- */

const SCENARIO_RUNS = {
  /** (a) Empty cache, first sign-in: load, sign in, Start at the studio, the Hub's bookings drawn. */
  async cold(s, ctx) {
    return measured(
      s,
      async () => {
        await s.page.send("Page.navigate", { url: `${s.baseUrl}/` });
        let signInScreen = -1;
        for (let i = 0; i < 600 && signInScreen < 0; i += 1) {
          await sleep(100);
          try {
            signInScreen = await s.waitFor(`window.__perfLab && ${byText("button", "Continue with Google")}`, 200);
          } catch {
            /* the document is still being replaced */
          }
        }
        if (signInScreen < 0) throw new Error("the sign-in screen never came");
        const signInAt = await s.now();
        await s.ev(`window.__perfLab.signIn(${JSON.stringify(ctx.creds.email)}, ${JSON.stringify(ctx.creds.password)})`);
        const greeting = await s.must(byText("button", "Start at"), "the studio greeting", 60000);
        const tapAt = await s.tap(byText("button", "Start at"), "Start at the studio");
        const cards = await s.must(hubReady, "the Hub's cards", 60000);
        await s.must(hubDataMark, "the Hub's bookings", 60000, { paint: false });
        const marks = await s.ev(BOOT_MARKS);
        const hub = Math.max(cards, marks["hub-data"] ?? 0);
        const settled = await s.settle();
        const nav = await s.ev(`(() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { dcl: n.domContentLoadedEventEnd } : {}; })()`);
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

  /** (b) Reload: the same renderer, its memory caches, the HTTP cache and the Firestore cache kept. */
  async warm(s) {
    await s.cacheQuiet();
    return measured(s, () => openToHub(s, () => s.page.send("Page.reload", {})), { navigates: true });
  },

  /** (b2) THE HEADLINE OPEN. Chrome closed and started again (a fresh renderer, nothing in memory), HTTP and Firestore caches on disk kept. */
  async relaunch(s) {
    await s.reopen({ clearCache: false });
    return measured(s, () => openToHub(s, () => s.page.send("Page.navigate", { url: `${s.baseUrl}/` })), { navigates: true });
  },

  /** (b3) The first open after a deploy: relaunched with the HTTP and code caches emptied, the Firestore cache (IndexedDB) kept. */
  async afterdeploy(s) {
    await s.reopen({ clearCache: true });
    return measured(s, () => openToHub(s, () => s.page.send("Page.navigate", { url: `${s.baseUrl}/` })), { navigates: true });
  },

  /** (c) The Hub left open across a minute tick. */
  async idle(s, ctx) {
    await s.must(hubReady, "the Hub");
    return measured(s, async () => {
      await sleep(ctx.idleMs);
      return { wallMs: null, steps: { idleMs: ctx.idleMs } };
    });
  },

  /**
   * (h) live, opt-in (not in the default set): what one change costs while a screen is open. The Directory
   * left open across a minute tick, then one client document changed (as a webhook or the nightly job
   * would, through the emulator's owner token, a field no screen reads); then the same on the Hub. Long tasks
   * per phase.
   */
  async live(s, ctx) {
    // ops leaves the app on the Directory: come back to the Hub first, as scroll does.
    if (!(await s.ev(hubReady))) await s.tap(byText("button", "Hub", { exact: true }), "the Hub tab").catch(() => {});
    await s.must(hubReady, "the Hub");
    await s.tap(byText("button", "Client", { exact: true }), "the Client tab");
    await s.must(`document.querySelector(".cd-scroll") && document.querySelector(".cd-scroll").textContent.length > 200`, "the Client Directory", 45000);
    await s.settle(600, 15000);
    const touch = async (n) => {
      const base = `http://${HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
      const id = ctx.focus?.client?.id ?? "100000001";
      const res = await fetch(`${base}/clients/${id}?updateMask.fieldPaths=labTouch`, {
        method: "PATCH",
        headers: { authorization: "Bearer owner", "content-type": "application/json" },
        body: JSON.stringify({ fields: { labTouch: { integerValue: String(n) } } }),
      });
      if (!res.ok) throw new Error(`the client write failed: ${res.status}`);
    };
    return measured(s, async () => {
      const tIdle = await s.now();
      await sleep(Math.max(ctx.idleMs, 61000));
      const tDirWrite = await s.now();
      await touch(1);
      await sleep(8000);
      const tBack = await s.tap(byText("button", "Hub", { exact: true }), "the Hub tab");
      await s.must(hubReady, "the Hub again");
      await s.settle(600, 15000);
      const tHubWrite = await s.now();
      await touch(2);
      await sleep(8000);
      return {
        wallMs: null,
        phases: [["directoryIdle", tIdle], ["directoryWrite", tDirWrite], ["toHub", tBack], ["hubWrite", tHubWrite]],
        steps: { idleMs: Math.round(tDirWrite - tIdle) },
      };
    });
  },

  /** (d) The focus client's card on today's Hub -> the peek -> Open profile -> the Journey tab drawn. */
  async client(s, ctx) {
    await s.must(hubReady, "the Hub");
    const focus = ctx.focus?.client ?? null;
    const r = await measured(s, async () => {
      const t0 = await s.tap(cardOf(focus, 2), focus ? `${focus.name}'s card` : "a client card");
      const peek = await s.must(css(".hp .hp-btn"), "the peek");
      // Settled before the tap (two frames: the peek's buttons drawn and live). Left out of the wall, so the wall
      // is the same span as before the lab waited (the Oct 6 afternoon A/B); kept apart as settleWaitMs.
      const settleWait = await s.frames();
      const t1 = await s.tap(byText(".hp .hp-btn", "Open profile"), "Open profile");
      traceMark("client: Open profile tapped");
      const journey = await s.must(`document.querySelectorAll(".jg-row").length > 0`, "the Journey tab", 45000);
      traceMark("client: the Journey tab drawn");
      const settled = await s.settle();
      const rows = await s.ev(`document.querySelectorAll(".jg-row").length`);
      return {
        phases: [["peek", t0], ["openProfile", t1], ["afterJourney", journey]],
        wallMs: round(journey - t0 - settleWait),
        client: focus ? { id: focus.id, name: focus.name, journeySessions: focus.journeySessions, exerciseLogs: focus.exerciseLogs, priorSessions: focus.priorSessions } : null,
        steps: { tapToPeekMs: round(peek - t0), settleWaitMs: round(settleWait), openToJourneyMs: round(journey - t1), journeySettledMs: settled > 0 ? round(settled - t1) : null, journeyRows: rows },
      };
    }, { span: true });
    if (process.env.PERF_LAB_SHOTS) {
      await ctx.shot("profile");
      await s.ev(`(() => { const el = document.querySelector(".jg-scroller"); if (el) { el.scrollLeft = Math.max(0, el.scrollLeft - 300); el.scrollTop += 200; window.scrollBy(0, 300); } })()`);
      await sleep(400);
      await ctx.shot("profile-scrolled");
    }
    await s.tap(byText("button", "Hub", { exact: true }), "the Hub tab");
    await s.must(hubReady, "the Hub again");
    return r;
  },

  /** (e) The focus client tomorrow: Start from the briefing, 5 sets, the machine menu, then Finish -> the Wrap-up (reported apart). */
  async session(s, ctx) {
    await s.must(hubReady, "the Hub");
    // The day header settled before tomorrow is tapped (the same reason as the peek's frames).
    await s.must(tomorrowTab, "the day header");
    await s.settle(300, 8000);
    await s.frames();
    await s.tap(tomorrowTab, "tomorrow");
    const focus = ctx.focus?.session ?? null;
    if ((await s.waitFor(focus ? cardOf(focus, 0) : hubReady, 10000)) < 0) {
      // Still on today: the tap fell between frames once; one more, then the scenario's own failure.
      await s.frames();
      await s.tap(tomorrowTab, "tomorrow, again");
    }
    await s.must(focus ? cardOf(focus, 0) : hubReady, "tomorrow's cards");
    await s.settle(400, 8000);
    const r = await measured(s, async () => {
      const t0 = await s.tap(cardOf(focus, 0), focus ? `${focus.name}'s card` : "a client card");
      const peek = await s.must(css(".hp .hp-btn"), "the peek", 15000);
      await s.frames();
      if (!(await s.ev(`!!document.querySelector('.hp [data-primary=true][data-go=true]')`))) throw new Error("the peek did not offer Start session");
      const tStart = await s.tap(css(".hp [data-primary=true][data-go=true]"), "Start session");
      traceMark("session: Start session tapped");
      const briefing = await s.must(css(".br__cta"), "the briefing", 45000);
      const tGo = await s.tap(css(".br__cta"), "the briefing's Start session");
      const nowBar = await s.must(css(".jg-nb__outin"), "the Now Bar", ctx.nowBarWaitMs);
      traceMark("session: the Now Bar");
      await s.settle(300, 8000);
      const sets = [];
      const setSettled = [];
      for (let i = 0; i < 5; i += 1) {
        await s.tap(css(".jg-nb__outin"), "the reps box");
        await s.ev(`(() => { const el = document.querySelector(".jg-nb__outin"); el && el.select && el.select(); })()`);
        await s.typeText(String(6 + (i % 4)));
        // The last machine of a short routine has no Next: the set is kept as typed, so leave the box.
        const hasNext = await s.ev(`!!(${byText("button", "Next")})`);
        const tNext = hasNext ? await s.tap(byText("button", "Next"), "Next") : await s.now();
        if (!hasNext) await s.key("Tab", "Tab", 9);
        const done = await s.settle(300, 8000);
        sets.push(await s.interactionAfter(tNext));
        setSettled.push(done > 0 ? Math.round(done - tNext) : null);
      }
      const tMenu = await s.tap(css(".jg-machine__btn"), "a machine's name");
      const menu = await s.must(css(".mm-dialog"), "the machine menu");
      const menuInteraction = await s.interactionAfter(tMenu);
      await s.settle(300, 8000);
      await s.key("Escape", "Escape", 27);
      await s.waitFor(`!document.querySelector(".mm-dialog")`, 5000);
      await s.settle(300, 8000);
      if (process.env.PERF_LAB_SHOTS) {
        await ctx.shot("session");
        await s.ev(`(() => { const el = document.querySelector(".jg-scroller"); if (el) { el.scrollLeft = Math.max(0, el.scrollLeft - 250); el.scrollTop += 120; } })()`);
        await sleep(400);
        await ctx.shot("session-scrolled");
        await s.ev(`(() => { const el = document.querySelector(".jg-scroller"); if (el) { el.scrollLeft = el.scrollWidth; el.scrollTop = 0; } })()`);
        await sleep(300);
      }
      // Finish: reported apart, because the emulator answers the Finish batch slowly and the app's two waits (2 s + 3 s) run out.
      const tFinish = await s.tap(byText("button", "Finish", { exact: true }), "Finish");
      await s.must(byText("button", "Finish session", { exact: true }), "the end-session question");
      const tConfirm = await s.tap(byText("button", "Finish session", { exact: true }), "Finish session");
      traceMark("session: Finish session tapped");
      const wrap = await s.must(wrapUpTitle, "the Wrap-up", 45000);
      traceMark("session: the Wrap-up");
      const ack = await s.waitFor(`(() => { const t = ${wrapUpTitle}; return t && !/on this iPad/i.test(t); })()`, 20000, { paint: false });
      traceMark(`session: the database answered Finish (${ack > 0 ? "yes" : "not in 20 s"})`);
      // PERF_LAB_WRAPUP_TAIL_MS (diagnostic, off by default): keep measuring the Wrap-up this long after the answer.
      if (Number(process.env.PERF_LAB_WRAPUP_TAIL_MS) > 0) await sleep(Number(process.env.PERF_LAB_WRAPUP_TAIL_MS));
      const startToBriefing = round(briefing - tStart);
      const briefingToNowBar = round(nowBar - tGo);
      const menuOpen = round(menu - tMenu);
      const setTotal = sets.every((x) => typeof x === "number") ? sets.reduce((a, b) => a + b, 0) : null;
      const finishToWrapUp = round(wrap - tConfirm);
      return {
        // Where the long tasks (and, profiled, the CPU) fell: each phase runs to the next one's start.
        phases: [["peek", t0], ["start", tStart], ["onBriefing", briefing], ["toNowBar", tGo], ["sets", nowBar], ["menu", tMenu], ["finish", tFinish], ["wrapUp", wrap]],
        // The app's own work a trainer waits on: start -> briefing -> Now Bar -> five sets -> the menu. Finish is apart.
        wallMs: [startToBriefing, briefingToNowBar, setTotal, menuOpen].every((x) => typeof x === "number") ? startToBriefing + briefingToNowBar + setTotal + menuOpen : null,
        client: focus ? { id: focus.id, name: focus.name, journeySessions: focus.journeySessions, exerciseLogs: focus.exerciseLogs } : null,
        steps: {
          tapToPeekMs: round(peek - t0),
          startToBriefingMs: startToBriefing,
          briefingToNowBarMs: briefingToNowBar,
          setMedianMs: median(sets),
          setWorstMs: sets.some((x) => typeof x === "number") ? Math.max(...sets.filter((x) => typeof x === "number")) : null,
          setSettledMedianMs: median(setSettled),
          menuOpenMs: menuOpen,
          menuInteractionMs: menuInteraction,
          finishToWrapUpMs: finishToWrapUp,
          finishTapToWrapUpMs: round(wrap - tFinish),
          databaseAckMs: ack > 0 ? round(ack - tConfirm) : null,
          // 1 when the Wrap-up came only after the app's two Finish waits (about 5 s) ran out: an emulator reading.
          finishWaitsRanOut: finishToWrapUp != null && finishToWrapUp >= 4800 ? 1 : 0,
        },
      };
    });
    await s.flushWrites(30000);
    await s.tap(byText("button", "Back to Hub", { exact: true }), "Back to Hub");
    await s.must(hubReady, "the Hub again");
    return r;
  },

  /** (f) Operations -> Today settled, then the Client Directory with a search typed. */
  async ops(s) {
    await s.must(hubReady, "the Hub");
    const r = await measured(s, async () => {
      const t0 = await s.tap(css('button[aria-label="Trainer Settings"]'), "the trainer menu");
      await s.must(byText("button", "Open Operations"), "the menu");
      const tOps = await s.tap(byText("button", "Open Operations"), "Open Operations");
      const brief = await s.must(css(".ops-brief"), "Operations Today", 45000);
      // Settled: nothing anywhere on the Operations page still "Reading...", and no spinner.
      const todaySettled = await s.waitFor(opsSettled, 45000);
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
        // Where the long tasks (and, profiled, the CPU) fell: each phase runs to the next one's start.
        phases: [["open", tOps], ["settle", brief], ["backToHub", todaySettled > 0 ? todaySettled : null], ["directory", tDir], ["search", tType]].filter(([, t]) => typeof t === "number"),
        wallMs: todaySettled > 0 ? round(todaySettled - tOps) : null,
        steps: {
          menuToTodayDrawnMs: round(brief - tOps),
          todaySettledMs: todaySettled > 0 ? round(todaySettled - tOps) : null,
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

  /** (g) Scroll the Hub's grid (three times down and up) and the Directory (once down): frames the main thread missed. */
  async scroll(s) {
    const scrollIn = (sel, passes, capFrames) =>
      s.ev(
        `new Promise((res) => {
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) return res(null);
          el.scrollTop = 0;
          const max = Math.max(0, el.scrollHeight - el.clientHeight);
          if (max === 0) return res({ frames: 0, missedFrames: 0, worstFrameMs: 0, p95FrameMs: 0, scrollable: 0, passes: 0, complete: true });
          const step = 36; const frames = []; let last = performance.now(); let dir = 1; let passes = 0;
          const tick = (now) => {
            frames.push(now - last); last = now;
            // A pass ends when the list stops moving (its height can change as it renders, and at 2x scrollTop is fractional).
            const before = el.scrollTop;
            el.scrollTop = Math.max(0, before + dir * step);
            if (Math.abs(el.scrollTop - before) < 1) { dir = -dir; passes += 1; }
            if (passes >= ${passes} || frames.length > ${capFrames}) {
              const ft = frames.slice(1); const budget = 1000 / 60;
              const missed = ft.reduce((a, d) => a + Math.max(0, Math.round(d / budget) - 1), 0);
              const sorted = [...ft].sort((a, b) => a - b);
              return res({ frames: ft.length, missedFrames: missed, worstFrameMs: Math.round(sorted[sorted.length - 1] || 0), p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0), scrollable: max, passes, complete: passes >= ${passes} });
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame((n) => { last = n; requestAnimationFrame(tick); });
        })`,
        300000,
      );
    await s.tap(byText("button", "Hub", { exact: true }), "the Hub tab").catch(() => {});
    await s.must(hubReady, "the Hub");
    await s.settle(400, 8000);
    return measured(s, async () => {
      const hub = await scrollIn(".hs-scroll", 6, 3000);
      await s.tap(byText("button", "Client", { exact: true }), "the Client tab");
      await s.must(`document.querySelector(".cd-scroll") && document.querySelector(".cd-scroll").textContent.length > 200`, "the Client Directory", 45000);
      await s.settle(500, 10000);
      const dir = await scrollIn(".cd-scroll", 1, 4000);
      const perPass = (x) => (x && x.passes ? Math.round(x.frames / x.passes) : null);
      return {
        wallMs: null,
        steps: {
          hubScrollablePx: hub?.scrollable ?? null,
          hubPasses: hub?.passes ?? null,
          hubFramesPerPass: perPass(hub),
          hubMissedFrames: hub?.missedFrames ?? null,
          hubWorstFrameMs: hub?.worstFrameMs ?? null,
          hubP95FrameMs: hub?.p95FrameMs ?? null,
          directoryScrollablePx: dir?.scrollable ?? null,
          directoryFrames: dir?.frames ?? null,
          directoryDownComplete: dir ? (dir.complete ? 1 : 0) : null,
          directoryMissedFrames: dir?.missedFrames ?? null,
          directoryWorstFrameMs: dir?.worstFrameMs ?? null,
          directoryP95FrameMs: dir?.p95FrameMs ?? null,
        },
      };
    });
  },
};

/* -- Main -- */

/** The seed's day must still be the studio's day, and its anchor is the page clock's. */
export function readSeed(file) {
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

export async function runLab(options) {
  const variants = [{ name: options["build-b"] ? "A" : "main", build: resolve(options.build) }];
  if (options["build-b"]) variants.push({ name: "B", build: resolve(options["build-b"]) });
  for (const v of variants) if (!existsSync(join(v.build, "index.html"))) throw new Error(`No lab build at ${v.build}.`);
  // How long the session waits for the Now Bar: 45 s, or --nowbar-wait <ms>; a build named in --slow-start (A, B or
  // main) gets at least 120 s. A build from before the speed round (c20d2abe and older) awaits the new session's
  // write before it shows the Now Bar, and the emulator sometimes takes longer than 45 s to answer it.
  const slowStart = String(options["slow-start"] || "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const v of variants) v.nowBarWaitMs = Math.max(Number(options["nowbar-wait"] || 45000), slowStart.includes(v.name) ? 120000 : 0);
  const profiles = (options.profiles ? options.profiles.split(",") : Object.keys(PROFILES)).map((p) => {
    if (!PROFILES[p]) throw new Error(`Unknown profile ${p}.`);
    return p;
  });
  const scenarios = options.scenarios ? options.scenarios.split(",") : SCENARIOS;
  for (const sc of scenarios) if (!SCENARIO_RUNS[sc]) throw new Error(`Unknown scenario ${sc}.`);
  const reps = Number(options.reps || 3);
  const profileRep = !options["no-profile-rep"];
  const bare = Boolean(options.bare);
  const baseNetwork = { ...NETWORK, ...(options.latency !== undefined ? { latencyMs: Number(options.latency) } : {}) };
  const idleMs = Number(options.idleMs || 70000);
  const outRoot = resolve(options.out || OUT_DIR);
  const runId = options.runId || new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = join(outRoot, runId);
  mkdirSync(outDir, { recursive: true });
  const creds = labCredentials();
  const seed = readSeed(options.seedSummary);
  if (!seed?.anchorMs) console.log("No seed anchor (an old seed?): the page clock is NOT held. Reseed with lab.mjs.");
  for (const v of variants) {
    v.maps = new SourceMaps(v.build);
    v.srv = await startStaticServer(v.build);
  }
  const results = {
    runId,
    startedAt: new Date().toISOString(),
    network: baseNetwork,
    reps,
    profileRep,
    bare,
    idleMs,
    scenarios,
    order: "interleaved: rep 1 of every profile (and every build, alternating which goes first), then rep 2...",
    calibration: { referenceMs: REFERENCE_BENCH_MS, reps: [] },
    seed,
    variants: Object.fromEntries(variants.map((v) => [v.name, { build: v.build, profiles: Object.fromEntries(profiles.map((p) => [p, { ...PROFILES[p], runs: [], profiledRuns: [] }])) }])),
  };
  const save = () => writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
  const totalReps = reps + (profileRep ? 1 : 0);
  try {
    for (let rep = 1; rep <= totalReps; rep += 1) {
      const profiled = profileRep && rep === totalReps;
      for (const name of profiles) {
        const profile = PROFILES[name];
        if (profiled && profile.profiled === false) continue;
        const order = rep % 2 === 1 ? variants : [...variants].reverse();
        for (const v of order) {
          const tag = `${name}${variants.length > 1 ? ` [${v.name}]` : ""} #${profiled ? "profiled" : rep}`;
          console.log(`[${new Date().toLocaleTimeString()}] ${tag}`);
          // lab.mjs restarts the emulators from the seeded export here, so every rep starts from the same data.
          if (options.beforeRep) await options.beforeRep(name, rep);
          const network = { ...baseNetwork, ...(profile.latencyMs !== undefined ? { latencyMs: profile.latencyMs } : {}) };
          const s = new Session({
            profile,
            profileDir: join(outRoot, "chrome-profiles", `${name}-${v.name}-${rep}`),
            baseUrl: v.srv.url,
            maps: v.maps,
            // The page's clock starts this rep at the seed's anchor.
            offsetMs: seed?.anchorMs ? seed.anchorMs - Date.now() : 0,
            bare,
            profiled,
            network,
          });
          const run = { rep: profiled ? "profiled" : rep, scenarios: {} };
          let broken = false;
          try {
            await s.open({ fresh: true });
            run.calibration = s.calibration;
            results.calibration.reps.push({ profile: name, variant: v.name, rep: run.rep, ...s.calibration });
            console.log(`  calibrated: this PC ${s.calibration.hostMs} ms (reference ${REFERENCE_BENCH_MS}), rate ${s.calibration.rate}, class ${s.calibration.effective}x`);
            const own = profile.scenarios ? scenarios.filter((x) => profile.scenarios.includes(x)) : scenarios;
            const ctx = { creds, idleMs, focus: seed?.focus ?? null, nowBarWaitMs: v.nowBarWaitMs };
            // PERF_LAB_SHOTS=1: a screenshot at the named moments of a scenario (outside the timed spans), to see that a build still looks the same.
            ctx.shot = (label) => (process.env.PERF_LAB_SHOTS ? s.screenshot(join(outDir, `shot-${name}-${v.name}-${run.rep}-${label}.png`)) : null);
            if (own[0] !== "cold") await signInUnmeasured(s, ctx);
            for (const scenario of own) {
              if (broken) {
                run.scenarios[scenario] = { error: "skipped: an earlier scenario left the app in an unknown place" };
                continue;
              }
              const started = Date.now();
              try {
                run.scenarios[scenario] = await SCENARIO_RUNS[scenario](s, ctx);
                const m = run.scenarios[scenario];
                console.log(
                  `  ${scenario}: ${m.wallMs ?? "-"} ms, long tasks ${m.longTasks.count} (${m.longTasks.totalMs} ms, worst ${m.longTasks.worstMs}), worst interaction ${m.interactions.worstMs} ms  [${Math.round((Date.now() - started) / 1000)} s]`,
                );
              } catch (err) {
                run.scenarios[scenario] = { error: String(err.message || err) };
                console.log(`  ${scenario}: FAILED ${err.message || err}`);
                await s.screenshot(join(outDir, `fail-${name}-${v.name}-${run.rep}-${scenario}.png`));
                if (["cold", "warm", "relaunch", "afterdeploy"].includes(scenario)) broken = true;
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
            await s.screenshot(join(outDir, `last-${name}-${v.name}-${run.rep}.png`));
          } catch (err) {
            run.error = String(err.message || err);
            console.log(`  rep FAILED: ${run.error}`);
          } finally {
            try {
              await s.close();
            } catch {
              /* gone */
            }
            if (options.afterRep) await options.afterRep(name, rep);
          }
          results.variants[v.name].profiles[name][profiled ? "profiledRuns" : "runs"].push(run);
          save();
        }
      }
    }
  } finally {
    for (const v of variants) await v.srv.close();
  }
  results.finishedAt = new Date().toISOString();
  save();
  const reportPath = writeReport(results, outDir);
  console.log(`Results: ${join(outDir, "results.json")}`);
  console.log(`Report:  ${reportPath}`);
  return { outDir, results };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.build) {
    console.error("Usage: node harness/perf-lab/run.mjs --build <lab build dir> [--build-b dir] [--out dir] [--profiles a,b] [--reps 3] [--scenarios cold,warm,...] [--seedSummary file]");
    process.exit(2);
  }
  runLab(args).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
