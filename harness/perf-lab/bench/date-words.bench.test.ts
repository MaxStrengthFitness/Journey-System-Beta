/**
 * Micro-benchmark: a day in words, once per client (Operations' states.ts
 * dayWords, the Journey page's rows, Month's rows).
 *   TZ=America/New_York npx vitest run harness/perf-lab/bench/date-words
 */
import { describe, it, expect } from "vitest";
import { formatDateWords } from "../../../src/lib/studio-time";

const N = 10_000;
const OPTIONS: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" };
const dates = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2026, 0, 1 + (i % 365))));

function time(label: string, fn: () => number): void {
  fn();
  const t0 = performance.now();
  const sink = fn();
  // eslint-disable-next-line no-console
  console.log(`${label}: ${(performance.now() - t0).toFixed(1)} ms for ${N.toLocaleString()} calls`);
  expect(sink).toBeGreaterThan(0);
}

describe("a day in words", () => {
  it("measures", () => {
    time("toLocaleDateString (before)", () => dates.reduce((n, d) => n + d.toLocaleDateString("en-US", OPTIONS).length, 0));
    for (let r = 0; r < 3; r++) time("formatDateWords (after)", () => dates.reduce((n, d) => n + formatDateWords(d, OPTIONS, "en-US").length, 0));
  });
});
