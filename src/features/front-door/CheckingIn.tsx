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

export function CheckingIn({ step, email }: { step: number; email?: string | null }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000);
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
          Taking longer than usual. The Wi-Fi may be slow; Journey keeps trying.
        </p>
      </main>
    </FrontDoorPane>
  );
}

/** Before Firebase has said whether anyone is signed in: the squares, and nothing to read. */
export function OpeningJourney() {
  return (
    <FrontDoorPane label="Opening Journey">
      <main className="fd-page fd-page--center" aria-busy="true">
        <Tiles mode="assemble" />
        <p className="fd-small fd-center" style={{ marginTop: 28 }}>
          Opening Journey…
        </p>
      </main>
    </FrontDoorPane>
  );
}
