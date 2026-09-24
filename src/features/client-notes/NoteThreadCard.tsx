/**
 * A THREAD ON SCREEN — the note, then everything that happened to it.
 *
 * Notes round, Sep 2026; redrawn for the Notes page (client codex, Sep 2026)
 * as ONE panel rather than an entry card with a spine hung under it: the tag
 * row (what kind, which machine, how loud), the note, the spine of updates
 * oldest first, who and when, where it stands with YOUR briefing, and the two
 * actions. The dense entry card (`JournalEntryCard`) stays on the briefing,
 * the flags sheet and the session sheet; both read the same helpers
 * (`noteCardLabel`, `describeWindow`, `windowEnded`, the Loudness words), so
 * the two drawings cannot drift apart in what they say.
 *
 * On the record, a card's colour is its LOUDNESS and nothing else: a crimson
 * edge for Critical, plum for Heads up (the one Loudness control's mapping,
 * `LOUDNESS_TONE`), a quiet edge for a plain note. What kind of note it is
 * reads from the glyph and the label in neutral ink — the record-page
 * exception to the journal's hue contract (types/journal.ts), which the
 * briefing's and the floor's dense cards keep.
 *
 * Two actions, and the wording is the decision:
 *   "Add an update"  is the ordinary one, and it is offered even on a note
 *                    today contradicted. A trainer whose client did the
 *                    overhead movement fine adds "performed overhead, seemed
 *                    okay" — see threads.ts for why closing would be worse.
 *   Close            closes the thread. Any trainer may (AJ, Sep 20), and it
 *                    always reopens. Its words fit the note (`closeWordsOf`):
 *                    "All healed up" / "It's back" for an injury or an
 *                    incident, "Close" / "Reopen" for everything else — an
 *                    equipment note is not "healed".
 *
 * The ⋯ menu holds Archive, with an inline confirm, and archives the WHOLE
 * thread (`archiveThread`), so its updates never come back as stray notes.
 * An imported record is somebody else's: no update, no close, no ⋯.
 */
import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Dumbbell, MoreHorizontal, Plus, RotateCcw } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import type { Machine } from "../../types";
import { IMPORTANCE_META, toDate } from "../../types/journal";
import type { JournalAuthor } from "../../hooks/useClientJournal";
import { studioDateKey } from "../../lib/studio-time";
import { LOUDNESS_TONE } from "../rating/Loudness";
import { addThreadUpdate, archiveThread, closeThread, reopenThread } from "./thread-write";
import { updateCountLabel, type NoteThread } from "./threads";
import { noteCardLabel, noteCategoryOf } from "./note-catalog";
import { NoteCategoryIcon } from "./NoteCategoryChips";
import { windowEnded } from "./mattering";
import { closeWordsOf, shortDay, threadCardMeta, whoOf, type BriefingStatus } from "./record-selectors";
import "./notes-page.css";

export interface NoteThreadCardProps {
  /** React 19 types require key to be declared on the props type. */
  key?: React.Key;
  thread: NoteThread;
  machines: Machine[];
  /** Who is writing. Null makes the thread read-only — no update, no close, no archive. */
  author?: JournalAuthor | null;
  /** Start with the spine open. The Open zone and an opened row draw it open. */
  defaultOpen?: boolean;
  /** The studio's day (yyyy-mm-dd). Defaults to today's. */
  today?: string;
  /** Where the thread stands with this trainer's next briefing; null draws no line. */
  briefing?: BriefingStatus | null;
  /** "No need to remind me" — offered only once the trainer's dismissals are read. */
  onHush?: () => void;
  /** "Show it again". */
  onRestore?: () => void;
}

type MenuState = "closed" | "menu" | "confirm";

const dayOfEntry = (v: unknown): string | null => {
  const d = toDate(v);
  return d ? studioDateKey(d) : null;
};

