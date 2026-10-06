/**
 * A tiny static server for the lab build, cached the way production serves
 * it (server/served-files.ts): /assets/* immutable for a year, index.html
 * and version.json never cached, and every other path the app's index.html
 * (no router: the app is one page). /api/* answers 204 to a POST (the client
 * error and boot reports) and 404 otherwise: the lab has no Mindbody and no
 * Gemini, and the studio is seeded "offline" so nothing asks.
 *
 * index.html is served WITHOUT its production preconnects (Firestore and
 * Auth on googleapis.com, the sign-in helper on apis.google.com and the
 * production project's firebaseapp.com): a lab page talks to 127.0.0.1 only,
 * and an open must not wait on, or warm, a connection to Google.
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** index.html with every preconnect to a host outside the lab taken out. */
export function labIndexHtml(html) {
  return html
    .replace(/[ \t]*<link rel="preconnect" href="https:\/\/[^"]*"[^>]*>\r?\n?/g, "")
    .replace(/\["https:\/\/apis\.google\.com"[^\]]*\]/g, "[]");
}

export function startStaticServer(root, port = 0) {
  const base = resolve(root);
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(req.method === "POST" ? 204 : 404, { "Cache-Control": "no-store" });
      res.end();
      return;
    }
    // A same-origin blank page: the driver starts each cold open from here so
    // the profiler and the metrics stay on one renderer across the navigation.
    if (url.pathname === "/__lab_blank") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end("<!doctype html><title>lab</title>");
      return;
    }
    let file = normalize(join(base, decodeURIComponent(url.pathname)));
    if (!file.startsWith(base)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(base, "index.html");
    const ext = extname(file).toLowerCase();
    const headers = { "Content-Type": TYPES[ext] || "application/octet-stream" };
    if (url.pathname.startsWith("/assets/")) headers["Cache-Control"] = "public, max-age=31536000, immutable";
    else if (url.pathname.endsWith("version.json")) headers["Cache-Control"] = "no-store";
    else headers["Cache-Control"] = "no-cache";
    if (file.endsWith("index.html")) {
      res.writeHead(200, headers);
      res.end(labIndexHtml(readFileSync(file, "utf8")));
      return;
    }
    res.writeHead(200, headers);
    createReadStream(file).pipe(res);
  });
  return new Promise((resolveStart) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolveStart({ server, port: address.port, url: `http://127.0.0.1:${address.port}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
