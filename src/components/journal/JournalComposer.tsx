/**
 * The note box — the one composer for every note written about a client.
 *
 * CATEGORY FIRST (notes catalog round, Sep 2026; sharpened by the notes round,
 * Oct 3 2026). AJ's hand-off: "Category is... one of the more important parts
 * because we need to know how to correctly file this into their note section
 * on their profile, so that way we know how to act on it later", and capture
 * "can't depend on a Wrap-up pass because the time won't reliably be there".
 * So the order is the order a coach thinks in, and it is the SAME vertical
 * order as every other capture surface in the app:
 *
 *   1. WHAT KIND — six chips, 44px: Coaching & equipment, Health, Incident,
 *      Retention, FORD / Life, Preference. Admin is never offered: it is the
 *      Mindbody and intake imports, read-only.
 *   2. THE NOTE.
 *   3. ONLY WHAT THAT KIND NEEDS, all optional — the second tap (a 4 P or
 *      Set-up under Coaching & equipment; Injury · Surgery · Medication ·
 *      Diagnosis · Care outside the studio under Health), where on the body
 *      (Health and Incident, AJ's fixed head-to-toe map), the machine (the
 *      one being performed, in a session), and when (Health and Incident).
 *   4. HOW LOUD — the shared Loudness control (Note · Heads up · Critical),
 *      always there, always optional. A category pre-sets it (Health,
 *      Incident and Retention start at Heads up) until the trainer touches it.
 *   5. WHEN DOES THIS MATTER — the mattering picker (features/client-notes/
 *      MatteringPicker), offered for any Heads up or Critical note, of any
 *      category, and for a plain note dated to one day (a birthday). Always
 *      · From – until · Only on a day; see mattering.ts for the rules.
 *   6. SAVE.
 *
 * NEVER BLOCK A SAVE. The category is asked first, but a note with none
 * still saves: it is written as `kind: "general"` and comes back as a card in
 * the To-file tray (`features/client-notes/NoteSweep`), where one tap files
 * it. The tray is the net, not the plan. Nothing in step 3 is ever required.
 *
 * WHAT IS STORED is `storedNoteOf` (note-catalog.ts) — the one answer the
 * composer, the session's unsaved draft and the tray share, so a note is the
 * same note whichever way it was filed.
 *
 * FORD / Life never writes a journal entry: `journalEntries` is readable by
 * every signed-in user, and a client's home life is not company-wide reading.
 * Choosing it hands off to FORD — to the host's own FORD mode through
 * `onPickFord` (the Active Session sheet's "Remember this"), or, when the host
 * passes `ford`, IN PLACE (client codex, Sep 2026): the same box, the same
 * words, and the note becomes a FORD capture — the loudness, the window and
 * the extras step aside, the four letters appear (optional), and the button
 * says "Save to FORD", which writes only `clients/{id}/ford` through
 * `createFordEntry`. A second tap on the chip is a note again, words intact.
 * A FORD detail holds 2,000 characters (the rule), a note 5,000, so a longer
 * box says so instead of being refused. With neither, the chip says where
 * personal details are kept and offers the way there — and, for a reader who
 * may read FORD but not add to it (`fordReadOnly`), that adding isn't offered.
 *
 * A failed save never costs the words: the box is cleared only once the save
 * has landed, and a refused note or FORD capture stays where it was typed.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Heart } from "lucide-react";
import type { JournalDraft, JournalImportance, JournalOrigin, NoteBodyMark } from "../../types/journal";
import type { Machine } from "../../types";
import {
  NOTE_CATEGORY_META,
  asksBodyPart,
  flavourFor,
  flavoursOf,
  storedNoteOf,
  type FilingCategory,
  type NoteCategory,
  type NoteFlavour,
} from "../../features/client-notes/note-catalog";
import { NoteCategoryChips } from "../../features/client-notes/NoteCategoryChips";
import { BodyPartPicker } from "../../features/client-notes/BodyPartPicker";
import { Loudness } from "../../features/rating";
import { FORD_BODY_MAX, createFordEntry, type FordAuthor } from "../../features/ford/ford-write";
import { FORD_META, FORD_PILLARS, type FordOrigin, type FordPillar } from "../../features/ford/types";
import { EMPTY_SESSION_DRAFT, type SessionNoteDraft } from "../../features/client-notes/session-draft";
import { EMPTY_MATTERING, MatteringPicker } from "../../features/client-notes/MatteringPicker";
import { windowFromChoice, type MatteringChoice } from "../../features/client-notes/mattering";
import "../../features/client-notes/notes.css";

const PLACEHOLDERS: Record<FilingCategory, string> = {
  coaching: "e.g. “Stop dumping the last two reps — cue ‘own the bottom’ at rep 8.”",
  health: "e.g. “Rotator cuff surgery on the 14th. No pressing until cleared.”",
  incident: "e.g. “Sharp pain in the left knee on leg press. Stopped the set.”",
  retention: "e.g. “Not sure about renewing in May — work is busy. Asked about twice a week.”",
  preference: "e.g. “Likes the fan on and no music during the set.”",
};

const UNTAGGED_PLACEHOLDER = "Write it down now — you can file it later.";

/**
 * How loud a new note starts, per kind. A coach can always change it.
 * Health, Incident and Retention start at Heads up: the next trainers hear
 * it at her next four sessions, and the studio's leaders see it on
 * Operations → Today whatever its loudness. An incident used to start
 * Critical; the notes round (Oct 3 2026) brought it down to Heads up, since
 * Incident now runs from a lost phone to a fall and Critical stays until
 * someone acts on it — a fall is one tap up.
 */