function BriefingLine({
  briefing,
  today,
  onHush,
  onRestore,
}: {
  briefing: BriefingStatus;
  today: string;
  onHush?: () => void;
  onRestore?: () => void;
}) {
  switch (briefing.kind) {
    case "on":
      return (
        <div className="nt-brief">
          {/* Until this trainer's dismissals are read, the card cannot say
              whether they hushed it: only that the briefing reads it out. */}
          <span>{briefing.checked ? "On your next briefing." : "On the briefing."}</span>
          {briefing.checked && onHush ? (
            <button type="button" className="nt-btn nt-btn--quiet" onClick={onHush}>
              No need to remind me
            </button>
          ) : null}
        </div>
      );
    case "hushed":
      return (
        <div className="nt-brief">
          <span>You hushed this on your briefing. Only you can see that.</span>
          {onRestore ? (
            <button type="button" className="nt-btn nt-btn--quiet" onClick={onRestore}>
              Show it again
            </button>
          ) : null}
        </div>
      );
    case "from":
      return (
        <div className="nt-brief">
          <span>On the briefing from {shortDay(briefing.day, today) || "its start day"}.</span>
        </div>
      );
    case "aged-off":
      return (
        <div className="nt-brief">
          <span>
            Off the briefing since {shortDay(briefing.since, today) || "three weeks after it was written"}: a Heads up
            with no end day is read out for three weeks.
          </span>
        </div>
      );
  }
}

