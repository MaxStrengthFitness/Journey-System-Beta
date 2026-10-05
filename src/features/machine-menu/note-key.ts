/**
 * THE MACHINE MENU — the one note key: how loud a note is, as a glyph.
 *
 * One key across the Journey grid's machine-name mark, the card and the Hub,
 * so a trainer learns it once (machine menu design, Oct 2026; AJ, Oct 4 2026:
 * "ill take all your recommended"):
 *
 *   Note      NotebookPen    --eq-ink-2    the grid's own note glyph
 *   Heads up  AlertCircle    --eq-warn     plum: never machine fit's Diamond,
 *                                          never the Hub's MessageCircle
 *   Critical  AlertTriangle  --eq-alert    the Hub's triangle; its SHAPE can't
 *                                          be confused with the kaizen ring,
 *                                          which shares its crimson
 *   Resolved  its own glyph  --eq-ink-muted, and the word "Resolved" in a list
 *
 * The colours follow the Loudness control's one mapping (`LOUDNESS_TONE`:
 * Note quiet, Heads up plum, Critical crimson), so a mark always draws the
 * colour of the control that set it. The red kaizen mark stays rep quality's:
 * a note is told apart from it by shape and by lane, never by a second red.
 *
 * PURE — icons are component references, a value, not a render.
 */
import { AlertCircle, AlertTriangle, NotebookPen, type LucideIcon } from "lucide-react";
import { IMPORTANCE_META, type JournalImportance } from "../../types/journal";
import { LOUDNESS_TONE, type LoudnessTone } from "../rating/Loudness";

export type NoteGlyphName = "NotebookPen" | "AlertCircle" | "AlertTriangle";

/** The colour token a mark is drawn in. */
export type NoteKeyColor = "--eq-ink-2" | "--eq-warn" | "--eq-alert" | "--eq-ink-muted";

export interface NoteKey {
  importance: JournalImportance;
  /** The Loudness control's word: Note · Heads up · Critical. */
  word: string;
  /** What a list says beside it: the loudness word, or "Resolved". */
  listWord: string;
  glyph: LucideIcon;
  glyphName: NoteGlyphName;
  /** The Loudness control's tone for this level (a resolved note keeps its level's tone). */
  tone: LoudnessTone;
  /** The token the mark is drawn in: the tone's colour, or muted once resolved. */
  color: NoteKeyColor;
  resolved: boolean;
}

const GLYPH: Record<JournalImportance, { glyph: LucideIcon; name: NoteGlyphName }> = {
  standard: { glyph: NotebookPen, name: "NotebookPen" },
  elevated: { glyph: AlertCircle, name: "AlertCircle" },
  critical: { glyph: AlertTriangle, name: "AlertTriangle" },
};

const TONE_COLOR: Record<LoudnessTone, NoteKeyColor> = {
  quiet: "--eq-ink-2",
  warn: "--eq-warn",
  alert: "--eq-alert",
};

/** A stored importance, or Note for anything else (an old row, a missing field). */
export function asImportance(v: unknown): JournalImportance {
  return v === "elevated" || v === "critical" ? v : "standard";
}

/** The key for a note of this loudness. */
export function noteKey(importance: unknown, opts: { resolved?: boolean } = {}): NoteKey {
  const level = asImportance(importance);
  const resolved = !!opts.resolved;
  const tone = LOUDNESS_TONE[level];
  const word = IMPORTANCE_META[level].short;
  return {
    importance: level,
    word,
    listWord: resolved ? "Resolved" : word,
    glyph: GLYPH[level].glyph,
    glyphName: GLYPH[level].name,
    tone,
    color: resolved ? "--eq-ink-muted" : TONE_COLOR[tone],
    resolved,
  };
}

/** The loudness the timeline model gives a lane note ("standard" | "elevated" | "critical") is a stored importance. */
export function noteKeyOf(note: { loudness: unknown; resolved?: boolean }): NoteKey {
  return noteKey(note.loudness, { resolved: note.resolved });
}

const RANK: Record<JournalImportance, number> = { standard: 1, elevated: 2, critical: 3 };

/**
 * The loudest of several open notes, for one mark that stands for them all
 * (the grid's machine name, a lane column holding two). Resolved notes are
 * left out; null when nothing open is left.
 */
export function loudestOpen(notes: readonly { importance: unknown; resolved?: boolean }[]): JournalImportance | null {
  let best: JournalImportance | null = null;
  for (const n of notes) {
    if (n.resolved) continue;
    const level = asImportance(n.importance);
    if (best === null || RANK[level] > RANK[best]) best = level;
  }
  return best;
}
