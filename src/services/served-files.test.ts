/**
 * What the web server hands to a browser: server/served-files.ts, against a
 * real Vite dev server and a real Express app, each on a throwaway folder.
 *
 * Round: file exposure (Sep 26 2026). Until now `npm run dev` served any file
 * under the project folder to anyone on the same Wi-Fi, the production admin
 * key included, and the live site served the server's own bundle and its
 * source map from dist/. What this pins down:
 *   - the dev server refuses a key, a backup, a log or any other root file by
 *     every route Vite has (plain, other case, escaped, ?import, ?raw, /@fs/),
 *     and still serves the app and a root file the app imports;
 *   - the production server refuses a Node bundle or a source map in dist/,
 *     however it is spelled, and still serves the app;
 *   - server.ts uses both, and the server bundle is built outside dist/.
 */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { devFileAccess, isServerOnlyFile, serveBuiltApp } from "../../server/served-files";

const HERE = dirname(fileURLToPath(import.meta.url));
const MARKER = "NOT-A-REAL-SECRET-4b1d";

function writeTree(root: string, files: Record<string, string>) {
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), body);
  }
}

/** A long-name temp folder: Vite refuses every path with an 8.3 short-name segment in it. */
function tempFolder(label: string) {
  return realpathSync.native(mkdtempSync(join(tmpdir(), `journey-${label}-`)));
}

async function listen(app: express.Express) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  return { server, port: (server.address() as AddressInfo).port };
}

/** GET without URL normalisation, so "/./x" reaches the server as written. */
function rawGet(port: number, path: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on("error", reject);
  });
}

describe("the development server (npm run dev)", () => {
  let root: string;
  let close: () => Promise<void>;
  let port: number;

  beforeAll(async () => {
    root = tempFolder("dev");
    writeTree(root, {
      "index.html": '<!doctype html><html><body><script type="module" src="/src/main.js"></script></body></html>',
      "src/main.js": 'import config from "../app-config.json";\nconsole.log(config);\n',
      "app-config.json": '{"apiKey":"public-by-design"}',
      "service-account.json": `{"private_key":"${MARKER}"}`,
      "gen-lang-client-firebase-adminsdk-abc12.json": `{"private_key":"${MARKER}"}`,
      "src/service-account.json": `{"private_key":"${MARKER}"}`,
      "src/debug.log": MARKER,
      "backups/client-report.txt": MARKER,
      "ship-relay.log": MARKER,
      "commit-history.txt": MARKER,
      "export.zip": MARKER,
      ".env": `KEY=${MARKER}`,
      "package.json": `{"name":"${MARKER}"}`,
    });
    const { createServer } = await import("vite");
    const vite = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      appType: "spa",
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, ws: false, fs: devFileAccess(root) },
    });
    const app = express();
    app.use(vite.middlewares);
    const listening = await listen(app);
    port = listening.port;
    close = async () => {
      listening.server.close();
      await vite.close();
    };
  }, 30_000);

  afterAll(async () => {
    await close?.();
    rmSync(root, { recursive: true, force: true });
  });

  const get = (path: string) => rawGet(port, path);
  const fsPath = (name: string) => `/@fs${root.startsWith("/") ? "" : "/"}${root.replace(/\\/g, "/")}/${name}`;

  it.each([
    "/service-account.json",
    "/SERVICE-ACCOUNT.JSON",
    "/%73ervice-account.json",
    "/service-account.json?import",
    "/service-account.json?raw",
    "/service-account.json?import&raw",
    "/./service-account.json",
    "/src/../service-account.json",
    "/gen-lang-client-firebase-adminsdk-abc12.json",
  ])("refuses the admin key at %s", async (path) => {
    const res = await get(path);
    expect(res.body).not.toContain(MARKER);
    expect(res.status).not.toBe(200);
  });

  it("refuses the admin key by its absolute path (/@fs/)", async () => {
    const res = await get(fsPath("service-account.json"));
    expect(res.body).not.toContain(MARKER);
    expect(res.status).not.toBe(200);
  });

  it("refuses a key or a log even inside src/", async () => {
    for (const path of ["/src/service-account.json", "/src/service-account.json?import", "/src/debug.log"]) {
      const res = await get(path);
      expect(res.body, path).not.toContain(MARKER);
      expect(res.status, path).toBe(403);
    }
  });

  it("refuses the files git keeps out of the repo: backups, logs, captures, archives, .env", async () => {
    for (const path of ["/backups/client-report.txt", "/ship-relay.log", "/commit-history.txt", "/export.zip", "/.env"]) {
      const res = await get(path);
      expect(res.body, path).not.toContain(MARKER);
      expect(res.status, path).toBe(403);
    }
  });

  it("refuses a root file nobody listed, because only what the app uses is served", async () => {
    const res = await get("/package.json");
    expect(res.body).not.toContain(MARKER);
    expect(res.status).toBe(403);
  });

  it("still serves the app, and a root file the app imports", async () => {
    const page = await get("/");
    expect(page.status).toBe(200);
    expect(page.body).toContain("/src/main.js");

    const entry = await get("/src/main.js");
    expect(entry.status).toBe(200);
    expect(entry.body).toContain("app-config.json");

    const config = await get("/app-config.json?import");
    expect(config.status).toBe(200);
    expect(config.body).toContain("public-by-design");
  });
});

