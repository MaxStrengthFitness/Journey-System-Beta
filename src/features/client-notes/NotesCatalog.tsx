/**
 * THE NOTES CATALOG — the Notes area of the client record.
 *
 * Replaces the date-grouped timeline (Sep 2026). Top to bottom:
 *
 *   TO FILE             notes saved without a category (reporting round,
 *                       "capture now, tag at teardown"), each with the five
 *                       categories under it — one tap files. While a note is
 *                       here it is NOT on a shelf, so it is never shown twice.
 *                       Nothing when there is nothing to file.
 *   CRITICAL & PINNED   unresolved critical notes, same selection as the
 *                       pre-session briefing. Never filtered away.
 *   SEARCH              across every category, author and source.
 *   COACH               only when more than one coach has written here.
 *   TILES               the seven categories, always all seven in the same
 *                       place (a segment is found by position on an iPad),
 *                       each with its count and newest date. One tap isolates
 *                       a category; a second tap clears it.
 *   ZONES               the three zones, in this order and always in it:
 *                       OPEN (live — things you could ask about today),
 *                       STANDING CONTEXT (quiet but true), RESOLVED (closed
 *                       or run out, tucked away but findable). Open and
 *                       Standing are never cut short; Resolved shows three
 *                       and "See all N".
 *   MONTHS              inside an expanded Resolved zone only, where
 *                       chronology is how you find something from last
 *                       winter.
 *
 * THE ZONES REPLACED THE SHELVES (Notes round, Sep 2026). Notes had
 * inherited the Recent Journey grid, which is right for a record you SURVEY
 * and wrong for a place you go LOOKING IN — everything equally quiet, so you
 * read all of it to remember any of it. The zone a thread sits in is not a
 * status anybody sets: it falls out of the timing already chosen in the
 * composer. See `threads.ts`.
 *
 * Everything is in memory over what useClientJournal already loaded:
 * switching a category, searching or filtering costs no read.
 */
import { useMemo, useState } from "react";
import { BookOpen, Heart, Search, X } from "lucide-react";
import type { Machine } from "../../types";
import type { JournalEntry } from "../../types/journal";
import { CriticalStrip } from "../../components/journal/CriticalStrip";
import { LoadingArea } from "../../components/LoadingMark";
import {
  EMPTY_FILTER,
  NOTE_CATEGORIES,
  NOTE_CATEGORY_META,
  buildCatalog,
  catalogCoaches,
  splitUnfiled,
  withoutRecordFields,
  type CatalogFilter,
  type NoteCategory,
} from "./note-catalog";
import { THREAD_ZONE_META, assembleThreads, type NoteThread } from "./threads";
import { NoteThreadCard } from "./NoteThreadCard";
import type { JournalAuthor } from "../../hooks/useClientJournal";
import { studioDateKey } from "../../lib/studio-time";
import { NoteCategoryIcon, categoryDotClass } from "./NoteCategoryChips";
import { NoteSweep } from "./NoteSweep";
import { discardUnfiledEntry, fileUnfiledEntry } from "./file-unfiled";
import "./notes.css";

export interface NotesCatalogProps {
  entries: JournalEntry[];
  /**
   * The threads useClientJournal assembled. Left out, the catalog builds
   * one-entry threads from `entries` — correct, just without the spines.
   */
  threads?: NoteThread[];
  criticalEntries: JournalEntry[];
  machines: Machine[];
  /** Who is writing. Null makes every thread read-only. */
  author?: JournalAuthor | null;
  isLoading?: boolean;
  onArchive?: (entry: JournalEntry) => void;
  onResolve?: (entry: JournalEntry, resolved: boolean) => void;
  /** Jump to the Life section, where FORD details live. */
  onOpenFord?: () => void;
  /** Named in the To-file tray ("a note about Judy"). */
  clientFirstName?: string;
}

const fmtShort = (d: Date | null) =>
  d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

