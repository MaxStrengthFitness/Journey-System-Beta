/**
 * THE NOTE A TRAINER STARTED MID-SET — and did not finish.
 *
 * Fluidity round, Sep 18 2026. From the floor (docs/business/the-floor.md):
 *
 *   "I should be able to close the note and have a persistent note while I'm
 *    writing so if I'm writing the note and I really want to look back at
 *    the chart real quick and continue writing my note without closing my
 *    note and losing what I wrote … and then at the very end of a session if
 *    a note wasn't saved but there's something written in there it should
 *    inform the trainer in the post session briefing."
 *
 * Until now the draft was `useState` inside the composer, which was
 * unmounted when the sheet closed — and ALSO remounted whenever the focused
 * machine changed (a keyed fragment) and whenever the trainer switched to the
 * Remember-this or Pulse tab. Type, glance at the chart, come back: empty box.
 * On the one screen where a client is standing there waiting.
 *
 * Now the draft belongs to the SESSION. The tracker owns it, hands it to the
 * composer as a controlled value, mirrors it into sessionStorage under the
 * session id (so a crash and a resume keep it too), and carries it onto the
 * post-session screen, which says so and lets the trainer finish it or drop
 * it. Leaving that screen with the draft still unsaved FILES it unfiled — the
 * To-file tray already exists for exactly this — because nothing a trainer
 * wrote about a client may be lost by the app.
 *
 * PURE MODULE apart from the two storage wrappers, which are best-effort and
 * throw nothing (private window, storage full, harness).
 */

import type { FocusCategory, JournalImportance } from "../../types/journal";
import type { NoteCategory } from "./note-catalog";

export interface SessionNoteDraft {
  body: string;
  category: NoteCategory | null;
  /** The 4 P, when the category is coaching. */
  p: FocusCategory | null;
  importance: JournalImportance;
  /** The machine the note is about, when one was chosen or offered. */
  machineId: string | null;
  /** In a session: whether "About <machine>" was left on. */
  aboutMachine: boolean;
}

export const EMPTY_SESSION_DRAFT: SessionNoteDraft = {
  body: "",
  category: null,
  p: null,
  importance: "standard",
  machineId: null,
  aboutMachine: true,
};

/** A draft is only a draft when there are words in it. */
export function hasDraftText(d: SessionNoteDraft | null | undefined): boolean {
  return !!d && d.body.trim().length > 0;
}

const KEY_PREFIX = "msf_session_note:";

export function sessionDraftKey(sessionId: string): string {
  return KEY_PREFIX + sessionId;
}

/** Defensive: this arrives off storage and is user-writable. */
export function isSessionNoteDraft(v: unknown): v is SessionNoteDraft {
  if (!v || typeof v !== "object") return false;
  const d = v as Partial<SessionNoteDraft>;
  return typeof d.body === "string";
}

export function readSessionDraft(sessionId: string | null | undefined): SessionNoteDraft | null {
  if (!sessionId) return null;
  try {
    const raw = window.sessionStorage.getItem(sessionDraftKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isSessionNoteDraft(parsed)) return null;
    return { ...EMPTY_SESSION_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

/** Writes the draft, or removes the key when there is nothing left to keep. */
export function writeSessionDraft(sessionId: string | null | undefined, draft: SessionNoteDraft): void {
  if (!sessionId) return;
  try {
    if (hasDraftText(draft)) {
      window.sessionStorage.setItem(sessionDraftKey(sessionId), JSON.stringify(draft));
    } else {
      window.sessionStorage.removeItem(sessionDraftKey(sessionId));
    }
  } catch {
    /* best effort — the in-memory copy is still the one on screen */
  }
}

export function clearSessionDraft(sessionId: string | null | undefined): void {
  if (!sessionId) return;
  try {
    window.sessionStorage.removeItem(sessionDraftKey(sessionId));
  } catch {
    /* nothing to clear */
  }
}
