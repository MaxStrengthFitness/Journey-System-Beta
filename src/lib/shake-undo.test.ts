import { describe, expect, it } from "vitest";
import {
  GRAVITY,
  JOLT_THRESHOLD,
  installShakeUndoGuard,
  isShake,
  isUndoInput,
  joltSize,
  looksLikeIpad,
  trimSamples,
  type MotionSample,
} from "./shake-undo";

const still = (t: number): MotionSample => ({ x: 0, y: GRAVITY, z: 0, t });
const jolt = (t: number): MotionSample => ({ x: 0, y: GRAVITY + JOLT_THRESHOLD + 2, z: 0, t });

describe("which edits are an undo", () => {
  it("names the two iOS produces", () => {
    expect(isUndoInput("historyUndo")).toBe(true);
    expect(isUndoInput("historyRedo")).toBe(true);
  });

  it("leaves ordinary typing alone", () => {
    expect(isUndoInput("insertText")).toBe(false);
    expect(isUndoInput("deleteContentBackward")).toBe(false);
    expect(isUndoInput(undefined)).toBe(false);
    expect(isUndoInput(null)).toBe(false);
  });
});

describe("which devices the guard is for", () => {
  it("knows an iPad that says so", () => {
    expect(looksLikeIpad({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", platform: "iPad" })).toBe(true);
  });

  it("knows an iPadOS 13+ iPad pretending to be a Mac — touch is the tell", () => {
    expect(
      looksLikeIpad({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("leaves a real Mac alone, so Cmd+Z still works on a studio desktop", () => {
    expect(looksLikeIpad({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0 })).toBe(
      false,
    );
  });

  it("leaves Windows alone", () => {
    expect(looksLikeIpad({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 })).toBe(false);
    // A Windows touchscreen is still not an iPad.
    expect(looksLikeIpad({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 10 })).toBe(false);
  });

  it("says no when it knows nothing", () => {
    expect(looksLikeIpad({})).toBe(false);
  });
});

describe("detecting a shake", () => {
  it("reads a still iPad as no movement, whichever way up it is held", () => {
    expect(joltSize({ x: 0, y: GRAVITY, z: 0, t: 0 })).toBeCloseTo(0);
    expect(joltSize({ x: 0, y: 0, z: -GRAVITY, t: 0 })).toBeCloseTo(0);
    expect(joltSize({ x: GRAVITY, y: 0, z: 0, t: 0 })).toBeCloseTo(0);
  });

  it("needs several jolts, not one knock against a machine", () => {
    expect(isShake([jolt(0)])).toBe(false);
    expect(isShake([jolt(0), jolt(100)])).toBe(false);
    expect(isShake([jolt(0), jolt(100), jolt(200)])).toBe(true);
  });

  it("ignores jolts that fall outside the window", () => {
    // Three jolts, but the first two are a second and a half before the last.
    expect(isShake([jolt(0), jolt(100), jolt(1600)])).toBe(false);
  });

  it("ignores an iPad being carried around", () => {
    expect(isShake([still(0), still(100), still(200), still(300), still(400)])).toBe(false);
  });

  it("does not care what order the samples arrive in", () => {
    expect(isShake([jolt(200), jolt(0), jolt(100)])).toBe(true);
  });

  it("keeps only the recent readings", () => {
    const kept = trimSamples([still(0), still(500), still(900)], 900, 800);
    expect(kept.map((s) => s.t)).toEqual([500, 900]);
  });
});

describe("installing the guard", () => {
  /** The two listener calls a document makes, captured. */
  function fakeDoc() {
    const listeners: Array<[string, EventListener, boolean | undefined]> = [];
    const removed: string[] = [];
    return {
      listeners,
      removed,
      doc: {
        addEventListener: (type: string, fn: EventListener, capture?: boolean) =>
          listeners.push([type, fn, capture as boolean | undefined]),
        removeEventListener: (type: string) => removed.push(type),
      } as unknown as Document,
    };
  }

  const ipad = { userAgent: "iPad", platform: "iPad", maxTouchPoints: 5 };
  const pc = { userAgent: "Windows NT", platform: "Win32", maxTouchPoints: 0 };

  it("installs nothing on a desktop", () => {
    const f = fakeDoc();
    const stop = installShakeUndoGuard({ doc: f.doc, nav: pc });
    expect(f.listeners).toHaveLength(0);
    expect(() => stop()).not.toThrow();
  });

  it("listens in the capture phase on an iPad", () => {
    const f = fakeDoc();
    installShakeUndoGuard({ doc: f.doc, nav: ipad });
    expect(f.listeners).toHaveLength(1);
    expect(f.listeners[0][0]).toBe("beforeinput");
    expect(f.listeners[0][2]).toBe(true);
  });

  it("cancels an undo and nothing else", () => {
    const f = fakeDoc();
    installShakeUndoGuard({ doc: f.doc, nav: ipad });
    const handler = f.listeners[0][1];

    let prevented = 0;
    let stopped = 0;
    const event = (inputType: string) =>
      ({
        inputType,
        preventDefault: () => (prevented += 1),
        stopPropagation: () => (stopped += 1),
      }) as unknown as Event;

    handler(event("insertText"));
    expect(prevented).toBe(0);

    handler(event("historyUndo"));
    expect(prevented).toBe(1);
    expect(stopped).toBe(1);

    handler(event("historyRedo"));
    expect(prevented).toBe(2);
  });

  it("takes its listener off again", () => {
    const f = fakeDoc();
    installShakeUndoGuard({ doc: f.doc, nav: ipad })();
    expect(f.removed).toEqual(["beforeinput"]);
  });
});
