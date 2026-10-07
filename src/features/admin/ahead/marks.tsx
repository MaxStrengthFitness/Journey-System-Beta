/**
 * AHEAD — the small marks and the two clocks, drawn. The same shapes on a
 * row's badge, on the Clients view and in the client's panel, so a mark means
 * one thing wherever it is: ◆ the talk, a coin the charge, a tick the
 * commitment's end, a gap running out, a dashed ring the next line if nothing
 * is booked, an arrow back from away, a star a moment. Every mark is said in
 * words beside it too; nothing depends on telling shapes or colours apart.
 */

import { AdminBadge } from "../primitives";
import { dayLabel } from "../../renewals/sentences";
import { KIND_TONE, KIND_WORDS, type AheadKind } from "./events";
import type { ClockMarks, Seg } from "./clocks-geometry";

type Shape = "diamond" | "coin" | "tick" | "gap" | "ring" | "back" | "star";

const SHAPE: Record<AheadKind, Shape> = {
  "talk-now": "diamond",
  talk: "diamond",
  "charge-window": "coin",
  charge: "coin",
  renews: "tick",
  "billing-ends": "tick",
  ends: "tick",
  "runs-out": "gap",
  "may-slip": "ring",
  back: "back",
  birthday: "star",
  anniversary: "star",
};

const TONE_CLASS = { act: "act", caution: "caution", date: "date", moment: "moment" } as const;
const BADGE_TONE = { act: "live", caution: "warn", date: "neutral", moment: "neutral" } as const;

function ShapeSvg({ shape }: { shape: Shape }) {
  switch (shape) {
    case "diamond":
      return <path d="M7 1.2 12.8 7 7 12.8 1.2 7Z" fill="currentColor" />;
    case "coin":
      return (
        <>
          <rect x="1.5" y="1.5" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M1.5 7h11v4a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 11Z" fill="currentColor" />
        </>
      );
    case "tick":
      return <rect x="5.6" y="1" width="2.8" height="12" rx="1" fill="currentColor" />;
    case "gap":
      return (
        <>
          <path d="M2 2v10M12 2v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4.5 10.5l5-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
    case "ring":
      return <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2.4 2" />;
    case "back":
      return (
        <>
          <path d="M5.5 3 2 6.5 5.5 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2.5 6.5h6a3.5 3.5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      );
    default:
      return <path d="M7 1.5l1.6 3.7 4 .4-3 2.7.9 3.9L7 10.2 3.5 12.2l.9-3.9-3-2.7 4-.4Z" fill="currentColor" />;
  }
}

/** A kind's mark, in its tone. */
export function AheadGlyph({ kind }: { kind: AheadKind }) {
  return (
    <svg viewBox="0 0 14 14" className={`ops-ah-glyph ops-ah-glyph--${TONE_CLASS[KIND_TONE[kind]]}`} aria-hidden="true" focusable="false">
      <ShapeSvg shape={SHAPE[kind]} />
    </svg>
  );
}

/** The row's badge: the mark and the word. */
export function KindBadge({ kind }: { kind: AheadKind }) {
  return (
    <AdminBadge tone={BADGE_TONE[KIND_TONE[kind]]} icon={<AheadGlyph kind={kind} />}>
      {KIND_WORDS[kind]}
    </AdminBadge>
  );
}

const segStyle = (s: Seg) => ({ left: `${s.from}%`, width: `${s.to - s.from}%` });

/**
 * The two clocks on one line: the sessions bar (blue), banked past a
 * charging end (plum), the gap when they run out early (hatched), the
 * run-out range under it, the end's tick, today, and the marks. Decorative:
 * the row and the panel say every one of these in words.
 */
export function ClockBar({ marks, today }: { marks: ClockMarks; today: string }) {
  return (
    <span className="ops-ah-clock" aria-hidden="true">
      {marks.paused && <span className="ops-ah-clock__seg ops-ah-clock__seg--paused" style={segStyle(marks.paused)} />}
      {marks.bar && <span className="ops-ah-clock__seg ops-ah-clock__seg--bar" style={segStyle(marks.bar)} />}
      {marks.banked && <span className="ops-ah-clock__seg ops-ah-clock__seg--banked" style={segStyle(marks.banked)} />}
      {marks.gap && <span className="ops-ah-clock__seg ops-ah-clock__seg--gap" style={segStyle(marks.gap)} />}
      {marks.range && <span className="ops-ah-clock__seg ops-ah-clock__seg--range" style={segStyle(marks.range)} />}
      {marks.end !== null && <span className="ops-ah-clock__end" style={{ left: `${marks.end}%` }} />}
      <span className="ops-ah-clock__today" style={{ left: `${marks.today}%` }} />
      {marks.talk !== null && (
        <span className="ops-ah-clock__mark" style={{ left: `${marks.talk}%` }}>
          <AheadGlyph kind="talk" />
        </span>
      )}
      {marks.slip !== null && (
        <span className="ops-ah-clock__mark" style={{ left: `${marks.slip}%` }}>
          <AheadGlyph kind="may-slip" />
        </span>
      )}
      {marks.back !== null && (
        <span className="ops-ah-clock__mark" style={{ left: `${marks.back}%` }}>
          <AheadGlyph kind="back" />
        </span>
      )}
      {marks.moments.map((m, i) => (
        <span key={i} className="ops-ah-clock__mark ops-ah-clock__mark--moment" style={{ left: `${m}%` }}>
          <AheadGlyph kind="birthday" />
        </span>
      ))}
      {marks.beyond && <span className="ops-ah-clock__beyond">{dayLabel(marks.beyond, today)} ›</span>}
    </span>
  );
}
