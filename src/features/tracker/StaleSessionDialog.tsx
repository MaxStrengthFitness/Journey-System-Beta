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
 *
 * An OPEN session (no client yet, `clientFirstName` null; the whole-branch
 * review, Oct 9 2026) is asked about the same way: left an hour with nothing
 * typed, it could not be reached from anywhere. Resume carries on with it,
 * Who's this? still there; Start a new session leaves it as it is and starts
 * a new open session.
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
  onFinishAsItWas,
  finishAsItWasReady = true,
}: {
  open: boolean;
  /** The client's name; null for an open session, which has no client yet. */
  clientFirstName: string | null;
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
  /**
   * The third answer (the Atlas answers, Oct 2 2026): finish the old session
   * under its own day, as it stands, so its real sets count, then carry on
   * to today's. Absent: only the two answers.
   */
  onFinishAsItWas?: () => void;
  /**
   * Whether the client's machine totals have answered (the iPad round,
   * features/machine-totals). Finishing an old session compares each
   * machine's day with what is on file, so until they have, the answer
   * waits (a moment): never "nothing on file" off a read still on its way.
   */
  finishAsItWasReady?: boolean;
}) {
  const started = staleSessionStartedLine(session, todayKey);
  const day = sessionDayWords(session, todayKey) ?? "the day it was started";
  const logged = begunMachines
    ? ` ${begunMachines} ${begunMachines === 1 ? "machine was" : "machines were"} logged in it.`
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onStartNew()}>
      <DialogContent className="sm:max-w-120 rounded-[32px] p-0 overflow-hidden border-none">
        <div className="bg-card p-8 text-foreground space-y-3">
          <DialogTitle>
            {clientFirstName ? `${clientFirstName} has an unfinished session` : "Your open session was never finished"}
          </DialogTitle>
          <DialogDescription className="text-foreground font-medium text-base leading-relaxed">
            {started ? `${started} ` : ""}It was never finished.{logged}
          </DialogDescription>
          <p className="text-muted-foreground font-medium text-sm leading-relaxed">
            Resume it to carry on in that session: anything you log goes in
            under {day}.{takesOver ? " Resuming it makes it yours to finish." : ""}
            {clientFirstName ? "" : " Who's this? is still there to choose the client."}
            {onFinishAsItWas ? ` Finish it as it was: it is saved under ${day} with what was logged, and its sets count.` : ""} Or start a new session: the unfinished one is left
            exactly as it is{clientFirstName ? `, and can be discarded from ${clientFirstName}'s profile.` : "."}
          </p>
        </div>
        <div
          className={`p-6 grid grid-cols-1 ${onFinishAsItWas ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-3 bg-card border-t border-slate-100 dark:border-slate-800`}
        >
          <Button
            variant="outline"
            className="h-14 rounded-2xl"
            onClick={onResume}
          >
            Resume it
          </Button>
          {onFinishAsItWas && (
            <Button
              variant="outline"
              className="h-auto min-h-14 whitespace-normal rounded-2xl"
              onClick={onFinishAsItWas}
              disabled={!finishAsItWasReady}
              aria-busy={!finishAsItWasReady || undefined}
            >
              {finishAsItWasReady ? "Finish it as it was" : "Reading the machines…"}
            </Button>
          )}
          <Button
            className="h-14 rounded-2xl bg-cta text-cta-foreground hover:bg-cta shadow-(--go-lift)"
            onClick={onStartNew}
          >
            Start a new session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
