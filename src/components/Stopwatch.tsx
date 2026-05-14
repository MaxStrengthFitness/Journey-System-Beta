
import React, { useState, useEffect, useRef, memo } from 'react';
import { Play, Pause, RotateCcw, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';

// 1. Isolate the Timer: Use React.memo so the parent doesn't re-render on interval tick.
export const Stopwatch = memo(function Stopwatch({ 
  initialValue = 0, 
  onLogTSC
}: { 
  initialValue?: number, 
  onLogTSC?: (seconds: number) => void 
}) {
  const [time, setTime] = useState(initialValue);
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(() => {
        setTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive]);

  const toggle = () => setIsActive(!isActive);

  const reset = () => {
    setIsActive(false);
    setTime(0);
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center justify-center pointer-events-none">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-[#0A2E46]/95 backdrop-blur-md border border-[#115E8D]/50 px-4 py-2 rounded-full shadow-2xl flex items-center gap-4 pointer-events-auto"
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-start">
            <span className="text-[8px] font-black uppercase text-[#115E8D] tracking-[0.2em] leading-none mb-0.5">Timer</span>
            <span className="text-xl font-black italic tracking-tighter text-white font-mono tabular-nums leading-none min-w-[60px]">
              {formatTime(time)}
            </span>
          </div>
          
          <div className="h-6 w-[1px] bg-[#115E8D]/30 mx-1" />

          <div className="flex gap-1.5">
            <Button 
              size="icon"
              variant="ghost"
              className={`h-9 w-9 rounded-full transition-all duration-300 ${isActive ? 'text-amber-400 hover:text-amber-300 hover:bg-white/5' : 'text-emerald-400 hover:text-emerald-300 hover:bg-white/5'}`}
              onClick={toggle}
            >
              {isActive ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
            </Button>

            <Button 
              size="icon" 
              variant="ghost" 
              className="h-9 w-9 rounded-full text-slate-400 hover:text-white hover:bg-white/5"
              onClick={reset}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {onLogTSC && (
          <>
            <div className="h-6 w-[1px] bg-[#115E8D]/30 mx-1" />
            <Button 
              onClick={() => {
                onLogTSC(time);
                setIsActive(false);
              }}
              className="bg-[#F06C22] hover:bg-[#F06C22]/90 text-white font-black uppercase italic tracking-wider text-[10px] px-4 h-9 rounded-full shadow-[0_0_15px_rgba(240,108,34,0.4)] transition-all active:scale-95"
            >
              <Timer className="w-3.5 h-3.5 mr-1.5" />
              Log as TSC
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
});
