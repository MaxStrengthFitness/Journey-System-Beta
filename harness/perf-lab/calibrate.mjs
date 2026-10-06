/**
 * CALIBRATING THE SLOWDOWN TO THE PC THAT RUNS THE LAB.
 *
 * Chrome's CPU throttling slows the page by a factor of whatever PC runs it,
 * so "3x" on a laptop on battery saver is a slower iPad than "3x" on AJ's
 * desktop. Before every rep the driver times BENCH (a fixed piece of the
 * kind of JavaScript the app does: objects, sorting, maps, strings, JSON) in
 * the page, unthrottled, and sets the rate so the page runs the class's
 * speed: rate = class multiplier x REFERENCE_BENCH_MS / this PC's time
 * (never under 1; a PC slower than the reference can't be made faster, and
 * the report says so).
 *
 * THE REFERENCE is AJ's PC on Oct 6 2026, the machine the first lab runs used
 * with fixed 3x and 5x multipliers, so those runs and calibrated runs on that
 * PC agree. The multipliers themselves (iPad 10th gen and mini about 3x a fast
 * desktop at JavaScript, the A12/A13 iPads about 5x) are Speedometer-class
 * estimates; see README.md.
 */

/** ms for BENCH on the reference PC (median of 7 samples, the first dropped), in headless Chrome, unthrottled. */
export const REFERENCE_BENCH_MS = 235;

/** A fixed, deterministic piece of work; returns its ms. Runs in the page. */
export const BENCH = `(() => {
  const t0 = performance.now();
  let acc = 0;
  for (let r = 0; r < 300; r += 1) {
    const rows = [];
    for (let i = 0; i < 2000; i += 1) rows.push({ k: "k" + ((i * 7919 + r) % 2000), v: i, d: { n: i % 7, s: "x" + (i % 13) } });
    rows.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.v - b.v));
    const m = new Map();
    for (const o of rows) m.set(o.k, (m.get(o.k) || 0) + o.v + o.d.n);
    let s = "";
    for (let i = 0; i < 400; i += 1) s += String.fromCharCode(65 + ((i * r) % 26));
    const j = JSON.stringify(rows.slice(0, 120));
    acc += m.size + s.length + JSON.parse(j).length + s.toLowerCase().split("a").length;
  }
  return { ms: performance.now() - t0, acc };
})()`;

/** Times BENCH `samples` times (after one warm-up unless warm is false) on a page; the median ms. */
export async function benchmark(evaluate, samples = 5, { warm = true } = {}) {
  const times = [];
  for (let i = 0; i < samples + (warm ? 1 : 0); i += 1) {
    const r = await evaluate(BENCH);
    if (!warm || i > 0) times.push(r.ms);
  }
  times.sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const med = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
  return Math.round(med * 10) / 10;
}

/**
 * Sets the page's throttling so BENCH runs `multiplier` times slower than on
 * the reference PC, and returns what it measured. Chrome's throttle is not
 * linear (on the reference PC rate 3 made BENCH 3.9 times slower, and rate
 * 4.9 about 8 times), so the rate is found by measuring: a first guess, then
 * up to five damped corrections until BENCH is within 6% of the target.
 */
export async function calibrate(evaluate, setRate, multiplier) {
  await setRate(1);
  const hostMs = await benchmark(evaluate, 5);
  const targetMs = multiplier * REFERENCE_BENCH_MS;
  let rate = Math.max(1, targetMs / hostMs);
  let checkMs = hostMs;
  const tries = [];
  if (rate > 1) {
    for (let i = 0; i < 6; i += 1) {
      rate = Math.round(rate * 100) / 100;
      await setRate(rate);
      checkMs = await benchmark(evaluate, 2, { warm: false });
      tries.push([rate, checkMs]);
      if (Math.abs(checkMs - targetMs) / targetMs <= 0.06 || i === 5) break;
      rate = Math.max(1, rate * Math.pow(targetMs / checkMs, 0.7));
    }
  }
  return {
    hostMs,
    targetMs,
    rate,
    checkMs,
    /** The class speed reached, as a multiple of the reference PC's time (1 = the reference). */
    effective: Math.round((checkMs / REFERENCE_BENCH_MS) * 100) / 100,
    tries,
  };
}
