/**
 * The note box — the one composer for every note written about a client.
 *
 * CATEGORY FIRST (notes catalog round, Sep 2026). The owner's audit said the
 * old box was cumbersome: type, then pick a kind, then "More options" to find
 * the rest. Now the order is the order a coach thinks in:
 *
 *   1. WHAT KIND — six chips, 44px: Coaching tip, Equipment, Incident,
 *      Injury, Preference, FORD / Life. Admin is never offered: it is the
 *      Mindbody and intake imports, read-only.
 *   2. THE NOTE.
 *   3. ONLY WHAT THAT KIND NEEDS — which P for a coaching tip, the machine for
 *      equipment, when it happened for an incident or injury, until when an
 *      injury matters. How loud is always there and always optional.
 *
 * FORD / Life never writes a journal entry: `journalEntries` is readable by
 * every signed-in user, and a client's home life is not company-wide reading.
 * Choosing it hands off to the FORD capture — inline when the host passes
 * `ford`, or to the host's own FORD mode through `onPickFord` (the Active
 * Session sheet's "Remember this"). Whatever was typed in the note box is
 * kept if the coach switches back.
 *
 * The same component, chips and labels are used in the Notes area and the
 * Active Session sheet, so a note feels the same wherever it is written.
 */
import { useState } from "react";
import { Heart } from "lucide-react";
import {
  FOCUS_BLURBS,
  FOCUS_CATEGORIES,
  IMPORTANCE_META,
  type FocusCategory,
  type JournalDraft,
  type JournalImportance,
  type JournalOrigin,
} from "../../types/journal";
import type { Machine } from "../../types";
import {
  NOTE_CATEGORY_META,
  type NoteCategory,
} from "../../features/notes/note-catalog";
import { NoteCategoryChips } from "../../features/notes/NoteCategoryChips";
import { FordQuickCapture } from "../../features/ford/FordQuickCapture";
import type { FordAuthor } from "../../features/ford/ford-write";
import type { FordOrigin } from "../../features/ford/types";
import "../../features/notes/notes.css";

type WritableCategory = Exclude<NoteCategory, "ford" | "admin">;

const PLACEHOLDERS: Record<WritableCategory, string> = {
  coaching: "e.g. “Stop dumping the last two reps — cue ‘own the bottom’ at rep 8.”",
  equipment: "e.g. “Needs extra padding on the chest pad for compound row.”",
  incident: "e.g. “Reported sharp left knee pain on leg press. Stopped the set.”",
  injury: "e.g. “Rotator cuff surgery on the 14th. No pressing until cleared.”",
  preference: "e.g. “Likes the fan on and no music during the set.”",
};

/** How loud a new note starts, per kind. A coach can always change it. */
const DEFAULT_IMPORTANCE: Record<WritableCategory, JournalImportance> = {
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
  const [category, setCategory] = useState<NoteCategory>("coaching");
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
  const writable = category !== "ford" && category !== "admin";
  const kind = NOTE_CATEGORY_META[category].kind;
  const defaultMachine = defaultMachineId
    ? machines.find((m) => m.id === defaultMachineId) ?? null
    : null;

  const pick = (next: NoteCategory) => {
    if (next === "ford" && onPickFord) {
      onPickFord();
      return;
    }
    setCategory(next);
    if (next !== "ford" && next !== "admin" && !importanceTouched) {
      setImportance(DEFAULT_IMPORTANCE[next]);
    }
  };

  const reset = () => {
    setBody("");
    setP(null);
    setImportanceTouched(false);
    setImportance(writable ? DEFAULT_IMPORTANCE[category as WritableCategory] : "standard");
    setMachineId(defaultMachineId ?? "");
    setAboutMachine(true);
    setOccurredOn("");
    setEffectiveUntil("");
  };

  /** Which machine the note is about, if any, for the chosen kind. */
  const chosenMachine = (): string | null => {
    if (category === "equipment") return machineId || null;
    if (category === "coaching" || category === "incident" || category === "injury") {
      // In a session the machine being performed is offered as a toggle; on
      // the profile any machine can be picked (optional).
      if (defaultMachine) return aboutMachine ? defaultMachine.id ?? null : null;
      return machineId || null;
    }
    return null;
  };

  const submit = async () => {
    if (!writable || !kind || !body.trim() || isSaving || disabled) return;
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
        occurredAt:
          (category === "incident" || category === "injury") && occurredOn
            ? new Date(`${occurredOn}T12:00:00`)
            : null,
        effectiveUntil:
          category === "injury" && effectiveUntil ? new Date(`${effectiveUntil}T23:59:59`) : null,
      });
      reset();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="nc-composer" data-testid="note-composer">
      <div className="flex flex-col gap-1.5">
        <span className="nc-kicker">What kind of note?</span>
        <NoteCategoryChips value={category} onChange={pick} />
        <p className="nc-muted text-[12px]">{NOTE_CATEGORY_META[category].blurb}</p>
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
          <textarea
            className="nc-input"
            rows={3}
            value={body}
            aria-label={`${NOTE_CATEGORY_META[category].label} note about ${name}`}
            placeholder={PLACEHOLDERS[category as WritableCategory]}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />

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

            {(category === "equipment" ||
              ((category === "coaching" || category === "incident" || category === "injury") &&
                !defaultMachine)) && (
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

            {(category === "coaching" || category === "incident" || category === "injury") &&
              defaultMachine && (
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

            {(category === "incident" || category === "injury") && (
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

            {category === "injury" && (
              <label className="flex flex-col gap-1.5">
                <span className="nc-kicker">Matters until (optional)</span>
                <input
                  type="date"
                  className="nc-input"
                  value={effectiveUntil}
                  onChange={(e) => setEffectiveUntil(e.target.value)}
                />
                <span className="nc-muted text-[11px]">After this it stops showing in the briefing.</span>
              </label>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="nc-kicker">How loud (optional)</span>
              <div className="nc-seg" role="group" aria-label="How loud">
                {(["standard", "elevated", "critical"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    className="nc-chip nc-chip--small"
                    aria-pressed={importance === lvl}
                    onClick={() => {
                      setImportance(lvl);
                      setImportanceTouched(true);
                    }}
                  >
                    {IMPORTANCE_META[lvl].short}
                  </button>
                ))}
              </div>
              <span className="nc-muted text-[11px]">{IMPORTANCE_META[importance].hint}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
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
              {isSaving ? "Saving" : `Save ${NOTE_CATEGORY_META[category].label.toLowerCase()}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
