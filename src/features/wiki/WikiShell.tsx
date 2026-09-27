import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import {
  UnsavedChangesScope,
  useLeaveScope,
  type LeaveScope,
} from "../unsaved-changes";
import { forgetOnSignOut } from "../sign-out/memory";
import { WikiPageGuardContext } from "./page-guard";
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
 *
 * TYPING ON A PAGE (voice review follow-up, Sep 27 2026)
 * ------------------------------------------------------
 * A page is plain state, so the trail swapped it without asking and a half-
 * written studio note went with it. The page is now a leave scope
 * (features/unsaved-changes): the back arrow, the crumbs, the section's own
 * root and a search that replaces the page all ask first when something on
 * the page holds unsaved typing, and links inside the page ask through
 * `useWikiPageGuard` (./page-guard). The masthead's search does not ask: it
 * hides the page rather than unmounting it.
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
  /**
   * Names the page for its scroll position when two pages share a trail —
   * the Catalog's floor index and All MSF machines are both "Catalog".
   */
  scrollKey?: string;
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
  crumbs: rawCrumbs,
  scrollKey,
  onOpenSearch: rawOpenSearch,
  searchLabel = "Search",
  actions,
  children,
  className,
}: WikiShellProps) {
  // The page is a leave scope: every way off it that the shell draws asks
  // about the typing on it first (see the header).
  const page = useLeaveScope();
  const crumbs = useMemo(
    () =>
      rawCrumbs.map((c) => {
        const go = c.onClick;
        return go ? { ...c, onClick: () => page.guard(go) } : c;
      }),
    [rawCrumbs, page],
  );
  const onOpenSearch = rawOpenSearch ? () => page.guard(rawOpenSearch) : undefined;
  const up = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  // Inside the Learning tab the bar also carries the Catalog | Academy switch
  // — see ./sections. Outside it, `sections` is null and nothing below changes.
  const sections = useWikiSections();
  const sectionLabel = activeSectionLabel(sections);
  const sectionRoot = sectionLabel
    ? crumbs.find((c) => c.label === sectionLabel)
    : undefined;
  const hideTrail = trailRepeatsSection(crumbs, sections);
  const pageKey = scrollKey ?? crumbs.map((c) => c.label).join(" / ");
  // A top-level page — an index, a front page — keeps its place when the
  // reader comes back up to it; an article always opens at its top.
  const keepsPlace = crumbs.length <= 1;

  if (sections?.title) {
    return (
      <MastheadShell
        sections={sections}
        crumbs={crumbs}
        up={up}
        sectionRoot={sectionRoot}
        hideTrail={hideTrail}
        pageKey={pageKey}
        keepsPlace={keepsPlace}
        page={page}
        // The Learning tab's own search hides the page and never unmounts
        // it, so only a page's own search screen asks.
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

        {/* On a Learning section's index the trail would only repeat the
            switch, so an empty spacer holds its place and keeps search on
            the right. The trail itself is <Trail> below. */}
        {hideTrail ? (
          <div className="wk__crumbs" aria-hidden />
        ) : (
          <Trail crumbs={crumbs} />
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

      <PageScroller pageKey={pageKey} keepsPlace={keepsPlace} page={page}>
        {children}
      </PageScroller>
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
  pageKey,
  keepsPlace,
  page,
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
  pageKey: string;
  keepsPlace: boolean;
  page: LeaveScope;
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

        {/* Tapping the section you are in goes to its root: the section's
            crumb, or the page's first one (All MSF machines). On the root
            itself it does nothing — it used to fall back to the front page. */}
        <WikiSectionSwitch
          value={sections}
          onActiveTap={sectionRoot?.onClick ?? crumbs[0]?.onClick}
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
            <Trail crumbs={crumbs} />
          )}
          {actions && <div className="wk__bar-actions">{actions}</div>}
        </div>
      )}

      <PageScroller pageKey={pageKey} keepsPlace={keepsPlace} page={page}>
        {children}
      </PageScroller>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The trail
 * ------------------------------------------------------------------ */

/**
 * The breadcrumb, in both layouts.
 *
 * An <ol> rather than a row of buttons: the trail is an ordered structure and
 * screen readers announce it as one. It scrolls sideways rather than wrapping
 * so the bar stays one row, and a trail that outgrows the bar is scrolled to
 * its END whenever it changes, so the page you are on (the last crumb, a
 * machine's or a page's whole name) is the part in view. Nothing did that
 * until the voice review follow-up (Sep 27 2026): a long trail showed its
 * start and cut the current name at the edge.
 */
function Trail({ crumbs }: { crumbs: WikiCrumb[] }) {
  const ref = useRef<HTMLElement>(null);
  const trail = crumbs.map((c) => c.label).join(" / ");
  useLayoutEffect(() => {
    const nav = ref.current;
    if (nav) nav.scrollLeft = nav.scrollWidth;
  }, [trail]);
  return (
    <nav className="wk__crumbs" aria-label="Breadcrumb" ref={ref}>
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`}>
              {i > 0 && <ChevronRight size={13} className="wk__crumb-sep" aria-hidden />}
              {c.onClick && !last ? (
                <button type="button" className="wk__crumb" onClick={c.onClick}>
                  {c.label}
                </button>
              ) : (
                <span className="wk__crumb wk__crumb--here" aria-current={last ? "page" : undefined}>
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
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
function PageScroller({
  pageKey,
  keepsPlace,
  page,
  children,
}: {
  pageKey: string;
  keepsPlace: boolean;
  page: LeaveScope;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const keyRef = useRef(pageKey);
  useLayoutEffect(() => {
    keyRef.current = pageKey;
    if (ref.current) ref.current.scrollTop = keepsPlace ? placeOf.get(pageKey) ?? 0 : 0;
    // keepsPlace belongs to the page, which pageKey already names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);
  return (
    <div
      className="wk__scroll"
      ref={ref}
      onScroll={(e) => placeOf.set(keyRef.current, e.currentTarget.scrollTop)}
    >
      <UnsavedChangesScope scope={page}>
        <WikiPageGuardContext.Provider value={page.guard}>{children}</WikiPageGuardContext.Provider>
      </UnsavedChangesScope>
    </div>
  );
}

/**
 * Where the reader left each page, for the session (review, Learning +
 * Planner round): coming back up to a long index used to land at its top.
 * Only top-level pages read it back.
 *
 * Forgotten at sign-out (voice review follow-up, Sep 27 2026): a sign-out
 * remounts the tree but keeps this module, so the next person on a shared
 * iPad landed where the last one had been reading.
 */
const placeOf = new Map<string, number>();
forgetOnSignOut(() => placeOf.clear());

/** For tests: how many pages have a remembered place. */
export function rememberedPlaces(): number {
  return placeOf.size;
}
