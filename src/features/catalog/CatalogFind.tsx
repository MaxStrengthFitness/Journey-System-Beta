import { useRef } from "react";
import { BookOpen, CornerDownLeft, Filter, Library, MapPin, PersonStanding, Search, X } from "lucide-react";
import { useWikiPageGuard } from "../wiki/page-guard";
import type { FindHit, FindResult } from "./find";

/**
 * FIND, ON TOP OF THE CATALOG.
 *
 * Round: the Machine Catalog, Sep 28 2026 (Catalog R1). The rules are in
 * ./find.ts; this only draws them.
 *
 * A field on the page, not a button that opens a search screen: the Catalog
 * is looked up standing at a machine, and "LUMBAR", "low back" or "lp2" is
 * three or four letters. The keyboard comes up only when the field is tapped
 * (nothing focuses it by itself — the old catalog's surprise keyboard is the
 * bug WikiShell's header records). While something is typed, the results
 * stand in for the list below; clearing the field puts the list back.
 *
 * The one TOP MATCH (an exact name) is marked, and Enter opens it. Everything
 * else is grouped where it lives: on this floor, other MSF machines, switches
 * and makers, and lines inside a page.
 *
 * It borrows the wiki's search field and result rows (`wk__search-*`,
 * `wk__hit`), so it looks and measures like Learning's search: a 44px field
 * at 16px, 52px rows, a 40px clear.
 */
export interface CatalogFindProps {
  value: string;
  onChange: (value: string) => void;
  /** What the field finds; null before anything is typed. */
  result: FindResult | null;
  onPick: (hit: FindHit) => void;
}

const ICON: Record<FindHit["kind"], typeof MapPin> = {
  unit: MapPin,
  movement: Library,
  muscle: PersonStanding,
  filter: Filter,
  line: BookOpen,
};

export function CatalogFind({ value, onChange, result, onPick }: CatalogFindProps) {
  const field = useRef<HTMLInputElement | null>(null);
  // A pick leaves the index page, so it asks about typing there first, as a row does.
  const guard = useWikiPageGuard();
  const pick = (hit: FindHit) => guard(() => onPick(hit));

  return (
    <section className="mcat-find" aria-label="Find a machine">
      <div className="wk__search-field mcat-find__field">
        <Search size={15} className="wk__search-icon" aria-hidden />
        <input
          ref={field}
          type="search"
          className="wk__search-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Find a machine, a code or a muscle"
          aria-label="Find a machine, a code or a muscle"
          enterKeyHint="search"
          /* Autocorrect turns "lumb" into "lumber" and "pec" into "pea". */
          autoCorrect="off"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "Enter" && result?.top) {
              e.preventDefault();
              pick(result.top);
            }
            if (e.key === "Escape") onChange("");
          }}
        />
        {value && (
          <button
            type="button"
            className="wk__search-clear"
            onClick={() => {
              onChange("");
              field.current?.focus();
            }}
            aria-label="Clear"
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      {result && result.none && (
        <p className="wk__empty">Nothing goes by “{result.query.trim()}”.</p>
      )}

      {result && !result.none && (
        <div className="mcat-find__results">
          {result.top && (
            <section className="wk__search-group">
              <h2 className="wk__search-grouphead">
                <span>Top match · Enter opens it</span>
              </h2>
              <div className="wk__search-list">
                <Hit hit={result.top} top onPick={pick} />
              </div>
            </section>
          )}
          {result.groups.map((g) => (
            <section className="wk__search-group" key={g.key}>
              <h2 className="wk__search-grouphead">
                <span>{g.label}</span>
                <span className="wk__search-count">{g.hits.length}</span>
              </h2>
              <div className="wk__search-list">
                {g.hits.map((h, i) => (
                  <Hit key={`${g.key}-${i}-${h.label}`} hit={h} onPick={pick} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function Hit({ hit, top, onPick }: { hit: FindHit; top?: boolean; onPick: (hit: FindHit) => void }) {
  const Icon = ICON[hit.kind];
  return (
    <button
      type="button"
      className={`wk__hit${top ? " mcat-find__top" : ""}`}
      data-kind={hit.kind}
      onClick={() => onPick(hit)}
    >
      <Icon size={15} className="wk__hit-icon" aria-hidden />
      <span className="wk__hit-main">
        <span className="wk__hit-title">{hit.label}</span>
        {hit.sub &&
          (hit.kind === "line" ? (
            <span className="mcat-find__line">{hit.sub}</span>
          ) : (
            <span className="wk__hit-meta">{hit.sub}</span>
          ))}
      </span>
      {top && <CornerDownLeft size={15} className="mcat-find__enter-icon" aria-hidden />}
    </button>
  );
}
