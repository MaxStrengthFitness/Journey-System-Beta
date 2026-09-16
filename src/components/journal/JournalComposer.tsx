/**
 * The note box — the one composer for every note written about a client.
 *
 * CATEGORY FIRST (notes catalog round, Sep 2026). The owner's audit said the
 * old box was cumbersome: type, then pick a kind, then "More options" to find
 * the rest. Now the order is the order a coach thinks in, and it is the SAME
 * vertical order as every other capture surface in the app (reporting round,
 * "Consistency"):
 *
 *   1. WHAT KIND — six chips, 44px: Coaching tip, Equipment, Incident,
 *      Injury, Preference, FORD / Life. Admin is never offered: it is the
 *      Mindbody and intake imports, read-only.
 *   2. THE NOTE.
 *   3. ONLY WHAT THAT KIND NEEDS — which P for a coaching tip, the machine for
 *      equipment, when it happened for an incident or injury.
 *   4. HOW LOUD — the shared Loudness control (Note · Heads up · Critical),
 *      always there, always optional. A category pre-sets it (an incident
 *      starts Critical, an injury Heads up) until the trainer touches it.
 *   5. MATTERS UNTIL — offered for any Heads up or Critical note, of any
 *      category: after that day it stops showing on the briefing.
 *   6. SAVE.
 *
 * CAPTURE NOW, TAG AT TEARDOWN (reporting round). No category is required.
 * The chips start with nothing chosen — in the Active Session sheet and on
 * the record alike, so a note feels the same wherever it is written — and
 * the button reads "Save — file later" until one is picked. An untagged save
 * writes `kind: "general"` and comes back as a card in the To-file tray
 * (`features/notes/NoteSweep`), where one tap files it. On the record the
 * trainer has time, so a quiet line says so.
 *
 * FORD / Life never writes a journal entry: `journalEntries` is readable by
 * every signed-in user, and a client's home life is not company-wide reading.
 * Choosing it hands off to the FORD capture — inline when the host passes
 * `ford`, or to the host's own FORD mode through `onPickFord` (the Active
 * Session sheet's "Remember this"). Whatever was typed in the note box is
 * kept if the coach switches back.
 */
import { useState } from "react";
import { Heart } from "lucide-react";
import {
  FOCUS_BLURBS,
  FOCUS_CATEGORIES,
  type FocusCategory,
  type JournalDraft,
  type JournalImportance,
  type JournalOrigin,
} from "../../types/journal";
import type { Machine } from "../../types";
import {
  NOTE_CATEGORY_META,
  type FilingCategory,
  type NoteCategory,
} from "../../features/notes/note-catalog";
import { NoteCategoryChips } from "../../features/notes/NoteCategoryChips";
import { Loudness } from "../../features/rating";
import { FordQuickCapture } from "../../features/ford/FordQuickCapture";
import type { FordAuthor } from "../../features/ford/ford-write";
import type { FordOrigin } from "../../features/ford/types";
import "../../features/notes/notes.css";

const PLACEHOLDERS: Record<FilingCategory, string> = {
  coaching: "e.g. “Stop dumping the last two reps — cue ‘own the bottom’ at rep 8.”",
  equipment: "e.g. “Needs extra padding on the chest pad for compound row.”",
  incident: "e.g. “Reported sharp left knee pain on leg press. Stopped the set.”",
  injury: "e.g. “Rotator cuff surgery on the 14th. No pressing until cleared.”",
  preference: "e.g. “Likes the fan on and no music during the set.”",
};

const UNTAGGED_PLACEHOLDER = "Write it down now — you can file it later.";

/** How loud a new note starts, per kind. A coach can always change it. */
export const DEFAULT_IMPORTANCE: Record<FilingCategory, JournalImportance> = {
  coaching: "standard",
  equipment: "standard",
  incident: "critical",
  injury: "elevated",
  preference: "standard",
};

export interface JournalComposerProps {
  clientFirstName: string;
  machines: Machine[];
  onSubmit: (draft: JournalDraft) => Promise<void>;
  disabled?: boolean;
  /** Pre-select a machine (the one being performed in an Active Session). */
  defaultMachineId?: string;
  /** Provenance stamped on the entry. The Notes area leaves it "manual". */
  origin?: JournalOrigin;
  /** FORD / Life hands off to an inline FORD capture with these details. */
  ford?: {
    clientId: string;
    studioId: string;
    author: FordAuthor;
    sessionId?: string | null;
    origin?: FordOrigin;
  } | null;
  /** …or, instead, the host switches to its own FORD mode. Wins over `ford`. */
  onPickFord?: () => void;
  /** Offered beside the inline FORD capture: jump to the Life section. */
  onOpenFord?: () => void;
}

