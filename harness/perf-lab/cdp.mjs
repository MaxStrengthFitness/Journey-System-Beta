/**
 * Chrome, headless, driven over the DevTools Protocol with Node's own
 * WebSocket. No puppeteer: one small client, so the lab has no dependency of
 * its own.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const CHROME = process.env.PERF_LAB_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";

/** Starts Chrome on a profile folder; returns { proc, port, close() }. */
export async function launchChrome(profileDir, { fresh = false } = {}) {
  if (fresh && existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  const portFile = join(profileDir, "DevToolsActivePort");
  if (existsSync(portFile)) rmSync(portFile, { force: true });
  const args = [
    "--headless=new",
    `--user-data-dir=${profileDir}`,
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-features=Translate,OptimizationHints,MediaRouter",
    "--metrics-recording-only",
    "--mute-audio",
    "--window-size=1400,1400",
    "about:blank",
  ];
  const proc = spawn(CHROME, args, { stdio: "ignore" });
  let port = 0;
  for (let i = 0; i < 100 && !port; i += 1) {
    await sleep(100);
    if (existsSync(portFile)) port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
  }
  if (!port) {
    proc.kill();
    throw new Error("Chrome did not open its debugging port.");
  }
  return {
    proc,
    port,
    async close() {
      try {
        const b = await connectBrowser(port);
        await b.send("Browser.close").catch(() => {});
        b.close();
      } catch {
        /* already gone */
      }
      await sleep(300);
      try {
        proc.kill();
      } catch {
        /* gone */
      }
      await sleep(300);
    },
  };
}

class Connection {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8"));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, method } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params);
      }
    });
  }
  send(method, params = {}, timeoutMs = 120000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
    return () => this.listeners.set(method, (this.listeners.get(method) ?? []).filter((f) => f !== fn));
  }
  once(method, predicate = () => true, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`waiting for ${method}: timed out`));
      }, timeoutMs);
      const off = this.on(method, (p) => {
        if (!predicate(p)) return;
        clearTimeout(timer);
        off();
        resolve(p);
      });
    });
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* gone */
    }
  }
}

async function open(url) {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return new Connection(ws);
}

export async function connectBrowser(port) {
  const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  return open(info.webSocketDebuggerUrl);
}

/** The first page target (about:blank at launch). */
export async function connectPage(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("No page target.");
  return open(page.webSocketDebuggerUrl);
}
