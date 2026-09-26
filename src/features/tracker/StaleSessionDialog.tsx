/**
 * THE QUESTION BEFORE A STALE SESSION IS CARRIED ON WITH (Sep 24 2026).
 *
 * The Active Session used to adopt ANY In-Progress session for the client,
 * so Start the next morning quietly reopened yesterday's abandoned session
 * and that day's sets went into it, under yesterday's date. A session the
 * heartbeat rule calls abandoned (lib/live-session.ts, `splitInProgress`)
 * is now never carried on with unless the trainer says so, and this is
 * where they say so.
 *
 * A confirm, never a block: closing it any way at all is "start a new
 * session", which is what the trainer pressed Start for. Neither answer
 * touches the unfinished session — it is left exactly as it is, and the
 * client's profile still shows it with Discard beside it.
 */
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  sessionDayWords,
  staleSessionStartedLine,
  type StaleSessionFacts,
} from "../../lib/live-session";

export function StaleSessionDialog({
  open,
  clientFirstName,
  session,
  begunMachines,
  todayKey,
  takesOver = false,
  onResume,
  onStartNew,
}: {
  open: boolean;
  clientFirstName: string;
  session: StaleSessionFacts;
  /** Machines with anything logged in it. Null says nothing: "none" and
   *  "not loaded yet" look the same, so none is never claimed. */
  begunMachines: number | null;
  todayKey: string;
  /**
   * Another trainer started it: resuming makes it this trainer's to finish,
   * as a take-over does (session record, Sep 26 2026), and the question says so.
   */
  takesOver?: boolean;
  onResume: () => void;
  onStartNew: () => void;
}) {
  const started = staleSessionStartedLine(session, todayKey);
  const day = sessionDayWords(session, todayKey) ?? "the day it was started";
  const logged = begunMachines
    ? ` ${begunMachines} ${begunMachines === 1 ? "machine was" : "machines were"} logged in it.`
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onStartNew()}>
      <DialogContent className="sm:max-w-120 rounded-[32px] p-0 overflow-hidden border-none shadow-2xl dark:shadow-none">
        <div className="bg-white dark:bg-bg-dark p-8 text-foreground space-y-3">
          <DialogTitle className="text-2xl font-black italic uppercase tracking-tight">
            {clientFirstName} has an unfinished session
          </DialogTitle>
          <DialogDescription className="text-foreground font-medium text-base leading-relaxed">
            {started ? `${started} ` : ""}It was never finished.{logged}
          </DialogDescription>
          <p className="text-muted-foreground font-medium text-sm leading-relaxed">
            Resume it to carry on in that session: anything you log goes in
            under {day}.{takesOver ? " Resuming it makes it yours to finish." : ""} Or start a new session: the unfinished one is left
            exactly as it is, and can be discarded from {clientFirstName}'s
            profile.
          </p>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white dark:bg-bg-dark border-t border-slate-100 dark:border-slate-800">
          <Button
            variant="outline"
            className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-2 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-surface-2"
            onClick={onResume}
          >
            Resume it
          </Button>
          <Button
            className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs bg-cta-strong text-white hover:brightness-110"
            onClick={onStartNew}
          >
            Start a new session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
