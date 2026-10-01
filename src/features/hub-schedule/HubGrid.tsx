/**
 * THE HUB GRID (calm Hub round, Sep 28 2026): Mindbody's layout, calmer.
 *
 * AJ, on Mindbody's staff schedule: "I don't want it to look like this but
 * the layout is the foundation." Kept: time down the left, trainers across
 * the top, blocks at their real length, who's working at a glance. Changed:
 * names whole, the service only when it isn't the usual one, and colour kept
 * for what needs you (the cards: HubCard).
 *
 *   - Blocks sit at their own times at 2.2px a minute (grid-model): a
 *     30-minute session is 64px, a 45-minute consult 97px.
 *   - An hour or more with nothing booked anywhere folds into a band; a tap
 *     opens it for the day on screen.
 *   - Your column comes first and stays pinned while the others scroll.
 *   - A trainer who isn't on (the agreed standing week, or a day away) is
 *     hatched; with no agreed week nothing is hatched (off-hours).
 *   - The Now line lands a third of the way down, once per day shown.
 *   - Your column can be the FOCUS column (hub cherry round, Hub direction
 *     B, `focusId`): it takes more of the room there is — only room there
 *     is, so it never pushes a column off an iPad the others would have fit
 *     — and its head says your day in words (`detail`).
 *
 * Presentational: ClientsView decides the columns, which booking goes in
 * which, and draws each card (`renderCard`). No reads here.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { bandWords, clockWords, layoutDay, placeColumn, yOf, type Placed, type Span } from "./grid-model";
import type { TrainerDayFrame } from "./off-hours";
import type { YourDay } from "./your-day";
import "./hub-grid.css";

export interface GridColumn {
  /** trainers/{id}, or a stand-in for a name on the schedule with no roster row. */
  id: string;
  /** The name they go by, whole. */
  name: string;
  initials: string;
  isMe: boolean;
  /** Sessions booked with them on the day (never Mindbody's "Unavailable"). */
  count: number;
  /**
   * The day in words under the name, in place of the count: your column's
   * head when it is the focus column ("12 sessions · 6:00 AM – 12:00 PM ·
   * 8 to go", your-day.ts). Absent: the count.
   */
  detail?: YourDay | null;
}

export interface GridBlock {
  key: string;
  columnId: string;
  /** Minutes since the studio's midnight. */
  span: Span;
  booking: unknown;
}

export interface HubGridProps {
  /** The day on screen, "yyyy-mm-dd": a new day closes the bands and lands on now again. */
  dayKey: string;
  columns: ReadonlyArray<GridColumn>;
  blocks: ReadonlyArray<GridBlock>;
  /** Minutes since the studio's midnight, only when the day on screen is today. */
  nowMin: number | null;
  renderCard: (block: GridBlock) => ReactNode;
  /** When each trainer is on, from the agreed standing week; absent = unknown, nothing hatched. */
  frameOf?: (columnId: string, range: Span) => TrainerDayFrame;
  /** Hidden under the Opportunities layer: it stays mounted, and lands on now once it is back. */
  hidden?: boolean;
  /**
   * The focus column (hub cherry round, Hub direction B): your column, which
   * takes more of the room there is and reads in words. Null: every column
   * alike (Focus: Everyone, or you have no column that day).
   */
  focusId?: string | null;
  /**
   * What an empty day says. "Nobody is booked on this day." only when the
   * day's bookings were read (hub fixes, Oct 1 2026): while they load it is
   * a quieter line, and when the read failed nothing (the notice above the
   * grid says so) — a failed read is unknown, never a quiet day.
   */
  emptyWords?: string | null;
}

export const NOBODY_BOOKED = "Nobody is booked on this day.";

/**
 * One line above the grid, in place, when the day's bookings couldn't be read
 * (hub fixes, Oct 1 2026): what happened, that it is trying again, and Try
 * again (40px). Never a toast that goes away and leaves a quiet-looking day.
 */
