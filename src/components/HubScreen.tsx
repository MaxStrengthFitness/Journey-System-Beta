import React from "react";
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
  { id: "s5", clientName: "Allison P.", trainerId: "t1", time: "08:00", durationMin: 30, isNextUp: true },
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
  return (
    <div className="w-[820px] h-[1180px] bg-bg-l mx-auto relative flex flex-col font-sans overflow-hidden border border-div-l shadow-2xl">
      <AppHeader variant="light" trainerInitials="AJ" />

      <div className="flex-1 overflow-y-auto no-scrollbar pb-[72px]">
        {/* 2. Search row (~60px) */}
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-l4" />
            <Input 
              placeholder="Search clients..." 
              className="pl-9 bg-white border-div-l rounded-xl h-12 text-base shadow-sm focus-visible:ring-cyan"
            />
          </div>
          <Button className="h-12 rounded-xl bg-cta hover:bg-cta-strong text-white font-display italic px-6 shadow-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> ADD CLIENT
          </Button>
        </div>

        {/* 3. Date + shift card (~140px) */}
        <div className="bg-bg-dark mx-4 rounded-[20px] p-4 flex flex-col justify-between shadow-sm h-[140px]">
          {/* Row A: DateChips */}
          <div className="grid grid-cols-6 gap-2 h-[56px]">
            <DateChip dayOfWeek="FRI" dayOfMonth={22} />
            <DateChip dayOfWeek="SAT" dayOfMonth={23} />
            <DateChip dayOfWeek="MON" dayOfMonth={25} />
            <DateChip dayOfWeek="TUE" dayOfMonth={26} isActive />
            <DateChip dayOfWeek="WED" dayOfMonth={27} />
            <DateChip dayOfWeek="THU" dayOfMonth={28} />
          </div>
          
          {/* Row B: ShiftToggle & Refresh */}
          <div className="flex items-center justify-between mt-auto">
            <ShiftToggle activeShift="AM" amCount={29} pmCount={14} />
            <Button className="h-[44px] px-4 bg-cta hover:bg-cta-strong text-white font-display italic text-sm tracking-wide rounded-xl shadow-[0_2px_8px_var(--color-cta)]">
              <RefreshCw className="w-4 h-4 mr-2 stroke-[2.5px]" />
              REFRESH
            </Button>
          </div>
        </div>

        {/* 4. Schedule grid */}
        <div className="bg-bg-l-card mx-4 mt-4 rounded-2xl border border-div-l shadow-sm overflow-hidden mb-4">
          <div className="grid grid-cols-[56px_repeat(5,1fr)] divide-x divide-div-l border-b border-div-l bg-slate-50/50">
            <div className="flex items-center justify-center py-2 text-ink-l4 font-display italic text-[10px] uppercase">
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

          <div className="divide-y divide-div-l">
            {TIMES.map(timeStr => {
              const { dispH, m, isAM } = FORMAT_TIME(timeStr);
              return (
                <div key={timeStr} className="grid grid-cols-[56px_repeat(5,1fr)] divide-x divide-div-l min-h-[50px]">
                  {/* Time label cell */}
                  <div className="flex flex-col items-center justify-center border-r border-div-l text-ink-l3 font-display italic">
                    <div className="flex items-baseline relative left-1 group">
                      <span className="text-lg leading-none tabular-nums">{dispH}{m !== "00" ? `:${m}` : ""}</span>
                      <span className="text-[9px] uppercase leading-none opacity-70 ml-0.5">{isAM ? 'AM' : 'PM'}</span>
                    </div>
                  </div>
                  
                  {/* Trainer column cells */}
                  {MOCK_TRAINERS.map(trainer => {
                    const session = MOCK_SESSIONS.find(s => s.time === timeStr && s.trainerId === trainer.id);
                    return (
                      <div key={`${timeStr}-${trainer.id}`} className="p-1.5 flex items-center justify-center bg-white">
                        {session && (
                          <div className="w-full">
                            <ScheduleSlot clientName={session.clientName} isNextUp={session.isNextUp} />
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
  );
}
