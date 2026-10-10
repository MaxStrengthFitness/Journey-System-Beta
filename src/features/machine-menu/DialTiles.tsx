/**
 * THE MACHINE MENU — the settings: big tiles, + and −, one Save.
 *
 * Settings are "the primary use for a trainer" (AJ), so this block sits
 * straight under safety in BOTH doors (doors.ts). Machine menu design §C,
 * "Settings: tiles at rest" and "changing Seat 4 → 5, tap by tap":
 *
 *   - A tile per dial, three to a row in portrait: the label (15px, with the
 *     unit's dial letter when it has one) over the value at 36px, readable
 *     with the iPad set down on the machine. A steppable dial reads
 *     [−] 5 [+] with 56px buttons; a word value reads at 24px with Change;
 *     an empty dial reads "Not set" with "Use 6" and "Studio standard 6" —
 *     the standard shows ONLY on an empty dial, so it never reads as a
 *     correction to a value already fitted, and an empty dial has no ±.
 *     How a dial is offered is dial-control.ts (rules 1–5, nothing invented).
 *   - Tapping the number, "Not set" or Change turns THAT tile into its
 *     editor (the settings card, Oct 10 2026; AJ: "i need to be able to just
 *     click on the setting and input the new settings and save and exit"):
 *     a number dial is always typed, on the number pad, with the value
 *     selected (his "2a"; ± stay for one step); a word dial's own options
 *     are its buttons. An empty dial's editor keeps its Use and adds the
 *     height-band line ("Around 5'7" here, the most common setting is 6 …")
 *     with its own Use, word for word as the Settings card said it, when the
 *     client's height is on file — the one place `machineTrends/{id}` is
 *     read, as before. No Done and no Next: tap another tile, or Enter (on
 *     to the next empty dial, or the keyboard away on the last), or Save.
 *   - A changed tile is blue with "was 4" under it, and the change strip
 *     opens (ChangeStrip): "Seat 4 → 5", "Why? (optional)" folded until it
 *     is tapped (AJ's "3a"), Cancel and Save Seat 5. Seat 4 → 5 is two taps
 *     once the card is open.
 *   - Save closes the card, from every door that has one (AJ's "1a": the
 *     session's and the profile's alike), and the app's toast says it with
 *     Undo for ten seconds (`onSaveClose`). Programming → All Machines draws
 *     the body inline, with no card to close: the strip says it there.
 *   - Saving goes through `saveSettings` (one batch, every write issued at
 *     once) and waits only through `settleOrQueue`: "Seat 5 saved · Undo",
 *     "… saved on this iPad · it sends when the Wi-Fi is back · Undo", or
 *     "Couldn't save Seat 5 · Try again" with the change kept. Undo, for ten
 *     seconds, writes the old values back through the same path with the
 *     reason "Undone" and no second journal copy (setting-draft.ts).
 *   - The heading's right side: "Last changed Aug 18 · Back pad 3 → 2 ›",
 *     which selects that change on the chart; "No settings saved yet"; or
 *     "Changes couldn't be loaded" — never silence that reads as "never".
 *   - Machine fit's rare line (FitLine) under the tiles, checked against
 *     what is SAVED.
 *
 * NOTHING SAVES on blur, Close, a backdrop tap or Escape: the draft joins
 * the unsaved-changes registry ("Leg Press settings for Avery"), so leaving
 * asks first. A watched session (another trainer's) shows values only.
 *
 * QUICK SET-UP (the open session round, Oct 9 2026; AJ's "2a": "a client has
 * no settings so you need to be able to adjust the settings quickly while
 * running the routine"). The Now Bar's Set up opens the card with
 * `focusDial`: the first empty dial's tile is its field at once, on the
 * number pad for a number dial; Enter, or a tap on the next tile, goes on;
 * "Use studio standard for all" fills every empty dial that has one (two or
 * more, still unsaved until Save); and Save closes the card. Seat 12 and
 * Back pad 3 on a first time: Set up, "12", Back pad's tile, "3", Save
 * set-up — three taps and the digits.
 *
 * THE EDITOR HOLDS STILL WHILE YOU TYPE (finding 5). Which editor a dial
 * opens (a field, or a word dial's options) and its keypad are judged once,
 * as it opens, and held while it is open (`judgeEditor`): it was judged from
 * the draft on every render, so the first digit typed into an empty dial
 * made it a one-position stepper and the field turned into a row holding
 * "1" (a Seat of 12 cost eleven + taps), and machine fit answering
 * mid-typing swapped it too. The field sits in the tile's one place, so the
 * tile turning from "Not set" to a value under the first digit never
 * remounts it.
 *
 * The toast's Undo, once the card has closed, is laid onto what this iPad
 * knows the settings are at the tap (`known-settings.ts`, `undoOnto`), so a
 * later save is never taken back with it.
 *
 * The draft is measured against what the card opened with (fixed dials
 * seeded), so opening is never dirty. After a save the card holds what it
 * wrote until the settings document's listener catches up, so the strip
 * doesn't flash back open in between. When the seed itself moves (the
 * catalog's fields arrive after the first frame, a catalog edit, another
 * iPad's save), the draft is rebased during render (`rebaseDraft`): a dial
 * nobody touched follows, a dial changed by hand keeps its value, so no
 * change appears that nobody made and Save never writes one back.
 *
 * Save and Undo never wait on the database (speed round, Oct 5 2026; R9):
 * the change is on this iPad the moment the batch is issued, so the dials
 * are free again in the same tick (only a refusal the iPad judges itself
 * comes back that fast). Online the strip says "saved" at once - a write on
 * this iPad, not yet the database's answer - and turns to "saved on this
 * iPad" if no answer has come within FINISH_WAIT_MS (studio Wi-Fi with no
 * internet). A refusal that comes later is still heard (late-refusal.ts),
 * and never wipes a change typed since (dirtyRef).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUnsavedChanges } from "../unsaved-changes";
import { saveSettings, type JournalContext, type MutationAuthor, type SaveSettingsResult } from "../equipment/mutations";
import { parseHeightInches, suggestFromTrend } from "../equipment/setting-suggestions";
import type { EquipmentMachine, SettingFieldSpec } from "../equipment/types";
import { useMachineTrend } from "../equipment/useMachineTrend";
import type { FitData } from "../machine-fit/fit-store";
import { acknowledgeFlag } from "../machine-fit/setup-save";
import { nextSettings, nextSources } from "../machine-fit/settings-write";
import type { FitFactors, SettingSource } from "../machine-fit/types";
import { readStoredSpec } from "../machine-fit/ui/stored-spec";
import { FINISH_WAIT_MS, settleOrQueue } from "../session-record/finish-wait";
import { ChangeResult, ChangeStrip } from "./ChangeStrip";
import { canStep, dialControl, editorKeypad, recordValuesFor, stepDial, studioValuesFor, type DialControl } from "./dial-control";
import { FitLine } from "./FitLine";
import { fitAckOf, fitLineSentence, menuAudit, rareStudioFlags } from "./fit-line";
import { PositionRow, ValueEditor } from "./PositionRow";
import {
  UNDO_MS,
  USE_ALL_FROM,
  USE_ALL_LABEL,
  asksWhy,
  changeWords,
  closedHeldWords,
  closedSaveWords,
  draftChanges,
  firstEmptyDial,
  heldClosedWords,
  heldOutcomeWords,
  isDraftDirty,
  isFirstSetup,
  nextEmptyDial,
  nothingToUndoWords,
  offersHealthNote,
  reasonOf,
  rebaseDraft,
  refusedHeldWords,
  refusedLaterWords,
  saveOutcomeWords,
  seedDraft,
  standardsForEmpty,
  suggestedSources,
  tileState,
  undoOnto,
  undoOutcomeWords,
  undoPayload,
  unsavedSettingsLabel,
  wasWords,
  type ReasonChip,
  type SaveOutcome,
  type UndoPayload,
} from "./setting-draft";
import { lastChange, lastChangedLine, type SettingPair, type SettingRow } from "./setting-history";
import type { SettingHistoryState } from "./useSettingHistory";
import { sayAfterClose, sayWithUndo, whenRefusedLater } from "./late-refusal";
import { knownSettings, noteKnownSettings } from "./known-settings";
import { HELD_SETUP_LINE, heldClosedFor } from "../open-session/held-setup";
import "./machine-menu.css";

/** Calls `then` if the write has not answered either way within FINISH_WAIT_MS. */
function whenStillOut(write: Promise<unknown>, then: () => void): void {
  let answered = false;
  write.then(
    () => {
      answered = true;
    },
    () => {
      answered = true;
    },
  );
  window.setTimeout(() => {
    if (!answered) then();
  }, FINISH_WAIT_MS);
}

