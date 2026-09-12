import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Folder, FolderPlus, Pin, Plus, Search, Share2, StickyNote, X } from "lucide-react";
import { useActiveStudio } from "../../../ActiveStudioContext";
import { auth } from "../../../firebase";
import type { Client, Trainer } from "../../../types";
import type { PlannerIntent } from "../intent";
import { dropDraft, stashDraft, stashedDraft, stashedDrafts, type StashedDraft } from "./draft-stash";
import { useTrainerNotes } from "./hooks";
import { createNoteFolder, deleteNote, deleteNoteFolder, newNoteId, renameNoteFolder } from "./mutations";
import {
  blankDraft,
  clientLabel,
  effectiveTitle,
  excerpt,
  folderCounts,
  noteErrorMessage,
  noteListItems,
  validFolderName,
  whenLabel,
  type NoteListItem,
  type NotesView,
} from "./notes";
import { NOTE_KIND_LABEL, NOTE_KINDS, type NoteDraft, type NoteKind, type TrainerNote } from "./types";
import { NoteEditor } from "./NoteEditor";
import "./notes.css";

/**
 * NOTES — the Planner's third tab. A trainer's own notes, in folders, linked
 * to the clients they are about; one can be shared onto a client's record.
 *
 * Round: Learning + Planner, Sep 2026. See ./README.md.
 *
 * Two panes on a landscape iPad (the list, and the open note beside it); one
 * at a time in portrait, where a note opens over the list and Back returns.
 * Notes follow the trainer, not the studio: the same list at every location.
 */

const KIND_PLURAL: Record<NoteKind, string> = {
  note: "Notes",
  plan: "Plans",
  routine: "Routine changes",
  retention: "Retention",
  injury: "Injury plans",
};

/**
 * Where the trainer was — the folder and the open note — for the session,
 * like the Planner's tab, so going to a client's profile and back lands on
 * the same note. Keyed by uid: the next trainer on a shared iPad starts fresh.
 */
const remembered: { uid: string | null; view: NotesView; selected: string | null } = {
  uid: null,
  view: { kind: "all" },
  selected: null,
};
const recall = (uid: string | null) =>
  remembered.uid === uid ? remembered : { uid, view: { kind: "all" } as NotesView, selected: null };
function remember(uid: string | null, patch: Partial<{ view: NotesView; selected: string | null }>) {
  if (remembered.uid !== uid) Object.assign(remembered, { uid, view: { kind: "all" }, selected: null });
  Object.assign(remembered, patch);
}

const BLANK: NoteDraft = blankDraft();

const sameView = (a: NotesView, b: NotesView) =>
  a.kind === b.kind && (a.kind !== "folder" || a.folderId === (b as { folderId: string }).folderId);

export interface NotesPanelProps {
  authTrainer?: Trainer | null;
  /** Clients the app already holds — today's roster, and the open profile. */
  clients?: Client[];
  onOpenClient?: (clientId: string) => void;
  /** Arrived from a client's profile: start a plan, or open a note. */
  intent?: PlannerIntent | null;
}

