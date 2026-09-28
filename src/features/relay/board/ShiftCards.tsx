import { Check, ChevronRight, Sunrise, Sunset } from "lucide-react";
import type { TaskActions } from "../../studio-tasks/useTaskActions";
import { dayWords } from "../jobs/jobs";
import { DOOR_LABEL, type DoorId } from "./doors";
import type { CloseoutItem, OpeningLine } from "./shift-cards";
import "./board.css";

/**
 * OPENING AND CLOSE OUT, DRAWN — two small cards at the top of the Board,
 * and the one line at the foot of Later today that says when each is (Relay
 * room, Sep 28 2026). The rules are ./shift-cards.ts; the writes are the
 * Board's own (Undo included), so these only draw and call back.
 */

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function OpeningCard({
  lines,
  onGo,
  onFold,
}: {
  lines: OpeningLine[];
  onGo: (go: DoorId | "tracker") => void;
  onFold: () => void;
}) {
  return (
    <section className="rsc" aria-label="Opening">
      <div className="rsc__head">
        <span className="rsc__ic" aria-hidden>
          <Sunrise size={16} />
        </span>
        <h2 className="rbd-h rsc__title">
          Opening<span className="rbd-h__sub">what's waiting</span>
        </h2>
        <button type="button" className="rsc-btn" onClick={onFold}>
          <Check size={16} aria-hidden />
          Got it
        </button>
      </div>
      <ul className="rsc__list">
        {lines.map((l) => (
          <li key={l.key} className="rsc__row">
            <span className="rsc__t">{l.text}</span>
            {l.go && (
              <button type="button" className="rsc-btn rsc-btn--go" onClick={() => onGo(l.go!)}>
                {l.go === "tracker" ? "Tracker" : DOOR_LABEL[l.go]}
                <ChevronRight size={16} aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A Close out row's small print: where it came from and what happens to it. */
function itemWhere(item: CloseoutItem, todayKey: string): string {
  switch (item.kind) {
    case "handed-ask":
      return `From ${firstName(item.from)}${item.request.dueOn ? ` · due ${dayWords(item.request.dueOn, todayKey)}` : ""}`;
    case "taken-ask":
      return "You took it on the Board";
    case "chore":
      return item.from ? `${firstName(item.from)} put your name on it` : "Your name is on it";
    case "job":
      return item.job.dueOn && item.job.dueOn < todayKey ? `A team job · was due ${dayWords(item.job.dueOn, todayKey)}` : "A team job · due today";
    case "todo":
      return item.once ? "Your own, for today" : "Your own · it comes back tomorrow by itself";
  }
}

/** The one way to hand each kind on, in words. Null: nothing to do (a repeating to-do). */
export function handOnWord(item: CloseoutItem): string | null {
  switch (item.kind) {
    case "handed-ask":
      return "Back to the board";
    case "taken-ask":
      return "Hand back";
    case "chore":
      return "Ask the team";
    case "job":
      return "Step off";
    case "todo":
      return item.once ? "Move to tomorrow" : null;
  }
}

export function CloseOutCard({
  items,
  draft,
  opensAt,
  unknown,
  loading,
  todayKey,
  actions,
  onHandOn,
  onFold,
}: {
  items: CloseoutItem[];
  draft: string[];
  /** Set when this is a preview before Close out opens: "4:00 PM". */
  opensAt: string | null;
  /** Some of today's reads failed: the list may be missing things. */
  unknown: boolean;
  loading: boolean;
  todayKey: string;
  actions: TaskActions;
  onHandOn: (item: CloseoutItem) => void;
  onFold: () => void;
}) {
  const shown = items.slice(0, 6);
  return (
    <section className="rsc rsc--close" aria-label="Close out">
      <div className="rsc__head">
        <span className="rsc__ic" aria-hidden>
          <Sunset size={16} />
        </span>
        <h2 className="rbd-h rsc__title">
          Close out
          <span className="rbd-h__sub">{opensAt ? `a preview · it opens at ${opensAt}` : "hand on what's left"}</span>
        </h2>
        <button type="button" className="rsc-btn" onClick={onFold}>
          {opensAt ? (
            "Close"
          ) : (
            <>
              <Check size={16} aria-hidden />
              Got it
            </>
          )}
        </button>
      </div>

      <h3 className="rbd-h rbd-h--small rsc__sub">
        Still open{items.length > 0 && <span className="rbd-h__sub">{items.length}</span>}
      </h3>
      {items.length === 0 ? (
        <p className="rsc__none">
          {loading
            ? "Looking at today's list…"
            : unknown
              ? "Some of today's list couldn't be loaded, so Relay can't say what's left. Check your connection."
              : "Nothing is left open on your list today."}
        </p>
      ) : (
        <ul className="rsc__list">
          {shown.map((item) => {
            const word = handOnWord(item);
            const row = item.kind === "todo" ? item.row : null;
            return (
              <li key={item.key} className="rsc__row">
                {row && (
                  <button
                    type="button"
                    className="pl__check"
                    aria-pressed={false}
                    aria-label={`Mark “${item.title}” done`}
                    disabled={actions.busyIds.has(row.id)}
                    onClick={() => void actions.complete(row)}
                  />
                )}
                <span className="rsc__t">
                  {item.title}
                  <span className="rsc__s">{itemWhere(item, todayKey)}</span>
                </span>
                {word && (
                  <button type="button" className="rsc-btn" onClick={() => onHandOn(item)}>
                    {word}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {items.length > shown.length && <p className="rsc__none">{items.length - shown.length} more on your Tracker.</p>}
      {unknown && items.length > 0 && <p className="rsc__none">Some of today's list couldn't be loaded, so it may be missing things.</p>}

      <h3 className="rbd-h rbd-h--small rsc__sub">
        Your day so far<span className="rbd-h__sub">facts, from what Journey saw</span>
      </h3>
      <p className="rsc__draft">{draft.join(" ")}</p>
    </section>
  );
}

export interface ShiftLinePart {
  key: string;
  card: "opening" | "closeout";
  text: string;
  action: string;
  onAction: () => void;
}

/** "Opening · done at 9:12 AM   Show again" · "Close out · opens at 4:00 PM   Preview". */
export function ShiftCardsLine({ parts }: { parts: ShiftLinePart[] }) {
  if (parts.length === 0) return null;
  return (
    <div className="rsc-line" role="group" aria-label="Opening and Close out">
      {parts.map((p) => (
        <div key={p.key} className="rsc-line__part">
          <span className="rsc__ic" aria-hidden>
            {p.card === "opening" ? <Sunrise size={16} /> : <Sunset size={16} />}
          </span>
          <span className="rsc-line__t">{p.text}</span>
          <button type="button" className="rsc-btn" onClick={p.onAction}>
            {p.action}
          </button>
        </div>
      ))}
    </div>
  );
}
