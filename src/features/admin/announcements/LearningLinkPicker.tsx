import { useMemo, useState } from "react";
import { BookOpen, Search, X } from "lucide-react";
import { useLearningEntries } from "../../learning/useLearningEntries";
import { searchLearning } from "../../learning/search";
import {
  LEARNING_KIND_LABEL,
  learningRefKey,
  learningRefLabel,
  toStoredLearningRef,
  type StoredLearningRef,
} from "../../learning/ref";
import { AdminButton, AdminInput } from "../primitives";
import "./announcements.css";

/**
 * "Link a Learning page" — the announcement composer's picker.
 *
 * Round: Learning + Planner, Sep 2026. AJ: "announcements need to be able to
 * reference anything in our learning section". It searches exactly what the
 * Learning tab's own search finds (useLearningEntries): the studio's
 * machines, the Academy's machine cards and scripts, modules, topics, the
 * phrasebook and glossary, and — only for an announcement to one studio —
 * that studio's own pages, which open nowhere else.
 *
 * A machine link opens the studio's own page for it where a reader has the
 * machine, and its page in All MSF machines where they do not.
 */
export function LearningLinkPicker({
  value,
  onChange,
  studioId,
  includeStudioPages,
}: {
  value: StoredLearningRef | null | undefined;
  onChange: (next: StoredLearningRef | null) => void;
  /** Whose machines and pages to offer: the target studio, else the admin's own. */
  studioId: string | null;
  includeStudioPages: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const entries = useLearningEntries({
    machines: [],
    studioId,
    includeStudioPages,
    enabled: open,
  });
  const hits = useMemo(() => {
    if (!query.trim()) return [];
    return searchLearning(entries, query, 4)
      .flatMap((g) => g.hits)
      .slice(0, 8);
  }, [entries, query]);

  if (value) {
    return (
      <div className="adm-learnlink adm-learnlink--set">
        <BookOpen className="w-4 h-4 shrink-0" aria-hidden />
        <span className="adm-learnlink__what">
          <span className="adm-learnlink__kind">{LEARNING_KIND_LABEL[value.kind]}</span>
          <span className="adm-learnlink__title">{learningRefLabel(value)}</span>
        </span>
        <AdminButton variant="quiet" onClick={() => onChange(null)} aria-label="Remove the link">
          <X className="w-3.5 h-3.5" />
          Remove
        </AdminButton>
      </div>
    );
  }

  return (
    <div className="adm-learnlink">
      <div className="adm-learnlink__search">
        <Search className="w-4 h-4 shrink-0" aria-hidden />
        <AdminInput
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setOpen(true);
            setQuery(e.target.value);
          }}
          placeholder="Search machines, Academy topics, cards, terms…"
          aria-label="Search Learning for a page to link"
        />
      </div>
      {hits.length > 0 && (
        <ul className="adm-learnlink__hits">
          {hits.map((h) => (
            <li key={learningRefKey(h.ref)}>
              <button
                type="button"
                className="adm-learnlink__hit"
                onClick={() => {
                  onChange(toStoredLearningRef(h.ref, h.title));
                  setQuery("");
                }}
              >
                <span className="adm-learnlink__kind">{LEARNING_KIND_LABEL[h.ref.kind]}</span>
                <span className="adm-learnlink__title">{h.title}</span>
                {h.meta && <span className="adm-learnlink__meta">{h.meta}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && hits.length === 0 && (
        <p className="adm-learnlink__none">Nothing in Learning matches that yet.</p>
      )}
    </div>
  );
}
