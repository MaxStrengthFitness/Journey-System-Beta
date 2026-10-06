/**
 * How the web service lets go when Render replaces it (the speed round, R19,
 * Oct 5 2026).
 *
 * A deploy starts the new instance, moves traffic to it, waits about 60
 * seconds, and then sends the old one SIGTERM. Node's default answer to
 * SIGTERM is to exit at once, which cuts any request still running: a
 * twelve-page chart scan (extractSettings) or a Mindbody pull that is slow to
 * answer. render.yaml's `maxShutdownDelaySeconds: 120` gives the process up
 * to two minutes after SIGTERM, but only a process that waits uses it.
 *
 * So on SIGTERM: stop taking new connections, let every request already
 * running finish, close keep-alive connections as they fall idle, and exit
 * when the last one has gone. A fallback exits anyway shortly before Render's
 * own limit, so a hung upstream can never hold the old instance forever.
 * `unref` on both timers: they never keep the process alive by themselves.
 *
 * Only SIGTERM. Ctrl-C in `npm run dev` is SIGINT, which keeps Node's
 * default (exit at once), so stopping the dev server is unchanged.
 */

import type { Server } from "node:http";

/** Render waits up to maxShutdownDelaySeconds (120) after SIGTERM; leave it ten seconds. */
export const SHUTDOWN_FALLBACK_MS = 110_000;

/**
 * Longer than Render's load balancer holds an idle connection, so the server
 * never closes one the balancer is about to reuse (Render's guide to
 * intermittent connection resets and 502s). headersTimeout must be larger.
 */
export const KEEP_ALIVE_TIMEOUT_MS = 120_000;
export const HEADERS_TIMEOUT_MS = 121_000;

export function tuneKeepAlive(server: Server): void {
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
}

export interface ShutdownOptions {
  exit?: (code: number) => void;
  fallbackMs?: number;
  /** How often idle keep-alive connections are closed while draining. */
  sweepMs?: number;
  log?: (message: string) => void;
}

/**
 * Close the server gracefully, then exit. Safe to call more than once: a
 * second SIGTERM while draining does nothing new.
 */
export function shutDownGracefully(server: Server, options: ShutdownOptions = {}): void {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const log = options.log ?? ((message: string) => console.log(message));
  const marked = server as Server & { journeyClosing?: boolean };
  if (marked.journeyClosing) return;
  marked.journeyClosing = true;

  log("SIGTERM: no new connections; letting running requests finish.");
  let done = false;
  let sweep: ReturnType<typeof setInterval> | undefined;
  const finish = (code: number, why: string) => {
    if (done) return;
    done = true;
    if (sweep) clearInterval(sweep);
    log(why);
    exit(code);
  };

  server.close(() => finish(0, "Every request finished; exiting."));
  // close() shuts the connections that are idle now; one that finishes its
  // request later would otherwise sit open until the keep-alive timeout.
  server.closeIdleConnections();
  sweep = setInterval(() => server.closeIdleConnections(), options.sweepMs ?? 1_000);
  sweep.unref();
  setTimeout(
    () => finish(0, "Requests still running at the shutdown limit; exiting anyway."),
    options.fallbackMs ?? SHUTDOWN_FALLBACK_MS,
  ).unref();
}
