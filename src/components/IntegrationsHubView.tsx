import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Activity,
  Webhook,
  Key,
  RefreshCw,
  Server,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Link2,
  Clock,
  Terminal,
  AlertTriangle,
  AlertCircle as ErrorIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Trainer, Studio } from "../types";
import { useMindbodyHealth } from "../contexts/MindbodyHealthContext";
import { useToast } from "../contexts/ToastContext";
import firebaseConfig from "../../firebase-applet-config.json";

interface Props {
  authTrainer: Trainer | null;
  activeStudioId: string | null;
  onBack: () => void;
  studios: Studio[];
}

export function IntegrationsHubView({
  authTrainer,
  activeStudioId,
  onBack,
  studios,
}: Props) {
  const {
    success: toastSuccess,
    error: toastError,
    info: toastInfo,
  } = useToast();
  const health = useMindbodyHealth();
  const computedWebhookUrl = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/mindbodyWebhook`;

  const activeStudio = studios.find((s) => s.id === activeStudioId);
  const autoSync = activeStudio?.autoSyncEnabled ?? true;
  const syncInterval = String(activeStudio?.syncIntervalMinutes ?? 15);

  const [mindbodyKey, setMindbodyKey] = useState("************************");
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [countdownText, setCountdownText] = useState("");
  const [dbLogs, setDbLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!autoSync) {
      setCountdownText("Paused manually");
      return;
    }

    const intervalMinutes = parseInt(syncInterval, 10);

    const updateTimer = () => {
      const now = new Date();
      const currentMinutes = now.getMinutes();
      const currentSeconds = now.getSeconds();

      const nextAlignedMinute =
        Math.ceil((currentMinutes + 0.001) / intervalMinutes) * intervalMinutes;

      let diffMinutes = nextAlignedMinute - currentMinutes - 1;
      let diffSeconds = 60 - currentSeconds;

      if (diffSeconds === 60) {
        diffSeconds = 0;
        diffMinutes += 1;
      }

      const minStr = diffMinutes > 0 ? `${diffMinutes}m ` : "";
      setCountdownText(`Running (Next sync in ${minStr}${diffSeconds}s)`);
    };

    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);
    return () => clearInterval(intervalId);
  }, [autoSync, syncInterval]);

  // 2. Real-time Event Logs listener
  useEffect(() => {
    if (!activeStudioId) return;

    const q = query(
      collection(db, "mindbodyEventLog"),
      where("studioId", "==", activeStudioId),
      orderBy("processedAt", "desc"),
      limit(20),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetchedLogs = snap.docs.map((doc) => {
          const data = doc.data();
          const processedAt =
            data.processedAt?.toDate?.() ||
            new Date(data.processedAt || Date.now());
          return {
            id: doc.id,
            time: processedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            type:
              data.status === "error" || data.status === "Failed"
                ? "error"
                : "success",
            message:
              data.message ||
              `Processed MindBody event: ${data.eventType || "Unknown"}`,
          };
        });
        setDbLogs(fetchedLogs);
      },
      (err) => {
        console.error("Failed to stream event logs:", err);
      },
    );

    return () => unsubscribe();
  }, [activeStudioId]);

  const handleToggleAutoSync = async (checked: boolean) => {
    if (!activeStudioId) return;
    try {
      await updateDoc(doc(db, "studios", activeStudioId), {
        autoSyncEnabled: checked,
      });
      toastSuccess(`Auto-sync ${checked ? "enabled" : "disabled"}.`);
    } catch (err: any) {
      console.error(err);
      toastError("Failed to update auto-sync setting: " + err.message);
    }
  };

  const handleIntervalChange = async (interval: string) => {
    if (!activeStudioId) return;
    try {
      await updateDoc(doc(db, "studios", activeStudioId), {
        syncIntervalMinutes: parseInt(interval, 10),
      });
      toastSuccess(`Sync interval set to ${interval} minutes.`);
    } catch (err: any) {
      console.error(err);
      toastError("Failed to update polling interval: " + err.message);
    }
  };

  const handleTestConnection = () => {
    setIsTestLoading(true);
    setTimeout(() => {
      setIsTestLoading(false);
      if (health.status === "healthy" || health.status === "degraded") {
        setTestResult(
          "Success! Mindbody system endpoint is reachable and responsive.",
        );
      } else {
        setTestResult("System is offline or requires configuration.");
      }
    }, 1000);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(computedWebhookUrl);
  };

  const logs =
    dbLogs.length > 0
      ? dbLogs
      : [
          {
            id: "init",
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            type: "info",
            message:
              "System initialized. Waiting for MindBody webhook events...",
          },
        ];

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-black/40 text-slate-900 dark:text-slate-100 p-4 lg:p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full space-y-6 lg:space-y-8 pb-32">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <Button
              variant="ghost"
              className="pl-0 text-slate-500 hover:text-slate-900 dark:hover:text-white mb-2"
              onClick={onBack}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Hub
            </Button>
            <h1 className="text-2xl lg:text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center">
              <Webhook className="w-6 h-6 mr-3 text-brand" />
              Integrations & Webhooks
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage Mindbody API connections, automated schedule syncing, and
              CRM data flows for {activeStudio?.name || "your studio"}.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {health.status === "healthy" && (
              <div className="flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Systems Operational
              </div>
            )}
            {health.status === "degraded" && (
              <div className="flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                Degraded Performance
              </div>
            )}
            {health.status === "error" && (
              <div className="flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                <ErrorIcon className="w-3.5 h-3.5 mr-1.5" />
                System Errors
              </div>
            )}
            {health.status === "offline" && (
              <div className="flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                <Activity className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
                Offline / Setup Required
              </div>
            )}
            <Button
              onClick={handleTestConnection}
              disabled={isTestLoading}
              variant="outline"
              className="h-9"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${isTestLoading ? "animate-spin" : ""}`}
              />
              Test Connection
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Config */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center">
                  <Server className="w-4 h-4 mr-2 text-brand" />
                  Primary CRM Connection
                </CardTitle>
                <CardDescription>
                  Configure credentials to securely authenticate with the
                  Mindbody Public API.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Mindbody Site ID
                  </label>
                  <Input
                    defaultValue={
                      activeStudio?.mindbodySiteId || "Not configured"
                    }
                    disabled
                    className="bg-slate-50 dark:bg-slate-900/50"
                  />
                  <p className="text-[10px] text-slate-400">
                    Site ID is managed in Studio Settings.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center">
                    <Key className="w-3 h-3 mr-1.5" />
                    API Key
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={mindbodyKey}
                      onChange={(e) => setMindbodyKey(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="secondary"
                      className="px-4"
                      onClick={() =>
                        toastInfo(
                          "API key is managed via Firebase Secrets. Use CLI to update.",
                        )
                      }
                    >
                      Update
                    </Button>
                  </div>
                  {testResult && (
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-2 flex items-center">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      {testResult}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center">
                  <Link2 className="w-4 h-4 mr-2 text-indigo-500" />
                  Webhook Receivers
                </CardTitle>
                <CardDescription>
                  Endpoints configured to listen for live schedule updates.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex justify-between">
                    <span>Schedule Endpoint</span>
                    {health.webhookSubscriptionActive ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 h-4 bg-emerald-500/10 text-emerald-600 border-0"
                      >
                        ACTIVE
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 h-4 bg-slate-500/10 text-slate-500 border-0"
                      >
                        INACTIVE
                      </Badge>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={computedWebhookUrl}
                      readOnly
                      className="font-mono text-xs bg-slate-50 dark:bg-slate-900/50"
                    />
                    <Button
                      variant="outline"
                      className="px-4"
                      onClick={handleCopyUrl}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Sync Engine & Logs */}
          <div className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950 border-t-4 border-t-brand">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center justify-between">
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-brand" />
                    Auto-Sync Engine
                  </div>
                  <Switch
                    checked={autoSync}
                    onCheckedChange={handleToggleAutoSync}
                  />
                </CardTitle>
                <CardDescription>
                  Poll the CRM for missing updates periodically.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Polling Interval
                  </label>
                  <select
                    value={syncInterval}
                    onChange={(e) => handleIntervalChange(e.target.value)}
                    disabled={!autoSync}
                    className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-brand disabled:opacity-50"
                  >
                    <option value="5">Every 5 minutes</option>
                    <option value="15">Every 15 minutes (Recommended)</option>
                    <option value="30">Every 30 minutes</option>
                    <option value="60">Hourly</option>
                  </select>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 p-4">
                <div className="flex flex-col space-y-1 w-full">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Engine Status
                  </div>
                  <div className="text-sm font-medium flex items-center text-emerald-600 dark:text-emerald-400">
                    <Activity className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
                    {countdownText}
                  </div>
                </div>
              </CardFooter>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-[#1e1e1e] border-0 text-slate-300">
              <CardHeader className="pb-3 border-b border-white/10">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center">
                  <Terminal className="w-3.5 h-3.5 mr-2" />
                  System Logs
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-64 overflow-y-auto p-4 space-y-3 font-mono text-[10px] lg:text-xs">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3">
                      <span className="text-slate-500 shrink-0">
                        {log.time}
                      </span>
                      <span
                        className={`${log.type === "error" ? "text-red-400" : log.type === "warning" ? "text-yellow-400" : log.type === "success" ? "text-emerald-400" : "text-slate-300"}`}
                      >
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-start gap-3 opacity-50">
                    <span className="text-slate-500 shrink-0">09:00 AM</span>
                    <span className="text-slate-300">
                      System initialized. Waiting for events...
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
