import { ClipboardList, ClipboardPen, Wrench } from "lucide-react";

/**
 * Three-state note indicator.
 *
 * The old icon was the same muted clipboard whether or not a note existed,
 * which made it invisible — the one thing it was there to say, it never said.
 *
 * Colour never carries the meaning alone: the GLYPH changes at every step, so
 * the state survives colour-blindness and an arm's-length glance across a gym.
 */
export interface NoteIndicatorProps {
  count: number;
  hasMaintenanceFlag: boolean;
  /** Rail items are smaller than the detail header. */
  size?: "sm" | "md";
}

export function NoteIndicator({ count, hasMaintenanceFlag, size = "sm" }: NoteIndicatorProps) {
  const px = size === "sm" ? 13 : 16;

  if (hasMaintenanceFlag) {
    return (
      <span
        className="eq-note-dot eq-note-dot--flag"
        title={`${count} note${count === 1 ? "" : "s"} · flagged for maintenance`}
        aria-label={`${count} notes, flagged for maintenance`}
      >
        <Wrench size={px} strokeWidth={2.6} aria-hidden />
        <span className="eq-note-dot__count">{count}</span>
      </span>
    );
  }

  if (count > 0) {
    return (
      <span
        className="eq-note-dot eq-note-dot--notes"
        title={`${count} note${count === 1 ? "" : "s"}`}
        aria-label={`${count} notes`}
      >
        <ClipboardPen size={px} strokeWidth={2.4} aria-hidden />
        <span className="eq-note-dot__count">{count}</span>
      </span>
    );
  }

  return (
    <span className="eq-note-dot eq-note-dot--none" title="No notes" aria-label="No notes">
      <ClipboardList size={px} strokeWidth={1.8} aria-hidden />
    </span>
  );
}