export function NotesCatalog({
  entries,
  threads,
  criticalEntries,
  machines,
  author = null,
  isLoading = false,
  onArchive,
  onResolve,
  onOpenFord,
  clientFirstName = "",
}: NotesCatalogProps) {
  const [filter, setFilter] = useState<CatalogFilter>(EMPTY_FILTER);
  // Fields the record shows in their own sections are not repeated here, and
  // an unfiled note sits in the tray above the catalog, not in a zone too.
  const { unfiled, filed } = useMemo(() => splitUnfiled(withoutRecordFields(entries)), [entries]);
  const listed = useMemo(() => {
    const given = threads ? threads.filter((t) => filed.some((e) => e.id === t.id)) : null;
    return given ?? assembleThreads(filed);
  }, [threads, filed]);
  const today = studioDateKey(new Date()) ?? "";
  const catalog = useMemo(() => buildCatalog(listed, filter, today), [listed, filter, today]);
  const coaches = useMemo(() => catalogCoaches(filed), [filed]);

  const filtered = !!filter.category || !!filter.coachId || !!filter.search.trim();
  const clear = () => setFilter(EMPTY_FILTER);
  const pick = (id: NoteCategory) =>
    setFilter((f) => ({ ...f, category: f.category === id ? null : id, zone: null }));

  const card = (t: NoteThread) => (
    <NoteThreadCard
      key={t.id}
      thread={t}
      machines={machines}
      author={author}
      onArchive={onArchive}
      onResolve={onResolve}
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
      <NoteSweep
        entries={unfiled}
        machines={machines}
        clientFirstName={clientFirstName}
        onFile={fileUnfiledEntry}
        onDiscard={onArchive ? discardUnfiledEntry : undefined}
      />

      <CriticalStrip entries={criticalEntries} machines={machines} title="Critical & pinned" />

      <div className="nc-searchrow">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 nc-muted"
            aria-hidden
          />
          <input
            type="search"
            className="nc-input nc-input--icon"
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
      ) : catalog.matched === 0 ? (
        <div className="nc-empty">
          <p className="nc-kicker">No notes match</p>
          {activeMeta && <p className="mt-1 text-[12px]">{activeMeta.blurb}</p>}
          <button type="button" className="nc-btn mt-3" onClick={clear}>
            Show everything
          </button>
        </div>
      ) : filter.zone ? (
        /* An expanded zone, month by month — how you find a thread from
           last winter. Only Resolved is ever collapsed, so only it gets here. */
        <div className="flex flex-col gap-4" data-testid="notes-months">
          <div className="nc-filterbar" role="status">
            <span className="text-[12.5px]">
              {THREAD_ZONE_META[filter.zone].label} · every one
            </span>
            <button
              type="button"
              className="nc-btn nc-btn--quiet"
              onClick={() => setFilter((f) => ({ ...f, zone: null }))}
            >
              Back to the zones
            </button>
          </div>
          {catalog.months.map((m) => (
            <section key={m.key} className="nc-shelf">
              <div className="nc-shelf__head">
                <h4 className="nc-kicker">{m.label}</h4>
                <span className="nc-muted text-[11px]">{m.items.length}</span>
              </div>
              {m.items.map(card)}
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-5" data-testid="notes-zones">
          {catalog.zones.map((z) => {
            const meta = THREAD_ZONE_META[z.id];
            if (z.total === 0) return null;
            return (
              <section key={z.id} className="nc-shelf" data-testid={`zone-${z.id}`}>
                <div className="nc-shelf__head">
                  <h4 className="nc-shelf__title">
                    {meta.label}
                    <span className="nc-muted text-[12px] font-semibold">· {z.total}</span>
                  </h4>
                  {z.collapsed && (
                    <button
                      type="button"
                      className="nc-btn nc-btn--quiet"
                      onClick={() => setFilter((f) => ({ ...f, zone: z.id }))}
                    >
                      See all {z.total}
                    </button>
                  )}
                </div>
                <p className="nc-muted text-[11.5px]">{meta.blurb}</p>
                {z.items.map(card)}
              </section>
            );
          })}
          {/* A zone with nothing in it is not drawn, but a coach should never
              have to wonder whether one exists: this says what the order is
              and that an empty zone means exactly nothing is in it. */}
          <p className="nc-muted text-[11.5px]">
            Open first, then what is simply true, then what is done. A zone with nothing in it is
            not shown.
          </p>
          {fordHint}
        </div>
      )}
    </div>
  );
}
