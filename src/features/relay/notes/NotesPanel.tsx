import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Folder, FolderPlus, Pin, Plus, Search, Share2, StickyNote, Users, X } from "lucide-react";
import { useActiveStudio } from "../../../contexts/ActiveStudioContext";
import { leadsHere } from "../leads";
import { isEveryStudioRole } from "../../renewals/permissions";
import { auth } from "../../../firebase";
import type { Client, Trainer } from "../../../types";
import type { PlannerIntent } from "../intent";
import { dropDraft, stashDraft, stashedDraft, stashedDrafts, type StashedDraft } from "./draft-stash";
import { useNotesSharedWithMe, useTrainerNotes } from "./hooks";
import { createNoteFolder, deleteNote, deleteNoteFolder, endTeamShare, newNoteId, renameNoteFolder } from "./mutations";
import { shareExpired, type NoteShare } from "./team-share";
import { SharedNoteView } from "./SharedNoteView";
import { studioDateKey } from "../../../lib/studio-time";
import {
  blankDraft,
  clientLabel,
  effectiveTitle,
  excerpt,
  folderCounts,
  noteErrorMessage,
  noteListItems,
  sortNotes,
  validFolderName,
  whenLabel,
  type NoteListItem,
  type NotesView,
} from "./notes";
import { NOTE_KIND_LABEL, NOTE_KINDS, type NoteDraft, type NoteKind, type NoteType, type TrainerNote } from "./types";
import { NoteEditor } from "./NoteEditor";
import { checklistCount } from "./format";
import "./notes.css";
import { NAME_SEARCH_PROPS } from "../../../lib/name-search-input";
import { NOTE_TEMPLATES, SHELVES, composedBody, hunchLine, hunchState, onThisDayKeys, openHunches, shelfOf, slotsFree, type ShelfId } from "./journal";
import { DayLogList, DayLogView, OnThisDayList, ShelfNav, StudioShelfList, StudioShelfView, WriteRow } from "./JournalPieces";
import { JournalToday } from "./JournalToday";
import { createPortal } from "react-dom";
import { useRelayMaybe } from "../board/RelayContext";
import { useDayLogs } from "./day-log-store";
import { usePlaybook } from "../../studio-tasks/usePlaybook";
import { confirmPlaybookEntry } from "../../studio-tasks/playbook-mutations";
import { studioDayKeyOf } from "../../../lib/studio-time";

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
  research: "Research",
};

/**
 * Where the trainer was — the folder and the open note — for the session,
 * like the Planner's tab, so going to a client's profile and back lands on
 * the same note. Keyed by uid: the next trainer on a shared iPad starts fresh.
 */
const remembered: { uid: string | null; view: NotesView; selected: string | null } = {
  uid: null,
  view: { kind: "today" },
  selected: null,
};
const recall = (uid: string | null) =>
  remembered.uid === uid ? remembered : { uid, view: { kind: "today" } as NotesView, selected: null };
function remember(uid: string | null, patch: Partial<{ view: NotesView; selected: string | null }>) {
  if (remembered.uid !== uid) Object.assign(remembered, { uid, view: { kind: "today" }, selected: null });
  Object.assign(remembered, patch);
}

const BLANK: NoteDraft = blankDraft();

/** Expired shares already taken down this session. */
const swept = new Set<string>();

const sameView = (a: NotesView, b: NotesView) =>
  a.kind === b.kind &&
  (a.kind !== "folder" || a.folderId === (b as { folderId: string }).folderId) &&
  (a.kind !== "shelf" || a.shelf === (b as { shelf: ShelfId }).shelf);

/** What a note is, on its card: a Journal type, or a kind for a note written before. */
const labelOf = (n: TrainerNote) => (n.noteType ? NOTE_TEMPLATES[n.noteType].label : NOTE_KIND_LABEL[n.kind]);

export interface NotesPanelProps {
  authTrainer?: Trainer | null;
  /** Everyone on the app — colleagues a note can be shared with. */
  trainers?: Trainer[];
  /** Clients the app already holds — today's roster, and the open profile. */
  clients?: Client[];
  onOpenClient?: (clientId: string) => void;
  /** Arrived from a client's profile: start a plan, or open a note. */
  intent?: PlannerIntent | null;
}