export const DEFAULT_IMPORTANCE: Record<FilingCategory, JournalImportance> = {
  coaching: "standard",
  health: "elevated",
  incident: "elevated",
  retention: "elevated",
  preference: "standard",
};

/**
 * Whether "About {machine}" starts on, per category, in a session. A health
 * note is about her, not the machine she happens to be on ("on GLP-1s"
 * written at the Leg Press is not a Leg Press note), so it starts off; the
 * others start on, the machine being the one fact a trainer would otherwise
 * have to remember later.
 */
const ABOUT_MACHINE_BY_DEFAULT = (c: NoteCategory | null): boolean => c !== "health";

export interface JournalComposerProps {
  clientFirstName: string;
  machines: Machine[];
  onSubmit: (draft: JournalDraft) => Promise<void>;
  disabled?: boolean;
  /** Pre-select a machine (the one being performed in an Active Session). */
  defaultMachineId?: string;
  /** Provenance stamped on the entry. The Notes area leaves it "manual". */
  origin?: JournalOrigin;
  /** FORD / Life turns the note into a FORD capture in place, saved with these details. */
  ford?: {
    clientId: string;
    studioId: string;
    author: FordAuthor;
    sessionId?: string | null;
    origin?: FordOrigin;
  } | null;
  /** …or, instead, the host switches to its own FORD mode. Wins over `ford`. */
  onPickFord?: () => void;
  /** Offered in FORD mode and with the hand-off: go to where FORD is kept. */
  onOpenFord?: () => void;
  /**
   * This reader may READ FORD but its create rule refuses them (an
   * administrator who works at another studio — `codexAccess()`'s
   * fordReadable without fordWritable). The hand-off then says adding isn't
   * offered, not that FORD is out of reach: the Open FORD beside it works for
   * them (client codex, phase 19). Left false, the hand-off says what a
   * cross-train trainer needs to hear: only the home studio can read FORD.
   */
  fordReadOnly?: boolean;
  /** A FORD capture landed (FORD mode). The composer has already cleared itself. */
  onFordSaved?: () => void;
  /**
   * A draft the HOST owns (the Active Session, fluidity round Sep 2026).
   * The composer seeds itself from it once and reports every change back,
   * so closing the sheet, switching to Remember this, or a focus change no
   * longer throws the words away. Without it the composer keeps its own
   * state, as before. See features/client-notes/session-draft.ts.
   */
  draft?: SessionNoteDraft | null;
  onDraftChange?: (draft: SessionNoteDraft) => void;
}

