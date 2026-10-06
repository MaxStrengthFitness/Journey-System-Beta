/**
 * Checking you in: the moment between "Google said yes" and "Journey found
 * you". It used to show the Request Access form ("not registered as an
 * authorized trainer") for a second or two to every returning trainer.
 *
 * Three named steps, each lighting one of the three squares, so the wait is
 * visible rather than a spinner (visibility of system status). After six
 * seconds a line says it is slow and that Journey keeps trying.
 */
import { useEffect, useState } from "react";
import { FrontDoorPane, Tiles } from "./kit";

export const CHECK_STEPS = ["Signed in", "Finding your trainer record", "Opening your studios"] as const;

export function CheckingIn({
  step,
  email,
  onSignOut,
}: {
  step: number;
  email?: string | null;
  /**
   * "Not you? Sign out" (the speed round, Oct 5 2026). After a sign-in the
   * way out is on every screen (iPads change hands), this one included: the
   * studio picker now waits here too while the studios are read.
   */
  onSignOut?: () => void;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  const labels = [email ? `Signed in as ${email}` : CHECK_STEPS[0], CHECK_STEPS[1], CHECK_STEPS[2]];
  return (
    <FrontDoorPane label="Checking you in">
      <main className="fd-page fd-page--center" aria-busy="true">
        <Tiles mode="steps" step={step} />
        <h1 className="fd-display fd-display--l fd-center" style={{ marginTop: 34 }}>
          Checking you in
        </h1>
        <ol className="fd-steps" aria-live="polite">
          {labels.map((label, i) => (
            <li key={i} className={i < step ? "is-done" : i === step ? "is-now" : ""}>
              <span className="fd-step-dot" aria-hidden="true" />
              <span>
                {label}
                {i < step ? <span className="sr-only"> (done)</span> : null}
              </span>
            </li>
          ))}
        </ol>
        <p className="fd-small fd-center" style={{ marginTop: 18, visibility: slow ? "visible" : "hidden" }} role="status">
          {SLOW_LINE}
        </p>
        {onSignOut && (
          <button type="button" className="fd-link fd-center" style={{ marginTop: 18, alignSelf: "center" }} onClick={onSignOut}>
            Not you? Sign out
          </button>
        )}
      </main>
    </FrontDoorPane>
  );
}

/** The slow line's words, the same on every front-door wait. */
export const SLOW_LINE = "Taking longer than usual. The Wi-Fi may be slow; Journey keeps trying.";
/** How long a wait runs before the slow line shows. */
export const SLOW_AFTER_MS = 6000;

/** True when index.html's static first frame is still on screen (it is replaced when React mounts). */
function firstFrameShowing(): boolean {
  try {
    return typeof document !== "undefined" && Boolean(document.getElementById("first-frame"));
  } catch {
    return false;
  }
}

/**
 * Before Firebase has said whether anyone is signed in: the squares, and
 * nothing to read. Since the speed round (Oct 5 2026, R15) index.html paints
 * these same squares before the script arrives; when it did, they stay still
 * here instead of dropping in a second time. And after six seconds the same
 * slow line as Checking you in: a silent ten-second wait on dead Wi-Fi read
 * as a frozen iPad.
 */
export function OpeningJourney() {
  const [afterFirstFrame] = useState(firstFrameShowing);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <FrontDoorPane label="Opening Journey">
      <main className="fd-page fd-page--center" aria-busy="true">
        <Tiles mode={afterFirstFrame ? "still" : "assemble"} />
        <p className="fd-small fd-center" style={{ marginTop: 28 }}>
          Opening Journey…
        </p>
        {/* Not reserved while hidden, so the squares sit exactly where the
            first frame drew them. */}
        <p className="fd-small fd-center" style={{ marginTop: 18 }} role="status">
          {slow ? SLOW_LINE : ""}
        </p>
      </main>
    </FrontDoorPane>
  );
}
