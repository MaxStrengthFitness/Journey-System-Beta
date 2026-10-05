/**
 * THE MACHINE MENU — machine fit's one plum line, under the settings.
 *
 * Shown only for a RARE value at the STUDIO tier (fit-line.ts decides; this
 * draws): machine fit's own Diamond, its sentence word for word, and "Right
 * for this client" (44px), which writes `acknowledgeFlag`. There is no
 * Change button: the tile above is the editor. A watched session gets the
 * sentence and no button.
 *
 * The review is a write like any other on the floor: issued at once, never
 * waited on. The line says "Marked right for Avery." straight away, and goes
 * once machine fit's check sees the review; a refusal says so and offers the
 * button again.
 */
import { Diamond } from "lucide-react";
import { useState } from "react";
import type { FieldFlag } from "../machine-fit/types";
import { FIT_ACK_BUTTON, FIT_ACK_FAILED, fitAckedWords } from "./fit-line";
import "./machine-menu.css";

export interface FitLineProps {
  flag: FieldFlag;
  /** `fitLineSentence(...)`: machine fit's words. */
  sentence: string;
  clientFirstName: string;
  /** Writes the review; the promise is the database's answer. Absent: read only. */
  onAcknowledge?: (() => Promise<void>) | null;
}

export function FitLine({ flag, sentence, clientFirstName, onAcknowledge = null }: FitLineProps) {
  const [state, setState] = useState<"idle" | "marked" | "failed">("idle");
  const acknowledge = () => {
    if (!onAcknowledge) return;
    setState("marked");
    let sent: Promise<void>;
    try {
      sent = onAcknowledge();
    } catch (err) {
      sent = Promise.reject(err);
    }
    sent.catch((err) => {
      console.error("[machine menu] fit review not saved", err);
      setState("failed");
    });
  };
  return (
    <div className="mm-fit" data-fit={flag.key}>
      <Diamond size={18} strokeWidth={2.6} className="mm-g--warn" aria-hidden="true" />
      <p className="mm-fit__text">{state === "marked" ? fitAckedWords(clientFirstName) : sentence}</p>
      {state === "failed" ? <p className="mm-fit__text">{FIT_ACK_FAILED}.</p> : null}
      {onAcknowledge && state !== "marked" ? (
        <button type="button" className="mm-btn" onClick={acknowledge}>
          {state === "failed" ? "Try again" : FIT_ACK_BUTTON}
        </button>
      ) : null}
    </div>
  );
}
