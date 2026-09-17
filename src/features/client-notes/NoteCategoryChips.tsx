/**
 * The category chips — the first thing a coach picks when writing a note,
 * and the same row everywhere a note is written (the Notes area and the
 * Active Session sheet). Consistency is the point: one vocabulary, one
 * order, one look.
 */
import React from "react";
import {
  AlertTriangle,
  Bandage,
  ClipboardList,
  Dumbbell,
  Heart,
  MessageSquare,
  Target,
  ThumbsUp,
} from "lucide-react";
import { getEntryVisual } from "../../types/journal";
import {
  COMPOSER_CATEGORIES,
  NOTE_CATEGORY_META,
  type NoteCategory,
  type NoteCategoryMeta,
} from "./note-catalog";
import "./notes.css";

export const NOTE_ICONS: Record<string, React.ElementType> = {
  Target,
  Dumbbell,
  AlertTriangle,
  Bandage,
  ThumbsUp,
  Heart,
  ClipboardList,
};

/** The small hue dot a category borrows from the journal's visual contract. */
export function categoryDotClass(id: NoteCategory): string {
  return getEntryVisual(NOTE_CATEGORY_META[id].visualKind, null).edge;
}

export function NoteCategoryIcon({ id, className }: { id: NoteCategory; className?: string }) {
  const Icon = NOTE_ICONS[NOTE_CATEGORY_META[id].icon] || MessageSquare;
  return <Icon className={className ?? "h-4 w-4"} aria-hidden />;
}

export function NoteCategoryChips({
  value,
  onChange,
  options = COMPOSER_CATEGORIES,
  label = "What kind of note?",
  small = false,
}: {
  value: NoteCategory | null;
  onChange: (next: NoteCategory) => void;
  options?: readonly NoteCategoryMeta[];
  label?: string;
  small?: boolean;
}) {
  return (
    <div className="nc-chips" role="group" aria-label={label}>
      {options.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`nc-chip${small ? " nc-chip--small" : ""}`}
          aria-pressed={value === c.id}
          title={c.blurb}
          onClick={() => onChange(c.id)}
        >
          <span className={`nc-dot ${categoryDotClass(c.id)}`} aria-hidden />
          <NoteCategoryIcon id={c.id} className="h-4 w-4" />
          {c.label}
        </button>
      ))}
    </div>
  );
}