export function NoteThreadCard({
  thread,
  machines,
  author = null,
  defaultOpen = false,
  today: todayProp,
  briefing = null,
  onHush,
  onRestore,
}: NoteThreadCardProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<MenuState>("closed");
  const spineId = useId();
  const menuId = useId();
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  // The update box takes focus when it opens — on a tap, never on mount
  // (no `autoFocus`: a hidden page of the codex mounts too, and would steal it).
  useEffect(() => {
    if (composing) boxRef.current?.focus({ preventScroll: true });
  }, [composing]);

  const today = todayProp || studioDateKey(new Date()) || "";
  const { root, updates, isResolved } = thread;
  // An imported record is somebody else's; we do not write onto it.
  const canWrite = !!author && !root.isLegacy;
  const words = closeWordsOf(root);
  const done = isResolved || windowEnded(root, today);
  const loud = done ? "plain" : root.importance === "critical" ? "critical" : root.importance === "elevated" ? "headsup" : "plain";
  const machine = root.machineId ? machines.find((m) => m.id === root.machineId) ?? null : null;
  const lastUpdate = updates.length ? updates[updates.length - 1] : null;
  const lastDay = lastUpdate ? shortDay(dayOfEntry(lastUpdate.occurredAt), today) : "";

  const className = [
    "nt-card",
    `nt-card--${loud}`,
    done ? "nt-card--resolved" : "",
    root.isLegacy ? "nt-card--legacy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const save = async () => {
    if (!author || !text.trim() || busy) return;
    setBusy(true);
    try {
      await addThreadUpdate(root, author, text, { origin: "profile" });
      setText("");
      setComposing(false);
      setOpen(true);
      toastSuccess("Added to the thread.");
    } catch {
      toastError("Could not add that update. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggleResolved = async () => {
    if (!canWrite || busy) return;
    setBusy(true);
    try {
      if (isResolved) {
        await reopenThread(root.id);
        toastSuccess("Thread reopened.");
      } else {
        await closeThread(root.id);
        toastSuccess("Thread closed. It stays in the notes.");
      }
    } catch {
      toastError("Could not change that thread. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!canWrite || busy) return;
    setBusy(true);
    try {
      await archiveThread(thread);
      setMenu("closed");
      toastSuccess("Archived. It has left every screen.");
    } catch {
      toastError("Could not archive that note. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const pill = isResolved ? (
    <span className="nt-pill" data-tone="ok">
      Resolved
    </span>
  ) : loud !== "plain" ? (
    <span className="nt-pill" data-tone={LOUDNESS_TONE[root.importance]}>
      {IMPORTANCE_META[root.importance].short}
    </span>
  ) : null;

  return (
    <article className={className} id={`thread-${root.id}`} data-testid={`thread-${root.id}`}>
      <div className="nt-top">
        <span className="nt-cat">
          <NoteCategoryIcon id={noteCategoryOf(root)} className="nt-cat__icon" />
          {noteCardLabel(root)}
        </span>
        {root.kind === "life" && root.category ? <span className="nt-chip">{root.category}</span> : null}
        {machine ? (
          <span className="nt-chip">
            <Dumbbell size={14} aria-hidden />
            {machine.name}
          </span>
        ) : null}
        <span className="nt-grow" />
        {pill}
        {canWrite ? (
          <button
            type="button"
            className="nt-more"
            aria-label="More for this note"
            aria-expanded={menu !== "closed"}
            aria-controls={menuId}
            onClick={() => setMenu((m) => (m === "closed" ? "menu" : "closed"))}
          >
            <MoreHorizontal size={18} aria-hidden />
          </button>
        ) : null}
      </div>

      {canWrite && menu !== "closed" ? (
        <div className="nt-menu" id={menuId}>
          {menu === "menu" ? (
            <button type="button" className="nt-btn" onClick={() => setMenu("confirm")}>
              Archive…
            </button>
          ) : (
            <>
              <p className="nt-menu__ask">
                Archive this note
                {updates.length ? ` and its ${updates.length === 1 ? "update" : `${updates.length} updates`}` : ""}? It
                leaves every screen.
              </p>
              <button type="button" className="nt-btn nt-btn--danger" disabled={busy} onClick={() => void archive()}>
                Archive
              </button>
              <button type="button" className="nt-btn nt-btn--quiet" disabled={busy} onClick={() => setMenu("closed")}>
                Keep
              </button>
            </>
          )}
        </div>
      ) : null}

      <p className="nt-body">{root.body}</p>

      {updates.length > 0 ? (
        <>
          <button
            type="button"
            className="nt-spine-toggle"
            aria-expanded={open}
            aria-controls={spineId}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown size={14} className={open ? "nt-chev nt-chev--open" : "nt-chev"} aria-hidden />
            {updateCountLabel(thread)}
            {lastDay ? ` · last ${lastDay}` : ""}
          </button>
          {open ? (
            <ol className="nt-upd" id={spineId} data-testid={`spine-${root.id}`}>
              {updates.map((u) => {
                const day = shortDay(dayOfEntry(u.occurredAt), today);
                return (
                  <li key={u.id} className="nt-upd__item">
                    <b className="nt-upd__by">
                      {day ? `${day} · ` : ""}
                      {whoOf(u)}:
                    </b>{" "}
                    <span className="nt-upd__body">{u.body}</span>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </>
      ) : null}

      <p className="nt-meta">{threadCardMeta(thread, today)}</p>

      {briefing ? <BriefingLine briefing={briefing} today={today} onHush={onHush} onRestore={onRestore} /> : null}

      {canWrite ? (
        <div className="nt-acts">
          {composing ? (
            <div className="nt-compose">
              <textarea
                className="nc-input"
                rows={2}
                value={text}
                ref={boxRef}
                onChange={(e) => setText(e.target.value)}
                placeholder="What happened? It joins this note rather than starting a new one."
                aria-label="Add an update to this note"
              />
              <div className="nt-compose__row">
                <button type="button" className="nt-btn nt-btn--solid" disabled={!text.trim() || busy} onClick={() => void save()}>
                  Add it
                </button>
                <button
                  type="button"
                  className="nt-btn nt-btn--quiet"
                  disabled={busy}
                  onClick={() => {
                    setComposing(false);
                    setText("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" className="nt-btn" onClick={() => setComposing(true)}>
                <Plus size={16} aria-hidden /> Add an update
              </button>
              <button type="button" className="nt-btn" disabled={busy} onClick={() => void toggleResolved()}>
                {isResolved ? (
                  <>
                    <RotateCcw size={16} aria-hidden /> {words.reopen}
                  </>
                ) : (
                  <>
                    <Check size={16} aria-hidden /> {words.close}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}
