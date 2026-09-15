import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { commonFlags, flagsByCategory, searchFlags, selectedFlags, COMMON_CATEGORY, type FlagOption } from "./flag-search";
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
 */

export interface ClinicalFlagPickerProps {
  value: readonly string[];
  onChange: (next: string[]) => void;
}

function FlagToggle({ flag, on, onToggle }: { flag: FlagOption; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={cn("cfl-toggle", on && "cfl-toggle--on")}
      data-tone={flag.tone}
      aria-pressed={on}
      onClick={onToggle}
      title={flag.full}
    >
      <span className="cfl-toggle__mark" aria-hidden>
        {on ? <Check size={13} strokeWidth={3} /> : <Plus size={13} strokeWidth={2.6} />}
      </span>
      <span className="cfl-toggle__name">{flag.name}</span>
      {flag.category !== COMMON_CATEGORY && <span className="cfl-sev">{flag.severity.replace(" / Needs Modification", "")}</span>}
    </button>
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
          <div className="cfl-grid">
            {results.length === 0 ? (
              <p className="cfl-empty">
                Nothing matches “{query.trim()}”. Write it in the medical history below instead.
              </p>
            ) : (
              results.map((f) => <FlagToggle key={f.id} flag={f} on={on.has(f.id)} onToggle={() => toggle(f.id)} />)
            )}
          </div>
        )}
      </div>

      {!query.trim() && (
        <details className="cfl-all">
          <summary>
            Browse every condition
            <ChevronDown size={15} aria-hidden className="cfl-all__chev" />
          </summary>
          {groups.map((g) => (
            <div key={g.category} className="cfl-block">
              <span className="cfl-kicker">
                {g.category}
                {g.flags.some((f) => on.has(f.id)) ? ` · ${g.flags.filter((f) => on.has(f.id)).length} on` : ""}
              </span>
              <div className="cfl-grid">
                {g.flags.map((f) => (
                  <FlagToggle key={f.id} flag={f} on={on.has(f.id)} onToggle={() => toggle(f.id)} />
                ))}
              </div>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
