/**
 * THE ONE SAVE BAR for the record's editors.
 *
 * Client codex, Sep 2026. Record fields are edited on four pages (FORD, Body
 * & Pulse, Goals & Focus, Account) and saved together, the way the old record
 * saved: one write of the changed fields only. The bar appears when something
 * is unsaved and says WHERE, because the trainer may have walked to another
 * page since ("1 unsaved change · FORD · Occupation"); Show goes back to the
 * card, which is still open because pages never unmount.
 *
 * It replaces the old record's permanent, disabled "No Edits Made" button. The
 * shell renders it only for a reader who may edit the record; it draws no bar
 * while there is nothing to save.
 *
 * Sticky to the bottom of the profile's scroller, opaque, and measured with
 * useScrollerPad so it sits on the scroller's edge rather than inside its
 * padding (KNOWN-TRAPS → Layout and CSS).
 *
 * The announcement is a separate, visually hidden live region that is ALWAYS
 * mounted, empty while nothing is unsaved. Screen readers generally stay
 * silent about a live region that arrives already holding its words, so a
 * region inside the bar — which only mounts with the first change — would
 * swallow "1 unsaved change". Mount the SaveBar once and pass the count; don't
 * render it conditionally, or the region goes with it. It sits beside the
 * bar, never wrapped around it: a sticky element sticks only within its
 * parent, so a wrapper would pin the bar to itself.
 */
import { useRef } from "react";
import { useScrollerPad } from "../../client-profile/use-scroller-pad";
import { Btn } from "./primitives";
import { saveBarSentence, type SaveBarPlace } from "./save-bar";

export interface SaveBarProps {
  /** How many fields are unsaved. */
  count: number;
  /** Where they are, in page order (the shell's FIELD_HOME, de-duplicated). */
  where: readonly SaveBarPlace[];
  saving: boolean;
  /** Go to the first place (where[0]). */
  onShow: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export function SaveBar({ count, where, saving, onShow, onDiscard, onSave }: SaveBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = count > 0;
  useScrollerPad(ref, visible);
  const sentence = visible ? saveBarSentence(count, where) : "";
  return (
    <>
      <span className="sr-only" role="status" aria-live="polite" data-cx-savebar-live="">
        {sentence}
      </span>
      {visible ? (
        <div ref={ref} className="cx-savebar" role="region" aria-label="Unsaved changes">
          <span className="cx-savebar__text">{sentence}</span>
          <div className="cx-savebar__acts">
            <Btn variant="quiet" onClick={onShow} disabled={where.length === 0}>
              Show
            </Btn>
            <Btn onClick={onDiscard} disabled={saving}>
              Discard
            </Btn>
            <Btn variant="solid" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Btn>
          </div>
        </div>
      ) : null}
    </>
  );
}
