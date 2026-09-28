/**
 * THE BRIEF'S PIECES — a section, the freshness line and the bottom line.
 *
 * The redesign's Operations room, phase 2 (Sep 28 2026). Today's panels were
 * eight equal boxes that folded; the brief is one column of sections in a
 * fixed order, each a heading, a count, one line saying what the count
 * counts, a door, and its rows (overview/pieces.tsx's ActionRows: the name
 * opens the client, the buttons act, nothing nested inside a button).
 */
import { useState, type ReactNode } from "react";
import { CircleDashed, Clock3, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import "../shell/ops.css";

export function BriefSection({
  id,
  title,
  count,
  hot,
  sub,
  door,
  children,
}: {
  id: string;
  title: string;
  /** The rows the section counts; omitted when a count would say nothing. */
  count?: number | null;
  /** Drawn loud (the one hot count on the page: Needs you). */
  hot?: boolean;
  /** What the count counts, in words. */
  sub?: ReactNode;
  door?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ops-sec" id={`brief-${id}`} aria-labelledby={`brief-${id}-t`}>
      <header className="ops-sec__h">
        <h2 className="ops-sec__t" id={`brief-${id}-t`}>
          {title}
        </h2>
        {typeof count === "number" && <span className={cn("ops-badge", hot && count > 0 && "ops-badge--hot")}>{count}</span>}
        {sub && <span className="ops-sec__sub">{sub}</span>}
        {door && <span className="ops-sec__door">{door}</span>}
      </header>
      <div className="ops-sec__card">{children}</div>
    </section>
  );
}

/** A section with nothing in it says so in one line, with when it was checked. */
export function BriefEmpty({ children }: { children: ReactNode }) {
  return <p className="ops-sec__empty">{children}</p>;
}

/**
 * THE FRESHNESS LINE (research-operations metric 9): when each read behind
 * the page answered, and how many clients the page cannot judge — a button
 * that says who and why, so an unknown is never folded into "fine".
 */
export function FreshnessLine({ parts, unknown, unknownWhy, door }: { parts: string[]; unknown: number; unknownWhy: ReactNode; door?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ops-fresh">
      <p className="ops-fresh__line">
        <Clock3 className="w-4 h-4" aria-hidden />
        <span>{parts.join(" · ")}</span>
        {unknown > 0 && (
          <button type="button" className="ops-fresh__unknown" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <CircleDashed className="w-4 h-4" aria-hidden />
            {unknown} unknown
          </button>
        )}
      </p>
      {open && unknown > 0 && (
        <div className="ops-fresh__more">
          <p className="ops-line">{unknownWhy}</p>
          {door}
        </div>
      )}
    </div>
  );
}

/**
 * THE BOTTOM LINE (BLUF): one sentence built by rules (overview/brief.ts),
 * the rules themselves a tap away, and the day's facts under it.
 */
export function BottomLineBox({ sentence, rules, facts, below }: { sentence: string; rules: string[]; facts?: ReactNode; below?: ReactNode }) {
  const [how, setHow] = useState(false);
  return (
    <section className="ops-bluf" aria-label="Bottom line">
      <div className="ops-bluf__top">
        <span className="ops-bluf__lab">Bottom line</span>
        <button type="button" className="ops-bluf__how" aria-expanded={how} onClick={() => setHow((v) => !v)}>
          <Info className="w-4 h-4" aria-hidden /> How this line is written
        </button>
      </div>
      <p className="ops-bluf__say">{sentence}</p>
      {how && (
        <ul className="ops-bluf__rules">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {facts && <div className="ops-bluf__facts">{facts}</div>}
      {below}
    </section>
  );
}
