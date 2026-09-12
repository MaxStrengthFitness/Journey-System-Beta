import { Share2 } from "lucide-react";
import "./machine-db.css";

/**
 * "Share with all MSF studios" — one switch, on a machine, a note or a tip.
 *
 * Round: Learning + Planner, Sep 2026. AJ chose that the studio picks, each
 * time, so this sits on the thing being shared rather than in a setting.
 * It is a toggle button (aria-pressed) that says what it will do, then what
 * it did; the change is immediate and reversible, so there is no dialog.
 */
export function ShareToggle({
  shared,
  busy = false,
  disabled = false,
  onToggle,
  label = "Share with all MSF studios",
  sharedLabel = "Shared with all MSF studios",
}: {
  shared: boolean;
  busy?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label?: string;
  sharedLabel?: string;
}) {
  return (
    <button
      type="button"
      className={`mdb-share${shared ? " mdb-share--on" : ""}`}
      aria-pressed={shared}
      disabled={busy || disabled}
      onClick={onToggle}
    >
      <Share2 size={13} aria-hidden />
      {busy ? "Saving…" : shared ? sharedLabel : label}
    </button>
  );
}
