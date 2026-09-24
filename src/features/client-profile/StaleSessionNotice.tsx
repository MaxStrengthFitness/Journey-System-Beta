/**
 * AN UNFINISHED SESSION, SAID OUT LOUD (Sep 24 2026).
 *
 * The header offers Start when nothing is running, and it still does: a
 * session the heartbeat rule calls abandoned (lib/live-session.ts) never
 * withholds Start. But it used to be invisible here, so Discard — which
 * lives in the "In progress" menu, shown only for a LIVE session — could
 * not reach it, and nothing else ever would. This line says it is there
 * and puts Discard beside it. Discard still asks before deleting anything.
 *
 * Resume is not offered here on purpose: Start takes the trainer to the
 * Active Session, which asks "resume it, or start a new one?" — one place
 * for that question, not two.
 */
import { Clock, Trash2 } from "lucide-react";
import { staleSessionStartedLine, type StaleSessionFacts } from "../../lib/live-session";

export function StaleSessionNotice({
  session,
  todayKey,
  onDiscard,
}: {
  session: StaleSessionFacts;
  todayKey: string;
  onDiscard: () => void;
}) {
  const started = staleSessionStartedLine(session, todayKey);
  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-2"
    >
      <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p className="min-w-0 flex-1 basis-64 text-sm leading-snug text-foreground">
        <span className="font-bold">An unfinished session.</span>{" "}
        {started ? `${started} ` : ""}It was never finished. Start session
        asks whether to resume it or begin a new one.
      </p>
      <button
        type="button"
        onClick={onDiscard}
        className="shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
      >
        <Trash2 className="w-4 h-4" aria-hidden />
        Discard it
      </button>
    </div>
  );
}
