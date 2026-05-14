
import React, { useState, useEffect, memo } from 'react';

interface ActiveSessionTimerProps {
  startTime: any;
  paused?: boolean;
}

// 1. Isolate the Timer: Use React.memo so the parent doesn't re-render.
export const ActiveSessionTimer = memo(function ActiveSessionTimer({ startTime, paused }: ActiveSessionTimerProps) {
  const [elapsed, setElapsed] = useState<number>(0);
  const [accumulatedPauseTime, setAccumulatedPauseTime] = useState<number>(0);
  const [pauseStart, setPauseStart] = useState<number | null>(null);

  useEffect(() => {
    if (!startTime) return;
    
    // When paused state turns on, record when we paused
    if (paused && pauseStart === null) {
      setPauseStart(Date.now());
    } 
    // When paused state turns off, sum up the time spent paused
    else if (!paused && pauseStart !== null) {
      setAccumulatedPauseTime(prev => prev + (Date.now() - pauseStart));
      setPauseStart(null);
    }
  }, [paused, startTime]);

  useEffect(() => {
    if (!startTime || paused) return;

    const start = startTime?.toDate ? startTime.toDate() : new Date(startTime);
    
    const updateTime = () => {
      const now = new Date();
      // Calculate total elapsed excluding the total time we spent paused
      let diff = Math.floor((now.getTime() - accumulatedPauseTime - start.getTime()) / 1000);
      if (diff < 0) diff = 0;
      setElapsed(diff);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [startTime, paused, accumulatedPauseTime]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2">
      <span className="tabular-nums font-mono text-sm text-slate-400">
        {formatTime(elapsed)}
      </span>
    </div>
  );
});
