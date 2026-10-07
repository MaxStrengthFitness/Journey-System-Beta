/**
 * AHEAD → Weeks: the strip and the run of weeks.
 *
 * The client history's list turned to face forward (client-history/
 * HistoryList.tsx): a heading per month, a card per week with one row per
 * thing that lands in it, and a stretch with nothing in it as one hatched
 * line, the way a break is drawn between sessions. The strip above is the
 * next 26 weeks, one small bar each, tapped by month, and shows where you are.
 *
 * A row's words open the client's panel; its (i) says how the date was
 * worked out.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Info } from "lucide-react";
import { cn } from "../../../lib/utils";
import { scrollParentOf } from "../../client-profile/use-scroller-pad";
import { monthLabel } from "../month/month";
import { dayLabel } from "../../renewals/sentences";
import { KindBadge } from "./marks";
import type { AheadClient, AheadEvent } from "./events";
import { countsWords, groupCounts, pileUps, type RunMonth, type StripMonth, type StripWeek } from "./weeks";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdayOf = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};
const dayOfMonth = (day: string) => Number(day.slice(8, 10));
const shortMonth = (month: string) => monthLabel(month).split(" ")[0].slice(0, 3);

export interface WeekRunProps {
  run: RunMonth[];
  strip: { weeks: StripWeek[]; months: StripMonth[]; max: number };
  today: string;
  clientsById: ReadonlyMap<string, AheadClient>;
  trainerNames: ReadonlyMap<string, string>;
  /** The client whose panel is open: their rows are marked. */
  picked: string | null;
  onPick: (clientId: string) => void;
  /** The nightly record can't judge yet: an empty week is never called clear. */
  covered: boolean;
  /** Slipping today (Drifting, At risk, Lapsed), said once in this week's card. */
  miaToday: number | null;
  /** Filtered to one trainer: their piles aren't news. */
  filtered: boolean;
}

