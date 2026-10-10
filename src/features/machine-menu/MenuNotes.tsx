/**
 * THE MACHINE MENU — the Notes block: one note box, and the notes on this
 * machine.
 *
 * The same block in both doors; only where it sits differs (right under the
 * settings in a session, after the chart on the profile: doors.ts). Machine
 * menu design §C, "Notes, tap by tap":
 *
 *   THE BOX. One line ("Note about Avery on Leg Press…") that opens to three.
 *   Under the words: About [ Avery | The machine itself ]; Filed as
 *   "Coaching & equipment · Set-up" with Change (the notes catalog's chips,
 *   filed through `storedNoteOf`); How loud? — the ONE Loudness control,
 *   starting at the category's own loudness (a loudness picked by hand
 *   sticks); Cancel and Add note. Health and Incident say they reach the
 *   studio's leaders, and offer where on the body.
 *
 *   IN A SESSION the box IS the session's one note draft, which the tracker
 *   owns (`noteDraft`, client-notes/session-draft.ts): the words are passed
 *   down and every keystroke goes back up with this machine and "about the
 *   machine" on, so the Wrap-up, the new-version typing check and the
 *   session's note sidebar all see them. There is no second store. A draft
 *   already holding words about another machine shows as it is, with "Make
 *   it about Leg Press". Choices made before the first word (the switch, the
 *   filing) are held here until there are words to hand up, because the
 *   tracker keeps only a draft with words. ON THE PROFILE the box keeps its
 *   own draft and joins the unsaved-changes registry ("Leg Press note for
 *   Avery").
 *
 *   THE MACHINE ITSELF writes the studio's floor notes for this unit
 *   (features/floor-notes `addFloorNote`), which everyone at the studio sees
 *   here and on the Catalog — never the client's record, and never a Relay
 *   flag, so this card rings no bell (AJ, Oct 4 2026). It never calls
 *   `addMachineNote`.
 *
 *   WRITING never waits on the server (KNOWN-TRAPS, "Never await the
 *   database's answer on the floor"): the write is issued, `settleOrQueue`
 *   waits a moment at most, and the line under the box says "Saved", "Saved
 *   on this iPad · sends when online", or "Couldn't save. Your words are
 *   still here" with Try again. The words clear only once the iPad has the
 *   note, and the box holds still while the moment lasts (typing then would
 *   be cleared with the saved words). A refusal that comes after "saved on
 *   this iPad" is still heard (late-refusal.ts): the words come back while
 *   the box is empty, and the app's toast says it once the card has closed.
 *   A note written in a session carries the session link.
 *
 *   THE LIST. The newest open note that isn't already in the safety strip
 *   (an open Critical note is), else the newest standing one; "All notes
 *   (3)" opens the rest, grouped Open · Standing context · Resolved (folded),
 *   from client-notes/threads.ts. Tapping a note opens its thread in place:
 *   its updates, Add update, and More — Close it / Reopen, No need to remind
 *   me (private, undone by any update), Take it off the list (archives the
 *   whole thread, with a ten-second Undo). A copy of a settings save is not a
 *   note (settings-copy.ts) and is never drawn or counted here; when the
 *   setting changes couldn't be read, nothing is hidden.
 *
 * A watched session (another trainer's) reads only: no box, no Add update,
 * no More.
 */
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { archiveThread, addThreadUpdate, closeThread, reopenThread, unarchiveThread } from "../client-notes/thread-write";
import { assembleThreads, threadsByZone, type NoteThread } from "../client-notes/threads";
import { dismissThread } from "../client-notes/dismissal-store";
import { BodyPartPicker } from "../client-notes/BodyPartPicker";
import { flavourOf, noteCategoryOf } from "../client-notes/note-catalog";
import { sessionLinkLabel } from "../client-notes/session-link";
import { shortDay, whoOf } from "../client-notes/record-selectors";
import { EMPTY_SESSION_DRAFT, hasDraftText, type SessionNoteDraft } from "../client-notes/session-draft";
import { addMachineNote, type JournalContext, type MutationAuthor } from "../equipment/mutations";
import { machineNoteWords, machineNotesFor } from "../equipment/machine-notes";
import { addFloorNote } from "../floor-notes/store";
import { Loudness } from "../rating/Loudness";
import { settleOrQueue } from "../session-record/finish-wait";
import { useUnsavedChanges } from "../unsaved-changes";
import { sessionNumberTag } from "../../lib/history-claims";
import { studioDateKey } from "../../lib/studio-time";
import type { MachineNote } from "../../types";
import { toDate, type JournalEntry } from "../../types/journal";
import type { Door } from "./doors";
import { noteKey } from "./note-key";
import {
  FILING_CHIPS,
  LEADERS_LINE,
  THREAD_WORDS,
  aboutChoices,
  aboutWords,
  addButtonLabel,
  allNotesLabel,
  asksWhereOnBody,
  chipOf,
  clientNoteOf,
  composerPlaceholder,
  composerTitle,
  draftOwnerOf,
  fileDraft,
  filedAsWords,
  floorConfirmation,
  floorNoteOf,
  floorQueuedWords,
  floorTitle,
  healthNoteAfterPain,
  machineNoteBody,
  makeItAbout,
  makeItAboutWords,
  noteOrigin,
  noteRefusedLaterWords,
  NOTE_NEEDS_CLIENT,
  NOTES_NEED_CLIENT,
  noteSaveLine,
  reachesLeaders,
  resolvedLabel,
  setTarget,
  startingLoudness,
  targetOf,
  typeInto,
  unsavedNoteLabel,
  updateRefusedLaterWords,
  withMenuDefaults,
  type MenuNoteDraft,
  type NoteTarget,
} from "./note-target";
import { sayAfterClose, whenRefusedLater } from "./late-refusal";
import { withoutSettingsCopies } from "./settings-copy";
import type { SettingRow } from "./setting-history";
import { GLYPH_CLASS } from "./TimelineReadout";
import { NOTES_UNREAD_LINE } from "./timeline-words";
import { UNDO_MS } from "./setting-draft";
import "./machine-menu.css";

