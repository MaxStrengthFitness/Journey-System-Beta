import React, { useState } from "react";
import {
  calculateStartingWeight,
  Gender,
  SkillLevel,
  MachineSelection,
} from "../lib/consultation-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Info, Play, FileText, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConsultationSetupWizardProps {
  clientName: string;
  onComplete: (routineData: any) => void;
  onCancel?: () => void;
}

export function ConsultationSetupWizard({
  clientName,
  onComplete,
  onCancel,
}: ConsultationSetupWizardProps) {
  const [gender, setGender] = useState<Gender>("Male");
  const [age, setAge] = useState<number>(40);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("Novice");

  const getMachine2 = (): { name: MachineSelection; tip: string } => {
    if (gender === "Male") {
      return {
        name: "Chest Press",
        tip: "Stool required, elbows slightly lower than hands",
      };
    }
    return {
      name: "Seated Dip",
      tip: "Stool required, upper arms abducted 45-60 degrees",
    };
  };

  const machine2 = getMachine2();

  const routine = [
    {
      name: "Leg Press" as MachineSelection,
      tip: "Standard setup: P2 Seat, Gap 2",
    },
    machine2,
    {
      name: "Lumbar" as MachineSelection,
      tip: "Conservative start, Gap 4, align iliac crest",
    },
  ];

  return (
    <div className="flex flex-col bg-bg-dark min-h-screen text-white pb-48">
      {/* Header */}
      <div className="p-6 sm:p-8 pt-10 sm:pt-12 mb-2 bg-linear-to-b from-black/35 to-transparent">
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter text-white">
          First-Time Setup
        </h1>
        <p className="text-cyan uppercase tracking-widest text-xs font-bold mt-2">
          Generating baseline protocol for {clientName}
        </p>
      </div>

      <div className="px-6 sm:px-8 space-y-8 sm:space-y-12">
        {/* Top Section - Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {/* Gender */}
          <div className="space-y-4">
            <label className="text-[11px] font-black uppercase tracking-widest text-ink-d3">
              Biological Gender
            </label>
            <div className="flex gap-3">
              {(["Male", "Female"] as Gender[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={cn(
                    "flex-1 py-4 sm:py-5 px-3 rounded-2xl font-black uppercase tracking-tight transition-all duration-200 border-2 text-sm sm:text-base",
                    gender === g
                      ? "bg-cta/15 text-white border-cta shadow-[0_0_20px_rgba(240,108,34,0.25)] scale-102 sm:scale-105"
                      : "bg-bg-dark-2 text-ink-d3 border-div-d hover:border-white/20 hover:bg-white/5",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Age */}
          <div className="space-y-4">
            <label className="text-[11px] font-black uppercase tracking-widest text-ink-d3">
              How old are you?
            </label>
            <div className="flex bg-bg-dark-2 border-2 border-div-d rounded-2xl items-center focus-within:border-cyan transition-colors relative h-14 sm:h-17">
              <input
                type="number"
                value={age || ""}
                onChange={(e) => setAge(parseInt(e.target.value) || 0)}
                className="bg-transparent w-full h-full text-white text-xl sm:text-2xl font-black px-6 outline-none"
                placeholder="e.g. 45"
              />
            </div>
          </div>

          {/* Skill Level */}
          <div className="space-y-4">
            <label className="text-[11px] font-black uppercase tracking-widest text-ink-d3">
              Prior Experience
            </label>
            <div className="flex gap-3">
              {(["Novice", "Intermediate", "Advanced"] as SkillLevel[]).map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setSkillLevel(s)}
                    className={cn(
                      "flex-1 py-4 sm:py-5 px-1 rounded-2xl font-black uppercase tracking-tight transition-all duration-200 border-2 text-xs sm:text-sm",
                      skillLevel === s
                        ? "bg-cta/15 text-white border-cta shadow-[0_0_20px_rgba(240,108,34,0.25)] scale-102 sm:scale-105"
                        : "bg-bg-dark-2 text-ink-d3 border-div-d hover:border-white/20 hover:bg-white/5",
                    )}
                  >
                    {s}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>

        {/* Bottom Section - The Routine */}
        <div className="space-y-6 flex-1">
          <label className="text-[12px] font-black uppercase tracking-widest text-cyan flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Suggested Introductory Protocol
          </label>

          <div className="space-y-4">
            {routine.map((machine, idx) => {
              const weight = calculateStartingWeight(
                machine.name,
                gender,
                age,
                skillLevel,
              );

              return (
                <Card
                  key={idx}
                  className="bg-bg-dark-2 border border-div-d shadow-2xl overflow-hidden rounded-[24px]"
                >
                  <CardContent className="p-0 flex flex-col sm:flex-row items-stretch">
                    <div className="h-2 sm:h-auto sm:w-6 bg-cta shrink-0" />
                    <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="pr-0 sm:pr-4 flex-1">
                          <h3 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter text-ink-d1 leading-none mb-2">
                            {machine.name}
                          </h3>
                          <p className="text-xs font-bold text-ink-d3 tracking-wide uppercase flex items-center gap-2 mt-2 leading-relaxed">
                            <Info className="w-4 h-4 text-cyan shrink-0" />
                            {machine.tip}
                          </p>
                        </div>

                        <div className="text-left sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-start w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 sm:border-l border-div-d">
                          <span className="text-[11px] font-black uppercase tracking-widest text-ink-d3 sm:mb-2 mr-3 sm:mr-0">
                            Starting Wt
                          </span>
                          <div className="bg-black/30 border-2 border-div-d shadow-sm px-5 py-2.5 rounded-xl flex items-baseline gap-1.5">
                            <span className="text-3xl font-black tracking-tighter text-cta">
                              {weight}
                            </span>
                            <span className="text-xs font-bold text-ink-d3 uppercase">
                              lbs
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-div-d flex justify-between items-center">
                        <button className="bg-bg-dark-3 hover:bg-slate-800 transition-colors py-2 px-3.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-cyan flex items-center gap-2 cursor-pointer">
                          Setup Info
                          <ChevronRight className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Fixed Action - Shifted above bottom navigation bar (h-14 sm:h-20) */}
      <div className="fixed bottom-14 sm:bottom-20 left-0 right-0 p-6 sm:p-8 pt-12 sm:pt-16 bg-linear-to-t from-bg-dark via-bg-dark/95 to-transparent pointer-events-none flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 z-20">
        <div className="flex gap-3 pointer-events-auto w-full sm:w-auto">
          {onCancel && (
            <Button
              variant="ghost"
              onClick={onCancel}
              className="text-ink-d3 hover:text-white hover:bg-white/5 font-bold uppercase tracking-widest text-xs h-12 rounded-xl flex-1 sm:flex-initial"
            >
              Cancel
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => onComplete({ gender, age, skillLevel, routine: [] })}
            className="text-cta hover:bg-cta/10 font-black uppercase tracking-widest text-xs px-5 rounded-xl border-2 border-cta/30 flex flex-col items-center justify-center py-2 h-12 flex-1 sm:flex-initial"
          >
            <span className="leading-none">Skip Setup</span>
            <span className="text-[9px] opacity-60 font-bold mt-0.5">
              Manual Profile
            </span>
          </Button>
        </div>
        <Button
          onClick={() => onComplete({ gender, age, skillLevel, routine })}
          className="bg-cta hover:opacity-90 text-white font-black uppercase tracking-widest text-sm sm:text-base h-14 sm:h-16 px-8 sm:px-10 rounded-2xl shadow-[0_10px_30px_rgba(240,108,34,0.3)] pointer-events-auto items-center justify-center flex gap-2.5 z-20"
        >
          Start Consult Workout
          <Play className="w-5 h-5 fill-current shrink-0" />
        </Button>
      </div>
    </div>
  );
}
