/**
 * THE NOTES CATALOG — the Notes area of the client record.
 *
 * Replaces the date-grouped timeline (Sep 2026). Top to bottom:
 *
 *   CRITICAL & PINNED   unresolved critical notes, same selection as the
 *                       pre-session briefing. Never filtered away.
 *   SEARCH              across every category, author and source.
 *   COACH               only when more than one coach has written here.
 *   TILES               the seven categories, always all seven in the same
 *                       place (a segment is found by position on an iPad),
 *                       each with its count and newest date. One tap isolates
 *                       a category; a second tap clears it.
 *   SHELVES             no category chosen: each category's newest three,
 *                       with "See all N".
 *   MONTHS              a category chosen: all of it, month by month.
 *
 * Everything is in memory over the entries useClientJournal already loaded:
 * switching a category, searching or filtering costs no read.
 */
import { useMemo, useState } from "react";
import { BookOpen, Heart, Search, X } from "lucide-react";
import type { Machine } from "../../types";
import type { JournalEntry } from "../../types/journal";
import { JournalEntryCard } from "../../components/journal/JournalEntryCard";
import { CriticalStrip } from "../../components/journal/CriticalStrip";
import { LoadingArea } from "../../components/LoadingMark";
import {
  EMPTY_FILTER,
  NOTE_CATEGORIES,
  NOTE_CATEGORY_META,
  buildCatalog,
  catalogCoaches,
  type CatalogFilter,
  type NoteCategory,
} from "./note-catalog";
import { NoteCategoryIcon, categoryDotClass } from "./NoteCategoryChips";
import "./notes.css";

export interface NotesCatalogProps {
  entries: JournalEntry[];
  criticalEntries: JournalEntry[];
  machines: Machine[];
  isLoading?: boolean;
  onArchive?: (entry: JournalEntry) => void;
  onResolve?: (entry: JournalEntry, resolved: boolean) => void;
  /** Jump to the Life section, where FORD details live. */
  onOpenFord?: () => void;
}

const fmtShort = (d: Date | null) =>
  d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

