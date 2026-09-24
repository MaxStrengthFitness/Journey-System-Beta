/**
 * COMING UP — the dates at the top of the FORD page (`comingUp()`).
 *
 * Each date is one card: the day and month large, what it is, and when in a
 * trainer's words ("In 17 days"). The when is coloured by URGENCY — this
 * week in FORD's "now" orange, this month in "soon" blue, later quiet — and
 * never by a pillar; the card carries no letter mark. The words wrap, never
 * cut. Three show; the rest are one tap away.
 *
 * A card opens its detail (or, for a birthday nobody has planned anything
 * for, a new Family detail already filled in with the gesture open) — only
 * for a reader who may write FORD. For anyone else the cards are read only,
 * and so is any card the page says it cannot open yet (`canOpen`).
 */
import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Btn, Eyebrow, anchorProps, cap, inTime, type Pronouns } from "../../client-codex/kit";
import { FORD_META, GESTURE_STATUS_LABEL, type FordEntry } from "../types";
import { birthdayLabel, type ComingUpRow } from "../coming-up";

/** How many cards show before "All N coming up". */
export const COMING_UP_SHOWN = 3;

function gestureWords(entry: FordEntry | null): string | null {
  const opp = entry?.opportunity;
  if (!opp || !opp.idea) return null;
  return `${GESTURE_STATUS_LABEL[opp.status]}: ${opp.idea}`;
}

export function ComingUp({
  rows,
  pronouns,
  birthdaySource,
  onOpen,
  canOpen,
}: {
  rows: readonly ComingUpRow[];
  pronouns: Pronouns;
  /** Where the birthday comes from: "from Mindbody", or "from the record" for a client Mindbody does not hold. */
  birthdaySource: string;
  /** Opens a row; null when this reader may not write FORD (the cards are then read only). */
  onOpen: ((row: ComingUpRow) => void) | null;
  /** Whether this one card may be opened now; left out, every card may. */
  canOpen?: (row: ComingUpRow) => boolean;
}) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, COMING_UP_SHOWN);

  return (
    <section className="fordpg-coming" aria-labelledby="fordpg-coming-title" {...anchorProps("ford-coming-up")}>
      <Eyebrow as="h3" icon={CalendarClock}>
        <span id="fordpg-coming-title">Coming up</span>
      </Eyebrow>
      <div className="fordpg-coming__grid">
        {shown.map((row) => {
          const what = row.kind === "birthday" ? birthdayLabel(row, pronouns) : row.entry.body;
          const where =
            row.kind === "birthday"
              ? `${FORD_META.family.label} · ${birthdaySource}`
              : `${row.entry.pillar ? FORD_META[row.entry.pillar].label : "Not filed"}${row.entry.recurrence === "annual" ? " · every year" : ""}`;
          const gesture = gestureWords(row.kind === "birthday" ? row.linked : row.entry);
          const inner = (
            <>
              <span className="fordpg-cu__date" aria-hidden="true">
                {row.when.getDate()}
                <span className="fordpg-cu__month">{row.when.toLocaleDateString("en-US", { month: "short" })}</span>
              </span>
              <span className="fordpg-cu__what">{what}</span>
              <span className="fordpg-cu__meta">
                <span className="fordpg-when" data-urgency={row.urgency}>
                  {cap(inTime(row.daysAway))}
                </span>
                {` · ${where}`}
                {gesture ? ` · ${gesture}` : ""}
              </span>
            </>
          );
          return onOpen && (!canOpen || canOpen(row)) ? (
            <button key={row.key} type="button" className="fordpg-cu" data-kind={row.kind} onClick={() => onOpen(row)}>
              {inner}
            </button>
          ) : (
            <div key={row.key} className="fordpg-cu" data-kind={row.kind}>
              {inner}
            </div>
          );
        })}
      </div>
      {rows.length > COMING_UP_SHOWN ? (
        <div>
          <Btn variant="quiet" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `All ${rows.length} coming up`}
          </Btn>
        </div>
      ) : null}
    </section>
  );
}
