import { createContext, useContext, type ReactNode } from "react";

/**
 * LEARNING — the Catalog and the Academy as one tab.
 *
 * Round: Sep 10 2026, the same day the wiki round made them two tabs. AJ's
 * call after living with it: "combo academy and catalog into learning". The
 * bottom bar had seven buttons, and two of them opened the same kind of
 * screen on the same shell.
 *
 * HOW IT WORKS
 * ------------
 * Both screens keep their own routes, indexes and search — nothing inside
 * them changed. What changed is the bar they share: when a WikiShell renders
 * inside this provider, it puts a Catalog | Academy switch in its top bar, on
 * every page of both. One tap moves between them from anywhere, and no second
 * bar was added to do it.
 *
 * Tapping the section you are ALREADY in goes to its index, the way tapping
 * the current tab does on an iPad. On an index the breadcrumb would just
 * repeat the switch ("Catalog"), so the trail is left out there.
 *
 * WHY A CONTEXT
 * -------------
 * The Catalog builds its bar in two places and the Academy in eleven.
 * Threading a prop through all thirteen is thirteen chances to miss one; the
 * shell reading one value is none. Outside the provider (the harness, any
 * future standalone use) the shell renders exactly as before.
 *
 * This module is deliberately tiny and imports nothing from the wiki: the
 * app shell imports it eagerly, and the wiki itself is lazy-loaded.
 */

export interface WikiSectionTab {
  id: string;
  label: string;
  /**
   * A small glyph before the label. It is what tells this switch apart from
   * the Catalog's own "group by" control a few pixels below it — one of whose
   * options is also called Academy.
   */
  icon?: ReactNode;
}

export interface WikiSectionsValue {
  sections: WikiSectionTab[];
  /** The id of the section on screen. */
  active: string;
  onSelect: (id: string) => void;
}

const WikiSectionsContext = createContext<WikiSectionsValue | null>(null);

export function WikiSectionsProvider({
  value,
  children,
}: {
  value: WikiSectionsValue;
  children: ReactNode;
}) {
  return (
    <WikiSectionsContext.Provider value={value}>
      {children}
    </WikiSectionsContext.Provider>
  );
}

export function useWikiSections(): WikiSectionsValue | null {
  return useContext(WikiSectionsContext);
}

/** The label of the section on screen, if there is one. */
export function activeSectionLabel(value: WikiSectionsValue | null): string | null {
  if (!value) return null;
  return value.sections.find((s) => s.id === value.active)?.label ?? null;
}

/**
 * True on a section's own index, where the whole trail is one crumb that says
 * what the switch beside it already says.
 */
export function trailRepeatsSection(
  crumbs: { label: string; onClick?: () => void }[],
  value: WikiSectionsValue | null,
): boolean {
  const label = activeSectionLabel(value);
  return label !== null && crumbs.length === 1 && crumbs[0].label === label;
}

export function WikiSectionSwitch({
  value,
  onActiveTap,
}: {
  value: WikiSectionsValue;
  /** Tapping the current section: back to its index. */
  onActiveTap?: () => void;
}) {
  return (
    <div className="wk__seg wk__seg--bar" role="group" aria-label="Learning">
      {value.sections.map((s) => {
        const on = s.id === value.active;
        return (
          <button
            key={s.id}
            type="button"
            className="wk__seg-btn"
            aria-pressed={on}
            // The visible label hides on a phone (icons only), so the name
            // lives on the button itself.
            aria-label={s.label}
            onClick={() => (on ? onActiveTap?.() : value.onSelect(s.id))}
          >
            {s.icon}
            <span className="wk__seg-label">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
