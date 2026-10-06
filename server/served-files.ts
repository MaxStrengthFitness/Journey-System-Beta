/**
 * Which files the web server will hand to a browser, in development and in
 * production. Round: file exposure (Sep 26 2026).
 *
 * DEVELOPMENT (`npm run dev`). server.ts listens on every network the PC is
 * on (0.0.0.0, so an iPad on the same Wi-Fi can test against it) and mounts
 * Vite, and Vite answers a request for ANY readable file under the project
 * folder unless told otherwise. Its own refusal list covers .env and
 * certificate files and nothing else, so until this round
 * http://<the PC>:3000/service-account.json handed the production Firebase
 * admin key to anyone on the same network, along with backups/ (script
 * reports carrying client names), the logs, and every other file the repo
 * keeps out of git. `devFileAccess` is two walls:
 *   - ALLOW: only index.html, src/ and node_modules/ are served by name.
 *     Anything else in the folder is served only if the app's own code
 *     imports it (Vite keeps that list itself; it is how
 *     firebase-applet-config.json, the browser's public Firebase config,
 *     still loads). A file dropped in the root tomorrow is refused without
 *     anyone having to add it to a list.
 *   - DENY: keys and captures are refused wherever they sit, even inside
 *     src/ and even when imported. Setting Vite's `deny` REPLACES its
 *     defaults, so they are repeated.
 *
 * PRODUCTION. The live app serves dist/, which is meant to hold what Vite
 * built for the browser and nothing else. The server's own bundle used to be
 * written there too, so /server.cjs and /server.cjs.map (the server's whole
 * source) were public. It is now built to build/server.cjs (package.json),
 * and `serveBuiltApp` still refuses any Node bundle or source map, because
 * `vite build` does not empty dist/ (vite.config.ts, emptyOutDir: false) and
 * an old copy left behind by an earlier build must not be served either.
 */

import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";

/**
 * Vite's own refusals (vite 8.3, `server.fs.deny`). A name with no slash in it
 * matches at any depth; a pattern with a slash is matched against the whole
 * absolute path, which is why the folder patterns start with `**`.
 */
export const VITE_DEFAULT_DENY = [
  ".env",
  ".env.*",
  "*.{crt,pem,key,p12,pfx,cer,der}",
  ".npmrc",
  ".yarnrc.yml",
  "**/.git/**",
] as const;

/** What Journey adds. Spelled the way .gitignore spells the same files. */
export const JOURNEY_DENY = [
  // A Firebase admin key reads and writes the entire database. Google names a
  // downloaded one <projectId>-firebase-adminsdk-<hash>.json.
  "*service-account*.json",
  "serviceAccountKey*.json",
  "*firebase-adminsdk*.json",
  "prod-sdkconfig.json",
  ".secret.local",
  // Captures: script reports carry client names, logs carry request bodies,
  // and an archive can hold either.
  "**/backups/**",
  "*.log",
  "*.{zip,tar.gz,tgz}",
  "live-rules-*.rules",
] as const;

/** The `server.fs` options for the development server rooted at `root`. */
export function devFileAccess(root: string) {
  const nodeModules = path.join(root, "node_modules");
  let realNodeModules = nodeModules;
  try {
    // A worktree's node_modules is a junction to the main checkout's, and
    // Vite resolves packages to their real path.
    realNodeModules = fs.realpathSync(nodeModules);
  } catch {
    // No node_modules yet: nothing to serve from it either.
  }
  return {
    strict: true,
    allow: [...new Set([path.join(root, "index.html"), path.join(root, "src"), nodeModules, realNodeModules])],
    deny: [...VITE_DEFAULT_DENY, ...JOURNEY_DENY],
  };
}

/**
 * A Node bundle (esbuild writes .cjs) or a source map. Neither belongs on the
 * public site: a map carries the source it was built from. Publishing one
 * deliberately would be a decision to make here, not a side effect of a build
 * setting. Checked on the decoded path, because the static handler decodes it
 * too (/%73erver.cjs is /server.cjs).
 */
