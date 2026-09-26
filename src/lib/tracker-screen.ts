/**
 * WHICH SCREEN THE ACTIVE SESSION VIEW SHOWS (fix round, Sep 2026).
 *
 * WorkoutTrackerView is one component that draws three screens: the
 * briefing before a session, the tracker during it, and the post-session
 * screen after Finish. Which one it draws used to be a run of `if`s in
 * render order, and the order was wrong: the briefing was checked first.
 *
 * Why that hid the post-session screen: Finish writes the session as
 * Completed and turns post-session mode on. A beat later the client's
 * sessions stream reports "no session In-Progress" and, as it always did
 * when nothing is running, turns PRE-session mode on. Both flags were now
 * true, no session was current, and the first `if` won - the trainer saw
 * the briefing for the session they had just finished.
 *
 * The rule is here as a pure function so the order is a tested fact:
 * a finished session's screen outranks everything until the trainer leaves.
 *
 * WATCHING (session record, Sep 26 2026): another trainer's running session
 * is drawn read-only and live, never as this iPad's own. It comes straight
 * after the post-session screen, so a session someone else is running is
 * never mistaken for "nothing here" or for a briefing with a Start button.
 */

export type TrackerScreen = "post-session" | "watch" | "briefing" | "tracker" | "none";

export interface TrackerScreenInput {
  /** Finish has been confirmed and the snapshot for the post-session screen exists. */
  isPostSessionMode: boolean;
  hasPostSessionSnapshot: boolean;
  /** The sessions stream found nothing running for this client. */
  isPreSessionMode: boolean;
  hasClient: boolean;
  hasCurrentSession: boolean;
  /** Another trainer is running the client's session, and this iPad watches it. */
  hasWatchedSession?: boolean;
}

export function trackerScreen(s: TrackerScreenInput): TrackerScreen {
  if (s.isPostSessionMode && s.hasPostSessionSnapshot) return "post-session";
  if (s.hasWatchedSession && !s.hasCurrentSession) return "watch";
  if (!s.hasClient && !s.hasCurrentSession) return "none";
  if (s.hasClient && s.isPreSessionMode && !s.hasCurrentSession) return "briefing";
  return "tracker";
}
