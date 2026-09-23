import { useState } from "react";
import { FlaskConical, Loader2, ArrowRight, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { studioTodayKey, DEFAULT_TIME_ZONE } from "../../lib/studio-time";
import type { SeedResult } from "./seed-write";
import { DEMO_STUDIO_NAME } from "./constants";

/**
 * SETTING DEMO MODE UP, AND RESETTING IT — from the studio selection screen.
 *
 * This lives here and not on Operations → Data for a reason that is not
 * aesthetic: **Demo Mode cannot be set up from inside Demo Mode.** Until the
 * seeder has run, the studio document does not exist, so there is nothing to
 * enter and no Operations to open. The only screen that can offer the button
 * is the one you are on before you have chosen a studio at all.
 *
 * Reset is the same operation as set-up, which is why one component does
 * both. Every id the seeder writes is derived, so a second run rewrites the
 * same documents rather than making a second demo — no wipe, and a run that
 * died half way is fixed by pressing the button again. What that buys, and
 * why there is deliberately no delete, is in seed-write.ts.
 */
/** "Nov 15" — a `YYYY-MM-DD` studio day, read the way a person says it. */
function friendlyDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  /* UTC, because the key is a label for a day rather than an instant: built
     locally it would name the day before for anyone west of Greenwich. */
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function SetUpDemoCard({
  seededBy,
  /** Already there — this is the reset, not the set-up. */
  existing = false,
  onDone,
}: {
  seededBy: { id: string; name: string };
  existing?: boolean;
  onDone?: () => void;
}) {
  const [state, setState] = useState<"idle" | "confirm" | "working" | "done" | "error">(
    "idle",
  );
  const [progress, setProgress] = useState({ written: 0, total: 0 });
  const [result, setResult] = useState<SeedResult | null>(null);
  const [message, setMessage] = useState("");

  const run = async () => {
    setState("working");
    setProgress({ written: 0, total: 0 });
    try {
      /*
       * Loaded on the click, not on the page.
       *
       * This card sits on the studio selection screen, which every trainer
       * passes through to get to work. Importing the seeder at module scope
       * pulled its whole dependency chain onto that screen --
       * seed-write -> seed-core -> data/machine-definitions, and that last
       * file alone is 115 kB of generated machine catalog. Nobody signing in
       * to coach a client needs a byte of it.
       *
       * The handler was already async, so nothing else had to change.
       */
      const { seedDemoStudio } = await import("./seed-write");
      const outcome = await seedDemoStudio(
        seededBy,
        studioTodayKey(new Date(), DEFAULT_TIME_ZONE),
        setProgress,
      );
      setResult(outcome);
      setState("done");
      onDone?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
      setState("error");
    }
  };

  const percent =
    progress.total > 0 ? Math.round((progress.written / progress.total) * 100) : 0;

  return (
    <div className="bg-bg-dark-2 border border-dashed border-ink-d3/50 rounded-[28px] p-6 shadow-xl flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-ink-d3/50 to-transparent" />

      <span className="w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 bg-bg-dark-3 border-div-d text-ink-d3 mb-4">
        <FlaskConical className="w-4 h-4" />
      </span>

      <h4 className="font-extrabold uppercase italic tracking-tight text-lg text-ink-d1 mb-1 leading-tight break-words">
        {DEMO_STUDIO_NAME}
      </h4>

      {state === "working" ? (
        <>
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-d3 mb-3">
            Building the studio — {progress.written} of {progress.total || "…"}
          </p>
          <div className="h-1.5 w-full rounded-full bg-bg-dark-3 overflow-hidden mb-5 mt-auto">
            <div
              className="h-full bg-ink-d3 transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      ) : state === "done" && result ? (
        <>
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-d3 leading-relaxed mb-5 mt-auto">
            {result.summary.clients} clients, {result.summary.trainers} trainers and{" "}
            {result.summary.sessions} sessions are in.
          </p>
          {/* The one thing about the demo studio that expires. Everything
              else is history and stays true; the Hub reads FORWARD, so the
              seeded bookings run out and the grid quietly empties. Saying
              when turns that into a date rather than a surprise. */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-d3 leading-relaxed mb-5">
            {result.summary.bookings} bookings on the Hub, through{" "}
            {friendlyDay(result.summary.scheduleThrough)}. Set it up again to
            move the schedule forward.
          </p>
          {result.missingCatalog.length > 0 && (
            /* Not an error, and not silent either: resolveMachine() returns
               null for a roster entry whose catalog machine is missing, and
               the floor then comes up short with nothing saying why. */
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-d2 leading-relaxed mb-5 flex gap-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
              <span>
                {result.missingCatalog.length} machines are not in the catalog, so
                they will not appear on the floor.
              </span>
            </p>
          )}
        </>
      ) : state === "error" ? (
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-d2 leading-relaxed mb-5 mt-auto">
          {message}
        </p>
      ) : state === "confirm" ? (
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-d3 leading-relaxed mb-5 mt-auto">
          This rewrites the demo studio back to how it started. Nothing outside
          Demo Mode is touched.
        </p>
      ) : (
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-d3 leading-relaxed mb-5 mt-auto">
          {existing
            ? "Put the six demo clients back the way they started."
            : "Six clients, three trainers, a year of sessions and eight weeks of bookings — none of them real. Takes a moment."}
        </p>
      )}

      <div className="border-t border-div-d pt-4">
        {state === "working" ? (
          <Button
            disabled
            className="w-full bg-bg-dark-3 text-ink-d3 font-black uppercase tracking-widest text-xs h-11 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
          >
            <Loader2 className="w-4 h-4 animate-spin" /> Working
          </Button>
        ) : state === "done" ? (
          <p className="text-[10px] font-black uppercase tracking-widest text-ink-d3 text-center">
            Ready — it is in the list above
          </p>
        ) : (
          <Button
            onClick={() => (existing && state === "idle" ? setState("confirm") : run())}
            className={cn(
              "w-full font-black uppercase tracking-widest text-xs h-11 rounded-xl flex items-center justify-center gap-2 cursor-pointer",
              state === "confirm"
                ? "bg-cta-strong hover:bg-[#a02400] text-white"
                : "bg-bg-dark-3 hover:bg-muted text-ink-d1 border border-div-d",
            )}
          >
            {state === "error" ? (
              <>Try again</>
            ) : state === "confirm" ? (
              <>
                <RotateCcw className="w-3.5 h-3.5" /> Yes, reset it
              </>
            ) : existing ? (
              <>
                <RotateCcw className="w-3.5 h-3.5" /> Reset demo data
              </>
            ) : (
              <>
                Set up Demo Mode <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