export function NotesPanel({ authTrainer, trainers, clients, onOpenClient, intent }: NotesPanelProps) {
  // The Firebase Auth uid: notes live at trainers/{uid}/notes, private by path.
  const uid = auth.currentUser?.uid ?? null;
  const { activeStudioId, activeStudio, availableStudios } = useActiveStudio();
  // A leader keeps notes about team members (the Atlas answers, Oct 2 2026).
  const leads = leadsHere(authTrainer, activeStudioId);
  // Relay: "All MSF studios" is offered to the people whose role reaches every studio.
  const networkStudios = useMemo(
    () => (isEveryStudioRole(authTrainer) ? availableStudios.filter((s) => s.id).map((s) => ({ id: s.id!, name: s.name })) : []),
    [authTrainer, availableStudios],
  );
  const { notes, folders, loading, error } = useTrainerNotes(uid);
  // Notes colleagues shared here (Planner rework).
  const withMe = useNotesSharedWithMe(uid, activeStudioId);
  const [selectedShare, setSelectedShare] = useState<string | null>(null);
  // A note just created elsewhere (a saved copy): open it once it arrives.
  const [openWhenSaved, setOpenWhenSaved] = useState<string | null>(null);
  const openShare = withMe.shares.find((sh) => sh.id === selectedShare) ?? null;

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
      if (id) setSelectedShare(null);
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
    (client?: { id: string; name: string } | null, noteKind?: NoteKind, noteType?: NoteType) => {
      if (!uid) return;
      // A Journal type (the second wave, Sep 28 2026) starts its template.
      const baseline = blankDraft(client ?? null, noteType ?? null);
      if (noteKind && !noteType) baseline.kind = noteKind;
      const here = recall(uid).view;
      if (here.kind === "folder") baseline.folderId = here.folderId;
      // Started from Today (its Write row): the note opens on Notes, where the editor is.
      if (here.kind === "today") {
        remember(uid, { view: { kind: "all" } });
        setViewState({ kind: "all" });
      }
      const id = newNoteId(uid);
      setPendingNew({ id, baseline });
      setSelected(id);
    },
    [uid, setSelected],
  );

  // From a client's profile. Read once, on arrival.
  const [jotFor, setJotFor] = useState<{ id: string; name: string } | null>(null);
  const [focusJot, setFocusJot] = useState<string | null>(null);
  useEffect(() => {
    if (!intent) return;
    if (intent.kind === "new-note") startNew(intent.client, intent.noteKind ?? "plan");
    else if (intent.kind === "open-note") {
      if (recall(uid).view.kind === "today") setView({ kind: "all" });
      setSelected(intent.noteId);
    } else if (intent.kind === "jot") {
      if (recall(uid).view.kind === "today") setView({ kind: "all" });
      setJotFor(intent.client);
    }
    else if (intent.kind === "open-share") {
      setView({ kind: "withme" });
      setSelected(null);
      setSelectedShare(intent.noteId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  // "Jot a note" (Planner rework): once the notes are in, open the note
  // being built about this client — the newest private one that names them —
  // or start one, with the working log focused.
  useEffect(() => {
    if (!jotFor || loading || !uid) return;
    const building = sortNotes(notes.filter((n) => !n.sharedWith && n.clientIds.includes(jotFor.id)))[0];
    if (building) {
      setSelected(building.id);
      setFocusJot(building.id);
    } else {
      const id = newNoteId(uid);
      const baseline = blankDraft(jotFor);
      baseline.title = `${jotFor.name} — working notes`;
      setPendingNew({ id, baseline });
      setSelected(id);
      setFocusJot(id);
    }
    setJotFor(null);
  }, [jotFor, loading, notes, uid, setSelected]);

  // Take down this trainer's own colleague shares that are past their date
  // (the rules can't — see team-share.ts). Once per note per session.
  useEffect(() => {
    if (loading || error || !uid) return;
    const today = studioDateKey(new Date()) ?? "";
    for (const n of notes) {
      if (!n.teamShare || !shareExpired(n.teamShare, today) || swept.has(n.id)) continue;
      swept.add(n.id);
      endTeamShare(uid, n).catch((err) => console.warn("[notes] could not end an expired share:", err));
    }
  }, [notes, loading, error, uid]);

  useEffect(() => {
    if (openWhenSaved && notes.some((n) => n.id === openWhenSaved)) {
      setSelected(openWhenSaved);
      setOpenWhenSaved(null);
    }
  }, [openWhenSaved, notes, setSelected]);

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
  const sharedCount = useMemo(() => notes.filter((n) => n.sharedWith || n.teamShare).length, [notes]);
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
    {
      view: { kind: "withme" },
      label: "From colleagues",
      count: withMe.shares.length,
      show: withMe.shares.length > 0 || view.kind === "withme",
    },
  ];

  const filtering = queryText.trim() !== "" || kind !== "all";

  /* ---------------------- the Journal (second wave) -------------------- */

  const todayKey = studioDateKey(new Date()) ?? "";
  const shelfCounts = useMemo(() => {
    const out = Object.fromEntries(SHELVES.map((sh) => [sh.id, 0])) as Record<ShelfId, number>;
    for (const n of notes) {
      const sh = shelfOf(n);
      if (sh) out[sh] += 1;
    }
    return out;
  }, [notes]);
  const hunchesOpen = useMemo(() => openHunches(notes), [notes]);
  const freeSlots = useMemo(() => slotsFree(notes), [notes]);
  // Day logs are this studio's (the path is the studio); read only when a shelf needs them.
  const logs = useDayLogs(activeStudioId, uid, view.kind === "daylogs" || view.kind === "onthisday");
  const logsList = logs.state === "ready" ? logs.logs : [];
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const openLog = logsList.find((l) => l.id === selectedLog) ?? null;
  // The Studio shelf is the studio's Playbook; read only while it is open.
  const shelf = usePlaybook(view.kind === "studio" ? activeStudioId : null);
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const openEntry = shelf.entries.find((e) => e.id === selectedEntry && !e.retiredAt) ?? null;
  const onThisDayNotes = useMemo(() => {
    if (view.kind !== "onthisday") return [];
    const { monthAgo, yearAgo } = onThisDayKeys(todayKey);
    return notes
      .map((note) => ({ note, day: note.createdAt ? studioDayKeyOf(note.createdAt as never) : null }))
      .filter((x): x is { note: TrainerNote; day: string } => x.day === monthAgo || x.day === yearAgo);
  }, [view.kind, notes, todayKey]);
  const journalOpen = (view.kind === "daylogs" && openLog) || (view.kind === "studio" && openEntry);

  const confirmEntry = async () => {
    if (!openEntry || !activeStudioId || !uid) return;
    try {
      await confirmPlaybookEntry(activeStudioId, openEntry, { id: uid, name: authTrainer?.fullName ?? "A trainer" });
    } catch (err) {
      console.warn("[journal] confirm failed:", err);
      setPanelError("Couldn't save that. Check your connection.");
    }
  };

  /*
   * THE JOURNAL'S TABS (the Relay Board rebuild, Oct 3 2026): Today · Notes ·
   * Day logs · On this day · Studio shelf, in the bar under the header as the
   * Board's parts of the day are. Notes is every note view (a kind's shelf,
   * a folder, Pinned...); the other four are their own places.
   */
  const relay = useRelayMaybe();
  const place = view.kind === "today" || view.kind === "daylogs" || view.kind === "onthisday" || view.kind === "studio" ? view.kind : "notes";
  const go = (next: NotesView) => {
    setView(next);
    setSelected(null);
    setSelectedLog(null);
    setSelectedEntry(null);
  };
  const tabs = (
    <div className="pl__tabs rbt" role="tablist" aria-label="Your journal">
      {(
        [
          ["today", "Today", { kind: "today" }],
          ["notes", "Notes", { kind: "all" }],
          ["daylogs", "Day logs", { kind: "daylogs" }],
          ["onthisday", "On this day", { kind: "onthisday" }],
          ["studio", "Studio shelf", { kind: "studio" }],
        ] as [string, string, NotesView][]
      ).map(([id, label, target]) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`jn-tab-${id}`}
          className="pl__tab rbt__tab"
          aria-selected={place === id}
          onClick={() => (place === id && id !== "notes" ? undefined : go(target))}
        >
          {label}
          {id === "notes" && <span className="rbt__n">{notes.length}</span>}
        </button>
      ))}
    </div>
  );
  const tabsHere = relay?.slots?.subhead ? createPortal(tabs, relay.slots.subhead) : tabs;

  if (view.kind === "today") {
    return (
      <div className="jtd-page touch-pane">
        {tabsHere}
        <div>
          <JournalToday
            studioId={activeStudioId ?? null}
            uid={uid}
            now={relay?.now ?? { todayKey, sessions: [] }}
            write={<WriteRow slotsFree={freeSlots} disabled={!uid} leader={leads} onWrite={(type) => startNew(null, undefined, type)} />}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pn" data-open={editorOpen || (view.kind === "withme" && openShare) || journalOpen ? "note" : "list"}>
      {tabsHere}
      <aside className="pn__side" aria-label="Your journal">
        <div className="pn__head">
          <div className="pn__head-titles">
            <h2 className="pl__h2">Journal</h2>
            <p className="pl__sub">Yours alone, at every studio — unless you share one.</p>
          </div>
          <button type="button" className="pl__btn pl__btn--primary" onClick={() => startNew()} disabled={!uid}>
            <Plus size={15} aria-hidden />
            New note
          </button>
        </div>

        <WriteRow slotsFree={freeSlots} disabled={!uid} leader={leads} onWrite={(type) => startNew(null, undefined, type)} />

        <ShelfNav
          leader={leads}
          view={view}
          counts={shelfCounts}
          openHunches={hunchesOpen}
          onView={(v) => {
            setView(v);
            setSelected(null);
            setSelectedLog(null);
            setSelectedEntry(null);
          }}
        />

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
                {s.label === "From colleagues" && <Users size={13} aria-hidden />}
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
              {...NAME_SEARCH_PROPS}
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
          {view.kind === "daylogs" ? (
            <DayLogList logs={logsList} state={logs.state} selected={selectedLog} onOpen={setSelectedLog} />
          ) : view.kind === "studio" ? (
            <StudioShelfList entries={shelf.entries} loading={shelf.loading} selected={selectedEntry} onOpen={setSelectedEntry} todayKey={todayKey} />
          ) : view.kind === "onthisday" ? (
            <OnThisDayList
              notes={onThisDayNotes}
              logs={logsList}
              logsState={logs.state}
              todayKey={todayKey}
              onOpenNote={(id) => {
                setView({ kind: "all" });
                setSelected(id);
              }}
              onOpenLog={(id) => {
                setView({ kind: "daylogs" });
                setSelectedLog(id);
              }}
            />
          ) : view.kind === "withme" ? (
            withMe.error ? (
              <p className="pn__state">{withMe.error}</p>
            ) : withMe.loading && withMe.shares.length === 0 ? (
              <p className="pn__state">Loading…</p>
            ) : withMe.shares.length === 0 ? (
              <div className="pl__empty">
                <p className="pl__empty-title">Nothing shared with you here</p>
                <p className="pl__empty-body">
                  When a colleague hands over a plan — for a vacation, a cover, or the whole team — it shows up here.
                </p>
              </div>
            ) : (
              <ShareList
                shares={withMe.shares.filter((sh) => shareMatches(sh, queryText, kind))}
                selected={selectedShare}
                onOpen={(id) => {
                  setSelected(null);
                  setSelectedShare(id);
                }}
              />
            )
          ) : error ? (
            <p className="pn__state">{error}</p>
          ) : loading && notes.length === 0 ? (
            <p className="pn__state">Loading your notes…</p>
          ) : items.length === 0 ? (
            notes.length === 0 && !filtering && view.kind === "all" ? (
              <div className="pl__empty">
                <p className="pl__empty-title">No notes yet</p>
                <p className="pl__empty-body">
                  Plans, routine changes, retention ideas, injury plans, research — write them here, link the clients
                  they are about, and file them in folders. Build a note over several sessions with working notes, then
                  publish it when it's ready. Nobody else sees a note unless you share it.
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
        {view.kind === "daylogs" && openLog ? (
          <DayLogView key={openLog.id} log={openLog} onBack={() => setSelectedLog(null)} />
        ) : view.kind === "studio" && openEntry ? (
          <StudioShelfView
            key={openEntry.id}
            entry={openEntry}
            mine={Boolean(uid && openEntry.confirmations?.[uid])}
            onConfirm={() => void confirmEntry()}
            onBack={() => setSelectedEntry(null)}
          />
        ) : view.kind === "withme" && openShare && uid ? (
          <SharedNoteView
            key={openShare.id}
            share={openShare}
            uid={uid}
            onBack={() => setSelectedShare(null)}
            onOpenClient={onOpenClient}
            onCopied={(id) => {
              setView({ kind: "all" });
              setSelectedShare(null);
              setOpenWhenSaved(id);
            }}
          />
        ) : editorOpen && uid && selected ? (
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
            activeStudioName={activeStudio?.name ?? ""}
            trainers={trainers ?? []}
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
            networkStudios={networkStudios}
            focusJot={focusJot === selected}
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
        const checks = checklistCount(n.body);
        return (
          <li key={item.id}>
            <button
              type="button"
              className="pn__card"
              aria-current={selected === item.id ? "true" : undefined}
              onClick={() => onOpen(item.id)}
            >
              <span className="pn__card-top">
                <span className={`pn__kind pn__kind--${n.kind}`}>{labelOf(n)}</span>
                {n.pinned && <Pin size={13} className="pn__card-icon" aria-label="Pinned" />}
                {n.sharedWith && (
                  <span className="pn__shared">
                    <Share2 size={12} aria-hidden />
                    Shared
                  </span>
                )}
                {n.teamShare && (
                  <span className="pn__shared">
                    <Users size={12} aria-hidden />
                    {n.teamShare.audience === "team" ? "Team" : `${n.teamShare.people.length} colleague${n.teamShare.people.length === 1 ? "" : "s"}`}
                  </span>
                )}
                <span className="pn__when">{item.isNew ? "Not saved yet" : whenLabel(n.updatedAt)}</span>
              </span>
              <span className="pn__card-title">{n.title || "Untitled"}</span>
              {!item.isNew && composedBody(n) && <span className="pn__card-excerpt">{excerpt(composedBody(n))}</span>}
              {!item.isNew && n.noteType === "trend" && n.hunch && (
                <span className={`pn__stage${hunchState(n.hunch)?.ready ? "" : " pn__stage--building"}`}>{hunchLine(hunchState(n.hunch))}</span>
              )}
              {!item.isNew && (n.log.length > 0 || n.links.length > 0 || checks.total > 0) && (
                <span className={`pn__stage${n.log.length > 0 && !n.sharedWith ? " pn__stage--building" : ""}`}>
                  {[
                    n.log.length > 0 && !n.sharedWith ? `Building · ${n.log.length} jot${n.log.length === 1 ? "" : "s"}` : null,
                    n.log.length > 0 && n.sharedWith ? `${n.log.length} jot${n.log.length === 1 ? "" : "s"}` : null,
                    checks.total > 0 ? `${checks.done} of ${checks.total} ticked` : null,
                    n.links.length > 0 ? `${n.links.length} source${n.links.length === 1 ? "" : "s"}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
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
 * Notes colleagues shared (Planner rework)
 * ------------------------------------------------------------------ */

function shareMatches(sh: NoteShare, queryText: string, kind: NoteKind | "all"): boolean {
  if (kind !== "all" && sh.kind !== kind) return false;
  const words = queryText.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = [sh.title, sh.body, sh.authorName, sh.message, ...Object.values(sh.clientNames)].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

function ShareList({
  shares,
  selected,
  onOpen,
}: {
  shares: NoteShare[];
  selected: string | null;
  onOpen: (id: string) => void;
}) {
  const today = studioDateKey(new Date()) ?? "";
  if (shares.length === 0) return <p className="pn__state">Nothing matches.</p>;
  return (
    <ul className="pn__list">
      {shares.map((sh) => (
        <li key={sh.id}>
          <button
            type="button"
            className="pn__card"
            aria-current={selected === sh.id ? "true" : undefined}
            onClick={() => onOpen(sh.id)}
          >
            <span className="pn__card-top">
              <span className={`pn__kind pn__kind--${sh.kind}`}>{NOTE_KIND_LABEL[sh.kind]}</span>
              <span className="pn__shared">
                <Users size={12} aria-hidden />
                {sh.audience === "team" ? "Team" : "You"}
              </span>
              <span className="pn__when">{whenLabel(sh.updatedAt)}</span>
            </span>
            <span className="pn__card-title">{sh.title}</span>
            {sh.message ? (
              <span className="pn__card-excerpt">“{sh.message}”</span>
            ) : (
              sh.body && <span className="pn__card-excerpt">{excerpt(sh.body)}</span>
            )}
            <span className="pn__card-foot">
              <span className="pn__card-clients">From {sh.authorName}</span>
              {sh.expiresOn && (
                <span className="pn__stage">{sh.expiresOn === today ? "Last day today" : `Until ${sh.expiresOn.slice(5).replace("-", "/")}`}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

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
