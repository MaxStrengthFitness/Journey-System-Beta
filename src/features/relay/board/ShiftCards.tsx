import { useEffect, useState } from "react";
import { BookOpen, Check, ChevronRight, Lock, Sunrise, Sunset } from "lucide-react";
import type { TaskActions } from "../../studio-tasks/useTaskActions";
import { useUnsavedChanges } from "../../unsaved-changes";
import { dayWords } from "../jobs/jobs";
import { CARRY_MAX, CARRY_TEXT_MAX, LINE_TEXT_MAX, cleanCarry, cleanLine, type DayLine, type DayLog } from "../notes/day-log";
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
  carry,
  onSaveCarry,
}: {
  lines: OpeningLine[];
  onGo: (go: DoorId | "tracker") => void;
  onFold: () => void;
  /**
   * The things to carry today, from today's day log (the Journal, the
   * second wave); null while it loads or couldn't be read.
   */
  carry?: string[] | null;
  /** Keep them in today's day log (private). Absent: no day log here. */
  onSaveCarry?: (lines: string[]) => Promise<void>;
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
      {lines.length > 0 && (
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
      )}
      {onSaveCarry && <CarryToday carry={carry ?? null} onSave={onSaveCarry} />}
    </section>
  );
}

/**
 * "Things to carry today" (the Journal, the second wave, Sep 28 2026): up to
 * three short lines a trainer chooses at the start of the day, kept in
 * today's day log, private to them. Close out shows them again.
 */