export interface MenuNotesProps {
  door: Door;
  machineId: string;
  /** The unit's floor name. */
  machineName: string;
  /** Every name a settings copy may carry (the floor's and the catalog's); defaults to the floor name. */
  machineNames?: readonly string[];
  /** Another machine's name, for a session draft about it ("About Chest Press"). */
  machineNameOf?: (machineId: string) => string | null;
  clientId: string;
  /** The name the client goes by. */
  clientFirstName: string;
  /** The client's journal, from the host's one listener; null while it hasn't answered. */
  journal: readonly JournalEntry[] | null;
  /** The journal read failed: the list says so rather than "no notes". */
  journalFailed?: boolean;
  /** The old `machineNotes` list on the settings document (read, never written). */
  legacyNotes?: readonly MachineNote[] | null;
  /** The card's one read of the setting changes; null when unread or failed (then nothing is hidden). */
  history: readonly SettingRow[] | null;
  /** Where a client note is filed: the studio and, in a session, the session link. The origin comes from the door. */
  journalContext: JournalContext;
  /** Where "The machine itself" goes: the session's studio, or on the profile the active studio. */
  floorStudio: { id: string | null; name: string | null };
  /** Who is writing: `id` is the Auth uid (the journal's rule, and the dismissals' document). Null writes nothing. */
  author: MutationAuthor | null;
  /** A watched session: read only. */
  readOnly?: boolean;
  online?: boolean;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
  /** `canQuoteSessionNumber(client, coverage)`: "#12" only past the gate. */
  quotableNumbers?: boolean;
  /** In a session: the tracker's one note draft, and where every change to it goes. */
  draft?: SessionNoteDraft | null;
  onDraftChange?: (draft: SessionNoteDraft) => void;
  /** "Add a Health note" after a save for pain or discomfort; a new `nonce` opens the box again. */
  healthNote?: { changeWords: string; nonce: number } | null;
  /** On the profile: open the session a note was written in. */
  onOpenSession?: (sessionId: string) => void;
  /**
   * The chart's Open note: open that note's thread here (its thread id, the
   * root's journal id); a new `nonce` opens it again.
   */
  focusNote?: { id: string; nonce: number } | null;
  /** A note about the machine itself is on the iPad: the card reads the studio's notes on the unit again. */
  onFloorNoteAdded?: () => void;
}

type Status = { text: string; retry: boolean } | null;

const browserOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);
const dayOf = (v: unknown): string | null => {
  const d = toDate(v);
  return d ? studioDateKey(d) : null;
};
const lastTime = (t: NoteThread) => t.lastActivityAt?.getTime() ?? 0;
const newestFirst = (list: readonly NoteThread[]) => [...list].sort((a, b) => lastTime(b) - lastTime(a));

export function MenuNotes({
  door,
  machineId,
  machineName,
  machineNames,
  machineNameOf,
  clientId,
  clientFirstName,
  journal,
  journalFailed = false,
  legacyNotes = null,
  history,
  journalContext,
  floorStudio,
  author,
  readOnly = false,
  online,
  today,
  quotableNumbers = false,
  draft = null,
  onDraftChange,
  healthNote = null,
  onOpenSession,
  focusNote = null,
  onFloorNoteAdded,
}: MenuNotesProps) {
  const controlled = door === "session" && !!onDraftChange;
  const [busy, setBusy] = useState(false);
  // The card's own draft: everything on the profile; in a session, only the
  // choices made before the first word (the tracker keeps a draft with words).
  const [local, setLocal] = useState<MenuNoteDraft>(() => withMenuDefaults(null, machineId));
  const effective: MenuNoteDraft = controlled && hasDraftText(draft) ? (draft as MenuNoteDraft) : local;
  // What the box holds now, for a refusal that comes later (its closure is older).
  const effectiveRef = useRef(effective);
  effectiveRef.current = effective;
  // Whether the card is still open, for the same.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // A change drawn while a save waits is refused: the save's own clear (its
  // closure was made before it waited) would wipe it with the saved words.
  const commit = (next: MenuNoteDraft) => {
    if (busy) return;
    if (!controlled) {
      setLocal(next);
      return;
    }
    if (hasDraftText(next) || hasDraftText(draft)) onDraftChange!(next);
    if (!hasDraftText(next)) setLocal(next);
  };
  const fresh = () => withMenuDefaults({ ...EMPTY_SESSION_DRAFT }, machineId);

  const [open, setOpen] = useState(false);
  const [filingOpen, setFilingOpen] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const aboutId = useId();

  const hasText = hasDraftText(effective);
  const owner = draftOwnerOf(effective, machineId);
  const target = targetOf(effective);
  const ours = owner === "empty" || owner === "this";
  const showOpen = !readOnly && (open || hasText);

  useUnsavedChanges(!controlled && !readOnly && hasDraftText(local), unsavedNoteLabel(machineName, clientFirstName), {
    onDiscard: () => setLocal(fresh()),
  });

  // "Add a Health note" from the settings: the box opens filed as Health,
  // with the change typed — unless it already holds words, which stay.
  const healthNonce = healthNote?.nonce ?? null;
  useEffect(() => {
    if (healthNonce === null || !healthNote || readOnly) return;
    const next = healthNoteAfterPain(effective, machineId, healthNote.changeWords);
    if (next) commit(next);
    setOpen(true);
    setStatus(null);
    textRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthNonce]);

  // When the box gets focus on the profile, keep it above the iPad's
  // keyboard: iOS ignores dvh for the keyboard, so measure what is visible.
  const keepAboveKeyboard = () => {
    const el = textRef.current;
    if (!el || door !== "profile") return;
    window.setTimeout(() => {
      const vv = typeof window !== "undefined" ? window.visualViewport : null;
      const rect = el.getBoundingClientRect();
      if (vv && rect.bottom > vv.height) el.scrollIntoView?.({ block: "center" });
    }, 300);
  };

  const isOnline = () => (online === undefined ? browserOnline() : online);

  /* ---------------- writing ---------------- */

  /**
   * A note the card said was saved on this iPad, refused later. While the
   * card is open: the words come back when the box is still empty (never
   * over words typed since), with Try again; otherwise the line says what
   * couldn't be saved. Once it has closed: the app's toast.
   */
  const refusedLater = (d: MenuNoteDraft, target: NoteTarget, err: unknown) => {
    console.error("[machine menu] note refused after it was saved on this iPad", err);
    const words = noteRefusedLaterWords(target, floorStudio.name, machineName);
    if (!live.current) {
      sayAfterClose(words);
      return;
    }
    if (hasDraftText(effectiveRef.current)) {
      setStatus({ text: words, retry: false });
      return;
    }
    commit(d);
    setOpen(true);
    setStatus(noteSaveLine("failed"));
  };

  const add = async () => {
    if (!author || readOnly || busy || !ours) return;
    const d = effective;
    if (targetOf(d) === "floor") {
      const w = floorNoteOf(d);
      if (!w || !floorStudio.id) return;
      let write: Promise<string>;
      try {
        write = addFloorNote({ studioId: floorStudio.id, machineId, machineName, body: w.body, writer: { name: author.fullName } });
      } catch (err) {
        write = Promise.reject(err);
      }
      setBusy(true);
      const outcome = await settleOrQueue(write, isOnline());
      setBusy(false);
      if (outcome.kind === "failed") {
        console.error("[machine menu] floor note not saved", outcome.error);
        setStatus(noteSaveLine("failed"));
        return;
      }
      if (outcome.kind === "queued") whenRefusedLater(write, (err) => refusedLater(d, "floor", err), (id) => !id);
      setStatus({
        text: outcome.kind === "saved" ? floorConfirmation(floorStudio.name, machineName) : floorQueuedWords(floorStudio.name, machineName),
        retry: false,
      });
      commit(fresh());
      setOpen(false);
      setFilingOpen(false);
      setBodyOpen(false);
      // The safety strip reads the studio's notes again (a queued note is in this iPad's copy).
      onFloorNoteAdded?.();
      return;
    }
    const w = clientNoteOf(d);
    if (!w) return;
    /* No client yet (an open session before Who's this?; the open session
       round's review, Oct 9 2026): nothing to file it on, so nothing is
       written (addMachineNote refuses it) and the words stay. Said plainly,
       never a Try again that can't work; "The machine itself" still saves. */
    if (!clientId.trim()) {
      setStatus({ text: NOTE_NEEDS_CLIENT, retry: false });
      return;
    }
    let write: Promise<MachineNote | null>;
    try {
      write = addMachineNote({
        clientId,
        machineId,
        machineName,
        existingNotes: [...(legacyNotes ?? [])],
        // Room left for the "{machine} — " the journal copy carries, under the journal's rule.
        content: machineNoteBody(w.body, machineName),
        filing: { kind: w.kind, category: w.category, bodyParts: w.bodyParts },
        importance: w.importance,
        author,
        journal: { ...journalContext, origin: noteOrigin(door) },
      });
    } catch (err) {
      write = Promise.reject(err);
    }
    setBusy(true);
    const outcome = await settleOrQueue(write, isOnline());
    setBusy(false);
    if (outcome.kind === "failed") {
      console.error("[machine menu] note not saved", outcome.error);
      setStatus(noteSaveLine("failed"));
      return;
    }
    if (outcome.kind === "queued") whenRefusedLater(write, (err) => refusedLater(d, "client", err), (note) => !note);
    setStatus(noteSaveLine(outcome.kind));
    commit(fresh());
    setOpen(false);
    setFilingOpen(false);
    setBodyOpen(false);
  };

  const cancel = () => {
    // Words about another machine (or none) aren't this box's to throw away.
    if (ours) commit(fresh());
    setOpen(false);
    setFilingOpen(false);
    setBodyOpen(false);
    setStatus(null);
  };

  /* ---------------- the list ---------------- */

  const names = useMemo(() => (machineNames && machineNames.length ? [...machineNames] : [machineName]), [machineNames, machineName]);
  const { threads, copiesLeftOut } = useMemo(() => {
    if (!journal) return { threads: null, copiesLeftOut: false };
    const mine = journal.filter((e) => e && e.machineId === machineId && !e.isArchived && (e.body ?? "").trim() !== "");
    const notes = withoutSettingsCopies(mine, history, names);
    // The rail and the grid count a settings save's copy (they can't tell
    // one without the setting changes); the empty line says where they are.
    return { threads: assembleThreads(notes), copiesLeftOut: notes.length < mine.length };
  }, [journal, machineId, history, names]);
  const zones = useMemo(() => (threads ? threadsByZone(threads, today) : null), [threads, today]);
  // The old list's notes that have no journal copy: shown, never written.
  const earlier = useMemo(
    () =>
      machineNotesFor({ machineId, machineName, legacy: legacyNotes ?? [], journal: journal ?? null }).filter((n) => !n.journalEntryId),
    [machineId, machineName, legacyNotes, journal],
  );

  const head: NoteThread | null = zones
    ? (newestFirst(zones.open.filter((t) => t.root.importance !== "critical"))[0] ?? newestFirst(zones.standing)[0] ?? null)
    : null;
  const count = (threads?.length ?? 0) + earlier.length;

  const [all, setAll] = useState(false);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const [updFor, setUpdFor] = useState<string | null>(null);
  const [updText, setUpdText] = useState("");
  const updTextRef = useRef(updText);
  updTextRef.current = updText;
  const [threadStatus, setThreadStatus] = useState<{ id: string; text: string } | null>(null);
  const [offList, setOffList] = useState<NoteThread | null>(null);
  const blockRef = useRef<HTMLElement | null>(null);

  // The chart's Open note: the list opens with that note's thread open in
  // it, and the block comes into view.
  const focusNonce = focusNote?.nonce ?? null;
  useEffect(() => {
    if (focusNonce === null || !focusNote) return;
    setAll(true);
    setOpenThread(focusNote.id);
    blockRef.current?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  useUnsavedChanges(!readOnly && updText.trim() !== "", `an update to a ${machineName} note`, {
    onDiscard: () => {
      setUpdText("");
      setUpdFor(null);
    },
  });

  // "Taken off the list · Undo" lasts ten seconds.
  useEffect(() => {
    if (!offList) return;
    const timer = window.setTimeout(() => setOffList(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [offList]);

  const journalAuthor = author ? { id: author.id, initials: author.initials || "??", fullName: author.fullName } : null;
  const say = (id: string, text: string) => setThreadStatus({ id, text });
  const fire = (id: string, p: Promise<unknown>, failed = THREAD_WORDS.actionFailed) => {
    p.catch((err) => {
      console.error("[machine menu] note change not saved", err);
      say(id, failed);
    });
  };

  const saveUpdate = async (t: NoteThread) => {
    const body = updText.trim();
    if (!journalAuthor || !body) return;
    let write: Promise<string | null>;
    try {
      write = addThreadUpdate(t.root, journalAuthor, body, {
        origin: noteOrigin(door),
        sessionId: door === "session" ? (journalContext.sessionId ?? null) : null,
      });
    } catch (err) {
      write = Promise.reject(err);
    }
    const outcome = await settleOrQueue(write, isOnline());
    if (outcome.kind === "failed") {
      say(t.id, THREAD_WORDS.updateFailed);
      return;
    }
    if (outcome.kind === "queued") {
      // Refused after "saved on this iPad": the words come back while the update box is empty.
      whenRefusedLater(
        write,
        (err) => {
          console.error("[machine menu] update refused after it was saved on this iPad", err);
          if (!live.current) {
            sayAfterClose(updateRefusedLaterWords(machineName));
            return;
          }
          setOpenThread(t.id);
          if (updTextRef.current.trim()) {
            say(t.id, updateRefusedLaterWords(machineName));
            return;
          }
          setUpdFor(t.id);
          setUpdText(body);
          say(t.id, THREAD_WORDS.updateFailed);
        },
        (id) => !id,
      );
    }
    setUpdText("");
    setUpdFor(null);
    setThreadStatus(null);
  };

  const row = (t: NoteThread, zone: "open" | "standing" | "resolved") => {
    const key = noteKey(t.root.importance, { resolved: zone === "resolved" });
    const Glyph = key.glyph;
    const isOpen = openThread === t.id;
    const tag = sessionNumberTag(t.root.sessionNumber ?? null, quotableNumbers);
    const meta = [key.listWord, whoOf(t.root), shortDay(dayOf(t.root.occurredAt), today) || null, tag].filter(Boolean).join(" · ");
    const resolved = zone === "resolved";
    const link = door === "profile" && onOpenSession && t.root.sessionId ? sessionLinkLabel(t.root, null, quotableNumbers, today) : null;
    return (
      <div className="mm-note" key={t.id} data-note={t.id} data-zone={zone}>
        <button
          type="button"
          className="mm-note__row"
          aria-expanded={isOpen}
          onClick={() => {
            setOpenThread(isOpen ? null : t.id);
            setMoreFor(null);
          }}
        >
          <Glyph size={16} className={GLYPH_CLASS[key.color]} aria-hidden="true" />
          <span className="mm-note__text">{machineNoteWords(t.root.body, machineName)}</span>
        </button>
        <div className="mm-note__meta">{meta}</div>
        {isOpen ? (
          <div className="mm-thread">
            <p className="mm-thread__file">Filed as {filedAsWords(noteCategoryOf(t.root), flavourOf(t.root))}</p>
            {t.updates.length > 0 ? (
              <ul className="mm-ups">
                {t.updates.map((u) => (
                  <li key={u.id}>
                    <span className="mm-up__meta">
                      {whoOf(u)}
                      {shortDay(dayOf(u.occurredAt), today) ? ` · ${shortDay(dayOf(u.occurredAt), today)}` : ""}
                    </span>
                    {machineNoteWords(u.body, machineName)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mm-none">{THREAD_WORDS.noUpdates}</p>
            )}
            {link ? (
              <button type="button" className="mm-btn" onClick={() => onOpenSession!(t.root.sessionId!)}>
                {link}
              </button>
            ) : null}
            {!readOnly && journalAuthor ? (
              updFor === t.id ? (
                <div className="mm-upd">
                  <label className="mm-sr" htmlFor={`upd-${t.id}`}>
                    Update to this note
                  </label>
                  <input
                    id={`upd-${t.id}`}
                    className="mm-upd__input"
                    placeholder={THREAD_WORDS.updatePlaceholder}
                    value={updText}
                    autoComplete="off"
                    onChange={(e) => setUpdText(e.target.value)}
                  />
                  <button
                    type="button"
                    className="mm-quiet"
                    onClick={() => {
                      setUpdFor(null);
                      setUpdText("");
                    }}
                  >
                    Cancel
                  </button>
                  <button type="button" className="mm-btn mm-btn--live" disabled={!updText.trim()} onClick={() => void saveUpdate(t)}>
                    {THREAD_WORDS.saveUpdate}
                  </button>
                </div>
              ) : (
                <div className="mm-thread__btns">
                  <button
                    type="button"
                    className="mm-btn"
                    onClick={() => {
                      setUpdFor(t.id);
                      setUpdText("");
                      setMoreFor(null);
                    }}
                  >
                    {THREAD_WORDS.addUpdate}
                  </button>
                  <button type="button" className="mm-btn" aria-expanded={moreFor === t.id} onClick={() => setMoreFor(moreFor === t.id ? null : t.id)}>
                    {THREAD_WORDS.more}
                  </button>
                </div>
              )
            ) : null}
            {!readOnly && journalAuthor && moreFor === t.id ? (
              <div className="mm-menu-row">
                <button
                  type="button"
                  className="mm-btn"
                  onClick={() => {
                    setMoreFor(null);
                    fire(t.id, resolved || t.isResolved ? reopenThread(t.id) : closeThread(t.id));
                  }}
                >
                  {resolved || t.isResolved ? THREAD_WORDS.reopen : THREAD_WORDS.close}
                </button>
                <button
                  type="button"
                  className="mm-btn"
                  onClick={() => {
                    setMoreFor(null);
                    say(t.id, THREAD_WORDS.hushed);
                    fire(t.id, dismissThread(journalAuthor.id, t.id));
                  }}
                >
                  {THREAD_WORDS.hush}
                </button>
                <button
                  type="button"
                  className="mm-btn"
                  onClick={() => {
                    setMoreFor(null);
                    setOpenThread(null);
                    setOffList(t);
                    archiveThread(t).catch((err) => {
                      console.error("[machine menu] note not taken off the list", err);
                      setOffList(null);
                      setStatus({ text: THREAD_WORDS.actionFailed, retry: false });
                    });
                  }}
                >
                  {THREAD_WORDS.off}
                </button>
              </div>
            ) : null}
            {threadStatus?.id === t.id ? (
              <p className="mm-status" role="status">
                {threadStatus.text}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  // An old-list note flagged important is Critical, as the safety strip, the
  // chart's lane and the grid's mark all say it (safety.ts, machine-notes.ts).
  const earlierRow = (n: (typeof earlier)[number]) => {
    const key = noteKey(n.isImportant ? "critical" : "standard");
    const Glyph = key.glyph;
    const day = n.timestamp ? studioDateKey(new Date(n.timestamp)) : null;
    return (
      <div className="mm-note" key={n.id} data-note={n.id} data-zone="earlier">
        <div className="mm-note__row mm-note__row--still">
          <Glyph size={16} className={GLYPH_CLASS[key.color]} aria-hidden="true" />
          <span className="mm-note__text">{machineNoteWords(n.content, machineName)}</span>
        </div>
        <div className="mm-note__meta">
          {[key.listWord, (n.authorName ?? "").trim().split(/\s+/)[0] || null, shortDay(day, today) || null].filter(Boolean).join(" · ")}
        </div>
      </div>
    );
  };

  const list = () => {
    /* No client yet (an open session before Who's this?): there are no
       notes of theirs to read, so the list never loads. Said, never
       "Loading notes…" for as long as the session has no client (the open
       session's screens preview, Oct 9 2026). */
    if (!clientId.trim()) return <p className="mm-none">{NOTES_NEED_CLIENT}</p>;
    if (!zones) {
      return <p className="mm-none">{journalFailed ? NOTES_UNREAD_LINE : THREAD_WORDS.loading}</p>;
    }
    if (count === 0) return <p className="mm-none">{copiesLeftOut ? THREAD_WORDS.noneButCopies : THREAD_WORDS.none}</p>;
    if (!all) {
      if (head) return row(head, zones.open.includes(head) ? "open" : "standing");
      // An important old note is already in the safety strip, as an open Critical thread is.
      const quiet = earlier.find((n) => !n.isImportant);
      return quiet ? earlierRow(quiet) : null;
    }
    return (
      <>
        {zones.open.length > 0 ? (
          <>
            <p className="mm-grp-h">{THREAD_WORDS.open}</p>
            {zones.open.map((t) => row(t, "open"))}
          </>
        ) : null}
        {zones.standing.length > 0 || earlier.length > 0 ? (
          <>
            <p className="mm-grp-h">{THREAD_WORDS.standing}</p>
            {zones.standing.map((t) => row(t, "standing"))}
            {earlier.map(earlierRow)}
          </>
        ) : null}
        {zones.resolved.length > 0 ? (
          <>
            <button type="button" className="mm-grp-btn" aria-expanded={resolvedOpen} onClick={() => setResolvedOpen((o) => !o)}>
              {resolvedLabel(zones.resolved.length)}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {resolvedOpen ? zones.resolved.map((t) => row(t, "resolved")) : null}
          </>
        ) : null}
      </>
    );
  };

  /* ---------------- drawing ---------------- */

  const otherName = owner === "other" && effective.machineId ? (machineNameOf?.(effective.machineId) ?? null) : null;
  const [clientChoice, machineChoice] = aboutChoices(clientFirstName);
  const title = target === "floor" ? floorTitle(floorStudio.name, machineName) : composerTitle(clientFirstName, machineName);
  const pickedByHand = effective.importance !== startingLoudness(effective.category);

  return (
    <section ref={blockRef} className="mm-blk" data-block="notes" aria-label="Notes">
      <div className="mm-blk-head">
        <h3 className="mm-h">Notes</h3>
        {count > 0 ? (
          <button type="button" className="mm-link" aria-expanded={all} onClick={() => setAll((a) => !a)}>
            {all ? THREAD_WORDS.fewer : allNotesLabel(count)}
          </button>
        ) : null}
      </div>

      {!readOnly ? (
        <div className="mm-cmp" data-open={showOpen ? "true" : undefined} data-target={target}>
          {showOpen ? <p className="mm-cmp__title">{title}</p> : null}
          <textarea
            ref={textRef}
            className="mm-cmp__text"
            rows={showOpen ? 3 : 1}
            placeholder={composerPlaceholder(clientFirstName, machineName)}
            aria-label={title}
            value={effective.body}
            // Held still while a save waits (at most a moment): readOnly, not
            // disabled, so the iPad keeps the focus and the keyboard.
            readOnly={busy}
            onFocus={() => {
              setOpen(true);
              keepAboveKeyboard();
            }}
            onChange={(e) => {
              setStatus(null);
              commit(typeInto(effective, machineId, e.target.value));
            }}
          />
          {showOpen ? (
            <div className="mm-cmp__controls">
              {!ours ? (
                <div className="mm-cmp__row">
                  <span className="mm-cmp__other">{owner === "other" ? aboutWords(otherName ?? "another machine") : THREAD_WORDS.notAboutMachine}</span>
                  <button type="button" className="mm-btn" disabled={busy} onClick={() => commit(makeItAbout(effective, machineId))}>
                    {makeItAboutWords(machineName)}
                  </button>
                </div>
              ) : (
                <>
                  <div className="mm-cmp__row">
                    <span className="mm-cmp__lbl" id={aboutId}>
                      About
                    </span>
                    <div className="mm-seg" role="radiogroup" aria-labelledby={aboutId}>
                      <button
                        type="button"
                        role="radio"
                        className="mm-seg__opt"
                        aria-checked={target === "client"}
                        disabled={busy}
                        onClick={() => commit(setTarget(effective, "client"))}
                      >
                        {clientChoice}
                      </button>
                      <button
                        type="button"
                        role="radio"
                        className="mm-seg__opt"
                        aria-checked={target === "floor"}
                        disabled={busy || !floorStudio.id}
                        onClick={() => commit(setTarget(effective, "floor"))}
                      >
                        {machineChoice}
                      </button>
                    </div>
                  </div>
                  {target === "client" ? (
                    <>
                      <div className="mm-cmp__row">
                        <span className="mm-cmp__lbl">Filed as</span>
                        <span className="mm-cmp__val" data-filed="">
                          {filedAsWords(effective.category, effective.flavour)}
                        </span>
                        <button type="button" className="mm-btn" aria-expanded={filingOpen} disabled={busy} onClick={() => setFilingOpen((o) => !o)}>
                          Change
                        </button>
                      </div>
                      {filingOpen ? (
                        <div className="mm-choices" role="group" aria-label="File the note as">
                          {FILING_CHIPS.map((chip) => (
                            <button
                              key={chip.id}
                              type="button"
                              className="mm-choice"
                              disabled={busy}
                              aria-pressed={chipOf(effective.category, effective.flavour)?.id === chip.id}
                              onClick={() => {
                                commit(fileDraft(effective, chip, pickedByHand));
                                setFilingOpen(false);
                              }}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {reachesLeaders(effective.category) ? <p className="mm-cmp__reach">{LEADERS_LINE}.</p> : null}
                      {asksWhereOnBody(effective.category) ? (
                        bodyOpen ? (
                          <BodyPartPicker value={effective.bodyParts} onChange={(parts) => commit({ ...effective, bodyParts: parts })} />
                        ) : (
                          <div className="mm-cmp__row">
                            <button type="button" className="mm-btn" disabled={busy} onClick={() => setBodyOpen(true)}>
                              Where on the body (optional)
                            </button>
                          </div>
                        )
                      ) : null}
                      <div className="mm-cmp__loud">
                        <Loudness compact hint={false} disabled={busy} value={effective.importance} onChange={(lvl) => commit({ ...effective, importance: lvl })} />
                      </div>
                    </>
                  ) : null}
                </>
              )}
              <div className="mm-cmp__btns">
                {ours ? (
                  <button type="button" className="mm-quiet" onClick={cancel} disabled={busy}>
                    Cancel
                  </button>
                ) : null}
                {ours ? (
                  <button
                    type="button"
                    className="mm-add"
                    disabled={busy || !hasText || !author || (target === "floor" && !floorStudio.id)}
                    onClick={() => void add()}
                  >
                    {addButtonLabel(target, floorStudio.name)}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div role="status" className="mm-status-slot">
        {status ? (
          <p className="mm-status">
            <span>{status.text}</span>
            {status.retry && hasText ? (
              <button type="button" className="mm-btn" onClick={() => void add()}>
                Try again
              </button>
            ) : null}
          </p>
        ) : null}
        {offList ? (
          <p className="mm-status">
            <span>{THREAD_WORDS.offDone}</span>
            <button
              type="button"
              className="mm-btn"
              onClick={() => {
                const t = offList;
                setOffList(null);
                unarchiveThread(t).catch((err) => {
                  console.error("[machine menu] note not put back", err);
                  setStatus({ text: THREAD_WORDS.actionFailed, retry: false });
                });
              }}
            >
              {THREAD_WORDS.undo}
            </button>
          </p>
        ) : null}
      </div>
      <div className="mm-notes">{list()}</div>
    </section>
  );
}
