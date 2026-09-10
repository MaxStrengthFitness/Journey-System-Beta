import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { accentStyle, ACCENT_ICON, type WikiAccent } from "./categories";

/**
 * A WIKI ARTICLE — one page about one thing.
 *
 * Round: Wiki Redesign, Sep 2026.
 *
 * WHY THE OLD DETAIL PANE DID NOT READ AS AN ARTICLE
 * --------------------------------------------------
 * MachineDetail rendered NINE <details> in a column: setup, execution,
 * musculature, contraindications, studio setup, playbook, upkeep, academy
 * link, studio notes. Every one of them was shut or shuttable, so the page a
 * trainer landed on was a stack of closed drawers. That is the shape of a
 * settings screen, and it is why the Catalog "didn't match" the Hub and the
 * client profile, both of which put their content on the page.
 *
 * The split this file draws is between READING and DOING:
 *
 *   WikiSection   knowledge. Always open, a real <h2>, in the flow. You came
 *                 here to read it, so it is read.
 *   WikiFoldable  a tool — upkeep, studio setup, an editor. Collapsed by
 *                 default because it is a thing you occasionally operate, not
 *                 a thing you scan.
 *
 * THE INFOBOX COLUMN
 * ------------------
 * `aside` comes BEFORE `children` in the DOM, so on a narrow screen the
 * anatomy figure and the stat block sit directly under the title — the model
 * is the reason this screen exists and it must not be below the fold. On a
 * wide screen CSS grid moves it to a sticky right-hand column, so it stays on
 * screen while the prose scrolls without anything being position: fixed.
 */

export interface WikiArticleProps {
  /** The category line above the title. Coloured and iconed by `accent`. */
  eyebrow?: string;
  accent?: WikiAccent;
  title: string;
  /** One sentence under the title. The clinical note, or a topic's summary. */
  lede?: string;
  /** Status pills under the lede — flagged, out of service, studio-added. */
  badges?: ReactNode;
  /** The infobox column. Sticky on wide screens, first on narrow ones. */
  aside?: ReactNode;
  children: ReactNode;
}

export function WikiArticle({
  eyebrow,
  accent = "other",
  title,
  lede,
  badges,
  aside,
  children,
}: WikiArticleProps) {
  const Icon = ACCENT_ICON[accent];

  return (
    <article className="wk__article" style={accentStyle(accent)}>
      <header className="wk__article-head">
        {eyebrow && (
          <p className="wk__eyebrow">
            <Icon size={13} aria-hidden />
            {eyebrow}
          </p>
        )}
        {/* Machine and topic names are never truncated anywhere in this app —
            overflow-wrap in the stylesheet, no line-clamp here. */}
        <h1 className="wk__h1">{title}</h1>
        {lede && <p className="wk__lede">{lede}</p>}
        {badges && <div className="wk__badges">{badges}</div>}
      </header>

      <div className={`wk__grid${aside ? "" : " wk__grid--full"}`}>
        {aside && <aside className="wk__aside">{aside}</aside>}
        <div className="wk__body">{children}</div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

export interface WikiSectionProps {
  id?: string;
  title: string;
  icon?: ReactNode;
  /** A short line under the heading, e.g. where the content came from. */
  note?: string;
  children: ReactNode;
}

/**
 * Knowledge, on the page. No disclosure control at all — deliberately not
 * "open by default", because a control that is always open is a control that
 * can be closed by a mis-tap mid-set and then stays closed forever, which is
 * how the old screen taught trainers that Execution was empty.
 */
export function WikiSection({ id, title, icon, note, children }: WikiSectionProps) {
  return (
    <section className="wk__section" id={id}>
      <h2 className="wk__h2">
        {icon}
        {title}
      </h2>
      {note && <p className="wk__section-note">{note}</p>}
      <div className="wk__section-body">{children}</div>
    </section>
  );
}

export interface WikiFoldableProps {
  id: string;
  title: string;
  icon?: ReactNode;
  /** Rendered beside the title — a count, or "3 open". */
  meta?: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}

/**
 * A tool, folded away.
 *
 * Built on <details>/<summary> for the same reasons the old Section was:
 * keyboard support, screen-reader semantics, in-page find and open-by-default
 * all come free, and it still works mid-hydration.
 */
export function WikiFoldable({
  id,
  title,
  icon,
  meta,
  open,
  onToggle,
  children,
}: WikiFoldableProps) {
  return (
    <details
      className="wk__fold"
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        // <details> fires toggle on mount in some engines; only report a real
        // change, or every render writes a preference nobody set.
        if (next !== open) onToggle(next);
      }}
    >
      <summary className="wk__fold-summary" id={`${id}-summary`}>
        {icon}
        <span className="wk__fold-title">{title}</span>
        {meta && <span className="wk__fold-meta">{meta}</span>}
        <ChevronDown className="wk__fold-chev" size={16} aria-hidden />
      </summary>
      <div className="wk__fold-body">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------ *
 * Small article furniture
 * ------------------------------------------------------------------ */

/** A paragraph of body prose at the reading measure. */
export function WikiProse({ children }: { children: ReactNode }) {
  return <p className="wk__prose">{children}</p>;
}

/**
 * A cue list. Cues are short imperative phrases said out loud, so they get
 * their own mark and a wider line height than a normal list — a trainer reads
 * these while watching a client, not while sitting down.
 */
export function WikiCues({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="wk__cues">
      {items.map((c, i) => (
        <li key={`${i}-${c.slice(0, 12)}`}>{c}</li>
      ))}
    </ul>
  );
}

/**
 * A run of content blocks.
 *
 * Deliberately loose about `kind`, because two block vocabularies arrive here
 * and neither should have to convert: the generated Academy corpus emits
 * `heading | subheading | bullet | body`, and a studio's own page emits
 * `heading | bullet | para`. Anything unrecognised renders as prose, which is
 * the safe failure — a paragraph that should have been a heading is readable,
 * a dropped block is not.
 *
 * `renderText` is how glossary auto-linking plugs in without this component
 * knowing what a glossary is. See glossary-links.tsx.
 */
export function WikiBlocks({
  blocks,
  renderText,
}: {
  blocks: { kind: string; text: string }[];
  renderText?: (text: string) => ReactNode;
}) {
  const show = (t: string): ReactNode => (renderText ? renderText(t) : t);

  return (
    <div className="wk__blocks">
      {blocks.map((b, i) => {
        const key = `${i}-${b.kind}`;
        if (b.kind === "heading") {
          return (
            <h3 className="wk__h3" key={key}>
              {b.text}
            </h3>
          );
        }
        if (b.kind === "subheading") {
          return (
            <h4 className="wk__h4" key={key}>
              {b.text}
            </h4>
          );
        }
        if (b.kind === "bullet") {
          return (
            <p className="wk__bullet" key={key}>
              {show(b.text)}
            </p>
          );
        }
        return (
          <p className="wk__prose" key={key}>
            {show(b.text)}
          </p>
        );
      })}
    </div>
  );
}

export type WikiBadgeTone = "neutral" | "live" | "warn" | "alert" | "ok" | "accent";

export function WikiBadge({
  tone = "neutral",
  children,
}: {
  tone?: WikiBadgeTone;
  children: ReactNode;
}) {
  return <span className={`wk__badge wk__badge--${tone}`}>{children}</span>;
}
