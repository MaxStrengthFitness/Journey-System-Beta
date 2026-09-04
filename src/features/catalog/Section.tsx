import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A collapsible detail section.
 *
 * Built on <details>/<summary> rather than a useState + div pair: keyboard
 * support, screen-reader semantics, in-page find and open-by-default all come
 * free, and it still works if JavaScript is mid-hydration.
 *
 * Clinical Warnings deliberately does NOT use this — see ClinicalWarnings.tsx.
 */
export interface SectionProps {
  id: string;
  title: string;
  icon?: ReactNode;
  /** Rendered next to the title, e.g. a cue count. */
  count?: number;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}

export function Section({
  id,
  title,
  icon,
  count,
  defaultOpen = false,
  open,
  onToggle,
  children,
}: SectionProps) {
  const isOpen = open ?? defaultOpen;

  return (
    <details
      className="cat__section"
      open={isOpen}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        // <details> fires toggle on mount in some engines; only report a real
        // change, or every render would write a preference nobody set.
        if (next !== isOpen) onToggle?.(next);
      }}
    >
      <summary className="cat__section-summary" id={`${id}-summary`}>
        {icon}
        <span>{title}</span>
        {count !== undefined && count > 0 && (
          <span className="cat__section-count">{count}</span>
        )}
        <ChevronDown className="cat__section-chevron" size={16} aria-hidden />
      </summary>
      <div className="cat__section-body">{children}</div>
    </details>
  );
}
