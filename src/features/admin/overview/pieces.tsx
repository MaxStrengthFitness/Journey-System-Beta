/**
 * THE OVERVIEW'S PIECES — the row shapes and the collapsible panel every
 * panel on the page is built from, so eight panels read as one screen.
 *
 *   OverviewPanel   an AdminPanel that can fold to its headline sentence,
 *                   remembered per device (localStorage); the subtitle IS
 *                   the one-line summary, so a folded panel still answers.
 *   Rows            claim + proof, the whole row opens the client.
 *   ActionRows      the same, with buttons on the right (Acknowledge,
 *                   Snooze, Dismiss, Got it) — the name opens the client,
 *                   the buttons act, nothing is nested inside a button.
 *   SnoozeChooser   "3 days · 1 week · 2 weeks · pick a day".
 *   Line            one tappable line that opens a tab.
 *   NeedsYou        the count chips at the top — the ten-second read.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminBadge, AdminButton, AdminEmpty, AdminPanel } from "../primitives";
import { addDays } from "../../client-history/model";
import type { OverviewRow, OverviewTone } from "./questions";

/* ------------------------------------------------------------------ *
 * Folding
 * ------------------------------------------------------------------ */

const FOLD_KEY = "journey.operations.overview.folded";

function readFolded(): Set<string> {
  try {
    const raw = localStorage.getItem(FOLD_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeFolded(set: Set<string>) {
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify([...set]));
  } catch {
    /* a private window forgets; the page still works */
  }
}

/** Which panels this device has folded. One hook for the page; panels read it. */
export function useFolded(): { folded: Set<string>; toggle: (id: string) => void; unfold: (id: string) => void } {
  const [folded, setFolded] = useState<Set<string>>(() => readFolded());
  useEffect(() => {
    writeFolded(folded);
  }, [folded]);
  return {
    folded,
    toggle: (id) =>
      setFolded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    unfold: (id) =>
      setFolded((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      }),
  };
}

export interface OverviewPanelProps {
  id: string;
  title: string;
  icon?: ReactNode;
  /** The headline sentence — what the panel says when folded. */
  sentence: string;
  count?: number;
  tone?: "alert" | "warn" | "neutral";
  actions?: ReactNode;
  folded: boolean;
  onToggle: () => void;
  /** Left or right column on a wide screen; stacked in DOM order below it. */
  column: "left" | "right";
  children: ReactNode;
}

export function OverviewPanel({ id, title, icon, sentence, count, tone = "neutral", actions, folded, onToggle, column, children }: OverviewPanelProps) {
  return (
    <div id={`ov-${id}`} className={cn("adm-ov__cell", column === "left" ? "adm-ov__cell--left" : "adm-ov__cell--right")}>
      <AdminPanel
        title={title}
        icon={icon}
        subtitle={sentence}
        actions={
          <div className="adm-ov__panel-actions">
            {typeof count === "number" && count > 0 && <AdminBadge tone={tone === "neutral" ? "neutral" : tone}>{count}</AdminBadge>}
            {!folded && actions}
            <AdminButton size="sm" variant="ghost" iconOnly aria-label={folded ? `Open ${title}` : `Fold ${title}`} aria-expanded={!folded} onClick={onToggle}>
              {folded ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </AdminButton>
          </div>
        }
        flush
        className={cn("adm-ov__panel", folded && "adm-ov__panel--folded")}
      >
        {folded ? null : children}
      </AdminPanel>
    </div>
  );
}

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
              <AdminBadge tone={TONE_BADGE[r.tone]}>{TONE_WORD[r.tone]}</AdminBadge>
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
 * Lines and the Needs-you strip
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

export interface NeedChip {
  id: string;
  count: number;
  label: string;
  tone: "alert" | "warn" | "neutral";
}

export function NeedsYou({ chips, onPick }: { chips: NeedChip[]; onPick: (id: string) => void }) {
  const live = chips.filter((c) => c.count > 0);
  const total = live.reduce((n, c) => n + c.count, 0);
  return (
    <div className="adm-ov__needs" role="region" aria-label="Needs you">
      <span className="adm-ov__needs-title">
        {total === 0 ? "Nothing needs you right now" : `Needs you · ${total}`}
      </span>
      {live.length > 0 && (
        <div className="adm-ov__needs-chips">
          {live.map((c) => (
            <button key={c.id} type="button" className={cn("adm-ov__chip", `adm-ov__chip--${c.tone}`)} onClick={() => onPick(c.id)}>
              <span className="adm-ov__chip-count">{c.count}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
