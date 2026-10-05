/**
 * THE MACHINE MENU — the Staircase's readout: a fixed slot above the plot.
 *
 * Idle (nothing preselected; the header already says Last time): the count
 * with the Now Bar's starting weight and green %, how to use the chart, and a
 * key of only the marks in view. A session tapped: its day, trainer and place
 * in the order; its set in 32px; the settings as saved and one event.
 *
 * The slot is 128px whatever it holds (machine-menu.css), so the plot never
 * moves under a finger, and it is `aria-live="polite"`, so a screen reader
 * hears the tapped session. Every word comes from timeline-words.ts; the
 * event line is cut inside the quoted words, never through a name.
 */
import type { ReactElement } from "react";
import { Ban, ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { QualityMark } from "../journey-grid/QualityMark";
import { noteKey, noteKeyOf, type NoteKeyColor } from "./note-key";
import { gainWords, progressWords, startWords, type ProgressFigure } from "./progress-figure";
import type { ViewWindow } from "./timeline-geometry";
import type { LaneNote, TimelineModel } from "./timeline-model";
import { READOUT_WORDS, idleLines, keyItems, readoutFor, type KeyGlyph, type WordsContext } from "./timeline-words";
import "./machine-menu.css";

/** The note key's colour token, as a class. */
export const GLYPH_CLASS: Record<NoteKeyColor, string> = {
  "--eq-ink-2": "mm-g--ink2",
  "--eq-warn": "mm-g--warn",
  "--eq-alert": "mm-g--alert",
  "--eq-ink-muted": "mm-g--muted",
};

/** One mark of the key, drawn as the chart draws it. */
function KeyMark({ glyph }: { glyph: KeyGlyph }) {
  switch (glyph) {
    case "max":
      return <QualityMark quality={3} size={16} className="mm-star" />;
    case "poor":
      return <QualityMark quality={1} size={16} className="mm-kaizen" />;
    case "critical":
    case "headsUp":
    case "note": {
      const key = noteKey(glyph === "critical" ? "critical" : glyph === "headsUp" ? "elevated" : "standard");
      const Glyph = key.glyph;
      return <Glyph size={16} className={GLYPH_CLASS[key.color]} aria-hidden="true" />;
    }
    case "skip":
      return <Ban size={16} className="mm-g--muted" aria-hidden="true" />;
    case "practice":
      return <i className="mm-key__ring" aria-hidden="true" />;
    case "bloodFlow":
      return <i className="mm-key__ring mm-key__ring--flow" aria-hidden="true" />;
    case "setup":
      return <SlidersHorizontal size={16} className="mm-g--ink2" aria-hidden="true" />;
    case "shade":
      return <i className="mm-key__shade" aria-hidden="true" />;
    case "fold":
      return (
        <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true" focusable="false">
          <path d="M6 1 L10 4 L2 8 L10 12 L6 15" className="mm-key__zig" />
        </svg>
      );
  }
}

/** The count, then the Now Bar's starting weight and its green % (only when up). */
export function UsageWords({ sentence, progress }: { sentence: string; progress?: ProgressFigure | null }) {
  const gain = gainWords(progress ?? null);
  return (
    <>
      {sentence}
      {progress && gain && progressWords(progress) ? (
        <>
          {" · "}
          {startWords(progress)}, <span className="mm-gain">{gain}</span>
        </>
      ) : null}
    </>
  );
}

export interface TimelineReadoutProps {
  model: TimelineModel;
  ctx: WordsContext;
  view: ViewWindow;
  /** The tapped column, or null for the idle readout. */
  selected: number | null;
  progress?: ProgressFigure | null;
  /** How long the event line may run (from the width) before its quoted words are cut. */
  eventMax: number;
  onStep: (dir: -1 | 1) => void;
  onClose: () => void;
  onOpenNote?: (note: LaneNote) => void;
}

export function TimelineReadout({ model, ctx, view, selected, progress, eventMax, onStep, onClose, onOpenNote }: TimelineReadoutProps) {
  const r = selected === null ? null : readoutFor(model, selected, ctx, eventMax);

  if (!r || selected === null) {
    const idle = idleLines(model, ctx);
    const key = keyItems(model, view);
    return (
      <div className="mm-readout" aria-live="polite" data-readout="idle">
        {idle.first ? (
          <p className="mm-ro__l1">
            <UsageWords sentence={idle.first} progress={progress} />
          </p>
        ) : null}
        <p className="mm-ro__l2">{idle.second}</p>
        {key.length ? (
          <ul className="mm-key">
            {key.map((k) => (
              <li key={k.glyph} className="mm-key__item">
                <KeyMark glyph={k.glyph} />
                {k.words}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  const col = model.columns[selected];
  const note: LaneNote | null = r.noteId ? model.notes.find((n) => n.id === r.noteId) ?? null : null;
  let eventGlyph: ReactElement | null = null;
  if (r.event?.glyph === "setup") {
    eventGlyph = <SlidersHorizontal size={16} className="mm-g--ink2" aria-hidden="true" />;
  } else if (r.event?.glyph && note) {
    const key = noteKeyOf(note);
    const Glyph = key.glyph;
    eventGlyph = <Glyph size={16} className={GLYPH_CLASS[key.color]} aria-hidden="true" />;
  }

  return (
    <div className="mm-readout" aria-live="polite" data-readout={col.sessionId}>
      <div className="mm-ro__a">
        <span className="mm-ro__a-text">{r.rowA}</span>
        <span className="mm-ro__btns">
          {note && onOpenNote ? (
            <button type="button" className="mm-ro__btn" onClick={() => onOpenNote(note)}>
              {READOUT_WORDS.openNote}
            </button>
          ) : null}
          <button
            type="button"
            className="mm-ro__btn"
            aria-label={READOUT_WORDS.older}
            disabled={selected <= 0}
            onClick={() => onStep(-1)}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mm-ro__btn"
            aria-label={READOUT_WORDS.newer}
            disabled={selected >= model.columns.length - 1}
            onClick={() => onStep(1)}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <button type="button" className="mm-ro__btn" aria-label={READOUT_WORDS.close} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </span>
      </div>
      <div className="mm-ro__b">
        <span className="mm-ro__fig">{r.figures}</span>
        {r.mark ? (
          <span className="mm-ro__mark">
            {col.mark ? (
              <QualityMark quality={col.mark === "max" ? 3 : 1} size={20} className={col.mark === "max" ? "mm-star" : "mm-kaizen"} />
            ) : null}
            {r.mark}
          </span>
        ) : null}
      </div>
      <p className="mm-ro__c">{r.settings}</p>
      {r.event ? (
        <p className="mm-ro__event">
          {eventGlyph}
          <span>{r.event.text}</span>
        </p>
      ) : null}
    </div>
  );
}