describe("the production server (dist/)", () => {
  let dist: string;
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    dist = tempFolder("dist");
    writeTree(dist, {
      "index.html": "<!doctype html><title>SHELL</title>",
      "favicon.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>",
      "server.cjs": `module.exports = "${MARKER}";`,
      "server.cjs.map": `{"sourcesContent":["${MARKER}"]}`,
      "worker.cjs": `module.exports = "${MARKER}";`,
      "assets/index-Ab12Cd34.js": "console.log('app');",
      "assets/index-Ab12Cd34.js.map": `{"sourcesContent":["${MARKER}"]}`,
    });
    const app = express();
    serveBuiltApp(app, dist);
    ({ server, port } = await listen(app));
  });

  afterAll(() => {
    server?.close();
    rmSync(dist, { recursive: true, force: true });
  });

  const get = (path: string) => rawGet(port, path);

  it.each([
    "/server.cjs",
    "/server.cjs.map",
    "/SERVER.CJS",
    "/%73erver.cjs",
    "/server%2Ecjs",
    "/./server.cjs",
    "/server.cjs/",
    "/worker.cjs",
    "/assets/index-Ab12Cd34.js.map",
  ])("refuses %s", async (path) => {
    const res = await get(path);
    expect(res.body).not.toContain(MARKER);
    expect(res.body).not.toContain("SHELL");
    expect(res.status).toBe(404);
  });

  it("serves the app: hashed assets for a year, other files, and the shell for every route", async () => {
    const asset = await get("/assets/index-Ab12Cd34.js");
    expect(asset.status).toBe(200);
    expect(asset.body).toContain("console.log('app')");

    expect((await get("/favicon.svg")).status).toBe(200);

    for (const path of ["/", "/clients/123"]) {
      const shell = await get(path);
      expect(shell.status, path).toBe(200);
      expect(shell.body, path).toContain("SHELL");
    }

    expect((await get("/assets/missing-Zz99.js")).status).toBe(404);
  });
});

describe("isServerOnlyFile", () => {
  it("names Node bundles and source maps, however they are escaped", () => {
    for (const path of ["/server.cjs", "/server.cjs.map", "/a/b.mjs", "/x.js.map", "/%73erver.cjs", "/SERVER.CJS", "/server.cjs/", "/%E0%A4%A"]) {
      expect(isServerOnlyFile(path), path).toBe(true);
    }
    for (const path of ["/", "/index.html", "/assets/index-Ab12.js", "/favicon.svg", "/clients/123", "/maps"]) {
      expect(isServerOnlyFile(path), path).toBe(false);
    }
  });
});

describe("server.ts and package.json", () => {
  const server = readFileSync(join(HERE, "../../server.ts"), "utf8");
  const pkg = JSON.parse(readFileSync(join(HERE, "../../package.json"), "utf8"));

  it("gives the dev server the file rules", () => {
    expect(server).toMatch(/createViteServer\(\{[\s\S]*?fs:\s*devFileAccess\(root\)/);
  });

  it("serves dist/ only through serveBuiltApp, so nothing reaches it past the guard", () => {
    expect(server).toMatch(/serveBuiltApp\(app,/);
    expect(server).not.toMatch(/express\.static\(/);
  });

  it("builds the server bundle outside dist/, and starts the file it built", () => {
    const outfile = /--outfile=(\S+)/.exec(pkg.scripts.build)?.[1];
    expect(outfile).toBeTruthy();
    expect(outfile!.replace(/\\/g, "/")).not.toMatch(/^(\.\/)?dist\//);
    expect(pkg.scripts.start).toBe(`node ${outfile}`);
  });
});
