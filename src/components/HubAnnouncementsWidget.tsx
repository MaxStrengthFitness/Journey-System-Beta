import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../firebase";
import { HubAnnouncement, Trainer } from "../types";
import { Bell, Megaphone, CheckCircle, User, Calendar } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface HubAnnouncementsWidgetProps {
  authTrainer: Trainer | null;
}

export const HubAnnouncementsWidget: React.FC<HubAnnouncementsWidgetProps> = ({
  authTrainer,
}) => {
  const [announcements, setAnnouncements] = useState<HubAnnouncement[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!authTrainer) return;

    // Stream active announcements in real-time
    const q = query(collection(db, "hub_announcements"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as HubAnnouncement[];

        // Handle active-only, expiry, and scope targeting
        const activeList = list
          .filter((a) => a.isActive !== false)
          .filter((a) => {
            if (a.expiresAt) {
              const expTime = a.expiresAt.toDate
                ? a.expiresAt.toDate().getTime()
                : typeof a.expiresAt === "number"
                  ? a.expiresAt
                  : 0;
              if (expTime > 0 && expTime < Date.now()) return false;
            }
            return true;
          })
          .filter(
            (a) =>
              a.targetScope === "universal" ||
              a.studioId === "all" ||
              a.studioId === authTrainer.primaryHomeStudioId ||
              (authTrainer.accessibleStudioIds &&
                authTrainer.accessibleStudioIds.includes(a.studioId)) ||
              (a.targetScope === "studio" &&
                (a.targetId === authTrainer.primaryHomeStudioId ||
                  (authTrainer.accessibleStudioIds &&
                    authTrainer.accessibleStudioIds.includes(a.targetId!)))) ||
              (a.targetScope === "network" &&
                (authTrainer.role === "Owner" ||
                  authTrainer.role === "FranchiseOwner" ||
                  authTrainer.role === "StudioOwner")),
          )
          .sort((a, b) => {
            const timeA =
              a.createdAt?.toMillis?.() ||
              (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
            const timeB =
              b.createdAt?.toMillis?.() ||
              (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
            return timeB - timeA;
          });

        setAnnouncements(activeList);
      },
      (error) => {
        console.error("Error streaming hub announcements in widget:", error);
      },
    );

    return () => unsubscribe();
  }, [authTrainer]);

  if (!authTrainer) return null;

  // Find unread announcements for this trainer
  const unreadAnnouncements = announcements.filter(
    (a) => !a.readBy || !a.readBy.includes(authTrainer.id || ""),
  );
  const hasUnread = unreadAnnouncements.length > 0;

  // Mark all unread announcements as read upon opening
  const handleMarkAsRead = async () => {
    if (unreadAnnouncements.length === 0) return;

    // Background Firestore updates using arrayUnion
    const trainerId = authTrainer.id;
    if (!trainerId) return;

    unreadAnnouncements.forEach(async (ann) => {
      if (!ann.id) return;
      try {
        await updateDoc(doc(db, "hub_announcements", ann.id), {
          readBy: arrayUnion(trainerId),
        });
      } catch (err) {
        console.error("Failed to mark announcement as read:", ann.id, err);
      }
    });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          handleMarkAsRead();
        }
      }}
    >
      <DialogTrigger
        id="hub-announcements-bell-btn"
        className={cn(
          "relative h-8 w-8 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950 shadow-sm cursor-pointer shrink-0",
          hasUnread &&
            "ring-2 ring-blue-500/20 shadow-md border-blue-200 dark:border-blue-800",
        )}
      >
        <Bell
          className={cn(
            "w-4 h-4 sm:w-5 sm:h-5 transition-transform",
            hasUnread
              ? "text-blue-500 animate-swing"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700",
          )}
        />
        {hasUnread && (
          <span className="absolute top-1 right-1 sm:top-2 sm:right-2 flex h-2 w-2 sm:h-3 sm:w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 sm:h-3 sm:w-3 bg-blue-500"></span>
          </span>
        )}
      </DialogTrigger>

      <DialogContent className="w-[92vw] sm:w-full max-w-2xl max-h-[70vh] sm:max-h-[85vh] overflow-y-auto rounded-[20px] sm:rounded-[32px] p-0 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl dark:shadow-none flex flex-col">
        <DialogHeader className="p-3 sm:p-8 pb-2 sm:pb-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-2.5 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-2xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center border border-blue-200 dark:border-blue-900 shrink-0">
              <Megaphone className="w-3.5 h-3.5 sm:w-6 sm:h-6 text-blue-500" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-2xl font-black uppercase italic tracking-tighter text-slate-900 dark:text-white leading-tight">
                Hub Announcements
              </DialogTitle>
              <DialogDescription className="text-[8px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-normal sm:tracking-widest mt-0.5 leading-relaxed">
                Stay updated with the latest alerts, strategies, and notes
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-3 sm:p-8 space-y-3 sm:space-y-6 flex-1 overflow-y-auto">
          {announcements.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-6 sm:py-12 space-y-2.5 sm:space-y-4">
              <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800">
                <Bell className="w-4 h-4 sm:w-6 sm:h-6 text-slate-300 dark:text-slate-700" />
              </div>
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                  No active announcements
                </p>
                <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 mt-0.5 sm:mt-1">
                  Check back later for studio updates.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 sm:space-y-4">
              {announcements.map((ann) => {
                const isRead =
                  ann.readBy?.includes(authTrainer.id || "") ?? false;
                const dateString = ann.createdAt?.toDate?.()
                  ? ann.createdAt.toDate().toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Recently";

                return (
                  <div
                    key={ann.id}
                    className={cn(
                      "p-3 sm:p-6 rounded-xl sm:rounded-3xl border transition-all relative overflow-hidden bg-white dark:bg-slate-900",
                      isRead
                        ? "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700"
                        : "border-blue-200 dark:border-blue-900 bg-linear-to-r from-blue-50/20 to-transparent dark:from-blue-950/10 shadow-sm",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 sm:gap-4">
                      <div className="space-y-1.5 sm:space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                          <h3 className="font-black text-slate-900 dark:text-white italic tracking-tight text-xs sm:text-lg">
                            {ann.title}
                          </h3>
                          {ann.priority === "high" && (
                            <span className="text-[8px] sm:text-[11px] bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 px-1 sm:px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                              Urgent
                            </span>
                          )}
                          {!isRead && (
                            <span className="text-[8px] sm:text-[11px] bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-1 sm:px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                              New
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {ann.shortContent}
                        </p>

                        {ann.longContent && (
                          <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1.5 sm:mt-3 pt-1.5 sm:pt-3 border-t border-dashed border-slate-100 dark:border-slate-800 leading-relaxed whitespace-pre-wrap">
                            {ann.longContent}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-1 sm:gap-y-2 text-[8px] sm:text-[11px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider pt-1 sm:pt-2">
                          <span className="flex items-center gap-0.5 sm:gap-1">
                            <User className="w-2 h-2 sm:w-3 sm:h-3" /> By {ann.authorName}
                          </span>
                          <span className="flex items-center gap-0.5 sm:gap-1">
                            <Calendar className="w-2 h-2 sm:w-3 sm:h-3" /> {dateString}
                          </span>
                          <span className="bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800 px-1 py-0.5 rounded text-[8px] sm:text-[11px] text-[#F06C22]">
                            {ann.targetScope === "universal" ||
                            ann.studioId === "all"
                              ? "Universal"
                              : ann.targetScope === "network"
                                ? "Network-Wide"
                                : "Studio Exclusive"}
                          </span>
                          {ann.type && (
                            <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 py-0.5 rounded text-[8px] sm:text-[11px] text-slate-600 dark:text-slate-300">
                              {ann.type}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 sm:p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end">
          <Button
            onClick={() => setIsOpen(false)}
            className="rounded-lg sm:rounded-2xl font-bold uppercase tracking-widest text-[9px] sm:text-xs h-8 sm:h-11 px-3 sm:px-6 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-950 w-full sm:w-auto"
          >
            Acknowledge & Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Simple utility function to concat classnames since we cannot export it as named if import/extends clash
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}
