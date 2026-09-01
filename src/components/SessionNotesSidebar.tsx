import React, { useState, useEffect } from "react";
import {
  MessageSquare,
  X,
  History,
  StickyNote,
  Edit3,
} from "lucide-react";
import { motion } from "motion/react";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { handleFirestoreError, OperationType } from "../lib/firestore-errors";
import { safeToDate } from "../lib/utils";
import { WorkoutSession, SessionNote, Trainer } from "../types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function SessionNotesSidebar({
  session,
  onClose,
  userTrainers,
  user,
}: {
  session: WorkoutSession;
  onClose: () => void;
  userTrainers: Trainer[];
  user: any;
}) {
  const [noteContent, setNoteContent] = useState("");
  const [history, setHistory] = useState<SessionNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentUser = user;
  const currentTrainer = userTrainers.find(
    (t) =>
      t.pin === localStorage.getItem("trainer_pin") ||
      t.fullName === currentUser?.displayName,
  );
  const trainerInitials = currentTrainer?.initials || "??";

  useEffect(() => {
    if (!user || !session.id) return;
    const q = query(
      collection(db, "sessionNotes"),
      where("sessionId", "==", session.id),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notes = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as SessionNote,
        );
        setHistory(notes);
        setIsLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "sessionNotes");
      },
    );

    return () => unsubscribe();
  }, [session.id, user]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    try {
      await addDoc(collection(db, "sessionNotes"), {
        sessionId: session.id,
        clientId: session.clientId,
        trainerId: currentTrainer?.id || currentUser?.uid,
        trainerInitials: trainerInitials,
        content: noteContent.trim(),
        createdAt: serverTimestamp(),
        studioId:
          session.hostedAtStudioId ||
          session.clientHomeStudioId ||
          currentTrainer?.primaryHomeStudioId ||
          "",
      });
      setNoteContent("");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "sessionNotes");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-50/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative w-full max-w-sm bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl dark:shadow-none flex flex-col h-full"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-orange-500" /> Session
              Notes
            </h2>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">
              HUD Communication Panel
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full hover:bg-white dark:hover:bg-surface-1/10"
          >
            <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/20">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <History className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Note History
              </span>
            </div>

            {history.length > 0 ? (
              history.map((note) => (
                <div
                  key={note.id}
                  className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-white dark:bg-bg-dark flex items-center justify-center border border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] font-black text-orange-500">
                          {note.trainerInitials}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight">
                        Active Trainer
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      {safeToDate(note.createdAt)?.toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }) || "Now"}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                    {note.content}
                  </p>
                </div>
              ))
            ) : (
              <div className="py-12 text-center bg-slate-50 dark:bg-slate-950 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                <StickyNote className="w-8 h-8 text-slate-800 dark:text-slate-200 mx-auto mb-3" />
                <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                  No active communications found.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0">
          <form onSubmit={handleAddNote} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Edit3 className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Tactical Update
                </span>
              </div>
              <Textarea
                placeholder="Injury notes, performance tweaks, or mood updates..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="min-h-[120px] rounded-2xl bg-slate-50/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-700 focus:border-orange-500 shadow-inner resize-none"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
                  Authenticated:
                </span>
                <span className="text-[11px] font-bold text-orange-500">
                  {trainerInitials}
                </span>
              </div>
              <Button
                type="submit"
                className="flex-1 h-12 bg-orange-500 dark:bg-orange-600 text-white font-black uppercase tracking-[0.2em] text-[11px] rounded-xl shadow-xl shadow-orange-950/20 transition-all active:scale-95"
              >
                Save Tactical Note
              </Button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
