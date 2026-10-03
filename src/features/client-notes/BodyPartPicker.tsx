/**
 * WHERE ON THE BODY — the optional body map under Health and Incident (notes
 * round, Oct 3 2026).
 *
 * AJ's fixed head-to-toe list (`body-parts.ts`), always in the same place so
 * a hand that has tapped "Knee" before finds it without looking. One tap adds
 * a part; a second takes it away. A part that comes in pairs then offers its
 * side on its own line — Left · Right · Both, each a second tap away from
 * nothing, because "knee" with no side is still a true note.
 *
 * Every chip is a real button of at least 40px (the floor rule); nothing here
 * is required, and nothing here saves anything — the composer does.
 */
import type { NoteBodyMark } from "../../types/journal";
import { NOTE_BODY_PARTS, NOTE_BODY_PART_META, setBodySide, toggleBodyPart } from "./body-parts";
import "./notes.css";

const SIDES: { id: NonNullable<NoteBodyMark["side"]>; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "both", label: "Both" },
];

export function BodyPartPicker({
  value,
  onChange,
}: {
  value: readonly NoteBodyMark[];
  onChange: (next: NoteBodyMark[]) => void;
}) {
  const chosen = new Set(value.map((m) => m.part));
  const paired = value.filter((m) => NOTE_BODY_PART_META[m.part]?.paired);

  return (
    <div className="flex flex-col gap-1.5" data-testid="body-part-picker">
      <span className="nc-kicker">Where on the body? (optional)</span>
      <div className="nc-chips" role="group" aria-label="Where on the body">
        {NOTE_BODY_PARTS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="nc-chip nc-chip--small"
            aria-pressed={chosen.has(p.id)}
            onClick={() => onChange(toggleBodyPart(value, p.id))}
          >
            {p.label}
          </button>
        ))}
      </div>
      {paired.map((m) => {
        const meta = NOTE_BODY_PART_META[m.part];
        return (
          <div key={m.part} className="nc-chips" role="group" aria-label={`Which ${meta.word}`}>
            <span className="nc-hint nc-bodyside__label">{meta.label}</span>
            {SIDES.map((s) => (
              <button
                key={s.id}
                type="button"
                className="nc-chip nc-chip--small"
                aria-pressed={m.side === s.id}
                onClick={() => onChange(setBodySide(value, m.part, s.id))}
              >
                {s.label}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
