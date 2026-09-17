import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ExternalLink, Eye, FolderOpen, Lock, NotebookPen, PenLine, Pin, Search, Send, Share2, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import type { Client, Trainer } from "../../../types";
import { canShareOnto } from "./access";
import type { StashedDraft } from "./draft-stash";
import { useClientDoc, useClientSearch, useClientsAtStudio, useSharedCopy } from "./hooks";
import { peopleAtStudio, TeamShareCard } from "./TeamShareCard";
import { writesForStudioPerRules } from "../../learning/permissions";
import { studioDateKey } from "../../../lib/studio-time";
import { appendNoteLog, removeNoteLog, saveNote } from "./mutations";
import { applyFormat, toggleCheck, type FormatAction } from "./format";
import { NoteBody, NoteToolbar } from "./NoteBody";
import { NoteSources } from "./NoteSources";
import { WorkingLog } from "./WorkingLog";
import { suggestKind } from "./suggest-kind";
import { Seg } from "../kit";
import {
  canShare,
  clientLabel,
  draftChanged,
  draftFromNote,
  effectiveTitle,
  foldIntoBody,
  logEntry,
  logIsFull,
  noteErrorMessage,
  validateNoteDraft,
  whenLabel,
  type NoteProblem,
} from "./notes";
import {
  NOTE_BODY_MAX,
  NOTE_KIND_LABEL,
  NOTE_KINDS,
  NOTE_MAX_CLIENTS,
  NOTE_TITLE_MAX,
  type NoteDraft,
  type NoteFolder,
  type NoteLogEntry,
  type TrainerNote,
} from "./types";

/**
 * ONE NOTE, OPEN — title, kind, the clients it is about, the body, and Share.
 *
 * Round: Learning + Planner, Sep 2026. Rules in ./notes.ts, writes in
 * ./mutations.ts, why-it-is-built-this-way in ./README.md.
 *
 * Explicit Save, because a shared note is read by the whole team: a plan
 * should reach a client's record when its author says it is ready, not
 * half-typed. Nothing is lost by not saving — every change is kept in the
 * session's draft stash (./draft-stash.ts) until it is saved or discarded.
 */

export interface NoteEditorProps {
  uid: string;
  noteId: string;
  /** The note as saved; null while it has never been saved. */
  saved: TrainerNote | null;
  /** What a never-saved note starts from (blank, or about a client). */
  newBaseline: NoteDraft;
  /** A draft kept from earlier in the session, if any. */
  restored: StashedDraft | null;
  folders: NoteFolder[];
  /** Clients the Planner already has (today's roster, and the open client). */
  roster: Client[];
  authTrainer: Trainer | null;
  activeStudioId: string | null;
  /** The studio the trainer is standing in, by name — where a colleague share goes. */
  activeStudioName?: string;
  /** Everyone on the app — the colleagues a note can be shared with. */
  trainers?: Trainer[];
  /** Keep (or, with null, forget) this note's unsaved draft. */
  onDraft: (entry: StashedDraft | null) => void;
  /** A never-saved note was discarded: close it. */
  onClose: () => void;
  /**
   * Delete this saved note. The Planner does it, not the editor: the note
   * leaves the list the moment the delete starts, so the editor closes at
   * once and a refusal is reported on the list, where the note comes back.
   */
  onDelete: (note: TrainerNote) => void;
  /** Narrow screens: back to the list. */
  onBack?: () => void;
  onOpenClient?: (clientId: string) => void;
  /** Arrived to jot something (from a client's profile): focus the log. */
  focusJot?: boolean;
  /** Relay: every studio this person can write at, for "All MSF studios". */
  networkStudios?: { id: string; name: string }[];
}

const fullName = (c: Pick<Client, "firstName" | "lastName">) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
const firstName = (name: string) => name.split(" ")[0] || name;

/** What Share will do, in one sentence, for each of its four states. */
function shareSentence({
  sharedNow,
  share,
  blocked,
  first,
}: {
  sharedNow: boolean;
  share: boolean;
  blocked: string | null;
  first: string;
}): string {
  if (sharedNow && share) {
    return `On ${first}'s record: anyone who can open their profile reads it under Goals → Plans from the team. Saving updates it there, and only you can change it.`;
  }
  if (sharedNow) return `Saving takes it off ${first}'s record. It stays here, private to you.`;
  if (share) {
    return `When you save, it goes on ${first}'s record: anyone who can open their profile reads it under Goals → Plans from the team. Only you can change it.`;
  }
  return blocked ?? "Private — only you can see this note. Share it when the rest of the team should work from it too.";
}

