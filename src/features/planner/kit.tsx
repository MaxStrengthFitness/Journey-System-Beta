/**
 * PLANNER KIT — small controls shared by the Planner's dialogs and panels.
 * Styles in ./kit.css. Round: Planner rework, Sep 2026.
 */
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import "./kit.css";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="pk-avatar" aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Avatars({ names, max = 4 }: { names: string[]; max?: number }) {
  if (names.length === 0) return null;
  return (
    <span className="pk-avatars" aria-hidden>
      {names.slice(0, max).map((n, i) => (
        <span className="pk-avatar" key={`${n}-${i}`}>
          {initials(n)}
        </span>
      ))}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  title,
  body,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  body?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="pk-toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="pk-toggle__text">
        <span className="pk-toggle__title">{title}</span>
        {body && <span className="pk-toggle__body">{body}</span>}
      </span>
      <span className="pk-toggle__knob" aria-hidden />
    </button>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="pk-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface Person {
  id: string;
  name: string;
}

/**
 * Pick people from the studio's team. Chips, because a head trainer is
 * choosing among eight names, not searching thousands.
 */
export function PeoplePicker({
  people,
  selected,
  onChange,
  meId,
  label,
  emptyText = "Nobody else works here yet.",
  max,
}: {
  people: Person[];
  selected: Person[];
  onChange: (next: Person[]) => void;
  meId?: string | null;
  label: string;
  emptyText?: string;
  max?: number;
}) {
  const on = new Set(selected.map((p) => p.id));
  if (people.length === 0) return <p className="pk-hint">{emptyText}</p>;
  return (
    <div className="pk-chips pk-chips--scroll" role="group" aria-label={label}>
      {people.map((p) => {
        const pressed = on.has(p.id);
        const full = !pressed && max !== undefined && selected.length >= max;
        return (
          <button
            key={p.id}
            type="button"
            className="pk-chip"
            aria-pressed={pressed}
            disabled={full}
            onClick={() => onChange(pressed ? selected.filter((s) => s.id !== p.id) : [...selected, p])}
          >
            <Avatar name={p.name} />
            {p.id === meId ? `${p.name} (you)` : p.name}
            {pressed && <Check size={14} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
