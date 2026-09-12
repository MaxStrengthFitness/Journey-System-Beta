import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import {
  WikiSectionSwitch,
  activeSectionLabel,
  trailRepeatsSection,
  useWikiSections,
} from "./sections";

/**
 * THE WIKI SHELL — the chrome every Catalog and Academy screen sits inside.
 *
 * Round: Wiki Redesign, Sep 2026.
 *
 * WHAT IT REPLACES, AND WHY
 * -------------------------
 * The old Catalog had five modes — landing, group filter, picker, detail,
 * Academy takeover — and THREE different ways back: a "All body groups"
 * button in the rail, a "Body groups" button in the sheet header, and the
 * Academy's own `onBack`. None of them told you where you were, so the screen
 * read as disorganised even when every individual pane was fine.
 *
 * A wiki has exactly one answer to "where am I": the breadcrumb. One trail,
 * one back affordance, in the same place on every screen. That is most of
 * what makes a reference site feel navigable rather than modal.
 *
 * THE KEYBOARD
 * ------------
 * Search is a BUTTON here, never an input. The old stack layout opened a
 * bottom sheet with `autoFocusSearch`, so choosing a body group summoned the
 * keyboard as a side effect — on a portrait iPad that is a sheet over the
 * content with half the remaining screen eaten by a keyboard nobody asked
 * for. Tapping this button opens a full-screen search where focusing the
 * field IS the point (see WikiSearch). Intent first, keyboard second.
 *
 * ONE SCROLLER
 * ------------
 * `.wk__scroll` is the only element in the tree that overflows. Same rule as
 * features/studio-tasks: AppContent's <main> already bounds the view and the
 * bottom nav is a sibling after it, so there is no viewport maths here and no
 * padding to clear a bar that is not overlapping anything. Nested scrollers
 * are what buried Clinical Warnings in a half-screen box last round.
 */

export interface WikiCrumb {
  label: string;
  /** Omitted on the last crumb — you are already there. */
  onClick?: () => void;
}

export interface WikiShellProps {
  /**
   * The trail, root first. `[{ label: "Catalog", onClick }]` on an index;
   * `[{ Catalog }, { Upper Body — Push }, { Chest Press }]` on an article.
   * The back arrow goes to the second-to-last crumb, so it always means "up
   * one level" rather than "wherever you came from" — a wiki's back is
   * structural, and browser-style history here would send a trainer who
   * arrived from a search result back into the search overlay.
   */
  crumbs: WikiCrumb[];
  /** Opens the search overlay. Omit to hide the button entirely. */
  onOpenSearch?: () => void;
  searchLabel?: string;
  /** Rendered at the right of the bar, before search. Admin edit actions. */
  actions?: ReactNode;
  children: ReactNode;
  /** Extra class on the root, e.g. `wk--academy`. */
  className?: string;
}