export function WeekRun(props: WeekRunProps) {
  const { run, strip, today, clientsById, trainerNames, picked, onPick, covered, miaToday, filtered } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const here = useWeekHere(rootRef, stripRef, run);
  const [why, setWhy] = useState<string | null>(null);

  const jump = useCallback((month: string) => {
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-month="${month}"]`);
    if (!el) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, []);

  const trainerOf = (id: string) => clientsById.get(id)?.trainerId ?? null;
  const firstName = (trainerId: string) => (trainerNames.get(trainerId) ?? "").split(/\s+/)[0] || "one trainer";
  const hereMonth = strip.weeks[here]?.monday.slice(0, 7) ?? null;

  return (
    <div className="ops-ah-run" ref={rootRef}>
      <div className="ops-ah-strip" ref={stripRef}>
        <div className="ops-ah-strip__cols" aria-hidden="true">
          {strip.weeks.map((w) => {
            const px = (n: number) => (n ? Math.max(3, Math.round((n / strip.max) * 40)) : 0);
            return (
              <span
                key={w.index}
                className={cn("ops-ah-strip__col", w.index === here && "ops-ah-strip__col--here", w.index === 0 && "ops-ah-strip__col--today")}
              >
                {w.talk > 0 && <span className="ops-ah-strip__bit ops-ah-strip__bit--talk" style={{ height: px(w.talk) }} />}
                {w.date > 0 && <span className="ops-ah-strip__bit ops-ah-strip__bit--date" style={{ height: px(w.date) }} />}
                {w.watch > 0 && <span className="ops-ah-strip__bit ops-ah-strip__bit--watch" style={{ height: px(w.watch) }} />}
              </span>
            );
          })}
        </div>
        <div className="ops-ah-strip__months" role="group" aria-label="Jump to a month">
          {strip.months.map((m) => (
            <button
              key={m.month}
              type="button"
              className="ops-ah-strip__month"
              style={{ flex: m.weeks }}
              aria-current={m.month === hereMonth ? "true" : undefined}
              aria-label={`Jump to ${monthLabel(m.month)}`}
              onClick={() => jump(m.month)}
            >
              {shortMonth(m.month)}
              {m.month.slice(5) === "01" ? ` ’${m.month.slice(2, 4)}` : ""}
            </button>
          ))}
        </div>
      </div>

      {run.map((m) => (
        <section key={m.month} className="ops-ah-run" aria-label={monthLabel(m.month)}>
          <div className="ops-ah-month" data-month={m.month}>
            <h3 className="ops-ah-month__t">{monthLabel(m.month)}</h3>
            <span className="ops-ah-month__rule" aria-hidden="true" />
            <span className="ops-ah-month__c">{countsWords(m.counts) || (covered ? "Nothing placed" : "Nothing to decide")}</span>
          </div>
          {m.items.map((item) => {
            if (item.kind === "clear") {
              return (
                <div key={item.from} className="ops-ah-clear">
                  <span className="ops-ah-clear__b">{covered ? "Nothing placed" : "All clear"}</span>
                  <span>
                    {item.weeks > 1 ? `${item.weeks} weeks · ` : ""}
                    {dayLabel(item.from, today)} – {dayLabel(item.to, today)}
                  </span>
                </div>
              );
            }
            const w = item.week;
            const piles = filtered ? [] : pileUps(w.events, trainerOf);
            // "This week" and "Next week" say their dates beside them; any other week's title is its dates.
            const dates = `${dayLabel(w.monday, today)} – ${w.sunday.slice(0, 7) === w.monday.slice(0, 7) ? Number(w.sunday.slice(8, 10)) : dayLabel(w.sunday, today)}`;
            const title = w.index === 0 ? "This week" : w.index === 1 ? "Next week" : dates;
            return (
              <section key={w.monday} className="ops-ah-week" data-week={w.index} aria-label={title}>
                <header className="ops-ah-week__h">
                  <h4 className="ops-ah-week__t">{title}</h4>
                  {w.index <= 1 && <span className="ops-ah-week__dates">{dates}</span>}
                  <span className="ops-ah-week__c">{countsWords(groupCounts(w.events))}</span>
                  {piles.map((p) => (
                    <p key={p.trainerId} className="ops-ah-week__pile">
                      {p.talks} of the talks are {firstName(p.trainerId)}’s
                    </p>
                  ))}
                  {w.index === 0 && miaToday !== null && miaToday > 0 && (
                    <p className="ops-ah-week__note">{miaToday} MIA today, on Clients → Journey.</p>
                  )}
                </header>
                {w.events.length === 0 ? (
                  <p className="ops-ah-week__empty">{covered ? "Nothing placed this week." : "Nothing to decide this week."}</p>
                ) : (
                  <ul className="ops-ah-rows">
                    {w.events.map((e) => (
                      <EventRow
                        key={e.key}
                        e={e}
                        c={clientsById.get(e.clientId)}
                        today={today}
                        trainerName={trainerNameOf(clientsById.get(e.clientId), trainerNames)}
                        picked={picked === e.clientId}
                        open={why === e.key}
                        onWhy={() => setWhy((v) => (v === e.key ? null : e.key))}
                        onPick={onPick}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function trainerNameOf(c: AheadClient | undefined, names: ReadonlyMap<string, string>): string | null {
  return c?.trainerId ? names.get(c.trainerId) || null : null;
}

function EventRow({
  e,
  c,
  today,
  trainerName,
  picked,
  open,
  onWhy,
  onPick,
}: {
  e: AheadEvent;
  c: AheadClient | undefined;
  today: string;
  trainerName: string | null;
  picked: boolean;
  open: boolean;
  onWhy: () => void;
  onPick: (id: string) => void;
}) {
  const name = c?.name ?? "A client";
  return (
    <li className={cn("ops-ah-row", picked && "ops-ah-row--picked")}>
      {/* The orange ring is today's date, as on a client's calendar; a "now" row (Talk now, inside the charge window) says Now instead, so a column of them isn't a column of orange. */}
      <span className={cn("ops-ah-day", e.day === today && !e.now && "ops-ah-day--today")} aria-hidden="true">
        <span className="ops-ah-day__w">{e.now ? "Now" : weekdayOf(e.day)}</span>
        <span className="ops-ah-day__d">{dayOfMonth(e.day)}</span>
      </span>
      <button type="button" className="ops-ah-row__main" onClick={() => onPick(e.clientId)} aria-label={`${name}: ${e.now ? "now" : dayLabel(e.day, today)}, open`}>
        <span className="ops-ah-row__head">
          <KindBadge kind={e.kind} />
          <span className="ops-ah-row__name">{name}</span>
          {trainerName && <span className="ops-ah-row__who">{trainerName}</span>}
          {c?.onTrial && e.kind !== "birthday" && e.kind !== "anniversary" && <span className="ops-ah-tag">{c.snapshot?.packageLabel?.split(" · ")[0] ?? "Trial"}</span>}
          {e.notConfirmed && <span className="ops-ah-tag">Not confirmed</span>}
        </span>
        <span className="ops-ah-row__text">
          {e.sentence}
          {e.range ? ` · between ${dayLabel(e.range.earliest, today)} and ${dayLabel(e.range.latest, today)}` : ""}
          {e.pair && (
            <>
              {" · "}
              <span className="ops-ah-row__pair">{e.pair}</span>
            </>
          )}
        </span>
      </button>
      {e.proof ? (
        <button type="button" className="ops-info" aria-expanded={open} aria-label={`Why: ${name}`} onClick={onWhy}>
          <Info className="w-4 h-4" aria-hidden />
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
      {open && e.proof && <p className="ops-ah-row__proof">{e.proof}</p>}
    </li>
  );
}

/**
 * Which week is at the top of the screen, under the strip: the strip marks
 * it, and its month. Read from the scroller's own scroll, once a frame.
 */
function useWeekHere(rootRef: RefObject<HTMLDivElement | null>, stripRef: RefObject<HTMLDivElement | null>, run: RunMonth[]): number {
  const [here, setHere] = useState(0);
  // The strip's height, for the month headings' scroll margin.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const root = rootRef.current;
    if (!strip || !root) return;
    const apply = () => root.style.setProperty("--ops-ah-strip-h", `${strip.offsetHeight}px`);
    apply();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(apply);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [rootRef, stripRef]);
  useEffect(() => {
    const root = rootRef.current;
    const strip = stripRef.current;
    if (!root || !strip) return;
    const scroller = scrollParentOf(root);
    const target: HTMLElement | Window = scroller ?? window;
    let frame = 0;
    const read = () => {
      frame = 0;
      const line = strip.getBoundingClientRect().bottom + 8;
      let found = 0;
      for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-week]"))) {
        if (el.getBoundingClientRect().top <= line) found = Number(el.dataset.week);
        else break;
      }
      setHere((v) => (v === found ? v : found));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [rootRef, stripRef, run]);
  return here;
}
