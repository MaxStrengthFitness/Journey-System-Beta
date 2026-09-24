import { useState, type ReactNode } from "react";
import { clientFirstName } from "../../../lib/client-name";
import { ExternalLink, NotebookPen, Pencil, Plus } from "lucide-react";
import { auth } from "../../../firebase";
import type { Client, Trainer } from "../../../types";
import type { RecordAnchor } from "../../client-profile/profile-nav";
import { Btn, CardHead, EmptyLine, Meta, anchorProps, type Pronouns } from "../../client-codex/kit";
import { requestPlanner } from "../intent";
import { canRemoveSharedNote, clientStudioId } from "./access";
import { useSharedNotes } from "./hooks";
import { removeSharedNote } from "./mutations";
import { noteErrorMessage, whenLabel } from "./notes";
import { NOTE_KIND_LABEL, type SharedNote } from "./types";
import { NoteBody } from "./NoteBody";
import "./notes.css";

/**
 * PLANS FROM THE TEAM — the notes trainers have shared onto this client's
 * record, on the profile's Goals & Focus page.
 *
 * Round: Learning + Planner, Sep 2026. A note is written in its author's
 * Planner (Notes tab) and copied here when they switch on Share; only the
 * author changes it, from there. Reading follows the client, like InBody:
 * whoever can open the profile sees the card.
 *
 *   Write a plan         opens the author's Planner with a new plan about
 *                        this client already started
 *   Jot a note           the same, for a line in the note being built —
 *                        left off when the card holds the jot strip itself
 *   Edit in Relay        the author's own notes
 *   Take off the record  the studio's leaders and administrators; the
 *                        author keeps their own copy
 *
 * CLIENT CODEX (Sep 2026, phase 14): drawn with the codex kit — one panel,
 * the kit's buttons, text on the 11 / 12 / 14 / 17 / 30 scale — and a plan's
 * kind is a token dot (blue for a plan or a retention idea, plum for an
 * injury, ink for the rest; never crimson). `children` go after the list,
 * under a hairline, in the same panel: Goals & Focus puts the trainer's own
 * working notes there. `pronouns` word the card the way the page does
 * ("everyone who coaches her"); left out, it uses the first name.
 */

/** Long enough that it is worth folding. */
const FOLD_AT = 320;

export interface SharedNotesCardProps {
  client: Client;
  authTrainer: Trainer | null;
  /** Switches to the Planner. Without it, the card only reads. */
  onOpenPlanner?: () => void;
  /** How the card refers to the client (the codex's pronouns). Left out: the first name. */
  pronouns?: Pick<Pronouns, "object" | "possessive">;
  /** An anchor from RECORD_ANCHORS, when a door may land on this card. */
  anchor?: RecordAnchor;
  /** Drawn after the plans, under a hairline, in the same panel. */
  children?: ReactNode;
}

