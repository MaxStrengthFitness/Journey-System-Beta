import React, { useState, useEffect, memo } from 'react';
import { Play, Pause } from 'lucide-react';

interface ActiveSessionTimerProps {
  startTime: any;
  paused?: boolean;
  onTogglePause?: () => void;
}

// Robust, Touch-Optimized Active Session Timer with Pause/Play toggles
export const ActiveSessionTimer = memo(function ActiveSessionTimer({ 
  startTime, 
  paused = false, 
  onTogglePause 
}: ActiveSessionTimerProps) {
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
    <div className="flex items-center gap-4 bg-slate-100/90 dark:bg-slate-900/90 border-2 border-slate-200/90 dark:border-slate-800/90 px-5 py-2.5 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all">
      {onTogglePause && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePause();
          }}
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 ${
            paused
              ? 'bg-[#F06C22] hover:bg-[#F06C22]/90 text-white shadow-[0_0_15px_rgba(240,108,34,0.45)]'
              : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
          }`}
          title={paused ? "Resume Session" : "Pause Session"}
        >
          {paused ? (
            <Play className="w-5 h-5 fill-current transition-transform duration-200" />
          ) : (
            <Pause className="w-5 h-5 fill-current transition-transform duration-200" />
          )}
        </button>
      )}
      <div className="flex flex-col items-start leading-none gap-0.5">
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {paused ? 'PAUSED' : 'ELAPSED'}
        </span>
        <span className={`tabular-nums font-mono text-2xl sm:text-3xl font-black ${paused ? 'text-amber-500' : 'text-slate-800 dark:text-slate-100'}`}>
          {formatTime(elapsed)}
        </span>
      </div>
    </div>
  );
});
