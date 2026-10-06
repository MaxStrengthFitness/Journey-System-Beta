/**
 * The web service on a deploy (the speed round, R19, Oct 5 2026):
 * server/shutdown.ts against a real HTTP server, and the lines in server.ts
 * and render.yaml that make it count.
 */

import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  SHUTDOWN_FALLBACK_MS,
  shutDownGracefully,
  tuneKeepAlive,
} from "../../server/shutdown";

const HERE = dirname(fileURLToPath(import.meta.url));
const open: http.Server[] = [];
afterEach(() => {
  while (open.length) open.pop()!.close();
});

async function serve(handler: http.RequestListener) {
  const server = http.createServer(handler);
  open.push(server);
  server.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe("shutDownGracefully", () => {
  it("lets a request already running finish, then exits", async () => {
    let finishRequest!: () => void;
    const { server, base } = await serve((_req, res) => {
      finishRequest = () => res.end("done");
    });
    const exit = vi.fn();
    const running = fetch(base + "/slow");
    await vi.waitFor(() => expect(finishRequest).toBeTypeOf("function"));

    shutDownGracefully(server, { exit, log: () => {}, sweepMs: 20 });
    // Still serving the one in flight: nobody has exited.
    await new Promise((r) => setTimeout(r, 50));
    expect(exit).not.toHaveBeenCalled();

    finishRequest();
    const res = await running;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("done");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("refuses new connections once it has begun", async () => {
    let hold!: () => void;
    const { server, base } = await serve((_req, res) => {
      hold = () => res.end("ok");
    });
    const first = fetch(base + "/a");
    await vi.waitFor(() => expect(hold).toBeTypeOf("function"));
    shutDownGracefully(server, { exit: () => {}, log: () => {} });
    await expect(fetch(base + "/b", { headers: { Connection: "close" } })).rejects.toThrow();
    hold();
    expect((await first).status).toBe(200);
  });

  it("exits anyway at the fallback when a request never ends, and only once", async () => {
    const { server, base } = await serve(() => {
      /* never answers */
    });
    const exit = vi.fn();
    const hung = fetch(base + "/hung").catch(() => null);
    await new Promise((r) => setTimeout(r, 30));
    shutDownGracefully(server, { exit, log: () => {}, fallbackMs: 60 });
    shutDownGracefully(server, { exit, log: () => {}, fallbackMs: 60 });
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(exit).toHaveBeenCalledTimes(1);
    server.closeAllConnections();
    await hung;
  });

  it("falls back inside Render's 120 s limit", () => {
    expect(SHUTDOWN_FALLBACK_MS).toBeLessThan(120_000);
    expect(SHUTDOWN_FALLBACK_MS).toBeGreaterThan(60_000);
  });
});

describe("tuneKeepAlive", () => {
  it("holds a connection longer than Render's balancer, headers a little longer still", () => {
    const server = http.createServer();
    tuneKeepAlive(server);
    expect(server.keepAliveTimeout).toBe(KEEP_ALIVE_TIMEOUT_MS);
    expect(server.headersTimeout).toBe(HEADERS_TIMEOUT_MS);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });
});

describe("server.ts and render.yaml", () => {
  const serverTs = readFileSync(join(HERE, "../../server.ts"), "utf8");
  const renderYaml = readFileSync(join(HERE, "../../render.yaml"), "utf8");
  /** The web service's block: from its `- type: web` to the next service. */
  const web = renderYaml.slice(renderYaml.indexOf("- type: web"), renderYaml.indexOf("- type: cron"));

  it("tunes keep-alive and answers SIGTERM gracefully, and leaves Ctrl-C (SIGINT) alone", () => {
    expect(serverTs).toMatch(/tuneKeepAlive\(server\)/);
    expect(serverTs).toMatch(/process\.on\("SIGTERM", \(\) => shutDownGracefully\(server\)\)/);
    expect(serverTs).not.toMatch(/process\.on\(["']SIGINT["']/);
  });

  it("gives the web service one instance and two minutes to shut down", () => {
    expect(web).toMatch(/^\s+numInstances: 1\s*$/m);
    expect(web).toMatch(/^\s+maxShutdownDelaySeconds: 120\s*$/m);
  });

  it("keeps the plan, and never caps the heap through NODE_OPTIONS (it would cap vite build too)", () => {
    expect(web).toMatch(/^\s+plan: 1c-2g\b/m);
    expect(web).toMatch(/^\s+startCommand: npm start\s*$/m);
    expect(renderYaml).not.toMatch(/^\s+- key: NODE_OPTIONS/m);
  });
});