export function SharedNotesCard({ client, authTrainer, onOpenPlanner, pronouns, anchor, children }: SharedNotesCardProps) {
  const clientId = client.id ?? null;
  const { notes, loading, error } = useSharedNotes(clientId);
  const uid = auth.currentUser?.uid ?? null;
  const studioId = clientStudioId(client);
  const name = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "this client";
  const first = clientFirstName(client) || name;
  const them = pronouns?.object ?? first;
  const theirRecord = pronouns ? `${pronouns.possessive} record` : `${first}'s record`;

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const writePlan = () => {
    if (!clientId || !onOpenPlanner) return;
    requestPlanner({ kind: "new-note", client: { id: clientId, name }, noteKind: "plan" });
    onOpenPlanner();
  };
  // Planner rework: add a line to the note being built about this client,
  // without writing a plan yet.
  const jot = () => {
    if (!clientId || !onOpenPlanner) return;
    requestPlanner({ kind: "jot", client: { id: clientId, name } });
    onOpenPlanner();
  };
  const editNote = (noteId: string) => {
    if (!onOpenPlanner) return;
    requestPlanner({ kind: "open-note", noteId });
    onOpenPlanner();
  };
  const takeOff = async (n: SharedNote) => {
    if (!clientId) return;
    setBusy(true);
    setFailure(null);
    try {
      await removeSharedNote(clientId, n.id);
      setConfirming(null);
    } catch (err) {
      console.warn("[notes] remove shared note failed:", err);
      setFailure(noteErrorMessage(err, "delete"));
    } finally {
      setBusy(false);
    }
  };

  const canWrite = Boolean(onOpenPlanner && clientId);

  return (
    <section className="cx-card snc" data-testid="shared-notes" {...anchorProps(anchor)}>
      <CardHead
        eyebrow="Plans from the team"
        icon={NotebookPen}
        actions={
          canWrite ? (
            <>
              {/* The jot strip in this panel does what "Jot a note" does, in place. */}
              {children ? null : (
                <Btn icon={NotebookPen} onClick={jot}>
                  Jot a note
                </Btn>
              )}
              <Btn variant="live" icon={Plus} onClick={writePlan}>
                Write a plan
              </Btn>
            </>
          ) : null
        }
      />

      {error ? (
        <Meta>{error}</Meta>
      ) : loading ? (
        <Meta>Loading plans…</Meta>
      ) : notes.length === 0 ? (
        <EmptyLine>
          {`Nothing shared yet. A trainer writes a plan in their notes in Relay — a routine change, an injury plan, a retention idea — and switches on Share; it appears here for everyone who coaches ${them}.`}
        </EmptyLine>
      ) : (
        <ul className="snc-list">
          {notes.map((n) => {
            const long = n.body.length > FOLD_AT || n.body.split("\n").length > 5 || n.links.length > 3;
            const open = expanded.has(n.id);
            const mine = Boolean(uid) && n.authorId === uid;
            const canTakeOff = !mine && canRemoveSharedNote(authTrainer, uid, n, studioId);
            return (
              <li key={n.id} className="snc-item">
                <div className="snc-item__head">
                  <span className="snc-kind">
                    <span className="snc-dot" data-kind={n.kind} aria-hidden="true" />
                    {NOTE_KIND_LABEL[n.kind]}
                  </span>
                  <Meta>
                    {mine ? "You" : n.authorName} · {whenLabel(n.updatedAt)}
                  </Meta>
                </div>
                <p className="snc-title">{n.title}</p>
                {n.body && (
                  // A long plan folds to its first lines until "Read all"; the
                  // whole of it is one tap away.
                  <div className="snc-body" data-folded={long && !open ? "" : undefined}>
                    {/* Drawn, never injected: the safe subset in ./format.ts. */}
                    <NoteBody body={n.body} />
                  </div>
                )}
                {n.links.length > 0 && (!long || open) && (
                  <ul className="snc-links">
                    {n.links.map((l) => (
                      <li key={l.url}>
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="snc-link">
                          <ExternalLink size={14} aria-hidden="true" />
                          {l.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}

                {(long || (mine && onOpenPlanner) || canTakeOff) && (
                  <div className="snc-actions">
                    {long && (
                      <Btn
                        variant="quiet"
                        aria-expanded={open}
                        onClick={() =>
                          setExpanded((s) => {
                            const next = new Set(s);
                            if (next.has(n.id)) next.delete(n.id);
                            else next.add(n.id);
                            return next;
                          })
                        }
                      >
                        {open ? "Show less" : "Read all"}
                      </Btn>
                    )}
                    {mine && onOpenPlanner && (
                      <Btn variant="quiet" icon={Pencil} onClick={() => editNote(n.id)}>
                        Edit in Relay
                      </Btn>
                    )}
                    {canTakeOff && confirming !== n.id && (
                      <Btn
                        variant="quiet"
                        onClick={() => {
                          setFailure(null);
                          setConfirming(n.id);
                        }}
                      >
                        Take off the record
                      </Btn>
                    )}
                  </div>
                )}

                {confirming === n.id && (
                  <div role="alertdialog" aria-label="Take this plan off the record?" className="snc-confirm">
                    <p className="snc-confirm__text">
                      Take “{n.title}” off {theirRecord}? {n.authorName} keeps their own copy in their notes in Relay.
                    </p>
                    {failure && <p className="snc-confirm__failure">{failure}</p>}
                    <div className="snc-actions">
                      <Btn disabled={busy} onClick={() => takeOff(n)}>
                        {busy ? "Taking it off…" : "Take it off"}
                      </Btn>
                      <Btn variant="quiet" disabled={busy} onClick={() => setConfirming(null)} autoFocus>
                        Keep it
                      </Btn>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {children ? <div className="snc-more">{children}</div> : null}
    </section>
  );
}
