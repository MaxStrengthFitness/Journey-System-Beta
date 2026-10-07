/**
 * AHEAD → Clients: where everyone stands, one row a client.
 *
 * Today at the left and six months out at the right. The blue bar is the
 * sessions left (Mindbody's count) used at the client's own pace; the tick is
 * the commitment's end. Where the two clocks disagree the row shows it: plum
 * past a charging end (sessions still banked when the next package is
 * charged), a hatched gap when they run out first. ◆ is the talk, the dashed
 * ring the next line if nothing is booked.
 *
 * Ordered by what needs you: Talk now, before the charge and slipping first,
 * then by the first date. The clients with nothing to decide in the weeks
 * drawn are folded at the foot, and those whose dates can't be placed are
 * listed with the reason, never dropped.
 */

import { useState } from "react";
import { cn } from "../../../lib/utils";
import { dayLabel } from "../../renewals/sentences";
import { STATE_NAMES } from "../journey/states";
import { monthLabel, monthOf, shiftMonth } from "../month/month";
import { AheadGlyph, ClockBar } from "./marks";
import { at, clockMarks, type Axis } from "./clocks-geometry";
import type { AheadClient } from "./events";
import type { ClientGroups } from "./weeks";

export interface ClientClocksProps {
  groups: ClientGroups;
  axis: Axis;
  today: string;
  /** The last day Journey can see bookings to: May slip stops there. */
  bookingsSeenTo: string;
  trainerNames: ReadonlyMap<string, string>;
  picked: string | null;
  onPick: (clientId: string) => void;
  /** The last day drawn, for "nothing before …". */
  until: string;
}

export function ClientClocks({ groups, axis, today, bookingsSeenTo, trainerNames, picked, onPick, until }: ClientClocksProps) {
  const [quietOpen, setQuietOpen] = useState(false);
  const months: string[] = [];
  for (let m = shiftMonth(monthOf(axis.first), 1); `${m}-01` <= until; m = shiftMonth(m, 1)) months.push(m);

  const row = (c: AheadClient) => {
    const trainer = c.trainerId ? trainerNames.get(c.trainerId) || null : null;
    const state = c.journey ? STATE_NAMES[c.journey.state] : null;
    return (
      <div key={c.id} className={cn("ops-ah-crow", picked === c.id && "ops-ah-crow--picked")} role="listitem">
        <button type="button" className="ops-ah-crow__who" onClick={() => onPick(c.id)}>
          <span className="ops-ah-row__name">{c.name}</span>
          <span className="ops-ah-crow__meta">
            {trainer && <span>{trainer}</span>}
            {trainer && state && <span aria-hidden="true">·</span>}
            {state && <span>{state}</span>}
            {c.onTrial && <span className="ops-ah-tag">{c.snapshot?.packageLabel?.split(" · ")[0] ?? "Trial"}</span>}
          </span>
        </button>
        {c.cantPlace ? (
          <span className="ops-ah-crow__cant">{c.cantPlace}</span>
        ) : c.noPace && !c.snapshot?.commitmentEnd ? (
          <span className="ops-ah-crow__cant">Not enough to project yet: fewer than 21 days of visits.</span>
        ) : (
          <button type="button" className="ops-ah-crow__track" onClick={() => onPick(c.id)} aria-label={`${c.name}: ${clockWords(c, today)}`}>
            <ClockBar marks={clockMarks(c, axis, today)} today={today} />
          </button>
        )}
      </div>
    );
  };

  const group = (title: string, list: AheadClient[], note: string) =>
    list.length === 0 ? null : (
      <>
        <div className="ops-ah-group">
          <h3 className="ops-ah-group__t">{title}</h3>
          <span className="ops-ah-group__c">
            {list.length} · {note}
          </span>
        </div>
        <div className="ops-ah-clients" role="list" aria-label={title}>
          {list.map(row)}
        </div>
      </>
    );

  return (
    <div>
      <div className="ops-ah-axis">
        <span className="ops-ah-axis__lab">Client</span>
        <div className="ops-ah-axis__track" aria-hidden="true">
          {months.map((m) => (
            <span key={m} className="ops-ah-axis__month" style={{ left: `${at(`${m}-01`, axis)}%` }}>
              {monthLabel(m).split(" ")[0].slice(0, 3)}
              {m.slice(5) === "01" ? ` ’${m.slice(2, 4)}` : ""}
            </span>
          ))}
          <span className="ops-ah-axis__seen" style={{ left: `${at(bookingsSeenTo, axis)}%` }}>
            <span className="ops-ah-axis__seen-w">Bookings to here</span>
          </span>
          <span className="ops-ah-axis__today" style={{ left: `${at(today, axis)}%` }}>
            <span className="ops-ah-axis__today-w">Today</span>
          </span>
        </div>
      </div>
      <div className="ops-ah-legend">
        <span className="ops-ah-legend__i">
          <span className="ops-ah-key ops-ah-key--bar" aria-hidden="true" />
          Sessions left, at their pace
        </span>
        <span className="ops-ah-legend__i">
          <span className="ops-ah-key ops-ah-key--end" aria-hidden="true" />
          Commitment ends
        </span>
        <span className="ops-ah-legend__i">
          <span className="ops-ah-key ops-ah-key--banked" aria-hidden="true" />
          Banked at the charge
        </span>
        <span className="ops-ah-legend__i">
          <span className="ops-ah-key ops-ah-key--gap" aria-hidden="true" />
          None left
        </span>
        <span className="ops-ah-legend__i">
          <AheadGlyph kind="talk" />
          Talk due
        </span>
        <span className="ops-ah-legend__i">
          <AheadGlyph kind="may-slip" />
          May slip
        </span>
      </div>
      {group("Needs you now", groups.now, "talk now, before the charge, or slipping")}
      {group("Coming up", groups.coming, "soonest first")}
      {groups.quiet.length > 0 && (
        <>
          <button type="button" className="ops-ah-fold" aria-expanded={quietOpen} onClick={() => setQuietOpen((v) => !v)}>
            {groups.quiet.length} with nothing to decide before {dayLabel(until, today)} {quietOpen ? "▾" : "›"}
          </button>
          {quietOpen && (
            <div className="ops-ah-clients" role="list" aria-label="Nothing to decide">
              {groups.quiet.map(row)}
            </div>
          )}
        </>
      )}
      {group("Can't place yet", groups.cantPlace, "each with the reason")}
    </div>
  );
}

/** The row's clocks in words, for a screen reader: the first thing to decide. */
function clockWords(c: AheadClient, today: string): string {
  const first = c.events.find((e) => e.kind !== "birthday" && e.kind !== "anniversary");
  if (!first) return "nothing to decide in the weeks drawn";
  return `${first.now ? "now" : dayLabel(first.day, today)}, ${first.sentence}`;
}
