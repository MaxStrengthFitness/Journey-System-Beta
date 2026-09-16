/**
 * UPDATE PULSE — one area, one Dial, back to the session.
 *
 * Reporting round, Sep 2026. The Pulse (the living assessment — the record of
 * how the client's life is going, filled a little at a time) is reachable
 * from the briefing, the note sheet and the post-session screen. On those
 * screens a trainer has seconds, not minutes, so this is the whole flow:
 *
 *   1. Pick an area — the eight topics, as tiles, each saying when it was
 *      last touched ("3 weeks ago", "never asked"). Sentences, not scores.
 *   2. Tap a Dial — the area's three statements on the frequency words, and
 *      one note in the client's words. Answering ONE statement is enough:
 *      the living rule carries the others forward from last time.
 *   3. Done — nothing to save. The draft autosaves through the same hook the
 *      full Pulse uses (`useCheckInDraft`), so this IS the record, and the
 *      change log records who and when exactly as it does there.
 *
 * "Open full Pulse" is the escape hatch for protein, hydration, the pain map
 * and stress anchors, which are lists, not dials.
 *
 * This is the CONTENT: no portal, no overlay. The Active Session note sheet
 * mounts it as its third mode; the briefing and post-session screens wrap
 * it in `PulseQuickLogDialog` below. Same words, same bar, same order in
 * both: what (the area) → the words (statements) → how much (the Dial).
 */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, HeartPulse, X } from "lucide-react";
import type { Client, Machine, Trainer } from "../../types";
import { Dial, FREQUENCY_SCALE, absoluteToTen, tenToAbsolute } from "../rating";
import { SUBJECTIVE_CATEGORIES } from "./questions";
import type { SubjectiveCategoryDef, SubjectiveCategoryKey } from "./types";
import { useCheckInDraft } from "./useCheckInDraft";
import { freshnessOf, sectionTouches, type Freshness } from "./assessment-history";
import { ASSESSMENT_PILLARS } from "./pillars";
import { LoadingArea } from "../../components/LoadingMark";
import { clientFirstName } from "../../lib/client-name";
import "./subjective-report.css";

export interface PulseQuickLogProps {
  client: Client;
  trainer: Trainer | null;
  machines: Machine[];
  /** Offered on the picker: jump to the whole Pulse in the profile. */
  onOpenFull?: () => void;
  /** Called after "Done" on an area (the sheet may want to switch back). */
  onDone?: () => void;
  compact?: boolean;
}

