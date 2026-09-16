/**
 * CLIENT MODE — "Hand to client" (reporting round, Sep 2026).
 *
 * The Pulse is usually filled by the coach, a little at a time, from what
 * the client says. Sometimes it is quicker and truer to hand the iPad over:
 * the client reads each statement and taps the word that fits. This is the
 * sheet they hold.
 *
 * What it is: a full-screen portal (like the quick-log dialog), one area at
 * a time in the pillars' order, the area's three statements on the
 * frequency Dial with all five words showing, Back / Next on a 48px bar at
 * the bottom, and "Done — hand back" at the end. Large type: the client is
 * reading at arm's length, not a trainer glancing between sets.
 *
 * What it is NOT: nothing a coach writes or reads is on it — no coach
 * notes, no flags, no scores, no history, no pain map, no stress anchors.
 * Those are coaching context, and the record's rule is that the client
 * copy shows only what the coach chose to show.
 *
 * Where answers go: through the SAME `useCheckInDraft.update` the panel
 * uses, so they autosave into the open draft and land in the change log
 * like any other answer. While the client holds the iPad the draft is
 * marked `enteredBy: "client"`; the next coach edit marks it "coach" again
 * (the panel does that on its own writes).
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import type { Client } from "../../types";
import { Dial, FREQUENCY_SCALE, absoluteToTen, tenToAbsolute } from "../rating";
import { CATEGORY_BY_KEY } from "./questions";
import { ASSESSMENT_PILLARS } from "./pillars";
import type { SubjectiveAssessment, SubjectiveCategoryDef, SubjectiveCategoryKey } from "./types";
import { clientFirstName } from "../../lib/client-name";
import "./subjective-report.css";

export interface PulseClientModeProps {
  open: boolean;
  client: Client;
  /** The open draft, as the panel holds it. */
  assessment: SubjectiveAssessment;
  /** The panel's `draft.update`. */
  onUpdate: (next: SubjectiveAssessment) => void;
  /** "Done — hand back", or the close button. */
  onClose: () => void;
}

/** The eight categories in the pillars' order, each with its pillar's title. */
export const CLIENT_MODE_AREAS: ReadonlyArray<{ def: SubjectiveCategoryDef; pillarTitle: string }> =
  ASSESSMENT_PILLARS.flatMap((p) =>
    p.sectionIds
      .filter((id): id is SubjectiveCategoryKey => id in CATEGORY_BY_KEY)
      .map((id) => ({ def: CATEGORY_BY_KEY[id], pillarTitle: p.title })),
  );

export function PulseClientMode({ open, client, assessment, onUpdate, onClose }: PulseClientModeProps) {
  const [step, setStep] = useState(0);
  const first = clientFirstName(client);

  // Start from the first area every time the sheet is handed over.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Keep the page behind from scrolling while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const total = CLIENT_MODE_AREAS.length;
  const area = useMemo(() => CLIENT_MODE_AREAS[Math.min(step, total - 1)], [step, total]);
  const last = step >= total - 1;

  if (!open) return null;

  const setAnswer = (id: string, ten: number | null) =>
    onUpdate({
      ...assessment,
      enteredBy: "client",
      answers: { ...assessment.answers, [id]: { ...(assessment.answers[id] ?? {}), value: ten } },
    });

  return createPortal(
    <div className="pcm" role="dialog" aria-modal="true" aria-label={`${first}'s Pulse — client mode`} data-testid="pulse-client-mode">
      <div className="pcm__head">
        <div className="min-w-0">
          <p className="pcm__kicker">{area.pillarTitle}</p>
          <h2 className="pcm__title">{area.def.title}</h2>
        </div>
        <span className="pcm__step" aria-live="polite">
          {step + 1} of {total}
        </span>
        <button type="button" className="pcm__close" onClick={onClose} aria-label="Hand back to the coach">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="pcm__body">
        <div className="pcm__inner">
          <h3 className="pcm__ask">{first}, tap the word that fits.</h3>
          <p className="pcm__area">Nothing is wrong or right — skip anything you'd rather not answer.</p>
          {area.def.statements.map((st) => (
            <div key={st.id} className="pcm__statement">
              <Dial
                scale={FREQUENCY_SCALE}
                ask={st.text}
                legend="all"
                value={tenToAbsolute(assessment.answers[st.id]?.value ?? null)}
                onChange={(v) => setAnswer(st.id, v === null ? null : absoluteToTen(v))}
              />
            </div>
          ))}
          {last && (
            <p className="pcm__done-text">
              That's the last one. Tap <b>Done</b> and hand the iPad back — thank you, {first}.
            </p>
          )}
        </div>
      </div>

      <div className="pcm__foot">
        <button type="button" className="pcm__nav" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </button>
        {last ? (
          <button type="button" className="pcm__nav pcm__nav--primary" onClick={onClose}>
            <Check className="h-4 w-4" aria-hidden /> Done — hand back
          </button>
        ) : (
          <button type="button" className="pcm__nav pcm__nav--primary" onClick={() => setStep((s) => Math.min(total - 1, s + 1))}>
            Next <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
