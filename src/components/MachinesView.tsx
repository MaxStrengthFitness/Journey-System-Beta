import React, { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { motion } from "motion/react";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Machine, Client, ExerciseLog } from "../types";
import { calculateExerciseVolume } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMachineImageUrl } from "../AppContent";

export function MachinesView({
  machines,
  clients,
  onOpenInfo,
}: {
  machines: Machine[];
  clients: Client[];
  onOpenInfo: (machine: Machine) => void;
}) {
  const [allLogs, setAllLogs] = useState<ExerciseLog[]>([]);

  useEffect(() => {
    // OPTIMIZATION: Use getDocs instead of onSnapshot for dashboard stats to save quota.
    // Fetch once on mount. Real-time updates aren't critical for global averages.
    const fetchData = async () => {
      try {
        const qLogs = query(
          collection(db, "exerciseLogs"),
          orderBy("createdAt", "desc"),
          limit(500),
        );
        const logsSnap = await getDocs(qLogs);
        setAllLogs(logsSnap.docs.map((doc) => doc.data() as ExerciseLog));
      } catch (err) {
        console.error("Dashboard data fetch failed:", err);
      }
    };
    fetchData();
  }, []);

  const calculateStats = (machineId: string) => {
    const machineLogs = allLogs.filter((log) => log.machineId === machineId);

    if (machineLogs.length === 0) return null;

    const weights = machineLogs
      .map((log) => parseFloat(log.weight || "0"))
      .filter((w) => !isNaN(w) && w > 0);
    const reps = machineLogs
      .map((log) => parseFloat(log.reps || "0"))
      .filter((r) => !isNaN(r) && r > 0);
    const seconds = machineLogs
      .map((log) => parseFloat(log.seconds || "0"))
      .filter((s) => !isNaN(s) && s > 0);

    const totalVolume = machineLogs.reduce((acc, log) => {
      return acc + calculateExerciseVolume(log);
    }, 0);

    return {
      avgWeight: weights.length
        ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length)
        : 0,
      avgReps: reps.length
        ? (reps.reduce((a, b) => a + b, 0) / reps.length).toFixed(1)
        : 0,
      maxWeight: weights.length ? Math.max(...weights) : 0,
      avgSeconds: seconds.length
        ? (seconds.reduce((a, b) => a + b, 0) / seconds.length).toFixed(1)
        : 0,
      totalVolume: Math.round(totalVolume),
      usageCount: machineLogs.length,
    };
  };

  return (
    <motion.div
      key="machines"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-4 w-full max-w-full overflow-x-hidden pb-20"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight uppercase text-secondary">
            Equipment & Analytics Index
          </h2>
          <p className="text-secondary/80 text-[11px] font-medium uppercase tracking-widest">
            Global usage statistics & form guidance.
          </p>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {machines.map((machine) => {
          const stats = calculateStats(machine.id!);
          // Using deterministically selected robust Unsplash images for fitness equipment
          // If the machine is the Leg Press, explicitly provide a robust Leg Press URL (or fallback)
          const fallbackImgUrl = getMachineImageUrl(machine.id);

          return (
            <Card
              key={machine.id}
              className="group rounded-2xl overflow-hidden border border-border/80 hover:border-primary/50 transition-all shadow-sm dark:shadow-none bg-white dark:bg-surface-1 flex flex-col"
            >
              {/* Thumbnail Header Area */}
              <div className="relative h-32 bg-white dark:bg-bg-dark overflow-hidden">
                <img
                  src={machine.imageUrl || fallbackImgUrl}
                  alt={machine.name}
                  className="w-full h-full object-cover brightness-100 transition-all duration-700 ease-out scale-100 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    // Fallback on error so it never shows broken image
                    (e.target as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=400&q=80";
                  }}
                />
                <div className="absolute top-2 left-2 w-6 h-6 rounded-md bg-primary/90 backdrop-blur-sm text-primary-foreground flex items-center justify-center font-bold text-xs shadow-md z-10 border border-white/10">
                  {machine.order}
                </div>
              </div>

              <CardContent className="p-3 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black uppercase tracking-tight text-secondary leading-tight line-clamp-1">
                    {machine.name}
                  </h3>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500">
                    {machine.fullName || machine.id?.replace(/_/g, " ")}
                  </p>
                </div>

                {/* Global Benchmark Compact */}
                <div className="bg-white dark:bg-bg-dark rounded-lg p-2 border border-border/40">
                  <p className="text-[7px] font-bold uppercase tracking-widest text-secondary mb-1.5 opacity-60">
                    Global Benchmark
                  </p>
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-left">
                      <p className="text-[12px] font-bold text-secondary leading-none">
                        {stats?.avgWeight || "--"}{" "}
                        <span className="text-[11px] font-medium opacity-60">
                          lbs
                        </span>
                      </p>
                      <p className="text-[11px] font-medium text-secondary/60 uppercase mt-0.5">
                        Avg Wgt
                      </p>
                    </div>
                    <div className="w-[1px] h-6 bg-border" />
                    <div className="text-center">
                      <p className="text-[12px] font-bold text-secondary leading-none">
                        {stats?.avgReps || "--"}
                      </p>
                      <p className="text-[11px] font-medium text-secondary/60 uppercase mt-0.5">
                        Avg Reps
                      </p>
                    </div>
                    <div className="w-[1px] h-6 bg-border" />
                    <div className="text-right">
                      <p className="text-[12px] font-bold text-primary leading-none">
                        {stats?.maxWeight || "--"}{" "}
                        <span className="text-[11px] font-medium text-primary/60">
                          lbs
                        </span>
                      </p>
                      <p className="text-[11px] font-medium text-primary/60 uppercase mt-0.5">
                        Max
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border/40">
                    <div className="text-left">
                      <p className="text-[11px] font-bold text-secondary leading-none">
                        {stats?.totalVolume !== undefined && stats.totalVolume !== null && !isNaN(stats.totalVolume)
                          ? stats.totalVolume.toLocaleString()
                          : "--"}{" "}
                        <span className="text-[7px] font-medium opacity-60">
                          lbs
                        </span>
                      </p>
                      <p className="text-[7px] font-medium text-secondary/60 uppercase mt-0.5">
                        Vol
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] font-bold text-secondary leading-none">
                        {stats?.avgSeconds ? stats.avgSeconds : "--"}{" "}
                        <span className="text-[7px] font-medium opacity-60">
                          s
                        </span>
                      </p>
                      <p className="text-[7px] font-medium text-secondary/60 uppercase mt-0.5">
                        Avg Time
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-bold text-secondary leading-none">
                        {stats?.usageCount || "--"}
                      </p>
                      <p className="text-[7px] font-medium text-secondary/60 uppercase mt-0.5">
                        Uses
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full h-8 rounded-lg font-bold uppercase tracking-widest gap-1.5 bg-background border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors text-[11px] sm:text-[11px]"
                  onClick={() => onOpenInfo(machine)}
                >
                  <AlertCircle className="w-3 h-3" />
                  Info & Guidelines
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}
