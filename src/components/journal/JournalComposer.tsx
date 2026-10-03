/**
 * The note box — the one composer for every note written about a client.
 *
 * CATEGORY FIRST (notes catalog round, Sep 2026; sharpened by the notes round,
 * Oct 3 2026). AJ's hand-off: "Category is... one of the more important parts
 * because we need to know how to correctly file this into their note section
 * on their profile, so that way we know how to act on it later", and capture
 * "can't depend on a Wrap-up pass because the time won't reliably be there".
 * QUIET BY DEFAULT (the notes round's second pass, Oct 3 2026). AJ, on the
 * first: "that is so clunky looking". Every option was on screen at once —
 * the kinds, the flavours, thirteen body parts, a date, the loudness and the
 * window — a form wall a trainer faced with a client standing there. Now:
 *
 *   1. WHERE IT GOES — one row of six choices (Coaching & equipment, Health,
 *      Incident, Retention, FORD / Life, Preference; Admin is never offered),
 *      with the one the words suggest MARKED (suggest.ts: "left knee sore"
 *      marks Health), and one line saying why.
 *   2. THE WORDS — "What did you notice about Ruth?"
 *   3. THE DETAILS — one row of small chips, each saying its value: the
 *      flavour ("Injury"), where on the body ("Left knee"), the machine
 *      ("About Leg Press", a toggle in a session), when, and how loud
 *      ("Heads up · next 4 sessions"). Each opens its control under the row
 *      on a tap, one at a time; untouched, each takes the category's default
 *      or what the words suggest.
 *   4. SAVE — and the button says where it goes: "Save as Health".
 *
 * A SUGGESTION IS NEVER A DECISION: it only stands in for a choice the
 * trainer has not made, it is named on the Save button before the tap, and
 * any pick replaces it. FORD is never filed by a suggestion (a tap on
 * FORD / Life is), and a box with no word the rules know saves to file later.
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
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Heart } from "lucide-react";
import type { JournalDraft, JournalImportance, JournalOrigin, NoteBodyMark } from "../../types/journal";
import type { Machine } from "../../types";
import {
  COMPOSER_CATEGORIES,
  DEFAULT_IMPORTANCE,
  NOTE_CATEGORY_META,
  asksBodyPart,
  flavourFor,
  flavourShort,
  flavoursOf,
  storedNoteOf,
  type FilingCategory,
  type NoteCategory,
  type NoteFlavour,
} from "../../features/client-notes/note-catalog";
import { NoteCategoryIcon } from "../../features/client-notes/NoteCategoryChips";
import { bodyMarksLine } from "../../features/client-notes/body-parts";
import { suggestFiling } from "../../features/client-notes/suggest";
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

/** How loud a new note starts, per kind — note-catalog.ts's table, re-exported where it always was. */
export { DEFAULT_IMPORTANCE };

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
  // the host is handing back a draft the trainer already started, whose
  // choices count as the trainer's own.
  const seed = draft ?? EMPTY_SESSION_DRAFT;
  const [category, setCategory] = useState<NoteCategory | null>(draft ? seed.category : null);
  const [flavour, setFlavour] = useState<NoteFlavour | null>(draft ? flavourFor(seed.category, seed.flavour) : null);
  const [flavourTouched, setFlavourTouched] = useState(!!draft && !!seed.flavour);
  const [bodyParts, setBodyParts] = useState<NoteBodyMark[]>(draft ? seed.bodyParts ?? [] : []);
  const [bodyTouched, setBodyTouched] = useState(!!draft && (seed.bodyParts?.length ?? 0) > 0);
  const [body, setBody] = useState(draft ? seed.body : "");
  const [importance, setImportance] = useState<JournalImportance>(draft ? seed.importance : "standard");
  const [importanceTouched, setImportanceTouched] = useState(!!draft && seed.importance !== "standard");
  const [machineId, setMachineId] = useState<string>(draft?.machineId ?? defaultMachineId ?? "");
  const [aboutMachine, setAboutMachine] = useState(draft ? seed.aboutMachine : true);
  const [aboutMachineTouched, setAboutMachineTouched] = useState(!!draft);
  const [occurredOn, setOccurredOn] = useState("");
  const [matters, setMatters] = useState<MatteringChoice>(EMPTY_MATTERING);
  // One detail open at a time, under the row of chips; none to begin with.
  const [openDetail, setOpenDetail] = useState<DetailId | null>(null);
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
  const defaultMachine = defaultMachineId ? (machines.find((m) => m.id === defaultMachineId) ?? null) : null;

  /* WHERE IT PROBABLY GOES (suggest.ts): read from the words, always, so a
     category the trainer picks still takes the suggested flavour and body
     part when they fit. A suggestion only ever stands in for a choice the
     trainer has not made, and FORD is never filed by a suggestion. */
  const suggestion = useMemo(
    () => suggestFiling(body, { inSession: origin === "in_session" || !!defaultMachine }),
    [body, origin, defaultMachine],
  );
  const suggested: FilingCategory | null =
    !category && suggestion && suggestion.category !== "ford" ? suggestion.category : null;
  const effective: NoteCategory | null = category ?? suggested;
  const filing = isFiling(effective);
  const effFlavour: NoteFlavour | null = flavourTouched
    ? flavourFor(effective, flavour)
    : flavourFor(effective, flavour ?? (suggestion?.category === effective ? suggestion.flavour : null));
  const askBody = asksBodyPart(effective);
  const effBody: NoteBodyMark[] = !askBody ? [] : bodyTouched ? bodyParts : (suggestion?.bodyParts ?? []);
  const effImportance: JournalImportance = importanceTouched
    ? importance
    : isFiling(effective)
      ? DEFAULT_IMPORTANCE[effective]
      : "standard";
  const effAboutMachine = aboutMachineTouched ? aboutMachine : ABOUT_MACHINE_BY_DEFAULT(effective);

  /* Report the draft up — what the box would save as it stands. The first
     render is skipped: seeding from the host's own copy and immediately
     echoing it back would be a no-op write into sessionStorage on every
     mount. */
  const reportRef = useRef(onDraftChange);
  reportRef.current = onDraftChange;
  const mounted = useRef(false);
  const bodyKey = JSON.stringify(effBody);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    reportRef.current?.({
      body,
      category,
      flavour: effFlavour,
      bodyParts: effBody,
      importance: effImportance,
      machineId: machineId || null,
      aboutMachine: effAboutMachine,
    });
    // effBody is compared by its words, so a new array of the same parts reports nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, category, effFlavour, bodyKey, effImportance, machineId, effAboutMachine]);

  // FORD / Life, and the host takes it in place (no FORD mode of its own).
  const fordMode = category === "ford" && !!ford && !onPickFord;
  // FORD / Life with nowhere to save it here: say where it lives instead.
  const fordHandoff = category === "ford" && !fordMode;
  const flavours = flavoursOf(effective);
  const setup = effective === "coaching" && effFlavour === "Setup";
  // Every filing kind but Retention and Preference can be about a machine.
  const machineKinds = effective === "coaching" || effective === "incident" || effective === "health";
  const dated = effective === "incident" || effective === "health";
  const fordLength = body.trim().length;
  const fordTooLong = fordMode && fordLength > FORD_BODY_MAX;

  const pick = (next: NoteCategory) => {
    if (next === "ford" && onPickFord) {
      onPickFord();
      return;
    }
    // A second tap on the chosen chip un-picks it: back to the suggestion,
    // or to "file later".
    const chosen = next === category ? null : next;
    setCategory(chosen);
    // A flavour that doesn't belong to the new kind goes.
    setFlavour((f) => flavourFor(chosen, f));
    setOutcome("idle");
    setOpenDetail(null);
  };

  // Back to nothing chosen — the next note starts the same way the first did.
  const reset = () => {
    setBody("");
    setCategory(null);
    setFlavour(null);
    setFlavourTouched(false);
    setBodyParts([]);
    setBodyTouched(false);
    setImportanceTouched(false);
    setImportance("standard");
    setMachineId(defaultMachineId ?? "");
    setAboutMachine(true);
    setAboutMachineTouched(false);
    setOccurredOn("");
    setMatters(EMPTY_MATTERING);
    setPillar(null);
    setOpenDetail(null);
  };

  /** Which machine the note is about, if any, for the kind it will be saved as. */
  const chosenMachine = (): string | null => {
    // Set-up is about a machine, and can name another one than the machine
    // being performed — the picker is offered even in a session.
    if (setup) return machineId || null;
    if (machineKinds || effective === null) {
      // In a session the machine being performed is offered as a toggle; on
      // the profile any machine can be picked (optional). An untagged note
      // in a session keeps the machine too — it is the one fact the trainer
      // would otherwise have to remember at teardown.
      if (defaultMachine) return effAboutMachine ? (defaultMachine.id ?? null) : null;
      return effective === null ? null : machineId || null;
    }
    return null;
  };

  const submit = async () => {
    if (category === "ford" || category === "admin") return;
    if (!body.trim() || isSaving || disabled) return;
    const stored = storedNoteOf(effective, effFlavour, effBody);
    setIsSaving(true);
    setOutcome("idle");
    try {
      await onSubmit({
        kind: stored.kind,
        category: stored.category,
        bodyParts: stored.bodyParts,
        body: body.trim(),
        importance: effImportance,
        machineId: chosenMachine(),
        focusId: null,
        origin,
        // Date inputs give yyyy-mm-dd; read at local noon / end of day, never
        // as UTC midnight (which is the previous day in Ohio).
        occurredAt: dated && occurredOn ? new Date(`${occurredOn}T12:00:00`) : null,
        // The window is only written when it was offered: a plain note keeps
        // no window unless it was pinned to one day.
        ...(effImportance !== "standard" || matters.shape === "day" ? windowFromChoice(matters) : {}),
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
      flashRef.current = window.setTimeout(() => setOutcome((o) => (o === "saved-ford" ? "idle" : o)), SAVED_FLASH_MS);
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
      ? `Save as ${NOTE_CATEGORY_META[effective].short}`
      : "Save — file later";

  /* The one line under the choices: what was suggested and why, what was
     picked and who it reaches, or how the box works. */
  const fileHint = (() => {
    if (fordMode) return "Family, occupation, recreation, dreams — saved to FORD.";
    if (category) {
      const meta = NOTE_CATEGORY_META[category];
      return meta.forLeaders ? `${meta.blurb} Leaders see it on Today.` : meta.blurb;
    }
    if (suggested && suggestion) {
      const meta = NOTE_CATEGORY_META[suggested];
      const fl = flavourShort(effFlavour);
      return `Suggested from “${suggestion.because}”: ${meta.short}${fl ? ` · ${fl}` : ""}. Pick another to change it.`;
    }
    if (suggestion?.category === "ford") return `Sounds like ${name}'s life — tap FORD to keep it there.`;
    return origin === "in_session"
      ? "Pick where it goes, or just type and Journey suggests it. Untagged notes come back at the end."
      : "Pick where it goes, or just type and Journey suggests it.";
  })();

  /* The row of details: each says its value, and opens on a tap. */
  const loudSummary = loudnessSummary(effImportance, matters);
  const machineName = (id: string) => machines.find((m) => m.id === id)?.name ?? "A machine";
  const toggleDetail = (id: DetailId) => setOpenDetail((cur) => (cur === id ? null : id));
  const detailChip = (id: DetailId, label: string, set: boolean) => (
    <button
      key={id}
      type="button"
      className={`nq-chip${set ? " nq-chip--set" : ""}`}
      aria-expanded={openDetail === id}
      aria-controls={`nq-panel-${id}`}
      data-testid={`note-detail-${id}`}
      onClick={() => toggleDetail(id)}
    >
      {label}
      <ChevronDown size={14} aria-hidden className="nq-chip__chev" />
    </button>
  );
  const flavourWords = effFlavour
    ? (flavourShort(effFlavour) ?? effFlavour)
    : effective === "coaching"
      ? "Which P?"
      : "What kind?";
  const bodyWords = bodyMarksLine(effBody) || "Where on the body?";
  const whenWords = occurredOn ? dayWords(occurredOn) : "Today";

  return (
    <section className="nc-composer nq" data-testid="note-composer" data-mode={fordMode ? "ford" : "note"}>
      {/* 1 · where it goes — one row of choices, the suggestion marked */}
      <div className="nq-file">
        <div className="nq-cats" role="group" aria-label="What kind of note?">
          {COMPOSER_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className="nq-cat"
              aria-pressed={category === c.id}
              data-suggested={!category && (suggested === c.id || (c.id === "ford" && suggestion?.category === "ford")) ? "true" : undefined}
              title={`${c.label}: ${c.blurb}`}
              aria-label={c.label}
              onClick={() => pick(c.id)}
            >
              <NoteCategoryIcon id={c.id} className="h-4 w-4" />
              {c.short}
            </button>
          ))}
        </div>
        <p className="nq-hint" data-testid="note-file-hint">
          {fileHint}
        </p>
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
          className="nq-words"
          rows={3}
          value={body}
          aria-label={
            fordMode
              ? `Something ${name} told you`
              : `${isFiling(category) ? NOTE_CATEGORY_META[category].label : "New"} note about ${name}`
          }
          placeholder={
            fordMode
              ? "“Grandson graduates in May”"
              : isFiling(category)
                ? PLACEHOLDERS[category]
                : `What did you notice about ${name}?`
          }
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
          <p className="nc-hint">Saved to FORD, which only the client’s home studio can read. It never becomes a note.</p>
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

      {/* 3 · the details — one row of chips, each its value; every one optional */}
      {!fordMode && !fordHandoff ? (
        <>
          <div className="nq-details" role="group" aria-label="Details (optional)">
            {flavours.length > 0 && detailChip("kind", flavourWords, !!effFlavour)}
            {askBody && detailChip("body", bodyWords, effBody.length > 0)}
            {!setup && (machineKinds || effective === null) && defaultMachine ? (
              <button
                type="button"
                className={`nq-chip${effAboutMachine ? " nq-chip--set" : ""}`}
                aria-pressed={effAboutMachine}
                data-testid="note-detail-about-machine"
                onClick={() => {
                  setAboutMachine(!effAboutMachine);
                  setAboutMachineTouched(true);
                }}
              >
                About {defaultMachine.name}
              </button>
            ) : null}
            {(setup || (machineKinds && !defaultMachine)) &&
              detailChip("machine", machineId ? machineName(machineId) : setup ? "Which machine?" : "A machine?", !!machineId)}
            {dated && detailChip("when", whenWords, !!occurredOn)}
            {detailChip("loud", loudSummary, effImportance !== "standard" || matters.shape === "day")}
          </div>

          {openDetail === "kind" && flavours.length > 0 ? (
            <div className="nq-panel" id="nq-panel-kind">
              <div
                className="nc-chips"
                role="group"
                aria-label={effective === "coaching" ? "Which P, or set-up" : "What kind of health note"}
              >
                {flavours.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="nc-chip nc-chip--small"
                    aria-pressed={effFlavour === f.id}
                    title={f.blurb}
                    onClick={() => {
                      setFlavour(effFlavour === f.id ? null : f.id);
                      setFlavourTouched(true);
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {effFlavour ? <p className="nq-hint">{flavours.find((f) => f.id === effFlavour)?.blurb}</p> : null}
            </div>
          ) : null}

          {openDetail === "body" && askBody ? (
            <div className="nq-panel" id="nq-panel-body">
              <BodyPartPicker
                value={effBody}
                onChange={(next) => {
                  setBodyParts(next);
                  setBodyTouched(true);
                }}
              />
            </div>
          ) : null}

          {openDetail === "machine" && (setup || (machineKinds && !defaultMachine)) ? (
            <div className="nq-panel" id="nq-panel-machine">
              <label className="flex flex-col gap-1.5">
                <span className="nc-kicker">{setup ? "Machine" : "Machine (optional)"}</span>
                <select className="nc-input" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
                  <option value="">No specific machine</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {openDetail === "when" && dated ? (
            <div className="nq-panel" id="nq-panel-when">
              <label className="flex flex-col gap-1.5">
                <span className="nc-kicker">{effective === "incident" ? "Happened on" : "When (optional)"}</span>
                <input type="date" className="nc-input" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
                <span className="nc-hint">
                  {effective === "incident"
                    ? "Leave blank for today."
                    : "Leave blank for today. A day ahead is fine — a surgery on the 14th."}
                </span>
              </label>
            </div>
          ) : null}

          {openDetail === "loud" ? (
            <div className="nq-panel" id="nq-panel-loud">
              <Loudness
                ask="How loud? (optional)"
                value={effImportance}
                compact={origin === "in_session"}
                onChange={(lvl) => {
                  setImportance(lvl);
                  setImportanceTouched(true);
                }}
              />
              {(effImportance !== "standard" || matters.shape === "day") && (
                <MatteringPicker
                  value={matters}
                  onChange={setMatters}
                  compact={origin === "in_session"}
                  importance={effImportance}
                />
              )}
              {effImportance === "standard" && matters.shape !== "day" && (
                <button
                  type="button"
                  className="nc-btn nc-btn--quiet self-start"
                  onClick={() => setMatters({ ...EMPTY_MATTERING, shape: "day" })}
                >
                  Pin to a date (a birthday, an anniversary)
                </button>
              )}
            </div>
          ) : null}

          {/* 4 · save — always last, and it says where the note goes */}
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
        </>
      ) : null}
    </section>
  );
}

type DetailId = "kind" | "body" | "machine" | "when" | "loud";

/** "Heads up · next 4 sessions", "Critical · until closed", "Note · on Oct 15" — the loudness chip's words. */
export function loudnessSummary(importance: JournalImportance, matters: MatteringChoice): string {
  const word = importance === "critical" ? "Critical" : importance === "elevated" ? "Heads up" : "Note";
  if (matters.shape === "day") return `${word} · on ${matters.from ? dayWords(matters.from) : "a day"}`;
  if (matters.shape === "range") {
    return matters.until ? `${word} · until ${dayWords(matters.until)}` : matters.from ? `${word} · from ${dayWords(matters.from)}` : word;
  }
  if (matters.from) return `${word} · from ${dayWords(matters.from)}`;
  if (importance === "elevated") return "Heads up · next 4 sessions";
  if (importance === "critical") return "Critical · until closed";
  return "Note";
}

/** "Oct 15" for a yyyy-mm-dd day, read at local noon. */
function dayWords(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return isNaN(d.getTime()) ? day : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
