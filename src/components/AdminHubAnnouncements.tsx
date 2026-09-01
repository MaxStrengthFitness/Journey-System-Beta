import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Megaphone, Plus, Loader2 } from "lucide-react";
import { Studio, Trainer, HubAnnouncement } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { cn, getAnnouncementStyle } from "@/lib/utils";
import { useToast } from "../contexts/ToastContext";

interface Props {
  studios: Studio[];
  authTrainer: Trainer;
}

export function AdminHubAnnouncements({ studios, authTrainer }: Props) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [announcements, setAnnouncements] = useState<HubAnnouncement[]>([]);
  const [isCreatingAnnouncement, setIsCreatingAnnouncement] = useState(false);
  const [lifespan, setLifespan] = useState("24h");
  const [newAnnouncement, setNewAnnouncement] = useState<
    Partial<HubAnnouncement>
  >({
    title: "",
    shortContent: "",
    longContent: "",
    studioId: "all",
    type: "news",
    priority: "low",
    targetScope: "universal",
  });

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const q = query(collection(db, "hub_announcements"));
        const snap = await getDocs(q);
        const data = snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as HubAnnouncement,
        );

        const filtered = data
          .filter((a) => a.isActive !== false)
          .sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeB - timeA;
          });

        setAnnouncements(filtered);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "hub_announcements");
      }
    };

    fetchAnnouncements();
  }, []);

  const handleCreateAnnouncement = async () => {
    if (!authTrainer || !newAnnouncement.title || !newAnnouncement.shortContent)
      return;
    setIsCreatingAnnouncement(true);
    try {
      const now = new Date();
      let expiresAt = new Date(now);
      if (lifespan === "24h") expiresAt.setHours(expiresAt.getHours() + 24);
      else if (lifespan === "1w") expiresAt.setDate(expiresAt.getDate() + 7);
      else expiresAt.setMonth(expiresAt.getMonth() + 1);

      const docRef = await addDoc(collection(db, "hub_announcements"), {
        ...newAnnouncement,
        authorId: authTrainer.id,
        authorName: authTrainer.fullName,
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
        isActive: true,
        readBy: [],
      });

      const createdObj: HubAnnouncement = {
        ...(newAnnouncement as HubAnnouncement),
        id: docRef.id,
        authorId: authTrainer.id!,
        authorName: authTrainer.fullName,
        createdAt: { toMillis: () => Date.now(), toDate: () => new Date() },
        expiresAt: expiresAt,
        isActive: true,
        readBy: [],
      };

      setAnnouncements((prev) => [createdObj, ...prev]);

      setNewAnnouncement({
        title: "",
        shortContent: "",
        longContent: "",
        studioId: "all",
        type: "news",
        priority: "low",
        targetScope: "universal",
      });

      toastSuccess("Announcement published successfully.");
    } catch (e: any) {
      toastError("Error publishing message: " + e.message);
    } finally {
      setIsCreatingAnnouncement(false);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await updateDoc(doc(db, "hub_announcements", id), { isActive: false });
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      toastError("Failed to archive: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="rounded-[32px] border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <CardHeader className="bg-slate-50 dark:bg-slate-950 pb-6 rounded-t-[32px] border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-950/20 flex items-center justify-center border border-sky-200 dark:border-sky-800/40">
                <Megaphone className="w-6 h-6 text-sky-500" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">
                  Create Announcement
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400 font-medium uppercase text-[11px] tracking-widest">
                  Broadcast global updates to all studios.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">
                  Headline
                </Label>
                <Input
                  value={newAnnouncement.title || ""}
                  onChange={(e) =>
                    setNewAnnouncement((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="e.g., Q3 Global System Rollout"
                  className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">
                  Main Message
                </Label>
                <Textarea
                  value={newAnnouncement.longContent || ""}
                  onChange={(e) =>
                    setNewAnnouncement((p) => ({
                      ...p,
                      longContent: e.target.value,
                    }))
                  }
                  placeholder="The full announcement details..."
                  className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs min-h-20"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">
                  Short Update (Ticker Feed)
                </Label>
                <Input
                  value={newAnnouncement.shortContent || ""}
                  onChange={(e) =>
                    setNewAnnouncement((p) => ({
                      ...p,
                      shortContent: e.target.value,
                    }))
                  }
                  placeholder="Appears on dashboard marquees."
                  className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs"
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">
                  Target Scope
                </Label>
                <Select
                  value={newAnnouncement.targetScope}
                  onValueChange={(v: "universal" | "network" | "studio") =>
                    setNewAnnouncement((p) => ({
                      ...p,
                      targetScope: v,
                      studioId: v === "universal" ? "all" : studios[0]?.id,
                    }))
                  }
                >
                  <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950 font-bold uppercase text-[11px] tracking-widest border-slate-200 dark:border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="universal">
                      Universal (All Hubs & Trainers)
                    </SelectItem>
                    <SelectItem value="studio">Specific Studio</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newAnnouncement.targetScope === "studio" && (
                <div className="space-y-2">
                  <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">
                    Select Studio
                  </Label>
                  <Select
                    value={newAnnouncement.studioId}
                    onValueChange={(v) =>
                      setNewAnnouncement((p) => ({ ...p, studioId: v }))
                    }
                  >
                    <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950 font-bold uppercase text-[11px] tracking-widest border-slate-200 dark:border-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {studios.map((s) => (
                        <SelectItem key={s.id} value={s.id!}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-30 space-y-2">
                  <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">
                    Type
                  </Label>
                  <Select
                    value={newAnnouncement.type || "news"}
                    onValueChange={(v: any) =>
                      setNewAnnouncement((p) => ({ ...p, type: v }))
                    }
                  >
                    <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950 font-bold uppercase text-[11px] tracking-widest border-slate-200 dark:border-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="news">News</SelectItem>
                      <SelectItem value="shout-out">Shout Outs</SelectItem>
                      <SelectItem value="event">Events</SelectItem>
                      <SelectItem value="tip">Tips</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-30 space-y-2">
                  <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">
                    Urgency
                  </Label>
                  <Select
                    value={newAnnouncement.priority || "low"}
                    onValueChange={(v: any) =>
                      setNewAnnouncement((p) => ({ ...p, priority: v }))
                    }
                  >
                    <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950 font-bold uppercase text-[11px] tracking-widest border-slate-200 dark:border-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Standard</SelectItem>
                      <SelectItem value="high">High & Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-30 space-y-2">
                  <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">
                    Lifespan
                  </Label>
                  <Select value={lifespan} onValueChange={setLifespan}>
                    <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950 font-bold uppercase text-[11px] tracking-widest border-slate-200 dark:border-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">24 Hours</SelectItem>
                      <SelectItem value="1w">1 Week</SelectItem>
                      <SelectItem value="1m">1 Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleCreateAnnouncement}
                disabled={
                  isCreatingAnnouncement ||
                  !newAnnouncement.title ||
                  !newAnnouncement.shortContent
                }
                className="w-full bg-sky-500 hover:bg-sky-600 text-white font-black uppercase text-[11px] tracking-widest h-10 rounded-xl gap-2 mt-4"
              >
                {isCreatingAnnouncement ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Publish Global Message
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* List of active announcements */}
        <div className="space-y-4">
          <Label className="text-[11px] uppercase font-bold tracking-widest text-slate-500 ml-1">
            Active Global Messages
          </Label>
          <div className="space-y-3">
            {announcements.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs italic bg-slate-50 dark:bg-slate-900 rounded-[24px] border border-slate-200 dark:border-slate-800 border-dashed">
                No active messages
              </div>
            ) : (
              announcements.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "p-4 rounded-2xl border flex flex-col gap-2 relative group",
                    getAnnouncementStyle(a.type, a.priority),
                  )}
                >
                  <div className="flex gap-2 items-start justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-black text-sm uppercase italic tracking-tight">
                          {a.title}
                        </span>
                        {a.priority === "high" && (
                          <Badge className="bg-rose-500 hover:bg-rose-600 text-white border-0 text-[11px] font-black uppercase px-1.5 h-4">
                            Urgent
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="bg-white/50 dark:bg-black/20 text-[11px] font-black uppercase tracking-widest px-1.5 border-current opacity-70"
                        >
                          {a.type || "news"}
                        </Badge>
                      </div>
                      <p className="text-xs font-bold leading-tight opacity-90">
                        {a.shortContent}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => handleArchive(a.id!)}
                      className="absolute right-2 top-2 h-7 px-2 text-[11px] font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      Archive
                    </Button>
                  </div>
                  {a.longContent && (
                    <p className="text-xs italic mt-1 opacity-80 line-clamp-3">
                      {a.longContent}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-current border-opacity-10">
                    <span className="text-[11px] uppercase font-bold tracking-widest opacity-60">
                      To:{" "}
                      {a.targetScope === "universal"
                        ? "Global Network"
                        : studios.find((s) => s.id === a.studioId)?.name ||
                          "Studio"}
                    </span>
                    <span className="text-[11px] uppercase font-bold tracking-widest opacity-60 ml-auto">
                      By: {a.authorName}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
