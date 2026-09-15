/**
 * THE ASSESSMENT HISTORY LOG (Assessment round, Sep 2026).
 *
 * The audit's critical flaw was that updating an area erased what it was
 * before. This is the fix made visible: every change, newest first, with the
 * area and its pillar, was → now, when, who, and the one line of context a
 * coach attached at the time. It sits on the same screen as the areas it
 * describes, collapsed to the newest six.
 *
 * Rows still in the open draft can take a note inline (a 40px field, no
 * dialog); rows from saved assessments are read-only. Rows worked out by
 * comparing two saved assessments only know the day, and say so.
 *
 * Presentation only — rows come from `buildHistoryLog`.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, Equal, History, MessageSquarePlus, Minus, Plus } from "lucide-react";
import {
  CHANGE_NOTE_MAX,
  HISTORY_COLLAPSED_ROWS,
  formatMeasure,
  isImprovement,
  type AssessmentLogRow,
} from "./assessment-history";
import { pillarOf, sectionScale, sectionTitle } from "./pillars";
import { fmtDate } from "./ui";
import { LoadingMark } from "../../components/LoadingMark";
import { formatStudioDateTime } from "../../lib/studio-time";
import type { HistoryStatus } from "./useCheckInDraft";

export interface AssessmentHistoryLogProps {
  rows: readonly AssessmentLogRow[];
  status: HistoryStatus;
  /** False when the read stopped before the client's first report. */
  complete: boolean;
  /** Sets the note on a row still in the draft. */
  onNote?: (row: AssessmentLogRow, note: string) => void;
}

export function DeltaChip({ row }: { row: Pick<AssessmentLogRow, "sectionId" | "from" | "to" | "kind"> }) {
  const good = isImprovement(row.sectionId, row.from, row.to);
  const tone = good === null ? "neutral" : good ? "good" : "bad";
  const diff = row.from !== null && row.to !== null ? row.to - row.from : null;
  let icon = <Equal className="h-3.5 w-3.5" aria-hidden="true" />;
  let text = "Same";
  let label = "no change";
  if (row.kind === "up") {
    icon = <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />;
    text = `+${diff}`;
    label = `up ${diff}`;
  } else if (row.kind === "down") {
    icon = <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />;
    text = `−${Math.abs(diff ?? 0)}`;
    label = `down ${Math.abs(diff ?? 0)}`;
  } else if (row.kind === "new") {
    icon = <Plus className="h-3.5 w-3.5" aria-hidden="true" />;
    text = "New";
    label = "first score";
  } else if (row.kind === "updated") {
    icon = <Plus className="h-3.5 w-3.5" aria-hidden="true" />;
    text = "Updated";
    label = "updated; the score before is unknown";
  } else if (row.kind === "cleared") {
    icon = <Minus className="h-3.5 w-3.5" aria-hidden="true" />;
    text = "Cleared";
    label = "score cleared";
  }
  return (
    <span className={`sra-chip sra-chip--${tone}`} aria-label={label} title={label}>
      {icon}
      <span>{text}</span>
    </span>
  );
}

function whenText(row: AssessmentLogRow): string {
  return row.hasTime ? formatStudioDateTime(row.at) : fmtDate(row.at);
}

const SOURCE_LABEL: Record<AssessmentLogRow["source"], string> = {
  draft: "In the open assessment",
  logged: "Saved assessment",
  derived: "Compared with the assessment before",
};

function NoteField({ row, onNote }: { row: AssessmentLogRow; onNote: (row: AssessmentLogRow, note: string) => void }) {
  const [open, setOpen] = useState(false);
  // Local text so a trailing space survives while typing; the hook trims.
  const [text, setText] = useState(row.note ?? "");
  if (!open && !row.note) {
    return (
      <button type="button" className="sra-note-add" onClick={() => setOpen(true)}>
        <MessageSquarePlus className="h-4 w-4" aria-hidden="true" /> Add why it changed
      </button>
    );
  }
  return (
    <input
      className="sra-note-input"
      value={open ? text : (row.note ?? "")}
      maxLength={CHANGE_NOTE_MAX}
      placeholder="Why it changed — e.g. bought a new mattress"
      aria-label={`Why ${sectionTitle(row.sectionId)} changed`}
      onFocus={() => {
        if (!open) {
          setText(row.note ?? "");
          setOpen(true);
        }
      }}
      onChange={(e) => {
        setText(e.target.value);
        onNote(row, e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      autoFocus={open && !row.note}
    />
  );
}

export function AssessmentHistoryLog({ rows, status, complete, onNote }: AssessmentHistoryLogProps) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, HISTORY_COLLAPSED_ROWS);
  const hidden = rows.length - visible.length;

  return (
    <section className="sra-log" aria-label="Assessment history">
      <header className="sra-log__head">
        <History className="h-4 w-4 shrink-0" aria-hidden="true" />
        <h4 className="sra-log__title">Assessment history</h4>
        {rows.length > 0 && (
          <span className="sra-log__count">
            {rows.length} change{rows.length === 1 ? "" : "s"}
          </span>
        )}
      </header>
      <p className="sra-log__sub">Every change is kept. Nothing is overwritten.</p>

      {status === "error" && (
        <p className="sra-log__state" role="status">
          The saved history couldn't be loaded, so only changes in the open assessment are listed.
        </p>
      )}
      {status === "loading" && rows.length === 0 ? (
        <LoadingMark size="sm" label="Loading history…" />
      ) : rows.length === 0 ? (
        status === "ready" && (
          <p className="sra-log__state">No changes yet. The first score entered starts the history.</p>
        )
      ) : (
        <ol className="sra-log__list">
          {visible.map((row) => {
            const scale = sectionScale(row.sectionId);
            const pillar = pillarOf(row.sectionId);
            return (
              <li key={row.key} className={`sra-row sra-row--${row.source}`}>
                <DeltaChip row={row} />
                <div className="sra-row__body">
                  <p className="sra-row__title">
                    <b>{sectionTitle(row.sectionId)}</b>
                    {pillar && <span className="sra-row__pillar">{pillar.title}</span>}
                  </p>
                  <p className="sra-row__change">
                    {formatMeasure(row.from)} → {formatMeasure(row.to)}{" "}
                    <span className="sra-row__unit">{scale.unit}</span>
                  </p>
                  {row.source === "draft" && onNote ? (
                    <NoteField row={row} onNote={onNote} />
                  ) : (
                    row.note && <p className="sra-row__note">“{row.note}”</p>
                  )}
                  <p className="sra-row__meta">
                    {[whenText(row), row.byName, SOURCE_LABEL[row.source]].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {rows.length > HISTORY_COLLAPSED_ROWS && (
        <button type="button" className="sra-log__more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show the newest 6" : `Show all ${rows.length} (${hidden} more)`}
        </button>
      )}
      {status === "ready" && !complete && (
        <p className="sra-log__foot">Showing what the newest saved reports cover; older changes are not listed.</p>
      )}
    </section>
  );
}
