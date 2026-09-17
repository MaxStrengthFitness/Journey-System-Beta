/**
 * SHAKE TO UNDO — the iPad's, not ours.
 *
 * Round: history editing + iPad fixes, Sep 17 2026.
 *
 * On a studio floor an iPad gets carried, set down, picked up, wedged under an
 * arm and waved at a client. iOS reads enough of that as a shake and puts up
 * its system alert — "Undo Typing" / "Redo Typing" — over whatever the trainer
 * was in the middle of. Tapping Undo rolls back the text field they last
 * typed in, which in this app is a set's weight, a note, a client's name.
 *
 * ── What is and is not possible from a web page ───────────────────────────
 * The alert itself belongs to iOS. A web page cannot suppress it; nothing in
 * the DOM, no meta tag and no gesture handler reaches it. The complete fix is
 * on the device — Settings → Accessibility → Touch → Shake to Undo, off — and
 * that is worth doing once per studio iPad (docs/ops/TESTING-CHECKLIST.md).
 *
 * What a page CAN do is make the alert harmless and, most of the time, stop it
 * appearing at all. Two layers, both here:
 *
 *   1. CANCEL THE UNDO ITSELF. When the trainer taps Undo, Safari asks the
 *      page first, as a `beforeinput` event with `inputType: "historyUndo"`.
 *      Calling preventDefault() on it cancels the edit. The alert may still
 *      flash; the data does not move. This is the layer that actually
 *      guarantees the record, so it is the one that is always on.
 *
 *   2. TAKE THE TARGET AWAY. iOS raises the alert for the field that currently
 *      has focus and an undo stack. Blurring the focused field the moment a
 *      shake is detected usually means there is nothing to offer and no alert
 *      appears. This layer needs motion events, which on iOS 13+ need a
 *      permission prompt behind a user gesture — so it is opt-in
 *      (`enableShakeMotionWatch`) and off until someone asks for it. The guard
 *      is useful without it.
 *
 * ── Why it is scoped to iPads ─────────────────────────────────────────────
 * Layer 1 also catches Cmd+Z, which on a desktop is a normal, expected thing
 * to press. The app is used on studio PCs as well as iPads, so the guard only
 * installs where the problem exists. `looksLikeIpad` is the test.
 *
 * Everything except `installShakeUndoGuard` is pure — see shake-undo.test.ts.
 */

/* ------------------------------------------------------------------ *
 * Layer 1 — the undo itself
 * ------------------------------------------------------------------ */

/** The two inputTypes iOS's Undo alert produces when the trainer taps it. */
export function isUndoInput(inputType: string | null | undefined): boolean {
  return inputType === "historyUndo" || inputType === "historyRedo";
}

/**
 * Is this the device the guard is for?
 *
 * iPadOS 13 and later report themselves as a Mac, so the user agent alone
 * says "desktop Safari" on the exact device this exists for. The tell is
 * touch: no Mac has a touchscreen, so `maxTouchPoints > 1` on a Mac platform
 * is an iPad. iPhones and older iPads still name themselves outright.
 */
export function looksLikeIpad(nav: {
  platform?: string;
  userAgent?: string;
  maxTouchPoints?: number;
}): boolean {
  const ua = nav.userAgent ?? "";
  const platform = nav.platform ?? "";
  if (/iPad|iPhone|iPod/.test(ua) || /iPad|iPhone|iPod/.test(platform)) return true;
  return (nav.maxTouchPoints ?? 0) > 1 && /Mac/.test(platform);
}

/* ------------------------------------------------------------------ *
 * Layer 2 — the shake
 * ------------------------------------------------------------------ */

export interface MotionSample {
  /** Acceleration in m/s², gravity included — what `devicemotion` reports. */
  x: number;
  y: number;
  z: number;
  /** Milliseconds; any monotonic clock, the detector only reads differences. */
  t: number;
}

/** Earth's pull, subtracted so a still iPad reads ~0 however it is held. */
export const GRAVITY = 9.81;

/** A jolt: how far past gravity a single reading has to go, in m/s². */
export const JOLT_THRESHOLD = 14;

/** How many jolts make a shake rather than a knock against a machine. */
export const SHAKE_JOLTS = 3;

/** The window they have to fall inside, in milliseconds. */
export const SHAKE_WINDOW_MS = 800;

/** How far a single reading is from "sitting still", gravity taken out. */
export function joltSize(s: MotionSample): number {
  return Math.abs(Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z) - GRAVITY);
}

