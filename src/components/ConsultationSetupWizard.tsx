import { useState } from "react";
import {
  Gender,
  SkillLevel,
  MachineSelection,
} from "../lib/consultation-utils";
import { knownGender, parseAge, suggestedStartingWeight } from "../lib/consultation-answers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Info, Play, FileText, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What the wizard hands back. `gender` and `age` are null when nobody
 * answered; the caller writes only what is not (lib/consultation-answers.ts).
 */
export interface ConsultationSetupData {
  gender: Gender | null;
  age: number | null;
  skillLevel: SkillLevel;
  routine: { name: MachineSelection; tip: string }[];
}

interface ConsultationSetupWizardProps {
  clientName: string;
  /** What is already on file, so the wizard starts there and not on a default. */
  initialGender?: string | null;
  initialAge?: number | null;
  onComplete: (routineData: ConsultationSetupData) => void;
  onCancel?: () => void;
}

export function ConsultationSetupWizard({
  clientName,
  initialGender = null,
  initialAge = null,
  onComplete,
  onCancel,
}: ConsultationSetupWizardProps) {
  // It used to start every client on Male, 40 — and the tracker saved the
  // Male, even on Skip. Unanswered is null now, and null is never written.
  const [gender, setGender] = useState<Gender | null>(() => knownGender(initialGender));
  const [age, setAge] = useState<number | null>(() => parseAge(initialAge));
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("Novice");

  // The push machine for the introductory routine. Seated Dip for a woman,
  // Chest Press otherwise — which is what an unanswered gender got before.
  const getMachine2 = (): { name: MachineSelection; tip: string } => {
    if (gender !== "Female") {
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
    <div className="flex flex-col bg-bg-dark min-h-screen text-ink-d1 pb-48">
      {/* Header */}
      <div className="p-6 sm:p-8 pt-10 sm:pt-12 mb-2 bg-linear-to-b from-transparent dark:from-black/35 to-transparent">
        <h1 className="font-display font-extrabold text-[30px] leading-[1.04] text-ink-d1 [overflow-wrap:anywhere]">
          First-time setup
        </h1>
        <p className="text-[14px] text-ink-d2 mt-2">
          Generating baseline protocol for {clientName}
        </p>
      </div>

      <div className="px-6 sm:px-8 space-y-8 sm:space-y-12">
        {/* Top Section - Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {/* Gender */}
          <div className="space-y-4">
            <label className="text-[14px] font-bold text-ink-d2">
              Biological gender
            </label>
            <div className="flex gap-3">
              {(["Male", "Female"] as Gender[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={cn(
                    "flex-1 min-h-12 py-3 px-3 rounded-2xl font-bold transition-[color,background-color,border-color,transform] duration-200 border text-[14px]",
                    gender === g
                      ? "bg-primary text-primary-foreground border-primary shadow-(--solid-lift)"
                      : "bg-(--raised) border border-input shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) text-ink-d2 hover:bg-muted",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Age */}
          <div className="space-y-4">
            <label className="text-[14px] font-bold text-ink-d2">
              How old are you?
            </label>
            <div className="flex bg-(--well) border border-input shadow-(--elev-0) rounded-2xl items-center focus-within:border-cyan transition-colors relative h-14 sm:h-17">
              <input
                type="number"
                value={age ?? ""}
                onChange={(e) => setAge(parseAge(e.target.value))}
                className="bg-transparent w-full h-full text-ink-d1 text-xl sm:text-2xl font-bold px-6 outline-none"
                placeholder="e.g. 45"
              />
            </div>
          </div>

          {/* Skill Level */}
          <div className="space-y-4">
            <label className="text-[14px] font-bold text-ink-d2">
              Prior experience
            </label>
            <div className="flex gap-3">
              {(["Novice", "Intermediate", "Advanced"] as SkillLevel[]).map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setSkillLevel(s)}
                    className={cn(
                      "flex-1 min-h-12 py-3 px-1 rounded-2xl font-bold transition-[color,background-color,border-color,transform] duration-200 border text-[14px]",
                      skillLevel === s
                        ? "bg-primary text-primary-foreground border-primary shadow-(--solid-lift)"
                        : "bg-(--raised) border border-input shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) text-ink-d2 hover:bg-muted",
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
          <label className="text-[14px] font-bold text-ink-d2 flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan" />
            Suggested introductory protocol
          </label>

          <div className="space-y-4">
            {routine.map((machine, idx) => {
              // No suggestion until gender and age are answered.
              const weight = suggestedStartingWeight(
                machine.name,
                gender,
                age,
                skillLevel,
              );

              return (
                <Card
                  key={idx}
                  className="bg-bg-dark-2 border border-div-d shadow-(--panel-lift) overflow-hidden rounded-[20px]"
                >
                  <CardContent className="p-0 flex flex-col sm:flex-row items-stretch">
                    <div className="h-2 sm:h-auto sm:w-6 bg-cta shrink-0" />
                    <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="pr-0 sm:pr-4 flex-1">
                          <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-ink-d1 leading-none mb-2">
                            {machine.name}
                          </h3>
                          <p className="text-[14px] text-ink-d2 flex items-center gap-2 mt-2 leading-relaxed">
                            <Info className="w-4 h-4 text-cyan shrink-0" />
                            {machine.tip}
                          </p>
                        </div>

                        <div className="text-left sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-start w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 sm:border-l border-div-d">
                          <span className="text-[12px] font-semibold text-ink-d3 sm:mb-2 mr-3 sm:mr-0">
                            Starting weight
                          </span>
                          <div className="bg-(--well) shadow-(--elev-0) px-5 py-2.5 rounded-xl flex items-baseline gap-1.5">
                            <span className="font-display text-[30px] font-extrabold leading-none text-(--eq-hero-text)">
                              {weight ?? "—"}
                            </span>
                            {weight !== null && (
                              <span className="text-[12px] font-bold text-ink-d3">
                                lbs
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-div-d flex justify-between items-center">
                        <button className="min-h-10 bg-(--raised) border border-input shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) hover:bg-muted transition-colors px-3.5 rounded-lg text-[14px] font-bold text-ink-d1 flex items-center gap-2 cursor-pointer">
                          Setup info
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
              className="text-ink-d2 hover:text-ink-d1 hover:bg-muted text-[14px] font-bold h-12 rounded-xl flex-1 sm:flex-initial"
            >
              Cancel
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => onComplete({ gender, age, skillLevel, routine: [] })}
            className="bg-(--raised) border border-input shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) text-ink-d1 hover:bg-muted text-[14px] font-bold px-5 rounded-xl flex flex-col items-center justify-center py-1.5 min-h-12 h-auto flex-1 sm:flex-initial"
          >
            <span className="leading-none">Skip setup</span>
            <span className="text-[12px] font-semibold text-ink-d3 mt-0.5">
              Manual profile
            </span>
          </Button>
        </div>
        <Button
          onClick={() => onComplete({ gender, age, skillLevel, routine })}
          className="bg-cta hover:bg-cta text-cta-foreground text-[14px] font-bold h-14 sm:h-16 px-8 sm:px-10 rounded-2xl shadow-(--go-lift) active:translate-y-px active:shadow-(--press) pointer-events-auto items-center justify-center flex gap-2.5 z-20"
        >
          Start consult workout
          <Play className="w-5 h-5 fill-current shrink-0" />
        </Button>
      </div>
    </div>
  );
}
