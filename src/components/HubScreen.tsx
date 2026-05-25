import React, { useState, useEffect } from "react";
import { Search, Bell, Settings, RefreshCw, Plus } from "lucide-react";
import { MaxStrengthLogo } from "./MaxStrengthLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateChip } from "./DateChip";
import { ShiftToggle } from "./ShiftToggle";
import { TrainerHeaderCell } from "./TrainerHeaderCell";
import { ScheduleSlot } from "./ScheduleSlot";
import { cn } from "@/lib/utils";
import { AppHeader } from "./AppHeader";
import { BottomTabBar } from "./BottomTabBar";

// --- MOCK DATA ---
const MOCK_DATE = { dayOfWeek: "TUE", dayOfMonth: 26 };
const MOCK_SHIFT = "AM";
const MOCK_TRAINERS = [
  { id: "t1", initials: "MA", name: "Marina", sessionCount: 11 },
  { id: "t2", initials: "GI", name: "Giovanni", sessionCount: 14 },
  { id: "t3", initials: "CH", name: "Christian", sessionCount: 14 },
  { id: "t4", initials: "AU", name: "Austin", sessionCount: 4 },
  { id: "t5", initials: "AR", name: "Arielle", sessionCount: 0 },
];
const MOCK_SESSIONS = [
  { id: "s1", clientName: "Marquita R.", trainerId: "t1", time: "07:00", durationMin: 30 },
  { id: "s2", clientName: "Mark W.", trainerId: "t2", time: "07:00", durationMin: 30 },
  { id: "s3", clientName: "Mandeep S.", trainerId: "t4", time: "07:00", durationMin: 30 },
  { id: "s4", clientName: "Scott L.", trainerId: "t2", time: "07:30", durationMin: 30 },
  { id: "s5", clientName: "Allison P.", trainerId: "t1", time: "08:00", durationMin: 30 },
  { id: "s6", clientName: "David J.", trainerId: "t2", time: "08:00", durationMin: 30 },
  { id: "s7", clientName: "Karen D.", trainerId: "t3", time: "08:00", durationMin: 30 },
  { id: "s8", clientName: "Marceau J.", trainerId: "t1", time: "08:30", durationMin: 30 },
  { id: "s9", clientName: "Teresa J.", trainerId: "t2", time: "08:30", durationMin: 30 },
  { id: "s10", clientName: "Mike C.", trainerId: "t3", time: "08:30", durationMin: 30 },
  { id: "s11", clientName: "Ulas A.", trainerId: "t1", time: "09:00", durationMin: 30 },
  { id: "s12", clientName: "Laura A.", trainerId: "t2", time: "09:00", durationMin: 30 },
  { id: "s13", clientName: "Dori K.", trainerId: "t3", time: "09:00", durationMin: 30 },
  { id: "s14", clientName: "Barbara M.", trainerId: "t2", time: "09:30", durationMin: 30 },
  { id: "s15", clientName: "Louis B.", trainerId: "t3", time: "09:30", durationMin: 30 },
  { id: "s16", clientName: "Ken S.", trainerId: "t3", time: "10:00", durationMin: 30 },
];
const TIMES = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"];
const FORMAT_TIME = (timeStr: string) => {
  const [h, m] = timeStr.split(":");
  const numH = parseInt(h, 10);
  const isAM = numH < 12;
  const dispH = numH > 12 ? numH - 12 : numH;
  return { dispH, m, isAM };
};

