import { useState } from "react";
import { ChevronDown, TriangleAlert, Users } from "lucide-react";
import type { MachineGuide } from "./types";
import "./equipment.css";

/**
 * The setup guide the old tab had nowhere to put.
 *
 * MACHINE_DATABASE has carried eleven setup cues and ten execution cues for the
 * Leg Press since long before this round — written by the studio, sitting in the
 * repo, shown nowhere on this screen. A twenty-card grid had no room for it. A
 * detail pane does.
 *
 * Collapsed by default on a machine the client already uses (the trainer knows
 * it), open by default on one they don't — which is the case the in-session
 * prompt exists for.
 */

export interface SetupGuideProps {
  guide: MachineGuide;
  defaultOpen?: boolean;
  /**
   * Which part to draw (machine menu, Oct 2026). On a machine with nothing
   * recorded the menu opens the SET-UP part above the dials, where the
   * trainer reads it while seating the client, and keeps the execution cues
   * folded below. Everything by default.
   */
  part?: "all" | "setup" | "execution";
}

export function SetupGuide({ guide, defaultOpen = false, part = "all" }: SetupGuideProps) {
  const [open, setOpen] = useState(defaultOpen);
  const setup = part !== "execution";
  const execution = part !== "setup";
  const cueCount = (setup ? guide.setupCues.length : 0) + (execution ? guide.executionCues.length : 0);
  const title = part === "execution" ? "Execution cues" : "Setup guide";

  return (
    <section className="eq-card">
      <button
        type="button"
        className="eq-card__head eq-card__head--button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <h3 className="eq-card__title">{title}</h3>
        {cueCount > 0 && <span className="eq-chip">{cueCount} cues</span>}
        <ChevronDown
          size={16}
          strokeWidth={2.4}
          className={`eq-card__chev ${open ? "eq-card__chev--open" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="eq-card__body">
          {setup && (guide.target || guide.posture || guide.requiresHandoff) && (
            <div className="eq-guide__meta">
              {guide.target && <span className="eq-chip">Target: {guide.target}</span>}
              {guide.posture && <span className="eq-chip">{guide.posture}</span>}
              {guide.requiresHandoff && (
                <span className="eq-chip eq-chip--use">
                  <Users size={11} strokeWidth={2.6} aria-hidden /> Handoff required
                </span>
              )}
            </div>
          )}

          {setup && guide.setupSummary && <p className="eq-guide__lead">{guide.setupSummary}</p>}

          {setup && guide.clinicalWarnings.length > 0 && (
            <div className="eq-guide__group">
              <h4 className="eq-guide__heading">
                <TriangleAlert size={11} strokeWidth={2.6} aria-hidden /> Clinical warnings
              </h4>
              <ul className="eq-guide__list eq-guide__list--warn">
                {guide.clinicalWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {setup && guide.setupCues.length > 0 && (
            <div className="eq-guide__group">
              <h4 className="eq-guide__heading">Setup</h4>
              <ol className="eq-guide__list">
                {guide.setupCues.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            </div>
          )}

          {execution && (guide.executionSummary || guide.executionCues.length > 0) && (
            <div className="eq-guide__group">
              <h4 className="eq-guide__heading">Execution</h4>
              {guide.executionSummary && <p className="eq-guide__lead">{guide.executionSummary}</p>}
              {guide.executionCues.length > 0 && (
                <ul className="eq-guide__list">
                  {guide.executionCues.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