export function HubNotice({ words, onRetry }: { words: string; onRetry?: () => void }) {
  return (
    <div className="hs-notice" role="alert">
      <span className="hs-notice-words">{words}</span>
      {onRetry && (
        <button type="button" className="hs-notice-btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function HubGrid({ dayKey, columns, blocks, nowMin, renderCard, frameOf, hidden = false, focusId = null, emptyWords = NOBODY_BOOKED }: HubGridProps) {
  const [opened, setOpened] = useState<{ day: string; from: ReadonlySet<number> }>({ day: dayKey, from: new Set() });
  const openedFrom = opened.day === dayKey ? opened.from : EMPTY_SET;

  const layout = useMemo(() => layoutDay(blocks.map((b) => b.span), openedFrom), [blocks, openedFrom]);
  const range = { from: layout.from, to: layout.to };

  const placedByColumn = useMemo(() => {
    const out = new Map<string, Placed<GridBlock>[]>();
    for (const c of columns) {
      out.set(
        c.id,
        placeColumn(
          blocks.filter((b) => b.columnId === c.id).map((b) => ({ item: b, span: b.span })),
          layout,
        ),
      );
    }
    return out;
  }, [columns, blocks, layout]);

  const nowY = nowMin === null ? null : yOf(layout, nowMin);

  /* LAND ON NOW (tracker round, Sep 2026): the Now line a third of the way
     down, so the next session sits right under it. Once per day shown,
     never while the trainer is reading; hidden, it waits until it's back. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const landedOn = useRef<string | null>(null);
  useEffect(() => {
    if (nowY === null) {
      landedOn.current = null;
      return;
    }
    const el = scrollRef.current;
    if (!el || hidden || landedOn.current === dayKey) return;
    landedOn.current = dayKey;
    const head = headRef.current?.offsetHeight ?? 0;
    const top = Math.max(0, head + nowY - Math.round(el.clientHeight / 3));
    if (typeof el.scrollTo === "function") el.scrollTo({ top, behavior: "auto" });
    else el.scrollTop = top;
  }, [nowY, dayKey, hidden]);

  const openBand = (from: number) =>
    setOpened((prev) => {
      const next = new Set(prev.day === dayKey ? prev.from : []);
      next.add(from);
      return { day: dayKey, from: next };
    });

  return (
    <div ref={scrollRef} className="hs-scroll" hidden={hidden} role="region" aria-label="The day's schedule">
      <div className="hs-canvas">
        <div ref={headRef} className="hs-head">
          <div className="hs-corner" aria-hidden />
          {columns.map((c) => {
            const frame = frameOf?.(c.id, range) ?? UNKNOWN_FRAME;
            const focus = focusId !== null && c.id === focusId;
            return (
              <div key={c.id} className="hs-colhead" data-me={c.isMe ? "true" : "false"} data-focus={focus ? "true" : undefined}>
                <span className="hs-avatar" aria-hidden>
                  {c.initials}
                </span>
                <span className="hs-colname">
                  <strong>
                    {c.name}
                    {c.isMe && <span className="hs-you">You</span>}
                  </strong>
                  <span className="hs-colcount">
                    {frame.kind === "away" ? (
                      "Away"
                    ) : focus && c.detail ? (
                      <>
                        {c.detail.count}
                        {/* The middle part gives way first in a narrow head. */}
                        <span className="hs-colcount-span">{` · ${c.detail.span}`}</span>
                        {c.detail.toGo ? ` · ${c.detail.toGo}` : null}
                      </>
                    ) : (
                      `${c.count} ${c.count === 1 ? "session" : "sessions"}`
                    )}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        <div className="hs-body" style={{ height: layout.height }}>
          <div className="hs-axis" aria-hidden>
            {layout.ticks
              .filter((tk) => !tk.edge)
              .map((tk) => (
                <span key={tk.min} className="hs-tick" data-hour={tk.hour ? "true" : "false"} style={{ top: tk.y }}>
                  {tk.hour ? clockWords(tk.min) : `:30`}
                </span>
              ))}
          </div>

          {columns.map((c) => {
            const frame = frameOf?.(c.id, range) ?? UNKNOWN_FRAME;
            const off: Span[] = frame.kind === "away" ? [range] : frame.kind === "week" ? frame.off : [];
            const focus = focusId !== null && c.id === focusId;
            return (
              <div key={c.id} className="hs-col" data-me={c.isMe ? "true" : "false"} data-focus={focus ? "true" : undefined}>
                {layout.ticks.map((tk) => (
                  <span key={tk.min} className="hs-line" data-hour={tk.hour ? "true" : "false"} style={{ top: tk.y }} />
                ))}
                {off.map((s) => {
                  const top = yOf(layout, s.from) ?? 0;
                  const bottom = yOf(layout, s.to) ?? layout.height;
                  return <span key={`${s.from}-${s.to}`} className="hs-off" style={{ top, height: Math.max(0, bottom - top) }} />;
                })}
                {frame.kind === "away" && (
                  <span className="hs-away">{frame.note ? `Away · ${frame.note}` : "Away today"}</span>
                )}
                {(placedByColumn.get(c.id) ?? []).map((p) => (
                  <div
                    key={p.item.key}
                    className="hs-slot"
                    data-block-key={p.item.key}
                    style={{
                      top: p.top,
                      height: p.height,
                      left: `${(p.lane / p.lanes) * 100}%`,
                      width: `${100 / p.lanes}%`,
                    }}
                  >
                    {renderCard(p.item)}
                  </div>
                ))}
              </div>
            );
          })}

          {layout.segments
            .filter((s) => s.folded)
            .map((s) => (
              <button key={s.from} type="button" className="hs-band" style={{ top: s.y }} onClick={() => openBand(s.from)} aria-label={`${bandWords(s)}. Show this stretch`}>
                <span className="hs-band-words">
                  {bandWords(s)}
                  <ChevronDown size={14} aria-hidden />
                </span>
              </button>
            ))}

          {nowY !== null && (
            <div className="hs-now" style={{ top: nowY }} aria-hidden>
              <span className="hs-now-pill">{nowMin !== null ? clockWords(nowMin, { short: true }).replace(/^(\d+)$/, "$1:00") : ""}</span>
            </div>
          )}

          {layout.empty && emptyWords && <p className="hs-empty">{emptyWords}</p>}
        </div>
      </div>
    </div>
  );
}

const EMPTY_SET: ReadonlySet<number> = new Set();
const UNKNOWN_FRAME: TrainerDayFrame = { kind: "unknown" };

export default HubGrid;