/**
 * Do these readings describe a shake?
 *
 * Deliberately blunt: several hard readings close together. A cleverer
 * detector (axis reversals, frequency) is easy to write and hard to tune, and
 * the cost of being wrong here is one blurred text field — the guard's first
 * layer is what protects the data, so this one is allowed to be approximate.
 *
 * Samples may arrive in any order; only those inside the window ending at the
 * newest one are counted.
 */
export function isShake(
  samples: readonly MotionSample[],
  opts: { threshold?: number; jolts?: number; windowMs?: number } = {},
): boolean {
  const threshold = opts.threshold ?? JOLT_THRESHOLD;
  const jolts = opts.jolts ?? SHAKE_JOLTS;
  const windowMs = opts.windowMs ?? SHAKE_WINDOW_MS;
  if (samples.length < jolts) return false;
  const newest = samples.reduce((max, s) => (s.t > max ? s.t : max), -Infinity);
  let hits = 0;
  for (const s of samples) {
    if (newest - s.t > windowMs) continue;
    if (joltSize(s) >= threshold) hits += 1;
  }
  return hits >= jolts;
}

/** Keeps the last second or so of readings and nothing more. */
export function trimSamples(
  samples: readonly MotionSample[],
  now: number,
  windowMs: number = SHAKE_WINDOW_MS,
): MotionSample[] {
  return samples.filter((s) => now - s.t <= windowMs);
}

/* ------------------------------------------------------------------ *
 * Installing it
 * ------------------------------------------------------------------ */

/** Text the user is editing — the only thing an undo can damage. */
function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return (el as HTMLElement).isContentEditable === true;
}

export interface ShakeUndoGuardOptions {
  /** Defaults to the real document. Injected by the tests. */
  doc?: Document;
  /** Defaults to `navigator`. Injected by the tests. */
  nav?: { platform?: string; userAgent?: string; maxTouchPoints?: number };
  /** Install even on a desktop. Only the tests pass this. */
  force?: boolean;
}

/**
 * Turn layer 1 on. Returns the function that turns it off again; calling it
 * twice is safe. On a device that is not an iPad this installs nothing and
 * returns a no-op, so Cmd+Z on a studio PC still works.
 */
export function installShakeUndoGuard(options: ShakeUndoGuardOptions = {}): () => void {
  const doc = options.doc ?? (typeof document === "undefined" ? null : document);
  const nav = options.nav ?? (typeof navigator === "undefined" ? undefined : navigator);
  if (!doc) return () => {};
  if (!options.force && !(nav && looksLikeIpad(nav))) return () => {};

  const onBeforeInput = (event: Event) => {
    const e = event as InputEvent;
    if (!isUndoInput(e.inputType)) return;
    // Capture phase and stopPropagation as well as preventDefault: a rich-text
    // editor further down the tree that handles undo itself would otherwise
    // still run, and the point is that nothing rolls back.
    e.preventDefault();
    e.stopPropagation();
  };

  doc.addEventListener("beforeinput", onBeforeInput, true);
  return () => doc.removeEventListener("beforeinput", onBeforeInput, true);
}

/**
 * Turn layer 2 on: watch the accelerometer and blur the focused field when
 * the iPad is shaken, so iOS has nothing to offer an undo for.
 *
 * MUST be called from inside a user gesture on iOS 13+ — `requestPermission`
 * throws otherwise, and the prompt it raises ("Allow Motion & Orientation
 * Access?") is the reason this is not on by default. Resolves to the stop
 * function, or null when motion is unavailable or refused.
 */
export async function enableShakeMotionWatch(
  options: { win?: Window; doc?: Document } = {},
): Promise<(() => void) | null> {
  const win = options.win ?? (typeof window === "undefined" ? null : window);
  const doc = options.doc ?? (typeof document === "undefined" ? null : document);
  if (!win || !doc) return null;

  const DME = (win as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } })
    .DeviceMotionEvent;
  if (!DME) return null;
  if (typeof DME.requestPermission === "function") {
    try {
      if ((await DME.requestPermission()) !== "granted") return null;
    } catch {
      return null;
    }
  }

  let samples: MotionSample[] = [];
  const onMotion = (event: Event) => {
    const a = (event as DeviceMotionEvent).accelerationIncludingGravity;
    if (!a) return;
    const now = Date.now();
    samples = trimSamples([...samples, { x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0, t: now }], now);
    if (!isShake(samples)) return;
    samples = [];
    const active = doc.activeElement;
    if (isEditable(active)) (active as HTMLElement).blur();
  };

  win.addEventListener("devicemotion", onMotion);
  return () => win.removeEventListener("devicemotion", onMotion);
}