/** A dial as the tiles take it: the equipment view model's field, and the unit's letter when it has one. */
export interface TileField extends SettingFieldSpec {
  /** "G", "P", "SP": the codex's dial letter, drawn as a chip before the label. */
  letter?: string;
}

export interface DialTilesProps {
  machineId: string;
  /** The unit's floor name: the leave question and the journal copy say it. */
  machineName: string;
  fields: readonly TileField[];
  /** What is saved for this client on this machine (`clientMachineSettings.settings`). */
  saved: Readonly<Record<string, string>>;
  sources?: Record<string, SettingSource> | null;
  fitAcks?: EquipmentMachine["fitAcks"] | null;
  clientId: string;
  /** The name the client goes by, for the leave question and the fit line. */
  clientFirstName: string;
  /** The client's HOME studio: where machine fit's index row lives. */
  homeStudioId?: string | null;
  /** Who is saving: `id` is the Auth uid. Null saves nothing. */
  author: MutationAuthor | null;
  /** Where the journal copy is filed: the session link and studio in a session, the profile otherwise. */
  journal?: JournalContext;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
  /** The card's one read of the setting changes (useSettingHistory). */
  history?: readonly SettingRow[] | null;
  historyState?: SettingHistoryState;
  /** The settings snapshot on each of this client's sets on this machine (rule 4's values). */
  snapshots?: readonly (Readonly<Record<string, unknown>> | null | undefined)[];
  /** The host's `useFitData` answer, for rule 3 and the fit line. */
  fit?: FitData | null;
  /** `factorsOf(client)`, for the fit line. */
  fitTarget?: FitFactors | null;
  /** The client's height as stored ("5'7\""), for the height-band line on an empty dial. */
  clientHeight?: string | null;
  /** A watched session: values only, no buttons. */
  readOnly?: boolean;
  /** Whether the iPad is online (useSendState); unknown is the browser's word. */
  online?: boolean;
  /** After a save or an Undo is on the iPad: the host reads the setting changes again. */
  onSaved?: () => void;
  /** "Last changed …" tapped: select that change's column in the chart. */
  onLastChanged?: (row: SettingRow) => void;
  /** "Add a Health note" after a save for pain or discomfort: open the note box with the change typed. */
  onAddHealthNote?: (changeWords: string) => void;
  /** A change is unsaved (the note box's Add steps down while it is). */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Quick set-up (the Now Bar's Set up): open on the first empty dial's
   * editor at once. Read when the card opens.
   */
  focusDial?: boolean;
  /**
   * Save closes the card (every door with a card; AJ's "1a", Oct 10 2026):
   * called once a save is on this iPad, after the app's toast has said it
   * with Undo for ten seconds. Absent (the inline pane), the strip says it
   * in place.
   */
  onSaveClose?: () => void;
  /**
   * An open session before its client is chosen (the open session round,
   * Oct 9 2026; AJ's "3a"): Save and Undo keep the values on the session
   * through `keep` and never save to a client; Assign saves them to the
   * client later. The heading says so (`HELD_SETUP_LINE`); no reason is
   * asked (nothing would carry it) and no fit review is offered (there is
   * no client to review). `saved` is what the session holds.
   */
  hold?: HeldTarget | null;
  /**
   * `saved` may not be the server's yet (the session door until its listener
   * has had the server's answer for the client; the open session round's
   * review, Oct 9 2026): Save and Undo write only the dials they change,
   * by name, write no machine-fit row (it is written whole) and claim no
   * first set-up, so a partial or cold copy never wipes a saved dial.
   */
  settingsUnsure?: boolean;
}

/** Where an open session keeps a machine's settings until its client is chosen. */
export interface HeldTarget {
  /** Where this iPad notes what is held, for the toast's Undo (known-settings.ts): never a client's id. */
  key: string;
  /**
   * Keep the dials' values, whole, on the session, with where a value came
   * from when it isn't typed ("suggested"): one write, issued; its promise is
   * the database's answer. Refused once the session has its client
   * (`heldClosedFor` names them).
   */
  keep: (values: Record<string, string>, sources?: Record<string, SettingSource> | null) => Promise<unknown>;
}

type Values = Record<string, string>;

/**
 * Where a save went, so its Undo goes there too (the open session round's
 * review, Oct 9 2026): an Undo built from the card as it is at the tap went
 * to the client once Assign had given the session one, with the payload of
 * a save kept on the session, and wrote her whole map over.
 */
interface SaveTo {
  clientId: string;
  hold: HeldTarget | null;
  /** The client's settings weren't the server's yet: only the dials it changes, and no fit row. */
  unsure: boolean;
}

/** What Undo writes back, and what it says. */
interface UndoState {
  payload: UndoPayload;
  changes: SettingPair[];
  firstSetup: boolean;
  sources: Record<string, SettingSource> | null;
  to: SaveTo;
  /** A save kept on an open session: the sources before it and after it, so an Undo puts a suggested value's mark back too. */
  heldSources: { before: Record<string, SettingSource> | null; after: Record<string, SettingSource> } | null;
}

/** The open editor's field (or a word dial's options) and its keypad, judged as it opened and held while it is open. */
interface EditorLock {
  key: string;
  control: DialControl;
  keypad: "decimal" | "text";
}

/** Everything an Undo writes with besides its payload: the card's, kept by value so it still works once the card has closed. */
interface UndoTarget extends SaveTo {
  machineId: string;
  machineName: string;
  clientFirstName: string;
  fields: readonly TileField[];
  author: MutationAuthor;
  journal?: JournalContext;
  sources: Record<string, SettingSource> | null;
  homeStudioId: string | null;
  fitAcks: EquipmentMachine["fitAcks"] | null;
}

/** Where this iPad notes what the settings are: the client's, or what an open session holds. */
const knownIdOf = (t: { clientId: string; hold?: HeldTarget | null }): string => t.hold?.key ?? t.clientId;

/** The sources an Undo of a kept set-up puts back: each dial it takes back gets its mark from before the save. */
function heldUndoSources(t: UndoTarget, u: UndoState): Record<string, SettingSource> {
  const out: Record<string, SettingSource> = { ...(u.heldSources?.after ?? t.sources ?? {}) };
  for (const f of t.fields) {
    if (clean(u.payload.saved[f.key]) === clean(u.payload.draft[f.key])) continue;
    const was = u.heldSources?.before?.[f.key];
    if (was) out[f.key] = was;
    else delete out[f.key];
  }
  return out;
}

/** Undo's write, through the same path as a save, never waited on (R9). */
function writeUndo(t: UndoTarget, u: UndoState): Promise<SaveSettingsResult | null> {
  try {
    // What the settings are once it lands, for a later toast's Undo (known-settings.ts).
    const after = nextSettings([...t.fields], u.payload.saved, u.payload.draft);
    // An open session: the old values go back onto the session, never to a client.
    if (t.hold) {
      const kept = t.hold.keep(after, heldUndoSources(t, u)).then(() => null);
      noteKnownSettings(knownIdOf(t), t.machineId, after);
      return kept;
    }
    const write = saveSettings({
      clientId: t.clientId,
      machineId: t.machineId,
      fields: [...t.fields],
      author: t.author,
      machineName: t.machineName,
      journal: t.journal,
      existingSources: u.sources ?? t.sources,
      // Not the server's settings yet: only the dials taken back, and no fit row (written whole).
      homeStudioId: t.unsure ? null : t.homeStudioId,
      dialsOnly: t.unsure,
      existingAcks: t.fitAcks,
      ...u.payload,
    });
    noteKnownSettings(knownIdOf(t), t.machineId, after);
    return write;
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * The toast's Undo, once the card has closed: the same write as the strip's
 * Undo, laid onto what this iPad knows the settings are at the tap
 * (`undoOnto`), so a later save on the same client and machine (Set up
 * again) is never taken back with it; a dial changed since is left alone,
 * and with none left it writes nothing and says so. A refusal is said in
 * the app's toast, since the card that would have said it is gone. A set-up
 * kept on a session that has its client by now is not taken back: the toast
 * says where it is (`heldClosedWords`).
 */
function undoAfterClose(t: UndoTarget, u: UndoState): void {
  const laid = undoOnto(t.fields, u.payload, knownSettings(knownIdOf(t), t.machineId) ?? u.payload.saved);
  if (!laid) {
    sayAfterClose(nothingToUndoWords(t.machineName, t.clientFirstName), "info", 6000);
    return;
  }
  const back = new Set(t.fields.filter((f) => laid.keys.includes(f.key)).map((f) => f.label));
  const changes = u.changes.filter((c) => back.has(c.label));
  const v: UndoState = { ...u, payload: laid.payload, changes: changes.length > 0 ? changes : u.changes };
  whenRefusedLater(writeUndo(t, v), (err) => {
    const closedFor = heldClosedFor(err);
    if (closedFor !== null) {
      sayAfterClose(heldClosedWords(t.machineName, closedFor, false), "info", 8000);
      return;
    }
    console.error("[machine menu] undo refused after the card closed", err);
    sayAfterClose(
      t.hold
        ? refusedHeldWords(t.machineName, v.changes, v.firstSetup, true)
        : refusedLaterWords(t.machineName, t.clientFirstName, v.changes, v.firstSetup, true),
    );
  });
}

/** What the strip says once Save or Undo has been tapped. */
interface Result {
  words: string;
  /** Undo, while its ten seconds last. */
  undo: UndoState | null;
  /** A refused Undo can be tried again. */
  retryUndo: UndoState | null;
  /** After a save for pain or discomfort: the change, for the Health note. */
  pain: string | null;
}

const browserOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);
const clean = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const NUMERIC = /^\d+(?:\.\d+)?$/;

/**
 * A word dial's own options as buttons (rule 1: the field's options, or a
 * longer list's positions), or null: every other dial is typed (AJ's "2a").
 */
function wordButtons(control: DialControl): string[] | null {
  if (control.kind === "options") return control.options;
  if (control.kind === "stepper" && control.scale.unit === "list" && control.positions && control.positions.length > 1) return control.positions;
  return null;
}

export function DialTiles({
  machineId,
  machineName,
  fields,
  saved,
  sources = null,
  fitAcks = null,
  clientId,
  clientFirstName,
  homeStudioId = null,
  author,
  journal,
  today,
  history = null,
  historyState = "loading",
  snapshots = [],
  fit = null,
  fitTarget = null,
  clientHeight = null,
  readOnly = false,
  online,
  onSaved,
  onLastChanged,
  onAddHealthNote,
  onDirtyChange,
  focusDial = false,
  onSaveClose,
  hold = null,
  settingsUnsure = false,
}: DialTilesProps) {
  // Where this iPad notes what the settings are (known-settings.ts): the client's, or what the open session holds.
  const knownId = hold?.key ?? clientId;
  // What this card wrote, until the settings document's listener says so too.
  const [written, setWritten] = useState<Values | null>(null);
  const base: Readonly<Record<string, string>> = written ?? saved;
  const [draft, setDraft] = useState<Values>(() => seedDraft(fields, saved));
  // What the draft is measured against now, and the seed it was last given.
  const seed = seedDraft(fields, base);
  const seedKey = JSON.stringify(seed);
  const [seededFrom, setSeededFrom] = useState<{ key: string; seed: Values }>(() => ({ key: seedKey, seed }));
  // The draft as it is about to be once a moved seed is rebased below: the
  // queued update isn't applied until the next render, and Set up's first
  // empty dial is judged in this one (a fixed gap the catalog has just
  // filled is not empty).
  const draftNow = seededFrom.key !== seedKey ? rebaseDraft(draft, seededFrom.seed, seed) : draft;
  // The seed moved under the draft (the catalog's fields arriving, a catalog
  // edit, another iPad's save): rebase it here, during render (React's
  // "adjusting state when a prop changes"), so no frame ever shows a change
  // nobody made. Untouched dials follow; a dial changed by hand stays.
  if (seededFrom.key !== seedKey) {
    setSeededFrom({ key: seedKey, seed });
    setDraft((d) => rebaseDraft(d, seededFrom.seed, seed));
  }
  /** Put a draft in place with the base it is measured against, so the rebase above never reads it as moved. */
  const holdDraft = (nextBase: Values, nextDraft: Values) => {
    const s = seedDraft(fields, nextBase);
    setWritten(nextBase);
    setSeededFrom({ key: JSON.stringify(s), seed: s });
    setDraft(nextDraft);
  };
  const [editing, setEditing] = useState<string | null>(null);
  // The open editor's row or field, held while it is open (judgeEditor, below).
  const [editorLock, setEditorLock] = useState<EditorLock | null>(null);
  // Quick set-up: the first empty dial's editor opens as soon as the dials
  // are known (the catalog's can arrive a moment after the card), once.
  const [focusArmed, setFocusArmed] = useState(focusDial && !readOnly);
  if (focusArmed && fields.length > 0) {
    setFocusArmed(false);
    const first = firstEmptyDial(fields, draftNow);
    if (first) setEditing(first);
  }
  const [reason, setReason] = useState<ReasonChip | null>(null);
  const [otherText, setOtherText] = useState("");
  // Dial key → the value Use put there: saved as "suggested" while it stands.
  const [used, setUsed] = useState<Values>({});
  const [saving, setSaving] = useState(false);
  const [failedWords, setFailedWords] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // A save that closes the card: the toast's words and its Undo, said once
  // the save's own render has committed (the leave gate then sees no change).
  const [closing, setClosing] = useState<{ words: string; target: UndoTarget; undo: UndoState } | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  // Whether the card is still open, for a refusal that comes after it closed.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const onSaveCloseRef = useRef(onSaveClose);
  onSaveCloseRef.current = onSaveClose;
  useEffect(() => {
    if (!closing) return;
    const { words, target, undo: u } = closing;
    sayWithUndo(words, () => undoAfterClose(target, u), UNDO_MS);
    onSaveCloseRef.current?.();
  }, [closing]);

  // An editor that opens (Set up's first, Next's) comes into view, by as
  // little as it takes: the safety strip above stays where it is when it fits.
  useEffect(() => {
    if (!editing) return;
    sectionRef.current?.querySelector<HTMLElement>("[data-editor]")?.scrollIntoView?.({ block: "nearest" });
  }, [editing]);

  const dirty = !readOnly && isDraftDirty(fields, draft, base);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // The settings document moved (this card's own save landing, or another
  // iPad): what this card wrote is no longer needed. The draft follows the
  // document through the rebase above, keeping only the dials changed here.
  const savedKey = JSON.stringify(saved);
  const firstSaved = useRef(savedKey);
  useEffect(() => {
    if (firstSaved.current === savedKey) return;
    firstSaved.current = savedKey;
    setWritten(null);
  }, [savedKey]);

  // What this card knows the settings are (the listener's, or what it just
  // wrote), for a toast's Undo once a card has closed (known-settings.ts).
  const baseKey = JSON.stringify(base);
  useEffect(() => {
    if (!readOnly) noteKnownSettings(knownId, machineId, base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey, knownId, machineId, readOnly]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  // Undo lasts ten seconds; the words stay.
  useEffect(() => {
    if (!result?.undo) return;
    const timer = window.setTimeout(() => setResult((r) => (r ? { ...r, undo: null } : r)), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [result]);

  const reset = useCallback(() => {
    setDraft(seedDraft(fields, base));
    setReason(null);
    setOtherText("");
    setUsed({});
    setEditing(null);
    setFailedWords(null);
  }, [fields, base]);

  useUnsavedChanges(dirty, unsavedSettingsLabel(machineName, clientFirstName), { onDiscard: reset });

  const isOnline = () => (online === undefined ? browserOnline() : online);

  const changes = useMemo(() => draftChanges(fields, base, draft), [fields, base, draft]);
  const firstSetup = isFirstSetup(base);

  /* ---------------- the values each dial can step through ---------------- */

  const studioRows = fit && fit.status === "ready" ? (fit.sources[machineId]?.studio ?? null) : null;
  const contextOf = (f: TileField) => ({
    saved: base[f.key],
    studioValues: fit && fit.status === "ready" ? studioValuesFor(f, studioRows) : null,
    recordValues: recordValuesFor(f, { snapshots, rows: history }),
  });
  /** The tile's ±: judged with the value on the tile, so a dial Use filled steps. */
  const controlOf = (f: TileField): DialControl => dialControl(f, { ...contextOf(f), current: draft[f.key] });
  /**
   * The editor and its keypad, judged ONCE as it opens and held while it is
   * open (finding 5, and the review that followed it). It was judged again
   * on every render from the half-typed draft, so the first digit typed into
   * an empty dial turned the field into a row holding "1"; and judged again
   * when machine fit or the record answered, it still swapped under the
   * finger mid-typing. So it is judged from what is on the tile as it opens,
   * and held.
   *
   * Every number (and letter) dial is typed (AJ's "2a", Oct 10 2026: "Number
   * dials always open a typed box on the number pad"): the spans seen on
   * this floor and on the record (rules 3 and 4) may not hold the value
   * wanted (Seat 12 where the studio's clients sit at 3 to 9), and a row of
   * positions was a second way to do the same thing. Only a word dial's own
   * options (rule 1) are buttons (`wordButtons`).
   */
  const judgeEditor = (f: TileField, onTile: string): EditorLock => {
    const ctx = contextOf(f);
    const control = dialControl(f, { ...ctx, current: onTile });
    return { key: f.key, control, keypad: editorKeypad(f, control, ctx) };
  };
  const lockField = editing ? (fields.find((f) => f.key === editing) ?? null) : null;
  let editorLockNow = editorLock;
  if (lockField && editorLock?.key !== lockField.key) {
    editorLockNow = judgeEditor(lockField, draftNow[lockField.key] ?? "");
    setEditorLock(editorLockNow);
  } else if (!lockField && editorLock !== null) {
    editorLockNow = null;
    setEditorLock(null);
  }

  /** Open a dial's editor (Next, Set up). */
  const openEditor = (key: string) => setEditing(key);
  /** Close the editor; with a change waiting, its Save comes into view. */
  const closeEditor = () => {
    setEditing(null);
    window.setTimeout(() => sectionRef.current?.querySelector<HTMLElement>('[data-strip="edit"]')?.scrollIntoView?.({ block: "nearest" }), 0);
  };

  // The dials hold still only for the tick a save is issued in (R9: Save
  // never waits on the database's answer): what the save wrote replaces the
  // draft in that tick, and would wipe a change made in between.
  const setValue = (key: string, value: string) => {
    if (saving) return;
    setDraft((d) => ({ ...d, [key]: value }));
    setFailedWords(null);
    setResult(null);
  };

  /* ---------------- the height-band line, on an empty dial's editor ---------------- */

  const heightIn = useMemo(() => parseHeightInches(clientHeight), [clientHeight]);
  const editingField = editing ? (fields.find((f) => f.key === editing) ?? null) : null;
  const editingEmpty = !!editingField && clean(base[editingField.key]) === "";
  const trend = useMachineTrend(machineId, !readOnly && editingEmpty && heightIn !== null);
  const suggestion =
    editingField && editingEmpty && clean(draft[editingField.key]) === ""
      ? suggestFromTrend(trend, [editingField.key, editingField.label], heightIn, editingField.options)
      : null;

  /* ---------------- save and undo ---------------- */

  /** Where a save made now goes: the client, or the open session's hold. */
  const saveTo = (): SaveTo => ({ clientId, hold, unsure: settingsUnsure });

  /** What an Undo writes with, kept by value (the toast's Undo outlives the card), sent where its save went. */
  const undoTarget = (who: MutationAuthor, to: SaveTo = saveTo()): UndoTarget => ({
    ...to,
    machineId,
    machineName,
    clientFirstName,
    fields,
    author: who,
    journal,
    sources,
    homeStudioId,
    fitAcks,
  });

  /** What the strip says after a save: kept on an open session, or saved for the client. */
  const outcomeWords = (c: SettingPair[], first: boolean, o: SaveOutcome) =>
    hold ? heldOutcomeWords(c, first, o, false) : saveOutcomeWords(c, first, o, false);
  /** What the toast says once the save has closed the card. */
  const closedWords = (c: SettingPair[], first: boolean, o: Exclude<SaveOutcome, "failed">) =>
    hold ? closedHeldWords(machineName, c, first, o) : closedSaveWords(machineName, clientFirstName, c, first, o);

  const save = async () => {
    if (!author || readOnly || saving || changes.length === 0) return;
    const wasFirst = firstSetup;
    // Kept on an open session, no reason is asked: nothing would carry it to the client.
    // Nor is one carried for a blank dial filled: it is no change from anything (the strip asked none).
    const why = !hold && asksWhy(changes) ? reasonOf(reason, otherText) : "";
    const before: Values = { ...base };
    const sent: Values = { ...draft };
    const saveChanges = changes;
    const to = saveTo();
    /* An open session before its client is chosen (AJ's "3a"): kept on the
       session, whole, with where a value came from when it isn't typed
       ("suggested", so machine fit never learns from its own suggestion once
       Assign saves them to the client), and never saved to a client here.
       No history row, journal copy or machine-fit row: there is no client
       yet. */
    const heldSources = to.hold
      ? { before: sources, after: nextSources([...fields], before, nextSettings([...fields], before, sent), sources, suggestedSources(used, sent)) }
      : null;
    setSaving(true);
    setFailedWords(null);
    let write: Promise<SaveSettingsResult | null>;
    try {
      write =
        to.hold && heldSources
          ? to.hold.keep(nextSettings([...fields], before, sent), heldSources.after).then(() => null)
          : saveSettings({
              clientId,
              machineId,
              fields: [...fields],
              saved: before,
              draft: sent,
              reason: why,
              author,
              // Off settings that may not be the server's, no first set-up is claimed.
              isInitialSetup: wasFirst && !to.unsure,
              machineName,
              journal,
              existingSources: sources,
              changedSources: suggestedSources(used, sent),
              // The fit row is written whole: not off settings that may not be the server's.
              homeStudioId: to.unsure ? null : homeStudioId,
              existingAcks: fitAcks,
              dialsOnly: to.unsure,
            });
    } catch (err) {
      write = Promise.reject(err);
    }
    /* The card never waits on the database's answer (speed round, Oct 5
       2026; R9): the change is on this iPad the moment the batch is issued,
       so only a refusal the iPad judges itself comes back in this tick.
       Online the strip says "saved" at once, and "saved on this iPad" if the
       answer is still out after a moment (studio Wi-Fi with no internet). */
    const onlineNow = isOnline();
    const outcome = await settleOrQueue(write, onlineNow, 0);
    setSaving(false);
    if (outcome.kind === "failed") {
      console.error("[machine menu] settings not saved", outcome.error);
      setFailedWords(outcomeWords(saveChanges, wasFirst, "failed"));
      return;
    }
    if (outcome.kind === "queued") {
      // Refused after "saved on this iPad": the listener puts the old values
      // back; the strip takes back its Undo and brings the change back with
      // Try again (unless another change is under way), or the toast says it.
      whenRefusedLater(write, (err) => {
        console.error("[machine menu] settings refused after they were saved on this iPad", err);
        if (!live.current) {
          sayAfterClose(
            to.hold
              ? refusedHeldWords(machineName, saveChanges, wasFirst)
              : refusedLaterWords(machineName, clientFirstName, saveChanges, wasFirst),
          );
          return;
        }
        setResult(null);
        if (!dirtyRef.current) holdDraft(before, sent);
        setFailedWords(outcomeWords(saveChanges, wasFirst, "failed"));
      });
    }
    // The map as written: the database's answer, or (queued) the same map
    // saveSettings builds, so Undo puts back exactly what changed.
    const after = outcome.kind === "saved" && outcome.value ? outcome.value.settings : nextSettings([...fields], before, sent);
    const kind: SaveOutcome = outcome.kind === "queued" && onlineNow ? "saved" : outcome.kind;
    const undoState: UndoState = {
      payload: undoPayload(fields, before, after),
      changes: saveChanges,
      firstSetup: wasFirst,
      sources: outcome.kind === "saved" && outcome.value ? outcome.value.sources : null,
      to,
      heldSources,
    };
    // What the settings are now, for a toast's Undo after this card has closed (known-settings.ts).
    noteKnownSettings(knownId, machineId, after);
    holdDraft(after, seedDraft(fields, after));
    setReason(null);
    setOtherText("");
    setUsed({});
    setEditing(null);
    setResult({
      words: outcomeWords(saveChanges, wasFirst, kind),
      undo: undoState,
      retryUndo: null,
      pain: offersHealthNote(why) ? changeWords(saveChanges) : null,
    });
    // Set up from the Now Bar: the card closes, and the toast keeps the Undo.
    // A save for pain stays open, so its Add a Health note is still there.
    const closes = !!onSaveClose && !offersHealthNote(why);
    if (closes) {
      setClosing({
        words: closedWords(saveChanges, wasFirst, kind === "queued" ? "queued" : "saved"),
        target: undoTarget(author, to),
        undo: undoState,
      });
    }
    if (outcome.kind === "queued" && onlineNow) {
      const shown = outcomeWords(saveChanges, wasFirst, "saved");
      whenStillOut(write, () => {
        // The card closed on this save (Set up): its toast said "saved", and
        // the strip that would correct it is gone, so the toast says it.
        if (!live.current) {
          if (closes) sayAfterClose(closedWords(saveChanges, wasFirst, "queued"), "info", 8000);
          return;
        }
        setResult((r) => (r && r.words === shown ? { ...r, words: outcomeWords(saveChanges, wasFirst, "queued") } : r));
      });
    }
    onSaved?.();
  };

  const undo = async (u: UndoState) => {
    if (!author || readOnly) return;
    setResult(null);
    // Where its save went (`u.to`), never the card as it is now: a save kept
    // on an open session is taken back there, even once Assign has given the
    // session its client (and refused then, said below).
    const t = undoTarget(author, u.to);
    const write = writeUndo(t, u);
    // The tiles show the old values straight away; a refusal puts the save's back.
    holdDraft(u.payload.draft, seedDraft(fields, u.payload.draft));
    // Never waited on, as a save isn't (R9).
    const onlineNow = isOnline();
    const outcome = await settleOrQueue(write, onlineNow, 0);
    const refused = (err: unknown) => {
      if (!dirtyRef.current) holdDraft(u.payload.saved, seedDraft(fields, u.payload.saved));
      // Kept on the session, and the session has its client now: the set-up
      // went to them with it. Said, with nothing to try again: it is changed
      // on this card now, as the client's.
      const closedFor = heldClosedFor(err);
      if (closedFor !== null) {
        setResult({ words: heldClosedWords(machineName, closedFor, true), undo: null, retryUndo: null, pain: null });
        return;
      }
      setResult({ words: undoOutcomeWords(u.changes, u.firstSetup, "failed"), undo: null, retryUndo: u, pain: null });
    };
    if (outcome.kind === "failed") {
      console.error("[machine menu] undo not saved", outcome.error);
      refused(outcome.error);
      return;
    }
    if (outcome.kind === "queued") {
      // Refused after "on this iPad": the same as a refusal in the moment, or the toast once the card has closed.
      whenRefusedLater(write, (err) => {
        console.error("[machine menu] undo refused after it was saved on this iPad", err);
        if (!live.current) {
          const closedFor = heldClosedFor(err);
          sayAfterClose(
            closedFor !== null
              ? heldClosedWords(machineName, closedFor, false)
              : t.hold
                ? refusedHeldWords(machineName, u.changes, u.firstSetup, true)
                : refusedLaterWords(machineName, clientFirstName, u.changes, u.firstSetup, true),
          );
          return;
        }
        refused(err);
      });
    }
    const undoKind: SaveOutcome = outcome.kind === "queued" && onlineNow ? "saved" : outcome.kind;
    setResult({ words: undoOutcomeWords(u.changes, u.firstSetup, undoKind), undo: null, retryUndo: null, pain: null });
    onSaved?.();
  };

  /* ---------------- machine fit's rare line ---------------- */

  const audit = useMemo(
    () =>
      menuAudit({
        machineId,
        clientId,
        fields,
        saved: base,
        fit,
        target: fitTarget,
        spec: readStoredSpec(),
        acks: fitAcks ?? null,
      }),
    [machineId, clientId, fields, base, fit, fitTarget, fitAcks],
  );
  const flags = rareStudioFlags(audit);

  /* ---------------- the heading's right side ---------------- */

  const lastRow = history && historyState !== "failed" ? lastChange(history) : null;
  // A read only this iPad's cache answered can't say "never".
  const lastFailed = historyState === "failed" || (historyState === "cache-only" && !lastRow);
  const lastWords = historyState === "loading" ? null : lastChangedLine(history, { today, failed: lastFailed });

  /* ---------------- drawing ---------------- */

  const tile = (f: TileField) => {
    const control = controlOf(f);
    const state = tileState(f, draft, base);
    const was = wasWords(state);
    const value = clean(draft[f.key]);
    const changed = state.was !== null;
    const open = () => setEditing(f.key);
    const isEditing = !readOnly && editing === f.key;

    // An empty dial's "Use 3 · Studio standard 3", on the tile at rest and under its field.
    const useStandard = state.kind === "empty" && state.standard && !readOnly ? (
      <div className="mm-tile__use">
        <button
          type="button"
          className="mm-btn"
          aria-label={`Use ${state.standard} for ${f.label}`}
          disabled={saving}
          onClick={() => {
            setValue(f.key, state.standard!);
            setUsed((u) => ({ ...u, [f.key]: state.standard! }));
            setEditing((e) => (e === f.key ? null : e));
          }}
        >
          Use {state.standard}
        </button>
        <span className="mm-tile__std">Studio standard {state.standard}</span>
      </div>
    ) : null;

    let body: ReactNode;
    if (isEditing) {
      // The tile IS the editor: its field (or a word dial's options) in the
      // one place the value was, so the first digit, which turns "Not set"
      // into a value, never remounts it. Use and the height-band line under it.
      body = (
        <>
          {editorFor(f)}
          {useStandard}
          {suggestLineFor(f)}
        </>
      );
    } else if (readOnly) {
      body =
        state.kind === "empty" ? (
          <span className="mm-tile__notset">Not set</span>
        ) : (
          <span className={NUMERIC.test(value) || value.length <= 2 ? "mm-tile__num" : "mm-tile__word"}>{value}</span>
        );
    } else if (state.kind === "empty") {
      body = (
        <>
          <button type="button" className="mm-tile__empty" aria-label={`${f.label}: not set. Set it`} onClick={open}>
            Not set
          </button>
          {useStandard}
        </>
      );
    } else if (control.kind === "stepper") {
      const down = stepDial(control, value, -1);
      const up = stepDial(control, value, 1);
      body = (
        <div className="mm-stepper">
          <button
            type="button"
            className="mm-step"
            aria-label={`${f.label} down one`}
            disabled={saving || !canStep(control, value, -1)}
            onClick={() => down !== null && setValue(f.key, down)}
          >
            −
          </button>
          <button
            type="button"
            className="mm-tile__val"
            aria-label={`${f.label} ${value}. ${wordButtons(control) ? "Pick one" : "Type a value"}`}
            onClick={open}
          >
            {value}
          </button>
          <button
            type="button"
            className="mm-step"
            aria-label={`${f.label} up one`}
            disabled={saving || !canStep(control, value, 1)}
            onClick={() => up !== null && setValue(f.key, up)}
          >
            +
          </button>
        </div>
      );
    } else {
      body = (
        <div className="mm-tile__wordrow">
          <span className="mm-tile__word">{value}</span>
          <button type="button" className="mm-btn" aria-label={`Change ${f.label}`} onClick={open}>
            Change
          </button>
        </div>
      );
    }

    return (
      <div
        className="mm-tile"
        key={f.key}
        data-dial={f.key}
        data-changed={changed ? "true" : undefined}
        data-editing={isEditing ? "true" : undefined}
      >
        <div className="mm-tile__label">
          {f.letter ? (
            <span className="mm-letter" aria-hidden="true">
              {f.letter}
            </span>
          ) : null}
          <span>{f.label}</span>
        </div>
        {body}
        {was ? <div className="mm-tile__was">{was}</div> : null}
        {state.kind === "value" && state.fixed && !changed ? <div className="mm-tile__fixed">Same for every client</div> : null}
      </div>
    );
  };

  /** The height-band line on an empty dial's editor, with its own Use. */
  const suggestLineFor = (f: TileField) =>
    suggestion && editingField?.key === f.key ? (
      <p className="mm-suggest">
        <span>
          Around {suggestion.heightLabel} here, the most common setting is <b>{suggestion.value}</b> ({suggestion.clients} of{" "}
          {suggestion.bandClients} clients)
        </span>
        <button
          type="button"
          className="mm-btn"
          aria-label={`Use ${suggestion.value} for ${f.label}`}
          disabled={saving}
          onClick={() => {
            setValue(f.key, suggestion.value);
            setUsed((u) => ({ ...u, [f.key]: suggestion.value }));
            setEditing(null);
          }}
        >
          Use {suggestion.value}
        </button>
      </p>
    ) : null;

  /** The tile's editor: a word dial's options, else its field. Keyed by the dial, so another tile's is a fresh one (its field focused). */
  const editorFor = (f: TileField) => {
    // Held from the moment it opened (judgeEditor); the first render's own judgement until then.
    const lock = editorLockNow?.key === f.key ? editorLockNow : judgeEditor(f, draft[f.key] ?? "");
    const control = lock.control;
    const buttons = wordButtons(control);
    if (buttons) {
      return (
        <PositionRow
          key={f.key}
          label={f.label}
          positions={buttons}
          current={draft[f.key]}
          saved={base[f.key]}
          standard={clean(f.ghost) || null}
          kind="options"
          onPick={(v) => {
            // A pick is the whole answer: the tile shows it.
            setValue(f.key, v);
            setEditing(null);
          }}
        />
      );
    }
    // Enter: on to the next empty dial, or the keyboard away on the last.
    const nextKey = nextEmptyDial(fields, draft, f.key);
    // A word dial's chips (the record's values and the standard); the
    // standard's own chip waits while the tile's Use offers it. A number dial
    // (on the number pad) has none: its standard shows only on an empty
    // dial, as Use, never as a chip that turns up once a digit is typed.
    const empty = tileState(f, draft, base).kind === "empty";
    const chips = control.kind === "text" && lock.keypad === "text" ? control.chips.filter((c) => !(empty && c.standard)) : [];
    return (
      <ValueEditor
        key={f.key}
        label={f.label}
        value={draft[f.key] ?? ""}
        keypad={lock.keypad}
        chips={chips}
        onChange={(v) => setValue(f.key, v)}
        onEnter={() => (nextKey ? openEditor(nextKey) : closeEditor())}
        hasNext={nextKey !== null}
      />
    );
  };

  /* ---------------- Use studio standard for all ---------------- */

  // Every empty dial with a studio standard, filled in one tap (two or more:
  // one has its own Use). Still the draft: nothing is written until Save,
  // and each is marked used, so it saves as "suggested" for machine fit.
  const standards = readOnly ? {} : standardsForEmpty(fields, draft);
  const standardKeys = Object.keys(standards);
  const useAll = () => {
    if (saving || standardKeys.length === 0) return;
    setDraft((d) => ({ ...d, ...standards }));
    setUsed((u) => ({ ...u, ...standards }));
    setEditing((e) => (e && standards[e] !== undefined ? null : e));
    setFailedWords(null);
    setResult(null);
  };

  return (
    <section ref={sectionRef} className="mm-blk" data-block="settings" aria-label="Settings">
      <div className="mm-blk-head">
        <h3 className="mm-h">Settings</h3>
        {hold ? (
          /* An open session: where these go, said once, in place of "Last changed" (nobody's yet). */
          <span className="mm-blk-head__note" data-held="">
            {HELD_SETUP_LINE}
          </span>
        ) : lastWords ? (
          lastRow && onLastChanged && !lastFailed ? (
            <button type="button" className="mm-link" data-last-changed="" onClick={() => onLastChanged(lastRow)}>
              {lastWords} ›
            </button>
          ) : (
            <span className="mm-blk-head__note" data-last-changed="">
              {lastWords}
            </span>
          )
        ) : null}
      </div>

      {fields.length === 0 ? (
        <p className="mm-none">This machine has no adjustable settings on its catalog entry.</p>
      ) : (
        <>
          {standardKeys.length >= USE_ALL_FROM ? (
            <div className="mm-useall">
              <button type="button" className="mm-btn" data-use-all="" disabled={saving} onClick={useAll}>
                {USE_ALL_LABEL}
              </button>
            </div>
          ) : null}
          <div className="mm-tiles">
            {fields.map(tile)}
          </div>
          {/* No client yet (an open session): no review of a setting to offer. */}
          {audit && !hold && clientId
            ? flags.map((flag) => (
                <FitLine
                  key={`${flag.key}=${flag.value}`}
                  flag={flag}
                  sentence={fitLineSentence(flag, fields, audit)}
                  clientFirstName={clientFirstName}
                  onAcknowledge={
                    readOnly || !author
                      ? null
                      : () =>
                          acknowledgeFlag({
                            clientId,
                            homeStudioId,
                            machineId,
                            ...fitAckOf(flag),
                            author: { id: author.id, fullName: author.fullName, initials: author.initials },
                          })
                  }
                />
              ))
            : null}
          {dirty ? (
            <ChangeStrip
              changes={changes}
              firstSetup={firstSetup}
              reason={reason}
              otherText={otherText}
              onReason={(chip) => {
                setReason(chip);
                setFailedWords(null);
              }}
              onOtherText={setOtherText}
              onCancel={reset}
              onSave={() => void save()}
              saving={saving}
              failedWords={failedWords}
              asksWhy={hold ? false : undefined}
            />
          ) : result ? (
            <ChangeResult
              words={result.words}
              onUndo={result.undo ? () => void undo(result.undo!) : null}
              onRetry={result.retryUndo ? () => void undo(result.retryUndo!) : null}
              onHealthNote={result.pain && onAddHealthNote ? () => onAddHealthNote(result.pain!) : null}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
