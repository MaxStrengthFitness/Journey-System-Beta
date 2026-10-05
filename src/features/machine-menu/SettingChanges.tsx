/**
 * THE MACHINE MENU — Setting changes, the folded row at the foot of the card.
 *
 * It replaces the old Change history card, which held a live listener open,
 * stopped at twelve rows, never showed the old value, mixed in every weight
 * row and went silent when its read failed. Now (machine menu design §C,
 * "The two folded rows"):
 *
 *   - it reads nothing itself: the card's ONE read of the setting changes on
 *     open (useSettingHistory) is passed in, shared with the chart's set-up
 *     lane and the Settings heading's "Last changed";
 *   - every settings and first set-up row, old → new · reason · who · day,
 *     newest first, a Save and its Undo both; and the starting-weight
 *     changes the green % counts from (setting-changes.ts);
 *   - it never hides itself: "Couldn't load setting changes · Try again";
 *   - its footer says where the weights that aren't listed live.
 */
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { SETTING_CHANGES_WORDS, settingChangeRows, settingChangesTitle } from "./setting-changes";
import type { SettingRow } from "./setting-history";
import type { SettingHistoryState } from "./useSettingHistory";
import "./machine-menu.css";

export interface SettingChangesProps {
  rows: readonly SettingRow[] | null;
  state: SettingHistoryState;
  /** Read again. */
  onRetry?: () => void;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
  defaultOpen?: boolean;
}

export function SettingChanges({ rows, state, onRetry, today, defaultOpen = false }: SettingChangesProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const list = rows && state !== "failed" ? settingChangeRows(rows, today) : null;
  const title = settingChangesTitle(list ? list.length : null);
  return (
    <section className="mm-blk" data-block="changes">
      <button type="button" className="mm-drawer" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <ChevronDown size={20} className="mm-drawer__chev" aria-hidden="true" />
      </button>
      {open ? (
        <div className="mm-drawer__body" id={bodyId}>
          {state === "loading" ? <p className="mm-none">{SETTING_CHANGES_WORDS.loading}</p> : null}
          {state === "failed" ? (
            <p className="mm-chg__failed" role="alert">
              <span>{SETTING_CHANGES_WORDS.failed}</span>
              {onRetry ? (
                <button type="button" className="mm-btn" onClick={onRetry}>
                  Try again
                </button>
              ) : null}
            </p>
          ) : null}
          {state === "cache-only" ? <p className="mm-none">{SETTING_CHANGES_WORDS.cacheOnly}</p> : null}
          {list && list.length === 0 ? <p className="mm-none">{SETTING_CHANGES_WORDS.none}</p> : null}
          {list && list.length > 0 ? (
            <ul className="mm-chg">
              {list.map((r) => (
                <li key={r.id} className="mm-chg__row">
                  <b className="mm-chg__what">{r.what}</b>
                  {r.detail ? <span className="mm-chg__detail">{r.detail}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mm-chg__foot">{SETTING_CHANGES_WORDS.foot}</p>
        </div>
      ) : null}
    </section>
  );
}