const isFiling = (c: NoteCategory | null): c is FilingCategory =>
  c !== null && c !== "ford" && c !== "admin";

export function JournalComposer({
  clientFirstName,
  machines,
  onSubmit,
  disabled = false,
  defaultMachineId,
  origin = "manual",
  ford = null,
  onPickFord,
  onOpenFord,
}: JournalComposerProps) {
  // Nothing pre-selected: the same rule everywhere a note is written.
  const [category, setCategory] = useState<NoteCategory | null>(null);
  const [p, setP] = useState<FocusCategory | null>(null);
  const [body, setBody] = useState("");
  const [importance, setImportance] = useState<JournalImportance>("standard");
  const [importanceTouched, setImportanceTouched] = useState(false);
  const [machineId, setMachineId] = useState<string>(defaultMachineId ?? "");
  const [aboutMachine, setAboutMachine] = useState(true);
  const [occurredOn, setOccurredOn] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const name = clientFirstName || "this client";
  const filing = isFiling(category);
  const defaultMachine = defaultMachineId
    ? machines.find((m) => m.id === defaultMachineId) ?? null
    : null;
  const aboutMachineKinds = category === "coaching" || category === "incident" || category === "injury";
  const dated = category === "incident" || category === "injury";
  // Preference needs nothing extra; an untagged note in a session keeps its machine.
  const hasExtras = category === "equipment" || aboutMachineKinds || (category === null && !!defaultMachine);

  const pick = (next: NoteCategory) => {
    if (next === "ford" && onPickFord) {
      onPickFord();
      return;
    }
    // A second tap on the chosen chip un-picks it: back to "file later".
    const chosen = next === category ? null : next;
    setCategory(chosen);
    if (!importanceTouched) {
      setImportance(isFiling(chosen) ? DEFAULT_IMPORTANCE[chosen] : "standard");
    }
  };

  // Back to nothing chosen — the next note starts the same way the first did.
  const reset = () => {
    setBody("");
    setCategory(null);
    setP(null);
    setImportanceTouched(false);
    setImportance("standard");
    setMachineId(defaultMachineId ?? "");
    setAboutMachine(true);
    setOccurredOn("");
    setEffectiveUntil("");
  };

  /** Which machine the note is about, if any, for the chosen kind. */
  const chosenMachine = (): string | null => {
    if (category === "equipment") return machineId || null;
    if (aboutMachineKinds || category === null) {
      // In a session the machine being performed is offered as a toggle; on
      // the profile any machine can be picked (optional). An untagged note
      // in a session keeps the machine too — it is the one fact the trainer
      // would otherwise have to remember at teardown.
      if (defaultMachine) return aboutMachine ? defaultMachine.id ?? null : null;
      return category === null ? null : machineId || null;
    }
    return null;
  };

  const submit = async () => {
    if (category === "ford" || category === "admin") return;
    if (!body.trim() || isSaving || disabled) return;
    const kind = filing ? NOTE_CATEGORY_META[category].kind : "general";
    if (!kind) return;
    setIsSaving(true);
    try {
      await onSubmit({
        kind,
        category: category === "coaching" ? p : null,
        body: body.trim(),
        importance,
        machineId: chosenMachine(),
        focusId: null,
        origin,
        // Date inputs give yyyy-mm-dd; read at local noon / end of day, never
        // as UTC midnight (which is the previous day in Ohio).
        occurredAt: dated && occurredOn ? new Date(`${occurredOn}T12:00:00`) : null,
        effectiveUntil:
          importance !== "standard" && effectiveUntil ? new Date(`${effectiveUntil}T23:59:59`) : null,
      });
      reset();
    } finally {
      setIsSaving(false);
    }
  };

  const saveLabel = isSaving
    ? "Saving"
    : filing
      ? `Save ${NOTE_CATEGORY_META[category].label.toLowerCase()}`
      : "Save — file later";

  return (
    <section className="nc-composer" data-testid="note-composer">
      {/* 1 · what kind */}
      <div className="flex flex-col gap-1.5">
        <span className="nc-kicker">What kind of note?</span>
        <NoteCategoryChips value={category} onChange={pick} />
        <p className="nc-muted text-[12px]">
          {category
            ? NOTE_CATEGORY_META[category].blurb
            : origin === "in_session"
              ? "Optional — untagged notes come back to be filed at the end."
              : "Pick a category, or save and file it later."}
        </p>
      </div>

      {category === "ford" ? (
        ford ? (
          <div className="flex flex-col gap-2">
            <FordQuickCapture
              clientId={ford.clientId}
              clientFirstName={clientFirstName || "them"}
              studioId={ford.studioId}
              author={ford.author}
              sessionId={ford.sessionId ?? null}
              origin={ford.origin ?? "profile"}
            />
            {body.trim() ? (
              <p className="nc-muted text-[11.5px]">
                Your unsaved note is kept — pick its category again to finish it.
              </p>
            ) : null}
            {onOpenFord ? (
              <button type="button" className="nc-btn self-start" onClick={onOpenFord}>
                <Heart className="h-3.5 w-3.5" aria-hidden /> See everything in Life
              </button>
            ) : null}
          </div>
        ) : (
          <div className="nc-handoff flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12.5px]">
              Personal details are kept in Life (FORD), where only this studio can read them.
            </span>
            {onOpenFord ? (
              <button type="button" className="nc-btn" onClick={onOpenFord}>
                <Heart className="h-3.5 w-3.5" aria-hidden /> Open Life
              </button>
            ) : null}
          </div>
        )
      ) : (
        <>
          {/* 2 · the words */}
          <textarea
            className="nc-input"
            rows={3}
            value={body}
            aria-label={`${filing ? NOTE_CATEGORY_META[category].label : "Untagged"} note about ${name}`}
            placeholder={filing ? PLACEHOLDERS[category] : UNTAGGED_PLACEHOLDER}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />

          {/* 3 · only what that kind needs */}
          {hasExtras && (
          <div className="nc-extras">
            {category === "coaching" && (
              <div className="flex flex-col gap-1.5">
                <span className="nc-kicker">Which P (optional)</span>
                <div className="nc-chips" role="group" aria-label="Which P">
                  {FOCUS_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="nc-chip nc-chip--small"
                      aria-pressed={p === c}
                      onClick={() => setP(p === c ? null : c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {p ? <p className="nc-muted text-[11.5px]">{FOCUS_BLURBS[p]}</p> : null}
              </div>
            )}

            {(category === "equipment" || (aboutMachineKinds && !defaultMachine)) && (
              <label className="flex flex-col gap-1.5">
                <span className="nc-kicker">{category === "equipment" ? "Machine" : "Machine (optional)"}</span>
                <select
                  className="nc-input"
                  value={machineId}
                  onChange={(e) => setMachineId(e.target.value)}
                >
                  <option value="">No specific machine</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {(aboutMachineKinds || category === null) && defaultMachine && (
              <div className="flex flex-col gap-1.5">
                <span className="nc-kicker">Machine</span>
                <button
                  type="button"
                  className="nc-chip nc-chip--small self-start"
                  aria-pressed={aboutMachine}
                  onClick={() => setAboutMachine((v) => !v)}
                >
                  About {defaultMachine.name}
                </button>
              </div>
            )}

            {dated && (
              <label className="flex flex-col gap-1.5">
                <span className="nc-kicker">Happened on</span>
                <input
                  type="date"
                  className="nc-input"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                />
                <span className="nc-muted text-[11px]">Leave blank for today.</span>
              </label>
            )}
          </div>
          )}

          {/* 4 · how loud, 5 · matters until */}
          <div className="nc-composer__loud">
            <Loudness
              ask="How loud? (optional)"
              value={importance}
              compact={origin === "in_session"}
              onChange={(lvl) => {
                setImportance(lvl);
                setImportanceTouched(true);
              }}
            />

            {importance !== "standard" && (
              <label className="flex flex-col gap-1.5">
                <span className="nc-kicker">Matters until (optional)</span>
                <input
                  type="date"
                  className="nc-input"
                  value={effectiveUntil}
                  aria-label="Matters until"
                  onChange={(e) => setEffectiveUntil(e.target.value)}
                />
                <span className="nc-muted text-[11px]">After this it stops showing on the briefing.</span>
              </label>
            )}
          </div>

          {/* 6 · save — always last */}
          <div className="nc-composer__save">
            {body.trim() && (
              <button type="button" className="nc-btn nc-btn--quiet" onClick={reset}>
                Clear
              </button>
            )}
            <button
              type="button"
              className="nc-btn nc-btn--primary"
              onClick={() => void submit()}
              disabled={!body.trim() || isSaving || disabled}
            >
              {saveLabel}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
