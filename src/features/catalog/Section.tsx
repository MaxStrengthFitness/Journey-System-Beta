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
  const controlled = open !== undefined;

  return (
    <details
      className="cat__section"
      {...(controlled ? { open } : { open: defaultOpen })}
      onToggle={(e) => onToggle?.((e.currentTarget as HTMLDetailsElement).open)}
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