export function HubScreen() {
  const [now, setNow] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const timeToPosition = (date: Date) => {
    const h = date.getHours();
    const m = date.getMinutes();
    const totalMins = h * 60 + m;
    const shiftStartMins = 7 * 60; // 07:00
    const shiftEndMins = 10 * 60 + 30; // 10:30
    
    if (totalMins < shiftStartMins || totalMins > shiftEndMins) return null;
    
    const minsFromStart = totalMins - shiftStartMins;
    return (minsFromStart / (shiftEndMins - shiftStartMins)) * 100;
  };

  const currentTimePos = timeToPosition(now);
  const currentTotalMins = now.getHours() * 60 + now.getMinutes();
  
  // Mock search result logic
  const hasZeroResults = searchQuery.trim().length > 0;

  return (
    <div className="w-full h-full min-h-screen bg-bg-l font-sans flex flex-col overflow-hidden">
      <div className="max-w-[820px] mx-auto w-full h-full relative flex flex-col pb-24 border-x border-div-l shadow-2xl">
        <AppHeader variant="light" trainerInitials="AJ" />

        <div className="flex-1 overflow-y-auto no-scrollbar pb-[72px]">
        {/* 2. Global Control Bar (Inline Date + Shift + Refresh) (~60px) */}
        <div className="bg-bg-dark mx-4 mt-4 px-3 py-3 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="flex-1 grid grid-cols-6 gap-2">
            <DateChip dayOfWeek="FRI" dayOfMonth={22} />
            <DateChip dayOfWeek="SAT" dayOfMonth={23} />
            <DateChip dayOfWeek="MON" dayOfMonth={25} />
            <DateChip dayOfWeek="TUE" dayOfMonth={26} isActive />
            <DateChip dayOfWeek="WED" dayOfMonth={27} />
            <DateChip dayOfWeek="THU" dayOfMonth={28} />
          </div>
          <div className="w-[1px] h-10 bg-div-d shrink-0" />
          <div className="flex items-center gap-3 shrink-0">
            <ShiftToggle activeShift="AM" amCount={29} pmCount={14} />
            <Button variant="ghost" className="h-[44px] w-[44px] p-0 text-ink-d2 hover:text-cyan hover:bg-cyan/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark">
              <RefreshCw className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* 3. Search and Add Client row (~60px) */}
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-l4" />
            <Input 
              placeholder="Search clients..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 bg-bg-l-card border-transparent hover:border-div-l focus:bg-white rounded-xl h-10 text-sm shadow-none transition-all focus-visible:ring-cyan focus-visible:border-cyan"
            />
          </div>
          <Button 
            variant="ghost"
            className="h-10 rounded-full font-medium tracking-wide px-4 flex items-center gap-2 transition-all duration-300 border-2 border-div-l text-ink-d3 hover:text-cyan hover:bg-cyan/5 hover:border-cyan shadow-none text-sm uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark"
          >
            <Plus className="w-4 h-4" /> Add Client
          </Button>
        </div>

        {/* 4. Schedule grid */}
        <div className="bg-bg-l-card mx-4 mt-4 rounded-2xl border border-div-l shadow-sm overflow-hidden mb-4">
          <div className="grid grid-cols-[56px_repeat(5,1fr)] divide-x divide-div-l border-b border-div-l bg-bg-l-card">
            <div className="flex items-center justify-center py-2 text-ink-l4 font-display italic text-[11px] uppercase">
              Time
            </div>
            {MOCK_TRAINERS.map(trainer => (
              <TrainerHeaderCell 
                key={trainer.id}
                initials={trainer.initials}
                name={trainer.name}
                sessionCount={trainer.sessionCount}
              />
            ))}
          </div>

          <div className="divide-y divide-div-l relative">
            {currentTimePos !== null && (
              <div 
                className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-cyan-500 via-orange-500 to-transparent z-20 pointer-events-none"
                style={{ top: `${currentTimePos}%` }}
              >
                <div className="absolute left-[56px] -top-2.5 bg-orange-500 text-white text-[11px] font-medium uppercase px-2 py-0.5 rounded-r-full shadow-sm flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                  NOW
                </div>
              </div>
            )}
            {TIMES.map(timeStr => {
              const { dispH, m, isAM } = FORMAT_TIME(timeStr);
              return (
                <div key={timeStr} className="grid grid-cols-[56px_repeat(5,1fr)] divide-x divide-div-l min-h-[50px]">
                  {/* Time label cell */}
                  <div className="flex flex-col items-center justify-center border-r border-div-l text-ink-l3 font-display italic">
                    <div className="flex items-baseline relative left-1 group">
                      <span className="text-lg leading-none tabular-nums">{dispH}{m !== "00" ? `:${m}` : ""}</span>
                      <span className="text-[11px] uppercase leading-none opacity-70 ml-0.5">{isAM ? 'AM' : 'PM'}</span>
                    </div>
                  </div>
                  
                  {/* Trainer column cells */}
                  {MOCK_TRAINERS.map(trainer => {
                    const session = MOCK_SESSIONS.find(s => s.time === timeStr && s.trainerId === trainer.id);
                    
                    // Dynamic isNextUp: True if current time is within this 30 min slot
                    const [h, mVal] = timeStr.split(":");
                    const slotStartMins = parseInt(h, 10) * 60 + parseInt(mVal, 10);
                    const slotEndMins = slotStartMins + 30;
                    const computedIsNextUp = currentTotalMins >= slotStartMins && currentTotalMins < slotEndMins;

                    return (
                      <div key={`${timeStr}-${trainer.id}`} className="p-1.5 flex items-center justify-center bg-white">
                        {session && (
                          <div className="w-full">
                            <ScheduleSlot clientName={session.clientName} isNextUp={computedIsNextUp} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <BottomTabBar variant="light" activeTab="HUB" />
      </div>
    </div>
  );
}
