/**
 * EVERY SENTENCE ABOUT A NEW VERSION (new-version round, Sep 26 2026).
 *
 * A quiet sentence, never a surprise: the line under the header while a new
 * version waits, the words in place of a screen that could not open, and the
 * words in place of Pulse inside a session. Never red (red on the floor is the
 * rep-quality mark), never a pop-up, and nothing that reaches outside the app.
 *
 * A button is offered only where pressing it can work. While the trainer's
 * session is open, or saves are still sending, a reload would wait anyway, so
 * the sentence says what it is waiting for and offers nothing to press.
 *
 * PURE.
 */

import type { WaitReason } from "./verdict";

function who(name: string): string {
  return name.trim() || "a client";
}

const READY = "A new version of Journey is ready.";
const SAVES = "once this iPad's saves reach the studio's records";

/* ------------------------------------------------------------------ *
 * The line under the header.
 * ------------------------------------------------------------------ */

export interface LineFacts {
  /** The Active Session's screen is showing: the line is never drawn there. */
  onSessionScreen: boolean;
  /** This trainer's own open session's client, or null when none is open. */
  ownSessionClientName: string | null;
  /** The last try found saves still sending. */
  sending: boolean;
}

export interface LineWords {
  text: string;
  /** Offer Load now. */
  offerLoad: boolean;
}

/** The line while a new version waits. Null draws nothing. */
export function newVersionLine(facts: LineFacts): LineWords | null {
  if (facts.onSessionScreen) return null;
  if (facts.ownSessionClientName !== null) {
    return { text: `${READY} It will load after your session with ${who(facts.ownSessionClientName)}.`, offerLoad: false };
  }
  if (facts.sending) {
    return { text: `${READY} It will load ${SAVES}.`, offerLoad: false };
  }
  return { text: `${READY} It loads by itself next time you're on the Hub.`, offerLoad: true };
}

/* ------------------------------------------------------------------ *
 * A screen that could not open.
 * ------------------------------------------------------------------ */

/**
 * Why the screen could not open, once the server has been asked:
 *   - "new-version": a different build is live, so its file is gone for good.
 *   - "not-loaded": the same build, or no answer. It is the connection.
 */
export type BrokenCause = "new-version" | "not-loaded";

export type BrokenScreenState =
  | { phase: "checking" }
  | { phase: "loading" }
  | { phase: "wait"; cause: BrokenCause; reason: WaitReason };

export interface ScreenWords {
  text: string;
  /** "load" offers Load the new version; "retry" offers Try again. */
  action: "load" | "retry" | null;
}

export function brokenScreenWords(state: BrokenScreenState, ownSessionClientName: string | null): ScreenWords {
  if (state.phase === "checking") return { text: "Checking for a new version of Journey…", action: null };
  if (state.phase === "loading") return { text: "Loading the new version of Journey…", action: null };

  const newer = state.cause === "new-version";
  const opening = newer ? "This screen is part of a newer version of Journey" : "This screen couldn't be loaded";
  switch (state.reason) {
    case "offline":
      return newer
        ? { text: `${opening}, which will load when the connection is back.`, action: "retry" }
        : { text: `${opening}. The iPad may be offline.`, action: "retry" };
    case "own-session":
      return newer
        ? { text: `${opening}, which will load after your session with ${who(ownSessionClientName ?? "")}.`, action: null }
        : { text: `${opening}. It will load after your session with ${who(ownSessionClientName ?? "")}.`, action: null };
    case "sending":
      return newer
        ? { text: `${opening}, which will load ${SAVES}.`, action: null }
        : { text: `${opening}. It will load ${SAVES}.`, action: null };
    default:
      return newer ? { text: `${opening}.`, action: "load" } : { text: `${opening}.`, action: "retry" };
  }
}

/* ------------------------------------------------------------------ *
 * A panel inside the Active Session (Pulse). It never reloads anything.
 * ------------------------------------------------------------------ */

export function brokenPanelWords(panel: string, newVersionLive: boolean): string {
  return newVersionLive
    ? `${panel} is part of a newer version of Journey. It will open after this session.`
    : `${panel} couldn't be loaded on this iPad just now. It will open after this session.`;
}
