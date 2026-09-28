/**
 * THE ROW SHAPES Operations' lists are built from, so every list reads as
 * one screen (Today's brief, Changes, the attendance watch, the 60-day
 * review).
 *
 *   Rows            claim + proof, the whole row opens the client.
 *   ActionRows      the same, with buttons on the right (Acknowledge,
 *                   Snooze, Dismiss, Got it) — the name opens the client,
 *                   the buttons act, nothing is nested inside a button.
 *   SnoozeChooser   "3 days · 1 week · 2 weeks · pick a day".
 *   Line            one tappable line that opens a page.
 *
 * The foldable panels and the Needs-you chip strip went with the Overview's
 * eight panels in the redesign's Operations room (Sep 28 2026): Today is one
 * column of sections now (brief-pieces.tsx).
 */
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { AdminBadge, AdminButton, AdminEmpty } from "../primitives";
import { addDays } from "../../client-history/model";
import type { OverviewRow, OverviewTone } from "./questions";

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

const TONE_BADGE: Record<OverviewTone, "alert" | "warn" | "neutral"> = { alert: "alert", warn: "warn", info: "neutral" };
const TONE_WORD: Record<OverviewTone, string> = { alert: "Now", warn: "Soon", info: "Note" };

export function Rows({ rows, total, onOpenClient, empty, moreLabel = "on the tab" }: { rows: OverviewRow[]; total: number; onOpenClient?: (id: string) => void; empty: string; moreLabel?: string }) {
  if (rows.length === 0) {
    return empty ? (
      <div className="p-4">
        <AdminEmpty title={empty} />
      </div>
    ) : null;
  }
  return (
    <ul className="adm-ov__rows">
      {rows.map((r) => (
        <li key={`${r.clientId}:${r.sentence}`} className="adm-ov__row">
          <button type="button" className="adm-ov__row-btn" onClick={() => onOpenClient?.(r.clientId)} disabled={!onOpenClient}>
            <span className="adm-ov__head">
              <span className="adm-ov__name">{r.name}</span>
              <AdminBadge tone={TONE_BADGE[r.tone]}>{r.badge ?? TONE_WORD[r.tone]}</AdminBadge>
            </span>
            <span className="adm-ov__sentence">{r.sentence}</span>
            {r.proof && <span className="adm-ov__proof">{r.proof}</span>}
          </button>
        </li>
      ))}
      {total > rows.length && <li className="adm-ov__more">and {total - rows.length} more {moreLabel}</li>}
    </ul>
  );
}

export interface ActionRowItem {
  key: string;
  clientId: string | null;
  name: string;
  sentence: string;
  proof?: string;
  tone?: OverviewTone;
  badge?: string;
  /** Rendered on the right; the row's own buttons. */
  actions?: ReactNode;
  /** Rendered under the row when set — a snooze chooser, say. */
  below?: ReactNode;
}

export function ActionRows({ rows, total, onOpenClient, empty, moreLabel = "on the full list" }: { rows: ActionRowItem[]; total?: number; onOpenClient?: (id: string) => void; empty: string; moreLabel?: string }) {
  if (rows.length === 0) {
    return empty ? (
      <div className="p-4">
        <AdminEmpty title={empty} />
      </div>
    ) : null;
  }
  return (
    <ul className="adm-ov__rows">
      {rows.map((r) => (
        <li key={r.key} className="adm-ov__row adm-ov__row--actions">
          <div className="adm-ov__row-main">
            <button type="button" className="adm-ov__row-btn" onClick={() => r.clientId && onOpenClient?.(r.clientId)} disabled={!r.clientId || !onOpenClient}>
              <span className="adm-ov__head">
                <span className="adm-ov__name">{r.name}</span>
                {r.tone && <AdminBadge tone={TONE_BADGE[r.tone]}>{r.badge ?? TONE_WORD[r.tone]}</AdminBadge>}
                {!r.tone && r.badge && <AdminBadge tone="neutral">{r.badge}</AdminBadge>}
              </span>
              <span className="adm-ov__sentence">{r.sentence}</span>
              {r.proof && <span className="adm-ov__proof">{r.proof}</span>}
            </button>
            {r.actions && <div className="adm-ov__row-actions">{r.actions}</div>}
          </div>
          {r.below && <div className="adm-ov__row-below">{r.below}</div>}
        </li>
      ))}
      {typeof total === "number" && total > rows.length && <li className="adm-ov__more">and {total - rows.length} more {moreLabel}</li>}
    </ul>
  );
}

/* ------------------------------------------------------------------ *
 * Snooze
 * ------------------------------------------------------------------ */

export function SnoozeChooser({ today, onPick, onCancel }: { today: string; onPick: (untilDay: string) => void; onCancel: () => void }) {
  const [day, setDay] = useState("");
  return (
    <div className="adm-ov__snooze" role="group" aria-label="Remind me again">
      <span className="adm-ov__snooze-label">Remind me again in</span>
      <AdminButton size="sm" onClick={() => onPick(addDays(today, 3))}>
        3 days
      </AdminButton>
      <AdminButton size="sm" onClick={() => onPick(addDays(today, 7))}>
        1 week
      </AdminButton>
      <AdminButton size="sm" onClick={() => onPick(addDays(today, 14))}>
        2 weeks
      </AdminButton>
      <label className="adm-ov__snooze-date">
        <span className="sr-only">On a day</span>
        <input type="date" className="adm-input" value={day} min={addDays(today, 1)} aria-label="Remind me on this day" onChange={(e) => setDay(e.target.value)} />
      </label>
      <AdminButton size="sm" variant="primary" disabled={!day || day <= today} onClick={() => day && onPick(day)}>
        On that day
      </AdminButton>
      <AdminButton size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </AdminButton>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Lines
 * ------------------------------------------------------------------ */

export function Line({ icon, label, text, tone, onOpen }: { icon: ReactNode; label: string; text: string; tone: "alert" | "warn" | "neutral"; onOpen?: () => void }) {
  const inner = (
    <>
      <span className={`adm-ov__line-icon adm-ov__line-icon--${tone}`}>{icon}</span>
      <span className="adm-ov__line-body">
        <span className="adm-ov__line-label">{label}</span>
        <span className="adm-ov__line-text">{text}</span>
      </span>
      {onOpen && <ChevronRight className="w-4 h-4 adm-ov__line-chev" />}
    </>
  );
  return onOpen ? (
    <button type="button" className="adm-ov__line adm-ov__line--tappable" onClick={onOpen}>
      {inner}
    </button>
  ) : (
    <div className="adm-ov__line">{inner}</div>
  );
}
