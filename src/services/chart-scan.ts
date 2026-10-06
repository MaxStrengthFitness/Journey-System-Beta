/**
 * Reading a chart scan's pages, one request at a time, without losing any
 * (the speed round's review, Oct 5 2026).
 *
 * The server reads ONE request at a time for the whole web service
 * (server/gemini-routes.ts, R20), and a scan is many requests: a page each,
 * then the settings call with every page. When two leaders import at once,
 * the second can land between the first one's pages, and the first one's
 * next page is answered busy. Failing the scan there would throw away every
 * page already read (and paid for), so a busy answer is waited out and the
 * same page sent again, for up to SCAN_BUSY_WAIT_MS; only then does the
 * person see SCAN_BUSY_MESSAGE. Any other failure fails at once, as before.
 *
 * A busy answer costs nothing against the person's own limit: the server
 * checks the slot before it counts the request.
 */

import { SCAN_BUSY_WAIT_MS } from "./chart-upload";
import {
  isScanBusy,
  processLegacyChart,
  type OCRResult,
} from "./geminiService";

export interface BusyWaitOptions {
  /** Called each time the server says busy, before waiting. */
  onWaiting?: () => void;
  /** Defaults to SCAN_BUSY_WAIT_MS. */
  maxWaitMs?: number;
  /** For tests. */
  sleep?: (ms: number) => Promise<void>;
  /** For tests. */
  now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The server's Retry-After, kept between one and thirty seconds. */
function waitFor(retryAfterSeconds: number): number {
  const seconds = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 5;
  return Math.min(30, Math.max(1, seconds)) * 1000;
}

/**
 * Runs `work`, and while the server answers busy, waits its Retry-After and
 * runs it again, for at most `maxWaitMs` in all. The busy error is thrown
 * (its message is SCAN_BUSY_MESSAGE) only when that time has gone.
 */
export async function waitWhileScanBusy<T>(work: () => Promise<T>, opts: BusyWaitOptions = {}): Promise<T> {
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;
  const maxWaitMs = opts.maxWaitMs ?? SCAN_BUSY_WAIT_MS;
  const started = now();
  for (;;) {
    try {
      return await work();
    } catch (err) {
      if (!isScanBusy(err)) throw err;
      const pause = waitFor(err.retryAfterSeconds);
      if (now() - started + pause > maxWaitMs) throw err;
      opts.onWaiting?.();
      await sleep(pause);
    }
  }
}

export interface ChartPagesOptions extends BusyWaitOptions {
  /** Called each time a page is sent (again after a wait): its index and the page count. */
  onPage?: (index: number, total: number) => void;
  /** Defaults to the real route call. */
  readPage?: typeof processLegacyChart;
}

/**
 * Reads every page in order, one request each, and returns every page's
 * result in that order. A busy page is waited out and sent again; the pages
 * already read are kept.
 */
export async function readChartPages(
  pages: { base64: string; mimeType: string }[],
  opts: ChartPagesOptions = {},
): Promise<OCRResult[]> {
  const readPage = opts.readPage ?? processLegacyChart;
  const results: OCRResult[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    results.push(
      await waitWhileScanBusy(() => {
        // Before every try, so "waiting" gives way to the page again.
        opts.onPage?.(i, pages.length);
        return readPage([page], 12, i, pages.length);
      }, opts),
    );
  }
  return results;
}
