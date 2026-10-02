/**
 * The Hub's day as a list, on a phone (Journey Lite, Oct 1 2026).
 *
 * Drawn in place of HubGrid when `usePhone()` says so; ClientsView keeps
 * every read, the top, the Peek and the cards (`renderCard` is the grid's
 * own), so a phone sees the same day an iPad does, one booking under the
 * next. The order and the Now line are `day-list.ts`.
 */
import type { ReactNode } from "react";
import { clockWords } from "../hub-schedule/grid-model";
import { planDayList, type DayBlock } from "./day-list";
import "./phone.css";

export function PhoneDayList<B extends DayBlock>({
  blocks,
  columnOrder,
  mineOnly,
  nowMin,
  renderCard,
  withWords,
  emptyWords,
  hidden,
}: {
  blocks: B[];
  columnOrder: string[];
  mineOnly: string | null;
  nowMin: number | null;
  /** The Hub's own card for a block. */
  renderCard: (block: B) => ReactNode;
  /** "with Sam" on Everyone, null when the card already says whose it is. */
  withWords: (block: B) => string | null;
  /** What an empty day says; null while it can't say yet. */
  emptyWords: string | null;
  hidden?: boolean;
}) {
  const { rows, nowBefore } = planDayList({ blocks, columnOrder, mineOnly, nowMin });
  const nowLine = (
    <li className="ph-day__now" aria-label={`Now, ${nowMin !== null ? clockWords(nowMin) : ""}`}>
      Now
    </li>
  );
  return (
    <div className="ph-day" hidden={hidden}>
      {rows.length === 0 ? (
        emptyWords ? <p className="ph-day__empty">{mineOnly ? "Nobody booked with you on this day." : emptyWords}</p> : null
      ) : (
        <ol className="ph-day__list">
          {rows.map((block, i) => {
            const withText = withWords(block);
            return (
              <FragmentRow key={block.key} showNow={nowBefore === i} nowLine={nowLine}>
                <li className="ph-day__row" data-block-key={block.key}>
                  <div className="ph-day__time">
                    <span>{clockWords(block.span.from).replace(/ ([AP]M)$/, "")}</span>
                    <small>{clockWords(block.span.from).slice(-2)}</small>
                  </div>
                  <div className="ph-day__cell">
                    <div className="ph-day__card">{renderCard(block)}</div>
                    {withText && <p className="ph-day__with">{withText}</p>}
                  </div>
                </li>
              </FragmentRow>
            );
          })}
          {nowBefore === rows.length && nowLine}
        </ol>
      )}
    </div>
  );
}

function FragmentRow({ showNow, nowLine, children }: { showNow: boolean; nowLine: ReactNode; children: ReactNode }) {
  return (
    <>
      {showNow && nowLine}
      {children}
    </>
  );
}
