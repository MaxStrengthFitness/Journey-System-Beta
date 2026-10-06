import { useState, useEffect, memo } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import "../features/journey-grid/journey-grid.css";

interface ActiveSessionTimerProps {
  /** Session start. Firestore Timestamp, Date, or ISO string. */
  startTime: any;
  /** Client-clock start, used while a serverTimestamp() write is still pending. */
  fallbackStartTime?: any;
  /** When the current pause began, or null/undefined while running. */
  pausedAt?: any;
  /** Milliseconds accumulated across previous pauses. */
  totalPausedMs?: number;
  onTogglePause?: () => void;
  /** The session-bar clock pill (jg-clock, journey-grid.css): a 40px pause
      target and an amber PAUSED state you cannot miss. The only look since
      Oct 5 2026: the old "card" variant had no caller left and kept 8-10px
      capitals and a raw black shadow (type and depth review). */
  variant?: "bar";
}

/**
 * Seconds of active training time, excluding any paused spans.
 *
 * Exported so the arithmetic can be verified directly — an off-by-one here shows
 * up as a session that silently over- or under-reports its duration.
 */
export function computeElapsedSeconds(params: {
  startMs: number | null;
  pausedAtMs: number | null;
  totalPausedMs?: number;
  now?: number;
}): number {
  const { startMs, pausedAtMs, totalPausedMs = 0, now = Date.now() } = params;
  if (startMs === null) return 0;

  const currentPause = pausedAtMs !== null ? Math.max(0, now - pausedAtMs) : 0;
  const pausedSoFar = (Number(totalPausedMs) || 0) + currentPause;

  return Math.max(0, Math.floor((now - startMs - pausedSoFar) / 1000));
}

/** Milliseconds from a Firestore Timestamp, Date, or ISO string; null if absent. */
export function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const ms = new Date(value).getTime();
  return isNaN(ms) ? null : ms;
}

/**
 * Elapsed session time.
 *
 * Every input is derived from the session document rather than held in component
 * state, so the reading is identical after a refresh, a navigation, or on another
 * device. The previous version tracked pauses in local state, which meant a
 * refresh mid-pause silently counted the break as training time, and a remount
 * restarted the count from zero.
 */
export const ActiveSessionTimer = memo(function ActiveSessionTimer({
  startTime,
  fallbackStartTime,
  pausedAt,
  totalPausedMs = 0,
  onTogglePause,
}: ActiveSessionTimerProps) {
  // Re-render once a second; the value itself is computed, never accumulated.
  const [, setTick] = useState(0);

  const pausedAtMs = toMillis(pausedAt);
  const isPaused = pausedAtMs !== null;

  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isPaused]);

  // serverTimestamp() reads as null locally until the server confirms the write,
  // so fall back to the client clock and the timer starts moving immediately.
  const startMs = toMillis(startTime) ?? toMillis(fallbackStartTime);

  const elapsed = computeElapsedSeconds({ startMs, pausedAtMs, totalPausedMs });

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className={cn("jg-clock", isPaused && "is-paused")} role="timer" aria-live="off">
      {onTogglePause && (
        <button
          type="button"
          className="jg-clock__btn"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePause();
          }}
          aria-label={isPaused ? "Resume session" : "Pause session"}
          title={isPaused ? "Resume session" : "Pause session"}
        >
          {isPaused ? (
            <Play size={16} strokeWidth={2.5} className="fill-current ml-0.5" />
          ) : (
            <Pause size={16} strokeWidth={2.5} className="fill-current" />
          )}
        </button>
      )}
      <div className="jg-clock__read">
        <span className="jg-clock__label">{isPaused ? "Paused" : "Elapsed"}</span>
        <span className="jg-clock__time">{formatTime(elapsed)}</span>
      </div>
    </div>
  );
});
