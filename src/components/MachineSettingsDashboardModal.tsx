import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, X, TrendingUp } from "lucide-react";
import { ComposedChart, Bar, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Machine, ExerciseLog, WorkoutSession } from "../types";
import { parseSessionDate } from "../lib/utils";

interface Props {
  editingSettings: { machineId: string; settings: Record<string, string> } | null;
  setEditingSettings: (settings: { machineId: string; settings: Record<string, string> } | null) => void;
  machines: Machine[];
  exerciseLogs: ExerciseLog[];
  sessions: WorkoutSession[];
  isSaving: boolean;
  onSave: () => void;
}

export function MachineSettingsDashboardModal({
  editingSettings,
  setEditingSettings,
  machines,
  exerciseLogs,
  sessions,
  isSaving,
  onSave,
}: Props) {
  if (!editingSettings) return null;
  const mId = editingSettings.machineId;
  const targetMachine = machines.find((m) => m.id === mId);

  // Filter logs for this machine
  const machineLogs = exerciseLogs
    .filter((l) => l.machineId === mId && (parseInt(l.weight || "0") > 0))
    .sort((a, b) => {
      const sessionA = sessions.find((s) => s.id === a.sessionId);
      const sessionB = sessions.find((s) => s.id === b.sessionId);
      const dateA = sessionA ? parseSessionDate(sessionA.date) : a.createdAt.toDate().getTime();
      const dateB = sessionB ? parseSessionDate(sessionB.date) : b.createdAt.toDate().getTime();
      return dateA - dateB;
    });

  // Current weight is from the last log
  const currentLog = machineLogs.length > 0 ? machineLogs[machineLogs.length - 1] : null;
  const currentWeight = currentLog ? parseInt(currentLog.weight || "0") || 0 : 0;

  // Calculate PR
  let prLog = null;
  let maxWeight = 0;
  for (const log of machineLogs) {
    const w = parseInt(log.weight || "0") || 0;
    if (w > maxWeight) {
      maxWeight = w;
      prLog = log;
    }
  }

  const prSessionDate = prLog 
    ? sessions.find(s => s.id === prLog.sessionId)?.date || ""
    : "";
  const prDisplayDate = prSessionDate ? new Date(parseSessionDate(prSessionDate)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

  // Calculate Trend Data
  const trendData = [];

  for (const log of machineLogs) {
    const weight = parseInt(log.weight || "0") || 0;
    if (weight > 0) {
      const session = sessions.find(s => s.id === log.sessionId);
      if (session) {
        trendData.push({
          sessionDate: new Date(parseSessionDate(session.date)).toLocaleDateString(
            "en-US",
            { month: "short", day: "2-digit" }
          ),
          weight,
          reps: log.reps, // for the tooltip
          seconds: log.seconds,
          isStatic: log.isStaticHold || log.isTSC || (log.seconds && (!log.reps || parseInt(log.reps) === 0)),
          dateStr: session.date
        });
      }
    }
  }

  // Use all history for the chart
  const chartData = trendData;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded-lg shadow-xl">
          <p className="text-[10px] uppercase tracking-widest text-[#68717A] mb-1">{data.sessionDate}</p>
          <div className="flex items-end gap-2">
            <p className="text-[#F06C22] font-black text-xl leading-none">{data.weight} <span className="text-xs">LBS</span></p>
          </div>
          {data.isStatic ? (
            <p className="text-white font-bold text-sm mt-1">Hold: {data.seconds}s</p>
          ) : (
            <p className="text-white font-bold text-sm mt-1">Reps: {data.reps}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Dialog
      open={!!editingSettings}
      onOpenChange={(open) => !open && setEditingSettings(null)}
    >
      <DialogContent className="max-w-[800px] rounded-3xl border border-slate-700 shadow-[0_0_50px_rgba(0,0,0,0.5)] p-0 overflow-hidden bg-[#0A2E46] backdrop-blur-md">
        {/* Hero Header */}
        <div className="bg-[#0A2E46] border-b border-slate-800 p-6 flex flex-col justify-between relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditingSettings(null)}
            className="absolute top-4 right-4 rounded-full text-[#68717A] hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold uppercase tracking-widest text-[#68717A] mb-2">
              {targetMachine?.name}
            </h2>
            <div className="flex flex-col gap-1">
              <div className="text-5xl sm:text-6xl font-black text-[#F06C22] leading-none tracking-tighter mt-2">
                {currentWeight > 0 ? `${currentWeight} LBS` : "---"}
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#F06C22]/50 ml-3 relative -top-4 sm:-top-5">
                  Current Weight
                </span>
              </div>
              {prLog && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <div className="px-3 py-1.5 bg-[#1e293b] rounded-md border border-slate-700 inline-flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-bold text-sm">PR: {maxWeight} LBS</span>
                    <span className="text-[#68717A] font-medium text-xs">× {prLog.reps} reps</span>
                    {prDisplayDate && <span className="text-[#68717A] text-[10px] uppercase tracking-widest ml-2">({prDisplayDate})</span>}
                  </div>
                  
                  {currentLog?.totalTimeUnderLoad !== undefined && (
                    <div className="px-3 py-1.5 bg-[#1e293b] rounded-md border border-slate-700 flex flex-col justify-center">
                      {(currentLog.isStaticHold || currentLog.isTSC || (currentLog.seconds && (!currentLog.reps || parseInt(currentLog.reps) === 0))) ? (
                        <span className="text-[#F06C22] font-bold text-xs uppercase tracking-widest">
                          Static Time Under Load: {currentLog.totalTimeUnderLoad} sec
                        </span>
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-[#F06C22] font-bold text-xs uppercase tracking-widest">
                            Dynamic Time Under Load: {currentLog.totalTimeUnderLoad} sec
                          </span>
                          {currentLog.averageTimePerRep !== undefined && (
                            <span className="text-[#68717A] font-medium text-[10px] uppercase tracking-widest mt-0.5">
                              Avg Time/Rep: {currentLog.averageTimePerRep} sec
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Trend Visualization (Middle Section) */}
        <div className="p-6 bg-[#0A2E46] border-b border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-[#68717A]">
              Load Progression
            </h3>
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="sessionDate"
                  stroke="#68717A"
                  tick={{ fill: "#68717A", fontSize: 10, fontWeight: 700 }}
                  tickMargin={10}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  stroke="#68717A"
                  tick={{ fill: "#68717A", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  domain={['dataMin - 10', 'dataMax + 10']}
                />
                <RechartsTooltip content={<CustomTooltip />} cursor={{fill: '#1e293b', opacity: 0.4}} />
                <Bar dataKey="weight" fill="#1e293b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#F06C22"
                  strokeWidth={3}
                  dot={{ fill: "#F06C22", strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: "#fff", stroke: "#F06C22" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Machine Settings Editor */}
        <div className="p-6 bg-[#0A2E46]">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#68717A] mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4" /> Machine Configuration
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {targetMachine?.settingOptions?.map((opt) => (
              <div key={opt} className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#68717A] ml-1 flex justify-between items-center pr-1">
                  <span>{opt}</span>
                  {targetMachine?.standardSettings?.[opt] && (
                    <span className="text-slate-500 font-semibold" title="Standard Setting">STD: {targetMachine.standardSettings[opt]}</span>
                  )}
                </label>
                <Input
                  value={editingSettings.settings[opt] || ""}
                  onChange={(e) =>
                     setEditingSettings({
                       ...editingSettings,
                       settings: {
                         ...editingSettings.settings,
                         [opt]: e.target.value,
                       },
                     })
                   }
                  placeholder={targetMachine?.standardSettings?.[opt] || "--"}
                  className="h-12 rounded-xl bg-slate-800 border border-slate-700 focus:border-[#F06C22] focus:ring-[#F06C22] text-lg font-black text-[#f8fafc] px-4 tabular-nums transition-all shadow-sm"
                />
              </div>
            ))}
          </div>

          <Button
            disabled={isSaving}
            onClick={onSave}
            className="w-full h-14 rounded-xl bg-[#F06C22] hover:bg-[#F06C22]/90 text-white font-black uppercase tracking-widest text-sm shadow-lg active:scale-[0.98] transition-all"
          >
            {isSaving ? "Saving..." : "Save Machine Settings"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
