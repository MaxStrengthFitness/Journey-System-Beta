/**
 * Step 4 — the 4 P's on the Dial (reporting round, Sep 2026).
 *
 * Four cards, one per P: the definition, the trainer's own note, the
 * suggested talking point with its "Include in summary" switch, and — last
 * in the card, where a thumb rests — one Dial on the mastery scale. The
 * red / black / green status and the 1–5 bars are gone; `four-ps.ts` keeps
 * the stored `score` and derives the status so older reports still read.
 *
 * Every write goes through `withDial()` / a copy of the entry — never the
 * old object edited in place. Rendering is pure (no effects, no
 * measurement); `FourPs.render.test.tsx` mounts it.
 */
import React from "react";
import { CheckCircle2 } from "lucide-react";
import type { ProgressReport } from "../../types";
import { Dial, MASTERY_SCALE, type DialValue } from "../rating";
import {
  FOUR_PILLARS_DATA,
  FOUR_PS,
  dialFromScore,
  rankFromScore,
  talkingPointFor,
  withDial,
  type PKey,
} from "./four-ps";
import "./progress-report.css";

export type PerformanceMatrix = ProgressReport["performanceMatrix"];

export interface FourPsStepProps {
  value: PerformanceMatrix;
  onChange: (next: PerformanceMatrix) => void;
}

export function FourPsStep({ value, onChange }: FourPsStepProps) {
  const included = value.includedNotes ?? [];

  const setDial = (p: PKey, v: DialValue | null) =>
    onChange({ ...value, [p]: withDial(value[p], v) });

  const setNote = (p: PKey, note: string) =>
    onChange({
      ...value,
      [p]: { score: 0, talkingPoints: [], ...value[p], note },
    });

  const toggleInclude = (text: string) =>
    onChange({
      ...value,
      includedNotes: included.includes(text) ? included.filter((n) => n !== text) : [...included, text],
    });

  return (
    <div data-testid="fourps-step">
      <div className="pr-fourps">
        {FOUR_PS.map((p) => {
          const data = FOUR_PILLARS_DATA[p];
          const entry = value[p];
          const rank = rankFromScore(entry?.score);
          const talkingPoint = talkingPointFor(p, rank);
          const isIncluded = included.includes(talkingPoint);
          return (
            <div key={p} className="pr-p" data-p={p}>
              <div>
                <h3 className="pr-p__title">{data.title}</h3>
                <p className="pr-p__def">{data.definition}</p>
              </div>

              <div>
                <label className="pr-label" htmlFor={`pr-p-note-${p}`}>
                  Personalized note (optional)
                </label>
                <textarea
                  id={`pr-p-note-${p}`}
                  className="pr-p__note"
                  value={entry?.note ?? ""}
                  onChange={(e) => setNote(p, e.target.value)}
                  placeholder={`Add a specific note about their ${data.title.toLowerCase()}...`}
                />
              </div>

              <div className="pr-p__tp">
                <p className="pr-p__tp-text">“{talkingPoint}”</p>
                <button
                  type="button"
                  className="pr-p__include"
                  aria-pressed={isIncluded}
                  onClick={() => toggleInclude(talkingPoint)}
                >
                  {isIncluded ? "✓ Included in summary" : "+ Include in summary"}
                </button>
              </div>

              <Dial
                scale={MASTERY_SCALE}
                value={dialFromScore(entry?.score)}
                onChange={(v) => setDial(p, v)}
                ask={`Where is ${data.title.toLowerCase()} today?`}
                data-testid={`fourps-dial-${p}`}
              />
            </div>
          );
        })}
      </div>

      {included.length > 0 && (
        <div className="pr-fourps__summary">
          <span className="pr-label">Included talking points summary</span>
          <ul>
            {included.map((note, idx) => (
              <li key={idx}>
                <CheckCircle2 className="h-5 w-5" />
                <span>“{note}”</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
