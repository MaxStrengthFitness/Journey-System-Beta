/**
 * THE HUB'S SEARCH RESULTS, AS DIRECTORY ROWS (hub fixes, Oct 1 2026).
 *
 * The header's search box shows its results on the Hub. They used to be
 * cards of their own ("CLIENT DIRECTORY (N)", Previous session / Next
 * scheduled) that read the Hub's last day of sessions and said "Previous
 * session: No history" for a client with 54 sessions. Now they are the
 * Client Directory's own rows (row.ts, DirectoryRowView): Last in · Next ·
 * Left, the Directory's words, from the same context (use-directory-context),
 * so the Hub, the Directory and the profile say the same thing. A tap opens
 * the profile; each row keeps a Start, as In today has. AJ, Oct 1 2026: "we
 * are more concerened we can have a useable app that gives us correct
 * information about the current time".
 */
import type { CSSProperties } from "react";
import { LoadingArea } from "../../components/LoadingMark";
import type { DirectoryRow } from "./row";
import type { NameMatch } from "./search";
import { DirectoryRowView } from "./DirectoryRowView";
import "./client-directory.css";

/** The Directory's own columns, with Start at the end. */
const GRID: CSSProperties = {
  "--cd-cols": "40px minmax(0, 1fr) minmax(96px, 120px) minmax(112px, 140px) minmax(84px, 104px) auto",
  "--cd-cols-wide": "40px minmax(0, 1fr) minmax(96px, 120px) minmax(112px, 140px) minmax(84px, 104px) auto",
} as CSSProperties;

export interface SearchResultsProps {
  term: string;
  rows: ReadonlyArray<DirectoryRow>;
  matches: ReadonlyMap<string, NameMatch>;
  /** Firestore is still being asked for names the studio list doesn't hold. */
  searching: boolean;
  onOpen: (clientId: string) => void;
  onStart: (clientId: string) => void;
}

export function SearchResults({ term, rows, matches, searching, onOpen, onStart }: SearchResultsProps) {
  return (
    <div className="cd" data-view="hub-search">
      <header className="cd-head">
        <p className="cd-line" role="status">
          {rows.length === 0
            ? searching
              ? "Searching\u2026"
              : `No client matches \u201c${term.trim()}\u201d.`
            : `${rows.length} ${rows.length === 1 ? "client matches" : "clients match"} \u201c${term.trim()}\u201d${searching ? " \u00b7 still searching\u2026" : ""}`}
        </p>
      </header>
      {rows.length === 0 && searching ? (
        <LoadingArea label={"Searching\u2026"} />
      ) : (
        <div className="cd-scroll" role="region" aria-label="Search results">
          <div className="cd-grid cd-colhead" style={GRID} aria-hidden="true">
            <div />
            <div>
              <span className="cd-colhead-label">Client</span>
            </div>
            <div>
              <span className="cd-colhead-label">Last in</span>
            </div>
            <div>
              <span className="cd-colhead-label">Next</span>
            </div>
            <div>
              <span className="cd-colhead-label">Left</span>
            </div>
            <div />
          </div>
          {rows.map((row) => (
            <DirectoryRowView
              key={row.id}
              row={row}
              match={matches.get(row.id) ?? null}
              gridVars={GRID}
              showStart
              startAlways
              onSelect={onOpen}
              onStart={onStart}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchResults;
