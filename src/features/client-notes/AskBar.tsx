/**
 * THE QUESTIONS AT THE TOP OF NOTES — "what do you want to know?" (notes
 * round, Oct 3 2026; the rules are ask.ts).
 *
 * Seven questions, always in the same place: each a real button of at least
 * 40px whose words wrap and are never cut, with a small line under it that
 * says how much is behind it and the newest word, so a reader knows before
 * tapping whether it is worth it. The chosen one answers below: its notes,
 * and, when the question has a deeper page (Body & Pulse, Goals & Focus,
 * Account, FORD, Story), the door to it — one tap, never a second copy of
 * that page here.
 */
import { ChevronRight } from "lucide-react";
import type { RecordPage } from "../client-profile/profile-nav";
import type { AskId, AskLens } from "./ask";

export function AskBar({
  lenses,
  value,
  onChange,
  object,
}: {
  lenses: readonly AskLens[];
  value: AskId;
  onChange: (id: AskId) => void;
  /** her · him · them */
  object: string;
}) {
  return (
    <nav className="nx-ask" aria-label={`Ask about ${object}`} data-testid="notes-ask">
      <p className="nx-ask__kicker">What do you want to know?</p>
      <div className="nx-ask__grid" role="group" aria-label="Questions">
        {lenses.map((l) => (
          <button
            key={l.id}
            type="button"
            className="nx-ask__q"
            aria-pressed={value === l.id}
            data-testid={`ask-${l.id}`}
            onClick={() => onChange(l.id)}
          >
            <span className="nx-ask__question">{l.question}</span>
            {l.preview ? <span className="nx-ask__preview">{l.preview}</span> : null}
          </button>
        ))}
      </div>
    </nav>
  );
}

/**
 * The answer's head: the question, and the door to the page that goes
 * deeper. For a question whose answer is that page (Story, and FORD when
 * Notes holds none of her life), it is the whole answer.
 */
export function AskAnswer({
  lens,
  onOpenPage,
}: {
  lens: AskLens;
  onOpenPage?: (page: RecordPage) => void;
}) {
  if (lens.id === "all") return null;
  const door = lens.door && onOpenPage ? lens.door : null;
  return (
    <div className="nx-answer" data-testid="notes-answer">
      <div className="nx-answer__text">
        <h3 className="nx-answer__q">{lens.question}</h3>
        {/* The question's own line is on its button; a page-only answer says what the page holds. */}
        {!lens.showsNotes ? <p className="nx-answer__line">{lens.empty}</p> : null}
      </div>
      {door ? (
        <button type="button" className="nx-door nx-answer__door" onClick={() => onOpenPage!(door.page)}>
          Open {door.label}
          <ChevronRight size={16} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