const isFiling = (c: NoteCategory | null): c is FilingCategory =>
  c !== null && c !== "ford" && c !== "admin";

/** How long "Saved to FORD" stays up after a capture lands. */
const SAVED_FLASH_MS = 2200;

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
  fordReadOnly = false,
  onFordSaved,
  draft = null,
  onDraftChange,
}: JournalComposerProps) {
  // Nothing pre-selected: the same rule everywhere a note is written — unless
  // the host is handing back a draft the trainer already started.
  const seed = draft ?? EMPTY_SESSION_DRAFT;
  const [category, setCategory] = useState<NoteCategory | null>(draft ? seed.category : null);
  const [flavour, setFlavour] = useState<NoteFlavour | null>(draft ? flavourFor(seed.category, seed.flavour) : null);
  const [bodyParts, setBodyParts] = useState<NoteBodyMark[]>(draft ? seed.bodyParts ?? [] : []);
  const [body, setBody] = useState(draft ? seed.body : "");
  const [importance, setImportance] = useState<JournalImportance>(draft ? seed.importance : "standard");
  const [importanceTouched, setImportanceTouched] = useState(false);
  const [machineId, setMachineId] = useState<string>(
    draft?.machineId ?? defaultMachineId ?? "",
  );
  const [aboutMachine, setAboutMachine] = useState(draft ? seed.aboutMachine : true);
  const [aboutMachineTouched, setAboutMachineTouched] = useState(!!draft);

  /* Report the draft up. The first render is skipped: seeding from the
     host's own copy and immediately echoing it back would be a no-op write
     into sessionStorage on every mount. */
  const reportRef = useRef(onDraftChange);
  reportRef.current = onDraftChange;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    reportRef.current?.({
      body,
      category,
      flavour,
      bodyParts,
      importance,
      machineId: machineId || null,
      aboutMachine,
    });
  }, [body, category, flavour, bodyParts, importance, machineId, aboutMachine]);
  const [occurredOn, setOccurredOn] = useState("");
  const [matters, setMatters] = useState<MatteringChoice>(EMPTY_MATTERING);
  const [isSaving, setIsSaving] = useState(false);
  // What the last save said, until the words change: a refused save keeps
  // the box and says so; a FORD capture that landed says so for a moment.
  const [outcome, setOutcome] = useState<"idle" | "failed" | "saved-ford">("idle");
  // FORD mode's optional letter. Never pre-set: the sentence is the capture.
  const [pillar, setPillar] = useState<FordPillar | null>(null);
  const flashRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (flashRef.current !== null) window.clearTimeout(flashRef.current);
    },
    [],
  );

  const name = clientFirstName || "this client";
  const filing = isFiling(category);
  // FORD / Life, and the host takes it in place (no FORD mode of its own).
  const fordMode = category === "ford" && !!ford && !onPickFord;
  // FORD / Life with nowhere to save it here: say where it lives instead.
  const fordHandoff = category === "ford" && !fordMode;
  const defaultMachine = defaultMachineId
    ? machines.find((m) => m.id === defaultMachineId) ?? null
    : null;
  const flavours = flavoursOf(category);
  const setup = category === "coaching" && flavour === "Setup";
  // Every filing kind but Retention and Preference can be about a machine.
  const machineKinds = category === "coaching" || category === "incident" || category === "health";
  const dated = category === "incident" || category === "health";
  const askBody = asksBodyPart(category);
  // An untagged note in a session keeps its machine too.
  const hasExtras =
    flavours.length > 0 || askBody || machineKinds || dated || (category === null && !!defaultMachine);
  const fordLength = body.trim().length;
  const fordTooLong = fordMode && fordLength > FORD_BODY_MAX;

  const pick = (next: NoteCategory) => {
    if (next === "ford" && onPickFord) {
      onPickFord();
      return;
    }
    // A second tap on the chosen chip un-picks it: back to "file later".
    const chosen = next === category ? null : next;
    setCategory(chosen);
    // A flavour or a body part that doesn't belong to the new kind goes; one
    // that does (Incident ↔ Health keep their body parts) stays.
    setFlavour((f) => flavourFor(chosen, f));
    if (!asksBodyPart(chosen)) setBodyParts([]);
    setOutcome("idle");
    if (!importanceTouched) {
      setImportance(isFiling(chosen) ? DEFAULT_IMPORTANCE[chosen] : "standard");
    }
    if (!aboutMachineTouched) setAboutMachine(ABOUT_MACHINE_BY_DEFAULT(chosen));
  };

  // Back to nothing chosen — the next note starts the same way the first did.
  const reset = () => {
    setBody("");
    setCategory(null);
    setFlavour(null);
    setBodyParts([]);
    setImportanceTouched(false);
    setImportance("standard");
    setMachineId(defaultMachineId ?? "");
    setAboutMachine(true);
    setAboutMachineTouched(false);
    setOccurredOn("");
    setMatters(EMPTY_MATTERING);
    setPillar(null);
  };

  /** Which machine the note is about, if any, for the chosen kind. */
  const chosenMachine = (): string | null => {
    // Set-up is about a machine, and can name another one than the machine
    // being performed — the picker is offered even in a session.
    if (setup) return machineId || null;
    if (machineKinds || category === null) {
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
    const stored = storedNoteOf(category, flavour, bodyParts);
    setIsSaving(true);
    setOutcome("idle");
    try {
      await onSubmit({
        kind: stored.kind,
        category: stored.category,
        bodyParts: stored.bodyParts,
        body: body.trim(),
        importance,
        machineId: chosenMachine(),
        focusId: null,
        origin,
        // Date inputs give yyyy-mm-dd; read at local noon / end of day, never
        // as UTC midnight (which is the previous day in Ohio).
        occurredAt: dated && occurredOn ? new Date(`${occurredOn}T12:00:00`) : null,
        // The window is only written when the picker was offered: a plain
        // note keeps no window unless it was pinned to one day.
        ...(importance !== "standard" || matters.shape === "day" ? windowFromChoice(matters) : {}),
      });
      reset();
    } catch {
      // Refused or offline: the words stay in the box, and it says so. The
      // host may also have said so (a toast); this line stays until the next
      // edit, beside the words it is about.
      setOutcome("failed");
    } finally {
      setIsSaving(false);
    }
  };

  /** FORD mode's save: the typed words become a FORD detail, never a note. */
  const saveToFord = async () => {
    if (!fordMode || !ford) return;
    const text = body.trim();
    if (!text || isSaving || disabled || text.length > FORD_BODY_MAX) return;
    setIsSaving(true);
    setOutcome("idle");
    try {
      const id = await createFordEntry(ford.clientId, ford.studioId, ford.author, {
        pillar,
        body: text,
        origin: ford.origin ?? "profile",
        sessionId: ford.sessionId ?? null,
      });
      // createFordEntry returns null when the write was refused or failed.
      // Never clear the box on that path and never say Saved: the sentence in
      // it is the only copy.
      if (!id) {
        setOutcome("failed");
        return;
      }
      reset();
      setOutcome("saved-ford");
      if (flashRef.current !== null) window.clearTimeout(flashRef.current);
      flashRef.current = window.setTimeout(
        () => setOutcome((o) => (o === "saved-ford" ? "idle" : o)),
        SAVED_FLASH_MS,
      );
      onFordSaved?.();
    } catch {
      // createFordEntry reports a refusal by returning null, but a write that
      // throws (outside the app shell, or a later change) must still leave
      // the words in the box and say so, never fail silently.
      setOutcome("failed");
    } finally {
      setIsSaving(false);
    }
  };

  const saveLabel = isSaving
    ? "Saving"
    : filing
      ? `Save ${NOTE_CATEGORY_META[category].label.toLowerCase()}`
      : "Save — file later";

  const flavourHint = flavour ? flavours.find((f) => f.id === flavour)?.blurb ?? null : null;

  return (
    <section className="nc-composer" data-testid="note-composer" data-mode={fordMode ? "ford" : "note"}>
      {/* 1 · what kind */}
      <div className="nc-composer__kind">
        <span className="nc-kicker">What kind of note?</span>
        <NoteCategoryChips value={category} onChange={pick} />
        <p className="nc-hint">
          {fordMode
            ? "Family, occupation, recreation, dreams — saved to FORD."
            : category
              ? NOTE_CATEGORY_META[category].blurb
              : origin === "in_session"
                ? "Pick one so it reaches the right people. Or save it now and file it at the end."
                : "Pick a category, or save and file it later."}
        </p>
        {category && NOTE_CATEGORY_META[category].forLeaders && !fordMode ? (
          <p className="nc-hint" data-testid="note-for-leaders">
            The studio&rsquo;s leaders see this on Operations &rarr; Today.
          </p>
        ) : null}
        {outcome === "saved-ford" ? (
          <p className="nc-saved" role="status">
            <Check className="h-4 w-4" aria-hidden /> Saved to FORD
          </p>
        ) : null}
      </div>

      {/* FORD / Life with nowhere to save it here: where it lives. The words
          typed so far are kept; picking a note category brings them back. */}
      {fordHandoff ? (
        <div className="nc-handoff flex flex-wrap items-center justify-between gap-2">
          <span className="nc-hint">
            {fordReadOnly
              ? "Personal details are kept in FORD. Only a trainer at the client’s home studio can add to it, so saving there isn’t offered here."
              : "Personal details are kept in FORD, which only the client’s home studio can read."}
            {body.trim() ? " Your unsaved note is kept — pick its category again to finish it." : ""}
          </span>
          {onOpenFord ? (
            <button type="button" className="nc-btn" onClick={onOpenFord}>
              <Heart className="h-3.5 w-3.5" aria-hidden /> Open FORD
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 2 · the words — the SAME box in note mode and FORD mode, so nothing
          typed is lost when the category changes. */}
      {fordHandoff ? null : (
        <textarea
          className="nc-input"
          rows={3}
          value={body}
          aria-label={
            fordMode
              ? `Something ${name} told you`
              : `${filing ? NOTE_CATEGORY_META[category].label : "Untagged"} note about ${name}`
          }
          placeholder={fordMode ? "“Grandson graduates in May”" : filing ? PLACEHOLDERS[category] : UNTAGGED_PLACEHOLDER}
          onChange={(e) => {
            setBody(e.target.value);
            if (outcome === "failed") setOutcome("idle");
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void (fordMode ? saveToFord() : submit());
            }
          }}
        />
      )}

      {/* FORD mode: the letter (optional), where it goes, and the save. */}
      {fordMode ? (
        <div className="nc-ford">
          <div className="nc-chips" role="group" aria-label="File under (optional)">
            {FORD_PILLARS.map((pl) => {
              const on = pillar === pl;
              return (
                <button
                  key={pl}
                  type="button"
                  className="nc-chip nc-chip--small"
                  aria-pressed={on}
                  onClick={() => setPillar(on ? null : pl)}
                >
                  <span className={`nc-letter nc-letter--${pl}`} aria-hidden>
                    {FORD_META[pl].letter}
                  </span>
                  {FORD_META[pl].label}
                </button>
              );
            })}
          </div>
          <p className="nc-hint">
            Saved to FORD, which only the client’s home studio can read. It never becomes a note.
          </p>
          {fordTooLong ? (
            <p className="nc-hint nc-hint--warn">
              FORD details hold up to 2,000 characters — this one is {fordLength.toLocaleString("en-US")}.
            </p>
          ) : null}
          <div className="nc-composer__save">
            {outcome === "failed" ? (
              <span className="nc-hint nc-hint--warn" role="alert">
                Not saved — still here, try again
              </span>
            ) : null}
            {onOpenFord ? (
              <button type="button" className="nc-btn nc-btn--quiet" onClick={onOpenFord}>
                Open FORD
              </button>
            ) : null}
            {body.trim() ? (
              <button type="button" className="nc-btn nc-btn--quiet" onClick={() => setBody("")}>
                Clear
              </button>
            ) : null}
            <button
              type="button"
              className="nc-btn nc-btn--primary"
              onClick={() => void saveToFord()}
              disabled={!body.trim() || isSaving || disabled || fordTooLong}
            >
              {isSaving ? "Saving" : "Save to FORD"}
            </button>
          </div>
        </div>
      ) : null}

      {/* 3 · only what that kind needs — every one of them optional */}
      {!fordMode && !fordHandoff && hasExtras ? (
        <div className="nc-extras">
          {flavours.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="nc-kicker">
                {category === "coaching" ? "Which P, or set-up? (optional)" : "What kind? (optional)"}
              </span>
              <div
                className="nc-chips"
                role="group"
                aria-label={category === "coaching" ? "Which P, or set-up" : "What kind of health note"}
              >
                {flavours.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="nc-chip nc-chip--small"
                    aria-pressed={flavour === f.id}
                    title={f.blurb}
                    onClick={() => setFlavour(flavour === f.id ? null : f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {flavourHint ? <p className="nc-hint">{flavourHint}</p> : null}
            </div>
          )}

          {askBody && <BodyPartPicker value={bodyParts} onChange={setBodyParts} />}

          {(setup || (machineKinds && !defaultMachine)) && (
            <label className="flex flex-col gap-1.5">
              <span className="nc-kicker">{setup ? "Machine" : "Machine (optional)"}</span>
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

          {!setup && (machineKinds || category === null) && defaultMachine && (
            <div className="flex flex-col gap-1.5">
              <span className="nc-kicker">Machine</span>
              <button
                type="button"
                className="nc-chip nc-chip--small self-start"
                aria-pressed={aboutMachine}
                onClick={() => {
                  setAboutMachine((v) => !v);
                  setAboutMachineTouched(true);
                }}
              >
                About {defaultMachine.name}
              </button>
            </div>
          )}

          {dated && (
            <label className="flex flex-col gap-1.5">
              <span className="nc-kicker">{category === "incident" ? "Happened on" : "When (optional)"}</span>
              <input
                type="date"
                className="nc-input"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
              <span className="nc-hint">
                {category === "incident"
                  ? "Leave blank for today."
                  : "Leave blank for today. A day ahead is fine — a surgery on the 14th."}
              </span>
            </label>
          )}
        </div>
      ) : null}

      {/* 4 · how loud, 5 · matters until */}
      {!fordMode && !fordHandoff ? (
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

          {(importance !== "standard" || matters.shape === "day") && (
            <MatteringPicker value={matters} onChange={setMatters} compact={origin === "in_session"} />
          )}
          {importance === "standard" && matters.shape !== "day" && (
            <button type="button" className="nc-btn nc-btn--quiet self-start" onClick={() => setMatters({ ...EMPTY_MATTERING, shape: "day" })}>
              Pin to a date (a birthday, an anniversary)
            </button>
          )}
        </div>
      ) : null}

      {/* 6 · save — always last */}
      {!fordMode && !fordHandoff ? (
        <div className="nc-composer__save">
          {outcome === "failed" ? (
            <span className="nc-hint nc-hint--warn" role="alert">
              Not saved — still here, try again
            </span>
          ) : null}
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
      ) : null}
    </section>
  );
}
