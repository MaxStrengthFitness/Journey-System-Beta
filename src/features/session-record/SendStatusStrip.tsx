/**
 * The one line under the session bar that says where the sets are
 * (session record, Sep 26 2026). Draws nothing while saves arrive as they
 * should. At the top, under the bar, so it never covers the Now Bar's controls
 * at the bottom of the screen; not tappable, so it asks nothing of the trainer.
 */
import { CloudOff, CloudUpload } from "lucide-react";
import { sendStatus, type SendFacts } from "./send-status";
import "./session-record.css";

export function SendStatusStrip(facts: SendFacts) {
  const status = sendStatus(facts);
  if (!status) return null;
  const Icon = status.kind === "offline" ? CloudOff : CloudUpload;
  return (
    <div className="sr-send" data-kind={status.kind} role="status" aria-live="polite">
      <Icon className="sr-send__icon" size={16} strokeWidth={2.4} aria-hidden="true" />
      <span className="sr-send__text">{status.text}</span>
    </div>
  );
}
