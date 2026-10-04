import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, History, MoreHorizontal } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { useUnsavedChanges } from "../unsaved-changes";
import {
  copiedKeysOf,
  earlierNotes,
  floorThreads,
  msOf,
  whenWords,
  type EarlierNote,
  type FloorNote,
  type FloorThread,
} from "./floor-notes";
import { addFloorNote, addFloorUpdate, archiveFloorNote, closeFloorNote, editFloorNote, reopenFloorNote } from "./store";
import type { FloorNotesRead } from "./useFloorNotes";
import { useFloorNoteSwitches } from "./useFloorNoteSwitches";
import "./floor-notes.css";

/**
 * THE FLOOR'S NOTES ON ONE MACHINE — the list a studio keeps about the unit
 * in its building (notes round, Oct 3 2026; AJ's answer 2A: "merge the three
 * places into one list per machine, with dates and a history, the way client
 * notes became threads"). The pure half and the reasons are floor-notes.ts.
 *
 * One note box, then the open notes (each with its updates, oldest first,
 * and Add an update · Close), then the closed ones folded, then whatever the
 * three old boxes still hold as Earlier notes, read-only, with Copy into the
 * list. Mounted by the machine's Catalog page and by My Studio → Machines;
 * the screen reads the studio's notes ONCE (useFloorNotes) and hands them in.
 *
 * Typing is never lost unannounced: the note box and every update, close or
 * edit box join the unsaved-changes registry. Those boxes' words are held
 * HERE, not in the note they belong to, because another iPad can close a
 * note or take it off the list mid-sentence (the review, Oct 3 2026): a note
 * closed elsewhere opens the closed list so the words stay on screen, and a
 * note gone altogether leaves its words in a card that saves them as a new
 * note or lets them go. The whole list is keyed by studio and machine, so a
 * draft never follows a trainer onto the next one.
 */
export interface FloorNotesProps {
  studioId: string | null;
  studioName: string;
  machineId: string;
  machineName: string;
  read: FloorNotesRead;
  /** What the three old boxes hold for this machine. */
  earlier?: Parameters<typeof earlierNotes>[0];
  /** The signed-in person's Auth uid, for "yours"; null reads only. */
  uid: string | null;
  /** Their name as the floor knows it; null when they can't write here. */
  writerName: string | null;
  /**
   * May change anyone's words and take any note off the list: the rules'
   * isStudioOwnerOrHeadTrainer, so pass leadsStudioPerRules, never a wider
   * "leads" answer (the review, Oct 3 2026).
   */
  canLead: boolean;
  /**
   * The machine's lineage keys (sharedKeysFor), which other studios find a
   * shared note under. Without them there is no "Offer to all MSF studios".
   */
  shareKeys?: string[];
  /** Clock, for the tests. */
  nowMs?: number;
}

type Mode = "update" | "close" | "edit" | "remove";

/** What someone has started on one note: held by the list, not the note. */
interface Draft {
  mode: Mode;
  text: string;
  /** The note's words when the draft began: the edit's starting point, and the orphan card's reminder. */
  about: string;
  /** A write is on its way: the note may leave the open list before it lands, and that is not an orphan. */
  sending?: boolean;
}

const isTyping = (d: Draft | undefined): boolean =>
  Boolean(
    d &&
      (d.mode === "update" || d.mode === "close" || d.mode === "edit") &&
      d.text.trim() !== "" &&
      (d.mode !== "edit" || d.text !== d.about),
  );

/** "That isn't yours to change" for a refusal; the connection only when it may be the connection. */
function failedWords(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "permission-denied"
    ? "That isn't yours to change here."
    : "Couldn't save that. Check the connection and try again.";
}

export function FloorNotes(props: FloorNotesProps) {
  return <FloorNotesBody key={`${props.studioId ?? ""}:${props.machineId}`} {...props} />;
}

