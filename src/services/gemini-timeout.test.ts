/**
 * The model's time limit (server/gemini.ts, the speed round, Oct 5 2026): a
 * call that never answers is abandoned and said in a sentence, not retried,
 * and both OCR calls carry the limit.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { GEMINI_CALL_TIMEOUT_MS, geminiTimeoutSentence, withRetry } from "../../server/gemini";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Never answers, and rejects only when its signal fires (as the SDK does). */
const hangs = vi.fn(
  (signal: AbortSignal) =>
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    }),
);

describe("withRetry's time limit", () => {
  it("gives up on a call that never answers, says so plainly, and doesn't retry it", async () => {
    hangs.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(withRetry("processLegacyChart", hangs, 3, 1, 40)).rejects.toThrow(geminiTimeoutSentence(40));
    expect(hangs).toHaveBeenCalledTimes(1);
  });

  it("still retries a 503 and answers when the model does", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error("503 overloaded"), { status: 503 });
      return "read";
    };
    await expect(withRetry("processLegacyChart", flaky, 3, 1, 1_000)).resolves.toBe("read");
    expect(calls).toBe(2);
  });

  it("hands each attempt a live signal", async () => {
    const seen: AbortSignal[] = [];
    await withRetry("x", async (signal) => {
      seen.push(signal);
      return 1;
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].aborted).toBe(false);
  });

  it("is ninety seconds, and the sentence says it", () => {
    expect(GEMINI_CALL_TIMEOUT_MS).toBe(90_000);
    expect(geminiTimeoutSentence()).toMatch(/longer than 90 seconds/);
  });

  it("is passed to the model on both OCR calls", () => {
    const source = readFileSync(join(HERE, "../../server/gemini.ts"), "utf8");
    expect(source.match(/withRetry\("\w+", \(abortSignal\) =>/g)).toHaveLength(2);
    expect(source.match(/^\s+abortSignal,$/gm)).toHaveLength(2);
  });
});
