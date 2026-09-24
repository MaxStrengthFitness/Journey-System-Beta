/**
 * THE NOTES CATALOG — the threads on the Notes page.
 *
 * Client codex, Sep 2026 (it was the Notes area's catalog since the notes
 * catalog round). Top to bottom:
 *
 *   FILTERS    one row: a search across every note, its updates and who
 *              wrote them ("or a coach's name"); "All" and the six categories,
 *              always all six in the same place with their counts (a segment
 *              is found by position on an iPad), resolved notes counted too;
 *              and a door, "Life · in FORD", to where a client's life is kept.
 *              No counts while the notes load, or when they could not be read
 *              — unknown is not 0.
 *   OPEN       full thread cards, loudest first — the briefing's order —
 *              in two columns when the page is wide enough; a critical note
 *              takes the whole width. Each card says where it stands with
 *              YOUR briefing.
 *   STANDING   one line each, opened in place with a tap. Never cut short.
 *   RESOLVED   folded to its count, with "Show the N resolved notes", then
 *              month by month — chronology is how last winter's thread is
 *              found.
 *
 * A CRITICAL NOTE IS DRAWN ONCE, in Open. "Critical & pinned" used to repeat
 * it at the top, so it was never filtered away; now, when a chip or a search
 * hides one, the critical line says so above the zones and "Show it" brings
 * it back — the same guarantee, drawn once.
 *
 * The zones are derived, never set (`zoneOf`, threads.ts). Everything here is
 * in memory over the tab's one journal load: a chip, a search or a fold
 * costs no read. It is handed `notesOnRecord().listed` — the To-file tray,
 * the five profile fields shown elsewhere and archived threads are already
 * out.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import type { Machine } from "../../types";
import type { JournalEntry } from "../../types/journal";
import type { JournalAuthor } from "../../hooks/useClientJournal";
import type { HistoryCoverage } from "../../lib/prior-history";
import { LoadingArea } from "../../components/LoadingMark";
import { EMPTY_FILTER, NOTES_PAGE_CATEGORIES, buildCatalog, type CatalogFilter, type NoteCategory } from "./note-catalog";
import { THREAD_ZONE_META, zoneOf, type NoteThread } from "./threads";
import type { NoteDismissals } from "./dismissals";
import { briefingStatusOf, hiddenCriticalThreads } from "./record-selectors";
import { NoteCategoryIcon } from "./NoteCategoryChips";
import { NoteThreadCard } from "./NoteThreadCard";
import { ThreadRow } from "./ThreadRow";
import { CriticalLine } from "./CriticalLine";
import type { CatalogIntent } from "./notes-intent";
import "./notes-page.css";

export interface NotesCatalogProps {
  /** The threads the page lists: `notesOnRecord(...).listed`. */
  threads: readonly NoteThread[];
  machines: Machine[];
  /** Who is writing. Null makes every thread read-only. */
  author: JournalAuthor | null;
  /** The studio's day (yyyy-mm-dd). */
  today: string;
  /** The journal's `criticalEntries` — the briefing's own selection. */
  criticalEntries: readonly JournalEntry[];
  /** The journal's `headsUpEntries`. */
  headsUpEntries: readonly JournalEntry[];
  /** This trainer's dismissals; null until they are read (then no hush is offered). */
  dismissals: NoteDismissals | null;
  headsUpWindowDays: number;
  onHush?: (thread: NoteThread) => void;
  onRestore?: (thread: NoteThread) => void;
  /** How many things FORD holds (`fordDoorCount`); null when unknown or not this reader's to know. */
  fordDoorCount: number | null;
  /** The door to FORD. Left out, there is no door. */
  onOpenFord?: () => void;
  /** The notes have not answered yet. */
  isLoading: boolean;
  /** Some of the notes could not be read. */
  readFailed: boolean;
  /** Notes waiting in the To-file tray, above this. */
  unfiledCount: number;
  /** How much of the client's story Journey holds. */
  coverage: HistoryCoverage;
  /** A thread or the Resolved zone to open, with a key that is new per request. */
  intent?: { key: unknown; request: CatalogIntent } | null;
  /** Called once a request has been acted on (or found nothing to open). */
  onIntentHandled?: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function NotesCatalog({
  threads,
  machines,
  author,
  today,
  criticalEntries,
  headsUpEntries,
  dismissals,
  headsUpWindowDays,
  onHush,
  onRestore,
  fordDoorCount,
  onOpenFord,
  isLoading,
  readFailed,
  unfiledCount,
  coverage,
  intent = null,
  onIntentHandled,
}: NotesCatalogProps) {
  const [filter, setFilter] = useState<CatalogFilter>(EMPTY_FILTER);
  // One standing or resolved row open at a time.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // An element to bring into view after the render that draws it.
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const catalog = useMemo(() => buildCatalog(threads, filter, today), [threads, filter, today]);
  const [open, standing, resolved] = catalog.zones;
  const keptIds = useMemo(
    () => new Set(catalog.zones.flatMap((z) => z.items.map((t) => t.id))),
    [catalog],
  );
  const criticalIds = useMemo(() => new Set(criticalEntries.map((e) => e.id)), [criticalEntries]);
  const headsUpIds = useMemo(() => new Set(headsUpEntries.map((e) => e.id)), [headsUpEntries]);

  const filtered = !!filter.category || !!filter.search.trim();
  const hidden = useMemo(
    () => (filtered ? hiddenCriticalThreads(threads, keptIds, criticalIds) : []),
    [filtered, threads, keptIds, criticalIds],
  );
  const hiddenEntries = useMemo(() => {
    const ids = new Set(hidden.map((t) => t.id));
    return criticalEntries.filter((e) => ids.has(e.id));
  }, [hidden, criticalEntries]);

  const clear = () => setFilter((f) => ({ ...EMPTY_FILTER, showResolved: f.showResolved }));
  const pick = (id: NoteCategory | null) =>
    setFilter((f) => ({ ...f, category: id === null || f.category === id ? null : id }));
  const setShowResolved = (showResolved: boolean) => setFilter((f) => ({ ...f, showResolved }));

  /* ---------------------------- one-shot intents ---------------------------- */

  const handled = useRef<unknown>(undefined);
  useEffect(() => {
    if (!intent || handled.current === intent.key) return;
    // Wait for the notes: a thread asked for before they arrive is not "missing".
    if (isLoading) return;
    handled.current = intent.key;
    const req = intent.request;
    if (req.kind === "resolved") {
      setShowResolved(true);
      setScrollTo("notes-resolved");
      onIntentHandled?.();
      return;
    }
    const thread = threads.find((t) => t.id === req.threadId);
    if (!thread) {
      // Not listed here (a settled life note, or gone): nothing to open.
      onIntentHandled?.();
      return;
    }
    const zone = zoneOf(thread, today);
    if (!keptIds.has(thread.id)) setFilter((f) => ({ ...EMPTY_FILTER, showResolved: f.showResolved }));
    if (zone === "resolved") setShowResolved(true);
    if (zone !== "open") setExpandedId(thread.id);
    setScrollTo(`thread-${thread.id}`);
    onIntentHandled?.();
    // keptIds is read at the moment the request is handled; `handled` keeps
    // one request from being acted on twice (StrictMode runs effects twice).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, isLoading, threads, today]);

  // The ring on the thread a door brought into view: one at a time, two seconds.
  const flash = useRef<{ el: HTMLElement; timer: number } | null>(null);
  const endFlash = () => {
    if (!flash.current) return;
    window.clearTimeout(flash.current.timer);
    flash.current.el.classList.remove("nx-focus");
    flash.current = null;
  };
  useEffect(() => endFlash, []);
  useEffect(() => {
    if (!scrollTo) return;
    setScrollTo(null);
    const el = rootRef.current?.ownerDocument.getElementById(scrollTo);
    if (!el) return;
    try {
      if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
    } catch {
      // A browser without it simply does not scroll.
    }
    endFlash();
    el.classList.add("nx-focus");
    flash.current = { el, timer: window.setTimeout(endFlash, 2000) };
  }, [scrollTo]);

  /* -------------------------------- filters -------------------------------- */

  const allCount = catalog.tiles.reduce((n, t) => n + t.count, 0);
  const countOf = (id: NoteCategory) => catalog.tiles.find((t) => t.id === id)?.count ?? 0;
  // A count is a claim about every note she has. While they load, or when
  // some could not be read, the chips say none rather than a short one.
  const countsKnown = !isLoading && !readFailed;

  const filterRow = (
    <div className="nx-filter" role="group" aria-label="Filter notes">
      <div className="nx-search">
        <Search className="nx-search__icon" size={16} aria-hidden />
        <input
          type="search"
          className="nx-search__input"
          value={filter.search}
          placeholder="Search every note, or a coach’s name"
          aria-label="Search notes"
          onChange={(e) => {
            const search = e.target.value;
            setFilter((f) => ({ ...f, search }));
          }}
        />
        {filter.search ? (
          <button type="button" className="nt-btn nt-btn--quiet" onClick={() => setFilter((f) => ({ ...f, search: "" }))}>
            <X size={16} aria-hidden /> Clear
          </button>
        ) : null}
      </div>
      <button type="button" className="nx-pick" aria-pressed={filter.category === null} onClick={() => pick(null)}>
        All
        {countsKnown ? <span className="nx-pick__count">{allCount}</span> : null}
      </button>
      {NOTES_PAGE_CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          className="nx-pick"
          aria-pressed={filter.category === c.id}
          data-testid={`pick-${c.id}`}
          onClick={() => pick(c.id)}
        >
          <NoteCategoryIcon id={c.id} className="nx-pick__icon" />
          {c.label}
          {countsKnown ? <span className="nx-pick__count">{countOf(c.id)}</span> : null}
        </button>
      ))}
      {onOpenFord ? (
        <button
          type="button"
          className="nx-door"
          onClick={onOpenFord}
          aria-label={fordDoorCount === null ? "Life, in FORD" : `Life, in FORD: ${plural(fordDoorCount, "detail")}`}
        >
          <NoteCategoryIcon id="ford" className="nx-pick__icon" />
          Life · in FORD
          {fordDoorCount === null ? null : <span className="nx-pick__count">{fordDoorCount}</span>}
          <ChevronRight size={16} aria-hidden />
        </button>
      ) : null}
    </div>
  );

  /* --------------------------------- zones --------------------------------- */

  const briefingCtx = { criticalIds, headsUpIds, dismissals, today, headsUpWindowDays };

  const zoneHead = (label: string, count: number, blurb: string, extra?: ReactNode, anchor?: string) => (
    <div className="nx-zone-h" {...(anchor ? { id: anchor, "data-cx-anchor": anchor } : {})}>
      <h3 className="nx-zone-h__title">
        {label} · {count}
      </h3>
      <span className="nx-zone-h__blurb">{blurb}</span>
      {extra}
    </div>
  );

  const rowsOf = (list: readonly NoteThread[], zone: "standing" | "resolved") =>
    list.map((t) => (
      <ThreadRow
        key={t.id}
        thread={t}
        zone={zone}
        machines={machines}
        today={today}
        expanded={expandedId === t.id}
        onToggle={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
        author={author}
      />
    ));

  let body: ReactNode;
  if (isLoading) {
    body = <LoadingArea label="Loading notes" />;
  } else if (threads.length === 0) {
    body = readFailed ? (
      <div className="nx-empty">
        <p className="nx-empty__text">Nothing loaded yet.</p>
      </div>
    ) : (
      <div className="nx-empty">
        <p className="nx-empty__text">
          No notes in Journey yet.
          {unfiledCount > 0 ? " The notes above are waiting for a category." : ""}
        </p>
        <p className="nx-empty__text">Write the first one with the bar above, or the Note button up top.</p>
        {coverage !== "complete" ? (
          <p className="nx-empty__text">Notes from before Journey aren’t shown here.</p>
        ) : null}
      </div>
    );
  } else {
    const openOrStanding = open.total + standing.total;
    body = (
      <>
        {open.total > 0 ? (
          <section className="nx-zone" aria-label="Open notes">
            {zoneHead(THREAD_ZONE_META.open.label, open.total, THREAD_ZONE_META.open.blurb)}
            <div className="nx-open-grid" data-testid="zone-open">
              {open.items.map((t) => (
                <NoteThreadCard
                  key={t.id}
                  thread={t}
                  machines={machines}
                  author={author}
                  today={today}
                  defaultOpen
                  briefing={briefingStatusOf(t, briefingCtx)}
                  onHush={onHush ? () => onHush(t) : undefined}
                  onRestore={onRestore ? () => onRestore(t) : undefined}
                />
              ))}
            </div>
          </section>
        ) : null}

        {standing.total > 0 ? (
          <section className="nx-zone" aria-label="Standing context">
            {zoneHead(THREAD_ZONE_META.standing.label, standing.total, THREAD_ZONE_META.standing.blurb)}
            <div className="nx-rows" data-testid="zone-standing">
              {rowsOf(standing.items, "standing")}
            </div>
          </section>
        ) : null}

        {openOrStanding === 0 ? (
          <div className="nx-empty">
            <p className="nx-empty__text">
              {filtered ? "Nothing open or standing matches this filter." : "Nothing open or standing right now."}
            </p>
            {/* With nothing filtered, the Resolved header's own toggle is right
                below: a second "Show the N resolved notes" here would be the
                same button twice. */}
            {filtered ? (
              <div className="nx-empty__acts">
                {resolved.total > 0 && !filter.showResolved ? (
                  <button type="button" className="nt-btn" onClick={() => setShowResolved(true)}>
                    Show the {plural(resolved.total, "resolved note")}
                  </button>
                ) : null}
                <button type="button" className="nt-btn" onClick={clear}>
                  Show everything
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {resolved.total > 0 ? (
          <section className="nx-zone" aria-label="Resolved notes">
            {zoneHead(
              THREAD_ZONE_META.resolved.label,
              resolved.total,
              THREAD_ZONE_META.resolved.blurb,
              <button
                type="button"
                className="nt-btn nt-btn--quiet nx-zone-h__toggle"
                aria-expanded={filter.showResolved}
                aria-controls="notes-resolved-list"
                onClick={() => setShowResolved(!filter.showResolved)}
              >
                {filter.showResolved ? "Hide" : "Show"} the {plural(resolved.total, "resolved note")}
              </button>,
              "notes-resolved",
            )}
            {filter.showResolved ? (
              <div className="nx-rows" id="notes-resolved-list" data-testid="zone-resolved">
                {catalog.months.map((m) => (
                  <div key={m.key} className="nx-month" role="group" aria-label={m.label}>
                    <h4 className="nx-month__label">{m.label}</h4>
                    {rowsOf(m.items, "resolved")}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </>
    );
  }

  return (
    <div className="nx-catalog" data-testid="notes-catalog" ref={rootRef}>
      {filterRow}
      {hidden.length > 0 ? (
        <CriticalLine
          criticalEntries={hiddenEntries}
          threads={hidden}
          machines={machines}
          actionLabel="Show it"
          onOpen={(threadId) => {
            clear();
            setScrollTo(`thread-${threadId}`);
          }}
        />
      ) : null}
      {body}
    </div>
  );
}
