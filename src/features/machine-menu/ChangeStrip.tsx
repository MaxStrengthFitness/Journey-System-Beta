/**
 * THE MACHINE MENU — the change strip under the tiles.
 *
 * Open only while a change to the settings is unsaved (machine menu design
 * §C, "Settings: changing Seat 4 → 5"), on the live fill, directly under the
 * tiles:
 *
 *   Seat 4 → 5   Why? (optional)
 *   [Comfort or fit] [Range of motion] [Alignment] [Pain or discomfort]
 *   [Matches the guide] [Other…]
 *   [Cancel]                                         [Save Seat 5]
 *
 * The reason is ASKED, never required: no chip still saves, and
 * `saveSettings` writes its own default (docs/ARCHITECTURE.md §1.11, "never
 * block a save"). A first set-up reads "Seat — → 4" and asks no "Why?".
 * Save is the one loud action, the logo orange with navy words (`--eq-go` /
 * `--eq-go-on`); Cancel is quiet, on the left, so the two are never under
 * the same thumb.
 *
 * After Save the strip turns into what became of it (`ChangeResult`): "Seat 5
 * saved · Undo" (Undo for ten seconds), "… saved on this iPad · it sends when
 * the Wi-Fi is back · Undo", or "Couldn't save Seat 5 · Try again"; after a
 * save for pain or discomfort, one more button: Add a Health note.
 */
import { AlertCircle } from "lucide-react";
import { useId } from "react";
import { REASON_CHIPS, OTHER_REASON, WHY_PROMPT, asksWhy, changeWords, saveLabel, type ReasonChip } from "./setting-draft";
import type { SettingPair } from "./setting-history";
import { HEALTH_NOTE_BUTTON } from "./note-target";
import "./machine-menu.css";

export interface ChangeStripProps {
  /** What a save would write (`draftChanges`). */
  changes: readonly SettingPair[];
  firstSetup: boolean;
  reason: ReasonChip | null;
  otherText: string;
  onReason: (chip: ReasonChip | null) => void;
  onOtherText: (text: string) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  /** "Couldn't save Seat 5" after a refused save; the draft is kept, and Save tries again. */
  failedWords?: string | null;
  /**
   * Whether "Why?" is asked: by default every change but a first set-up. An
   * open session's set-up, kept on the session until its client is chosen
   * (the open session round, Oct 9 2026), asks none: nothing would carry it.
   */
  asksWhy?: boolean;
}

export function ChangeStrip({
  changes,
  firstSetup,
  reason,
  otherText,
  onReason,
  onOtherText,
  onCancel,
  onSave,
  saving,
  failedWords = null,
  asksWhy: asks,
}: ChangeStripProps) {
  const otherId = useId();
  const why = asks ?? asksWhy(firstSetup);
  return (
    <div className="mm-strip" data-strip="edit">
      <p className="mm-strip__line">
        <b className="mm-strip__what">{changeWords(changes)}</b>
        {why ? <span className="mm-strip__why">{WHY_PROMPT}</span> : null}
      </p>
      {why ? (
        <div className="mm-choices" role="group" aria-label="Reason, optional">
          {REASON_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="mm-choice"
              aria-pressed={reason === chip}
              // A second tap on the picked reason takes it back: no reason still saves.
              onClick={() => onReason(reason === chip ? null : chip)}
            >
              {chip}
            </button>
          ))}
        </div>
      ) : null}
      {why && reason === OTHER_REASON ? (
        <label className="mm-field" htmlFor={otherId}>
          <span>Other reason</span>
          <input
            id={otherId}
            className="mm-field__input"
            value={otherText}
            autoComplete="off"
            onChange={(e) => onOtherText(e.target.value)}
          />
        </label>
      ) : null}
      {failedWords ? (
        <p className="mm-strip__alert" role="alert">
          <AlertCircle size={18} className="mm-g--alert" aria-hidden="true" />
          <span>{failedWords}. Your change is still here.</span>
        </p>
      ) : null}
      <div className="mm-strip__btns">
        <button type="button" className="mm-quiet" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="mm-save" onClick={onSave} disabled={saving}>
          {failedWords ? "Try again" : saveLabel(changes, firstSetup)}
        </button>
      </div>
    </div>
  );
}

export interface ChangeResultProps {
  /** "Seat 5 saved", "Seat back to 4", "Couldn't undo Seat 5" — the words, without their button. */
  words: string;
  /** Undo, while its ten seconds last. */
  onUndo?: (() => void) | null;
  /** Try again, after a refused Undo. */
  onRetry?: (() => void) | null;
  /** After a save for pain or discomfort: Add a Health note. */
  onHealthNote?: (() => void) | null;
}

export function ChangeResult({ words, onUndo = null, onRetry = null, onHealthNote = null }: ChangeResultProps) {
  return (
    <div className="mm-strip" data-strip="done" role="status">
      <p className="mm-strip__msg">
        <span>{words}</span>
        {onUndo ? (
          <button type="button" className="mm-btn" onClick={onUndo}>
            Undo
          </button>
        ) : null}
        {onRetry ? (
          <button type="button" className="mm-btn" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        {onHealthNote ? (
          <button type="button" className="mm-btn" onClick={onHealthNote}>
            {HEALTH_NOTE_BUTTON}
          </button>
        ) : null}
      </p>
    </div>
  );
}
