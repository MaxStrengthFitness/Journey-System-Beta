/**
 * The Active Session on an iPad that is watching, not recording (session
 * record, Sep 26 2026).
 *
 * Another trainer is running this client's session. The screen is the one
 * they see, drawn read-only: the session bar without Notes, Pulse, Discard or
 * Finish, the grid with today's column filling in as each set is saved, and no
 * Now bar. One sentence says who is running it and that nothing here changes
 * it. "Take over" is the only way to record from here, and it asks first; the
 * safe answer, "Keep watching", is the default.
 *
 * It holds no write of its own. The tracker draws it in place of its own
 * screen, so none of the recording screen's effects, sheets or buttons are
 * mounted while watching.
 */
import { useState, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { ActiveSessionTimer } from "../../components/ActiveSessionTimer";
import { LeaveConfirmDialog } from "../unsaved-changes";
import type { TakeOverWords, WatchWords } from "./watch";
import "./session-record.css";

export function WatchingSession({
  clientName,
  sessionTag,
  runnerInitials,
  startedLabel,
  timer,
  done,
  total,
  words,
  takeOver,
  onTakeOver,
  children,
}: {
  clientName: string;
  /** "#12", or null when the number cannot be quoted (lib/client-coverage.ts). */
  sessionTag: string | null;
  runnerInitials: string;
  startedLabel: string | null;
  timer: { startTime: unknown; fallbackStartTime?: unknown; pausedAt?: unknown; totalPausedMs?: number };
  done: number;
  total: number;
  words: WatchWords;
  /** The question before a take-over; null when this person cannot take it over. */
  takeOver: TakeOverWords | null;
  onTakeOver: () => void;
  /** The grid, drawn by the tracker with a read-only live column. */
  children: ReactNode;
}) {
  const [asking, setAsking] = useState(false);

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden relative" data-testid="watching-session">
      <div className="jg-sbar">
        <div className="jg-sbar__client">
          <h3 className="jg-sbar__name">{clientName}</h3>
          <div className="jg-sbar__meta">
            {sessionTag && (
              <>
                <span>
                  <b>{sessionTag}</b>
                </span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>{runnerInitials}</span>
            {startedLabel && (
              <>
                <span aria-hidden>·</span>
                <span>Started {startedLabel}</span>
              </>
            )}
          </div>
        </div>
        {/* The session's own clock, paused when the trainer paused it; no
            pause button, because pausing is the trainer's. */}
        <ActiveSessionTimer
          variant="bar"
          startTime={timer.startTime}
          fallbackStartTime={timer.fallbackStartTime}
          pausedAt={timer.pausedAt}
          totalPausedMs={timer.totalPausedMs}
        />
        {total > 0 && (
          <div className="jg-sbar__progress" aria-label={`${done} of ${total} machines logged`}>
            <span className="jg-sbar__progress-text">
              {done} <small>of {total}</small>
            </span>
            <span className="jg-sbar__meter" aria-hidden>
              <i style={{ width: `${Math.round((100 * done) / total)}%` }} />
            </span>
          </div>
        )}
        <span className="jg-sbar__sp" />
      </div>

      <div className="sr-watch" role="status" aria-live="polite">
        <Eye className="sr-watch__icon" size={16} strokeWidth={2.4} aria-hidden="true" />
        <p className="sr-watch__text">
          {words.line}
          {words.offline && <span className="sr-watch__offline"> {words.offline}</span>}
        </p>
        {takeOver && (
          <button type="button" className="sr-watch__take" onClick={() => setAsking(true)}>
            Take over
          </button>
        )}
      </div>

      <div className="jg-stage">
        <div className="jg-stage__main">{children}</div>
      </div>

      {asking && takeOver && (
        <LeaveConfirmDialog
          title={takeOver.title}
          question={takeOver.question}
          leaveLabel={takeOver.leaveLabel}
          stayLabel={takeOver.stayLabel}
          onStay={() => setAsking(false)}
          onLeave={() => {
            setAsking(false);
            onTakeOver();
          }}
        />
      )}
    </div>
  );
}
