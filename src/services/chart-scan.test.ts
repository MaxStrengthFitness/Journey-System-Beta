/**
 * A chart scan that meets a busy server keeps its pages (the speed round's
 * review, Oct 5 2026): the server reads one request at a time, so a second
 * leader's import can land between the first one's pages. The page answered
 * busy is waited out and sent again; nothing already read is thrown away.
 * The route calls are stubbed; nothing leaves this machine.
 */

import { describe, expect, it, vi } from "vitest";
import { SCAN_BUSY_MESSAGE, SCAN_BUSY_WAIT_MS } from "./chart-upload";
import { readChartPages, waitWhileScanBusy } from "./chart-scan";
import { ScanBusyError, type OCRResult } from "./geminiService";

const page = (n: number) => ({ base64: `page-${n}`, mimeType: "image/jpeg" });
const resultFor = (n: number): OCRResult =>
  ({ sessionHeaders: [{ sessionNumber: n, date: "5/21", trainer: "AJ" }], performances: [] }) as unknown as OCRResult;

/** A clock the sleeps move forward, so a test never really waits. */
function fakeTime() {
  let t = 0;
  return {
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      t += ms;
    }),
  };
}

describe("readChartPages", () => {
  it("finishes the scan with every page when page 2 is answered busy once", async () => {
    const time = fakeTime();
    let busyOnce = true;
    const readPage = vi.fn(async (_images: unknown, _expected: number, index?: number) => {
      if (index === 1 && busyOnce) {
        busyOnce = false;
        throw new ScanBusyError(5);
      }
      return resultFor(index! + 1);
    });
    const onWaiting = vi.fn();
    const onPage = vi.fn();

    const results = await readChartPages([page(1), page(2), page(3)], {
      readPage: readPage as any,
      onWaiting,
      onPage,
      ...time,
    });

    expect(results.map((r) => r.sessionHeaders[0].sessionNumber)).toEqual([1, 2, 3]);
    expect(readPage).toHaveBeenCalledTimes(4);
    expect(readPage.mock.calls.map((c) => c[2])).toEqual([0, 1, 1, 2]);
    expect(onWaiting).toHaveBeenCalledTimes(1);
    expect(time.sleep).toHaveBeenCalledWith(5_000);
    // The page's own line comes back once it is sent again.
    expect(onPage.mock.calls.map((c) => c[0])).toEqual([0, 1, 1, 2]);
  });

  it("fails at once on anything other than busy, as before", async () => {
    const time = fakeTime();
    const readPage = vi.fn(async () => {
      throw new Error("Gemini API Error during processLegacyChart: bad request");
    });
    await expect(readChartPages([page(1), page(2)], { readPage: readPage as any, ...time })).rejects.toThrow(/bad request/);
    expect(readPage).toHaveBeenCalledTimes(1);
    expect(time.sleep).not.toHaveBeenCalled();
  });
});

describe("waitWhileScanBusy", () => {
  it("says the busy sentence only once it has waited its whole time", async () => {
    const time = fakeTime();
    const work = vi.fn(async () => {
      throw new ScanBusyError(5);
    });
    await expect(waitWhileScanBusy(work, time)).rejects.toThrow(SCAN_BUSY_MESSAGE);
    expect(time.now()).toBeLessThanOrEqual(SCAN_BUSY_WAIT_MS);
    expect(time.now()).toBeGreaterThan(SCAN_BUSY_WAIT_MS - 5_000);
    expect(work.mock.calls.length).toBeGreaterThan(30);
  });

  it("waits the server's Retry-After, kept between one and thirty seconds", async () => {
    for (const [retryAfter, expected] of [[2, 2_000], [0.1, 1_000], [600, 30_000]] as const) {
      const time = fakeTime();
      let first = true;
      await waitWhileScanBusy(async () => {
        if (first) {
          first = false;
          throw new ScanBusyError(retryAfter);
        }
        return "read";
      }, time);
      expect(time.sleep).toHaveBeenCalledWith(expected);
    }
  });

  it("is three minutes, longer than one request may hold the slot", () => {
    expect(SCAN_BUSY_WAIT_MS).toBe(180_000);
  });
});
