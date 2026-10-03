import { ArrowRightLeft, Check, ChevronRight, HandHelping, HelpCircle, Megaphone, RefreshCcw, Repeat, Target, UsersRound, type LucideIcon } from "lucide-react";
import type { BoardCard, CardGlyph } from "./cards";

/**
 * ONE CARD ON THE BOARD — the checkbox card AJ picked (Oct 3 2026: "Checkbox
 * card"). The same card for every kind of work, so a card never has to be
 * learned twice:
 *
 *   the box     on the left, 44px: done in one tap (with the Board's Undo),
 *               or, where one tap can't finish it, opens it (a question, a
 *               cover, a team job with parts). An initiative and a renewal
 *               talk have no box: they are opened, never ticked.
 *   the words   the title and one quiet line under it (who did it and when,
 *               who's on it, how long it's waited, whose it is); a tap opens
 *               the work beside the board.
 *   the bar     parts done of the whole, when it has parts.
 *
 * Bordered means you can tap it; colour only says something: orange words
 * and edge when someone is waiting, blue when someone's on it, green when
 * it's done. Names wrap and are never cut.
 */

const GLYPH: Record<Exclude<CardGlyph, null>, { icon: LucideIcon; label: string }> = {
  cover: { icon: Repeat, label: "Cover" },
  question: { icon: HelpCircle, label: "A question" },
  help: { icon: HandHelping, label: "A hand" },
  note: { icon: Megaphone, label: "Heads-up" },
  job: { icon: UsersRound, label: "Team job" },
  lead: { icon: Target, label: "From leadership" },
  renewal: { icon: RefreshCcw, label: "Renewal" },
};

export function BoardCardView({
  card,
  busy = false,
  onBox,
  onOpen,
}: {
  card: BoardCard;
  busy?: boolean;
  onBox: (card: BoardCard) => void;
  onOpen: (card: BoardCard) => void;
}) {
  const done = card.state === "done";
  const glyph = card.glyph ? GLYPH[card.glyph] : null;
  const Glyph = glyph?.icon ?? (card.source.kind === "ask" ? ArrowRightLeft : null);
  const line = [card.line, !done && card.estMinutes ? `~${card.estMinutes} min` : null].filter(Boolean).join(" · ");
  const boxLabel = done ? `Not done after all: ${card.title}` : card.box === "done" ? `Done: ${card.title}` : `Open: ${card.title}`;

  return (
    <div className="rbc" data-state={card.state} data-box={card.box} data-mine={card.mine || undefined}>
      {card.box === "none" ? (
        <span className="rbc__mark" aria-hidden>
          {Glyph && <Glyph size={18} />}
        </span>
      ) : (
        <button type="button" className="rbc__box" aria-label={boxLabel} aria-pressed={done} disabled={busy} onClick={() => onBox(card)}>
          <span className="rbc__tick" aria-hidden>
            {done && <Check size={16} strokeWidth={3} />}
          </span>
        </button>
      )}
      <button type="button" className="rbc__main" onClick={() => onOpen(card)}>
        <span className="rbc__t">
          {Glyph && card.box !== "none" && (
            <span className="rbc__glyph" aria-label={glyph?.label}>
              <Glyph size={14} aria-hidden />
            </span>
          )}
          {card.title}
        </span>
        <span className="rbc__line">{line}</span>
        {card.parts && (
          <span className="rbc__bar" aria-hidden>
            <i style={{ width: `${(done ? 1 : card.parts.done / Math.max(1, card.parts.total)) * 100}%` }} />
          </span>
        )}
      </button>
      {card.box === "none" && <ChevronRight size={16} className="rbc__go" aria-hidden />}
    </div>
  );
}
