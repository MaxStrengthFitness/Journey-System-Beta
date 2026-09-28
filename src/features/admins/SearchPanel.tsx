/**
 * THE ADMINS SEARCH — a door, not the building.
 *
 * Round: the Admins room (Sep 28 2026). It opens at the top of the page
 * rather than over it: the page underneath stays mounted (hidden), so a
 * half-typed studio form is still there when the search closes, and picking
 * a result goes through the same leave question any other move does. On a
 * PC, Ctrl K (Cmd K on a Mac) opens it; Escape closes it.
 *
 * It searches what the dashboard already holds (search.ts), so typing costs
 * no query.
 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Building2, ChevronRight, Dumbbell, Search, UserRound, X } from "lucide-react";
import { NAME_SEARCH_PROPS } from "../../lib/name-search-input";
import { AdminButton } from "../admin/primitives";
import { matchCount, searchEntries, type SearchEntry, type SearchGroups } from "./search";
import "./admins.css";

export interface SearchPanelProps {
  query: string;
  onQuery: (q: string) => void;
  onClose: () => void;
  onPick: (entry: SearchEntry) => void;
  index: readonly SearchEntry[];
  /** "the catalog is still loading": said rather than "no machine matches". */
  machinesLoading?: boolean;
}

const ICON: Record<SearchEntry["kind"], ReactNode> = {
  studio: <Building2 aria-hidden="true" />,
  machine: <Dumbbell aria-hidden="true" />,
  person: <UserRound aria-hidden="true" />,
};

function Group({ title, entries, onPick }: { title: string; entries: SearchEntry[]; onPick: (e: SearchEntry) => void }) {
  if (entries.length === 0) return null;
  return (
    <section className="hq-search__group" aria-label={title}>
      <h3 className="hq-search__grouptitle">{title}</h3>
      {entries.map((entry) => (
        <button key={entry.key} type="button" className="hq-result" onClick={() => onPick(entry)}>
          <span className="hq-result__icon">{ICON[entry.kind]}</span>
          <span>
            <span className="hq-result__title">{entry.title}</span>
            <span className="hq-result__detail">{entry.detail}</span>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
      ))}
    </section>
  );
}

export function SearchPanel({ query, onQuery, onClose, onPick, index, machinesLoading }: SearchPanelProps) {
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);

  const groups: SearchGroups = useMemo(() => searchEntries(index, query), [index, query]);
  const typed = query.trim().length > 0;
  const found = matchCount(groups);

  return (
    <div className="hq-search" role="search" aria-label="Search studios, machines and people">
      <div className="hq-search__row">
        <label className="hq-search__field">
          <Search aria-hidden="true" />
          <input
            ref={input}
            autoFocus
            className="hq-search__input"
            type="search"
            enterKeyHint="search"
            value={query}
            placeholder="Studios, machines, people"
            aria-label="Search studios, machines and people"
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "Enter") {
                const first = groups.studios[0] ?? groups.machines[0] ?? groups.people[0];
                if (first) {
                  e.preventDefault();
                  onPick(first);
                }
              }
            }}
            {...NAME_SEARCH_PROPS}
          />
        </label>
        <AdminButton variant="ghost" onClick={onClose} aria-label="Close search">
          <X className="w-4 h-4" aria-hidden="true" />
          Close
        </AdminButton>
      </div>

      {!typed ? (
        <p className="hq-search__hint">
          Type a studio (Solon), a machine (Leg Press) or a person. It looks through every studio, the MSF catalog and
          everyone with an account.
        </p>
      ) : found === 0 ? (
        <p className="hq-search__hint" role="status">
          Nothing matches &ldquo;{query.trim()}&rdquo;.
          {machinesLoading ? " The machine catalog is still loading, so machines may be missing." : " Try fewer letters, or another word."}
        </p>
      ) : (
        <>
          <Group title="Studios" entries={groups.studios} onPick={onPick} />
          <Group title="Machines" entries={groups.machines} onPick={onPick} />
          <Group title="People" entries={groups.people} onPick={onPick} />
          {machinesLoading ? <p className="hq-search__hint">The machine catalog is still loading.</p> : null}
        </>
      )}
    </div>
  );
}
