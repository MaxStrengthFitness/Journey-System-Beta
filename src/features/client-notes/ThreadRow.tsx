/**
 * ONE LINE FOR A THREAD — Standing context and Resolved on the Notes page.
 *
 * Client codex, Sep 2026. A standing note is simply true ("Leg Press: seat 7,
 * gap 6") and a resolved one is history, so neither is drawn as a full card:
 * each is one row — what kind, the words, who and when — and a tap opens the
 * whole thread in place, under its row, with the row staying as the way to
 * fold it again. So a client with forty standing notes reads as a list, and
 * the Open cards above it are not buried.
 *
 * The machine is named first and in full, before the note's first line, so
 * it is never the part that is cut: only the note's words may fold to two
 * lines (`.nx-row__body`, the one clamp the codex's scale test allows), and
 * the whole note is one tap away. Who and when are never cut.
 */
import React from "react";
import type { Machine } from "../../types";
import type { JournalAuthor } from "../../hooks/useClientJournal";
import { noteCardLabel, noteCategoryOf } from "./note-catalog";
import { NoteCategoryIcon } from "./NoteCategoryChips";
import type { NoteThread } from "./threads";
import { threadRowMeta } from "./record-selectors";
import { NoteThreadCard } from "./NoteThreadCard";
import "./notes-page.css";

export interface ThreadRowProps {
  /** React 19 types require key to be declared on the props type. */
  key?: React.Key;
  thread: NoteThread;
  zone: "standing" | "resolved";
  machines: Machine[];
  today: string;
  expanded: boolean;
  onToggle: () => void;
  author: JournalAuthor | null;
}

/** The note's first line with words on it — a row's text. */
export function firstLineOf(body: string | null | undefined): string {
  for (const line of (body ?? "").split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

export function ThreadRow({ thread, zone, machines, today, expanded, onToggle, author }: ThreadRowProps) {
  const root = thread.root;
  const machine = root.machineId ? machines.find((m) => m.id === root.machineId)?.name?.trim() || null : null;
  const line = firstLineOf(root.body);
  return (
    <>
      <button
        type="button"
        className={zone === "resolved" ? "nx-row nx-row--done" : "nx-row"}
        id={`row-${root.id}`}
        data-testid={`row-${root.id}`}
        aria-expanded={expanded}
        aria-controls={`thread-${root.id}`}
        onClick={onToggle}
      >
        <span className="nx-row__label">
          <NoteCategoryIcon id={noteCategoryOf(root)} className="nx-row__icon" />
          <span className="nx-row__kind">{noteCardLabel(root)}</span>
        </span>
        <span className="nx-row__body">
          {machine ? <b className="nx-row__machine">{line ? `${machine}: ` : machine}</b> : null}
          {line}
        </span>
        <span className="nx-row__meta">{threadRowMeta(thread, zone, today)}</span>
      </button>
      {expanded ? (
        <div className="nx-row-open">
          <NoteThreadCard thread={thread} machines={machines} author={author} today={today} defaultOpen />
        </div>
      ) : null}
    </>
  );
}
