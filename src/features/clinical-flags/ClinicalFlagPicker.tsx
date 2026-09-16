import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  commonFlags,
  flagsByCategory,
  searchFlags,
  selectedFlags,
  COMMON_CATEGORY,
  TONE_BADGE,
  type FlagOption,
} from "./flag-search";
import "./clinical-flags.css";

/**
 * CLINICAL FLAGS — type it, tap it (client-profile audit, Sep 2026).
 *
 * The old picker was 21 unlabeled chips carrying full diagnostic names
 * ("Uncontrolled Hypertension (Resting BP > 180/100 mmHg)"), no grouping and
 * no search. Now, top to bottom:
 *   1. what is ON, most serious first, each removable with one tap;
 *   2. the common constraints (shoulder, knee, back…) as quick toggles;
 *   3. a search box that matches the words trainers use ("stent", "disc");
 *   4. the full list by category, folded away.
 * Every target is 40px. Nothing saves until the record's Save bar.
 *
 * ROW LAYOUT (Sep 16 2026 redesign — "too cluttered with the alert
 * messages"). A row used to print the matrix's whole severity beside the
 * name; on an iPad "ABSOLUTE CONTRAINDICATION" ran over the name it
 * described. A row is now a grid: [mark] [name + bracket detail] [badge],
 * with a colour edge on the left. Only the exceptions carry a badge (Stop,
 * High); the legend above the list says what they mean. The full matrix
 * wording stays in the row's tooltip and accessible name.
 */

export interface ClinicalFlagPickerProps {
  value: readonly string[];
  onChange: (next: string[]) => void;
}

function SeverityBadge({ flag }: { flag: FlagOption }) {
  const badge = TONE_BADGE[flag.tone];
  if (!badge) return null;
  return (
    <span className="cfl-badge" data-tone={flag.tone}>
      {badge.short}
    </span>
  );
}

function FlagToggle({ flag, on, onToggle }: { flag: FlagOption; on: boolean; onToggle: () => void }) {
  const showSeverity = flag.category !== COMMON_CATEGORY;
  return (
    <button
      type="button"
      className={cn("cfl-toggle", on && "cfl-toggle--on")}
      data-tone={showSeverity ? flag.tone : "modify"}
      aria-pressed={on}
      onClick={onToggle}
      title={showSeverity ? `${flag.full} — ${flag.severity}` : flag.full}
    >
      <span className="cfl-toggle__mark" aria-hidden>
        {on ? <Check size={13} strokeWidth={3} /> : <Plus size={13} strokeWidth={2.6} />}
      </span>
      <span className="cfl-toggle__text">
        <span className="cfl-toggle__name">{flag.name}</span>
        {flag.detail && <span className="cfl-toggle__detail">{flag.detail}</span>}
        {showSeverity && <span className="cfl-sr">{flag.severity}</span>}
      </span>
      {showSeverity && <SeverityBadge flag={flag} />}
    </button>
  );
}

/** What the two badges mean, in the matrix's words. Unmarked is the common case. */
function SeverityLegend() {
  return (
    <div className="cfl-legend" aria-hidden>
      {(["alert", "caution"] as const).map((tone) => (
        <span key={tone} className="cfl-legend__item">
          <span className="cfl-badge" data-tone={tone}>
            {TONE_BADGE[tone]!.short}
          </span>
          {TONE_BADGE[tone]!.meaning}
        </span>
      ))}
      <span className="cfl-legend__item">
        <span className="cfl-legend__blank" />
        Unmarked: modify the setup
      </span>
    </div>
  );
}

export function ClinicalFlagPicker({ value, onChange }: ClinicalFlagPickerProps) {
  const [query, setQuery] = useState("");
  const on = useMemo(() => new Set(value), [value]);
  const toggle = (id: string) => onChange(on.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  const selected = useMemo(() => selectedFlags(value), [value]);
  const common = useMemo(() => commonFlags(), []);
  const results = useMemo(() => searchFlags(query), [query]);
  const groups = useMemo(() => flagsByCategory().filter((g) => g.category !== COMMON_CATEGORY), []);
  const totalInGroups = groups.reduce((n, g) => n + g.flags.length, 0);
  const onInGroups = groups.reduce((n, g) => n + g.flags.filter((f) => on.has(f.id)).length, 0);

  return (
    <div className="cfl">
      <div className="cfl-on" aria-live="polite">
        {selected.length === 0 ? (
          <p className="cfl-empty">No clinical flags on file.</p>
        ) : (
          selected.map((f) => (
            <span key={f.id} className="cfl-chip" data-tone={f.tone} title={f.full}>
              {f.name}
              <button type="button" className="cfl-chip__x" onClick={() => toggle(f.id)} aria-label={`Remove ${f.name}`}>
                <X size={14} strokeWidth={2.6} />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="cfl-block">
        <span className="cfl-kicker">Common constraints</span>
        <div className="cfl-grid">
          {common.map((f) => (
            <FlagToggle key={f.id} flag={f} on={on.has(f.id)} onToggle={() => toggle(f.id)} />
          ))}
        </div>
      </div>

      <div className="cfl-block">
        <label className="cfl-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a condition — “disc”, “stent”, “knee replacement”"
            aria-label="Search clinical conditions"
          />
          {query && (
            <button type="button" className="cfl-search__clear" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </label>
        {query.trim() && (
          <>
            {results.some((f) => f.category !== COMMON_CATEGORY && TONE_BADGE[f.tone]) && <SeverityLegend />}
            <div className="cfl-grid">
              {results.length === 0 ? (
                <p className="cfl-empty">
                  Nothing matches “{query.trim()}”. Write it in the medical history below instead.
                </p>
              ) : (
                results.map((f) => <FlagToggle key={f.id} flag={f} on={on.has(f.id)} onToggle={() => toggle(f.id)} />)
              )}
            </div>
          </>
        )}
      </div>

      {!query.trim() && (
        <details className="cfl-all">
          <summary>
            Browse every condition
            <span className="cfl-all__count">
              {totalInGroups}
              {onInGroups > 0 ? ` · ${onInGroups} on` : ""}
            </span>
            <ChevronDown size={15} aria-hidden className="cfl-all__chev" />
          </summary>
          {/* A plain wrapper for the spacing: a <details> element does not
              lay its children out as flex items in every Safari. */}
          <div className="cfl-all__body">
            <SeverityLegend />
            {groups.map((g) => {
              const count = g.flags.filter((f) => on.has(f.id)).length;
              return (
                <section key={g.category} className="cfl-group" aria-label={g.category}>
                  <header className="cfl-group__head">
                    <span className="cfl-kicker">{g.category}</span>
                    {count > 0 && <span className="cfl-group__on">{count} on</span>}
                  </header>
                  <div className="cfl-grid">
                    {g.flags.map((f) => (
                      <FlagToggle key={f.id} flag={f} on={on.has(f.id)} onToggle={() => toggle(f.id)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
