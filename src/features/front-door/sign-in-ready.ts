/**
 * THE SIGN-IN BUTTONS WAIT FOR THE POPUP HELPER, WHERE IT MATTERS (the speed
 * round, Oct 5 2026, R14).
 *
 * Auth now starts without its popup helper on a device that was signed in
 * (lib/auth-boot.ts), so a person who signs out and hands the iPad on reaches
 * the sign-in screen with the helper not yet loaded. Safari opens a popup
 * only straight from a tap; if the helper were loaded after the tap, the
 * popup would be blocked. So the screen loads it as it appears, and on a
 * browser that needs it first the buttons wait for it, at most
 * SIGN_IN_READY_CAP_MS (the SDK's own ping gives up at 5 s; past the cap the
 * buttons work and the popup tries again itself). Everywhere else they
 * never wait.
 */
import { useEffect, useState } from "react";

export const SIGN_IN_READY_CAP_MS = 6000;

export function useSignInReady(input: {
  /** The sign-in screen is showing. */
  active: boolean;
  /** Loads the helper (src/firebase.ts prepareSignIn). */
  prepare: () => Promise<void>;
  /** This browser opens a popup only straight from a tap. */
  mustWait: boolean;
  capMs?: number;
}): boolean {
  const { active, prepare, mustWait, capMs = SIGN_IN_READY_CAP_MS } = input;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!active) return;
    let live = true;
    const done = () => {
      if (live) setReady(true);
    };
    const cap = setTimeout(done, capMs);
    prepare().then(done, (err) => {
      console.warn("[sign-in] the popup helper didn't load; the popup will try again itself", err);
      done();
    });
    return () => {
      live = false;
      clearTimeout(cap);
    };
  }, [active, prepare, capMs]);
  return !mustWait || ready;
}
