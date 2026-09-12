import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { accentStyle, ACCENT_ICON, type WikiAccent } from "./categories";

/**
 * THE INDEX — one browsable page, not a drill-down.
 *
 * Round: Wiki Redesign, Sep 2026.
 *
 * WHAT WAS WRONG WITH THE OLD LANDING
 * -----------------------------------
 * It showed five body-group tiles and nothing else. Tapping one FILTERED the
 * whole screen down to that group and dropped you into a picker; getting back
 * to the full roster meant finding a differently-worded "back" in two
 * different places. So reaching a machine was: read tiles -> pick a group ->
 * read a rail -> pick a machine. Four decisions to look up one seat height.
 *
 * A wiki index does not work that way. It shows the contents AND the entries
 * on the same page: the category cards at the top are a table of contents that
 * SCROLLS to a section, and every machine is already listed below. Nothing
 * filters, nothing is hidden behind a tap, and the trainer who knows exactly
 * which machine they want just scrolls to it.
 *
 * The counts on the cards are of machines THIS STUDIO has, not the global
 * catalog, so a location without a Dip station sees "Upper Body — Push 5",
 * not 6 with one that will dead-end when tapped.
 */

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

export interface WikiStat {
  label: string;
  value: number | string;
  tone?: "warn" | "alert" | "ok";
}

export function WikiIndexHeader({
  lead,
  title,
  subtitle,
  stats,
  children,
}: {
  /**
   * Above the title: a switch between what the index lists — the Catalog's
   * "At this studio | All MSF machines" (Learning + Planner round).
   */
  lead?: ReactNode;
  title: string;
  subtitle?: string;
  /**
   * The numbers worth acting on, and only those. Session counts and "most
   * used this week" deliberately stay off: a number nobody can act on makes
   * the two that ARE actionable harder to see.
   */
  stats?: WikiStat[];
  children?: ReactNode;
}) {
  return (
    <header className="wk__index-head">
      {lead}
      <h1 className="wk__index-title">{title}</h1>
      {subtitle && <p className="wk__index-sub">{subtitle}</p>}
      {stats && stats.length > 0 && (
        <div className="wk__stats">
          {stats.map((s) => (
            <div
              className={`wk__stat${s.tone ? ` wk__stat--${s.tone}` : ""}`}
              key={s.label}
            >
              <span className="wk__stat-value">{s.value}</span>
              <span className="wk__stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      )}
      {children}
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * Contents
 * ------------------------------------------------------------------ */

export interface WikiContentsCard {
  key: string;
  label: string;
  accent: WikiAccent;
  count: number;
  /**
   * The count line, spelled out by the caller: "22 machines", "13 modules".
   *
   * A prop rather than a hardcoded noun, because this component serves two
   * wikis. The first cut said "machine" unconditionally, which is right on the
   * Catalog and reads as "13 machines" under the Academy's Curriculum.
   */
  countLabel?: string;
  /** "2 due", "1 flagged". Rendered as pills under the count. */
  notes?: { label: string; tone: "warn" | "alert" }[];
  /** The element id this card scrolls to. */
  target: string;
}

/**
 * The table of contents.
 *
 * These SCROLL, they do not filter. That is the whole difference between this
 * and the tiles it replaces: the destination is already on the page, so
 * there is no state to get out of and no second back button to invent.
 *
 * `scrollIntoView` rather than a hash link: the scroller is `.wk__scroll`,
 * not the document, so a `#id` href would move the wrong box (and on iOS
 * would also push a history entry that the bottom nav's back gesture then
 * unwinds one section at a time).
 */
export function WikiContents({
  cards,
  label = "Browse",
}: {
  cards: WikiContentsCard[];
  label?: string;
}) {
  if (cards.length === 0) return null;

  return (
    <nav className="wk__contents" aria-label={label}>
      <p className="wk__contents-label">{label}</p>
      <div className="wk__contents-grid">
        {cards.map((c) => {
          const Icon = ACCENT_ICON[c.accent];
          return (
            <button
              key={c.key}
              type="button"
              className="wk__cat"
              style={accentStyle(c.accent)}
              onClick={() => {
                const el = document.getElementById(c.target);
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <span className="wk__cat-icon">
                <Icon size={18} aria-hidden />
              </span>
              <span className="wk__cat-label">{c.label}</span>
              <span className="wk__cat-count">
                {c.countLabel ?? `${c.count} item${c.count === 1 ? "" : "s"}`}
              </span>
              {c.notes && c.notes.length > 0 && (
                <span className="wk__cat-notes">
                  {c.notes.map((n) => (
                    <span
                      className={`wk__badge wk__badge--${n.tone}`}
                      key={n.label}
                    >
                      {n.label}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ *
 * Entries
 * ------------------------------------------------------------------ */

export function WikiGroup({
  id,
  label,
  accent,
  count,
  note,
  children,
}: {
  id: string;
  label: string;
  accent: WikiAccent;
  count: number;
  /**
   * One line under the header, before the rows. A node rather than a string
   * so it can carry a link — the Academy uses it to point newcomers at the
   * Executive Summary, which the curriculum's own numbering buries at 13.
   */
  note?: ReactNode;
  children: ReactNode;
}) {
  const Icon = ACCENT_ICON[accent];
  return (
    <section className="wk__group" id={id} style={accentStyle(accent)}>
      <h2 className="wk__group-head">
        <Icon size={15} aria-hidden />
        <span className="wk__group-label">{label}</span>
        <span className="wk__group-count">{count}</span>
      </h2>
      {note && <p className="wk__group-note">{note}</p>}
      <div className="wk__group-body">{children}</div>
    </section>
  );
}

export interface WikiRowProps {
  title: string;
  /** The line under the title — pattern, region, reading time. */
  meta?: string;
  /**
   * The entry's catalog code, shown as a chip before the title: the Academy's
   * own abbreviation for a machine ("CP", "LP", "Pd"). Trainers already say
   * these on the floor — the Academy writes routines as "ADD, SD, CR, TR" —
   * so a code beside every name is what makes the list read like a system
   * catalog rather than a menu. Optional: an entry without one lines up by
   * the title as before.
   */
  code?: string | null;
  /**
   * A third column on a wide screen only (1024px and up): the primary
   * muscles, say. Hidden below that, where the row has no room for it and
   * the article is one tap away.
   */
  detail?: string;
  badges?: ReactNode;
  onClick: () => void;
  /** Highlights the row a split-layout reader is currently on. */
  current?: boolean;
}

export function WikiRow({ title, meta, code, detail, badges, onClick, current }: WikiRowProps) {
  return (
    <button
      type="button"
      className="wk__row"
      aria-current={current ? "true" : undefined}
      onClick={onClick}
    >
      {code && (
        <span className="wk__row-code" aria-hidden>
          {code}
        </span>
      )}
      <span className="wk__row-main">
        <span className="wk__row-title">{title}</span>
        {meta && <span className="wk__row-meta">{meta}</span>}
      </span>
      {badges && <span className="wk__row-badges">{badges}</span>}
      {/* After the badges, so on a wide screen the detail is a true column:
          same edge on every row, whatever badges a row happens to carry. */}
      {detail && <span className="wk__row-detail">{detail}</span>}
      <ChevronRight size={16} className="wk__row-chev" aria-hidden />
    </button>
  );
}
