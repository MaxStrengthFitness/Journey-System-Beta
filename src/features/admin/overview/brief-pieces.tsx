/**
 * THE BRIEF'S PIECES — a section, the counts line, the page's one note and
 * the "All clear" line. Every Operations page is built from these.
 *
 * The redesign's Operations room, phase 2 (Sep 28 2026). Today's panels were
 * eight equal boxes that folded; the brief is one column of sections in a
 * fixed order, each a heading, a count, a door, and its rows (overview/
 * pieces.tsx's ActionRows: the name opens the client, the buttons act,
 * nothing nested inside a button).
 *
 * The calm round (Oct 3 2026, AJ: "there's just so many words on there. It's
 * really overwhelming"; "i trust all your recommended"). Today was 1,430
 * words. The rules every page now keeps:
 *
 *   - the written bottom line is one line of counts (CountsLine), its rules
 *     behind an (i);
 *   - a section heading is its name and its count, no caption under it;
 *   - a section with nothing in it folds into ONE line, "All clear: ..."
 *     (AllClear), and only when every read behind it answered;
 *   - what the page can't judge yet is said once, at the top (PageNote),
 *     never again in each section;
 *   - a row is one line; how to clear it and where it came from open on a
 *     tap (ActionRows' Why).
 */
import { useState, type ReactNode } from "react";
import { Check, CircleDashed, Info } from "lucide-react";
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
  /** A short fact beside the count, never a caption explaining the section (the calm round). */
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

/** A section still reading, or that couldn't be read, says so in one short line. An empty one folds into AllClear instead. */
export function BriefEmpty({ children }: { children: ReactNode }) {
  return <p className="ops-sec__empty">{children}</p>;
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

/* ------------------------------------------------------------------ *
 * The calm round's pieces (Oct 3 2026)
 * ------------------------------------------------------------------ */

export interface Count {
  /** Null while it can't be counted: drawn as a dash, never a zero. */
  n: number | null;
  label: string;
}

/**
 * THE COUNTS LINE: what a written bottom line used to say, as numbers. The
 * rules behind them are an (i) away; while the page reads, one short line.
 */
export function CountsLine({ items, pending, rules, children }: { items: Count[]; pending?: string | null; rules?: string[]; children?: ReactNode }) {
  const [how, setHow] = useState(false);
  return (
    <div className="ops-counts" role="group" aria-label="Counts">
      <p className="ops-counts__line">
        {pending ? (
          <span className="ops-counts__pending">{pending}</span>
        ) : (
          items.map((c) => (
            <span key={c.label} className="ops-counts__item">
              <b>{c.n === null ? "—" : c.n}</b> {c.label}
            </span>
          ))
        )}
        {rules && rules.length > 0 && (
          <button type="button" className="ops-info" aria-expanded={how} aria-label="How these are counted" onClick={() => setHow((v) => !v)}>
            <Info className="w-4 h-4" aria-hidden />
          </button>
        )}
        {children}
      </p>
      {how && rules && (
        <ul className="ops-counts__rules">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * THE PAGE'S ONE NOTE: what the page can't judge yet (the nightly record, a
 * week read in part), said once at the top. Why opens what it means and who.
 */
export function PageNote({ text, why, door }: { text: string; why?: ReactNode; door?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ops-note" role="note">
      <p className="ops-note__line">
        <CircleDashed className="w-4 h-4" aria-hidden />
        <span>{text}</span>
        {why && (
          <button type="button" className="ops-note__why" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            Why
          </button>
        )}
      </p>
      {open && why && (
        <div className="ops-note__more">
          <p className="ops-line">{why}</p>
          {door}
        </div>
      )}
    </div>
  );
}

/** Every section with nothing in it, in one line at the foot of the page. Nothing when there are none. */
export function AllClear({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <p className="ops-clear" data-testid="all-clear">
      <Check className="w-4 h-4" aria-hidden />
      <span>
        <b>All clear:</b> {names.join(" · ")}
      </span>
    </p>
  );
}