/** "3 weeks ago", "yesterday", "never asked" — never a number of days over 60. */
export function touchedSentence(f: Freshness, touchedMs: number | undefined, nowMs: number): string {
  if (f === "never") return "Never asked";
  if (f === "unknown" && touchedMs === undefined) return "History not loaded";
  if (touchedMs === undefined) return "Over 90 days ago";
  const days = Math.floor((nowMs - touchedMs) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return "Over a year ago";
}

export function PulseQuickLog({ client, trainer, machines, onOpenFull, onDone, compact = false }: PulseQuickLogProps) {
  const draft = useCheckInDraft({ client, trainer, machines, enabled: true });
  const [areaKey, setAreaKey] = useState<SubjectiveCategoryKey | null>(null);
  const nowMs = useMemo(() => Date.now(), []);

  const touches = useMemo(
    () =>
      sectionTouches({
        history: draft.history,
        draftChangeLog: draft.assessment.changeLog,
        draftDoneIds: draft.sections.filter((s) => s.isDone).map((s) => s.id),
        draftSavedAtMs: draft.savedAt,
      }),
    [draft.history, draft.assessment.changeLog, draft.sections, draft.savedAt],
  );

  const area: SubjectiveCategoryDef | null = areaKey ? (SUBJECTIVE_CATEGORIES.find((c) => c.key === areaKey) ?? null) : null;
  const first = clientFirstName(client);

  if (draft.loading) {
    return <LoadingArea label={`Opening ${first}'s Pulse…`} />;
  }

  if (!area) {
    return (
      <div className={`pq ${compact ? "pq--compact" : ""}`} data-testid="pulse-quick-log">
        <p className="pq__lead">
          Pick what you talked about. One answer is enough — the rest carries forward from last time.
        </p>
        {ASSESSMENT_PILLARS.map((pillar) => {
          const cats = pillar.sectionIds
            .map((id) => SUBJECTIVE_CATEGORIES.find((c) => c.key === id))
            .filter((c): c is SubjectiveCategoryDef => !!c);
          if (!cats.length) return null;
          return (
            <section key={pillar.id} className="pq__pillar">
              <h3 className="pq__pillar-title">{pillar.title}</h3>
              <div className="pq__tiles">
                {cats.map((c) => {
                  const f = freshnessOf(c.key, touches, draft.history, nowMs);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      className="pq__tile"
                      data-fresh={f}
                      onClick={() => setAreaKey(c.key)}
                    >
                      <span className="pq__tile-title">{c.title}</span>
                      <span className="pq__tile-when">{touchedSentence(f, touches.get(c.key), nowMs)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {onOpenFull ? (
          <button type="button" className="pq__full" onClick={onOpenFull}>
            <HeartPulse className="h-4 w-4" aria-hidden />
            Open {first}&rsquo;s full Pulse
            <span className="pq__full-sub">protein · hydration · pain map · stress</span>
          </button>
        ) : null}
      </div>
    );
  }

  const setAnswer = (id: string, ten: number | null) =>
    draft.update({
      ...draft.assessment,
      answers: { ...draft.assessment.answers, [id]: { ...(draft.assessment.answers[id] ?? {}), value: ten } },
    });

  return (
    <div className={`pq ${compact ? "pq--compact" : ""}`} data-testid="pulse-quick-log-area">
      <div className="pq__area-head">
        <button type="button" className="pq__back" onClick={() => setAreaKey(null)} aria-label="Back to the areas">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="min-w-0">
          <h3 className="pq__area-title">{area.title}</h3>
          <p className="pq__area-prompt">{area.coachPrompt}</p>
        </div>
        <span className="pq__save" data-state={draft.saveState} aria-live="polite">
          {draft.saveState === "saving" ? "Saving…" : draft.saveState === "saved" ? "Saved" : draft.saveState === "error" ? "Not saved" : ""}
        </span>
      </div>

      <div className="pq__statements">
        {area.statements.map((st) => (
          <div key={st.id} className="pq__statement">
            <Dial
              scale={FREQUENCY_SCALE}
              ask={st.text}
              value={tenToAbsolute(draft.assessment.answers[st.id]?.value ?? null)}
              onChange={(v) => setAnswer(st.id, v === null ? null : absoluteToTen(v))}
              compact={compact}
            />
          </div>
        ))}
      </div>

      <label className="pq__note">
        <span className="pq__note-label">In {first}&rsquo;s words (optional)</span>
        <textarea
          className="sr-textarea"
          style={{ minHeight: 44 }}
          placeholder="Anything worth remembering next time…"
          value={draft.assessment.categoryNotes[area.key] ?? ""}
          onChange={(e) =>
            draft.update({
              ...draft.assessment,
              categoryNotes: { ...draft.assessment.categoryNotes, [area.key]: e.target.value },
            })
          }
        />
      </label>

      <button
        type="button"
        className="pq__done"
        onClick={() => {
          void draft.saveNow();
          setAreaKey(null);
          onDone?.();
        }}
      >
        <Check className="h-4 w-4" aria-hidden /> Done
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The dialog — for the briefing and the post-session screen
 * ------------------------------------------------------------------ */

export interface PulseQuickLogDialogProps extends Omit<PulseQuickLogProps, "onDone" | "compact"> {
  open: boolean;
  onClose: () => void;
}

export function PulseQuickLogDialog({ open, onClose, client, trainer, machines, onOpenFull }: PulseQuickLogDialogProps) {
  if (!open) return null;
  return createPortal(
    <div className="pq-dialog" role="dialog" aria-modal="true" aria-label="Update Pulse">
      <div className="pq-dialog__scrim" onClick={onClose} />
      <div className="pq-dialog__panel">
        <div className="pq-dialog__head">
          <span className="pq-dialog__mark">
            <HeartPulse className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="pq-dialog__title">Update Pulse</h2>
            <p className="pq-dialog__sub">{clientFirstName(client)} · saves as you tap</p>
          </div>
          <button type="button" className="pq-dialog__close" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="pq-dialog__body">
          {/* Keyed on the client so a different client never sees another's draft. */}
          <PulseQuickLog key={client.id} client={client} trainer={trainer} machines={machines} onOpenFull={onOpenFull} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
