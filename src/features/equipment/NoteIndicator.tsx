import { ClipboardList, ClipboardPen } from "lucide-react";
import { noteKey } from "../machine-menu/note-key";

/**
 * Three-state note indicator.
 *
 * The old icon was the same muted clipboard whether or not a note existed,
 * which made it invisible — the one thing it was there to say, it never said.
 *
 * Colour never carries the meaning alone: the GLYPH changes at every step, so
 * the state survives colour-blindness and an arm's-length glance across a gym.
 *
 * The loud state follows the one note key (machine-menu/note-key.ts; machine
 * menu, Oct 2026): a Heads up is the plum circle, Critical the Hub's crimson
 * triangle, the same marks as beside a machine's name on the Journey grid.
 * It was an orange chip with a wrench for the old list's "Flag maintenance"
 * checkbox, which is gone; the wrench is the Relay flag's alone. The count
 * and the loudness are the one list's (machine-notes.ts).
 */
export interface NoteIndicatorProps {
  count: number;
  /** The loudest open note on the one list, when louder than a plain note (`machineNoteLoudness`). */
  loudness?: "elevated" | "critical" | null;
  /** Rail items are smaller than the detail header. */
  size?: "sm" | "md";
}

export function NoteIndicator({ count, loudness = null, size = "sm" }: NoteIndicatorProps) {
  const px = size === "sm" ? 13 : 16;
  const counted = `${count} note${count === 1 ? "" : "s"}`;

  if (loudness) {
    const key = noteKey(loudness);
    const Glyph = key.glyph;
    const words = count > 1 ? `${counted}, the loudest ${key.word}` : `${counted}, ${key.word}`;
    return (
      <span className="eq-note-dot eq-note-dot--loud" data-level={loudness} title={words} aria-label={words}>
        <Glyph size={px} strokeWidth={2.6} aria-hidden />
        <span className="eq-note-dot__count">{count}</span>
      </span>
    );
  }

  if (count > 0) {
    return (
      <span
        className="eq-note-dot eq-note-dot--notes"
        title={counted}
        aria-label={counted}
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