function CarryToday({ carry, onSave }: { carry: string[] | null; onSave: (lines: string[]) => Promise<void> }) {
  const saved = carry ?? [];
  const [editing, setEditing] = useState(saved.length === 0);
  const [lines, setLines] = useState<string[]>(() => padCarry(saved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What was kept arrived (or changed on another iPad): follow it while nothing is typed.
  const savedKey = saved.join("\n");
  useEffect(() => {
    setLines((cur) => (cleanCarry(cur).length === 0 ? padCarry(saved) : cur));
    if (saved.length > 0) setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  const dirty = editing && cleanCarry(lines).join("\n") !== saved.join("\n") && cleanCarry(lines).length > 0;
  const leave = useUnsavedChanges(dirty, "the things to carry today", { onDiscard: () => setLines(padCarry(saved)) });

  const keep = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(cleanCarry(lines));
      leave.release();
      setEditing(false);
    } catch (err) {
      console.warn("[relay] carry not kept:", err);
      setError("Couldn't keep them. Check your connection; your lines are still here.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rsc__carry">
      <h3 className="rbd-h rbd-h--small rsc__sub">
        Things to carry today<span className="rbd-h__sub">up to {CARRY_MAX}, for you</span>
      </h3>
      {carry === null ? (
        <p className="rsc__none">Looking for what you chose earlier…</p>
      ) : !editing ? (
        <>
          <ul className="rsc__carry-list">
            {saved.map((c, i) => (
              <li key={i} className="rsc__carry-line">
                {c}
              </li>
            ))}
          </ul>
          <button type="button" className="rsc-btn" onClick={() => setEditing(true)}>
            Change them
          </button>
        </>
      ) : (
        <>
          {lines.map((l, i) => (
            <label key={i} className="rsc__field">
              <span className="rsc__field-l">{i === 0 ? "One thing" : i === 1 ? "Another" : "And one more"}</span>
              <input
                className="rsc__input"
                value={l}
                maxLength={CARRY_TEXT_MAX}
                placeholder={i === 0 ? "Slow down at the door" : ""}
                onChange={(e) => setLines((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </label>
          ))}
          {error && (
            <p className="rsc__none" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="rsc-btn rsc-btn--go" disabled={busy || cleanCarry(lines).length === 0} onClick={() => void keep()}>
            {busy ? "Keeping…" : "Keep for today"}
          </button>
        </>
      )}
      <p className="rsc__private">
        <Lock size={13} aria-hidden />
        Only you see these. They go in today's day log, in your Journal.
      </p>
    </div>
  );
}

function padCarry(lines: readonly string[]): string[] {
  return [...lines, "", "", ""].slice(0, CARRY_MAX);
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
  dayLog,
  onSaveDay,
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
  /** Today's day log (the Journal, the second wave): undefined while it loads, null when there is none yet. */
  dayLog?: DayLog | null;
  /** Save the day to the journal: the facts above and one line for yourself. Absent: no day log here. */
  onSaveDay?: (line: DayLine | null) => Promise<void>;
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
      {onSaveDay && <DayLineForm dayLog={dayLog} onSave={onSaveDay} />}
    </section>
  );
}

/**
 * One line for yourself, and "Save to my journal" (the Journal, the second
 * wave, Sep 28 2026): What happened? So what? Now what? — optional — saved
 * with the day's facts as today's day log. Private to the trainer, never
 * shown to leaders.
 */
function DayLineForm({ dayLog, onSave }: { dayLog: DayLog | null | undefined; onSave: (line: DayLine | null) => Promise<void> }) {
  const savedLine = dayLog?.line ?? null;
  const [line, setLine] = useState<DayLine>(() => savedLine ?? { what: "", soWhat: "", nowWhat: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedKey = savedLine ? `${savedLine.what}|${savedLine.soWhat}|${savedLine.nowWhat}` : "";
  useEffect(() => {
    setLine((cur) => (cleanLine(cur) ? cur : savedLine ?? { what: "", soWhat: "", nowWhat: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  const typed = cleanLine(line);
  const dirty = JSON.stringify(typed) !== JSON.stringify(cleanLine(savedLine)) && !done;
  const leave = useUnsavedChanges(dirty && Boolean(typed), "your line for the day", {
    onDiscard: () => setLine(savedLine ?? { what: "", soWhat: "", nowWhat: "" }),
  });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(typed);
      leave.release();
      setDone(true);
    } catch (err) {
      console.warn("[relay] day log not saved:", err);
      setError("Couldn't save it. Check your connection; what you wrote is still here.");
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof DayLine, label: string, placeholder: string) => (
    <label className="rsc__field">
      <span className="rsc__field-l">{label}</span>
      <input
        className="rsc__input"
        value={line[key]}
        maxLength={LINE_TEXT_MAX}
        placeholder={placeholder}
        onChange={(e) => {
          setDone(false);
          setLine((cur) => ({ ...cur, [key]: e.target.value }));
        }}
      />
    </label>
  );

  return (
    <div className="rsc__carry">
      {dayLog && dayLog.carry.length > 0 && (
        <>
          <h3 className="rbd-h rbd-h--small rsc__sub">What you chose to carry</h3>
          <ul className="rsc__carry-list">
            {dayLog.carry.map((c, i) => (
              <li key={i} className="rsc__carry-line">
                {c}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="rbd-h rbd-h--small rsc__sub">
        One line for yourself<span className="rbd-h__sub">optional</span>
      </h3>
      {field("what", "What happened?", "The moment worth remembering")}
      {field("soWhat", "So what?", "What it tells you about your coaching")}
      {field("nowWhat", "Now what?", "One thing to do next time")}
      {error && (
        <p className="rsc__none" role="alert">
          {error}
        </p>
      )}
      {done ? (
        <p className="rsc__private">
          <Check size={13} aria-hidden />
          Saved to your Journal as today's day log.
        </p>
      ) : (
        <button type="button" className="rsc-btn rsc-btn--go" disabled={busy || dayLog === undefined} onClick={() => void save()}>
          <BookOpen size={16} aria-hidden />
          {busy ? "Saving…" : dayLog?.line ? "Save to my journal again" : "Save to my journal"}
        </button>
      )}
      <p className="rsc__private">
        <Lock size={13} aria-hidden />
        Day logs are private to you and never shown to leaders.
      </p>
    </div>
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
