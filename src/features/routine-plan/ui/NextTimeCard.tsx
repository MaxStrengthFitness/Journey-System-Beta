/**
 * THE WRAP-UP'S NEXT TIME (the design round, Oct 8 2026, §4.7; AJ's "1d":
 * the Road's one-line route "wherever a glance is all there is: the
 * briefing, the session's Plan chip and the Wrap-up").
 *
 * Inside the Wrap-up's card headed "Next time", after the next session's
 * weights. One line that asks, the machines performed today that the
 * routine lacks, each a 40px tick on the firm edge (blue when on) with its
 * name, whole, and why it is here ("Day one", "Next in the plan", "Added
 * today · not in the plan"), then the Road for next time, live as the ticks
 * change: what the next visit runs under the "Next time" bracket (a machine
 * joining marked "Joins"), the rest of the plan hollow with the next stop,
 * and the progress line ("0 of 6 · day one: …" while nothing is ticked on
 * an empty Routine A). When two machines side by side in it trip one of the
 * Academy's sequencing rules, one of them joining now, the order effect says
 * so under the Road, quietly (`nextTimeEffects`), live as the ticks change.
 *
 * When the routine was empty at the end of the session, or there is none
 * (AJ's "3a", Oct 8 2026: "this also counts with the consult visit,
 * sometimes the consult machines will not be the same as their a routine"),
 * every row starts unticked under "Tick the ones that start Routine A", with
 * Tick all.
 *
 * Controlled: the Wrap-up holds the ticks and writes them ONCE on the way
 * out (never per tick); nothing here writes. A way out that leaves the
 * screen standing (the iPad locked, another app opened to book the next
 * visit) leaves the ticks open: changed after it, they are handed over again
 * on the next way out (the Wrap-up's `fileNextTime`). The pure half is
 * `next-time.ts`.
 */
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  nextTimeAfter,
  nextTimeAsk,
  nextTimeAskWords,
  nextTimeBLine,
  nextTimeEffects,
  nextTimeProgressLine,
  nextTimeRoad,
  nextTimeWhyWords,
  tickedInOrder,
  type NextTimeSnapshot,
} from "../next-time";
import type { NextTimeRow } from "../plan";
import { OrderNote, TickRow } from "./parts";
import { RoadStrip } from "./RoadStrip";
import "./routine-plan.css";

export interface NextTimeCardProps {
  snapshot: NextTimeSnapshot;
  /** `nextTimeOffer(snapshot)`: the Wrap-up works them out once, for its defaults. */
  rows: readonly NextTimeRow[];
  /** The ticked machines. */
  ticked: readonly string[];
  onTicked: (ticked: string[]) => void;
  firstName?: string | null;
  /** The studio's day, `YYYY-MM-DD`: a can't-do mark that has ended is not drawn on the bench. */
  todayYmd: string;
}

export function NextTimeCard({ snapshot, rows, ticked, onTicked, firstName, todayYmd }: NextTimeCardProps) {
  const nameOf = useMemo(() => (id: string) => snapshot.names[id] || id, [snapshot.names]);
  const picked = useMemo(() => tickedInOrder(rows, ticked), [rows, ticked]);
  const after = useMemo(() => nextTimeAfter(snapshot, picked), [snapshot, picked]);
  const groups = useMemo(() => nextTimeRoad(after, picked, { todayYmd, firstName, nameOf }), [after, picked, todayYmd, firstName, nameOf]);
  const line = useMemo(() => nextTimeProgressLine(after, nameOf), [after, nameOf]);
  // A Routine B planned with the starting lineup starts with Routine A (the studio's "A and B together").
  const bLine = useMemo(() => nextTimeBLine(snapshot, after, todayYmd), [snapshot, after, todayYmd]);
  // The order effects the ticks bring: the first, quietly, as the briefing says one.
  const effect = useMemo(() => nextTimeEffects(snapshot, after, picked)[0] ?? null, [snapshot, after, picked]);
  const ask = nextTimeAsk(snapshot);
  const hasPlan = !!snapshot.plan;
  const allOn = rows.length > 0 && picked.length === rows.length;

  const toggle = (id: string, on: boolean) => {
    const next = on ? [...picked, id] : picked.filter((x) => x !== id);
    onTicked(tickedInOrder(rows, next));
  };

  return (
    <div className="rpl rpl-next" data-testid="next-time">
      <div className="rpl-next__head">
        <p className="rpl-next__ask">{nextTimeAskWords(ask, snapshot.routineName)}</p>
        {ask === "start" && rows.length > 1 && (
          <Button variant="outline" onClick={() => onTicked(allOn ? [] : rows.map((r) => r.machineId))}>
            {allOn ? "Untick all" : "Tick all"}
          </Button>
        )}
      </div>
      <ul className="rpl-next__rows" aria-label={`For ${snapshot.routineName} next time`}>
        {rows.map((r) => (
          <li key={r.machineId} className="rpl-next__row">
            <TickRow
              on={picked.includes(r.machineId)}
              onChange={(on) => toggle(r.machineId, on)}
              label={nameOf(r.machineId)}
              sub={nextTimeWhyWords(r.why, hasPlan)}
            />
          </li>
        ))}
      </ul>
      {groups.length > 0 && (
        <RoadStrip
          groups={groups}
          nameOf={nameOf}
          progressLine={line}
          progress={after.progress}
          label={`${snapshot.routineName}, next time`}
          inWords="next time"
        />
      )}
      {effect && (
        <ul className="rpl-list rpl-list--flush" aria-label="Order effects">
          <OrderNote effect={effect} />
        </ul>
      )}
      {bLine && <p className="rpl-meta">{bLine}</p>}
    </div>
  );
}
