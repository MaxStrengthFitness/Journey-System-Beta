/**
 * "What do I need to know about her" — mid-session, one tap.
 *
 * Fluidity round, Sep 18 2026. Opened from the red marker on the session bar.
 * The same three things the briefing shows before Start, kept for the whole
 * twenty minutes: the conditions with their actual instructions (not just
 * their names), the critical notes, the heads-ups. Nothing to confirm, nothing
 * to acknowledge — close it and coach.
 */
import { X, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import type { Machine } from "../../types";
import { CriticalStrip } from "../../components/journal/CriticalStrip";
import { JournalEntryCard } from "../../components/journal/JournalEntryCard";
import type { SessionFlags } from "./session-flags";

export interface SessionFlagsSheetProps {
  clientFirstName: string;
  flags: SessionFlags;
  machines: Machine[];
  onClose: () => void;
}

export function SessionFlagsSheet({ clientFirstName, flags, machines, onClose }: SessionFlagsSheetProps) {
  const name = clientFirstName || "this client";
  return (
    <div className="fixed inset-0 z-[100] flex justify-end overflow-hidden" role="dialog" aria-label={`Watch-outs for ${name}`}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex flex-col">
            <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter text-foreground">
              <ShieldAlert className="h-5 w-5 text-rose-500" /> Before you touch the machine
            </h2>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {name} · the same things the briefing showed
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="rounded-full hover:bg-white dark:hover:bg-surface-1/10">
            <X className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>

        <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
          {flags.general.length > 0 && (
            <section className="space-y-2" aria-label="Conditions">
              <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">On every machine</span>
              {flags.general.map((w, i) => (
                <div
                  key={`${w.flagId}-${i}`}
                  className={
                    "rounded-xl border p-3 " +
                    (w.tone === "alert" || w.tone === "caution"
                      ? "border-rose-500/30 bg-rose-500/[0.06]"
                      : "border-amber-500/30 bg-amber-500/[0.06]")
                  }
                >
                  <div className="text-[12px] font-black uppercase tracking-wider text-foreground">{w.condition}</div>
                  <p className="mt-1 text-[13px] text-foreground/90">{w.instruction}</p>
                  {w.setup && <p className="mt-1 text-[12px] text-muted-foreground">Set-up: {w.setup}</p>}
                </div>
              ))}
            </section>
          )}

          <CriticalStrip entries={flags.critical} machines={machines} title="Critical" />

          {flags.headsUp.length > 0 && (
            <section className="space-y-2" aria-label="Heads up">
              <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Heads up</span>
              {flags.headsUp.map((e) => (
                <JournalEntryCard key={e.id} entry={e} machines={machines} dense />
              ))}
            </section>
          )}

          {flags.count === 0 && (
            <p className="text-[13px] text-muted-foreground">Nothing flagged for {name}.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
