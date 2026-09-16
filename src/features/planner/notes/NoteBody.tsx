import { Fragment, type ReactNode } from "react";
import { Bold, CheckSquare, Heading2, Italic, Link2, List, ListOrdered, Quote } from "lucide-react";
import { parseNote, type FormatAction, type Inline, type ListItem } from "./format";
import "./note-body.css";

/**
 * A note's body, drawn from the safe Markdown subset in ./format.ts.
 *
 * React elements only — never innerHTML — and links only to http(s), opened
 * in a new tab with no referrer. With `onToggle`, checklist items are
 * tappable (the note's editor passes it; a shared copy on a record does not).
 */
export function NoteBody({
  body,
  onToggle,
  className = "nb",
}: {
  body: string;
  onToggle?: (line: number) => void;
  className?: string;
}) {
  const blocks = parseNote(body);
  if (blocks.length === 0) return null;
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h":
            return b.level === 1 ? (
              <h3 key={i} className="nb__h1">
                {inline(b.c)}
              </h3>
            ) : (
              <h4 key={i} className="nb__h2">
                {inline(b.c)}
              </h4>
            );
          case "p":
            return (
              <p key={i} className="nb__p">
                {inline(b.c)}
              </p>
            );
          case "quote":
            return (
              <blockquote key={i} className="nb__quote">
                {inline(b.c)}
              </blockquote>
            );
          case "hr":
            return <hr key={i} className="nb__hr" />;
          case "ul":
            return (
              <ul key={i} className="nb__ul">
                {b.items.map((it) => item(it, onToggle))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="nb__ol">
                {b.items.map((it) => item(it, onToggle))}
              </ol>
            );
        }
      })}
    </div>
  );
}

function item(it: ListItem, onToggle?: (line: number) => void): ReactNode {
  if (it.check === null) {
    return (
      <li key={it.line} className="nb__li">
        {inline(it.c)}
      </li>
    );
  }
  return (
    <li key={it.line} className={`nb__li nb__li--check${it.check ? " nb__li--done" : ""}`}>
      {onToggle ? (
        <button
          type="button"
          className="nb__check"
          role="checkbox"
          aria-checked={it.check}
          onClick={() => onToggle(it.line)}
        >
          <span className="nb__box" aria-hidden />
          <span className="nb__check-text">{inline(it.c)}</span>
        </button>
      ) : (
        <span className="nb__check nb__check--static" role="checkbox" aria-checked={it.check} aria-readonly>
          <span className="nb__box" aria-hidden />
          <span className="nb__check-text">{inline(it.c)}</span>
        </span>
      )}
    </li>
  );
}

function inline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return <Fragment key={i}>{n.v}</Fragment>;
      case "b":
        return <strong key={i}>{inline(n.c)}</strong>;
      case "i":
        return <em key={i}>{inline(n.c)}</em>;
      case "link":
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="nb__a">
            {inline(n.c)}
          </a>
        );
    }
  });
}

const TOOLS: { action: FormatAction; label: string; icon: ReactNode }[] = [
  { action: "h", label: "Heading", icon: <Heading2 size={16} aria-hidden /> },
  { action: "ul", label: "Bullet list", icon: <List size={16} aria-hidden /> },
  { action: "check", label: "Checklist", icon: <CheckSquare size={16} aria-hidden /> },
  { action: "ol", label: "Numbered steps", icon: <ListOrdered size={16} aria-hidden /> },
  { action: "quote", label: "Quote", icon: <Quote size={16} aria-hidden /> },
  { action: "bold", label: "Bold", icon: <Bold size={16} aria-hidden /> },
  { action: "italic", label: "Italic", icon: <Italic size={16} aria-hidden /> },
  { action: "link", label: "Link", icon: <Link2 size={16} aria-hidden /> },
];

/**
 * The formatting toolbar. Buttons never take focus from the text box
 * (onPointerDown prevents it), so the selection they act on is still there.
 */
export function NoteToolbar({ onFormat, disabled }: { onFormat: (a: FormatAction) => void; disabled?: boolean }) {
  return (
    <div className="nb-tools" role="toolbar" aria-label="Formatting">
      {TOOLS.map((t) => (
        <button
          key={t.action}
          type="button"
          className="nb-tool"
          aria-label={t.label}
          title={t.label}
          disabled={disabled}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onFormat(t.action)}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}
