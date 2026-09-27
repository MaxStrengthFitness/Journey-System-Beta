/**
 * WHEN A NEW VERSION MAY LOAD (new-version round, Sep 26 2026).
 *
 * Loading a new version is a reload: every screen is torn down and the app
 * starts again. Nothing on the floor may be interrupted by that, so every
 * reload asks this one function first, and the first reason to wait wins. The
 * order is the order of what matters most.
 *
 *   offline          The server has not just answered. A Home Screen app
 *                    reloaded with no connection opens to a blank screen, and
 *                    there is no browser around it to recover from that.
 *   session-screen   The Active Session, the briefing, the post-session screen
 *                    or watching another trainer's session. Never, whatever
 *                    else is true (docs/business/the-floor.md).
 *   own-session      This trainer's own session is still open, even while they
 *                    have stepped out to a profile (the same answer sign-out and
 *                    the bottom tab give: `findMyLiveSession`).
 *   sending          A save on this iPad has not reached the studio's records
 *                    (the check sign-out makes: `unsentWritesWaiting`).
 *   typing           The unsaved-changes registry says something is dirty.
 *                    Asked, never guessed.
 *   note-draft       A session note with words in it, for the session this
 *                    iPad has open. Belt and braces: session storage survives a
 *                    reload and the Active Session restores the draft, but the
 *                    sessions stream can be late after a start, and this reads
 *                    the device's own memory of the session instead.
 *   just-reloaded    This app already reloaded for the same version in the
 *                    last ten minutes and it did not take (the server was mid
 *                    swap). It waits for the next moment instead of looping.
 *
 * The four moments differ only where a person has already said what they
 * want, or where nothing on this iPad can be running:
 *
 *   hub                     Arriving at the Hub, or coming back to Journey
 *                           while it shows the Hub. Automatic, so it waits
 *                           for everything.
 *   tap                     Load now, Load the new version, Try again. The
 *                           person asked: typing goes through the app's own
 *                           "Leave without saving?" question instead, the
 *                           draft is kept by the reload anyway, and a person
 *                           may ask twice.
 *   broken-screen           A screen could not open because its file is gone.
 *                           Automatic, so it waits for everything.
 *   broken-session-screen   The Active Session's own screen could not open.
 *                           Nothing is recording on this iPad (the screen
 *                           never mounted), and a reload is the only way the
 *                           session can be recorded at all: the session
 *                           screen and the open session do not hold it, and
 *                           the resume the app already has brings the trainer
 *                           back into it. A save still sending does.
 *
 * PURE.
 */

export type LoadMoment = "hub" | "tap" | "broken-screen" | "broken-session-screen";

export type WaitReason =
  | "offline"
  | "session-screen"
  | "own-session"
  | "sending"
  | "typing"
  | "note-draft"
  | "just-reloaded";

export interface LoadFacts {
  /** The server answered just now. */
  serverAnswered: boolean;
  /** The Active Session's screen is showing (currentView "workouts"). */
  onSessionScreen: boolean;
  /** This trainer's own open session's client, or null when none is open. */
  ownSessionClientName: string | null;
  /** Saves on this iPad the database has not confirmed. */
  sending: boolean;
  /** Anything registered with the unsaved-changes registry is dirty. */
  typing: boolean;
  /** A session note with words in it, for the session this iPad has open. */
  noteDraft: boolean;
  /** This app already reloaded for the same version in the last ten minutes. */
  triedAlready: boolean;
}

export type LoadVerdict = { load: "now" } | { load: "wait"; reason: WaitReason };

const NOW: LoadVerdict = { load: "now" };
const wait = (reason: WaitReason): LoadVerdict => ({ load: "wait", reason });

export function whenToLoad(moment: LoadMoment, facts: LoadFacts): LoadVerdict {
  const sessionScreenBroken = moment === "broken-session-screen";
  const asked = moment === "tap";

  if (!facts.serverAnswered) return wait("offline");
  if (facts.onSessionScreen && !sessionScreenBroken) return wait("session-screen");
  if (facts.ownSessionClientName !== null && !sessionScreenBroken) return wait("own-session");
  if (facts.sending) return wait("sending");
  if (facts.typing && !asked) return wait("typing");
  if (facts.noteDraft && !asked && !sessionScreenBroken) return wait("note-draft");
  if (facts.triedAlready && !asked) return wait("just-reloaded");
  return NOW;
}