export function WikiShell({
  crumbs,
  onOpenSearch,
  searchLabel = "Search",
  actions,
  children,
  className,
}: WikiShellProps) {
  const up = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  // Inside the Learning tab the bar also carries the Catalog | Academy switch
  // — see ./sections. Outside it, `sections` is null and nothing below changes.
  const sections = useWikiSections();
  const sectionLabel = activeSectionLabel(sections);
  const sectionRoot = sectionLabel
    ? crumbs.find((c) => c.label === sectionLabel)
    : undefined;
  const hideTrail = trailRepeatsSection(crumbs, sections);

  if (sections?.title) {
    return (
      <MastheadShell
        sections={sections}
        crumbs={crumbs}
        up={up}
        sectionRoot={sectionRoot}
        hideTrail={hideTrail}
        onOpenSearch={sections.onSearch ?? onOpenSearch}
        searchLabel={sections.searchLabel ?? searchLabel}
        actions={actions}
        className={className}
      >
        {children}
      </MastheadShell>
    );
  }

  return (
    <div className={`wk${className ? ` ${className}` : ""}`}>
      <header className="wk__bar">
        {up?.onClick && (
          <button
            type="button"
            className="wk__up"
            onClick={up.onClick}
            aria-label={`Back to ${up.label}`}
          >
            <ArrowLeft size={16} aria-hidden />
          </button>
        )}

        {sections && (
          <WikiSectionSwitch
            value={sections}
            onActiveTap={sectionRoot?.onClick}
          />
        )}

        {/* An <ol> rather than a row of buttons: the trail is an ordered
            structure and screen readers announce it as one. On a Learning
            section's index the trail would only repeat the switch, so an empty
            spacer holds its place and keeps search on the right. */}
        {hideTrail ? (
          <div className="wk__crumbs" aria-hidden />
        ) : (
          <nav className="wk__crumbs" aria-label="Breadcrumb">
            <ol>
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={`${c.label}-${i}`}>
                    {i > 0 && (
                      <ChevronRight
                        size={13}
                        className="wk__crumb-sep"
                        aria-hidden
                      />
                    )}
                    {c.onClick && !last ? (
                      <button
                        type="button"
                        className="wk__crumb"
                        onClick={c.onClick}
                      >
                        {c.label}
                      </button>
                    ) : (
                      <span
                        className="wk__crumb wk__crumb--here"
                        aria-current={last ? "page" : undefined}
                      >
                        {c.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        <div className="wk__bar-actions">
          {actions}
          {onOpenSearch && (
            <button
              type="button"
              className="wk__searchbtn"
              onClick={onOpenSearch}
              aria-label={searchLabel}
            >
              <Search size={15} aria-hidden />
              <span className="wk__searchbtn-label">{searchLabel}</span>
            </button>
          )}
        </div>
      </header>

      <PageScroller pageKey={crumbs.map((c) => c.label).join(" / ")}>{children}</PageScroller>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The masthead layout (Learning + Planner round, Sep 11 2026)
 * ------------------------------------------------------------------ */

/**
 * Two rows instead of one.
 *
 * Row one is the same on every page of the tab: the title (tap it for the
 * front page), the sections, and one search. Row two is where you are and
 * what you can do here — the trail and the page's actions — and it only
 * exists when there is something to put in it, so a section's front page
 * has one quiet bar rather than two.
 *
 * Why not one row: the old bar carried a back arrow, the section switch, the
 * breadcrumb, the page actions and search. On a portrait iPad the breadcrumb
 * was what gave way, so the one thing that says where you are was the first
 * thing to scroll out of sight.
 */
function MastheadShell({
  sections,
  crumbs,
  up,
  sectionRoot,
  hideTrail,
  onOpenSearch,
  searchLabel,
  actions,
  className,
  children,
}: {
  sections: NonNullable<ReturnType<typeof useWikiSections>>;
  crumbs: WikiCrumb[];
  up: WikiCrumb | null;
  sectionRoot: WikiCrumb | undefined;
  hideTrail: boolean;
  onOpenSearch?: () => void;
  searchLabel: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const showSub = !hideTrail || Boolean(actions);

  return (
    <div className={`wk wk--mast${className ? ` ${className}` : ""}`}>
      <header className="wk__mast">
        <button
          type="button"
          className="wk__mast-home"
          onClick={sections.onHome}
          aria-label={`${sections.title} — front page`}
        >
          {sections.titleIcon}
          <span className="wk__mast-title">{sections.title}</span>
        </button>

        <WikiSectionSwitch
          value={sections}
          onActiveTap={sectionRoot?.onClick ?? sections.onHome}
        />

        {onOpenSearch && (
          <button
            type="button"
            className="wk__mast-search"
            onClick={onOpenSearch}
            aria-label={searchLabel}
          >
            <Search size={15} aria-hidden />
            <span className="wk__mast-search-label">{searchLabel}</span>
          </button>
        )}
      </header>

      {showSub && (
        <div className="wk__bar wk__bar--sub">
          {!hideTrail && up?.onClick && (
            <button
              type="button"
              className="wk__up"
              onClick={up.onClick}
              aria-label={`Back to ${up.label}`}
            >
              <ArrowLeft size={16} aria-hidden />
            </button>
          )}
          {hideTrail ? (
            <div className="wk__crumbs" aria-hidden />
          ) : (
            <nav className="wk__crumbs" aria-label="Breadcrumb">
              <ol>
                {crumbs.map((c, i) => {
                  const last = i === crumbs.length - 1;
                  return (
                    <li key={`${c.label}-${i}`}>
                      {i > 0 && (
                        <ChevronRight size={13} className="wk__crumb-sep" aria-hidden />
                      )}
                      {c.onClick && !last ? (
                        <button type="button" className="wk__crumb" onClick={c.onClick}>
                          {c.label}
                        </button>
                      ) : (
                        <span
                          className="wk__crumb wk__crumb--here"
                          aria-current={last ? "page" : undefined}
                        >
                          {c.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
          {actions && <div className="wk__bar-actions">{actions}</div>}
        </div>
      )}

      <PageScroller pageKey={crumbs.map((c) => c.label).join(" / ")}>{children}</PageScroller>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The one scroller
 * ------------------------------------------------------------------ */

/**
 * `.wk__scroll`, which starts every new page at its top.
 *
 * Learning + Planner round, Sep 2026. Every screen in both wikis returns a
 * WikiShell at the same place in the tree, so React kept the same scroller
 * element from page to page — and its scroll position with it. Opening a
 * machine from low on the index landed halfway down the article, below its
 * title and warnings. A different trail is a different page, so the scroller
 * goes back to the top; the same trail re-rendering (new data, a grouping
 * change, search closing) leaves it where the reader put it.
 */
function PageScroller({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [pageKey]);
  return (
    <div className="wk__scroll" ref={ref}>
      {children}
    </div>
  );
}
