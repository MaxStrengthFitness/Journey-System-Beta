/**
 * THE NEXT 30 MINUTES STRIP (hub cherry round, Sep 28 2026).
 *
 * Hub direction B's "Next 30 minutes": who is due across the floor, with
 * whole names, in one quiet row under the Hub's top — never IN the top,
 * which AJ found "very jumbled" before the calm Hub: the top keeps its two
 * rows, and this row belongs to the schedule below it.
 *
 * Who is on it is next-half-hour.ts (today only, never a booking that is
 * over). Each item says when ("In session", "Now · 9:30", "9:45"), the name
 * she goes by, whole, who she is with, the Critical triangle (the only red)
 * and at most two of her marks with their sayable words — the card's own
 * marks (card-marks.ts), so the strip and the grid say the same thing. A tap
 * opens the same peek a card opens. A booking with no Max Strength profile
 * yet is shown, and opens nothing.
 *
 * Presentational: ClientsView decides the items. It scrolls sideways, and
 * the row keeps its place through the day ("Nobody due in the next 30
 * minutes." in a quiet gap) so nothing moves under the trainer's finger.
 */
import { AlertTriangle, CloudOff } from "lucide-react";
import type { CardGlyph } from "./card-marks";
import { GLYPH } from "./HubCard";
import type { NextWhen } from "./next-half-hour";
import "./hub-card.css";
import "./next-strip.css";

export interface NextStripItem {
  /** The grid block's key: the peek opens on the same booking. */
  key: string;
  when: NextWhen;
  /** "9:45": the booking's start, in studio time. */
  time: string;
  /** The name she goes by, whole. */
  name: string;
  /** "with you", "with Beregond", or null. */
  withText: string | null;
  /** Read first: the note's words, whole, or null. */
  critical: string | null;
  glyphs: ReadonlyArray<CardGlyph>;
  /** How many more marks the peek holds. */
  more: number;
  moreLabel: string | null;
  /** Her record, or null for a booking with no profile yet (it opens nothing). */
  clientId: string | null;
  /** The roster that would hold her hasn't arrived yet: say nothing about a profile. */
  pending?: boolean;
}

export interface NextStripProps {
  items: ReadonlyArray<NextStripItem>;
  onOpen: (item: NextStripItem, anchor: HTMLElement) => void;
  /** The item whose peek is open. */
  openKey?: string | null;
}

function whenWords(item: NextStripItem): string {
  if (item.when === "in-session") return "In session";
  if (item.when === "now") return `Now · ${item.time}`;
  return item.time;
}

function ItemBody({ item }: { item: NextStripItem }) {
  return (
    <>
      <span className="hn-when" data-when={item.when}>
        {item.when === "in-session" && <span className="hs-live-dot" aria-hidden />}
        {whenWords(item)}
      </span>
      <span className="hn-name">
        {item.name}
        {item.critical && (
          <span className="hs-tri" aria-label={item.critical}>
            <AlertTriangle size={14} strokeWidth={2.5} aria-hidden />
          </span>
        )}
      </span>
      <span className="hn-meta">
        {item.clientId === null && !item.pending ? (
          <span className="hn-with">
            <CloudOff size={13} aria-hidden />
            {"Not synced yet"}
          </span>
        ) : (
          item.withText && <span className="hn-with">{item.withText}</span>
        )}
        {item.glyphs.map((g) => {
          const Icon = GLYPH[g.kind];
          return (
            <span key={g.kind} className="hs-g" data-family={g.family} aria-label={g.label}>
              <Icon size={13} strokeWidth={2.4} aria-hidden />
              {g.word && <span className="hs-g-word">{g.word}</span>}
            </span>
          );
        })}
        {item.more > 0 && (
          <span className="hs-g" data-family="more" aria-label={`${item.more} more: ${item.moreLabel ?? ""}`}>
            {`+${item.more}`}
          </span>
        )}
      </span>
    </>
  );
}

export function NextStrip({ items, onOpen, openKey = null }: NextStripProps) {
  return (
    <section className="hn" aria-label="Next 30 minutes">
      <span className="hn-label" aria-hidden>
        {"Next 30 min"}
      </span>
      {items.length === 0 ? (
        <p className="hn-empty">{"Nobody due in the next 30 minutes."}</p>
      ) : (
        <ul className="hn-row">
          {items.map((item) => (
            <li key={item.key} className="hn-cell">
              {item.clientId ? (
                <button
                  type="button"
                  className="hn-item"
                  data-when={item.when}
                  data-open={openKey === item.key ? "true" : undefined}
                  aria-haspopup="dialog"
                  onClick={(e) => onOpen(item, e.currentTarget)}
                >
                  <ItemBody item={item} />
                </button>
              ) : (
                <div className="hn-item" data-when={item.when} data-kind="unlinked">
                  <ItemBody item={item} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default NextStrip;
