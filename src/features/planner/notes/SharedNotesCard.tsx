import { useState } from "react";
import { NotebookPen, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { auth } from "../../../firebase";
import type { Client, Trainer } from "../../../types";
import { requestPlanner } from "../intent";
import { canRemoveSharedNote, clientStudioId } from "./access";
import { useSharedNotes } from "./hooks";
import { removeSharedNote } from "./mutations";
import { noteErrorMessage, whenLabel } from "./notes";
import { NOTE_KIND_LABEL, type NoteKind, type SharedNote } from "./types";

/**
 * PLANS FROM THE TEAM — the notes trainers have shared onto this client's
 * record, at the top of the profile's Goals section.
 *
 * Round: Learning + Planner, Sep 2026. A note is written in its author's
 * Planner (Notes tab) and copied here when they switch on Share; only the
 * author changes it, from there. Reading follows the client, like InBody:
 * whoever can open the profile sees the card.
 *
 *   Write a plan         opens the author's Planner with a new plan about
 *                        this client already started
 *   Edit in your Planner the author's own notes
 *   Take off the record  the studio's leaders and administrators; the
 *                        author keeps their own copy
 */

const SUB = "font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400";

const KIND_DOT: Record<NoteKind, string> = {
  note: "bg-slate-400",
  plan: "bg-sky-500",
  routine: "bg-emerald-500",
  retention: "bg-orange-500",
  injury: "bg-amber-500",
};

/** Long enough that it is worth folding. */
const FOLD_AT = 320;

export interface SharedNotesCardProps {
  client: Client;
  authTrainer: Trainer | null;
  /** Switches to the Planner. Without it, the card only reads. */
  onOpenPlanner?: () => void;
}

export function SharedNotesCard({ client, authTrainer, onOpenPlanner }: SharedNotesCardProps) {
  const clientId = client.id ?? null;
  const { notes, loading, error } = useSharedNotes(clientId);
  const uid = auth.currentUser?.uid ?? null;
  const studioId = clientStudioId(client);
  const name = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "this client";
  const first = client.firstName?.trim() || name;

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const writePlan = () => {
    if (!clientId || !onOpenPlanner) return;
    requestPlanner({ kind: "new-note", client: { id: clientId, name }, noteKind: "plan" });
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={SUB}>Plans from the team</span>
        {onOpenPlanner && clientId && (
          <button
            type="button"
            onClick={writePlan}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 text-[11px] font-black uppercase tracking-widest text-sky-700 hover:bg-sky-500/15 dark:text-sky-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Write a plan
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
        {error ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
        ) : loading ? (
          <p className="text-sm text-slate-400">Loading plans…</p>
        ) : notes.length === 0 ? (
          <div className="flex items-start gap-3">
            <NotebookPen className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nothing shared yet. A trainer writes a plan in their Planner — a routine change, an injury plan, a
              retention idea — and switches on Share; it appears here for everyone who coaches {first}.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => {
              const long = n.body.length > FOLD_AT || n.body.split("\n").length > 5;
              const open = expanded.has(n.id);
              const mine = Boolean(uid) && n.authorId === uid;
              const canTakeOff = !mine && canRemoveSharedNote(authTrainer, uid, n, studioId);
              return (
                <li key={n.id} className="min-w-0 rounded-xl bg-white p-3 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                      <span className={cn("h-2 w-2 rounded-full", KIND_DOT[n.kind])} aria-hidden />
                      {NOTE_KIND_LABEL[n.kind]}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {mine ? "You" : n.authorName} · {whenLabel(n.updatedAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-[15px] font-bold text-slate-900 [overflow-wrap:anywhere] dark:text-white">
                    {n.title}
                  </p>
                  {n.body && (
                    <p
                      className={cn(
                        "mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 [overflow-wrap:anywhere] dark:text-slate-300",
                        long && !open && "line-clamp-5",
                      )}
                    >
                      {n.body}
                    </p>
                  )}

                  {(long || (mine && onOpenPlanner) || canTakeOff) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {long && (
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() =>
                            setExpanded((s) => {
                              const next = new Set(s);
                              if (next.has(n.id)) next.delete(n.id);
                              else next.add(n.id);
                              return next;
                            })
                          }
                          className="inline-flex min-h-10 items-center rounded-lg px-2 text-[11px] font-black uppercase tracking-widest text-sky-700 hover:bg-sky-500/10 dark:text-sky-300"
                        >
                          {open ? "Show less" : "Read all"}
                        </button>
                      )}
                      {mine && onOpenPlanner && (
                        <button
                          type="button"
                          onClick={() => editNote(n.id)}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit in your Planner
                        </button>
                      )}
                      {canTakeOff && confirming !== n.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setFailure(null);
                            setConfirming(n.id);
                          }}
                          className="inline-flex min-h-10 items-center rounded-lg px-2 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          Take off the record
                        </button>
                      )}
                    </div>
                  )}

                  {confirming === n.id && (
                    <div
                      role="alertdialog"
                      aria-label="Take this plan off the record?"
                      className="mt-2 flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
                    >
                      <p className="text-sm text-slate-700 dark:text-slate-200">
                        Take “{n.title}” off {first}'s record? {n.authorName} keeps their own copy in their Planner.
                      </p>
                      {failure && <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{failure}</p>}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => takeOff(n)}
                          className="inline-flex min-h-10 items-center rounded-xl border border-amber-600/40 bg-amber-500/15 px-3 text-[11px] font-black uppercase tracking-widest text-amber-800 disabled:opacity-50 dark:text-amber-300"
                        >
                          {busy ? "Taking it off…" : "Take it off"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirming(null)}
                          className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-3 text-[11px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                        >
                          Keep it
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
