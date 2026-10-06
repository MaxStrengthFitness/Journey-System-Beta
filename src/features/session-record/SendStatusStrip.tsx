/**
 * The one line under the session bar that says where the sets are
 * (session record, Sep 26 2026). Draws nothing while saves arrive as they
 * should. At the top, under the bar, so it never covers the Now Bar's controls
 * at the bottom of the screen; not tappable, so it asks nothing of the trainer.
 */
import { useEffect, useState } from "react";
import { CloudOff, CloudUpload } from "lucide-react";
import { sendStatus, type SendFacts } from "./send-status";
import "./session-record.css";

/**
 * Either the facts as they stand (`unsentForMs`), or `unsentSince`, in which
 * case the strip keeps its own clock once a second while a save waits (speed
 * round, Oct 5 2026; R10), so the screen it sits on is never redrawn for it.
 */
export type SendStatusStripProps =
  | SendFacts
  | { online: boolean; unsentSince: number | null };

export function SendStatusStrip(props: SendStatusStripProps) {
  const since = "unsentSince" in props ? props.unsentSince : undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === undefined || since === null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [since]);
  const facts: SendFacts =
    "unsentSince" in props
      ? { online: props.online, unsentForMs: since == null ? 0 : Math.max(0, now - since) }
      : props;
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
