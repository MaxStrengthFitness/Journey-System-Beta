/**
 * THE PLAYBOOK LANE — how this studio has found success before.
 *
 * The only part of this screen that is not trying to reach zero. Everything
 * above it is work; this is the record of work already done, and it is the
 * thing that makes a studio better in a year rather than just tidier today.
 *
 * Collapsed by default. It is a reference, not a feed — a trainer opens it
 * because they have a problem, not to see what's new. Opening it puts the
 * cursor in the search box, because "shoulder" is almost always the next
 * thing they type.
 */
import { useMemo, useState } from "react";
import { BookOpen, Check, Search, X } from "lucide-react";
import {
  staleness,
  type PlaybookEntry,
  type PlaybookHit,
} from "./playbook";

export interface PlaybookLaneProps {
  search: (term: string, machineId?: string) => PlaybookHit[];
  stale: PlaybookEntry[];
  trainerId?: string | null;
  todayKey: string;
  onConfirm?: (entry: PlaybookEntry) => void;
  onRetire?: (entry: PlaybookEntry) => void;
  onOpenNew?: () => void;
}

export function PlaybookLane({
  search,
  stale,
  trainerId,
  todayKey,
  onConfirm,
  onRetire,
  onOpenNew,
}: PlaybookLaneProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hits = useMemo(() => (open ? search(term) : []), [open, search, term]);
  const total = useMemo(() => search("").length, [search]);

  return (
    <section className="sh__lane" aria-label="Playbook">
      <button
        type="button"
        className="sh__lane-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <BookOpen size={15} aria-hidden />
        <span className="sh__lane-title">Playbook</span>
        <span className="sh__lane-count tabular">{total}</span>
        {stale.length > 0 && (
          <span className="sh__lane-stale">
            {stale.length} to review
          </span>
        )}
      </button>

      {open && (
        <div className="sh__lane-body">
          <div className="sh__search">
            <Search size={14} aria-hidden className="sh__search-icon" />
            <input
              type="search"
              value={term}
              autoFocus
              placeholder="shoulder, knee, deload…"
              aria-label="Search the playbook"
              onChange={(e) => setTerm(e.target.value)}
              className="sh__search-input"
            />
            {term && (
              <button
                type="button"
                className="sh__search-clear"
                aria-label="Clear search"
                onClick={() => setTerm("")}
              >
                <X size={13} aria-hidden />
              </button>
            )}
          </div>

          {total === 0 && (
            <div className="sh__empty">
              <p className="sh__empty-title">Nothing in the playbook yet.</p>
              <p className="sh__empty-body">
                It fills itself: when you resolve a request on the board, you
                get the option to keep the answer here. That is how a studio
                stops solving the same problem twice.
              </p>
              {onOpenNew && (
                <button type="button" className="st__btn" onClick={onOpenNew}>
                  Write the first one
                </button>
              )}
            </div>
          )}

          {total > 0 && hits.length === 0 && (
            <p className="sh__noresult">
              Nothing matches “{term.trim()}”. Every word has to appear
              somewhere in an entry — try just one of them.
            </p>
          )}

          <ul className="sh__entries">
            {hits.map(({ entry }) => {
              const age = staleness(entry, todayKey);
              const confirms = Object.keys(entry.confirmations ?? {}).length;
              const iConfirmed = !!(
                trainerId && entry.confirmations?.[trainerId]
              );
              const isOpen = expandedId === entry.id;

              return (
                <li key={entry.id} className="sh__entry">
                  <button
                    type="button"
                    className="sh__entry-head"
                    aria-expanded={isOpen}
                    onClick={() => setExpandedId(isOpen ? null : entry.id)}
                  >
                    <span className="sh__entry-title">{entry.title}</span>
                    <span className="sh__entry-meta">
                      {entry.authorName}
                      {confirms > 0 && (
                        <> · {confirms} confirmed</>
                      )}
                      {age.state === "stale" && (
                        <span className="sh__entry-age"> · not confirmed in a year</span>
                      )}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="sh__entry-body">
                      <p className="sh__entry-label">The situation</p>
                      <p className="sh__entry-text">{entry.situation}</p>

                      {entry.tried && (
                        <>
                          <p className="sh__entry-label">Tried</p>
                          <p className="sh__entry-text">{entry.tried}</p>
                        </>
                      )}

                      <p className="sh__entry-label">What worked</p>
                      <p className="sh__entry-text sh__entry-text--worked">
                        {entry.worked}
                      </p>

                      {entry.tags.length > 0 && (
                        <p className="sh__entry-tags">
                          {entry.tags.map((t) => (
                            <span key={t} className="sh__tag">
                              {t}
                            </span>
                          ))}
                        </p>
                      )}

                      <div className="sh__entry-actions">
                        {onConfirm && (
                          <button
                            type="button"
                            className="sh__confirm"
                            disabled={iConfirmed}
                            onClick={() => onConfirm(entry)}
                          >
                            <Check size={13} aria-hidden />
                            {iConfirmed ? "You confirmed this" : "Worked for me too"}
                          </button>
                        )}
                        {onRetire && (
                          <button
                            type="button"
                            className="st__btn st__btn--ghost"
                            onClick={() => onRetire(entry)}
                          >
                            Retire
                          </button>
                        )}
                      </div>

                      {age.state === "stale" && (
                        <p className="sh__entry-nudge">
                          Nobody has confirmed this in {age.days} days. Still how
                          you do it? Confirming keeps it near the top; retiring
                          takes it out of search without deleting it.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