export function NotesPanel({ authTrainer, clients, onOpenClient, intent }: NotesPanelProps) {
  // The Firebase Auth uid: notes live at trainers/{uid}/notes, private by path.
  const uid = auth.currentUser?.uid ?? null;
  const { activeStudioId } = useActiveStudio();
  const { notes, folders, loading, error } = useTrainerNotes(uid);

  const [view, setViewState] = useState<NotesView>(() => recall(uid).view);
  const setView = (v: NotesView) => {
    remember(uid, { view: v });
    setViewState(v);
  };
  const [kind, setKind] = useState<NoteKind | "all">("all");
  const [queryText, setQueryText] = useState("");
  const [selected, setSelectedState] = useState<string | null>(() => recall(uid).selected);
  const setSelected = useCallback(
    (id: string | null) => {
      remember(uid, { selected: id });
      setSelectedState(id);
    },
    [uid],
  );
  const [pendingNew, setPendingNew] = useState<{ id: string; baseline: NoteDraft } | null>(null);
  const [stashVersion, setStashVersion] = useState(0);
  const [panelError, setPanelError] = useState<string | null>(null);

  const roster = clients ?? [];
  const rosterNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of roster) if (c.id) m.set(c.id, `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim());
    return m;
  }, [roster]);
  const nameOf = useCallback((id: string) => rosterNames.get(id) ?? "", [rosterNames]);

  /* --------------------------- opening ---------------------------- */

  const startNew = useCallback(
    (client?: { id: string; name: string } | null, noteKind?: NoteKind) => {
      if (!uid) return;
      const baseline = blankDraft(client ?? null);
      if (noteKind) baseline.kind = noteKind;
      const here = recall(uid).view;
      if (here.kind === "folder") baseline.folderId = here.folderId;
      const id = newNoteId(uid);
      setPendingNew({ id, baseline });
      setSelected(id);
    },
    [uid, setSelected],
  );

  // From a client's profile. Read once, on arrival.
  useEffect(() => {
    if (!intent) return;
    if (intent.kind === "new-note") startNew(intent.client, intent.noteKind ?? "plan");
    else setSelected(intent.noteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const saved = selected ? notes.find((n) => n.id === selected) ?? null : null;
  const restored = selected ? stashedDraft(uid, selected) : null;
  const isPendingNew = Boolean(selected && pendingNew?.id === selected);
  // An unsaved edit to a SAVED note waits for the notes to load: saving it
  // before the saved version is known would lose what the save compares
  // against — whether it was shared, and with whom — and leave a copy on a
  // client's record after Share was switched off (review fix).
  const restoredReady = Boolean(restored && (restored.isNew || !loading));
  const editorOpen = Boolean(selected && (saved || restoredReady || isPendingNew));

  // A new note, once its save comes back, is simply a note.
  useEffect(() => {
    if (pendingNew && notes.some((n) => n.id === pendingNew.id)) setPendingNew(null);
  }, [notes, pendingNew]);

  // The open note was deleted on another iPad (with nothing typed here).
  useEffect(() => {
    if (selected && !loading && !editorOpen) setSelected(null);
  }, [selected, loading, editorOpen]);

  /* ---------------------------- drafts ---------------------------- */

  // The list only needs to redraw when a note gains or loses its "unsaved"
  // mark, or a never-saved note's title changes — not on every keystroke.
  const stashFor = useCallback(
    (noteId: string, entry: StashedDraft | null) => {
      if (!uid) return;
      const before = stashedDraft(uid, noteId);
      if (entry) stashDraft(uid, noteId, entry);
      else dropDraft(uid, noteId);
      const titleOf = (e: StashedDraft | null) => (e?.isNew ? effectiveTitle(e.draft) : "");
      if (Boolean(before) !== Boolean(entry) || titleOf(before) !== titleOf(entry)) {
        setStashVersion((v) => v + 1);
      }
    },
    [uid],
  );

  /* ----------------------------- list ----------------------------- */

  // The folders that exist, once known: a note left pointing at a deleted
  // folder counts as Unfiled (see inAFolder in notes.ts).
  const folderIds = useMemo(
    () => (loading || error ? undefined : new Set(folders.map((f) => f.id))),
    [folders, loading, error],
  );
  const items = useMemo(
    () => noteListItems(notes, stashedDrafts(uid), view, kind, queryText, nameOf, folderIds),
    // stashVersion stands in for the stash, which lives outside React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, uid, view, kind, queryText, nameOf, folderIds, stashVersion],
  );
  const counts = useMemo(() => folderCounts(notes, folderIds), [notes, folderIds]);
  const pinnedCount = useMemo(() => notes.filter((n) => n.pinned).length, [notes]);
  const sharedCount = useMemo(() => notes.filter((n) => n.sharedWith).length, [notes]);
  const activeFolder = view.kind === "folder" ? folders.find((f) => f.id === view.folderId) ?? null : null;

  const removeNote = async (note: TrainerNote) => {
    if (!uid) return;
    dropDraft(uid, note.id);
    setStashVersion((v) => v + 1);
    setSelected(null);
    setPanelError(null);
    try {
      await deleteNote(uid, note);
    } catch (err) {
      console.warn("[notes] delete failed:", err);
      setPanelError(noteErrorMessage(err, "delete"));
    }
  };

  const smartViews: { view: NotesView; label: string; count: number; show: boolean }[] = [
    { view: { kind: "all" }, label: "All", count: notes.length, show: true },
    { view: { kind: "pinned" }, label: "Pinned", count: pinnedCount, show: pinnedCount > 0 || view.kind === "pinned" },
    { view: { kind: "shared" }, label: "Shared", count: sharedCount, show: sharedCount > 0 || view.kind === "shared" },
    { view: { kind: "unfiled" }, label: "Unfiled", count: counts.unfiled, show: folders.length > 0 || view.kind === "unfiled" },
  ];

  const filtering = queryText.trim() !== "" || kind !== "all";

  return (
    <div className="pn" data-open={editorOpen ? "note" : "list"}>
      <aside className="pn__side" aria-label="Your notes">
        <div className="pn__head">
          <div className="pn__head-titles">
            <h2 className="pl__h2">Notes</h2>
            <p className="pl__sub">Yours alone, at every studio — unless you share one onto a client's record.</p>
          </div>
          <button type="button" className="pl__btn pl__btn--primary" onClick={() => startNew()} disabled={!uid}>
            <Plus size={15} aria-hidden />
            New note
          </button>
        </div>

        <nav className="pn__views" aria-label="Folders">
          {smartViews
            .filter((s) => s.show)
            .map((s) => (
              <button
                key={s.label}
                type="button"
                className="pn__view"
                aria-pressed={sameView(view, s.view)}
                onClick={() => setView(s.view)}
              >
                {s.label === "Pinned" && <Pin size={13} aria-hidden />}
                {s.label === "Shared" && <Share2 size={13} aria-hidden />}
                {s.label}
                <span className="pn__view-n">{s.count}</span>
              </button>
            ))}
          {folders.length > 0 && <span className="pn__views-sep" aria-hidden />}
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              className="pn__view pn__view--folder"
              aria-pressed={view.kind === "folder" && view.folderId === f.id}
              onClick={() => setView({ kind: "folder", folderId: f.id })}
            >
              <Folder size={13} aria-hidden />
              {f.name}
              <span className="pn__view-n">{counts.byFolder[f.id] ?? 0}</span>
            </button>
          ))}
          <NewFolder uid={uid} onCreated={(id) => setView({ kind: "folder", folderId: id })} onError={setPanelError} />
        </nav>

        {/* Not before the folders have loaded: "this folder is gone" would
            be a guess. */}
        {view.kind === "folder" && !loading && !error && (
          <FolderBar
            key={view.folderId}
            uid={uid}
            folder={activeFolder}
            notesInFolder={notes.filter((n) => n.folderId === view.folderId)}
            onGone={() => setView({ kind: "all" })}
            onError={setPanelError}
          />
        )}

        <div className="pn__filters">
          <label className="pn__search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search notes or clients"
              aria-label="Search notes, or the clients they are about"
            />
            {queryText && (
              <button type="button" className="pn__search-x" onClick={() => setQueryText("")} aria-label="Clear search">
                <X size={14} aria-hidden />
              </button>
            )}
          </label>
          <select
            className="pn__kind-filter"
            value={kind}
            onChange={(e) => setKind(e.target.value as NoteKind | "all")}
            aria-label="Which kind of note"
          >
            <option value="all">All kinds</option>
            {NOTE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_PLURAL[k]}
              </option>
            ))}
          </select>
        </div>

        {panelError && (
          <p className="pn__error" role="alert">
            {panelError}
            <button type="button" className="pn__error-x" onClick={() => setPanelError(null)} aria-label="Dismiss">
              <X size={14} aria-hidden />
            </button>
          </p>
        )}

        <div className="pn__list-wrap touch-pane">
          {error ? (
            <p className="pn__state">{error}</p>
          ) : loading && notes.length === 0 ? (
            <p className="pn__state">Loading your notes…</p>
          ) : items.length === 0 ? (
            notes.length === 0 && !filtering && view.kind === "all" ? (
              <div className="pl__empty">
                <p className="pl__empty-title">No notes yet</p>
                <p className="pl__empty-body">
                  Plans, routine changes, retention ideas, injury plans — write them here, link the clients they are
                  about, and file them in folders. Nobody else sees them unless you share one.
                </p>
              </div>
            ) : (
              <div className="pn__state">
                <p>{filtering ? "Nothing matches." : "Nothing here yet."}</p>
                {filtering && (
                  <button
                    type="button"
                    className="pl__btn"
                    onClick={() => {
                      setQueryText("");
                      setKind("all");
                    }}
                  >
                    Clear search
                  </button>
                )}
              </div>
            )
          ) : (
            <NoteList items={items} selected={selected} nameOf={nameOf} onOpen={setSelected} />
          )}
        </div>
      </aside>

      <section className="pn__main" aria-label={editorOpen ? "Open note" : undefined}>
        {editorOpen && uid && selected ? (
          <NoteEditor
            key={selected}
            uid={uid}
            noteId={selected}
            saved={saved}
            newBaseline={isPendingNew ? pendingNew!.baseline : restored?.baseline ?? BLANK}
            restored={restored}
            folders={folders}
            roster={roster}
            authTrainer={authTrainer ?? null}
            activeStudioId={activeStudioId}
            onDraft={(entry) => stashFor(selected, entry)}
            onClose={() => {
              dropDraft(uid, selected);
              setStashVersion((v) => v + 1);
              setPendingNew(null);
              setSelected(null);
            }}
            onDelete={removeNote}
            onBack={() => setSelected(null)}
            onOpenClient={onOpenClient}
          />
        ) : (
          <div className="pn__placeholder">
            <StickyNote size={28} aria-hidden />
            <p className="pn__placeholder-title">Pick a note, or start one</p>
            <p className="pn__placeholder-body">
              Link the clients a note is about and it turns up when you search their name. Share a note about one
              client and it goes on their record, under Goals, for the whole team.
            </p>
            <button type="button" className="pl__btn pl__btn--primary" onClick={() => startNew()} disabled={!uid}>
              <Plus size={15} aria-hidden />
              New note
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

const NoteList = memo(function NoteList({
  items,
  selected,
  nameOf,
  onOpen,
}: {
  items: NoteListItem[];
  selected: string | null;
  nameOf: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="pn__list">
      {items.map((item) => {
        const n = item.note;
        const names = n.clientIds.map((id) => clientLabel(id, n, nameOf));
        return (
          <li key={item.id}>
            <button
              type="button"
              className="pn__card"
              aria-current={selected === item.id ? "true" : undefined}
              onClick={() => onOpen(item.id)}
            >
              <span className="pn__card-top">
                <span className={`pn__kind pn__kind--${n.kind}`}>{NOTE_KIND_LABEL[n.kind]}</span>
                {n.pinned && <Pin size={13} className="pn__card-icon" aria-label="Pinned" />}
                {n.sharedWith && (
                  <span className="pn__shared">
                    <Share2 size={12} aria-hidden />
                    Shared
                  </span>
                )}
                <span className="pn__when">{item.isNew ? "Not saved yet" : whenLabel(n.updatedAt)}</span>
              </span>
              <span className="pn__card-title">{n.title || "Untitled"}</span>
              {!item.isNew && n.body && <span className="pn__card-excerpt">{excerpt(n.body)}</span>}
              {(names.length > 0 || item.unsaved) && (
                <span className="pn__card-foot">
                  {names.length > 0 && <span className="pn__card-clients">{names.join(" · ")}</span>}
                  {item.unsaved && <span className="pn__unsaved">{item.isNew ? "Draft" : "Unsaved changes"}</span>}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
});

/* ------------------------------------------------------------------ *
 * Folders
 * ------------------------------------------------------------------ */

function FolderNameForm({
  initial = "",
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = () => {
    const p = validFolderName(name);
    if (p) setProblem(p);
    else onSubmit(name);
  };
  return (
    <form
      className="pn__folder-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setProblem(null);
        }}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        placeholder="Folder name"
        aria-label="Folder name"
        aria-invalid={Boolean(problem)}
      />
      <button type="submit" className="pl__btn pl__btn--primary" disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
      <button type="button" className="pl__btn" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {problem && <p className="pn__folder-problem">{problem}</p>}
    </form>
  );
}

function NewFolder({
  uid,
  onCreated,
  onError,
}: {
  uid: string | null;
  onCreated: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button type="button" className="pn__view pn__view--add" onClick={() => setOpen(true)} disabled={!uid}>
        <FolderPlus size={14} aria-hidden />
        Folder
      </button>
    );
  }
  return (
    <FolderNameForm
      submitLabel="Add"
      busy={busy}
      onCancel={() => setOpen(false)}
      onSubmit={async (name) => {
        if (!uid) return;
        setBusy(true);
        try {
          const id = await createNoteFolder(uid, name);
          setOpen(false);
          onCreated(id);
        } catch (err) {
          console.warn("[notes] folder create failed:", err);
          onError(noteErrorMessage(err, "folder"));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function FolderBar({
  uid,
  folder,
  notesInFolder,
  onGone,
  onError,
}: {
  uid: string | null;
  folder: { id: string; name: string } | null;
  notesInFolder: TrainerNote[];
  onGone: () => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [busy, setBusy] = useState(false);

  if (!folder) {
    return (
      <div className="pn__folder-bar">
        <span className="pn__folder-name">This folder is gone.</span>
        <button type="button" className="pn__text-btn" onClick={onGone}>
          Show all notes
        </button>
      </div>
    );
  }

  const n = notesInFolder.length;
  const run = async (work: () => Promise<void>) => {
    if (!uid) return;
    setBusy(true);
    try {
      await work();
      setMode("idle");
    } catch (err) {
      console.warn("[notes] folder change failed:", err);
      onError(noteErrorMessage(err, "folder"));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "rename") {
    return (
      <div className="pn__folder-bar">
        <FolderNameForm
          initial={folder.name}
          submitLabel="Rename"
          busy={busy}
          onCancel={() => setMode("idle")}
          onSubmit={(name) => run(() => renameNoteFolder(uid!, folder.id, name))}
        />
      </div>
    );
  }

  return (
    <div className="pn__folder-bar">
      <span className="pn__folder-name">
        <Folder size={14} aria-hidden />
        {folder.name}
      </span>
      {mode === "delete" ? (
        <div className="pn__confirm" role="alertdialog" aria-label={`Delete the folder ${folder.name}?`}>
          <p>
            Delete the folder “{folder.name}”?{" "}
            {n === 0 ? "It is empty." : `Its ${n === 1 ? "note moves" : `${n} notes move`} to Unfiled — no note is deleted.`}
          </p>
          <div className="pn__confirm-actions">
            <button
              type="button"
              className="pl__btn pl__btn--danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await deleteNoteFolder(uid!, folder);
                  onGone();
                })
              }
            >
              {busy ? "Deleting…" : "Delete folder"}
            </button>
            <button type="button" className="pl__btn" disabled={busy} onClick={() => setMode("idle")} autoFocus>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <span className="pn__folder-actions">
          <button type="button" className="pn__text-btn" onClick={() => setMode("rename")}>
            Rename
          </button>
          <button type="button" className="pn__text-btn pn__text-btn--danger" onClick={() => setMode("delete")}>
            Delete folder
          </button>
        </span>
      )}
    </div>
  );
}
