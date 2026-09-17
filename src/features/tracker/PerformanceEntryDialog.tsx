/**
 * The set-entry dialog of the workout tracker (weight, reps, TUT, quality,
 * the machine's settings for this client).
 *
 * Moved out of components/WorkoutTrackerView.tsx, unchanged, in the beta-prep
 * trim (Sep 17 2026): the tracker was one 4,175-line file holding the screen
 * AND three dialogs. A dialog is a whole, self-contained piece - it shares no
 * module-level state with the tracker - so moving it is the safe first step
 * of splitting that file. The tangled middle waits for a render test.
 */
import { useState } from "react";
import { Zap } from "lucide-react";
import { Machine, WorkoutSession, ExerciseLog, ClientMachineSetting } from "../../types";
import { parseSessionDate, orderMachineSettings } from "../../lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { hasCount } from "../../lib/log-validation";

export function PerformanceEntryDialog({
  machine,
  currentWeight,
  currentReps,
  currentQuality,
  pastMachineLogs,
  isStaticHold,
  side,
  isTorsoFull,
  currentRepsRight,
  onSave,
  onClose,
  machineSettings,
}: {
  machine: Machine;
  currentWeight: string;
  currentReps: string;
  currentQuality: number;
  pastMachineLogs: { log: ExerciseLog; session: WorkoutSession }[];
  isStaticHold?: boolean;
  side?: "Left" | "Right";
  isTorsoFull?: boolean;
  currentRepsRight?: string;
  onSave: (
    weight: string,
    repsOrSeconds: string,
    quality: number,
    isHold: boolean,
    side?: "Left" | "Right",
    repsRight?: string,
  ) => void;
  onClose: () => void;
  machineSettings?: ClientMachineSetting;
}) {
  const { activeStudio } = useActiveStudio();
  const prevLog = pastMachineLogs[0]?.log;
  const prevWeight = prevLog?.weight || "0";

  const initialWeight =
    parseFloat(currentWeight) > 0
      ? parseFloat(currentWeight)
      : parseFloat(prevWeight) || 0;

  // Deliberately NOT seeded from the previous session. Weight carries forward
  // because a starting load is a setting; a rep or second count is a measurement
  // and must come from this set. Last session's number appears only as a greyed
  // placeholder, and `canSave` below refuses to store an empty field.
  const initialReps = currentReps !== "" ? parseFloat(currentReps) : "";
  const initialRepsRight =
    currentRepsRight !== undefined && currentRepsRight !== ""
      ? parseFloat(currentRepsRight)
      : "";

  const [current, setCurrent] = useState<number>(initialWeight);
  const [reps, setReps] = useState<number | string>(initialReps);
  const [repsRt, setRepsRt] = useState<number | string>(initialRepsRight);
  const [quality, setQuality] = useState<number>(currentQuality || 0);
  const [isHold, setIsHold] = useState(isStaticHold || false);

  const roundUpTo2 = (val: number) => Math.ceil(val / 2) * 2;

  const adjustCurrent = (amount: number) =>
    setCurrent(Math.max(0, roundUpTo2(current + amount)));

  const getBaseReps = (currentVal: string | number, prevValStr: string) => {
    if (typeof currentVal === "number" && currentVal > 0) return currentVal;
    if (typeof currentVal === "string" && currentVal !== "")
      return parseFloat(currentVal);
    return parseFloat(prevValStr) || 0;
  };

  /**
   * A set is only saveable with a quality *and* an actual rep/second count.
   * Previously only quality was required, so a blank field saved an empty value
   * that rendered as "s" with no number and scored zero toward the client's
   * lifetime volume.
   */
  const countsEntered = isTorsoFull
    ? hasCount(reps) && hasCount(repsRt)
    : hasCount(reps);
  const canSave = Boolean(quality) && quality !== 0 && countsEntered;

  const saveLabel = !countsEntered
    ? isHold
      ? "Enter Seconds To Save"
      : "Enter Reps To Save"
    : !quality || quality === 0
      ? "Select Quality To Save"
      : "Save Set";

  const prevRepsLeftPlaceholder = isHold
    ? prevLog?.seconds || ""
    : prevLog?.reps || "";
  const prevRepsRightPlaceholder =
    (prevLog as any)?.repsRight || prevRepsLeftPlaceholder;

  /**
   * Reps and seconds are different units — 8 reps is not 8 seconds — so switching
   * mode re-seeds the field from that mode's own previous value rather than
   * carrying the old number across.
   */
  const switchMode = (hold: boolean) => {
    if (hold === isHold) return;
    setIsHold(hold);
    // Clear rather than carry the number across: the units are different, so a
    // rep count left sitting in the seconds field would be saved as a duration.
    setReps("");
    if (isTorsoFull) setRepsRt("");
  };

  const adjustReps = (amount: number) => {
    const base = getBaseReps(reps, prevRepsLeftPlaceholder);
    setReps(Math.max(0, base + amount));
  };

  const adjustRepsRt = (amount: number) => {
    const base = getBaseReps(repsRt, prevRepsRightPlaceholder);
    setRepsRt(Math.max(0, base + amount));
  };

  const prevW = parseFloat(prevWeight) || 0;
  const weightDelta = prevW > 0 ? current - prevW : 0;
  const weightDeltaPct =
    prevW > 0 ? ((weightDelta / prevW) * 100).toFixed(1) : "0.0";

  const settings = machineSettings?.settings || {};

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-100 rounded-[32px] p-0 overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-bg-dark shadow-2xl dark:shadow-none flex flex-col h-full max-h-[85dvh] sm:max-h-150">
        {/* Header */}
        <div className="bg-white dark:bg-bg-dark p-4 text-foreground relative overflow-hidden border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
            <Zap className="w-24 h-24" />
          </div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-sky-500" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-black italic uppercase tracking-tight leading-none truncate">
                {machine.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                {side && (
                  <span className="text-orange-500 text-[11px] font-black uppercase tracking-widest leading-none">
                    Rotation: {side}
                  </span>
                )}
                {side && <span className="w-1 h-1 bg-slate-600 rounded-full" />}
                <p className="text-[11px] uppercase font-bold text-sky-500 tracking-widest leading-none">
                  Entry HUD
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {/* Settings Shorthand Bar */}
          <div className="bg-slate-50/40 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 flex items-center justify-center gap-x-5 gap-y-1.5 flex-wrap">
            {(() => {
              const stdSettings =
                activeStudio?.machineSettings?.[machine.id!] ||
                machine.standardSettings ||
                {};
              const options = machine.settingOptions || [];
              const sorted = orderMachineSettings(
                settings,
                stdSettings,
                options,
              );
              return sorted.map(([key, value, originalKey], i) => (
                <div
                  key={originalKey || i}
                  className="flex items-center gap-1.5"
                >
                  <span className="text-[11px] font-black text-muted-foreground uppercase tracking-tighter">
                    {key}:
                  </span>
                  <span className="text-[12px] font-black text-orange-500 italic">
                    {value}
                  </span>
                </div>
              ));
            })()}
          </div>

          {/* Smart Stepper: Weight */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex flex-col items-center relative">
            <Label className="text-[11px] font-black uppercase text-muted-foreground tracking-widest text-center block mb-2">
              Weight (lbs)
            </Label>
            <div className="flex items-center justify-between w-full h-14 px-1">
              <button
                className="w-11 h-11 rounded-xl bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 font-black text-lg flex items-center justify-center active:scale-95 transition-transform border border-slate-300 dark:border-slate-700"
                onClick={() => adjustCurrent(-2)}
              >
                -2
              </button>

              <div className="flex flex-col items-center justify-center flex-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={current || ""}
                  onChange={(e) => setCurrent(parseFloat(e.target.value) || 0)}
                  className="font-black text-5xl text-foreground tracking-tighter leading-none bg-transparent border-none text-center w-full p-0 m-0 no-arrows focus:ring-0"
                />
                {prevW > 0 && (
                  <div
                    className={`mt-0.5 text-[11px] font-black uppercase px-1.5 py-0.5 rounded-md ${weightDelta > 0 ? "bg-emerald-500/20 text-emerald-400" : weightDelta < 0 ? "bg-rose-500/20 text-rose-400" : "bg-slate-700 text-muted-foreground"}`}
                  >
                    {weightDelta > 0 ? "+" : ""}
                    {weightDelta} lbs ({weightDelta > 0 ? "+" : ""}
                    {weightDeltaPct}%)
                  </div>
                )}
              </div>

              <button
                className="w-11 h-11 rounded-xl bg-orange-500 dark:bg-orange-600 text-white font-black text-lg flex items-center justify-center shadow-[0_4px_12px_rgba(240,108,34,0.3)] active:scale-95 transition-transform"
                onClick={() => adjustCurrent(2)}
              >
                +2
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Smart Stepper: Reps / Seconds */}
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex flex-col items-center relative">
              <div className="flex items-center justify-center gap-1.5 bg-white dark:bg-bg-dark border border-slate-200 dark:border-slate-800 rounded-xl p-1 mb-2.5 w-full max-w-45">
                <button
                  onClick={() => switchMode(false)}
                  className={`flex-1 h-6 rounded-lg font-black uppercase text-[11px] tracking-widest transition-all ${!isHold ? "bg-sky-500 text-foreground" : "text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  REPS
                </button>
                <button
                  onClick={() => switchMode(true)}
                  className={`flex-1 h-6 rounded-lg font-black uppercase text-[11px] tracking-widest transition-all ${isHold ? "bg-sky-500 text-foreground" : "text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  TSC
                </button>
              </div>

              {!isTorsoFull ? (
                <div className="flex items-center justify-between w-full h-12 px-1">
                  <button
                    className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 font-black text-lg flex items-center justify-center active:scale-95 transition-transform border border-slate-300 dark:border-slate-700 shrink-0"
                    onClick={() => adjustReps(-1)}
                  >
                    -1
                  </button>

                  <div className="flex flex-col items-center justify-center flex-1 min-w-0">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={reps || ""}
                      onChange={(e) =>
                        setReps(
                          e.target.value === ""
                            ? ""
                            : parseFloat(e.target.value) || 0,
                        )
                      }
                      placeholder={prevRepsLeftPlaceholder}
                      className="font-black text-4xl text-foreground tracking-tight leading-none bg-transparent border-none text-center w-full p-0 m-0 no-arrows focus:ring-0 placeholder:text-slate-600/50"
                    />
                  </div>

                  <button
                    className="w-10 h-10 rounded-xl bg-sky-500 text-foreground font-black text-lg flex items-center justify-center shadow-[0_4px_12px_rgba(56,189,248,0.3)] active:scale-95 transition-transform shrink-0"
                    onClick={() => adjustReps(1)}
                  >
                    +1
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-4 w-full px-1">
                  <div className="flex flex-col items-center flex-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] font-black uppercase tracking-widest text-orange-500 mb-1">
                      Left ({isHold ? "SEC" : "REPS"})
                    </span>
                    <div className="flex items-center justify-between w-full h-10">
                      <button
                        onClick={() => adjustReps(-1)}
                        className="w-8 h-8 rounded-lg bg-slate-700/50 text-muted-foreground font-black text-sm flex items-center justify-center active:scale-95 border border-slate-300/30 shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={reps || ""}
                        onChange={(e) =>
                          setReps(
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value) || 0,
                          )
                        }
                        placeholder={prevRepsLeftPlaceholder}
                        className="font-black text-2xl text-foreground tracking-tight leading-none bg-transparent border-none text-center w-full p-0 m-0 no-arrows focus:ring-0 min-w-0 placeholder:text-slate-600/50"
                      />
                      <button
                        onClick={() => adjustReps(1)}
                        className="w-8 h-8 rounded-lg bg-sky-500 text-foreground font-black text-sm flex items-center justify-center shadow-lg active:scale-95 shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-center flex-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] font-black uppercase tracking-widest text-orange-500 mb-1">
                      Right ({isHold ? "SEC" : "REPS"})
                    </span>
                    <div className="flex items-center justify-between w-full h-10">
                      <button
                        onClick={() => adjustRepsRt(-1)}
                        className="w-8 h-8 rounded-lg bg-slate-700/50 text-muted-foreground font-black text-sm flex items-center justify-center active:scale-95 border border-slate-300/30 shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={repsRt || ""}
                        onChange={(e) =>
                          setRepsRt(
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value) || 0,
                          )
                        }
                        placeholder={prevRepsRightPlaceholder}
                        className="font-black text-2xl text-foreground tracking-tight leading-none bg-transparent border-none text-center w-full p-0 m-0 no-arrows focus:ring-0 min-w-0 placeholder:text-slate-600/50"
                      />
                      <button
                        onClick={() => adjustRepsRt(1)}
                        className="w-8 h-8 rounded-lg bg-sky-500 text-foreground font-black text-sm flex items-center justify-center shadow-lg active:scale-95 shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quality Rating */}
            <div
              className={`bg-slate-50 dark:bg-slate-950 border rounded-2xl p-3 flex flex-col items-center relative transition-colors ${!quality || quality === 0 ? "border-amber-500/50 dark:border-amber-500/40" : "border-slate-200 dark:border-slate-800"}`}
            >
              <Label className="text-[11px] font-black uppercase tracking-widest text-center block mb-2.5 items-center gap-1 text-muted-foreground">
                Set Quality / RPE{" "}
                {!quality && (
                  <span className="text-amber-500 font-bold text-xs">
                    * Required
                  </span>
                )}
              </Label>
              <div className="flex items-center gap-1.5 w-full h-9">
                <button
                  onClick={() => setQuality(1)}
                  className={`flex-1 h-full rounded-xl font-black uppercase text-[11px] tracking-widest transition-all ${quality === 1 ? "bg-rose-500 text-foreground shadow-[0_4px_10px_rgba(244,63,94,0.3)]" : "bg-white border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  Poor
                </button>
                <button
                  onClick={() => setQuality(2)}
                  className={`flex-1 h-full rounded-xl font-black uppercase text-[11px] tracking-widest transition-all ${quality === 2 ? "bg-amber-500 text-foreground shadow-[0_4px_10px_rgba(245,158,11,0.3)]" : "bg-white border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  Completed
                </button>
                <button
                  onClick={() => setQuality(3)}
                  className={`flex-1 h-full rounded-xl font-black uppercase text-[11px] tracking-widest transition-all ${quality === 3 ? "bg-emerald-500 text-foreground shadow-[0_4px_10px_rgba(16,185,129,0.3)]" : "bg-white border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  Max Strength
                </button>
              </div>
            </div>
          </div>

          {/* Trend History */}
          {pastMachineLogs.length > 0 && (
            <div className="bg-slate-50/30 border border-slate-200 dark:border-slate-800/50 rounded-xl p-2.5 flex flex-col gap-1.5">
              <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                  Trend History
                </span>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                  Last 3 Sets
                </span>
              </div>
              {pastMachineLogs.map((entry, idx) => {
                const isHoldLog = entry.log.isStaticHold;
                let metrics = "";
                if (
                  entry.log.repsLeft !== undefined &&
                  entry.log.repsRight !== undefined
                ) {
                  metrics = `${entry.log.repsLeft}L|${entry.log.repsRight}R`;
                } else {
                  metrics = isHoldLog
                    ? `${entry.log.seconds}s`
                    : `${entry.log.reps}R`;
                }

                const olderEntry = pastMachineLogs[idx + 1];
                let arrow = null;
                if (olderEntry && olderEntry.log.weight) {
                  const currW = parseFloat(entry.log.weight || "0");
                  const oldW = parseFloat(olderEntry.log.weight || "0");
                  if (currW > oldW) {
                    arrow = (
                      <span className="text-emerald-500 font-bold ml-1 text-[11px]">
                        ↑
                      </span>
                    );
                  } else if (currW < oldW) {
                    arrow = (
                      <span className="text-rose-500 font-bold ml-1 text-[11px]">
                        ↓
                      </span>
                    );
                  }
                }

                return (
                  <div
                    key={idx}
                    className="flex justify-between items-center text-[11px] bg-slate-50 dark:bg-slate-950 rounded-lg px-2 py-1.5 border border-slate-200 dark:border-slate-800/30"
                  >
                    <span className="text-muted-foreground font-bold uppercase text-[11px]">
                      {new Date(
                        parseSessionDate(entry.session.date),
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="font-black text-slate-700 dark:text-slate-300 flex items-center tabular-nums">
                      {entry.log.weight}
                      <span className="text-[11px] text-muted-foreground ml-0.5">
                        lbs
                      </span>
                      <span className="mx-1.5 text-slate-700 dark:text-slate-300">
                        |
                      </span>
                      {metrics}
                      {arrow}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fixed Footer */}
        <div className="p-4 bg-white dark:bg-bg-dark border-t border-slate-200 dark:border-slate-800 shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-3 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
          <Button
            variant="outline"
            className="h-12 rounded-xl font-black uppercase text-[11px] tracking-widest border border-slate-300 dark:border-slate-700 bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-50 transition-all shadow-md"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="h-12 rounded-xl font-black uppercase text-[11px] tracking-widest bg-orange-500 dark:bg-orange-600 text-white hover:bg-orange-600 dark:hover:bg-orange-700 shadow-[0_4px_15px_rgba(240,108,34,0.4)] border-none active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return;
              onSave(
                current.toString(),
                reps.toString(),
                quality,
                isHold,
                side,
                repsRt.toString(),
              );
            }}
          >
            {saveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
