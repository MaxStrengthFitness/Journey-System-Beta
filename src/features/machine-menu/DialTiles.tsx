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
 *   - Tapping the number opens a row of positions (PositionRow) or a field;
 *     tapping an empty tile opens its editor, with the height-band line
 *     ("Around 5'7" here, the most common setting is 6 …") and its own Use,
 *     word for word as the Settings card said it, when the client's height
 *     is on file — the one place `machineTrends/{id}` is read, as before.
 *   - A changed tile is blue with "was 4" under it, and the change strip
 *     opens (ChangeStrip): "Seat 4 → 5", a reason asked and never required,
 *     Cancel and Save Seat 5. Seat 4 → 5 is two taps once the card is open.
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
import { nextSettings } from "../machine-fit/settings-write";
import type { FitFactors, SettingSource } from "../machine-fit/types";
import { readStoredSpec } from "../machine-fit/ui/stored-spec";
import { FINISH_WAIT_MS, settleOrQueue } from "../session-record/finish-wait";
import { ChangeResult, ChangeStrip } from "./ChangeStrip";
import { canStep, dialControl, recordValuesFor, stepDial, studioValuesFor, wordChips, type DialControl } from "./dial-control";
import { FitLine } from "./FitLine";
import { fitAckOf, fitLineSentence, menuAudit, rareStudioFlags } from "./fit-line";
import { PositionRow, ValueEditor } from "./PositionRow";
import {
  UNDO_MS,
  asksWhy,
  changeWords,
  draftChanges,
  isDraftDirty,
  isFirstSetup,
  offersHealthNote,
  reasonOf,
  rebaseDraft,
  refusedLaterWords,
  saveOutcomeWords,
  seedDraft,
  suggestedSources,
  tileState,
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
import { sayAfterClose, whenRefusedLater } from "./late-refusal";
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
}

type Values = Record<string, string>;

/** What Undo writes back, and what it says. */
interface UndoState {
  payload: UndoPayload;
  changes: SettingPair[];
  firstSetup: boolean;
  sources: Record<string, SettingSource> | null;
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
}: DialTilesProps) {
  // What this card wrote, until the settings document's listener says so too.
  const [written, setWritten] = useState<Values | null>(null);
  const base: Readonly<Record<string, string>> = written ?? saved;
  const [draft, setDraft] = useState<Values>(() => seedDraft(fields, saved));
  // What the draft is measured against now, and the seed it was last given.
  const seed = seedDraft(fields, base);
  const seedKey = JSON.stringify(seed);
  const [seededFrom, setSeededFrom] = useState<{ key: string; seed: Values }>(() => ({ key: seedKey, seed }));
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
  const [reason, setReason] = useState<ReasonChip | null>(null);
  const [otherText, setOtherText] = useState("");
  // Dial key → the value Use put there: saved as "suggested" while it stands.
  const [used, setUsed] = useState<Values>({});
  const [saving, setSaving] = useState(false);
  const [failedWords, setFailedWords] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // Whether the card is still open, for a refusal that comes after it closed.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

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
  const controlOf = (f: TileField): DialControl =>
    dialControl(f, {
      current: draft[f.key],
      saved: base[f.key],
      studioValues: fit && fit.status === "ready" ? studioValuesFor(f, studioRows) : null,
      recordValues: recordValuesFor(f, { snapshots, rows: history }),
    });

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

  const save = async () => {
    if (!author || readOnly || saving || changes.length === 0) return;
    const wasFirst = firstSetup;
    const why = asksWhy(wasFirst) ? reasonOf(reason, otherText) : "";
    const before: Values = { ...base };
    const sent: Values = { ...draft };
    const saveChanges = changes;
    setSaving(true);
    setFailedWords(null);
    let write: Promise<SaveSettingsResult | null>;
    try {
      write = saveSettings({
        clientId,
        machineId,
        fields: [...fields],
        saved: before,
        draft: sent,
        reason: why,
        author,
        isInitialSetup: wasFirst,
        machineName,
        journal,
        existingSources: sources,
        changedSources: suggestedSources(used, sent),
        homeStudioId,
        existingAcks: fitAcks,
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
      setFailedWords(saveOutcomeWords(saveChanges, wasFirst, "failed", false));
      return;
    }
    if (outcome.kind === "queued") {
      // Refused after "saved on this iPad": the listener puts the old values
      // back; the strip takes back its Undo and brings the change back with
      // Try again (unless another change is under way), or the toast says it.
      whenRefusedLater(write, (err) => {
        console.error("[machine menu] settings refused after they were saved on this iPad", err);
        if (!live.current) {
          sayAfterClose(refusedLaterWords(machineName, clientFirstName, saveChanges, wasFirst));
          return;
        }
        setResult(null);
        if (!dirtyRef.current) holdDraft(before, sent);
        setFailedWords(saveOutcomeWords(saveChanges, wasFirst, "failed", false));
      });
    }
    // The map as written: the database's answer, or (queued) the same map
    // saveSettings builds, so Undo puts back exactly what changed.
    const after = outcome.kind === "saved" && outcome.value ? outcome.value.settings : nextSettings([...fields], before, sent);
    const kind: SaveOutcome = outcome.kind === "queued" && onlineNow ? "saved" : outcome.kind;
    holdDraft(after, seedDraft(fields, after));
    setReason(null);
    setOtherText("");
    setUsed({});
    setEditing(null);
    setResult({
      words: saveOutcomeWords(saveChanges, wasFirst, kind, false),
      undo: {
        payload: undoPayload(fields, before, after),
        changes: saveChanges,
        firstSetup: wasFirst,
        sources: outcome.kind === "saved" && outcome.value ? outcome.value.sources : null,
      },
      retryUndo: null,
      pain: offersHealthNote(why) ? changeWords(saveChanges) : null,
    });
    if (outcome.kind === "queued" && onlineNow) {
      const shown = saveOutcomeWords(saveChanges, wasFirst, "saved", false);
      whenStillOut(write, () => {
        if (!live.current) return;
        setResult((r) => (r && r.words === shown ? { ...r, words: saveOutcomeWords(saveChanges, wasFirst, "queued", false) } : r));
      });
    }
    onSaved?.();
  };

  const undo = async (u: UndoState) => {
    if (!author || readOnly) return;
    setResult(null);
    let write: Promise<SaveSettingsResult | null>;
    try {
      write = saveSettings({
        clientId,
        machineId,
        fields: [...fields],
        author,
        machineName,
        journal,
        existingSources: u.sources ?? sources,
        homeStudioId,
        existingAcks: fitAcks,
        ...u.payload,
      });
    } catch (err) {
      write = Promise.reject(err);
    }
    // The tiles show the old values straight away; a refusal puts the save's back.
    holdDraft(u.payload.draft, seedDraft(fields, u.payload.draft));
    // Never waited on, as a save isn't (R9).
    const onlineNow = isOnline();
    const outcome = await settleOrQueue(write, onlineNow, 0);
    const refused = () => {
      if (!dirtyRef.current) holdDraft(u.payload.saved, seedDraft(fields, u.payload.saved));
      setResult({ words: undoOutcomeWords(u.changes, u.firstSetup, "failed"), undo: null, retryUndo: u, pain: null });
    };
    if (outcome.kind === "failed") {
      console.error("[machine menu] undo not saved", outcome.error);
      refused();
      return;
    }
    if (outcome.kind === "queued") {
      // Refused after "on this iPad": the same as a refusal in the moment, or the toast once the card has closed.
      whenRefusedLater(write, (err) => {
        console.error("[machine menu] undo refused after it was saved on this iPad", err);
        if (!live.current) {
          sayAfterClose(refusedLaterWords(machineName, clientFirstName, u.changes, u.firstSetup, true));
          return;
        }
        refused();
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
    const open = () => setEditing((e) => (e === f.key ? null : f.key));

    let body: ReactNode;
    if (readOnly) {
      body =
        state.kind === "empty" ? (
          <span className="mm-tile__notset">Not set</span>
        ) : (
          <span className={NUMERIC.test(value) || value.length <= 2 ? "mm-tile__num" : "mm-tile__word"}>{value}</span>
        );
    } else if (state.kind === "empty") {
      body = (
        <>
          <button type="button" className="mm-tile__empty" aria-expanded={editing === f.key} aria-label={`${f.label}: not set. Set it`} onClick={open}>
            Not set
          </button>
          {state.standard ? (
            <div className="mm-tile__use">
              <button
                type="button"
                className="mm-btn"
                aria-label={`Use ${state.standard} for ${f.label}`}
                disabled={saving}
                onClick={() => {
                  setValue(f.key, state.standard!);
                  setUsed((u) => ({ ...u, [f.key]: state.standard! }));
                }}
              >
                Use {state.standard}
              </button>
              <span className="mm-tile__std">Studio standard {state.standard}</span>
            </div>
          ) : null}
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
            aria-label={`${f.label} ${value}. ${control.positions ? "Pick a position" : "Type a value"}`}
            aria-expanded={editing === f.key}
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
          <button type="button" className="mm-btn" aria-expanded={editing === f.key} aria-label={`Change ${f.label}`} onClick={open}>
            Change
          </button>
        </div>
      );
    }

    return (
      <div className="mm-tile" key={f.key} data-dial={f.key} data-changed={changed ? "true" : undefined}>
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

  const editor = () => {
    if (readOnly || !editingField) return null;
    const f = editingField;
    const control = controlOf(f);
    const standard = clean(f.ghost) || null;
    const done = () => setEditing(null);
    const pick = (v: string) => setValue(f.key, v);
    const suggestLine = suggestion ? (
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
            pick(suggestion.value);
            setUsed((u) => ({ ...u, [f.key]: suggestion.value }));
          }}
        >
          Use {suggestion.value}
        </button>
      </p>
    ) : null;
    if (control.kind === "options") {
      return (
        <>
          <PositionRow label={f.label} positions={control.options} current={draft[f.key]} saved={base[f.key]} standard={standard} kind="options" onPick={pick} onDone={done} />
          {suggestLine}
        </>
      );
    }
    if (control.kind === "stepper" && control.positions) {
      return (
        <>
          <PositionRow label={f.label} positions={control.positions} current={draft[f.key]} saved={base[f.key]} standard={standard} onPick={pick} onDone={done} />
          {suggestLine}
        </>
      );
    }
    return (
      <>
        <ValueEditor
          label={f.label}
          value={draft[f.key] ?? ""}
          keypad={control.kind === "stepper" ? control.keypad : "text"}
          chips={control.kind === "text" ? control.chips : wordChips(f, [])}
          onChange={pick}
          onDone={done}
        />
        {suggestLine}
      </>
    );
  };

  return (
    <section className="mm-blk" data-block="settings" aria-label="Settings">
      <div className="mm-blk-head">
        <h3 className="mm-h">Settings</h3>
        {lastWords ? (
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
          <div className="mm-tiles">
            {fields.map(tile)}
          </div>
          {editor()}
          {audit
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
