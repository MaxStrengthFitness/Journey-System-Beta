import { useState } from "react";
import { ChevronLeft, Copy, ExternalLink, Users } from "lucide-react";
import { studioDateKey } from "../../../lib/studio-time";
import { dayWords } from "../jobs/jobs";
import { copyShareToMyNotes } from "./mutations";
import { NoteBody } from "./NoteBody";
import { hostOf, noteErrorMessage, whenLabel } from "./notes";
import { NOTE_KIND_LABEL } from "./types";
import type { NoteShare } from "./team-share";

/**
 * A NOTE A COLLEAGUE SHARED — read-only, in the Notes tab's right pane.
 *
 * Round: Planner rework, Sep 2026. The reader can open the clients it is
 * about and keep their own copy ("Save a copy to my notes"), which is how a
 * trainer covering a client keeps working from the plan after the share
 * ends. Checklists are drawn but not tappable: it isn't theirs to change.
 */
export function SharedNoteView({
  share,
  uid,
  onBack,
  onOpenClient,
  onCopied,
}: {
  share: NoteShare;
  uid: string;
  onBack?: () => void;
  onOpenClient?: (clientId: string) => void;
  onCopied: (noteId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayKey = studioDateKey(new Date()) ?? "";

  const copy = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await copyShareToMyNotes(uid, share);
      onCopied(id);
    } catch (err) {
      console.warn("[notes] copy failed:", err);
      setError(noteErrorMessage(err, "save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="ne" aria-label={`Shared note: ${share.title}`}>
      <div className="ne__bar">
        {onBack && (
          <button type="button" className="ne__back" onClick={onBack}>
            <ChevronLeft size={18} aria-hidden />
            Notes
          </button>
        )}
        <span className="ne__status">
          <Users size={13} aria-hidden /> From {share.authorName} · {whenLabel(share.updatedAt)}
        </span>
        <div className="ne__bar-actions">
          <button type="button" className="pl__btn pl__btn--primary" onClick={() => void copy()} disabled={busy}>
            <Copy size={14} aria-hidden />
            {busy ? "Saving…" : /^hand-off\b/i.test(share.message) ? "Take it over" : "Save a copy to my notes"}
          </button>
        </div>
      </div>

      <div className="ne__scroll touch-pane">
        {error && (
          <p className="ne__error" role="alert">
            {error}
          </p>
        )}
        <div className="sv__tags">
          <span className={`pn__kind pn__kind--${share.kind}`}>{NOTE_KIND_LABEL[share.kind]}</span>
          <span className="pk-tag pk-tag--live">
            {share.audience === "team" ? "Shared with the whole team" : "Shared with you"}
          </span>
          {share.expiresOn && <span className="pk-tag">Until the end of {dayWords(share.expiresOn, todayKey)}</span>}
        </div>
        <h2 className="sv__title">{share.title}</h2>
        {share.message && <blockquote className="sv__message">“{share.message}” — {share.authorName}</blockquote>}

        {share.clientIds.length > 0 && (
          <div className="ne__chips sv__clients" aria-label="About">
            {share.clientIds.map((id) =>
              onOpenClient ? (
                <button key={id} type="button" className="ne__chip ne__chip-open" onClick={() => onOpenClient(id)}>
                  {share.clientNames[id] || "A client"}
                  <ExternalLink size={13} aria-hidden />
                </button>
              ) : (
                <span key={id} className="ne__chip">
                  <span className="ne__chip-name">{share.clientNames[id] || "A client"}</span>
                </span>
              ),
            )}
          </div>
        )}

        <div className="ne__read">
          {share.body.trim() ? <NoteBody body={share.body} /> : <p className="ne__hint">No text — see the sources below.</p>}
        </div>

        {share.links.length > 0 && (
          <section className="ns" aria-label="Sources">
            <h3 className="ne__label ns__title">Sources</h3>
            <ul className="ns__list">
              {share.links.map((l) => (
                <li key={l.url} className="ns__item">
                  <a className="ns__link" href={l.url} target="_blank" rel="noopener noreferrer">
                    <span className="ns__link-title">{l.title}</span>
                    <span className="ns__link-host">{hostOf(l.url)}</span>
                    <ExternalLink size={13} aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="ne__hint sv__foot">
          Only {share.authorName} can change this. A copy you save is yours — private, and yours to edit.
        </p>
      </div>
    </article>
  );
}