export function NotesCatalog({
  entries,
  criticalEntries,
  machines,
  isLoading = false,
  onArchive,
  onResolve,
  onOpenFord,
}: NotesCatalogProps) {
  const [filter, setFilter] = useState<CatalogFilter>(EMPTY_FILTER);
  const catalog = useMemo(() => buildCatalog(entries, filter), [entries, filter]);
  const coaches = useMemo(() => catalogCoaches(entries), [entries]);

  const filtered = !!filter.category || !!filter.coachId || !!filter.search.trim();
  const clear = () => setFilter(EMPTY_FILTER);
  const pick = (id: NoteCategory) =>
    setFilter((f) => ({ ...f, category: f.category === id ? null : id }));

  const card = (e: JournalEntry) => (
    <JournalEntryCard
      key={e.id}
      entry={e}
      machines={machines}
      onArchive={e.isLegacy ? undefined : onArchive}
      onResolve={e.isLegacy ? undefined : onResolve}
    />
  );

  const fordHint = onOpenFord ? (
    <div className="nc-handoff flex flex-wrap items-center justify-between gap-2">
      <span className="text-[12.5px]">
        New personal details are kept in Life (FORD), where only this studio can read them.
      </span>
      <button type="button" className="nc-btn" onClick={onOpenFord}>
        <Heart className="h-3.5 w-3.5" aria-hidden /> Open Life
      </button>
    </div>
  ) : null;

  const activeMeta = filter.category ? NOTE_CATEGORY_META[filter.category] : null;

  return (
    <div className="nc-catalog" data-testid="notes-catalog">
      <CriticalStrip entries={criticalEntries} machines={machines} title="Critical & pinned" />

      <div className="nc-searchrow">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 nc-muted"
            aria-hidden
          />
          <input
            type="search"
            className="nc-input pl-9"
            value={filter.search}
            placeholder="Search every note…"
            aria-label="Search notes"
            onChange={(e) => {
              const search = e.target.value;
              setFilter((f) => ({ ...f, search }));
            }}
          />
        </div>
        {filtered && (
          <button type="button" className="nc-btn nc-btn--quiet" onClick={clear}>
            <X className="h-3.5 w-3.5" aria-hidden /> Clear
          </button>
        )}
      </div>

      {coaches.length > 1 && (
        <div className="nc-chips" role="group" aria-label="Filter by coach">
          <button
            type="button"
            className="nc-chip nc-chip--small"
            aria-pressed={filter.coachId === null}
            onClick={() => setFilter((f) => ({ ...f, coachId: null }))}
          >
            Every coach
          </button>
          {coaches.map((c) => (
            <button
              key={c.id}
              type="button"
              className="nc-chip nc-chip--small"
              aria-pressed={filter.coachId === c.id}
              onClick={() =>
                setFilter((f) => ({ ...f, coachId: f.coachId === c.id ? null : c.id }))
              }
            >
              {c.name} · {c.count}
            </button>
          ))}
        </div>
      )}

      <div className="nc-tiles" role="group" aria-label="Note categories">
        {catalog.tiles.map((t) => {
          const meta = NOTE_CATEGORY_META[t.id];
          return (
            <button
              key={t.id}
              type="button"
              className={`nc-tile${t.count === 0 ? " nc-tile--empty" : ""}`}
              aria-pressed={filter.category === t.id}
              data-testid={`tile-${t.id}`}
              onClick={() => pick(t.id)}
            >
              <span className="nc-tile__label">
                <span className={`nc-dot ${categoryDotClass(t.id)}`} aria-hidden />
                {meta.label}
              </span>
              <span className="nc-tile__count">{t.count}</span>
              <span className="nc-tile__when">
                {t.count === 0 ? "None yet" : `Newest ${fmtShort(t.newest)}`}
              </span>
            </button>
          );
        })}
      </div>

      {filtered && !isLoading && (
        <div className="nc-filterbar" role="status">
          <span className="text-[12.5px]">
            {activeMeta ? `${activeMeta.shelf} · ` : ""}
            {catalog.matched} {catalog.matched === 1 ? "note" : "notes"}
            {filter.search.trim() ? ` matching “${filter.search.trim()}”` : ""}
            {` of ${catalog.total}`}
          </span>
          <button type="button" className="nc-btn nc-btn--quiet" onClick={clear}>
            Show everything
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingArea label="Loading notes" />
      ) : catalog.total === 0 ? (
        <div className="nc-empty">
          <BookOpen className="mx-auto mb-2 h-8 w-8" aria-hidden />
          <p className="nc-kicker">Nothing logged yet</p>
          <p className="mt-1 text-[12px]">
            Pick a category above and write the first note. Incidents, consultation notes and
            session notes from elsewhere in the app land here on their own.
          </p>
        </div>
      ) : filter.category ? (
        <div className="flex flex-col gap-4" data-testid="notes-months">
          {filter.category === "ford" && fordHint}
          {catalog.months.length === 0 ? (
            <div className="nc-empty">
              <p className="nc-kicker">No {activeMeta!.shelf.toLowerCase()} match</p>
              <p className="mt-1 text-[12px]">{activeMeta!.blurb}</p>
            </div>
          ) : (
            catalog.months.map((m) => (
              <section key={m.key} className="nc-shelf">
                <div className="nc-shelf__head">
                  <h4 className="nc-kicker">{m.label}</h4>
                  <span className="nc-muted text-[11px]">{m.items.length}</span>
                </div>
                {m.items.map(card)}
              </section>
            ))
          )}
        </div>
      ) : catalog.shelves.length === 0 ? (
        <div className="nc-empty">
          <p className="nc-kicker">No notes match</p>
          <button type="button" className="nc-btn mt-3" onClick={clear}>
            Clear the search
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5" data-testid="notes-shelves">
          {catalog.shelves.map((s) => {
            const meta = NOTE_CATEGORY_META[s.id];
            return (
              <section key={s.id} className="nc-shelf" data-testid={`shelf-${s.id}`}>
                <div className="nc-shelf__head">
                  <h4 className="nc-shelf__title">
                    <span className={`nc-dot ${categoryDotClass(s.id)}`} aria-hidden />
                    <NoteCategoryIcon id={s.id} className="h-4 w-4" />
                    {meta.shelf}
                    <span className="nc-muted text-[12px] font-semibold">· {s.total}</span>
                  </h4>
                  {s.total > s.items.length && (
                    <button type="button" className="nc-btn nc-btn--quiet" onClick={() => pick(s.id)}>
                      See all {s.total}
                    </button>
                  )}
                </div>
                {s.id === "admin" && (
                  <p className="nc-muted text-[11.5px]">{meta.blurb}</p>
                )}
                {s.items.map(card)}
                {s.id === "ford" && fordHint}
              </section>
            );
          })}
          {/* Empty categories are not shelved, but a coach should never have
              to wonder whether a category exists: the tiles above name all
              seven, and this line says what an empty one means. */}
          {catalog.shelves.length < NOTE_CATEGORIES.length && !filtered && (
            <p className="nc-muted text-[11.5px]">
              Categories with nothing in them yet read “None yet” above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