export function NoteEditor({
  uid,
  noteId,
  saved,
  newBaseline,
  restored,
  folders,
  roster,
  authTrainer,
  activeStudioId,
  activeStudioName = "",
  trainers = [],
  onDraft,
  onClose,
  onDelete,
  onBack,
  onOpenClient,
  focusJot = false,
  networkStudios,
}: NoteEditorProps) {
  const baseline = useMemo(() => (saved ? draftFromNote(saved) : newBaseline), [saved, newBaseline]);
  const [draft, setDraft] = useState<NoteDraft>(() => restored?.draft ?? baseline);
  const [problems, setProblems] = useState<NoteProblem[]>([]);
  const [busy, setBusy] = useState<"save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linking, setLinking] = useState(false);
  const restoredOnOpen = useRef(Boolean(restored));
  // A saved note opens to be READ — its checklists tappable, its links live;
  // a new one, or one with unsaved changes, opens to be written.
  const [mode, setMode] = useState<"write" | "read">(() =>
    saved && saved.body.trim() && !restored ? "read" : "write",
  );
  const [jotBusy, setJotBusy] = useState(false);
  // Two panes (Relay): the working log on the left, the note on the right.
  // Portrait shows one at a time; arriving to jot opens the log.
  const [pane, setPane] = useState<"log" | "note">(focusJot ? "log" : "note");
  // Classify after writing (Relay): the kind is suggested from the links and
  // the words until the author picks one. A new note follows the suggestion
  // live; a saved one is offered it.
  const [kindChosen, setKindChosen] = useState<boolean>(() => Boolean(saved && saved.kind !== "note"));

  // The saved note changed underneath — this trainer's own save coming back,
  // or an edit on another iPad. Follow it, unless something has been typed
  // here since; then the typing wins and stays marked unsaved.
  const prevBaseline = useRef(baseline);
  useEffect(() => {
    const prev = prevBaseline.current;
    prevBaseline.current = baseline;
    if (prev !== baseline) setDraft((cur) => (draftChanged(cur, prev) ? cur : baseline));
  }, [baseline]);

  const suggested = suggestKind(draft, saved?.log ?? []);
  useEffect(() => {
    if (saved || kindChosen) return;
    setDraft((d) => (d.kind === suggested ? d : { ...d, kind: suggested }));
  }, [suggested, saved, kindChosen]);

  const dirty = draftChanged(draft, baseline);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Every change goes to the session's stash; an unchanged draft leaves it.
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  useEffect(() => {
    onDraftRef.current(dirty ? { draft, baseline, isNew: !saved } : null);
  }, [draft, baseline, dirty, saved]);

  const edit = (patch: Partial<NoteDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setProblems([]);
    setError(null);
  };

  /* ---------------------------- clients ---------------------------- */

  const rosterById = useMemo(() => {
    const m = new Map<string, Client>();
    for (const c of roster) if (c.id) m.set(c.id, c);
    return m;
  }, [roster]);
  // Clients linked from search this session, so their studio is known.
  const [found, setFound] = useState<Map<string, Client>>(() => new Map());
  const nameOf = (id: string) => {
    const c = rosterById.get(id) ?? found.get(id);
    return c ? fullName(c) : "";
  };

  const onlyClientId = draft.clientIds.length === 1 ? draft.clientIds[0] : null;
  const knownOnly = onlyClientId ? rosterById.get(onlyClientId) ?? found.get(onlyClientId) ?? null : null;
  // A lone client the Planner does not have is looked up once, so Share can
  // say yes or no honestly.
  const looked = useClientDoc(knownOnly ? null : onlyClientId);
  const onlyClient = knownOnly ?? looked.client;
  const onlyName = onlyClientId ? clientLabel(onlyClientId, draft, nameOf) : "";

  const sharedNow = Boolean(saved?.sharedWith);
  // While a note is shared, who it is about is fixed: switch Share off first.
  const clientsLocked = sharedNow && draft.share;

  const link = (c: Client) => {
    if (!c.id || draft.clientIds.includes(c.id) || draft.clientIds.length >= NOTE_MAX_CLIENTS) return;
    setFound((m) => new Map(m).set(c.id!, c));
    const clientIds = [...draft.clientIds, c.id];
    edit({
      clientIds,
      clientNames: { ...draft.clientNames, [c.id]: fullName(c) },
      // A second client ends sharing: the copy can only be about one person.
      share: draft.share && canShare(clientIds),
    });
  };
  const unlink = (id: string) => {
    const names = { ...draft.clientNames };
    delete names[id];
    const clientIds = draft.clientIds.filter((c) => c !== id);
    edit({ clientIds, clientNames: names, share: draft.share && canShare(clientIds) });
  };

  /* ----------------------------- share ----------------------------- */

  const copy = useSharedCopy(saved?.sharedWith ?? null, sharedNow ? noteId : null);
  const shareBlocked: string | null =
    draft.clientIds.length === 0
      ? "Link the client this is about, then you can share it onto their record."
      : draft.clientIds.length > 1
        ? "A shared note has to be about one client — each client's team would see the others' names."
        : looked.state === "loading"
          ? "Checking the client's studio…"
          : looked.state === "failed"
            ? `Couldn't check ${firstName(onlyName)}'s studio just now — try again when the connection is back.`
            : !onlyClient
            ? `You can't open ${onlyName}'s record from here, so this can't go on it.`
            : !canShareOnto(authTrainer, onlyClient)
              ? `Only trainers at ${firstName(onlyName)}'s studio can put notes on their record.`
              : null;
  // A note already shared can always be switched OFF, whatever changed since.
  const shareSwitchDisabled = busy !== null || (!draft.share && shareBlocked !== null);

  /* --------------------------- save/delete ------------------------- */

  /* ------------------------ colleague share ------------------------ */

  const todayKey = studioDateKey(new Date()) ?? "";
  const shareStudioId = draft.teamShare?.studioId ?? activeStudioId;
  const knownClients = useMemo(() => {
    const m = new Map<string, Client>(rosterById);
    for (const [id, c] of found) m.set(id, c);
    return m;
  }, [rosterById, found]);
  const clientCheck = useClientsAtStudio(
    draft.clientIds,
    shareStudioId,
    knownClients,
    Boolean(draft.teamShare) && draft.clientIds.length > 0,
  );
  const colleagues = useMemo(() => peopleAtStudio(trainers, shareStudioId, uid), [trainers, shareStudioId, uid]);
  const canShareHere = writesForStudioPerRules(authTrainer, activeStudioId);

  /** Saves the draft — or `override`, when a caller has just changed it. */
  const save = async (override?: NoteDraft): Promise<boolean> => {
    const current = override ?? draft;
    const issues = validateNoteDraft(current);
    // Starting to share needs a yes from the checks above. A note that is
    // already shared with this client just saves; the database has the last
    // word, and a refusal says to switch Share off.
    const continuing = sharedNow && saved?.sharedWith === onlyClientId;
    if (current.share && !continuing && shareBlocked && !issues.some((p) => p.field === "share")) {
      issues.push({ field: "share", message: shareBlocked });
    }
    // A colleague copy shows client names at its studio: every client it
    // names must be coached there, and that has to be known, not assumed.
    if (
      current.teamShare &&
      current.clientIds.length > 0 &&
      clientCheck.state !== "ok" &&
      !issues.some((p) => p.field === "team")
    ) {
      issues.push({
        field: "team",
        message:
          clientCheck.state === "checking"
            ? "Still checking the clients this note names — try again in a moment."
            : clientCheck.state === "elsewhere"
              ? "A client this note names is coached at another studio. Unlink them to share it here."
              : "Couldn't confirm where the clients this note names are coached. Try again when the connection is back.",
      });
    }
    if (issues.length) {
      setProblems(issues);
      return false;
    }
    setBusy("save");
    setError(null);
    const sent = current;
    try {
      const written = await saveNote({
        uid,
        noteId,
        draft: sent,
        before: saved,
        author: { id: uid, name: authTrainer?.fullName ?? "" },
      });
      restoredOnOpen.current = false;
      // Adopt what was stored — unless more was typed while the save was on
      // its way; that stays, marked unsaved. Nothing left to keep otherwise,
      // even if this editor was closed meanwhile.
      if (draftRef.current === sent) {
        setDraft(written);
        onDraftRef.current(null);
      }
      return true;
    } catch (err) {
      console.warn("[notes] save failed:", err);
      setError(noteErrorMessage(err, "save"));
      return false;
    } finally {
      setBusy(null);
    }
  };

  /* --------------------------- working log ------------------------- */

  const linkedClients = draft.clientIds.map((id) => ({ id, name: clientLabel(id, draft, nameOf) }));

  /**
   * A jot is written at once. A note that has never been saved is saved
   * first — titled after its client or the day if nothing has been typed —
   * because a jot needs a note to hang on.
   */
  const addJot = async (text: string, clientId: string | null): Promise<boolean> => {
    const entry = logEntry(text, clientId);
    if (!entry) return false;
    setError(null);
    if (!saved) {
      let first = draftRef.current;
      if (!effectiveTitle(first)) {
        const who = linkedClients.length === 1 ? linkedClients[0].name : "";
        first = { ...first, title: who ? `${who} — working notes` : "Working notes" };
        draftRef.current = first;
        setDraft(first);
      }
      const ok = await save(first);
      if (!ok) return false;
    }
    setJotBusy(true);
    try {
      await appendNoteLog(uid, noteId, entry);
      return true;
    } catch (err) {
      console.warn("[notes] jot failed:", err);
      setError(noteErrorMessage(err, "save"));
      return false;
    } finally {
      setJotBusy(false);
    }
  };

  const removeJot = async (entry: NoteLogEntry) => {
    setJotBusy(true);
    setError(null);
    try {
      await removeNoteLog(uid, noteId, entry);
    } catch (err) {
      console.warn("[notes] jot remove failed:", err);
      setError(noteErrorMessage(err, "save"));
    } finally {
      setJotBusy(false);
    }
  };

  const foldJot = (entry: NoteLogEntry) => {
    edit({ body: foldIntoBody(draftRef.current.body, entry).slice(0, NOTE_BODY_MAX) });
    setMode("write");
  };

  /* ---------------------------- formatting ------------------------- */

  const format = (action: FormatAction) => {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? draft.body.length;
    const r = applyFormat(draft.body, start, end, action);
    edit({ body: r.text.slice(0, NOTE_BODY_MAX) });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(r.selStart, r.selEnd);
    });
  };

  const discard = () => {
    setProblems([]);
    setError(null);
    restoredOnOpen.current = false;
    if (!saved) {
      onDraft(null);
      onClose();
      return;
    }
    setDraft(baseline);
  };

  /* ------------------------------ body ----------------------------- */

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    // Measuring collapses the box for a moment, which can pull the pane's
    // scroll up; put it back, so typing near the end of a long note stays
    // where it is (review fix).
    const pane = el.closest(".ne__scroll") as HTMLElement | null;
    const top = pane?.scrollTop ?? 0;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight + 2, 288)}px`;
    if (pane && pane.scrollTop !== top) pane.scrollTop = top;
  }, [draft.body]);

  const problemFor = (field: NoteProblem["field"]) => problems.find((p) => p.field === field)?.message;

  const status = busy === "save"
    ? "Saving…"
    : dirty
      ? restoredOnOpen.current
        ? "Unsaved changes, kept from earlier"
        : "Unsaved changes"
      : saved
        ? `Saved · ${whenLabel(saved.updatedAt)}`
        : "New note";

  const kindsBlock = (
    <section className="ne__file" aria-labelledby={`ne-file-${noteId}`}>
      <h3 className="ne__label" id={`ne-file-${noteId}`}>
        <FolderOpen size={13} aria-hidden /> File it
      </h3>
      {!kindChosen && suggested !== "note" && (
        <p className="ne__suggest">
          <Sparkles size={13} aria-hidden />
          {saved && draft.kind !== suggested ? (
            <>
              Reads like {aOrAn(NOTE_KIND_LABEL[suggested])} <strong>{NOTE_KIND_LABEL[suggested].toLowerCase()}</strong>.{" "}
              <button type="button" className="ne__suggest-use" onClick={() => edit({ kind: suggested })}>
                Use it
              </button>
            </>
          ) : (
            <>
              Filed as {aOrAn(NOTE_KIND_LABEL[draft.kind])} <strong>{NOTE_KIND_LABEL[draft.kind].toLowerCase()}</strong> — suggested from what you wrote. Tap another to change it.
            </>
          )}
        </p>
      )}
      <div className="ne__kinds" role="group" aria-label="What kind of note">
        {NOTE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`ne__kind ne__kind--${k}`}
            aria-pressed={draft.kind === k}
            onClick={() => {
              setKindChosen(true);
              edit({ kind: k });
            }}
          >
            {NOTE_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="ne__row">
        <label className="ne__field">
          <span className="ne__label">Folder</span>
          <select
            className="ne__select"
            value={draft.folderId ?? ""}
            onChange={(e) => edit({ folderId: e.target.value || null })}
          >
            <option value="">Unfiled</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
            {draft.folderId && !folders.some((f) => f.id === draft.folderId) && (
              <option value={draft.folderId}>A folder since deleted</option>
            )}
          </select>
        </label>
        <button
          type="button"
          className="ne__pin"
          aria-pressed={draft.pinned}
          onClick={() => edit({ pinned: !draft.pinned })}
        >
          <Pin size={15} aria-hidden />
          {draft.pinned ? "Pinned to the top" : "Pin to the top"}
        </button>
      </div>
    </section>
  );

  return (
    <article className="ne" aria-label={saved ? `Note: ${saved.title}` : "New note"} data-pane={pane}>
      <div className="ne__bar">
        {onBack && (
          <button type="button" className="ne__back" onClick={onBack}>
            <ChevronLeft size={18} aria-hidden />
            Notes
          </button>
        )}
        <span className={`ne__status${dirty ? " ne__status--dirty" : ""}`} role="status">
          {status}
        </span>
        <div className="ne__bar-actions">
          {(dirty || !saved) && (
            <button type="button" className="pl__btn" onClick={discard} disabled={busy !== null}>
              {saved ? "Discard changes" : "Discard"}
            </button>
          )}
          <button
            type="button"
            className="pl__btn pl__btn--primary"
            onClick={() => void save()}
            disabled={busy !== null || !dirty}
          >
            {busy === "save" ? "Saving…" : saved?.sharedWith || saved?.teamShare ? "Save & republish" : "Save"}
          </button>
        </div>
      </div>

      {/* Portrait: one pane at a time. Landscape hides this and shows both. */}
      <div className="ne__pane-switch">
        <Seg<"log" | "note">
          value={pane}
          options={[
            { value: "log", label: `Working notes${saved?.log?.length ? ` · ${saved.log.length}` : ""}` },
            { value: "note", label: "The note" },
          ]}
          onChange={setPane}
          label="Which pane"
        />
      </div>

      <div className="ne__panes">
        <aside className="ne__rail touch-pane" aria-label="Working notes">
          <WorkingLog
            log={saved?.log ?? []}
            clients={linkedClients}
            busy={jotBusy || busy !== null}
            full={logIsFull(saved?.log ?? [])}
            autoFocus={focusJot}
            onAdd={addJot}
            onRemove={(e) => void removeJot(e)}
            onFold={(e) => {
              foldJot(e);
              setPane("note");
            }}
          />
        </aside>

        <div className="ne__scroll touch-pane">
          {error && (
            <p className="ne__error" role="alert">
              {error}
            </p>
          )}

          <label className="ne__sr" htmlFor={`ne-title-${noteId}`}>
            Title
          </label>
          <input
            id={`ne-title-${noteId}`}
            className="ne__title"
            value={draft.title}
            maxLength={NOTE_TITLE_MAX}
            placeholder="Title — or just start writing below"
            onChange={(e) => edit({ title: e.target.value })}
            aria-invalid={Boolean(problemFor("title"))}
          />
          {problemFor("title") && <p className="ne__problem">{problemFor("title")}</p>}

          <section className="ne__clients" aria-labelledby={`ne-clients-${noteId}`}>
            <h3 className="ne__label" id={`ne-clients-${noteId}`}>
              About
            </h3>
            <div className="ne__chips">
              {draft.clientIds.map((id) => {
                const name = clientLabel(id, draft, nameOf);
                return (
                  <span className="ne__chip" key={id}>
                    {onOpenClient ? (
                      <button
                        type="button"
                        className="ne__chip-open"
                        onClick={() => onOpenClient(id)}
                        aria-label={`Open ${name}'s profile`}
                      >
                        {name}
                        <ExternalLink size={13} aria-hidden />
                      </button>
                    ) : (
                      <span className="ne__chip-name">{name}</span>
                    )}
                    {clientsLocked ? (
                      <span className="ne__chip-lock" title="Shared — switch Share off to change">
                        <Lock size={13} aria-label="Locked while shared" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="ne__chip-x"
                        onClick={() => unlink(id)}
                        aria-label={`Unlink ${name}`}
                      >
                        <X size={14} aria-hidden />
                      </button>
                    )}
                  </span>
                );
              })}
              {!clientsLocked && draft.clientIds.length < NOTE_MAX_CLIENTS && (
                <button
                  type="button"
                  className="ne__link-btn"
                  aria-expanded={linking}
                  onClick={() => setLinking((v) => !v)}
                >
                  <UserPlus size={15} aria-hidden />
                  {draft.clientIds.length === 0 ? "Link a client" : "Link another"}
                </button>
              )}
            </div>
            {clientsLocked && (
              <p className="ne__hint">Shared on {firstName(onlyName)}'s record — switch Share off to change who this is about.</p>
            )}
            {problemFor("clients") && <p className="ne__problem">{problemFor("clients")}</p>}
            {linking && !clientsLocked && (
              <ClientLinker
                roster={roster}
                linked={draft.clientIds}
                authTrainer={authTrainer}
                activeStudioId={activeStudioId}
                onPick={(c) => {
                  link(c);
                  setLinking(false);
                }}
                onClose={() => setLinking(false)}
              />
            )}
          </section>

          <div className="ne__body-head">
            <span className="ne__label">
              <NotebookPen size={13} aria-hidden /> The note
            </span>
            <div className="pk-seg ne__mode" role="group" aria-label="Write or read">
              <button type="button" aria-pressed={mode === "write"} onClick={() => setMode("write")}>
                <PenLine size={14} aria-hidden />
                Write
              </button>
              <button type="button" aria-pressed={mode === "read"} onClick={() => setMode("read")}>
                <Eye size={14} aria-hidden />
                Read
              </button>
            </div>
          </div>

          {mode === "write" ? (
            <>
              <NoteToolbar onFormat={format} disabled={busy !== null} />
              <label className="ne__sr" htmlFor={`ne-body-${noteId}`}>
                Note
              </label>
              <textarea
                id={`ne-body-${noteId}`}
                ref={bodyRef}
                className="ne__body"
                value={draft.body}
                maxLength={NOTE_BODY_MAX}
                placeholder={
                  draft.kind === "injury"
                    ? "What happened, what to avoid, what to load instead, and when to check again."
                    : draft.kind === "retention"
                      ? "What keeps them coming — and what might not. The next conversation to have."
                      : draft.kind === "routine"
                        ? "What changes, on which machines, from when — and why."
                        : draft.kind === "research"
                          ? "What you read, what it found, and what it means on the floor. Add the link below."
                          : "Write it down. Lift a working note in from the left, or use the toolbar for headings, checklists and links."
                }
                onChange={(e) => edit({ body: e.target.value })}
              />
            </>
          ) : draft.body.trim() ? (
            <div className="ne__read">
              <NoteBody body={draft.body} onToggle={(line) => edit({ body: toggleCheck(draft.body, line) })} />
            </div>
          ) : (
            <button type="button" className="ne__read ne__read--empty" onClick={() => setMode("write")}>
              Nothing written yet — tap to write.
            </button>
          )}
          {draft.body.length > NOTE_BODY_MAX - 1000 && (
            <p className="ne__count">
              {draft.body.length.toLocaleString()} / {NOTE_BODY_MAX.toLocaleString()}
            </p>
          )}
          {problemFor("body") && <p className="ne__problem">{problemFor("body")}</p>}

          <NoteSources links={draft.links} onChange={(links) => edit({ links })} disabled={busy !== null} />
          {problemFor("links") && <p className="ne__problem">{problemFor("links")}</p>}

          {kindsBlock}

          <div className="ne__publish-head">
            <Send size={15} aria-hidden />
            <div>
              <h3 className="ne__publish-title">Publish</h3>
              <p className="ne__publish-lede">
                Private until you say otherwise. Choose who reads it; saving publishes, and every save republishes. Working notes always stay with you.
              </p>
            </div>
          </div>

          <section className={`ne__share${draft.share ? " ne__share--on" : ""}`} aria-labelledby={`ne-share-${noteId}`}>
            <div className="ne__share-head">
              <Share2 size={16} aria-hidden />
              <h3 className="ne__share-title" id={`ne-share-${noteId}`}>
                {onlyClientId ? `On ${firstName(onlyName)}'s record` : "On the client's record"}
              </h3>
              <button
                type="button"
                role="switch"
                className="ne__switch"
                aria-checked={draft.share}
                aria-labelledby={`ne-share-${noteId}`}
                disabled={shareSwitchDisabled}
                onClick={() => edit({ share: !draft.share })}
              >
                <span className="ne__switch-knob" aria-hidden />
              </button>
            </div>
            {sharedNow && draft.share && copy === "missing" ? (
              <div className="ne__warn" role="note">
                <p>
                  This note is no longer on {firstName(onlyName)}'s record — a studio leader may have taken it off. Put it
                  back, or switch Share off and save to keep it private.
                </p>
                <button type="button" className="pl__btn" onClick={() => void save()} disabled={busy !== null}>
                  Put it back on {firstName(onlyName)}'s record
                </button>
              </div>
            ) : sharedNow && draft.share && copy === "unreadable" ? (
              <p className="ne__warn" role="note">
                You can't open {firstName(onlyName)}'s record any more, so the copy there can't be updated. Switch Share
                off and save to take it down.
              </p>
            ) : (
              <p className="ne__share-body">
                {shareSentence({ sharedNow, share: draft.share, blocked: shareBlocked, first: firstName(onlyName) })}
              </p>
            )}
            {problemFor("share") && <p className="ne__problem">{problemFor("share")}</p>}
          </section>

          <TeamShareCard
            value={draft.teamShare}
            savedValue={saved?.teamShare ?? null}
            onChange={(teamShare) => edit({ teamShare })}
            studio={activeStudioId ? { id: activeStudioId, name: activeStudioName || "this studio" } : null}
            people={colleagues}
            canShareHere={canShareHere}
            clientCheck={clientCheck.state}
            clientCount={draft.clientIds.length}
            todayKey={todayKey}
            disabled={busy !== null}
            problem={problemFor("team")}
            networkStudios={networkStudios}
          />

          {saved && (
            <div className="ne__danger">
              {confirmDelete ? (
                <div className="ne__confirm" role="alertdialog" aria-label="Delete this note?">
                  <p>
                    Delete “{saved.title}” for good?
                    {saved.sharedWith ? ` It also comes off ${firstName(onlyName)}'s record.` : ""}
                    {saved.teamShare ? " Colleagues you shared it with lose it too." : ""}
                  </p>
                  <div className="ne__confirm-actions">
                    <button type="button" className="pl__btn pl__btn--danger" onClick={() => onDelete(saved)} disabled={busy !== null}>
                      Delete note
                    </button>
                    <button
                      type="button"
                      className="pl__btn"
                      onClick={() => setConfirmDelete(false)}
                      disabled={busy !== null}
                      autoFocus
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="ne__delete" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={15} aria-hidden />
                  Delete note
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function aOrAn(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/* ------------------------------------------------------------------ *
 * Linking a client: today's roster first, then a name search
 * ------------------------------------------------------------------ */

function ClientLinker({
  roster,
  linked,
  authTrainer,
  activeStudioId,
  onPick,
  onClose,
}: {
  roster: Client[];
  linked: string[];
  authTrainer: Trainer | null;
  activeStudioId: string | null;
  onPick: (c: Client) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const { results, searching, failed } = useClientSearch(term, authTrainer, activeStudioId);
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const fromRoster = roster.filter((c) => {
    const name = fullName(c).toLowerCase();
    return c.id && name && words.every((w) => name.includes(w));
  });
  const merged = new Map<string, Client>();
  for (const c of [...fromRoster, ...results]) if (c.id && !linked.includes(c.id)) merged.set(c.id, c);
  const options = [...merged.values()]
    .sort((a, b) => fullName(a).localeCompare(fullName(b)))
    .slice(0, 12);

  return (
    <div className="ne__linker">
      <div className="ne__linker-search">
        <Search size={15} aria-hidden />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          placeholder="Search clients by name"
          aria-label="Search clients by name"
        />
        <button type="button" className="ne__linker-close" onClick={onClose} aria-label="Close client search">
          <X size={16} aria-hidden />
        </button>
      </div>
      <p className="ne__linker-note">
        {words.length === 0 ? "On today's schedule — or type a name to search your studio." : searching ? "Searching…" : ""}
      </p>
      {failed && (
        <p className="ne__linker-empty">Couldn't search the studio just now — check the connection and try again.</p>
      )}
      {options.length > 0 ? (
        <ul className="ne__linker-list">
          {options.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)}>
                {fullName(c)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !searching &&
        !failed &&
        words.length > 0 && <p className="ne__linker-empty">No client by that name at this studio.</p>
      )}
    </div>
  );
}
