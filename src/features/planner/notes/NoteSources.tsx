import { useState } from "react";
import { ExternalLink, Link2, Plus, X } from "lucide-react";
import { checkLink, hostOf } from "./notes";
import { NOTE_MAX_LINKS, type NoteLink } from "./types";

/**
 * SOURCES — articles, studies and videos a note points at.
 *
 * Round: Planner rework, Sep 2026. AJ: trainers keep "findings in research"
 * or "a good article they found that supports the protocol so they want to
 * share it with a client later (in person, showing them on the iPad)". A
 * source opens in a new tab; it travels with the note when it is shared.
 * Part of the draft: it saves with the note's Save.
 */
export function NoteSources({
  links,
  onChange,
  disabled,
}: {
  links: NoteLink[];
  onChange: (next: NoteLink[]) => void;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const add = () => {
    const r = checkLink(url, title);
    if ("problem" in r) {
      setProblem(r.problem);
      return;
    }
    if (links.some((l) => l.url === r.link.url)) {
      setProblem("That source is already on this note.");
      return;
    }
    onChange([...links, r.link]);
    setUrl("");
    setTitle("");
    setProblem(null);
    setAdding(false);
  };

  return (
    <section className="ns" aria-labelledby="ns-title">
      <h3 className="ne__label ns__title" id="ns-title">
        <Link2 size={13} aria-hidden />
        Sources
      </h3>
      {links.length > 0 && (
        <ul className="ns__list">
          {links.map((l) => (
            <li key={l.url} className="ns__item">
              <a className="ns__link" href={l.url} target="_blank" rel="noopener noreferrer">
                <span className="ns__link-title">{l.title}</span>
                <span className="ns__link-host">{hostOf(l.url)}</span>
                <ExternalLink size={13} aria-hidden />
              </a>
              <button
                type="button"
                className="ns__x"
                aria-label={`Remove ${l.title}`}
                disabled={disabled}
                onClick={() => onChange(links.filter((x) => x.url !== l.url))}
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="ns__form">
          <input
            className="ns__input"
            type="url"
            inputMode="url"
            autoFocus
            value={url}
            placeholder="https://…"
            aria-label="Web address"
            onChange={(e) => {
              setUrl(e.target.value);
              setProblem(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <input
            className="ns__input"
            value={title}
            maxLength={120}
            placeholder="What it is (optional)"
            aria-label="What it is"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <div className="ns__form-actions">
            <button type="button" className="pl__btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="button" className="pl__btn pl__btn--primary" onClick={add} disabled={!url.trim()}>
              Add source
            </button>
          </div>
          {problem && <p className="ne__problem">{problem}</p>}
        </div>
      ) : (
        links.length < NOTE_MAX_LINKS && (
          <button type="button" className="ne__link-btn" onClick={() => setAdding(true)} disabled={disabled}>
            <Plus size={15} aria-hidden />
            {links.length ? "Add another source" : "Add a link — an article, a study, a video"}
          </button>
        )
      )}
    </section>
  );
}
