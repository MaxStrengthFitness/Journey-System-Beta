/**
 * THE MACHINE MENU — the safety strip (machine menu design §B, block 1).
 *
 * First in both doors, above the settings, and it never moves: what could
 * hurt this client on this machine before a single dial is touched.
 *
 *   1. The Critical notes about the client on this machine (safety.ts):
 *      whole sentences, the Hub's triangle in the alert colour, who wrote it
 *      and when. Three, then "2 more". A journal that couldn't be read says
 *      "Critical notes couldn't be checked" — an empty strip never stands in
 *      for "nothing to know".
 *   2. The clinical watch-outs the studio's matrix names for this machine
 *      (`WatchOutCard compact`, the session sheet's card).
 *   3. The studio's own notes on the unit and the Relay flag
 *      (`FloorNoteLines`, the session sheet's card, drawn from the card's
 *      one read). It says its own "couldn't be read".
 *
 * Absent when there is nothing to say (the body doesn't draw it).
 */
import { forwardRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { shortDay } from "../client-notes/record-selectors";
import { FloorNoteLines, type FloorRead } from "../equipment/FloorNoteCard";
import { WatchOutCard } from "../equipment/WatchOutCard";
import type { WatchOut } from "../../lib/clinical-watchouts";
import { CRITICAL_UNREAD, type CriticalRead } from "./safety";
import "./machine-menu.css";

/** Critical lines shown before "N more". */
export const CRITICAL_SHOWN = 3;

export interface SafetyStripProps {
  critical: CriticalRead;
  watchOuts: WatchOut[];
  floor: FloorRead;
  /** Whose notes on the unit: "Westlake's notes on this machine". */
  floorStudioName?: string | null;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
}

export const SafetyStrip = forwardRef<HTMLElement, SafetyStripProps>(function SafetyStrip(
  { critical, watchOuts, floor, floorStudioName, today },
  ref,
) {
  const [more, setMore] = useState(false);
  const lines = critical.state === "ready" ? critical.lines : [];
  const shown = more ? lines : lines.slice(0, CRITICAL_SHOWN);
  const hidden = lines.length - shown.length;
  return (
    <section ref={ref} className="mm-blk mm-safe" data-block="safety" aria-label="Things to know first" tabIndex={-1}>
      {shown.length > 0 || critical.state === "failed" ? (
        <ul className="mm-safe__list">
          {shown.map((l) => (
            <li key={l.id} className="mm-safe__line" data-critical="true">
              <AlertTriangle size={20} strokeWidth={2.4} className="mm-safe__crit" aria-hidden />
              <span>
                <b>Critical:</b> {l.words}{" "}
                <span className="mm-safe__meta">{[l.who, l.day ? shortDay(l.day, today) : ""].filter(Boolean).join(" · ")}</span>
              </span>
            </li>
          ))}
          {critical.state === "failed" ? (
            <li className="mm-safe__line" data-failed="true">
              <AlertTriangle size={20} strokeWidth={2.4} className="mm-safe__crit" aria-hidden />
              <span>{CRITICAL_UNREAD}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
      {hidden > 0 ? (
        <button type="button" className="mm-btn mm-safe__more" onClick={() => setMore(true)}>
          {hidden} more
        </button>
      ) : null}
      <WatchOutCard watchOuts={watchOuts} compact />
      <FloorNoteLines read={floor} studioName={floorStudioName} />
    </section>
  );
});
