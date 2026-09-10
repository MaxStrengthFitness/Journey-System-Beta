import type { ReactNode } from "react";

/**
 * THE INFOBOX — the boxed summary beside a wiki article.
 *
 * Round: Wiki Redesign, Sep 2026.
 *
 * This is the single most recognisable piece of a good reference wiki: the
 * facts that identify the subject, in a fixed order, in the same box on every
 * page, so you learn where to look once and then never read the page to find
 * them again. On a machine page that is the figure, the four specs, the
 * musculature and the current status.
 *
 * WHY THE FIGURE LIVES IN HERE
 * ----------------------------
 * The old layout gave the anatomy model its own column in split mode and
 * condensed it to a 72px bar in stack mode — so on a portrait iPad, which is
 * the device this is used on, the thing the screen exists for became a strip.
 * Putting it at the top of the infobox means it is full size in BOTH layouts:
 * first block under the title on narrow, sticky beside the prose on wide.
 *
 * The box takes its accent from the article via --wk-accent, which
 * WikiArticle sets on the <article>. Nothing here picks a colour.
 */

export interface InfoboxProps {
  /** The heading strip. "At a glance" on machines. */
  title: string;
  /** The anatomy figure, or any visual that identifies the subject. */
  figure?: ReactNode;
  /** Status pills across the bottom — flagged, upkeep due, out of service. */
  footer?: ReactNode;
  children: ReactNode;
}

export function Infobox({ title, figure, footer, children }: InfoboxProps) {
  return (
    <div className="wk__infobox">
      <p className="wk__infobox-head">{title}</p>
      {figure && <div className="wk__infobox-figure">{figure}</div>}
      <div className="wk__infobox-body">{children}</div>
      {footer && <div className="wk__infobox-foot">{footer}</div>}
    </div>
  );
}

export function InfoboxGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="wk__infobox-group">
      <p className="wk__infobox-label">{label}</p>
      {children}
    </div>
  );
}

/**
 * One fact. A <dl> row rather than a flex div: label/value pairs are what a
 * description list is for, and VoiceOver reads "Posture, Seated" as a pair
 * instead of two loose strings.
 */
export function InfoboxRows({
  rows,
}: {
  rows: { label: string; value: string; icon?: ReactNode }[];
}) {
  return (
    <dl className="wk__facts">
      {rows.map((r) => (
        <div className="wk__fact" key={r.label}>
          <dt>
            {r.icon}
            {r.label}
          </dt>
          {/* Em dash, never blank: an empty value reads as a rendering bug,
              and "we don't have this recorded" is itself information. */}
          <dd>{r.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Muscles, primary above synergist.
 *
 * Kept as text beside the figure rather than left to the figure alone,
 * because the diagram cannot say "Gluteus Medius (hip horizontal abduction)".
 * The two must agree — see catalog/anatomy.ts for the round where they
 * didn't — so both read the same resolved anatomy.
 */
export function InfoboxMuscles({
  primary,
  synergists,
}: {
  primary: string[];
  synergists: string[];
}) {
  if (primary.length === 0 && synergists.length === 0) return null;
  return (
    <div className="wk__muscles">
      {primary.map((m) => (
        <span className="wk__muscle wk__muscle--primary" key={`p-${m}`}>
          <span className="wk__muscle-dot" aria-hidden />
          {m}
        </span>
      ))}
      {synergists.map((m) => (
        <span className="wk__muscle wk__muscle--synergist" key={`s-${m}`}>
          <span className="wk__muscle-dot" aria-hidden />
          {m}
        </span>
      ))}
    </div>
  );
}
