import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { accentStyle, ACCENT_ICON, type WikiAccent } from "./categories";

/**
 * CROSS-LINKS — the thing that makes a wiki feel deep rather than filed.
 *
 * Round: Wiki Redesign, Sep 2026.
 *
 * A reference site earns its reputation on the sentence "and that took me
 * somewhere else useful". Before this round the Catalog had exactly one
 * outbound link on a machine page — the Academy card — and the Academy had
 * none coming back. Everything else was a dead end: you read about the
 * Compound Row and the only move available was the back button.
 *
 * Three shapes, because there are three kinds of "related":
 *
 *   WikiLinkCard   a substantial destination worth a sentence of its own —
 *                  the Academy quick card, the spoken script, the deep dive.
 *   WikiChips      lateral moves inside the same collection — the other four
 *                  machines in this movement pattern.
 *   WikiSeeAlso    the wrapper that gives a run of them a heading, so they
 *                  read as a section of the article rather than loose buttons.
 */

export function WikiSeeAlso({
  title = "See also",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="wk__seealso">
      <h2 className="wk__h2 wk__h2--quiet">{title}</h2>
      {children}
    </section>
  );
}

export interface WikiLinkCardProps {
  icon?: ReactNode;
  title: string;
  /** Why you would tap it. One line, concrete — not "learn more". */
  detail?: string;
  onClick: () => void;
  accent?: WikiAccent;
}

export function WikiLinkCard({
  icon,
  title,
  detail,
  onClick,
  accent,
}: WikiLinkCardProps) {
  return (
    <button
      type="button"
      className="wk__linkcard"
      style={accent ? accentStyle(accent) : undefined}
      onClick={onClick}
    >
      {icon && <span className="wk__linkcard-icon">{icon}</span>}
      <span className="wk__linkcard-main">
        <span className="wk__linkcard-title">{title}</span>
        {detail && <span className="wk__linkcard-detail">{detail}</span>}
      </span>
      <ArrowRight size={16} className="wk__linkcard-go" aria-hidden />
    </button>
  );
}

export interface WikiChip {
  id: string;
  label: string;
  accent?: WikiAccent;
}

/**
 * Lateral links.
 *
 * Full labels, never truncated — the app's standing rule for machine names,
 * and the reason these wrap onto multiple lines instead of scrolling
 * horizontally. A horizontal chip rail hides its own contents, which for a
 * "related machines" row means the related machine you needed is the one off
 * the right edge.
 */
export function WikiChips({
  items,
  onPick,
}: {
  items: WikiChip[];
  onPick: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="wk__chips">
      {items.map((c) => {
        const accent = c.accent ?? "other";
        const Icon = ACCENT_ICON[accent];
        return (
          <button
            key={c.id}
            type="button"
            className="wk__chip"
            style={accentStyle(accent)}
            onClick={() => onPick(c.id)}
          >
            <Icon size={13} aria-hidden />
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
