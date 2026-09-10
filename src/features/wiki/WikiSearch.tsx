import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { accentStyle, ACCENT_ICON, type WikiAccent } from "./categories";

/**
 * SEARCH — a screen, not a sheet.
 *
 * Round: Wiki Redesign, Sep 2026.
 *
 * THE BUG THIS FIXES
 * ------------------
 * "Popping up the keyboard and popping up the catalog selector from the
 * bottom really makes the screen jumbled on the iPad."
 *
 * Both halves of that were one decision. Choosing a body group on the old
 * landing called `leaveLanding`, which called `setSheetOpen(true)` on stack
 * layouts; the sheet mounted MachinePicker with `autoFocusSearch`, which
 * summoned the keyboard. So a trainer who tapped "Upper Body — Push" got a
 * sheet over the content AND a keyboard over the sheet, having asked for
 * neither. On an 834px portrait iPad that leaves roughly a third of the
 * screen showing the thing they wanted.
 *
 * Search is now reached by tapping a search button, and it takes the whole
 * screen when it arrives. Focusing the field on mount is then correct rather
 * than presumptuous: the trainer asked for search, this IS search, and there
 * is nothing behind the keyboard to obscure.
 *
 * WHY A ROUTE AND NOT A DIALOG
 * ----------------------------
 * This is rendered INSTEAD of the index or the article, not on top of one.
 * Besides being the honest model — search is a place you go — it sidesteps
 * the failure recorded in ipad-touch-and-overlays: a Radix/Base UI dialog
 * that unmounts on an early return can leave `pointer-events: none` on
 * <body>, which presents as "the mouse works but the iPad is frozen". No
 * overlay, no leak.
 */

export interface WikiSearchItem {
  id: string;
  title: string;
  /** The line under the title — a category, a module, a reading time. */
  meta?: string;
  accent?: WikiAccent;
}

export interface WikiSearchGroup {
  key: string;
  label: string;
  items: WikiSearchItem[];
}

export interface WikiSearchProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onPick: (id: string, groupKey: string) => void;
  groups: WikiSearchGroup[];
  placeholder?: string;
  /** Shown before anything is typed — recent, or a hint about what is searchable. */
  idle?: ReactNode;
}

export function WikiSearch({
  value,
  onChange,
  onClose,
  onPick,
  groups,
  placeholder = "Search…",
  idle,
}: WikiSearchProps) {
  const field = useRef<HTMLInputElement | null>(null);

  /*
   * Focus on mount. `autoFocus` as a JSX prop is unreliable on iOS Safari
   * when the element arrives with the rest of a route change, and a ref call
   * in an effect runs after paint, which is when the browser will actually
   * accept it and raise the keyboard.
   */
  useEffect(() => {
    field.current?.focus();
  }, []);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const typed = value.trim().length > 0;

  return (
    <div className="wk__search">
      <div className="wk__search-bar">
        <button
          type="button"
          className="wk__up"
          onClick={onClose}
          aria-label="Close search"
        >
          <ArrowLeft size={16} aria-hidden />
        </button>

        <div className="wk__search-field">
          <Search size={15} className="wk__search-icon" aria-hidden />
          <input
            ref={field}
            type="search"
            className="wk__search-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            /* Autocorrect turns "lat" into "late" and "pec" into "pea" while
               a trainer is typing a muscle name one-handed. */
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
          {typed && (
            <button
              type="button"
              className="wk__search-clear"
              onClick={() => {
                onChange("");
                field.current?.focus();
              }}
              aria-label="Clear search"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="wk__search-results">
        {!typed && idle}

        {typed && total === 0 && (
          <p className="wk__empty">
            Nothing matches “{value.trim()}”.
          </p>
        )}

        {typed &&
          groups.map((g) =>
            g.items.length === 0 ? null : (
              <section className="wk__search-group" key={g.key}>
                <h2 className="wk__search-grouphead">
                  <span>{g.label}</span>
                  <span className="wk__search-count">{g.items.length}</span>
                </h2>
                <div className="wk__search-list">
                  {g.items.map((item) => {
                    const accent = item.accent ?? "other";
                    const Icon = ACCENT_ICON[accent];
                    return (
                      <button
                        key={`${g.key}-${item.id}`}
                        type="button"
                        className="wk__hit"
                        style={accentStyle(accent)}
                        onClick={() => onPick(item.id, g.key)}
                      >
                        <Icon size={15} className="wk__hit-icon" aria-hidden />
                        <span className="wk__hit-main">
                          <span className="wk__hit-title">{item.title}</span>
                          {item.meta && (
                            <span className="wk__hit-meta">{item.meta}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ),
          )}
      </div>
    </div>
  );
}
