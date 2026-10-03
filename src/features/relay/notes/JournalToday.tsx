import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Check, Lock } from "lucide-react";
import { useUnsavedChanges } from "../../unsaved-changes";
import { minutesToClock, type NowContext } from "../board/now-context";
import { CARRY_MAX, CARRY_TEXT_MAX, LINE_TEXT_MAX, cleanCarry, cleanLine, type DayLine, type DayLog } from "./day-log";
import { saveDayLog, useDayLog, type DayLogPatch } from "./day-log-store";
import "./journal-today.css";

/**
 * TODAY — the Journal's first tab (the Relay Board rebuild, Oct 3 2026).
 *
 * "Things to carry today" and "One line for yourself" were two small cards
 * on the Board, at the start and the end of the day (the Journal, the second
 * wave, Sep 28 2026). AJ rebuilt the Board as the studio's day on one board
 * of cards (Oct 3 2026), and a trainer's own writing moved here, beside the
 * day logs it saves into: the same day log at studios/{s}/dayLogs/{uid}_{day},
 * private to the trainer, never shown to leaders.
 *
 *   Things to carry   up to three short lines for the day
 *   One line          What happened? So what? Now what? — optional — saved
 *                     with the day's facts as today's day log
 *   Write             the Journal's kinds of note (the host passes its row)
 */

export interface JournalTodayProps {
  studioId: string | null;
  /** The Auth uid: the rules pin a day log to it. */
  uid: string | null;
  now: Pick<NowContext, "todayKey" | "sessions">;
  /** The Journal's "Write" row, drawn under the day's two cards. */
  write?: ReactNode;
}

export function JournalToday({ studioId, uid, now, write }: JournalTodayProps) {
  const read = useDayLog(studioId, uid, now.todayKey);
  // undefined while it loads; null when there is none yet (or it couldn't be read: a save merges, and loses nothing written today on another iPad but what it replaces).
  const log = read.state === "ready" ? read.log : read.state === "failed" ? null : undefined;
  const facts = dayFacts(now);
  const save = async (patch: DayLogPatch) => {
    if (!studioId || !uid) throw new Error("Sign in and pick a studio first.");
    await saveDayLog({ studioId, uid, day: now.todayKey, patch, isNew: log === null });
  };

  return (
    <div className="jtd">
      <section className="jtd-card" aria-label="Things to carry today">
        <CarryToday carry={log === undefined ? null : log?.carry ?? []} onSave={(carry) => save({ carry })} />
      </section>
      <section className="jtd-card" aria-label="One line for yourself">
        <DayLineForm dayLog={log} facts={facts} onSave={(line) => save({ facts, line })} />
      </section>
      {write}
      <p className="jtd-private">
        <Lock size={14} aria-hidden />
        Your day logs are private to you and never shown to leaders. Each one is on Day logs.
      </p>
    </div>
  );
}

/** The day so far, in plain sentences: the day, and your sessions on the schedule. */
export function dayFacts(now: Pick<NowContext, "todayKey" | "sessions">): string[] {
  const out = [`${longDay(now.todayKey)}.`];
  if (now.sessions.length > 0) {
    const lastEnd = Math.max(...now.sessions.map((s) => s.endMin));
    out.push(`${now.sessions.length === 1 ? "One session" : `${now.sessions.length} sessions`} on your schedule today, the last ending at ${minutesToClock(lastEnd)}.`);
  }
  return out;
}

/** "Saturday, October 3" for a studio day key. */
function longDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return "Today";
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/* ------------------------------------------------------------------ *
 * Things to carry today
 * ------------------------------------------------------------------ */

function padCarry(lines: readonly string[]): string[] {
  const out = [...lines];
  while (out.length < CARRY_MAX) out.push("");
  return out.slice(0, CARRY_MAX);
}

function CarryToday({ carry, onSave }: { carry: string[] | null; onSave: (lines: string[]) => Promise<void> }) {
  // What was just kept shows at once, until the day log's read brings it back.
  const [kept, setKept] = useState<string[]>([]);
  const saved = carry && carry.length > 0 ? carry : kept;
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
      setKept(cleanCarry(lines));
      leave.release();
      setEditing(false);
    } catch (err) {
      console.warn("[journal] carry not kept:", err);
      setError("Couldn't keep them. Check your connection; your lines are still here.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h3 className="jtd-h">
        Things to carry today<span className="jtd-h__sub">up to {CARRY_MAX}, for you</span>
      </h3>
      {carry === null ? (
        <p className="jtd-quiet">Looking for what you chose earlier…</p>
      ) : !editing ? (
        <>
          <ul className="jtd-carry">
            {saved.map((c, i) => (
              <li key={i} className="jtd-carry__line">
                {c}
              </li>
            ))}
          </ul>
          <button type="button" className="jtd-btn" onClick={() => setEditing(true)}>
            Change them
          </button>
        </>
      ) : (
        <>
          {lines.map((l, i) => (
            <label key={i} className="jtd-field">
              <span className="jtd-field__l">{i === 0 ? "One thing" : i === 1 ? "Another" : "And one more"}</span>
              <input
                className="jtd-input"
                value={l}
                maxLength={CARRY_TEXT_MAX}
                placeholder={i === 0 ? "Slow down at the door" : ""}
                onChange={(e) => setLines((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </label>
          ))}
          {error && (
            <p className="jtd-quiet" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="jtd-btn jtd-btn--go" disabled={busy || cleanCarry(lines).length === 0} onClick={() => void keep()}>
            {busy ? "Keeping…" : "Keep for today"}
          </button>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * One line for yourself
 * ------------------------------------------------------------------ */

function DayLineForm({
  dayLog,
  facts,
  onSave,
}: {
  dayLog: DayLog | null | undefined;
  /** The day so far, saved with the line. */
  facts: string[];
  onSave: (line: DayLine | null) => Promise<void>;
}) {
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
      console.warn("[journal] day log not saved:", err);
      setError("Couldn't save it. Check your connection; what you wrote is still here.");
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof DayLine, label: string, placeholder: string) => (
    <label className="jtd-field">
      <span className="jtd-field__l">{label}</span>
      <input
        className="jtd-input"
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
    <>
      <h3 className="jtd-h">
        One line for yourself<span className="jtd-h__sub">optional</span>
      </h3>
      <ul className="jtd-facts" aria-label="Your day so far">
        {facts.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
      {field("what", "What happened?", "The moment worth remembering")}
      {field("soWhat", "So what?", "What it tells you about your coaching")}
      {field("nowWhat", "Now what?", "One thing to do next time")}
      {error && (
        <p className="jtd-quiet" role="alert">
          {error}
        </p>
      )}
      {done ? (
        <p className="jtd-quiet">
          <Check size={14} aria-hidden /> Saved to your Journal as today's day log.
        </p>
      ) : (
        <button type="button" className="jtd-btn jtd-btn--go" disabled={busy || dayLog === undefined} onClick={() => void save()}>
          <BookOpen size={16} aria-hidden />
          {busy ? "Saving…" : dayLog?.line ? "Save to my journal again" : "Save to my journal"}
        </button>
      )}
    </>
  );
}
