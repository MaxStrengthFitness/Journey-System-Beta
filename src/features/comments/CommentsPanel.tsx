import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { MessageSquare, PencilLine, Trash2 } from "lucide-react";
import { whenLabel } from "../wiki/studio-wiki";
import { learningRefKey, toStoredLearningRef, type LearningRef } from "../learning/ref";
import { useCommentsContext } from "./CommentsContext";
import { useComments } from "./hooks";
import { deleteComment, editComment, postComment } from "./mutations";
import {
  COMMENT_MAX,
  activeMention,
  canDeleteComment,
  commentSegments,
  initialsOf,
  insertMention,
  mentionMatches,
  mentionsIn,
  validateComment,
  type Mention,
  type MentionPerson,
  type StudioComment,
} from "./comments";
import "./comments.css";

/**
 * COMMENTS — at the foot of a Learning page, for this studio only.
 *
 * Round: Learning + Planner, Sep 2026. The rules are in ./comments.ts and the
 * why in ./README.md. Everyone at the studio can read and post; the author
 * edits or deletes their own; the studio's leaders can take any down. Type @
 * to tag someone who works here — they hear about it in their bell, and only
 * there.
 */
export function CommentsPanel({ target, title }: { target: LearningRef; title?: string }) {
  const ctx = useCommentsContext();
  const stored = useMemo(() => toStoredLearningRef(target, title), [target, title]);
  const targetKey = stored ? learningRefKey(stored) : null;
  const { comments, loading, error } = useComments(ctx?.studioId ?? null, targetKey);

  if (!ctx || !ctx.studioId || !stored) return null;
  const { studioId, studioName, author, people, isLeaderHere } = ctx;

  return (
    <section className="cm" id="comments" aria-labelledby="cm-head">
      <h2 className="wk__h2" id="cm-head">
        <MessageSquare size={13} aria-hidden />
        Comments at {studioName}
        {comments.length > 0 && <span className="cm__count">{comments.length}</span>}
      </h2>
      <p className="wk__section-note">
        Only people at {studioName} see these. Type @ to tag someone here — they'll get it in their bell. Keep
        client names out: comments stay on the page.
      </p>

      {error ? (
        <p className="cm__state">{error}</p>
      ) : loading && comments.length === 0 ? (
        <p className="cm__state">Loading comments…</p>
      ) : comments.length > 0 ? (
        <ul className="cm__list">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              studioId={studioId}
              people={people}
              mine={Boolean(author && c.authorId === author.id)}
              canDelete={canDeleteComment(c, author?.id ?? null, isLeaderHere)}
              author={author}
            />
          ))}
        </ul>
      ) : null}

      {author ? (
        <Composer
          people={people}
          studioName={studioName}
          onSubmit={async (body, mentions) => {
            await postComment(studioId, stored, body, mentions, author);
          }}
        />
      ) : (
        <p className="cm__state">Sign in to comment.</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * One comment
 * ------------------------------------------------------------------ */

function CommentItem({
  comment,
  studioId,
  people,
  mine,
  canDelete,
  author,
}: {
  comment: StudioComment;
  studioId: string;
  people: MentionPerson[];
  mine: boolean;
  canDelete: boolean;
  author: { id: string; name: string } | null;
}) {
  const [mode, setMode] = useState<"read" | "edit" | "delete">("read");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const when = whenLabel(comment.createdAt);

  if (mode === "edit" && author) {
    return (
      <li className="cm__item">
        <Composer
          people={people}
          studioName=""
          initial={{ body: comment.body, mentions: comment.mentions }}
          submitLabel="Save"
          onCancel={() => setMode("read")}
          onSubmit={async (body, mentions) => {
            await editComment(studioId, comment, body, mentions, author);
            setMode("read");
          }}
        />
      </li>
    );
  }

  return (
    <li className="cm__item">
      <div className="cm__meta">
        <span className="cm__avatar" aria-hidden>
          {initialsOf(comment.authorName)}
        </span>
        <span className="cm__who">{comment.authorName}</span>
        {when && <span className="cm__when">{when}</span>}
        {Boolean(comment.editedAt) && <span className="cm__when">· edited</span>}
      </div>

      <p className="cm__body">
        {commentSegments(comment.body, comment.mentions).map((s, i) =>
          s.kind === "mention" ? (
            <span key={i} className="cm__tag">
              {s.text}
            </span>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>

      {mode === "delete" ? (
        <div className="cm__confirm" role="alertdialog" aria-label="Delete this comment?">
          <span>Delete this comment?</span>
          <button
            type="button"
            className="cm__btn cm__btn--danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setFailed(null);
              try {
                await deleteComment(studioId, comment.id);
              } catch (err) {
                console.warn("[comments] delete failed:", err);
                setFailed("Couldn't delete it. Try again.");
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button type="button" className="cm__btn" disabled={busy} onClick={() => setMode("read")}>
            Keep
          </button>
          {failed && <span className="cm__error">{failed}</span>}
        </div>
      ) : (
        (mine || canDelete) && (
          <div className="cm__actions">
            {mine && (
              <button type="button" className="cm__link" onClick={() => setMode("edit")}>
                <PencilLine size={12} aria-hidden />
                Edit
              </button>
            )}
            {canDelete && (
              <button type="button" className="cm__link" onClick={() => setMode("delete")}>
                <Trash2 size={12} aria-hidden />
                Delete
              </button>
            )}
          </div>
        )
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Writing one, with @tags
 * ------------------------------------------------------------------ */

function Composer({
  people,
  studioName,
  initial,
  submitLabel = "Post",
  onSubmit,
  onCancel,
}: {
  people: MentionPerson[];
  studioName: string;
  initial?: { body: string; mentions: Mention[] };
  submitLabel?: string;
  onSubmit: (body: string, mentions: Mention[]) => Promise<void>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initial?.body ?? "");
  const [caret, setCaret] = useState(initial?.body.length ?? 0);
  const [picked, setPicked] = useState<Mention[]>(initial?.mentions ?? []);
  const [highlight, setHighlight] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const mention = activeMention(body, caret);
  const open = mention && mention.start !== dismissedAt ? mention : null;
  const matches = open ? mentionMatches(people, open.query) : [];
  const tagged = mentionsIn(body, picked);

  const pick = (person: MentionPerson) => {
    if (!open) return;
    const next = insertMention(body, open, person);
    setBody(next.body);
    setCaret(next.caret);
    setPicked((p) => [...p.filter((m) => m.id !== person.id), { id: person.id, name: person.name }]);
    setHighlight(0);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
      }
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(matches[Math.min(highlight, matches.length - 1)]);
    } else if (e.key === "Escape") {
      setDismissedAt(open.start);
    }
  };

  const submit = async () => {
    const p = validateComment(body);
    if (p) {
      setProblem(p);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await onSubmit(body, tagged);
      if (!initial) {
        setBody("");
        setCaret(0);
        setPicked([]);
      }
    } catch (err) {
      console.warn("[comments] save failed:", err);
      setProblem("Couldn't post that. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cm__composer">
      <div className="cm__field">
        <textarea
          ref={ref}
          className="cm__input"
          value={body}
          rows={initial ? 3 : 2}
          maxLength={COMMENT_MAX}
          placeholder={studioName ? `Comment for ${studioName} — type @ to tag someone` : "Edit your comment"}
          aria-label={initial ? "Edit your comment" : "Write a comment"}
          onChange={(e) => {
            setBody(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setProblem(null);
          }}
          onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={onKeyDown}
        />
        {open && matches.length > 0 && (
          <ul className="cm__picker" role="listbox" aria-label="Tag someone">
            {matches.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  className="cm__pick"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                >
                  <span className="cm__avatar" aria-hidden>
                    {p.initials}
                  </span>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && matches.length === 0 && open.query.length > 0 && (
          <p className="cm__hint">Nobody at this studio by that name.</p>
        )}
      </div>

      <div className="cm__row">
        {tagged.length > 0 ? (
          <span className="cm__tagging">
            Tagging {tagged.map((m) => m.name).join(", ")}
          </span>
        ) : (
          <span className="cm__tagging cm__tagging--none" />
        )}
        {problem && <span className="cm__error">{problem}</span>}
        <span className="cm__row-actions">
          {onCancel && (
            <button type="button" className="cm__btn" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="cm__btn cm__btn--primary"
            onClick={submit}
            disabled={busy || !body.trim()}
          >
            {busy ? "Posting…" : submitLabel}
          </button>
        </span>
      </div>
    </div>
  );
}