function FloorNotesBody({
  studioId,
  studioName,
  machineId,
  machineName,
  read,
  earlier,
  uid,
  writerName,
  canLead,
  shareKeys,
  nowMs,
}: FloorNotesProps) {
  const now = nowMs ?? Date.now();
  const toast = useToast();
  const threads = useMemo(() => floorThreads(read.notes, machineId), [read.notes, machineId]);
  const open = threads.filter((t) => !t.closed);
  const closed = threads.filter((t) => t.closed);
  const older = useMemo(
    () =>
      read.state === "ready" ? earlierNotes(earlier ?? {}, threads, copiedKeysOf(read.notes, machineId)) : [],
    [read.state, read.notes, earlier, threads, machineId],
  );
  const [showClosed, setShowClosed] = useState(false);
  const [box, setBox] = useState("");
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const canWrite = Boolean(studioId && writerName);
  const { offerSwitch, catalogNoteSwitch } = useFloorNoteSwitches({
    studioId,
    studioName,
    keys: shareKeys ?? [],
    uid,
    canLead,
    canWrite,
  });

  const patchDraft = useCallback((id: string, next: Draft | null | ((d: Draft) => Draft)) => {
    setDrafts((prev) => {
      const copy = { ...prev };
      if (next === null) delete copy[id];
      else if (typeof next === "function") {
        if (!prev[id]) return prev;
        copy[id] = next(prev[id]);
      } else copy[id] = next;
      return copy;
    });
  }, []);

  useUnsavedChanges(box.trim() !== "", `${studioName}’s note on ${machineName}`, { onDiscard: () => setBox("") });
  useUnsavedChanges(Object.values(drafts).some(isTyping), `An update on the ${machineName}`, {
    onDiscard: () => setDrafts({}),
  });

  const add = async (body: string, copiedFrom?: EarlierNote["key"]) => {
    if (!studioId || !writerName) return false;
    setSaving(true);
    try {
      await addFloorNote({ studioId, machineId, machineName, body, writer: { name: writerName }, copiedFrom });
      return true;
    } catch (err) {
      console.error("[floor-notes] add failed:", err);
      toast.error(failedWords(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const mayChange = (n: FloorNote) => canLead || (uid !== null && n.authorId === uid);

  // A note closed on another iPad while someone here writes on it: the
  // closed list opens, so the words stay where they were being written.
  const closedHoldsTyping = closed.some((t) => isTyping(drafts[t.id]) && !drafts[t.id].sending);
  const closedShown = showClosed || closedHoldsTyping;
  // A note gone from the list altogether (taken off it elsewhere): its words
  // wait in a card of their own.
  const orphans = Object.entries(drafts).filter(
    ([id, d]) => isTyping(d) && !d.sending && read.state === "ready" && !threads.some((t) => t.id === id),
  );

  const item = (t: FloorThread, withOffer: boolean) => (
    <ThreadItem
      key={t.id}
      thread={t}
      studioId={studioId}
      now={now}
      writerName={writerName}
      mayChange={mayChange}
      offerSwitch={withOffer ? offerSwitch : undefined}
      draft={drafts[t.id]}
      patchDraft={patchDraft}
    />
  );

  return (
    <div className="fn" data-testid="floor-notes">
      {canWrite && (
        <div className="fn-compose">
          <label className="fn-sr" htmlFor={`fn-new-${machineId}`}>
            A note on the {machineName} at {studioName}
          </label>
          <textarea
            id={`fn-new-${machineId}`}
            className="fn-words"
            rows={2}
            value={box}
            placeholder={`What should the next person at the ${machineName} know?`}
            onChange={(e) => setBox(e.target.value)}
          />
          {box.trim() !== "" && (
            <div className="fn-row">
              <button
                type="button"
                className="fn-btn fn-btn--primary"
                disabled={saving}
                onClick={async () => {
                  if (await add(box)) {
                    setBox("");
                    toast.success("Note added. Everyone at the studio sees it.");
                  }
                }}
              >
                {saving ? "Saving…" : "Add note"}
              </button>
              <button type="button" className="fn-btn" onClick={() => setBox("")}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {orphans.map(([id, d]) => (
        <div key={id} className="fn-confirm" role="group" aria-label="Words not saved yet" data-testid="floor-note-orphan">
          <p className="fn-quiet">
            The note you were writing on (“{d.about}”) was taken off the list on another iPad. Your words aren’t saved yet.
          </p>
          <textarea
            className="fn-words"
            rows={2}
            aria-label="Your words"
            value={d.text}
            onChange={(e) => patchDraft(id, (x) => ({ ...x, text: e.target.value }))}
          />
          <div className="fn-row">
            <button
              type="button"
              className="fn-btn fn-btn--primary"
              disabled={saving || !canWrite}
              onClick={async () => {
                if (await add(d.text)) {
                  patchDraft(id, null);
                  toast.success("Saved as a new note.");
                }
              }}
            >
              Save as a new note
            </button>
            <button type="button" className="fn-btn" onClick={() => patchDraft(id, null)}>
              Let them go
            </button>
          </div>
        </div>
      ))}

      {read.state === "loading" && <p className="fn-quiet">Loading the floor’s notes…</p>}
      {read.state === "failed" && (
        <p className="fn-quiet" role="status">
          Couldn’t load the floor’s notes. They aren’t lost; check the connection.
        </p>
      )}
      {read.state === "ready" && threads.length === 0 && older.length === 0 && orphans.length === 0 && (
        <p className="fn-quiet">No notes on the {machineName} at {studioName} yet.</p>
      )}

      {open.length > 0 && (
        <ul className="fn-list" aria-label={`Open notes on the ${machineName}`}>
          {open.map((t) => item(t, true))}
        </ul>
      )}

      {closed.length > 0 && (
        <div className="fn-closed">
          <button
            type="button"
            className="fn-fold"
            aria-expanded={closedShown}
            disabled={closedHoldsTyping}
            onClick={() => setShowClosed((v) => !v)}
          >
            <ChevronDown size={14} aria-hidden className="fn-fold__chev" />
            Closed · {closed.length}
          </button>
          {closedShown && (
            <ul className="fn-list" aria-label={`Closed notes on the ${machineName}`}>
              {closed.map((t) => item(t, false))}
            </ul>
          )}
        </div>
      )}

      {older.length > 0 && (
        <section className="fn-earlier" aria-label="Earlier notes">
          <h4 className="fn-earlier__h">
            <History size={13} aria-hidden /> Earlier notes
          </h4>
          <p className="fn-quiet">
            Written before notes had dates. Copy one into the list to give it a date and a history.
          </p>
          <ul className="fn-list">
            {older.map((e) => (
              <li key={e.key} className="fn-note fn-note--earlier">
                <p className="fn-note__from">{e.label}</p>
                <p className="fn-note__body">{e.text}</p>
                {(e.by || e.atMs) && (
                  <p className="fn-note__meta">{[e.by, whenWords(e.atMs, now)].filter(Boolean).join(" · ")}</p>
                )}
                <div className="fn-row">
                  {e.copied ? (
                    <span className="fn-quiet">Copied into the list above.</span>
                  ) : (
                    canWrite && (
                      <button
                        type="button"
                        className="fn-btn"
                        disabled={saving}
                        onClick={async () => {
                          if (await add(e.text, e.key)) toast.success("Copied into the list, dated today.");
                        }}
                      >
                        Copy into the list
                      </button>
                    )
                  )}
                  {e.key === "catalog-note" && catalogNoteSwitch?.(e)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ThreadItem({
  thread,
  studioId,
  now,
  writerName,
  mayChange,
  offerSwitch,
  draft,
  patchDraft,
}: {
  thread: FloorThread;
  studioId: string | null;
  now: number;
  writerName: string | null;
  mayChange: (n: FloorNote) => boolean;
  offerSwitch?: (note: FloorNote) => ReactNode;
  draft: Draft | undefined;
  patchDraft: (id: string, next: Draft | null | ((d: Draft) => Draft)) => void;
}) {
  const toast = useToast();
  const { root, updates, closed } = thread;
  const [more, setMore] = useState(false);
  const canWrite = Boolean(studioId && writerName);
  const writer = { name: writerName ?? "" };
  // A note closed (here or elsewhere) while an update or a close was being
  // written: the words are kept and go on it as an update.
  const closedUnderYou = closed && Boolean(draft) && !draft!.sending && (draft!.mode === "update" || draft!.mode === "close");
  const mode: Mode | null = draft ? (closedUnderYou ? "update" : draft.mode) : null;
  const text = draft?.text ?? "";
  const busy = Boolean(draft?.sending);

  const start = (m: Mode) => {
    setMore(false);
    patchDraft(root.id, { mode: m, text: m === "edit" ? root.body : "", about: root.body });
  };
  const stop = () => patchDraft(root.id, null);
  // What sits behind More: the words and Take off the list for its author or
  // a leader, and the offer to every MSF studio. Two buttons on a note, not five.
  const offer = !closed ? offerSwitch?.(root) : null;
  const hasMore = mayChange(root) || Boolean(offer);

  const run = async (work: () => Promise<void>, done: string) => {
    if (!studioId) return;
    const sendingOne = Boolean(draft);
    if (sendingOne) patchDraft(root.id, (d) => ({ ...d, sending: true }));
    try {
      await work();
      if (sendingOne) stop();
      toast.success(done);
    } catch (err) {
      console.error("[floor-notes] write failed:", err);
      if (sendingOne) patchDraft(root.id, (d) => ({ ...d, sending: false }));
      toast.error(failedWords(err));
    }
  };

  const meta = (n: FloorNote) => [n.authorName, whenWords(msOfNote(n), now)].filter(Boolean).join(" · ");

  return (
    <li className={`fn-note${closed ? " fn-note--closed" : ""}`}>
      <p className="fn-note__body">{root.body}</p>
      <p className="fn-note__meta">{meta(root)}</p>
      {updates.length > 0 && (
        <ol className="fn-updates" aria-label="Updates">
          {updates.map((u) => (
            <li key={u.id} className="fn-update">
              <p className="fn-note__body">{u.body}</p>
              <p className="fn-note__meta">{meta(u)}</p>
            </li>
          ))}
        </ol>
      )}
      {closed && root.resolvedBy && (
        <p className="fn-note__meta fn-note__closedby">
          Closed by {root.resolvedBy.name || "someone"}
          {whenWords(msOf(root.resolvedAt), now) ? ` · ${whenWords(msOf(root.resolvedAt), now)}` : ""}
        </p>
      )}

      {canWrite && mode === null && (
        <div className="fn-row">
          {closed ? (
            <button
              type="button"
              className="fn-btn"
              onClick={() => run(() => reopenFloorNote(studioId!, root.id), "Opened again.")}
            >
              Open again
            </button>
          ) : (
            <>
              <button type="button" className="fn-btn" onClick={() => start("update")}>
                Add an update
              </button>
              <button type="button" className="fn-btn" onClick={() => start("close")}>
                Close
              </button>
            </>
          )}
          {hasMore && (
            <button
              type="button"
              className="fn-btn fn-btn--quiet"
              aria-expanded={more}
              aria-label={more ? "Less for this note" : "More for this note"}
              onClick={() => setMore((v) => !v)}
            >
              <MoreHorizontal size={16} aria-hidden />
              More
            </button>
          )}
          {!hasMore && root.shared && <span className="fn-quiet">Shared with all MSF studios</span>}
        </div>
      )}

      {canWrite && mode === null && more && (
        <div className="fn-row fn-more">
          {mayChange(root) && (
            <>
              <button type="button" className="fn-btn" onClick={() => start("edit")}>
                Change the words
              </button>
              <button type="button" className="fn-btn" onClick={() => start("remove")}>
                Take off the list
              </button>
            </>
          )}
          {offer}
        </div>
      )}

      {(mode === "update" || mode === "close" || mode === "edit") && (
        <div className="fn-compose">
          {closedUnderYou && (
            <p className="fn-quiet" role="status">
              This note was closed while you were writing. Your words go on it as an update.
            </p>
          )}
          <label className="fn-sr" htmlFor={`fn-${mode}-${root.id}`}>
            {mode === "update" ? "The update" : mode === "close" ? "What happened" : "The note's words"}
          </label>
          <textarea
            id={`fn-${mode}-${root.id}`}
            className="fn-words"
            rows={2}
            autoFocus
            value={text}
            placeholder={
              mode === "update"
                ? "What's changed: maintenance booked, sprayed the pin, still sticking."
                : mode === "close"
                  ? "What happened, if anyone will want to know (optional): the pin was replaced."
                  : undefined
            }
            onChange={(e) => patchDraft(root.id, (d) => ({ ...d, text: e.target.value }))}
          />
          <div className="fn-row">
            <button
              type="button"
              className="fn-btn fn-btn--primary"
              disabled={busy || (mode !== "close" && text.trim() === "")}
              onClick={() =>
                mode === "update"
                  ? run(() => addFloorUpdate({ studioId: studioId!, root, body: text, writer }).then(() => undefined), "Update added.")
                  : mode === "close"
                    ? run(() => closeFloorNote({ studioId: studioId!, root, writer, why: text }), "Closed. It stays in the history.")
                    : run(() => editFloorNote(studioId!, root.id, text), "Words changed.")
              }
            >
              {busy ? "Saving…" : mode === "update" ? "Add update" : mode === "close" ? "Close the note" : "Save the words"}
            </button>
            <button type="button" className="fn-btn" disabled={busy} onClick={stop}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "remove" && (
        <div className="fn-confirm" role="group" aria-label="Take this note off the list">
          <p className="fn-quiet">
            Take it off the list for everyone? Closing keeps it in the history; this is for a note that should never have
            been written.
          </p>
          <div className="fn-row">
            <button
              type="button"
              className="fn-btn fn-btn--danger"
              disabled={busy}
              onClick={() => run(() => archiveFloorNote(studioId!, root.id), "Taken off the list.")}
            >
              Take it off
            </button>
            <button type="button" className="fn-btn" disabled={busy} onClick={stop}>
              Keep it
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

const msOfNote = (n: FloorNote) => msOf(n.createdAt) ?? msOf(n.updatedAt);
