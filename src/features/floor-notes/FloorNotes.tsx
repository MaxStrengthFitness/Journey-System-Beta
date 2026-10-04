import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, History } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { useUnsavedChanges } from "../unsaved-changes";
import {
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
 * Typing is never lost unannounced: the note box and each open update, close
 * or edit box join the unsaved-changes registry. The whole list is keyed by
 * studio and machine, so a draft never follows a trainer onto the next one.
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
  /** Leads this studio: may change anyone's words and take a note off the list. */
  canLead: boolean;
  /**
   * The machine's lineage keys (sharedKeysFor), which other studios find a
   * shared note under. Without them there is no "Offer to all MSF studios".
   */
  shareKeys?: string[];
  /** Clock, for the tests. */
  nowMs?: number;
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
    () => (read.state === "ready" ? earlierNotes(earlier ?? {}, threads) : []),
    [read.state, earlier, threads],
  );
  const [showClosed, setShowClosed] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const canWrite = Boolean(studioId && writerName);
  const { offerSwitch, catalogNoteSwitch } = useFloorNoteSwitches({
    studioId,
    studioName,
    keys: shareKeys ?? [],
    uid,
    canLead,
    canWrite,
  });

  useUnsavedChanges(draft.trim() !== "", `${studioName}’s note on ${machineName}`, { onDiscard: () => setDraft("") });

  const add = async (body: string, copiedFrom?: EarlierNote["key"]) => {
    if (!studioId || !writerName) return false;
    setSaving(true);
    try {
      await addFloorNote({ studioId, machineId, machineName, body, writer: { name: writerName }, copiedFrom });
      return true;
    } catch (err) {
      console.error("[floor-notes] add failed:", err);
      toast.error("Couldn't save the note. Check the connection and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const mayChange = (n: FloorNote) => canLead || (uid !== null && n.authorId === uid);

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
            value={draft}
            placeholder={`Something about the ${machineName} here: the pin that sticks, the footstool, ours sits two notches lower.`}
            onChange={(e) => setDraft(e.target.value)}
          />
          {draft.trim() !== "" && (
            <div className="fn-row">
              <button
                type="button"
                className="fn-btn fn-btn--primary"
                disabled={saving}
                onClick={async () => {
                  if (await add(draft)) {
                    setDraft("");
                    toast.success("Note added. Everyone at the studio sees it.");
                  }
                }}
              >
                {saving ? "Saving…" : "Add note"}
              </button>
              <button type="button" className="fn-btn" onClick={() => setDraft("")}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {read.state === "loading" && <p className="fn-quiet">Loading the floor’s notes…</p>}
      {read.state === "failed" && (
        <p className="fn-quiet" role="status">
          Couldn’t load the floor’s notes. They aren’t lost; check the connection.
        </p>
      )}
      {read.state === "ready" && threads.length === 0 && older.length === 0 && (
        <p className="fn-quiet">No notes on the {machineName} at {studioName} yet.</p>
      )}

      {open.length > 0 && (
        <ul className="fn-list" aria-label={`Open notes on the ${machineName}`}>
          {open.map((t) => (
            <ThreadItem
              key={t.id}
              thread={t}
              studioId={studioId}
              machineName={machineName}
              now={now}
              writerName={writerName}
              mayChange={mayChange}
              offerSwitch={offerSwitch}
            />
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <div className="fn-closed">
          <button
            type="button"
            className="fn-fold"
            aria-expanded={showClosed}
            onClick={() => setShowClosed((v) => !v)}
          >
            <ChevronDown size={14} aria-hidden className="fn-fold__chev" />
            Closed · {closed.length}
          </button>
          {showClosed && (
            <ul className="fn-list" aria-label={`Closed notes on the ${machineName}`}>
              {closed.map((t) => (
                <ThreadItem
                  key={t.id}
                  thread={t}
                  studioId={studioId}
                  machineName={machineName}
                  now={now}
                  writerName={writerName}
                  mayChange={mayChange}
                />
              ))}
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

type Mode = null | "update" | "close" | "edit" | "remove";

function ThreadItem({
  thread,
  studioId,
  machineName,
  now,
  writerName,
  mayChange,
  offerSwitch,
}: {
  thread: FloorThread;
  studioId: string | null;
  machineName: string;
  now: number;
  writerName: string | null;
  mayChange: (n: FloorNote) => boolean;
  offerSwitch?: (note: FloorNote) => ReactNode;
}) {
  const toast = useToast();
  const { root, updates, closed } = thread;
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const canWrite = Boolean(studioId && writerName);
  const writer = { name: writerName ?? "" };
  const typing = (mode === "update" || mode === "close" || mode === "edit") && text.trim() !== "" && text !== (mode === "edit" ? root.body : "");

  useUnsavedChanges(typing, `An update on the ${machineName}`, { onDiscard: () => setMode(null) });

  const start = (m: Mode) => {
    setMode(m);
    setText(m === "edit" ? root.body : "");
  };

  const run = async (work: () => Promise<void>, done: string) => {
    if (!studioId) return;
    setBusy(true);
    try {
      await work();
      setMode(null);
      setText("");
      toast.success(done);
    } catch (err) {
      console.error("[floor-notes] write failed:", err);
      toast.error("Couldn't save that. Check the connection and try again.");
    } finally {
      setBusy(false);
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
              disabled={busy}
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
          {mayChange(root) && (
            <>
              <button type="button" className="fn-btn fn-btn--quiet" onClick={() => start("edit")}>
                Change the words
              </button>
              <button type="button" className="fn-btn fn-btn--quiet" onClick={() => start("remove")}>
                Take off the list
              </button>
            </>
          )}
          {!closed && offerSwitch?.(root)}
        </div>
      )}

      {(mode === "update" || mode === "close" || mode === "edit") && (
        <div className="fn-compose">
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
            onChange={(e) => setText(e.target.value)}
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
            <button type="button" className="fn-btn" disabled={busy} onClick={() => setMode(null)}>
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
            <button type="button" className="fn-btn" disabled={busy} onClick={() => setMode(null)}>
              Keep it
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

const msOfNote = (n: FloorNote) => msOf(n.createdAt) ?? msOf(n.updatedAt);