export function isServerOnlyFile(urlPath: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return true; // malformed escapes: nothing the app links to looks like that
  }
  return /\.(cjs|mjs|map)$/i.test(decoded.replace(/\/+$/, ""));
}

/**
 * The file a perf lab build carries (vite.config.ts writes it when
 * VITE_PERF_LAB=1; harness/perf-lab). A lab build talks only to emulators on
 * 127.0.0.1, so served to an iPad it would be an outage: the server refuses
 * to start on one, and Render keeps the version that was running.
 */
export const PERF_LAB_MARKER = "PERF-LAB-BUILD.txt";

/**
 * The production half of server.ts: the built app in `distPath`, with the SPA
 * shell for every other path. Mounted after every /api route.
 */
export function serveBuiltApp(app: Express, distPath: string) {
  if (fs.existsSync(path.join(distPath, PERF_LAB_MARKER))) {
    throw new Error(`${distPath} is a perf lab build (it talks only to local emulators). Refusing to serve it: build the app without VITE_PERF_LAB.`);
  }
  // Refused before either static handler can find one of them on disk.
  app.use((req, res, next) => {
    if (!isServerOnlyFile(req.path)) return next();
    notFoundNeverCached(res);
  });

  // Vite stamps a content hash into every asset filename
  // (index-BycyQ8Hk.js), so the bytes behind a given URL can never change.
  // That makes them safe to cache for a year, which removes ~20 revalidation
  // round-trips from every page load.
  app.use(
    "/assets",
    express.static(path.join(distPath, "assets"), {
      maxAge: "1y",
      immutable: true,
    }),
  );

  // The build's name (new-version round, Sep 26 2026; vite.config.ts writes
  // it). An open app asks for this file to learn that a deploy has happened,
  // so it must never come from a cache: the static handler below would send
  // it with an hour's max-age, and an iPad would keep being told the old
  // name for up to an hour after the new version went live.
  app.get("/version.json", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(distPath, "version.json"), (err) => {
      if (err && !res.headersSent) res.status(404).type("text/plain").send("Not found");
    });
  });

  // Anything else in dist has no hash in its name, so keep it short-lived.
  // index: false leaves "/" to the catch-all below.
  app.use(express.static(distPath, { index: false, maxAge: "1h" }));

  // A missing chunk must 404. Falling through to index.html returns
  // "200 OK" with HTML in it, and the browser then tries to parse that HTML
  // as JavaScript: "Uncaught SyntaxError: Unexpected token '<'".
  // no-store (the speed round, R18, Oct 5 2026): Render's edge cache keeps a
  // 404 for a few minutes unless told not to, and a chunk that is missing for
  // a moment during a deploy must not stay missing at the edge.
  app.use("/assets", (req, res) => {
    notFoundNeverCached(res);
  });

  // index.html is the file that names the hashed assets above. A cached copy
  // pins the browser to a previous deploy's filenames, so it must always be
  // revalidated.
  app.get("*", (req, res) => {
    // A path that names a file (it has an extension) and reached here is a
    // file that isn't in the build. Answering it with the app shell would
    // put HTML under an image's or a script's URL, and an edge cache that
    // keeps such URLs ("Common static files") could then keep serving that
    // HTML in the file's place (R18).
    if (looksLikeAFile(req.path)) return notFoundNeverCached(res);
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(distPath, "index.html"));
  });
}

/** The last segment of the path ends in an extension: /icon-192.png, /x/y.js. The app's own screens have none. */
export function looksLikeAFile(urlPath: string): boolean {
  const last = urlPath.replace(/\/+$/, "").split("/").pop() ?? "";
  return /\.[a-z0-9]{1,16}$/i.test(last);
}

function notFoundNeverCached(res: express.Response) {
  res.set("Cache-Control", "no-store");
  res.status(404).type("text/plain").send("Not found");
}
